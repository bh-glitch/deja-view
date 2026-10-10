"""Introduction grounding and route tests (owner: Vansh). Gemini is mocked."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.ai import introduction
from app.ai.grounding import find_literal
from app.ai.introduction import IntroductionOutput, ground_introduction
from app.config import Settings
from app.contracts import IntroductionDraftResponse
from app.main import create_app


def _out(**fields) -> IntroductionOutput:
    base = {
        "intent": "introduction",
        "displayName": None,
        "relationship": None,
        "nameEvidence": None,
        "relationshipEvidence": None,
    }
    return IntroductionOutput(**(base | fields))


def test_grounded_introduction_is_kept() -> None:
    transcript = "Hey, I'm Demo Alex, Sam's cousin."
    draft = ground_introduction(
        transcript,
        _out(
            displayName="Demo Alex",
            nameEvidence="I'm Demo Alex",
            relationship="Sam's cousin",
            relationshipEvidence="Demo Alex, Sam's cousin",
        ),
    )
    assert draft.intent == "introduction"
    assert draft.display_name == "Demo Alex"
    assert draft.relationship == "Sam's cousin"
    assert draft.name_evidence in transcript
    assert draft.relationship_evidence in transcript


def test_case_differences_return_the_transcripts_own_text() -> None:
    draft = ground_introduction(
        "hey i'm demo alex", _out(displayName="Demo Alex", nameEvidence="I'm Demo Alex")
    )
    assert draft.display_name == "Demo Alex"
    assert draft.name_evidence == "i'm demo alex"


@pytest.mark.parametrize(
    ("transcript", "fields"),
    [
        # Model said "other".
        ("Hi there!", {"intent": "other"}),
        # Name missing.
        ("Hi, I'm Demo Alex.", {"nameEvidence": "I'm Demo Alex"}),
        # Evidence not in the transcript (hallucinated).
        ("Hi there!", {"displayName": "Demo Alex", "nameEvidence": "I'm Demo Alex"}),
        # Name not inside its own evidence.
        ("Hi, I'm Demo Alex.", {"displayName": "Demo Sam", "nameEvidence": "I'm Demo Alex"}),
        # Over-long name.
        ("Hi, I'm Demo Alex.", {"displayName": "A" * 81, "nameEvidence": "I'm Demo Alex"}),
    ],
)
def test_ungrounded_output_becomes_other(transcript, fields) -> None:
    draft = ground_introduction(transcript, _out(**fields))
    assert draft.intent == "other"
    assert draft.display_name is None
    assert draft.relationship is None
    assert draft.name_evidence is None
    assert draft.relationship_evidence is None


def test_ungrounded_relationship_is_dropped_but_name_kept() -> None:
    draft = ground_introduction(
        "Hi, I'm Demo Alex.",
        _out(
            displayName="Demo Alex",
            nameEvidence="I'm Demo Alex",
            relationship="your granddaughter",
            relationshipEvidence="your granddaughter",
        ),
    )
    assert draft.intent == "introduction"
    assert draft.display_name == "Demo Alex"
    assert draft.relationship is None
    assert draft.relationship_evidence is None


def test_name_punctuation_is_trimmed() -> None:
    draft = ground_introduction(
        "Call me Demo Alex!", _out(displayName="Demo Alex!", nameEvidence="Call me Demo Alex")
    )
    assert draft.display_name == "Demo Alex"


@pytest.mark.parametrize(
    ("transcript", "quote", "expected"),
    [
        ("Hi, I'm Alex.", "I'm Alex", "I'm Alex"),
        ("hi, i'm alex.", "I'm Alex", "i'm alex"),
        ("Hi, I'm Alex.", "  I'm Alex  ", "I'm Alex"),
        ("Hi, I'm Alex.", "I am Alex", None),
        ("Hi", None, None),
        ("Hi", "   ", None),
    ],
)
def test_find_literal(transcript, quote, expected) -> None:
    assert find_literal(transcript, quote) == expected


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    settings = Settings(
        _env_file=None,
        database_path=tmp_path / "fixture.db",
        insightface_root=tmp_path / "w",
        gemini_api_key="test-key",
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def test_route_returns_grounded_draft_and_saves_nothing(monkeypatch, client) -> None:
    seen: list[str] = []

    async def fake_generate(settings, system_instruction, transcript, schema):
        seen.append(transcript)
        return _out(displayName="Demo Alex", nameEvidence="I'm Demo Alex")

    monkeypatch.setattr(introduction.gemini, "generate_structured", fake_generate)
    people_before = client.get("/api/people").json()
    response = client.post("/api/ai/introduction", json={"transcript": "  Hi, I'm Demo Alex.  "})
    assert response.status_code == 200, response.text
    data = IntroductionDraftResponse.model_validate(response.json()).data
    assert data.intent == "introduction"
    assert data.display_name == "Demo Alex"
    assert seen == ["Hi, I'm Demo Alex."]
    assert client.get("/api/people").json()["data"] == people_before["data"]
