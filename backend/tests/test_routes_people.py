"""HTTP behaviour of people/conversation/health/vision transport (owner: Arnav).

Uses the conftest ``client`` (tmp_path database). ``StubEngine`` stands in for
Bhavya's FaceEngine only to supply model metadata and gallery plumbing; it is not
recognition and proves nothing about the real engine.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.contracts import (
    MAX_FRAME_BYTES,
    REQUEST_ID_HEADER,
    ConversationResponse,
    DeletedPersonResponse,
    ErrorEnvelope,
    FrameResult,
    FrameStatus,
    HealthResponse,
    PeopleListResponse,
    PersonDetailResponse,
    PersonResponse,
)
from app.db import repository
from app.vision import embeddings
from tests.db_support import (
    TEST_MODEL,
    conversation_request,
    person_request,
    use_vision_stand_ins,
)


class StubEngine:
    model = TEST_MODEL

    def __init__(self) -> None:
        self.galleries = []

    def recognize(self, image, gallery):
        self.galleries.append(gallery)
        return FrameResult(status=FrameStatus.NO_FACE, frame_width=1, frame_height=1)


@pytest.fixture
def vision_stand_ins(monkeypatch) -> None:
    use_vision_stand_ins(monkeypatch)


@pytest.fixture
def engine(client) -> StubEngine:
    stub = StubEngine()
    client.app.state.face_engine = stub
    return stub


def _error(response, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    body = ErrorEnvelope.model_validate(response.json())
    assert body.error.code == code
    assert response.headers[REQUEST_ID_HEADER] == body.request_id


def _create(client, **kwargs):
    request = person_request(**kwargs)
    return request, client.post("/api/people", json=request.model_dump(mode="json"))


def test_repository_uses_real_vision_helpers() -> None:
    assert repository.validate_embedding is embeddings.validate_embedding
    assert repository.check_enrollment_coherence is embeddings.check_enrollment_coherence


def test_health_reports_ready_database(client) -> None:
    body = HealthResponse.model_validate(client.get("/api/health").json())
    assert body.data.database.ready is True
    assert body.data.database.detail is None
    assert body.data.vision.ready is False


def test_health_reports_storage_failure(client) -> None:
    client.app.state.database._initialized = False
    client.app.state.database_error = "disk unavailable"
    body = HealthResponse.model_validate(client.get("/api/health").json())
    assert body.data.database.ready is False
    assert body.data.database.detail == "disk unavailable"


def test_people_routes_work_without_vision(client) -> None:
    body = PeopleListResponse.model_validate(client.get("/api/people").json())
    assert body.data.people == []
    _error(client.get(f"/api/people/{uuid4()}"), 404, "NOT_FOUND")
    _error(client.delete(f"/api/people/{uuid4()}"), 404, "NOT_FOUND")


def test_create_person_needs_engine(client) -> None:
    _, response = _create(client)
    _error(response, 503, "MODEL_UNAVAILABLE")


def test_create_person_uses_real_vision_helpers(client, engine) -> None:
    # Real Bhavya helpers (integration): unrelated vectors are refused, and nothing is saved.
    _, response = _create(client)
    _error(response, 422, "ENROLLMENT_INCOHERENT")
    assert PeopleListResponse.model_validate(client.get("/api/people").json()).data.people == []


@pytest.mark.usefixtures("vision_stand_ins")
def test_person_lifecycle(client, engine) -> None:
    request, response = _create(client)
    assert response.status_code == 201, response.text
    person = PersonResponse.model_validate(response.json()).data.person

    retry = client.post("/api/people", json=request.model_dump(mode="json"))
    assert retry.status_code == 201
    assert PersonResponse.model_validate(retry.json()).data.person == person

    conflict = person_request(person_id=request.person_id, name="Someone Else")
    _error(client.post("/api/people", json=conflict.model_dump(mode="json")), 409, "CONFLICT")

    detail = PersonDetailResponse.model_validate(client.get(f"/api/people/{person.id}").json())
    assert detail.data.conversations == []
    assert detail.data.latest_cue is None

    convo = conversation_request(person.id)
    saved = client.post("/api/conversations", json=convo.model_dump(mode="json"))
    assert saved.status_code == 201, saved.text
    conversation = ConversationResponse.model_validate(saved.json()).data.conversation
    again = client.post("/api/conversations", json=convo.model_dump(mode="json"))
    assert ConversationResponse.model_validate(again.json()).data.conversation == conversation

    detail = PersonDetailResponse.model_validate(client.get(f"/api/people/{person.id}").json())
    assert detail.data.latest_cue == convo.memory.cue

    deleted = DeletedPersonResponse.model_validate(
        client.delete(f"/api/people/{person.id}").json()
    )
    assert deleted.data.deleted_person_id == person.id
    _error(client.get(f"/api/people/{person.id}"), 404, "NOT_FOUND")


@pytest.mark.usefixtures("vision_stand_ins")
def test_model_mismatch_is_409(client, engine) -> None:
    other = TEST_MODEL.model_copy(update={"recognition_sha256": "c" * 64})
    _, response = _create(client, model=other)
    _error(response, 409, "MODEL_MISMATCH")


def test_conversation_validation_and_unknown_person(client) -> None:
    convo = conversation_request(uuid4()).model_dump(mode="json")
    _error(client.post("/api/conversations", json=convo), 404, "NOT_FOUND")
    backwards = {**convo, "endedAt": "2026-10-10T14:00:00Z"}
    _error(client.post("/api/conversations", json=backwards), 422, "VALIDATION_ERROR")


def test_storage_failure_is_503(client) -> None:
    client.app.state.database._initialized = False
    _error(client.get("/api/people"), 503, "STORAGE_ERROR")


@pytest.mark.usefixtures("vision_stand_ins")
def test_recognize_passes_cached_gallery_and_refreshes_after_changes(
    client, engine, monkeypatch
) -> None:
    from app.routes import vision as vision_routes

    # decode_jpeg is Bhavya's (still a placeholder); bypass it to exercise transport only.
    monkeypatch.setattr(vision_routes, "decode_jpeg", lambda data: object())
    frame = {"frame": ("f.jpg", b"\xff\xd8 not decoded here", "image/jpeg")}

    assert client.post("/api/vision/recognize", files=frame).status_code == 200
    _, created = _create(client)
    person_id = PersonResponse.model_validate(created.json()).data.person.id
    client.post("/api/vision/recognize", files=frame)
    client.delete(f"/api/people/{person_id}")
    client.post("/api/vision/recognize", files=frame)

    assert [len(g.entries) for g in engine.galleries] == [0, 1, 0]
    assert all(g.model == TEST_MODEL for g in engine.galleries)


def test_recognize_rejects_empty_and_oversized_frames(client, engine) -> None:
    empty = {"frame": ("f.jpg", b"", "image/jpeg")}
    _error(client.post("/api/vision/recognize", files=empty), 400, "BAD_REQUEST")
    big = {"frame": ("f.jpg", b"\xff" * (MAX_FRAME_BYTES + 1), "image/jpeg")}
    _error(client.post("/api/vision/recognize", files=big), 413, "PAYLOAD_TOO_LARGE")
    _error(client.post("/api/vision/enrollment-sample", files=big), 413, "PAYLOAD_TOO_LARGE")
    _error(client.post("/api/vision/recognize"), 422, "VALIDATION_ERROR")
