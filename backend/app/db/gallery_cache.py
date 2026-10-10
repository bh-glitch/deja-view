"""In-memory gallery cache (owner: Arnav).

Recognition must not query SQLite per camera frame. The cache is loaded on
first use and invalidated after enrollment or deletion.

``get`` runs in worker threads, so state is guarded by a lock. A generation
counter stops a load that overlapped ``invalidate()`` from installing a
gallery read before the change.
"""

from __future__ import annotations

import threading

from app.contracts import FaceModel
from app.db import repository
from app.db.database import Database
from app.vision.gallery import Gallery


class GalleryCache:
    def __init__(self, db: Database):
        self._db = db
        self._lock = threading.Lock()
        self._gallery: Gallery | None = None
        self._generation = 0

    def get(self, model: FaceModel) -> Gallery:
        with self._lock:
            cached = self._gallery
            generation = self._generation
        if cached is not None and cached.model == model:
            return cached

        gallery = repository.load_gallery(self._db, model)
        with self._lock:
            if self._generation == generation:
                self._gallery = gallery
        return gallery

    def invalidate(self) -> None:
        with self._lock:
            self._gallery = None
            self._generation += 1
