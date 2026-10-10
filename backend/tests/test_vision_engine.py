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
from app.contracts import ApiError, ErrorCode, FaceStatus
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


def test_group_photo_returns_every_face(engine, demo_bgr) -> None:
    image = decode_jpeg(_jpeg(demo_bgr))
    result = engine.recognize(image, Gallery.empty(engine.model))
    assert len(result.faces) == 6
    assert all(
        face.status == FaceStatus.UNKNOWN and face.person_id is None for face in result.faces
    )
    areas = [face.box.width * face.box.height for face in result.faces]
    assert areas == sorted(areas, reverse=True)
    with pytest.raises(ApiError) as info:
        engine.enrollment_sample(image)
    assert info.value.code == ErrorCode.MULTIPLE_FACES


def test_group_photo_names_enrolled_people_only(engine, demo_bgr, single_faces) -> None:
    a, b = single_faces
    alex, sam = uuid.uuid4(), uuid.uuid4()
    gallery = Gallery(
        engine.model,
        (
            GalleryEntry(alex, np.array([engine.enrollment_sample(a).embedding], np.float32)),
            GalleryEntry(sam, np.array([engine.enrollment_sample(b).embedding], np.float32)),
        ),
    )
    result = engine.recognize(decode_jpeg(_jpeg(demo_bgr)), gallery)
    matched = {face.person_id for face in result.faces if face.status == FaceStatus.MATCHED}
    assert matched == {alex, sam}
    assert sum(face.status == FaceStatus.UNKNOWN for face in result.faces) == 4


def test_blank_frame_is_no_face(engine) -> None:
    blank = decode_jpeg(_jpeg(np.full((480, 640, 3), 128, np.uint8)))
    assert engine.recognize(blank, Gallery.empty(engine.model)).faces == []
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
    (face,) = engine.recognize(flipped, gallery).faces
    assert face.status == FaceStatus.MATCHED and face.person_id == alex

    only_sam = Gallery(engine.model, gallery.entries[1:])
    assert engine.recognize(a, only_sam).faces[0].status == FaceStatus.UNKNOWN
    assert engine.recognize(a, Gallery.empty(engine.model)).faces[0].status == FaceStatus.UNKNOWN


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


def test_enroll_save_recognize_delete_journey(single_faces, tmp_path) -> None:
    """Cross-module: real engine + Arnav's SQLite storage and gallery cache over HTTP."""
    a, b = single_faces
    variants = [a.bgr, cv2.convertScaleAbs(a.bgr, alpha=0.85), cv2.GaussianBlur(a.bgr, (3, 3), 0)]
    settings = Settings(_env_file=None, database_path=tmp_path / "test-fixture.db")
    with TestClient(create_app(settings)) as client:

        def post_frame(path: str, bgr: np.ndarray):
            files = {"frame": ("f.jpg", _jpeg(bgr), "image/jpeg")}
            response = client.post(path, files=files)
            assert response.status_code == 200, response.text
            return response.json()["data"]

        samples = [post_frame("/api/vision/enrollment-sample", v) for v in variants]
        person_id = str(uuid.uuid4())
        created = client.post(
            "/api/people",
            json={
                "personId": person_id,
                "displayName": "Demo Face A",
                "relationship": None,
                "model": samples[0]["model"],
                "embeddings": [s["embedding"] for s in samples],
            },
        )
        assert created.status_code == 201, created.text

        (returning,) = post_frame("/api/vision/recognize", cv2.flip(a.bgr, 1))["faces"]
        assert returning["status"] == "matched" and returning["personId"] == person_id
        (stranger,) = post_frame("/api/vision/recognize", b.bgr)["faces"]
        assert stranger["status"] == "unknown" and stranger["personId"] is None

        assert client.delete(f"/api/people/{person_id}").status_code == 200
        (forgotten,) = post_frame("/api/vision/recognize", a.bgr)["faces"]
        assert forgotten["status"] == "unknown"
