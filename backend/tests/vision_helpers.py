"""Synthetic vectors for vision unit tests (no real face data)."""

from __future__ import annotations

import numpy as np

from app.contracts import FaceModel

MODEL = FaceModel(
    pack_name="buffalo_l",
    recognition_file="w600k_r50.onnx",
    recognition_sha256="0" * 64,
    dimension=512,
    normalization="l2",
)
OTHER_MODEL = MODEL.model_copy(update={"recognition_sha256": "1" * 64})


def unit(vector: np.ndarray) -> np.ndarray:
    return (vector / np.linalg.norm(vector)).astype(np.float32)


def random_unit(rng: np.random.Generator, dim: int = 512) -> np.ndarray:
    return unit(rng.standard_normal(dim))


def near(base: np.ndarray, similarity: float, rng: np.random.Generator) -> np.ndarray:
    """Unit vector with the given cosine similarity to unit vector ``base``."""
    noise = rng.standard_normal(base.size)
    noise -= noise.dot(base) * base
    noise = unit(noise)
    return unit(similarity * base + np.sqrt(1 - similarity**2) * noise)
