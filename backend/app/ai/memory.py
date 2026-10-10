"""Grounded memory drafts (owner: Vansh). Never saves conversations."""

from __future__ import annotations

from pydantic import BaseModel

from app.ai.grounding import find_literal
from app.config import Settings
from app.contracts import (
    MAX_CUE_CHARS,
    MAX_EVIDENCE_CHARS,
    MAX_FACT_CHARS,
    MAX_FACTS,
    MAX_SUMMARY_CHARS,
    ApiError,
    ErrorCode,
    MemoryDraft,
    MemoryFact,
)
from app.providers import llm

SYSTEM_INSTRUCTION = f"""\
The app user has face blindness. They just had a short conversation with a familiar person,
and it was transcribed (speakers are not labeled). Write what will help the user recognize
this person and pick up the conversation the next time they meet.

cue: one or two short sentences (at most {MAX_CUE_CHARS} characters) addressed to the user,
for example "Last time you talked about her trip to Lisbon. You both love jazz." Prefer
concrete topics, plans, news, and interests you both share. It must be a hint about what
was said, never a guess about who the person is.
summary: a neutral summary of the conversation (at most {MAX_SUMMARY_CHARS} characters).
facts: up to {MAX_FACTS} memorable details. Each has text (at most {MAX_FACT_CHARS}
characters) and evidenceQuote, a span copied character-for-character from the transcript
that supports it.

Use only what the transcript says. Never invent names, relationships, feelings or details.
When it is unclear who said something, use neutral wording ("you talked about ...").
hasMemorableContent: false when there is nothing worth remembering (silence, noise, only
greetings, or unintelligible speech); then leave summary and cue empty and facts empty."""


class MemoryFactOutput(BaseModel):
    text: str
    evidenceQuote: str


class MemoryOutput(BaseModel):
    """Provider-side schema; mapped to the wire MemoryDraft only after grounding."""

    hasMemorableContent: bool
    summary: str
    cue: str
    facts: list[MemoryFactOutput]


NOTHING_TO_REMEMBER = "Nothing memorable was heard. Record again or type a note."


def _clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:")
    return f"{cut}…"


def ground_memory(transcript: str, output: MemoryOutput) -> MemoryDraft:
    """Keep only facts with a literal transcript quote; refuse a memory with no support."""
    if not output.hasMemorableContent:
        raise ApiError(ErrorCode.EMPTY_TRANSCRIPT, NOTHING_TO_REMEMBER)

    facts: list[MemoryFact] = []
    for fact in output.facts:
        quote = find_literal(transcript, fact.evidenceQuote)
        text = _clip(fact.text, MAX_FACT_CHARS)
        if quote is None or len(quote) > MAX_EVIDENCE_CHARS or not text:
            continue
        facts.append(MemoryFact(text=text, evidence_quote=quote))
        if len(facts) == MAX_FACTS:
            break

    summary = _clip(output.summary, MAX_SUMMARY_CHARS)
    cue = _clip(output.cue, MAX_CUE_CHARS)
    # A cue with no quotable support in the transcript is not a grounded memory.
    if not facts or not summary or not cue:
        raise ApiError(ErrorCode.EMPTY_TRANSCRIPT, NOTHING_TO_REMEMBER)
    return MemoryDraft(summary=summary, cue=cue, facts=facts)


async def draft_memory(settings: Settings, transcript: str) -> MemoryDraft:
    """Summarize supported details only; every evidenceQuote is a literal transcript substring."""
    output = await llm.generate_structured(settings, SYSTEM_INSTRUCTION, transcript, MemoryOutput)
    return ground_memory(transcript, output)
