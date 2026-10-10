"""Self-introduction parsing (owner: Vansh). Never saves people."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.ai.grounding import find_literal
from app.config import Settings
from app.contracts import (
    MAX_DISPLAY_NAME_CHARS,
    MAX_EVIDENCE_CHARS,
    MAX_RELATIONSHIP_CHARS,
    IntroductionDraft,
    IntroductionIntent,
)
from app.providers import gemini

SYSTEM_INSTRUCTION = """\
A new visitor has walked up to the app user, and a short recording was transcribed.
Decide whether the speaker introduces THEMSELVES by name, and extract it.

intent = "introduction" only when the speaker states their own name, in any phrasing,
for example "I'm Alex", "my name is Alex", "call me Alex", "this is Alex", "Alex here",
"it's Alex, remember me?".
intent = "other" (and every other field null) when:
- no name is given, or the name is unclear;
- the name belongs to someone else ("this is my friend Sam", "Sam says hi");
- the name is quoted or reported speech ("she said 'I'm Sam'"), or a question ("are you Sam?");
- more than one person introduces themselves.

displayName: the speaker's own name, spelled exactly as in the transcript, without
invented titles or surnames.
nameEvidence: the shortest span copied character-for-character from the transcript
that contains the self-introduction and the name.
relationship: only when the speaker explicitly states it in words ("I'm your neighbor",
"your granddaughter", "Sam's cousin"); copy those words literally. Never infer a
relationship from names, tone or context. Otherwise null.
relationshipEvidence: the span copied character-for-character from the transcript that
contains the relationship; null when relationship is null."""


class IntroductionOutput(BaseModel):
    """Provider-side schema; mapped to the wire IntroductionDraft only after grounding."""

    intent: Literal["introduction", "other"]
    displayName: str | None
    relationship: str | None
    nameEvidence: str | None
    relationshipEvidence: str | None


NO_INTRODUCTION = IntroductionDraft(intent=IntroductionIntent.OTHER)


def _clean_name(value: str | None) -> str | None:
    if value is None:
        return None
    name = value.strip().strip(".,!?;:\"'").strip()
    return name if 0 < len(name) <= MAX_DISPLAY_NAME_CHARS else None


def ground_introduction(transcript: str, output: IntroductionOutput) -> IntroductionDraft:
    """Keep only what the transcript literally supports; otherwise intent="other"."""
    if output.intent != "introduction":
        return NO_INTRODUCTION
    name = _clean_name(output.displayName)
    evidence = find_literal(transcript, output.nameEvidence)
    if name is None or evidence is None or len(evidence) > MAX_EVIDENCE_CHARS:
        return NO_INTRODUCTION
    if name.casefold() not in evidence.casefold():
        return NO_INTRODUCTION

    relationship = (output.relationship or "").strip() or None
    relationship_evidence = find_literal(transcript, output.relationshipEvidence)
    if (
        relationship is None
        or relationship_evidence is None
        or len(relationship) > MAX_RELATIONSHIP_CHARS
        or len(relationship_evidence) > MAX_EVIDENCE_CHARS
        or relationship.casefold() not in relationship_evidence.casefold()
    ):
        relationship, relationship_evidence = None, None

    return IntroductionDraft(
        intent=IntroductionIntent.INTRODUCTION,
        display_name=name,
        relationship=relationship,
        name_evidence=evidence,
        relationship_evidence=relationship_evidence,
    )


async def draft_introduction(settings: Settings, transcript: str) -> IntroductionDraft:
    """Extract an explicit self-introduction; evidence must occur in the transcript."""
    output = await gemini.generate_structured(
        settings, SYSTEM_INSTRUCTION, transcript, IntroductionOutput
    )
    return ground_introduction(transcript, output)
