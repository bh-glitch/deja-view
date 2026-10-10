"""Embedding validation shared by storage and recognition (owner: Bhavya).

Arnav's repository calls these before persisting or after loading vectors.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.contracts import FaceModel, not_implemented


def validate_embedding(vector: Sequence[float], model: FaceModel, expected: FaceModel) -> None:
    """Reject nonfinite, empty, wrong-size, non-normalized, or mismatched-model vectors.

    Raises ApiError(MODEL_MISMATCH) when ``model != expected`` and
    ApiError(EMBEDDING_INVALID) for a bad vector.
    """
    raise not_implemented("Embedding validation")


def check_enrollment_coherence(embeddings: Sequence[Sequence[float]], model: FaceModel) -> None:
    """Reject sample sets that do not look like one person.

    Raises ApiError(ENROLLMENT_INCOHERENT).
    """
    raise not_implemented("Enrollment coherence check")
