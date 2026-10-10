"""Mocked ElevenLabs Scribe tests (owner: Vansh). No network; see test_live_providers.py."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.contracts import REQUEST_ID_HEADER, ErrorEnvelope, TranscriptResponse
from app.main import create_app
from app.providers import elevenlabs

WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
FAKE_KEY = "test-elevenlabs-key"


@pytest.fixture
def stt_settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        prototype_mode="fixture",
        database_path=tmp_path / "test-fixture.db",
        insightface_root=tmp_path / "weights",
        elevenlabs_api_key=FAKE_KEY,
    )


@pytest.fixture
def captured() -> list[httpx.Request]:
    return []


def _use_provider(monkeypatch, handler) -> None:
    monkeypatch.setattr(elevenlabs, "_transport", httpx.MockTransport(handler))


def _client(settings: Settings) -> TestClient:
    return TestClient(create_app(settings))


def _post(client: TestClient, body: bytes = WEBM, name: str = "rec.webm", mime: str = "audio/webm"):
    return client.post("/api/audio/transcribe", files={"audio": (name, body, mime)})


def _assert_error(response, status: int, code: str, retryable: bool | None = None) -> ErrorEnvelope:
    assert response.status_code == status, response.text
    body = ErrorEnvelope.model_validate(response.json())
    assert body.error.code == code
    assert response.headers[REQUEST_ID_HEADER] == body.request_id
    if retryable is not None:
        assert body.error.retryable is retryable
    assert FAKE_KEY not in response.text
    return body


def test_transcribe_maps_fields_and_returns_text(monkeypatch, stt_settings, captured) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={"text": "  Hi, I'm Demo Alex.  ", "language_code": "eng"})

    _use_provider(monkeypatch, handler)
    with _client(stt_settings) as client:
        response = _post(client)
    assert response.status_code == 200, response.text
    assert (
        TranscriptResponse.model_validate(response.json()).data.transcript == "Hi, I'm Demo Alex."
    )

    (request,) = captured
    assert request.url.path == "/v1/speech-to-text"
    assert request.headers["xi-api-key"] == FAKE_KEY
    content_type = request.headers["content-type"]
    assert content_type.startswith("multipart/form-data; boundary=")
    body = request.read()
    assert b'name="model_id"\r\n\r\nscribe_v2' in body
    assert b'name="tag_audio_events"\r\n\r\nfalse' in body
    assert b'name="file"; filename="rec.webm"' in body
    assert b'name="audio"' not in body
    assert WEBM in body


def test_missing_key_is_not_configured(tmp_path) -> None:
    settings = Settings(
        _env_file=None, database_path=tmp_path / "fixture.db", insightface_root=tmp_path / "w"
    )
    with _client(settings) as client:
        _assert_error(_post(client), 503, "PROVIDER_NOT_CONFIGURED", retryable=False)


def test_zero_byte_upload_is_empty_audio(stt_settings) -> None:
    with _client(stt_settings) as client:
        _assert_error(_post(client, body=b""), 422, "EMPTY_AUDIO", retryable=True)


def test_unrecognized_bytes_are_unsupported(monkeypatch, stt_settings) -> None:
    _use_provider(monkeypatch, lambda request: pytest.fail("provider must not be called"))
    with _client(stt_settings) as client:
        _assert_error(_post(client, body=b"not audio at all"), 415, "UNSUPPORTED_MEDIA_TYPE")


def test_blank_transcript_is_empty_transcript(monkeypatch, stt_settings) -> None:
    _use_provider(monkeypatch, lambda request: httpx.Response(200, json={"text": "   "}))
    with _client(stt_settings) as client:
        _assert_error(_post(client), 422, "EMPTY_TRANSCRIPT", retryable=True)


def test_oversized_upload_is_rejected(monkeypatch, stt_settings) -> None:
    _use_provider(monkeypatch, lambda request: pytest.fail("provider must not be called"))
    with _client(stt_settings) as client:
        _assert_error(_post(client, body=WEBM + b"\x00" * 2_000_000), 413, "PAYLOAD_TOO_LARGE")


@pytest.mark.parametrize(
    ("status", "code", "retryable"),
    [
        (429, "PROVIDER_RATE_LIMITED", True),
        (401, "PROVIDER_ERROR", False),
        (422, "PROVIDER_ERROR", False),
        (500, "PROVIDER_ERROR", True),
    ],
)
def test_provider_failures_are_sanitized(
    monkeypatch, stt_settings, status, code, retryable
) -> None:
    secret_body = {"detail": {"message": f"bad key {FAKE_KEY}"}}
    _use_provider(monkeypatch, lambda request: httpx.Response(status, json=secret_body))
    with _client(stt_settings) as client:
        body = _assert_error(_post(client), {429: 429}.get(status, 502), code, retryable=retryable)
    assert "bad key" not in body.error.message


def test_timeout_is_provider_timeout(monkeypatch, stt_settings) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    _use_provider(monkeypatch, handler)
    with _client(stt_settings) as client:
        _assert_error(_post(client), 504, "PROVIDER_TIMEOUT", retryable=True)


@pytest.mark.parametrize("payload", [{"no_text": 1}, {"text": 5}])
def test_missing_text_is_provider_error(monkeypatch, stt_settings, payload) -> None:
    _use_provider(monkeypatch, lambda request: httpx.Response(200, json=payload))
    with _client(stt_settings) as client:
        _assert_error(_post(client), 502, "PROVIDER_ERROR")


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (b"\x1a\x45\xdf\xa3rest", "webm"),
        (b"OggS\x00", "ogg"),
        (b"\x00\x00\x00\x20ftypM4A ", "mp4"),
        (b"RIFF\x00\x00\x00\x00WAVEfmt ", "wav"),
        (b"ID3\x04", "mp3"),
        (b"\xff\xfb\x90\x00", "mp3"),
        (b"hello", None),
        (b"", None),
    ],
)
def test_sniff_audio_format(data, expected) -> None:
    assert elevenlabs.sniff_audio_format(data) == expected
