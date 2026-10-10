"""Person/conversation persistence (owner: Arnav).

All functions are synchronous; routes call them via ``run_in_threadpool``.
Mutations are idempotent by client-allocated ID: same ID + same normalized
request returns the original record; same ID + different request raises
ApiError(CONFLICT).
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import numpy as np
from pydantic import BaseModel, ValidationError

from app.contracts import (
    ApiError,
    Conversation,
    CreateConversationRequest,
    CreatePersonRequest,
    ErrorCode,
    FaceModel,
    MemoryDraft,
    Person,
    PersonDetail,
)
from app.db.database import Database
from app.vision.embeddings import check_enrollment_coherence, validate_embedding
from app.vision.gallery import Gallery, GalleryEntry

_PERSON_COLUMNS = "id, display_name, relationship, created_at, updated_at, request_hash"
_CONVERSATION_COLUMNS = (
    "id, person_id, started_at, ended_at, transcript, source, memory_json, "
    "edited_by_user, created_at, request_hash"
)


# ---------------------------------------------------------------------------
# Encoding helpers
# ---------------------------------------------------------------------------


def _timestamp(value: datetime) -> str:
    """Fixed-width UTC text, so SQL string ordering equals time ordering."""
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _now() -> str:
    return _timestamp(datetime.now(UTC))


def _request_hash(request: BaseModel) -> str:
    """Hash of the validated (trimmed, UTC-normalized) request for idempotency checks."""
    canonical = json.dumps(
        request.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), allow_nan=False
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _corrupt(what: str, exc: Exception) -> ApiError:
    return ApiError(ErrorCode.STORAGE_ERROR, f"Stored {what} failed validation: {exc}")


def _person_from_row(row: sqlite3.Row) -> Person:
    try:
        return Person.model_validate(
            {
                "id": row["id"],
                "displayName": row["display_name"],
                "relationship": row["relationship"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
        )
    except ValidationError as exc:
        raise _corrupt("person", exc) from exc


def _conversation_from_row(row: sqlite3.Row) -> Conversation:
    try:
        return Conversation.model_validate(
            {
                "id": row["id"],
                "personId": row["person_id"],
                "startedAt": row["started_at"],
                "endedAt": row["ended_at"],
                "transcript": row["transcript"],
                "source": row["source"],
                "memory": MemoryDraft.model_validate_json(row["memory_json"]),
                "reviewedByUser": True,
                "editedByUser": bool(row["edited_by_user"]),
                "createdAt": row["created_at"],
            }
        )
    except ValidationError as exc:
        raise _corrupt("conversation", exc) from exc


def _model_from_row(row: sqlite3.Row) -> FaceModel:
    try:
        return FaceModel.model_validate(
            {
                "packName": row["pack_name"],
                "recognitionFile": row["recognition_file"],
                "recognitionSha256": row["recognition_sha256"],
                "dimension": row["dimension"],
                "normalization": row["normalization"],
            }
        )
    except ValidationError as exc:
        raise _corrupt("face model metadata", exc) from exc


def _embedding_from_json(text: str) -> list[float]:
    try:
        value: Any = json.loads(text)
    except json.JSONDecodeError as exc:
        raise _corrupt("embedding", exc) from exc
    if not isinstance(value, list) or not all(
        isinstance(item, int | float) and not isinstance(item, bool) for item in value
    ):
        raise ApiError(ErrorCode.STORAGE_ERROR, "Stored embedding is not a list of numbers.")
    return [float(item) for item in value]


# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------


def list_people(db: Database) -> list[Person]:
    with db.transaction() as conn:
        rows = conn.execute(
            f"SELECT {_PERSON_COLUMNS} FROM people ORDER BY created_at, id"
        ).fetchall()
    return [_person_from_row(row) for row in rows]


def create_person(db: Database, request: CreatePersonRequest, expected_model: FaceModel) -> Person:
    """Validate vectors via app.vision.embeddings, then insert person + samples atomically."""
    for vector in request.embeddings:
        validate_embedding(vector, request.model, expected_model)
    check_enrollment_coherence(request.embeddings, request.model)

    person_id = str(request.person_id)
    request_hash = _request_hash(request)
    model = request.model
    with db.transaction() as conn:
        existing = conn.execute(
            f"SELECT {_PERSON_COLUMNS} FROM people WHERE id = ?", (person_id,)
        ).fetchone()
        if existing is not None:
            if existing["request_hash"] != request_hash:
                raise ApiError(
                    ErrorCode.CONFLICT,
                    "personId was already used for a different enrollment request.",
                )
            return _person_from_row(existing)

        now = _now()
        conn.execute(
            f"INSERT INTO people ({_PERSON_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)",
            (person_id, request.display_name, request.relationship, now, now, request_hash),
        )
        conn.executemany(
            "INSERT INTO face_samples (person_id, sample_index, embedding_json, pack_name, "
            "recognition_file, recognition_sha256, dimension, normalization) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    person_id,
                    index,
                    json.dumps(list(vector), allow_nan=False),
                    model.pack_name,
                    model.recognition_file,
                    model.recognition_sha256,
                    model.dimension,
                    model.normalization,
                )
                for index, vector in enumerate(request.embeddings)
            ],
        )
        row = conn.execute(
            f"SELECT {_PERSON_COLUMNS} FROM people WHERE id = ?", (person_id,)
        ).fetchone()
    return _person_from_row(row)


def get_person_detail(db: Database, person_id: UUID) -> PersonDetail:
    """Raises ApiError(NOT_FOUND)."""
    with db.transaction() as conn:
        person_row = conn.execute(
            f"SELECT {_PERSON_COLUMNS} FROM people WHERE id = ?", (str(person_id),)
        ).fetchone()
        if person_row is None:
            raise ApiError(ErrorCode.NOT_FOUND, "Person not found.")
        conversation_rows = conn.execute(
            f"SELECT {_CONVERSATION_COLUMNS} FROM conversations WHERE person_id = ? "
            "ORDER BY ended_at DESC, created_at DESC, id DESC",
            (str(person_id),),
        ).fetchall()
    conversations = [_conversation_from_row(row) for row in conversation_rows]
    return PersonDetail(
        person=_person_from_row(person_row),
        conversations=conversations,
        latest_cue=conversations[0].memory.cue if conversations else None,
    )


def delete_person(db: Database, person_id: UUID) -> None:
    """Cascade-delete samples and conversations. Raises ApiError(NOT_FOUND)."""
    with db.transaction() as conn:
        cursor = conn.execute("DELETE FROM people WHERE id = ?", (str(person_id),))
        if cursor.rowcount == 0:
            raise ApiError(ErrorCode.NOT_FOUND, "Person not found.")


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------


def create_conversation(db: Database, request: CreateConversationRequest) -> Conversation:
    """Raises ApiError(NOT_FOUND) for an unknown person, CONFLICT on ID reuse mismatch."""
    conversation_id = str(request.conversation_id)
    request_hash = _request_hash(request)
    with db.transaction() as conn:
        existing = conn.execute(
            f"SELECT {_CONVERSATION_COLUMNS} FROM conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
        if existing is not None:
            if existing["request_hash"] != request_hash:
                raise ApiError(
                    ErrorCode.CONFLICT,
                    "conversationId was already used for a different conversation.",
                )
            return _conversation_from_row(existing)

        person = conn.execute(
            "SELECT 1 FROM people WHERE id = ?", (str(request.person_id),)
        ).fetchone()
        if person is None:
            raise ApiError(ErrorCode.NOT_FOUND, "Person not found.")

        conn.execute(
            f"INSERT INTO conversations ({_CONVERSATION_COLUMNS}) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                conversation_id,
                str(request.person_id),
                _timestamp(request.started_at),
                _timestamp(request.ended_at),
                request.transcript,
                request.source.value,
                request.memory.model_dump_json(),
                int(request.edited_by_user),
                _now(),
                request_hash,
            ),
        )
        row = conn.execute(
            f"SELECT {_CONVERSATION_COLUMNS} FROM conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
    return _conversation_from_row(row)


# ---------------------------------------------------------------------------
# Gallery
# ---------------------------------------------------------------------------


def load_gallery(db: Database, model: FaceModel) -> Gallery:
    """Load validated embeddings for ``model`` only; never mix model identities."""
    with db.transaction() as conn:
        rows = conn.execute(
            "SELECT s.person_id, s.embedding_json, s.pack_name, s.recognition_file, "
            "s.recognition_sha256, s.dimension, s.normalization "
            "FROM face_samples s JOIN people p ON p.id = s.person_id "
            "WHERE s.pack_name = ? AND s.recognition_file = ? AND s.recognition_sha256 = ? "
            "AND s.dimension = ? AND s.normalization = ? "
            "ORDER BY p.created_at, p.id, s.sample_index",
            (
                model.pack_name,
                model.recognition_file,
                model.recognition_sha256,
                model.dimension,
                model.normalization,
            ),
        ).fetchall()

    grouped: dict[str, list[list[float]]] = {}
    for row in rows:
        vector = _embedding_from_json(row["embedding_json"])
        try:
            validate_embedding(vector, _model_from_row(row), model)
        except ApiError as exc:
            if exc.code in (ErrorCode.EMBEDDING_INVALID, ErrorCode.MODEL_MISMATCH):
                raise ApiError(
                    ErrorCode.STORAGE_ERROR, f"Stored embedding failed validation: {exc.message}"
                ) from exc
            raise
        grouped.setdefault(row["person_id"], []).append(vector)

    return Gallery(
        model=model,
        entries=tuple(
            GalleryEntry(person_id=UUID(person_id), embeddings=np.asarray(vectors, np.float32))
            for person_id, vectors in grouped.items()
        ),
    )
