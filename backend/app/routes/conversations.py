"""/api/conversations endpoints (owner: Arnav)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from starlette.concurrency import run_in_threadpool

from app.contracts import ConversationPayload, ConversationResponse, CreateConversationRequest
from app.db import repository
from app.db.database import Database
from app.http.deps import get_database
from app.http.envelope import request_id
from app.routes._errors import ERROR_RESPONSES

router = APIRouter(prefix="/conversations", tags=["conversations"], responses=ERROR_RESPONSES)


@router.post(
    "", response_model=ConversationResponse, status_code=201, operation_id="createConversation"
)
async def create_conversation(
    request: Request, body: CreateConversationRequest, db: Database = Depends(get_database)
) -> ConversationResponse:
    conversation = await run_in_threadpool(repository.create_conversation, db, body)
    return ConversationResponse(
        data=ConversationPayload(conversation=conversation), request_id=request_id(request)
    )
