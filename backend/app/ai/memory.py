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

# Short outputs on purpose: generation time dominates on a local model (a 60 s chat took
# ~28 s with a 500-character summary; see docs/provider-validation.md), and the UI shows
# just a few bullets (human decision 2026-10-10: "three bullet points, no repetition").
SUMMARY_TARGET_CHARS = 150
CUE_TARGET_CHARS = 120
FACT_TARGET_CHARS = 70
QUOTE_TARGET_CHARS = 120


def _safe_name(person_name: str | None) -> str | None:
    """A stored display name, reduced to one plain line so it cannot reshape the prompt."""
    if not person_name:
        return None
    name = " ".join(person_name.replace('"', "'").split())[:80]
    return name or None


def system_instruction(person_name: str | None = None) -> str:
    name = _safe_name(person_name)
    who = f'"{name}"' if name else "the familiar person"
    naming = (
        f"""The conversation was between the app user (write "you") and {who}. Always call
{who} by that name; never write "the speaker", "the listener", "the other person", "someone"
or "they" for them. Speakers are NOT labeled, so you often cannot tell who said a line. Write
"{name} …" only when the words make it clear the detail is about {name} (for example they
were addressed by name or said their own name); otherwise write "You and {name} …"."""
        if name
        else """Speakers are NOT labeled, so you do not know who said what. Write "you talked
about …" and never guess who owns or said something."""
    )
    return f"""\
The app user has face blindness. They just had a short conversation with a familiar person,
and it was transcribed. Write what will help the user pick up the conversation next time.
{naming}

cue: ONE short sentence (at most {CUE_TARGET_CHARS} characters) addressed to the user, for
example "Last time you and Maya talked about her Colorado hiking trip." Prefer concrete
topics, plans, news and shared interests.
summary: ONE short sentence, at most {SUMMARY_TARGET_CHARS} characters.
facts: at most {MAX_FACTS} bullet points, each a DIFFERENT detail, each at most
{FACT_TARGET_CHARS} characters, written as a short phrase. Do not repeat the cue or each other,
and skip filler (greetings, thanks, "they talked"). Fewer bullets is better than repetition.
Each evidenceQuote is a short span (at most {QUOTE_TARGET_CHARS} characters) copied
character-for-character from the transcript that supports that bullet.

Use only what the transcript says. Never invent names, relationships, feelings or details.
hasMemorableContent: false when there is nothing worth remembering (silence, noise, only
greetings, or unintelligible speech); then leave summary and cue empty and facts empty."""


# Kept for callers/tests that use the unnamed prompt.
SYSTEM_INSTRUCTION = system_instruction()


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


async def draft_memory(
    settings: Settings, transcript: str, person_name: str | None = None
) -> MemoryDraft:
    """Summarize supported details only; every evidenceQuote is a literal transcript substring.

    With ``person_name`` the draft refers to that person by name instead of "the speaker".
    """
    output = await llm.generate_structured(
        settings, system_instruction(person_name), transcript, MemoryOutput
    )
    return ground_memory(transcript, output)
