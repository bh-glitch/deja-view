from __future__ import annotations

import cv2
import numpy as np
import pytest

from app.contracts import ApiError, ErrorCode
from app.vision.image import decode_jpeg, jpeg_dimensions


def _jpeg(width: int, height: int) -> bytes:
    ok, data = cv2.imencode(".jpg", np.full((height, width, 3), 100, np.uint8))
    assert ok
    return data.tobytes()


def test_decodes_valid_jpeg() -> None:
    image = decode_jpeg(_jpeg(640, 480))
    assert (image.width, image.height) == (640, 480)
    assert image.bgr.shape == (480, 640, 3)


def test_reads_dimensions_from_header() -> None:
    assert jpeg_dimensions(_jpeg(320, 200)) == (320, 200)


@pytest.mark.parametrize("width,height", [(1281, 10), (10, 1300)])
def test_rejects_oversized_frames_before_decoding(width: int, height: int) -> None:
    with pytest.raises(ApiError) as info:
        decode_jpeg(_jpeg(width, height))
    assert info.value.code == ErrorCode.INVALID_IMAGE


def test_accepts_longest_edge_at_limit() -> None:
    assert decode_jpeg(_jpeg(1280, 720)).width == 1280


@pytest.mark.parametrize(
    "data",
    [
        b"not an image",
        cv2.imencode(".png", np.zeros((10, 10, 3), np.uint8))[1].tobytes(),
        b"\xff\xd8\xff\xe0\x00",  # truncated header
    ],
)
def test_rejects_non_jpeg_or_corrupt(data: bytes) -> None:
    with pytest.raises(ApiError) as info:
        decode_jpeg(data)
    assert info.value.code == ErrorCode.INVALID_IMAGE


def test_rejects_corrupt_body() -> None:
    data = bytearray(_jpeg(64, 64))
    body = data[:200] + b"\x00" * (len(data) - 200)
    with pytest.raises(ApiError):
        decode_jpeg(bytes(body))
