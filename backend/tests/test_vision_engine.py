"""Integration tests against the real local buffalo_l weights.

Inputs are InsightFace's bundled demo image only (no teammate faces). Skipped,
visibly, when weights are not prepared (run scripts/prepare-models.py).
"""

from __future__ import annotations

import uuid
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.contracts import ApiError, ErrorCode, FrameStatus
from app.main import create_app
from app.vision.engine import InsightFaceEngine, load_face_engine
from app.vision.gallery import Gallery, GalleryEntry
from app.vision.image import DecodedImage, decode_jpeg

SETTINGS = Settings(_env_file=None)
pytestmark = pytest.mark.skipif(
    not SETTINGS.model_dir.is_dir(), reason="buffalo_l weights not prepared"
)


def _jpeg(bgr: np.ndarray) -> bytes:
    return cv2.imencode(".jpg", bgr)[1].tobytes()


@pytest.fixture(scope="module")
def engine() -> InsightFaceEngine:
    return load_face_engine(SETTINGS)  # type: ignore[return-value]


@pytest.fixture(scope="module")
def demo_bgr() -> np.ndarray:
    import insightface

    path = Path(insightface.__file__).parent / "data" / "images" / "t1.jpg"
    return cv2.imread(str(path))


@pytest.fixture(scope="module")
def single_faces(engine, demo_bgr) -> list[DecodedImage]:
    group = decode_jpeg(_jpeg(demo_bgr))
    crops = []
    for face in engine._detect(group)[:2]:
        x1, y1, x2, y2 = face.bbox.astype(int)
        w, h = x2 - x1, y2 - y1
        crop = demo_bgr[max(0, y1 - h) : y2 + h, max(0, x1 - w) : x2 + w]
        crop = cv2.resize(crop, (480, int(480 * crop.shape[0] / crop.shape[1])))
        crops.append(decode_jpeg(_jpeg(crop)))
    return crops


def test_model_metadata_is_verified(engine) -> None:
    assert engine.model.dimension == 512
    assert engine.model.recognition_file == "w600k_r50.onnx"
    assert engine.model.normalization == "l2"


def test_group_photo_is_multiple_faces(engine, demo_bgr) -> None:
    image = decode_jpeg(_jpeg(demo_bgr))
    result = engine.recognize(image, Gallery.empty(engine.model))
    assert result.status == FrameStatus.MULTIPLE_FACES
    assert result.person_id is None and result.box is None
    with pytest.raises(ApiError) as info:
        engine.enrollment_sample(image)
    assert info.value.code == ErrorCode.MULTIPLE_FACES


def test_blank_frame_is_no_face(engine) -> None:
    blank = decode_jpeg(_jpeg(np.full((480, 640, 3), 128, np.uint8)))
    assert engine.recognize(blank, Gallery.empty(engine.model)).status == FrameStatus.NO_FACE
    with pytest.raises(ApiError) as info:
        engine.enrollment_sample(blank)
    assert info.value.code == ErrorCode.NO_FACE


def test_enroll_then_recognize(engine, single_faces) -> None:
    a, b = single_faces
    sample_a, sample_b = engine.enrollment_sample(a), engine.enrollment_sample(b)
    assert len(sample_a.embedding) == 512
    assert abs(float(np.linalg.norm(sample_a.embedding)) - 1.0) < 1e-3

    alex, sam = uuid.uuid4(), uuid.uuid4()
    gallery = Gallery(
        engine.model,
        (
            GalleryEntry(alex, np.array([sample_a.embedding], np.float32)),
            GalleryEntry(sam, np.array([sample_b.embedding], np.float32)),
        ),
    )
    flipped = decode_jpeg(_jpeg(cv2.flip(a.bgr, 1)))
    result = engine.recognize(flipped, gallery)
    assert result.status == FrameStatus.MATCHED and result.person_id == alex

    only_sam = Gallery(engine.model, gallery.entries[1:])
    assert engine.recognize(a, only_sam).status == FrameStatus.UNKNOWN
    assert engine.recognize(a, Gallery.empty(engine.model)).status == FrameStatus.UNKNOWN


def test_enrollment_endpoint_and_health(single_faces, tmp_path) -> None:
    settings = Settings(_env_file=None, database_path=tmp_path / "test-fixture.db")
    with TestClient(create_app(settings)) as client:
        health = client.get("/api/health").json()["data"]["vision"]
        assert health["ready"] is True and health["model"]["dimension"] == 512
        response = client.post(
            "/api/vision/enrollment-sample",
            files={"frame": ("f.jpg", _jpeg(single_faces[0].bgr), "image/jpeg")},
        )
        assert response.status_code == 200, response.text
        assert len(response.json()["data"]["embedding"]) == 512
