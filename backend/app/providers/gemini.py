"""Gemini structured generation via the official ``google-genai`` SDK (owner: Vansh).

The transcript is untrusted data, never instructions. Never send face imagery.
"""

from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel

from app.config import Settings
from app.contracts import not_implemented

ModelT = TypeVar("ModelT", bound=BaseModel)


async def generate_structured(
    settings: Settings, system_instruction: str, transcript: str, schema: type[ModelT]
) -> ModelT:
    """Return output validated as ``schema``; at most one bounded repair attempt.

    Raises ApiError(AI_OUTPUT_INVALID) or a PROVIDER_* error.
    """
    raise not_implemented("Gemini generation")
