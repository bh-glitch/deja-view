"""Request IDs and JSON envelopes (owner: Arnav; signatures frozen by Bhavya)."""

from __future__ import annotations

import uuid

from fastapi import Request
from fastapi.responses import JSONResponse

from app.contracts import REQUEST_ID_HEADER, ApiError, ErrorDetail, ErrorEnvelope


def new_request_id() -> str:
    return str(uuid.uuid4())


def request_id(request: Request) -> str:
    """Return the ID assigned by main.py's middleware (or a fresh one if missing)."""
    value = getattr(request.state, "request_id", None)
    if not value:
        value = new_request_id()
        request.state.request_id = value
    return value


def error_response(request: Request, error: ApiError) -> JSONResponse:
    rid = request_id(request)
    body = ErrorEnvelope(
        error=ErrorDetail(code=error.code, message=error.message, retryable=error.retryable),
        request_id=rid,
    )
    return JSONResponse(
        status_code=error.status_code,
        content=body.model_dump(mode="json"),
        headers={REQUEST_ID_HEADER: rid},
    )
