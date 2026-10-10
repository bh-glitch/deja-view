from __future__ import annotations

import numpy as np
import pytest

from app.contracts import ApiError, ErrorCode
from app.vision.embeddings import check_enrollment_coherence, validate_embedding
from tests.vision_helpers import MODEL, OTHER_MODEL, near, random_unit


@pytest.fixture
def rng() -> np.random.Generator:
    return np.random.default_rng(7)


def test_accepts_normalized_vector(rng) -> None:
    validate_embedding(random_unit(rng).tolist(), MODEL, MODEL)


@pytest.mark.parametrize(
    "vector",
    [
        [],
        [0.1] * 511,
        [1.0] + [0.0] * 510 + [float("nan")],
        [1.0] * 512,  # not normalized
    ],
)
def test_rejects_invalid_vectors(vector) -> None:
    with pytest.raises(ApiError) as info:
        validate_embedding(vector, MODEL, MODEL)
    assert info.value.code == ErrorCode.EMBEDDING_INVALID


def test_rejects_model_mismatch(rng) -> None:
    with pytest.raises(ApiError) as info:
        validate_embedding(random_unit(rng).tolist(), OTHER_MODEL, MODEL)
    assert info.value.code == ErrorCode.MODEL_MISMATCH


def test_coherent_samples_pass(rng) -> None:
    base = random_unit(rng)
    samples = [near(base, 0.8, rng).tolist() for _ in range(4)]
    check_enrollment_coherence(samples, MODEL)


def test_mixed_people_rejected(rng) -> None:
    alex, sam = random_unit(rng), random_unit(rng)
    samples = [near(alex, 0.85, rng).tolist() for _ in range(3)] + [sam.tolist()]
    with pytest.raises(ApiError) as info:
        check_enrollment_coherence(samples, MODEL)
    assert info.value.code == ErrorCode.ENROLLMENT_INCOHERENT


@pytest.mark.parametrize("count", [2, 6])
def test_sample_count_bounds(rng, count) -> None:
    base = random_unit(rng)
    with pytest.raises(ApiError) as info:
        check_enrollment_coherence([base.tolist()] * count, MODEL)
    assert info.value.code == ErrorCode.ENROLLMENT_INCOHERENT
