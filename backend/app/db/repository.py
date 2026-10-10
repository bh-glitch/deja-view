"""Person/conversation persistence (owner: Arnav).

All functions are synchronous; routes call them via ``run_in_threadpool``.
Mutations are idempotent by client-allocated ID: same ID + same normalized
request returns the original record; same ID + different request raises
ApiError(CONFLICT).
"""

from __future__ import annotations

from uuid import UUID

from app.contracts import (
    Conversation,
    CreateConversationRequest,
    CreatePersonRequest,
    FaceModel,
    Person,
    PersonDetail,
    not_implemented,
)
from app.db.database import Database
from app.vision.gallery import Gallery


def list_people(db: Database) -> list[Person]:
    raise not_implemented("Listing people")


def create_person(db: Database, request: CreatePersonRequest, expected_model: FaceModel) -> Person:
    """Validate vectors via app.vision.embeddings, then insert person + samples atomically."""
    raise not_implemented("Creating people")


def get_person_detail(db: Database, person_id: UUID) -> PersonDetail:
    """Raises ApiError(NOT_FOUND)."""
    raise not_implemented("Reading person detail")


def delete_person(db: Database, person_id: UUID) -> None:
    """Cascade-delete samples and conversations. Raises ApiError(NOT_FOUND)."""
    raise not_implemented("Deleting people")


def create_conversation(db: Database, request: CreateConversationRequest) -> Conversation:
    """Raises ApiError(NOT_FOUND) for an unknown person, CONFLICT on ID reuse mismatch."""
    raise not_implemented("Saving conversations")


def load_gallery(db: Database, model: FaceModel) -> Gallery:
    """Load validated embeddings for ``model`` only; never mix model identities."""
    raise not_implemented("Loading the face gallery")
