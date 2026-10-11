"""Pick the few saved points worth showing when a person returns (Bhavya, human decision
2026-10-10: "only the 3 latest points that are relevant for the user to remember").

The AI only chooses among notes that were already reviewed and saved; it returns note
numbers, never new text, so nothing shown can be invented. Never saves anything.
"""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel

from app.config import Settings
from app.contracts import MAX_KEY_POINTS, ApiError, ErrorCode, KeyPointNote, KeyPoints
from app.providers import llm


def _safe_name(person_name: str | None) -> str:
    """A stored display name, reduced to one plain line so it cannot reshape the prompt."""
    name = " ".join((person_name or "").replace('"', "'").split())[:80]
    return f'"{name}"' if name else "this person"


def system_instruction(person_name: str | None, today: datetime) -> str:
    who = _safe_name(person_name)
    return f"""\
The app user has memory loss. They are about to talk with {who} again. The data block is a
numbered list of notes saved from earlier conversations with {who}, newest first, each with
the date it was saved. Today is {today.date().isoformat()}.

Pick at most {MAX_KEY_POINTS} notes the user most needs to remember right now to have a good
conversation with {who}. Prefer, in this order: upcoming plans, events or promises; important
life news (health, family, work, moving, trips); things {who} cares about. Prefer newer notes.
Every pick must be about a DIFFERENT topic. When an older note is about the same topic as a
newer one (for example "got engaged" and later "getting married"), pick only the newer one.
Skip small talk, weather, greetings and trivia, and plans whose date has clearly passed.
Fewer picks are better than a repeated topic or trivia.

picks: the note numbers, most important first. Pick at least one note."""


class KeyPointsOutput(BaseModel):
    """Provider-side schema: note numbers only."""

    picks: list[int]


def unique_notes(notes: list[KeyPointNote]) -> list[KeyPointNote]:
    """Drop repeated text, keeping the newest copy (notes arrive newest first)."""
    seen: set[str] = set()
    kept: list[KeyPointNote] = []
    for note in notes:
        key = " ".join(note.text.lower().split())
        if key not in seen:
            seen.add(key)
            kept.append(note)
    return kept


def notes_block(notes: list[KeyPointNote]) -> str:
    return "\n".join(
        f"{index}. ({note.ended_at.date().isoformat()}) {note.text}"
        for index, note in enumerate(notes, start=1)
    )


def chosen_points(notes: list[KeyPointNote], output: KeyPointsOutput) -> KeyPoints:
    """Map picked note numbers back to their saved text; ignore numbers that do not exist."""
    points: list[str] = []
    for pick in output.picks:
        if 1 <= pick <= len(notes) and notes[pick - 1].text not in points:
            points.append(notes[pick - 1].text)
        if len(points) == MAX_KEY_POINTS:
            break
    if not points:
        raise ApiError(ErrorCode.AI_OUTPUT_INVALID, "The AI did not pick any saved point.")
    return KeyPoints(points=points)


async def pick_key_points(
    settings: Settings,
    notes: list[KeyPointNote],
    person_name: str | None = None,
    now: datetime | None = None,
) -> KeyPoints:
    notes = unique_notes(notes)
    # Nothing to choose between: show them all without an AI call.
    if len(notes) <= MAX_KEY_POINTS:
        return KeyPoints(points=[note.text for note in notes])
    output = await llm.generate_structured(
        settings,
        system_instruction(person_name, now or datetime.now(UTC)),
        notes_block(notes),
        KeyPointsOutput,
    )
    return chosen_points(notes, output)
