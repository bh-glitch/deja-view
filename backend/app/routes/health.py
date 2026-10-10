"""GET /api/health (owner: Arnav)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.config import Settings
from app.contracts import (
    CredentialPresence,
    DatabaseHealth,
    FaceModelHealth,
    Health,
    HealthResponse,
)
from app.http.deps import get_app_settings, get_database
from app.http.envelope import request_id
from app.routes._errors import ERROR_RESPONSES

router = APIRouter(tags=["health"], responses=ERROR_RESPONSES)


@router.get("/health", response_model=HealthResponse, operation_id="getHealth")
def get_health(
    request: Request,
    settings: Settings = Depends(get_app_settings),
    db=Depends(get_database),
) -> HealthResponse:
    engine = request.app.state.face_engine
    db_ready = db.is_ready()
    return HealthResponse(
        data=Health(
            mode=settings.prototype_mode,
            database=DatabaseHealth(
                ready=db_ready,
                detail=None if db_ready else request.app.state.database_error,
            ),
            vision=FaceModelHealth(
                ready=engine is not None,
                model=engine.model if engine is not None else None,
                detail=None if engine is not None else request.app.state.face_engine_error,
            ),
            credentials=CredentialPresence(
                gemini_api_key=bool(settings.gemini_api_key),
                elevenlabs_api_key=bool(settings.elevenlabs_api_key),
                elevenlabs_voice_id=bool(settings.elevenlabs_voice_id),
            ),
        ),
        request_id=request_id(request),
    )
