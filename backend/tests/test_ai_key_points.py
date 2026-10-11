"""Key-point selection tests (Bhavya). The AI provider is mocked."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.ai import key_points
from app.ai.key_points import KeyPointsOutput, chosen_points, pick_key_points, unique_notes
from app.config import Settings
from app.contracts import ApiError, KeyPointNote, KeyPointsResponse
from app.main import create_app

NOW = datetime(2026, 10, 10, tzinfo=UTC)


def _note(text: str, day: int = 10) -> KeyPointNote:
    return KeyPointNote(text=text, ended_at=datetime(2026, 10, day, tzinfo=UTC))


NOTES = [
    _note("Daughter's wedding is next Saturday", 9),
    _note("Liked the weather today", 9),
    _note("Starts physical therapy on Monday", 5),
    _note("Daughter is getting married", 1),
    _note("Favorite tea is chamomile", 1),
]


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        database_path=tmp_path / "fixture.db",
        insightface_root=tmp_path / "w",
        gemini_api_key="test-key",
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def test_three_or_fewer_notes_skip_the_ai(monkeypatch, settings) -> None:
    async def fail(*args, **kwargs):
        raise AssertionError("no AI call expected")

    monkeypatch.setattr(key_points.llm, "generate_structured", fail)
    notes = [_note("A"), _note("a"), _note("B")]
    result = asyncio_run(pick_key_points(settings, notes))
    assert result.points == ["A", "B"]


def test_picks_map_back_to_saved_text_in_order(monkeypatch, settings) -> None:
    seen: list[tuple[str, str]] = []

    async def fake_generate(settings, system_instruction, data, schema):
        assert schema is KeyPointsOutput
        seen.append((system_instruction, data))
        return KeyPointsOutput(picks=[3, 1, 5])

    monkeypatch.setattr(key_points.llm, "generate_structured", fake_generate)
    result = asyncio_run(pick_key_points(settings, NOTES, person_name="Maya", now=NOW))
    assert result.points == [NOTES[2].text, NOTES[0].text, NOTES[4].text]
    (prompt, data), = seen
    assert '"Maya"' in prompt and "Today is 2026-10-10" in prompt
    assert data.splitlines()[0] == "1. (2026-10-09) Daughter's wedding is next Saturday"


def test_invalid_and_repeated_picks_are_ignored() -> None:
    result = chosen_points(NOTES, KeyPointsOutput(picks=[0, 2, 2, 99, 4, 1, 3]))
    assert result.points == [NOTES[1].text, NOTES[3].text, NOTES[0].text]


def test_no_valid_pick_is_invalid_output() -> None:
    with pytest.raises(ApiError) as caught:
        chosen_points(NOTES, KeyPointsOutput(picks=[0, 42]))
    assert caught.value.code == "AI_OUTPUT_INVALID"


def test_repeated_text_keeps_the_newest_copy() -> None:
    notes = [_note("Loves jazz", 9), _note("loves  JAZZ", 1)]
    assert unique_notes(notes) == [notes[0]]


def test_route_returns_points_and_saves_nothing(monkeypatch, client) -> None:
    async def fake_generate(settings, system_instruction, data, schema):
        return KeyPointsOutput(picks=[1, 3])

    monkeypatch.setattr(key_points.llm, "generate_structured", fake_generate)
    payload = {
        "personName": "Maya",
        "notes": [{"text": n.text, "endedAt": n.ended_at.isoformat()} for n in NOTES],
    }
    response = client.post("/api/ai/key-points", json=payload)
    assert response.status_code == 200, response.text
    data = KeyPointsResponse.model_validate(response.json()).data
    assert data.points == [NOTES[0].text, NOTES[2].text]
    assert client.get("/api/people").json()["data"]["people"] == []


def test_route_rejects_an_empty_note_list(client) -> None:
    response = client.post("/api/ai/key-points", json={"notes": []})
    assert response.status_code == 422


def asyncio_run(coro):
    import asyncio

    return asyncio.run(coro)
