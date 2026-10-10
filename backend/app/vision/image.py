"""JPEG decoding and validation (owner: Bhavya)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.contracts import not_implemented


@dataclass(frozen=True)
class DecodedImage:
    bgr: np.ndarray  # HxWx3 uint8, unmirrored, as submitted
    width: int
    height: int


def decode_jpeg(data: bytes) -> DecodedImage:
    """Decode and validate JPEG bytes (magic bytes, decodability, longest edge
    <= MAX_FRAME_LONGEST_EDGE). Raises ApiError(INVALID_IMAGE) on bad input."""
    raise not_implemented("JPEG decoding")
