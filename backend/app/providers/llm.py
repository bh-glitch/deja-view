"""Pick the configured AI provider for structured drafts (owner: Vansh).

``AI_PROVIDER=ollama`` runs a local model (no quota, the transcript stays on the
laptop); ``AI_PROVIDER=gemini`` uses the Gemini API. The choice is explicit and is
reported to the UI, never swapped silently.
"""

from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel

from app.config import Settings
from app.providers import gemini, ollama

ModelT = TypeVar("ModelT", bound=BaseModel)

PROVIDER_HEADER = "X-AI-Provider"


def provider_label(settings: Settings) -> str:
    """e.g. "ollama:qwen3.5:4b-q4_K_M" or "gemini:gemini-3.8-flash"."""
    if settings.ai_provider == "ollama":
        return f"ollama:{settings.ollama_model}"
    return f"gemini:{settings.gemini_model}"


async def generate_structured(
    settings: Settings, system_instruction: str, transcript: str, schema: type[ModelT]
) -> ModelT:
    if settings.ai_provider == "ollama":
        return await ollama.generate_structured(settings, system_instruction, transcript, schema)
    return await gemini.generate_structured(settings, system_instruction, transcript, schema)
