"""InsightFace recognition engine (owner: Bhavya).

One engine per backend process, created explicitly by main.py's lifespan.
Methods are synchronous, CPU-bound and internally serialized; routes must call
them through ``starlette.concurrency.run_in_threadpool`` so inference never
blocks the event loop.

Loading uses the verified local directory ``settings.model_dir`` (passing a
directory to ``FaceAnalysis`` avoids InsightFace's automatic download) with
``providers=["CPUExecutionProvider"]``. Model files are checked against
``models/manifest.json`` before use.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import warnings
from pathlib import Path
from typing import Any, Protocol

import numpy as np

from app.config import REPO_ROOT, Settings
from app.contracts import (
    EXPECTED_EMBEDDING_DIMENSION,
    ApiError,
    Box,
    EnrollmentSample,
    ErrorCode,
    FaceModel,
    FrameResult,
    FrameStatus,
)
from app.vision.gallery import Gallery
from app.vision.image import DecodedImage
from app.vision.matching import match_gallery
from app.vision.thresholds import (
    DETECTION_SIZE,
    DETECTION_THRESHOLD,
    ENROLL_EDGE_MARGIN_PIXELS,
    ENROLL_MIN_DETECTION_SCORE,
    ENROLL_MIN_FACE_PIXELS,
)

logger = logging.getLogger("forget_not.vision")

MODEL_MANIFEST = REPO_ROOT / "models" / "manifest.json"
PROVIDERS = ["CPUExecutionProvider"]


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


def _unavailable(message: str) -> ApiError:
    return ApiError(ErrorCode.MODEL_UNAVAILABLE, message)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_manifest(pack_name: str) -> dict[str, Any]:
    try:
        manifest = json.loads(MODEL_MANIFEST.read_text())["pack"]
    except (OSError, ValueError, KeyError) as exc:
        raise _unavailable("models/manifest.json is missing or unreadable.") from exc
    if manifest.get("name") != pack_name or not manifest.get("files"):
        raise _unavailable(f"models/manifest.json has no recorded checksums for {pack_name}.")
    return manifest


def _verify_file(path: Path, manifest: dict[str, Any]) -> str:
    expected = manifest["files"].get(path.name)
    if expected is None:
        raise _unavailable(f"{path.name} is not listed in models/manifest.json.")
    observed = _sha256(path)
    if observed != expected:
        raise _unavailable(
            f"{path.name} does not match models/manifest.json; rerun scripts/prepare-models.py."
        )
    return observed


class InsightFaceEngine:
    """FaceEngine backed by InsightFace buffalo_l (detection + ArcFace recognition)."""

    def __init__(self, analysis: Any, model: FaceModel):
        self._analysis = analysis
        self._detector = analysis.models["detection"]
        self._recognizer = analysis.models["recognition"]
        self._model = model
        self._lock = threading.Lock()

    @property
    def model(self) -> FaceModel:
        return self._model

    # -- internals ---------------------------------------------------------

    def _detect(self, image: DecodedImage) -> list[Any]:
        from insightface.app.common import Face

        bboxes, kpss = self._detector.detect(image.bgr, max_num=0, metric="default")
        faces = []
        for i in range(bboxes.shape[0]):
            score = float(bboxes[i, 4])
            if score < DETECTION_THRESHOLD:
                continue
            kps = kpss[i] if kpss is not None else None
            faces.append(Face(bbox=bboxes[i, 0:4], kps=kps, det_score=score))
        return faces

    def _embed(self, image: DecodedImage, face: Any) -> np.ndarray:
        if face.kps is None:
            raise ApiError(ErrorCode.FACE_INADEQUATE, "Face landmarks were not detected.")
        raw = np.asarray(self._recognizer.get(image.bgr, face), dtype=np.float32).ravel()
        norm = float(np.linalg.norm(raw))
        if raw.size != self._model.dimension or not np.isfinite(raw).all() or norm <= 0:
            raise ApiError(ErrorCode.INTERNAL_ERROR, "Face model produced an invalid embedding.")
        return raw / norm

    @staticmethod
    def _box(face: Any, image: DecodedImage) -> Box:
        x1, y1, x2, y2 = (float(v) for v in face.bbox)
        x1, x2 = max(0.0, min(x1, image.width)), max(0.0, min(x2, image.width))
        y1, y2 = max(0.0, min(y1, image.height)), max(0.0, min(y2, image.height))
        return Box(
            x=round(x1, 1),
            y=round(y1, 1),
            width=max(round(x2 - x1, 1), 0.1),
            height=max(round(y2 - y1, 1), 0.1),
        )

    # -- FaceEngine ----------------------------------------------------------

    def recognize(self, image: DecodedImage, gallery: Gallery) -> FrameResult:
        if gallery.model != self._model:
            raise ApiError(ErrorCode.MODEL_MISMATCH, "Gallery was built for a different model.")
        size = {"frame_width": image.width, "frame_height": image.height}
        with self._lock:
            faces = self._detect(image)
            if not faces:
                return FrameResult(status=FrameStatus.NO_FACE, **size)
            if len(faces) > 1:
                return FrameResult(status=FrameStatus.MULTIPLE_FACES, **size)
            face = faces[0]
            box = self._box(face, image)
            if face.kps is None:
                return FrameResult(status=FrameStatus.UNKNOWN, box=box, **size)
            query = self._embed(image, face)
        decision = match_gallery(query, gallery)
        if decision.person_id is None:
            return FrameResult(status=FrameStatus.UNKNOWN, box=box, **size)
        similarity = round(max(-1.0, min(1.0, float(decision.best_similarity))), 4)
        return FrameResult(
            status=FrameStatus.MATCHED,
            person_id=decision.person_id,
            similarity=similarity,
            box=box,
            **size,
        )

    def enrollment_sample(self, image: DecodedImage) -> EnrollmentSample:
        with self._lock:
            faces = self._detect(image)
            if not faces:
                raise ApiError(ErrorCode.NO_FACE, "No face found. Face the camera.")
            if len(faces) > 1:
                raise ApiError(
                    ErrorCode.MULTIPLE_FACES, "More than one face is visible. Enroll one person."
                )
            face = faces[0]
            box = self._box(face, image)
            if face.det_score < ENROLL_MIN_DETECTION_SCORE:
                raise ApiError(ErrorCode.FACE_INADEQUATE, "Face is unclear. Improve lighting.")
            if min(box.width, box.height) < ENROLL_MIN_FACE_PIXELS:
                raise ApiError(ErrorCode.FACE_INADEQUATE, "Face is too small. Move closer.")
            margin = ENROLL_EDGE_MARGIN_PIXELS
            if (
                box.x < margin
                or box.y < margin
                or box.x + box.width > image.width - margin
                or box.y + box.height > image.height - margin
            ):
                raise ApiError(
                    ErrorCode.FACE_INADEQUATE, "Face is cut off. Center it in the frame."
                )
            embedding = self._embed(image, face)
        return EnrollmentSample(
            embedding=[float(v) for v in embedding],
            model=self._model,
            box=box,
            frame_width=image.width,
            frame_height=image.height,
        )


def load_face_engine(settings: Settings) -> FaceEngine:
    """Load verified local weights. Raises ApiError(MODEL_UNAVAILABLE) on failure."""
    model_dir = settings.model_dir
    if not model_dir.is_dir():
        raise _unavailable(
            f"Model directory {model_dir} is missing; run scripts/prepare-models.py."
        )
    manifest = _load_manifest(settings.insightface_model)

    try:
        from insightface.app import FaceAnalysis

        # scikit-image deprecation raised on every alignment inside InsightFace 2.1;
        # harmless with the locked versions, so silence only that module's FutureWarning.
        warnings.filterwarnings(
            "ignore", category=FutureWarning, module=r"insightface\.utils\.face_align"
        )
        analysis = FaceAnalysis(
            name=str(model_dir),
            providers=PROVIDERS,
            allowed_modules=["detection", "recognition"],
        )
        analysis.prepare(ctx_id=-1, det_thresh=DETECTION_THRESHOLD, det_size=DETECTION_SIZE)
    except ApiError:
        raise
    except Exception as exc:  # noqa: BLE001 - surface any load failure as unavailable
        logger.exception("face model load failed")
        raise _unavailable(f"Face model failed to load: {type(exc).__name__}.") from exc

    if "detection" not in analysis.models or "recognition" not in analysis.models:
        raise _unavailable("Model pack lacks detection or recognition models.")
    detector_file = Path(analysis.models["detection"].model_file)
    recognizer = analysis.models["recognition"]
    recognizer_file = Path(recognizer.model_file)
    _verify_file(detector_file, manifest)
    recognition_sha = _verify_file(recognizer_file, manifest)

    for task, model in analysis.models.items():
        providers = model.session.get_providers()
        if providers != PROVIDERS:
            raise _unavailable(f"{task} model is not running on CPU only ({providers}).")

    probe = np.asarray(recognizer.get_feat(np.zeros((112, 112, 3), dtype=np.uint8)))
    dimension = int(probe.reshape(probe.shape[0], -1).shape[1])
    if dimension != EXPECTED_EMBEDDING_DIMENSION:
        raise _unavailable(
            f"Recognition model outputs {dimension} values; "
            f"expected {EXPECTED_EMBEDDING_DIMENSION}."
        )

    model = FaceModel(
        pack_name=settings.insightface_model,
        recognition_file=recognizer_file.name,
        recognition_sha256=recognition_sha,
        dimension=dimension,
        normalization="l2",
    )
    logger.info(
        "face engine ready: %s %s (%d-d)", model.pack_name, model.recognition_file, dimension
    )
    return InsightFaceEngine(analysis, model)
