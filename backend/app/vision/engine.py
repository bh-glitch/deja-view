"""InsightFace recognition engine (owner: Bhavya).

One engine per backend process, created explicitly by main.py's lifespan.
Methods are synchronous, CPU-bound and internally serialized; routes must call
them through ``starlette.concurrency.run_in_threadpool`` so inference never
blocks the event loop.

Loading must use the verified local directory ``settings.model_dir`` (passing a
directory to ``FaceAnalysis`` avoids InsightFace's automatic download) with
``providers=["CPUExecutionProvider"]``.
"""

from __future__ import annotations

from typing import Protocol

from app.config import Settings
from app.contracts import (
    ApiError,
    EnrollmentSample,
    ErrorCode,
    FaceModel,
    FrameResult,
)
from app.vision.gallery import Gallery
from app.vision.image import DecodedImage


class FaceEngine(Protocol):
    @property
    def model(self) -> FaceModel:
        """Verified metadata of the loaded recognition model."""
        ...

    def recognize(self, image: DecodedImage, gallery: Gallery) -> FrameResult:
        """Detect faces and match a single face against the gallery.

        Zero faces -> no_face; several -> multiple_faces; weak/ambiguous or
        empty gallery -> unknown. Never raises for those outcomes.
        """
        ...

    def enrollment_sample(self, image: DecodedImage) -> EnrollmentSample:
        """Return one normalized embedding for exactly one adequate face.

        Raises ApiError NO_FACE / MULTIPLE_FACES / FACE_INADEQUATE.
        """
        ...


def load_face_engine(settings: Settings) -> FaceEngine:
    """Load verified local weights. Raises ApiError(MODEL_UNAVAILABLE) on failure."""
    raise ApiError(
        ErrorCode.MODEL_UNAVAILABLE,
        "Face engine is not implemented yet (Phase 0 placeholder).",
    )
