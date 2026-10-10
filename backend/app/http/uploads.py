"""Bounded multipart upload reading (owner: Arnav; signatures frozen by Bhavya).

Size limits are enforced here; image/audio *content* is validated by the vision
and speech modules, never by trusting the declared MIME type alone.
"""

from __future__ import annotations

from fastapi import UploadFile

from app.contracts import ApiError, ErrorCode

_CHUNK = 64 * 1024


async def read_bounded_upload(upload: UploadFile, max_bytes: int, *, field: str) -> bytes:
    """Read an uploaded file, rejecting empty or oversized content."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(_CHUNK):
        total += len(chunk)
        if total > max_bytes:
            raise ApiError(
                ErrorCode.PAYLOAD_TOO_LARGE, f"'{field}' exceeds the {max_bytes}-byte limit."
            )
        chunks.append(chunk)
    if total == 0:
        raise ApiError(ErrorCode.BAD_REQUEST, f"'{field}' is empty.")
    return b"".join(chunks)
