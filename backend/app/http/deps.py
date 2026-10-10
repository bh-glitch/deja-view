"""FastAPI dependencies for runtime services (owner: Arnav; signatures frozen by Bhavya).

main.py's lifespan stores services on ``app.state``; routes obtain them here so
nothing opens SQLite or loads models at import time.
"""

from __future__ import annotations

from fastapi import Request

from app.config import Settings
from app.contracts import ApiError, ErrorCode
from app.db.database import Database
from app.db.gallery_cache import GalleryCache
from app.vision.engine import FaceEngine


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_gallery_cache(request: Request) -> GalleryCache:
    return request.app.state.gallery_cache


def get_face_engine(request: Request) -> FaceEngine:
    engine: FaceEngine | None = request.app.state.face_engine
    if engine is None:
        detail = request.app.state.face_engine_error or "Face model is not loaded."
        raise ApiError(ErrorCode.MODEL_UNAVAILABLE, detail)
    return engine
