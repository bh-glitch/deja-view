"""ElevenLabs Scribe (STT) and TTS over HTTPX (owner: Vansh).

Keys are server-only. Map our upload field ``audio`` to the provider's ``file``
plus ``model_id``; let HTTPX build multipart boundaries. Use bounded timeouts and
raise sanitized ApiErrors (PROVIDER_NOT_CONFIGURED / _RATE_LIMITED / _TIMEOUT /
_ERROR, EMPTY_AUDIO).
"""

from __future__ import annotations

from app.config import Settings
from app.contracts import not_implemented


async def transcribe_audio(
    settings: Settings, audio: bytes, filename: str, content_type: str
) -> str:
    """Return the transcript text (may be empty -> caller maps to EMPTY_TRANSCRIPT)."""
    raise not_implemented("Speech transcription")


async def synthesize_speech(settings: Settings, text: str) -> bytes:
    """Return verified MP3 bytes for ``text`` using the configured voice/model."""
    raise not_implemented("Speech synthesis")
