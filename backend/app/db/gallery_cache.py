"""In-memory gallery cache (owner: Arnav).

Recognition must not query SQLite per camera frame. The cache is loaded on
first use and invalidated after enrollment or deletion.
"""

from __future__ import annotations

from app.contracts import FaceModel, not_implemented
from app.db.database import Database
from app.vision.gallery import Gallery


class GalleryCache:
    def __init__(self, db: Database):
        self._db = db

    def get(self, model: FaceModel) -> Gallery:
        raise not_implemented("Gallery cache")

    def invalidate(self) -> None:
        raise not_implemented("Gallery cache invalidation")
