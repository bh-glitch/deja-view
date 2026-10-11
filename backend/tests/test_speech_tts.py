"""Mocked ElevenLabs TTS tests (Bhavya, completing the speak endpoint). No network."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.contracts import REQUEST_ID_HEADER, ErrorEnvelope
from app.main import create_app
from app.providers import elevenlabs

MP3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\xff\xfb\x90\x00" * 32
FAKE_KEY = "test-elevenlabs-key"
VOICE = "voice-123"


def _settings(tmp_path: Path, **overrides) -> Settings:
    values = {
        "_env_file": None,
        "prototype_mode": "fixture",
        "database_path": tmp_path / "test-fixture.db",
        "insightface_root": tmp_path / "weights",
        "elevenlabs_api_key": FAKE_KEY,
        "elevenlabs_voice_id": VOICE,
    }
    return Settings(**{**values, **overrides})


def _speak(monkeypatch, settings: Settings, handler, text: str = "Hi, this is Demo Alex."):
    monkeypatch.setattr(elevenlabs, "_transport", httpx.MockTransport(handler))
    with TestClient(create_app(settings)) as client:
        return client.post("/api/audio/speak", json={"text": text})


def _error(response, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    body = ErrorEnvelope.model_validate(response.json())
    assert body.error.code == code
    assert FAKE_KEY not in response.text


def test_speak_returns_verified_mp3_with_configured_voice_and_model(monkeypatch, tmp_path) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, content=MP3, headers={"Content-Type": "audio/mpeg"})

    response = _speak(monkeypatch, _settings(tmp_path), handler)
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.headers[REQUEST_ID_HEADER]
    assert response.content == MP3
    (request,) = seen
    assert request.url.path == f"/v1/text-to-speech/{VOICE}"
    assert request.url.params["output_format"] == "mp3_44100_128"
    assert request.headers["xi-api-key"] == FAKE_KEY
    assert json.loads(request.content) == {
        "text": "Hi, this is Demo Alex.",
        "model_id": "eleven_flash_v2_5",
        "voice_settings": {"speed": 0.9},  # a little slower than normal
    }


def test_speak_rejects_non_mp3_provider_output(monkeypatch, tmp_path) -> None:
    response = _speak(
        monkeypatch, _settings(tmp_path), lambda r: httpx.Response(200, content=b"{}")
    )
    _error(response, 502, "PROVIDER_ERROR")


@pytest.mark.parametrize(
    ("status", "code"),
    [(429, "PROVIDER_RATE_LIMITED"), (401, "PROVIDER_ERROR"), (500, "PROVIDER_ERROR")],
)
def test_speak_maps_provider_failures(monkeypatch, tmp_path, status, code) -> None:
    response = _speak(
        monkeypatch, _settings(tmp_path), lambda r: httpx.Response(status, json={"x": 1})
    )
    _error(response, 429 if status == 429 else 502, code)


def test_speak_needs_voice_id(monkeypatch, tmp_path) -> None:
    response = _speak(
        monkeypatch, _settings(tmp_path, elevenlabs_voice_id=""), lambda r: httpx.Response(200)
    )
    _error(response, 503, "PROVIDER_NOT_CONFIGURED")


def test_speak_limits_text_length(monkeypatch, tmp_path) -> None:
    response = _speak(
        monkeypatch, _settings(tmp_path), lambda r: httpx.Response(200), text="x" * 401
    )
    _error(response, 422, "VALIDATION_ERROR")
