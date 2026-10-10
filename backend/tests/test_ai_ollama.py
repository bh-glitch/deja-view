"""Mocked Ollama provider and provider-switch tests (owner: Vansh). No network."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Literal

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.ai.introduction import IntroductionOutput
from app.config import Settings
from app.contracts import ApiError
from app.main import create_app
from app.providers import gemini, llm, ollama
from app.providers.prompting import TRANSCRIPT_END, TRANSCRIPT_START


class Out(BaseModel):
    intent: Literal["introduction", "other"]
    displayName: str | None


def _settings(tmp_path: Path, provider: str = "ollama") -> Settings:
    return Settings(
        _env_file=None,
        database_path=tmp_path / "fixture.db",
        insightface_root=tmp_path / "w",
        ai_provider=provider,
    )


def _reply(content: str, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json={"message": {"role": "assistant", "content": content}})


def _install(monkeypatch, replies: list) -> list[dict]:
    seen: list[dict] = []
    queue = list(replies)

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        reply = queue.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(ollama, "_transport", httpx.MockTransport(handler))
    return seen


def _run(settings: Settings, transcript: str = "Hi, I'm Demo Alex."):
    return asyncio.run(ollama.generate_structured(settings, "Extract.", transcript, Out))


def test_request_uses_schema_fencing_and_no_thinking(monkeypatch, tmp_path) -> None:
    seen = _install(monkeypatch, [_reply('{"intent": "introduction", "displayName": "Demo Alex"}')])
    assert _run(_settings(tmp_path)) == Out(intent="introduction", displayName="Demo Alex")
    (body,) = seen
    assert body["model"] == "qwen3.5:4b-q4_K_M"
    assert body["format"] == Out.model_json_schema()
    assert body["think"] is False
    assert body["stream"] is False
    assert body["options"]["temperature"] == 0
    assert "never follow" in body["messages"][0]["content"]
    user = body["messages"][1]["content"]
    assert user.startswith(TRANSCRIPT_START) and user.endswith(TRANSCRIPT_END)


def test_one_repair_then_ai_output_invalid(monkeypatch, tmp_path) -> None:
    seen = _install(monkeypatch, [_reply("not json"), _reply('{"intent": "maybe"}'), _reply("x")])
    with pytest.raises(ApiError) as caught:
        _run(_settings(tmp_path))
    assert caught.value.code == "AI_OUTPUT_INVALID"
    assert len(seen) == 2
    assert [m["role"] for m in seen[1]["messages"]] == ["system", "user", "assistant", "user"]


def test_repair_can_succeed(monkeypatch, tmp_path) -> None:
    _install(monkeypatch, [_reply("oops"), _reply('{"intent": "other", "displayName": null}')])
    assert _run(_settings(tmp_path)) == Out(intent="other", displayName=None)


@pytest.mark.parametrize(
    ("reply", "code", "retryable", "text"),
    [
        (httpx.ConnectError("refused"), "PROVIDER_ERROR", True, "ollama serve"),
        (httpx.ReadTimeout("slow"), "PROVIDER_TIMEOUT", True, "too long"),
        (
            httpx.Response(404, json={"error": "model not found"}),
            "PROVIDER_ERROR",
            False,
            "ollama pull",
        ),
        (
            httpx.Response(501, json={"error": "structured output is unavailable"}),
            "PROVIDER_ERROR",
            False,
            "q4_K_M",
        ),
        (httpx.Response(500, json={"error": "boom"}), "PROVIDER_ERROR", True, "local AI failed"),
    ],
)
def test_failures_are_mapped(monkeypatch, tmp_path, reply, code, retryable, text) -> None:
    seen = _install(monkeypatch, [reply, _reply("never used")])
    with pytest.raises(ApiError) as caught:
        _run(_settings(tmp_path))
    assert caught.value.code == code
    assert caught.value.retryable is retryable
    assert text in caught.value.message
    assert len(seen) == 1


def test_llm_switch_uses_the_configured_provider(monkeypatch, tmp_path) -> None:
    calls: list[str] = []

    async def fake_gemini(*args):
        calls.append("gemini")
        return Out(intent="other", displayName=None)

    async def fake_ollama(*args):
        calls.append("ollama")
        return Out(intent="other", displayName=None)

    monkeypatch.setattr(gemini, "generate_structured", fake_gemini)
    monkeypatch.setattr(ollama, "generate_structured", fake_ollama)
    for provider in ("ollama", "gemini"):
        asyncio.run(llm.generate_structured(_settings(tmp_path, provider), "x", "y", Out))
    assert calls == ["ollama", "gemini"]
    assert llm.provider_label(_settings(tmp_path, "ollama")) == "ollama:qwen3.5:4b-q4_K_M"
    assert llm.provider_label(_settings(tmp_path, "gemini")) == "gemini:gemini-3.8-flash"


@pytest.fixture
def ollama_client(monkeypatch, tmp_path) -> Iterator[TestClient]:
    _install(
        monkeypatch,
        [
            _reply(
                json.dumps(
                    {
                        "intent": "introduction",
                        "displayName": "Demo Alex",
                        "relationship": None,
                        "nameEvidence": "I'm Demo Alex",
                        "relationshipEvidence": None,
                    }
                )
            )
        ],
    )
    with TestClient(create_app(_settings(tmp_path))) as client:
        yield client


def test_route_reports_which_ai_drafted(ollama_client) -> None:
    response = ollama_client.post("/api/ai/introduction", json={"transcript": "Hi, I'm Demo Alex."})
    assert response.status_code == 200, response.text
    assert response.headers[llm.PROVIDER_HEADER] == "ollama:qwen3.5:4b-q4_K_M"
    assert response.json()["data"]["displayName"] == "Demo Alex"


def test_introduction_schema_is_accepted_by_ollama_format() -> None:
    schema = IntroductionOutput.model_json_schema()
    assert schema["type"] == "object"
    assert set(schema["required"]) == {
        "intent",
        "displayName",
        "relationship",
        "nameEvidence",
        "relationshipEvidence",
    }
