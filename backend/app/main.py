"""FastAPI application (owner: Bhavya).

Run from backend/:
    uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1

Importing this module has no side effects: SQLite and the face engine are
initialized explicitly in ``lifespan``.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.contracts import REQUEST_ID_HEADER, ApiError, ErrorCode
from app.db.database import Database
from app.db.gallery_cache import GalleryCache
from app.http.envelope import error_response, new_request_id
from app.routes import ai, audio, conversations, health, people, vision
from app.vision.engine import load_face_engine

logger = logging.getLogger("forget_not")

API_PREFIX = "/api"
API_VERSION = "0.1.0"

_HTTP_STATUS_CODES = {
    400: ErrorCode.BAD_REQUEST,
    404: ErrorCode.NOT_FOUND,
    405: ErrorCode.METHOD_NOT_ALLOWED,
    409: ErrorCode.CONFLICT,
    413: ErrorCode.PAYLOAD_TOO_LARGE,
    415: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    422: ErrorCode.VALIDATION_ERROR,
}


def _init_runtime(app: FastAPI, settings: Settings) -> None:
    app.state.settings = settings
    app.state.database = Database(settings.database_path)
    app.state.database_error = None
    app.state.gallery_cache = GalleryCache(app.state.database)
    app.state.face_engine = None
    app.state.face_engine_error = None

    try:
        app.state.database.initialize()
    except ApiError as exc:
        app.state.database_error = exc.message
        logger.warning("database unavailable: %s", exc.message)

    try:
        app.state.face_engine = load_face_engine(settings)
    except ApiError as exc:
        app.state.face_engine_error = exc.message
        logger.warning("face engine unavailable: %s", exc.message)


def _validation_message(exc: RequestValidationError) -> str:
    parts = []
    for err in exc.errors()[:5]:
        loc = ".".join(str(p) for p in err.get("loc", ()))
        parts.append(f"{loc}: {err.get('msg', 'invalid')}")
    return "; ".join(parts) or "Request validation failed."


def _install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return error_response(request, exc)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        return error_response(
            request, ApiError(ErrorCode.VALIDATION_ERROR, _validation_message(exc))
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        code = _HTTP_STATUS_CODES.get(exc.status_code, ErrorCode.BAD_REQUEST)
        message = exc.detail if isinstance(exc.detail, str) else code.value
        return error_response(request, ApiError(code, message))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        logger.exception("unhandled error", exc_info=exc)
        return error_response(
            request, ApiError(ErrorCode.INTERNAL_ERROR, "Unexpected server error.")
        )


def _openapi_with_envelopes(app: FastAPI) -> dict[str, Any]:
    """Replace FastAPI's default 422 schema with the shared ErrorEnvelope."""
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title="forget-not API", version=API_VERSION, routes=app.routes
    )
    envelope_ref = {"$ref": "#/components/schemas/ErrorEnvelope"}
    for path_item in schema.get("paths", {}).values():
        for operation in path_item.values():
            responses = operation.get("responses", {})
            if "422" in responses:
                responses["422"] = {
                    "description": "Validation error",
                    "content": {"application/json": {"schema": envelope_ref}},
                }
    components = schema.get("components", {}).get("schemas", {})
    components.pop("HTTPValidationError", None)
    components.pop("ValidationError", None)
    app.openapi_schema = schema
    return schema


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        _init_runtime(app, settings or get_settings())
        yield

    app = FastAPI(title="forget-not API", version=API_VERSION, lifespan=lifespan)

    @app.middleware("http")
    async def _request_id(request: Request, call_next):
        request.state.request_id = new_request_id()
        response = await call_next(request)
        response.headers.setdefault(REQUEST_ID_HEADER, request.state.request_id)
        return response

    _install_error_handlers(app)
    for module in (health, people, conversations, vision, audio, ai):
        app.include_router(module.router, prefix=API_PREFIX)
    app.openapi = lambda: _openapi_with_envelopes(app)  # type: ignore[method-assign]
    return app


app = create_app()
