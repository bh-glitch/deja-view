"""Mocked Claude provider tests (Bhavya). No network."""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from app.ai.introduction import IntroductionOutput
from app.config import Settings
from app.contracts import ApiError, ErrorCode
from app.providers import claude, llm

PARSED = IntroductionOutput(
    intent="introduction",
    displayName="Arnav",
    nameEvidence="I'm Arnav",
    relationship="brother",
    relationshipEvidence="I'm your brother",
)


def _settings(tmp_path: Path, **overrides) -> Settings:
    values = {
        "_env_file": None,
        "database_path": tmp_path / "fixture.db",
        "insightface_root": tmp_path / "w",
        "ai_provider": "anthropic",
        "anthropic_api_key": "test-claude-key",
    }
    return Settings(**{**values, **overrides})


class FakeClient:
    def __init__(self, result=None, error: Exception | None = None):
        self.calls: list[dict] = []
        self._result, self._error = result, error
        self.messages = SimpleNamespace(parse=self._parse)

    async def _parse(self, **kwargs):
        self.calls.append(kwargs)
        if self._error:
            raise self._error
        return self._result

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def _use(monkeypatch, fake: FakeClient) -> None:
    monkeypatch.setattr(claude, "_client", lambda settings: fake)


def test_returns_parsed_output_with_configured_model(monkeypatch, tmp_path) -> None:
    fake = FakeClient(SimpleNamespace(stop_reason="end_turn", parsed_output=PARSED))
    _use(monkeypatch, fake)
    settings = _settings(tmp_path)
    result = asyncio.run(
        llm.generate_structured(settings, "SYSTEM", "I'm Arnav", IntroductionOutput)
    )
    assert result == PARSED
    (call,) = fake.calls
    assert call["model"] == "claude-haiku-5-5"
    assert call["output_format"] is IntroductionOutput
    assert call["thinking"] == {"type": "disabled"}
    assert "<<<TRANSCRIPT" in call["messages"][0]["content"]  # transcript stays fenced
    assert llm.provider_label(settings) == "anthropic:claude-haiku-5-5"


def test_refusal_or_unparsed_output_is_invalid(monkeypatch, tmp_path) -> None:
    _use(monkeypatch, FakeClient(SimpleNamespace(stop_reason="refusal", parsed_output=None)))
    with pytest.raises(ApiError) as info:
        asyncio.run(claude.generate_structured(_settings(tmp_path), "S", "t", IntroductionOutput))
    assert info.value.code == ErrorCode.AI_OUTPUT_INVALID


def _status_error(cls, status: int):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("err", response=httpx2.Response(status, request=request), body=None)


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (lambda: _status_error(anthropic.RateLimitError, 429), ErrorCode.PROVIDER_RATE_LIMITED),
        (lambda: _status_error(anthropic.AuthenticationError, 401), ErrorCode.PROVIDER_ERROR),
        (lambda: _status_error(anthropic.InternalServerError, 500), ErrorCode.PROVIDER_ERROR),
        (
            lambda: anthropic.APITimeoutError(request=httpx2.Request("POST", "https://x")),
            ErrorCode.PROVIDER_TIMEOUT,
        ),
    ],
)
def test_errors_are_sanitized(monkeypatch, tmp_path, error, code) -> None:
    _use(monkeypatch, FakeClient(error=error()))
    with pytest.raises(ApiError) as info:
        asyncio.run(claude.generate_structured(_settings(tmp_path), "S", "t", IntroductionOutput))
    assert info.value.code == code
    assert "test-claude-key" not in info.value.message


def test_missing_key_is_not_configured(tmp_path) -> None:
    with pytest.raises(ApiError) as info:
        asyncio.run(
            claude.generate_structured(
                _settings(tmp_path, anthropic_api_key=""), "S", "t", IntroductionOutput
            )
        )
    assert info.value.code == ErrorCode.PROVIDER_NOT_CONFIGURED
