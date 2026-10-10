"""Grounded memory drafts (owner: Vansh). Never saves conversations."""

from __future__ import annotations

from app.config import Settings
from app.contracts import MemoryDraft, not_implemented


async def draft_memory(settings: Settings, transcript: str) -> MemoryDraft:
    """Summarize supported details only; every evidenceQuote is a literal transcript substring."""
    raise not_implemented("Memory drafting")
