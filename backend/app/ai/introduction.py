"""Self-introduction parsing (owner: Vansh). Never saves people."""

from __future__ import annotations

from app.config import Settings
from app.contracts import IntroductionDraft, not_implemented


async def draft_introduction(settings: Settings, transcript: str) -> IntroductionDraft:
    """Extract an explicit self-introduction; evidence must occur in the transcript."""
    raise not_implemented("Introduction drafting")
