"""ElevenLabs Scribe (STT) and TTS over HTTPX (owner: Vansh).

Keys are server-only. Map our upload field ``audio`` to the provider's ``file``
plus ``model_id``; let HTTPX build multipart boundaries. Use bounded timeouts and
raise sanitized ApiErrors (PROVIDER_NOT_CONFIGURED / _RATE_LIMITED / _TIMEOUT /
_ERROR, EMPTY_AUDIO).
"""

from __future__ import annotations

import logging

import httpx

from app.config import Settings
from app.contracts import MAX_TRANSCRIPT_CHARS, ApiError, ErrorCode

logger = logging.getLogger(__name__)

BASE_URL = "https://api.elevenlabs.io"
STT_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
TTS_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
TTS_OUTPUT_FORMAT = "mp3_44100_128"

# Tests replace this with httpx.MockTransport; None means the real network.
_transport: httpx.AsyncBaseTransport | None = None


def sniff_audio_format(audio: bytes) -> str | None:
    """Identify the container from its magic bytes; never trust the declared MIME alone."""
    if audio[:4] == b"\x1a\x45\xdf\xa3":
        return "webm"
    if audio[:4] == b"OggS":
        return "ogg"
    if audio[4:8] == b"ftyp":
        return "mp4"
    if audio[:4] == b"RIFF" and audio[8:12] == b"WAVE":
        return "wav"
    if audio[:3] == b"ID3" or (len(audio) >= 2 and audio[0] == 0xFF and audio[1] & 0xE0 == 0xE0):
        return "mp3"
    return None


def _client(settings: Settings, timeout: httpx.Timeout) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=BASE_URL,
        timeout=timeout,
        headers={"xi-api-key": settings.elevenlabs_api_key},
        transport=_transport,
    )


def _provider_error(response: httpx.Response, action: str) -> ApiError:
    """Map a provider failure to a sanitized ApiError (no keys, no raw provider body)."""
    status = response.status_code
    logger.warning("ElevenLabs %s failed: HTTP %s", action, status)
    if status == 429:
        return ApiError(
            ErrorCode.PROVIDER_RATE_LIMITED,
            f"Speech service is busy ({action}); try again shortly.",
        )
    if status in (401, 403):
        return ApiError(
            ErrorCode.PROVIDER_ERROR,
            f"Speech service rejected our credentials ({action}).",
            retryable=False,
        )
    if status in (400, 422):
        return ApiError(
            ErrorCode.PROVIDER_ERROR,
            f"Speech service rejected the request ({action}).",
            retryable=False,
        )
    return ApiError(ErrorCode.PROVIDER_ERROR, f"Speech service failed ({action}, HTTP {status}).")


async def transcribe_audio(
    settings: Settings, audio: bytes, filename: str, content_type: str
) -> str:
    """Return the transcript text (may be empty -> caller maps to EMPTY_TRANSCRIPT)."""
    if not settings.elevenlabs_api_key:
        raise ApiError(ErrorCode.PROVIDER_NOT_CONFIGURED, "ElevenLabs API key is not configured.")
    if not audio:
        raise ApiError(ErrorCode.EMPTY_AUDIO, "The recording is empty.")
    if sniff_audio_format(audio) is None:
        raise ApiError(
            ErrorCode.UNSUPPORTED_MEDIA_TYPE,
            "Unsupported audio format; record WebM, Ogg, MP4, WAV or MP3.",
        )

    try:
        async with _client(settings, STT_TIMEOUT) as client:
            response = await client.post(
                "/v1/speech-to-text",
                data={"model_id": settings.elevenlabs_stt_model, "tag_audio_events": "false"},
                files={"file": (filename or "recording", audio, content_type)},
            )
    except httpx.TimeoutException as exc:
        raise ApiError(ErrorCode.PROVIDER_TIMEOUT, "Transcription timed out; try again.") from exc
    except httpx.HTTPError as exc:
        raise ApiError(ErrorCode.PROVIDER_ERROR, "Could not reach the speech service.") from exc

    if response.status_code != 200:
        raise _provider_error(response, "transcription")
    try:
        text = response.json().get("text")
    except (ValueError, AttributeError) as exc:
        raise ApiError(
            ErrorCode.PROVIDER_ERROR, "Speech service returned an invalid response."
        ) from exc
    if not isinstance(text, str):
        raise ApiError(ErrorCode.PROVIDER_ERROR, "Speech service returned no transcript text.")
    text = text.strip()
    if len(text) > MAX_TRANSCRIPT_CHARS:
        raise ApiError(
            ErrorCode.PROVIDER_ERROR,
            "Transcript is longer than the supported limit.",
            retryable=False,
        )
    return text


async def synthesize_speech(settings: Settings, text: str) -> bytes:
    """Return verified MP3 bytes for ``text`` using the configured voice/model.

    Same request Vansh validated in docs/provider-validation.md (E4): explicit voice ID,
    ``eleven_flash_v2_5``, ``mp3_44100_128``, plus ``voice_settings.speed`` (configurable,
    default 0.9 = a little slower). Bytes are checked to be MP3 before returning.
    """
    if not settings.elevenlabs_api_key:
        raise ApiError(ErrorCode.PROVIDER_NOT_CONFIGURED, "ElevenLabs API key is not configured.")
    if not settings.elevenlabs_voice_id:
        raise ApiError(ErrorCode.PROVIDER_NOT_CONFIGURED, "ElevenLabs voice ID is not configured.")
    if not text.strip():
        raise ApiError(ErrorCode.BAD_REQUEST, "Nothing to say.")

    try:
        async with _client(settings, TTS_TIMEOUT) as client:
            response = await client.post(
                f"/v1/text-to-speech/{settings.elevenlabs_voice_id}",
                params={"output_format": TTS_OUTPUT_FORMAT},
                json={
                    "text": text,
                    "model_id": settings.elevenlabs_tts_model,
                    "voice_settings": {"speed": settings.elevenlabs_tts_speed},
                },
                headers={"Accept": "audio/mpeg"},
            )
    except httpx.TimeoutException as exc:
        raise ApiError(
            ErrorCode.PROVIDER_TIMEOUT, "Speech generation timed out; try again."
        ) from exc
    except httpx.HTTPError as exc:
        raise ApiError(ErrorCode.PROVIDER_ERROR, "Could not reach the speech service.") from exc

    if response.status_code != 200:
        raise _provider_error(response, "speech")
    audio = response.content
    if not audio or sniff_audio_format(audio) != "mp3":
        raise ApiError(ErrorCode.PROVIDER_ERROR, "Speech service did not return MP3 audio.")
    return audio
