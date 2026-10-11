"""Self-introduction parsing (owner: Vansh). Never saves people."""

from __future__ import annotations

import re
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
from app.providers import llm

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
relationship: how the speaker says they are connected, to the app user OR to someone else,
whenever they state it in words. Copy a short phrase (at most 6 words) from the transcript,
for example: "I'm your brother" -> "brother"; "your friend from college" -> "friend from
college"; "I'm Ishan's twin brother" -> "Ishan's twin brother"; "I'm Bhavya's best friend"
-> "Bhavya's best friend"; "we're on the same hackathon team" -> "same hackathon team";
"I live next door" -> "live next door"; "I work with Bhavya" -> "work with Bhavya";
"I'm in your CS class" -> "in your CS class"; "Bhavya is my best friend" -> "Bhavya's best
friend"; "Ishan is my brother" -> "Ishan's brother". Leave out "I'm", "I am" and "your".
Never infer a relationship from names, tone or context, and never invent words that were
not said.
Null only when no connection is stated.
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
    # "Ishan's twin" describes someone else; it is never the speaker's own name.
    if re.search(r"(?:'s|’s)\b", name, flags=re.IGNORECASE):
        return None
    return name if 0 < len(name) <= MAX_DISPLAY_NAME_CHARS else None


_RELATIONSHIP_PREFIXES = ("i'm ", "i am ", "im ", "your ")


def _clean_relationship(value: str | None) -> str | None:
    """Drop speaker framing the UI adds itself ("your brother" -> "brother")."""
    relationship = (value or "").strip().strip(".,!?;:\"'").strip()
    changed = True
    while changed and relationship:
        changed = False
        for prefix in _RELATIONSHIP_PREFIXES:
            if relationship.casefold().startswith(prefix):
                relationship = relationship[len(prefix) :].strip()
                changed = True
    if relationship.casefold() in {prefix.strip() for prefix in _RELATIONSHIP_PREFIXES}:
        return None  # only framing words, no relationship
    return relationship or None


_FILLER_WORDS = {"s", "is", "am", "are", "my", "your", "the", "a", "an", "of", "i", "im"}
_NOT_A_NAME = {"this", "that", "it", "he", "she", "they", "there", "here", "what", "who", "name"}
_REL_WORDS = r"[A-Za-z][A-Za-z' -]{0,40}?"
_END = r"(?=\s*(?:[.,!?;]|\band\b|\bthank|$))"


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.casefold().replace("'s", " s").replace("’s", " s"))


def _supported_by(relationship: str, evidence: str) -> bool:
    """Every meaningful word of the relationship was actually said in the evidence span."""
    said = set(_words(evidence))
    meaningful = [word for word in _words(relationship) if word not in _FILLER_WORDS]
    return bool(meaningful) and all(word in said for word in meaningful)


def relationship_from_patterns(transcript: str, speaker: str) -> tuple[str, str] | None:
    """Backup when the model returns no relationship: a few literal phrasings only.

    Returns (relationship, evidence span). Never guesses: the words come from the transcript.
    """
    patterns = [
        # "Bhavya is my best friend" -> "Bhavya's best friend"
        (rf"\b([A-Z][a-z]+) is my ({_REL_WORDS}){_END}", lambda m: f"{m[1]}'s {m[2]}", 1),
        # "I'm Ishan's twin brother" / "I am Bhavya's teammate"
        (rf"\b(?:I'm|I am|Im)\s+([A-Z][a-z]+(?:'s|’s)\s+{_REL_WORDS}){_END}", lambda m: m[1], 1),
        # "I'm your brother" -> "brother"
        (rf"\b(?:I'm|I am|Im)\s+your\s+({_REL_WORDS}){_END}", lambda m: m[1], None),
    ]
    for pattern, build, name_group in patterns:
        for match in re.finditer(pattern, transcript):
            if name_group is not None:
                other = match[name_group].split("'")[0].split("’")[0]
                if other.casefold() in _NOT_A_NAME or other.casefold() == speaker.casefold():
                    continue
            relationship = " ".join(build(match).split())
            if 0 < len(relationship.split()) <= 6 and len(relationship) <= MAX_RELATIONSHIP_CHARS:
                return relationship, match[0]
    return None


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

    relationship = _clean_relationship(output.relationship)
    relationship_evidence = find_literal(transcript, output.relationshipEvidence)
    if (
        relationship is None
        or relationship_evidence is None
        or len(relationship) > MAX_RELATIONSHIP_CHARS
        or len(relationship_evidence) > MAX_EVIDENCE_CHARS
        or not _supported_by(relationship, relationship_evidence)
    ):
        relationship, relationship_evidence = None, None
    if relationship is None:
        found = relationship_from_patterns(transcript, name)
        if found is not None:
            relationship, relationship_evidence = _clean_relationship(found[0]), found[1]

    return IntroductionDraft(
        intent=IntroductionIntent.INTRODUCTION,
        display_name=name,
        relationship=relationship,
        name_evidence=evidence,
        relationship_evidence=relationship_evidence,
    )


async def draft_introduction(settings: Settings, transcript: str) -> IntroductionDraft:
    """Extract an explicit self-introduction; evidence must occur in the transcript."""
    output = await llm.generate_structured(
        settings, SYSTEM_INSTRUCTION, transcript, IntroductionOutput
    )
    return ground_introduction(transcript, output)
