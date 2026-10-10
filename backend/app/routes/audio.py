"""/api/audio endpoints (owner: Vansh)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import Response

from app.config import Settings
from app.contracts import (
    MAX_AUDIO_BYTES,
    REQUEST_ID_HEADER,
    SpeakRequest,
    TranscriptPayload,
    TranscriptResponse,
)
from app.http.deps import get_app_settings
from app.http.envelope import request_id
from app.http.uploads import read_bounded_upload
from app.providers import elevenlabs
from app.routes._errors import ERROR_RESPONSES

router = APIRouter(prefix="/audio", tags=["audio"], responses=ERROR_RESPONSES)


@router.post("/transcribe", response_model=TranscriptResponse, operation_id="transcribeAudio")
async def transcribe(
    request: Request,
    audio: UploadFile = File(description="Browser recording, <= 2 MB / 60 s"),
    settings: Settings = Depends(get_app_settings),
) -> TranscriptResponse:
    data = await read_bounded_upload(audio, MAX_AUDIO_BYTES, field="audio")
    text = await elevenlabs.transcribe_audio(
        settings,
        data,
        audio.filename or "recording",
        audio.content_type or "application/octet-stream",
    )
    return TranscriptResponse(
        data=TranscriptPayload(transcript=text), request_id=request_id(request)
    )


@router.post(
    "/speak",
    response_class=Response,
    operation_id="speakText",
    responses={
        200: {
            "description": "MP3 audio",
            "content": {"audio/mpeg": {"schema": {"type": "string", "format": "binary"}}},
            "headers": {REQUEST_ID_HEADER: {"schema": {"type": "string"}}},
        }
    },
)
async def speak(
    request: Request, body: SpeakRequest, settings: Settings = Depends(get_app_settings)
) -> Response:
    mp3 = await elevenlabs.synthesize_speech(settings, body.text)
    return Response(
        content=mp3, media_type="audio/mpeg", headers={REQUEST_ID_HEADER: request_id(request)}
    )
