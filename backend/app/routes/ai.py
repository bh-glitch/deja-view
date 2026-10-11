"""/api/ai endpoints (owner: Vansh; key-points by Bhavya). Drafts only; never persists."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from app.ai.introduction import draft_introduction
from app.ai.key_points import pick_key_points
from app.ai.memory import draft_memory
from app.config import Settings
from app.contracts import (
    IntroductionDraftResponse,
    KeyPointsRequest,
    KeyPointsResponse,
    MemoryDraftResponse,
    MemoryRequest,
    TranscriptRequest,
)
from app.http.deps import get_app_settings
from app.http.envelope import request_id
from app.providers.llm import PROVIDER_HEADER, provider_label
from app.routes._errors import ERROR_RESPONSES

router = APIRouter(prefix="/ai", tags=["ai"], responses=ERROR_RESPONSES)


@router.post(
    "/introduction", response_model=IntroductionDraftResponse, operation_id="draftIntroduction"
)
async def introduction(
    request: Request,
    response: Response,
    body: TranscriptRequest,
    settings: Settings = Depends(get_app_settings),
) -> IntroductionDraftResponse:
    response.headers[PROVIDER_HEADER] = provider_label(settings)
    draft = await draft_introduction(settings, body.transcript)
    return IntroductionDraftResponse(data=draft, request_id=request_id(request))


@router.post("/memory", response_model=MemoryDraftResponse, operation_id="draftMemory")
async def memory(
    request: Request,
    response: Response,
    body: MemoryRequest,
    settings: Settings = Depends(get_app_settings),
) -> MemoryDraftResponse:
    response.headers[PROVIDER_HEADER] = provider_label(settings)
    draft = await draft_memory(settings, body.transcript, person_name=body.person_name)
    return MemoryDraftResponse(data=draft, request_id=request_id(request))


@router.post("/key-points", response_model=KeyPointsResponse, operation_id="pickKeyPoints")
async def key_points(
    request: Request,
    response: Response,
    body: KeyPointsRequest,
    settings: Settings = Depends(get_app_settings),
) -> KeyPointsResponse:
    response.headers[PROVIDER_HEADER] = provider_label(settings)
    points = await pick_key_points(settings, list(body.notes), person_name=body.person_name)
    return KeyPointsResponse(data=points, request_id=request_id(request))
