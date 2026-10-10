"""Shared helpers for Arnav's data/API tests. Every database lives under tmp_path.

``app.vision.embeddings`` (Bhavya) still raises NOT_IMPLEMENTED. Until it lands,
tests that need saved people patch in ``strict_validate_embedding`` and
``accept_coherence`` below: synthetic test stand-ins that apply the documented
rules (model equality, finite, right size, L2-normalized). They are not the real
helpers and do not prove Bhavya's behaviour;
``test_routes_people.py::test_repository_uses_real_vision_helpers`` checks that
production code still routes through the real module.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import numpy as np
import pytest

from app.contracts import (
    ApiError,
    CreateConversationRequest,
    CreatePersonRequest,
    ErrorCode,
    FaceModel,
)
from app.db import repository
from app.db.database import Database

DIM = 512

TEST_MODEL = FaceModel(
    pack_name="buffalo_l",
    recognition_file="w600k_r50.onnx",
    recognition_sha256="a" * 64,
    dimension=DIM,
    normalization="l2",
)
OTHER_MODEL = TEST_MODEL.model_copy(update={"recognition_sha256": "b" * 64})


def strict_validate_embedding(
    vector: Sequence[float], model: FaceModel, expected: FaceModel
) -> None:
    if model != expected:
        raise ApiError(ErrorCode.MODEL_MISMATCH, "model mismatch (test stand-in)")
    if len(vector) != expected.dimension or not all(math.isfinite(v) for v in vector):
        raise ApiError(ErrorCode.EMBEDDING_INVALID, "bad vector (test stand-in)")
    if abs(math.sqrt(sum(v * v for v in vector)) - 1.0) > 1e-3:
        raise ApiError(ErrorCode.EMBEDDING_INVALID, "not normalized (test stand-in)")


def accept_coherence(embeddings: Sequence[Sequence[float]], model: FaceModel) -> None:
    return None


def use_vision_stand_ins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repository, "validate_embedding", strict_validate_embedding)
    monkeypatch.setattr(repository, "check_enrollment_coherence", accept_coherence)


def make_db(tmp_path: Path) -> Database:
    database = Database(tmp_path / "test-fixture.db")
    database.initialize()
    return database


def unit_vectors(count: int, seed: int) -> list[list[float]]:
    rng = np.random.default_rng(seed)
    raw = rng.normal(size=(count, DIM))
    raw /= np.linalg.norm(raw, axis=1, keepdims=True)
    return [[float(x) for x in row] for row in raw]


def person_request(
    *, person_id: UUID | None = None, name: str = "Alex Demo", seed: int = 1, **extra
) -> CreatePersonRequest:
    return CreatePersonRequest(
        person_id=person_id or uuid4(),
        display_name=name,
        relationship=extra.pop("relationship", "Friend from robotics club"),
        model=extra.pop("model", TEST_MODEL),
        embeddings=extra.pop("embeddings", unit_vectors(3, seed)),
        **extra,
    )


BASE_TIME = datetime(2026, 10, 10, 15, 0, tzinfo=UTC)


def conversation_request(
    person_id: UUID,
    *,
    conversation_id: UUID | None = None,
    end_offset_minutes: int = 5,
    cue: str = "Ask how the robot arm demo went.",
    transcript: str = "We talked about the robot arm demo.",
) -> CreateConversationRequest:
    return CreateConversationRequest.model_validate(
        {
            "conversationId": str(conversation_id or uuid4()),
            "personId": str(person_id),
            "startedAt": BASE_TIME.isoformat(),
            "endedAt": (BASE_TIME + timedelta(minutes=end_offset_minutes)).isoformat(),
            "transcript": transcript,
            "source": "typed",
            "memory": {"summary": "Talked about the robot arm.", "cue": cue, "facts": []},
            "reviewedByUser": True,
            "editedByUser": False,
        }
    )
