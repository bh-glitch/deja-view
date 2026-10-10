"""Gallery types passed from storage into the engine (owner: Bhavya).

Arnav's database layer builds a ``Gallery`` from validated rows; the engine
never imports SQL code.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import numpy as np

from app.contracts import FaceModel


@dataclass(frozen=True)
class GalleryEntry:
    person_id: UUID
    embeddings: np.ndarray  # shape (n_samples, dimension), float32, L2-normalized rows


@dataclass(frozen=True)
class Gallery:
    model: FaceModel
    entries: tuple[GalleryEntry, ...]

    @classmethod
    def empty(cls, model: FaceModel) -> Gallery:
        return cls(model=model, entries=())
