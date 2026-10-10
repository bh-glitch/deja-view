"""Evidence grounding helpers for AI drafts (owner: Vansh)."""

from __future__ import annotations


def find_literal(transcript: str, quote: str | None) -> str | None:
    """Return ``quote`` as it literally appears in ``transcript``, else None.

    An exact match wins. A case-insensitive match is accepted only when it maps to a
    span of the same length, and the transcript's own text is returned, so evidence
    is always a true substring of the original transcript.
    """
    if not quote:
        return None
    quote = quote.strip()
    if not quote:
        return None
    if quote in transcript:
        return quote
    lowered = transcript.lower()
    if len(lowered) != len(transcript):
        return None
    start = lowered.find(quote.lower())
    if start < 0:
        return None
    return transcript[start : start + len(quote)]
