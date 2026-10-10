"""JPEG decoding and validation (owner: Bhavya)."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.contracts import MAX_FRAME_LONGEST_EDGE, ApiError, ErrorCode

_JPEG_MAGIC = b"\xff\xd8\xff"
# Start-of-frame markers carrying image dimensions (excludes DHT/JPG/DAC).
_SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
_STANDALONE_MARKERS = {0x01, *range(0xD0, 0xD9)}


@dataclass(frozen=True)
class DecodedImage:
    bgr: np.ndarray  # HxWx3 uint8, unmirrored, as submitted
    width: int
    height: int


def _invalid(message: str) -> ApiError:
    return ApiError(ErrorCode.INVALID_IMAGE, message)


def jpeg_dimensions(data: bytes) -> tuple[int, int]:
    """Read (width, height) from the JPEG header without decoding pixels."""
    if not data.startswith(_JPEG_MAGIC):
        raise _invalid("Frame is not a JPEG image.")
    i = 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            raise _invalid("Corrupt JPEG header.")
        marker = data[i + 1]
        if marker == 0xFF:  # fill byte
            i += 1
            continue
        if marker in _STANDALONE_MARKERS:
            i += 2
            continue
        length = int.from_bytes(data[i + 2 : i + 4], "big")
        if length < 2:
            raise _invalid("Corrupt JPEG header.")
        if marker in _SOF_MARKERS:
            if i + 9 > len(data):
                break
            height = int.from_bytes(data[i + 5 : i + 7], "big")
            width = int.from_bytes(data[i + 7 : i + 9], "big")
            return width, height
        if marker == 0xDA:  # start of scan before any frame header
            break
        i += 2 + length
    raise _invalid("JPEG has no frame header.")


def decode_jpeg(data: bytes) -> DecodedImage:
    """Decode and validate JPEG bytes (magic bytes, header dimensions checked before
    decoding, decodability, longest edge <= MAX_FRAME_LONGEST_EDGE).
    Raises ApiError(INVALID_IMAGE) on bad input."""
    width, height = jpeg_dimensions(data)
    if width <= 0 or height <= 0:
        raise _invalid("JPEG has invalid dimensions.")
    if max(width, height) > MAX_FRAME_LONGEST_EDGE:
        raise _invalid(
            f"Frame is {width}x{height}; the longest edge must be <= {MAX_FRAME_LONGEST_EDGE} px."
        )
    bgr = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if bgr is None or bgr.ndim != 3 or bgr.shape[2] != 3:
        raise _invalid("JPEG could not be decoded.")
    decoded_height, decoded_width = bgr.shape[:2]
    if (decoded_width, decoded_height) != (width, height):
        raise _invalid("JPEG dimensions do not match its header.")
    return DecodedImage(bgr=bgr, width=decoded_width, height=decoded_height)
