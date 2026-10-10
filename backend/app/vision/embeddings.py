"""Embedding validation shared by storage and recognition (owner: Bhavya).

Arnav's repository calls these before persisting or after loading vectors.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from app.contracts import (
    EMBEDDING_NORM_TOLERANCE,
    MAX_ENROLLMENT_SAMPLES,
    MIN_ENROLLMENT_SAMPLES,
    ApiError,
    ErrorCode,
    FaceModel,
)
from app.vision.thresholds import (
    ENROLL_MIN_CENTROID_SIMILARITY,
    ENROLL_MIN_PAIRWISE_SIMILARITY,
)


def as_embedding_array(vector: Sequence[float], dimension: int) -> np.ndarray:
    """Return a float32 copy, or raise ApiError(EMBEDDING_INVALID)."""
    try:
        array = np.asarray(vector, dtype=np.float64)
    except (TypeError, ValueError) as exc:
        raise ApiError(ErrorCode.EMBEDDING_INVALID, "Embedding must be numeric.") from exc
    if array.ndim != 1 or array.size == 0:
        raise ApiError(ErrorCode.EMBEDDING_INVALID, "Embedding must be a non-empty vector.")
    if array.size != dimension:
        raise ApiError(
            ErrorCode.EMBEDDING_INVALID,
            f"Embedding has {array.size} values; expected {dimension}.",
        )
    if not np.isfinite(array).all():
        raise ApiError(ErrorCode.EMBEDDING_INVALID, "Embedding contains non-finite values.")
    norm = float(np.linalg.norm(array))
    if abs(norm - 1.0) > EMBEDDING_NORM_TOLERANCE:
        raise ApiError(
            ErrorCode.EMBEDDING_INVALID, f"Embedding is not L2-normalized (norm {norm:.4f})."
        )
    return array.astype(np.float32)


def validate_embedding(vector: Sequence[float], model: FaceModel, expected: FaceModel) -> None:
    """Reject nonfinite, empty, wrong-size, non-normalized, or mismatched-model vectors.

    Raises ApiError(MODEL_MISMATCH) when ``model != expected`` and
    ApiError(EMBEDDING_INVALID) for a bad vector.
    """
    if model != expected:
        raise ApiError(
            ErrorCode.MODEL_MISMATCH,
            "Embedding was produced by a different face model; re-enrollment is required.",
        )
    as_embedding_array(vector, expected.dimension)


def check_enrollment_coherence(embeddings: Sequence[Sequence[float]], model: FaceModel) -> None:
    """Reject sample sets that do not look like one person.

    Raises ApiError(ENROLLMENT_INCOHERENT) (or EMBEDDING_INVALID for bad vectors).
    """
    if not MIN_ENROLLMENT_SAMPLES <= len(embeddings) <= MAX_ENROLLMENT_SAMPLES:
        raise ApiError(
            ErrorCode.ENROLLMENT_INCOHERENT,
            f"Enrollment needs {MIN_ENROLLMENT_SAMPLES}-{MAX_ENROLLMENT_SAMPLES} samples.",
        )
    matrix = np.stack([as_embedding_array(v, model.dimension) for v in embeddings])
    pairwise = matrix @ matrix.T
    np.fill_diagonal(pairwise, 1.0)
    if float(pairwise.min()) < ENROLL_MIN_PAIRWISE_SIMILARITY:
        raise ApiError(
            ErrorCode.ENROLLMENT_INCOHERENT,
            "Samples do not look like the same person. Recapture with one visitor.",
        )
    centroid = matrix.mean(axis=0)
    centroid /= np.linalg.norm(centroid)
    if float((matrix @ centroid).min()) < ENROLL_MIN_CENTROID_SIMILARITY:
        raise ApiError(
            ErrorCode.ENROLLMENT_INCOHERENT,
            "One sample differs too much from the others. Recapture it.",
        )
