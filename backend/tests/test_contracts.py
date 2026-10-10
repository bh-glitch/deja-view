"""Schema rules and synthetic examples (owner: Bhavya)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app import contracts
from app.config import REPO_ROOT

EXAMPLES = sorted((REPO_ROOT / "contracts" / "examples").glob("*.json"))


@pytest.mark.parametrize("path", EXAMPLES, ids=lambda p: p.name)
def test_examples_match_canonical_schema(path: Path) -> None:
    model = getattr(contracts, path.name.split(".")[0])
    raw = json.loads(path.read_text())
    parsed = model.model_validate(raw)
    assert parsed.model_dump(mode="json") == raw


def test_examples_exist() -> None:
    assert len(EXAMPLES) >= 15


def _person(**overrides):
    base = {
        "id": "3f1d0c8e-7c5a-4a5e-9a59-2f0f2d7f1a11",
        "displayName": " Ana ",
        "relationship": "  ",
        "createdAt": "2026-10-10T12:00:00-04:00",
        "updatedAt": "2026-10-10T16:00:00Z",
    }
    return {**base, **overrides}


def test_person_trims_and_serializes_camel_case_utc() -> None:
    person = contracts.Person.model_validate(_person())
    assert person.model_dump(mode="json") == {
        "id": "3f1d0c8e-7c5a-4a5e-9a59-2f0f2d7f1a11",
        "displayName": "Ana",
        "relationship": None,
        "createdAt": "2026-10-10T16:00:00Z",
        "updatedAt": "2026-10-10T16:00:00Z",
    }


@pytest.mark.parametrize(
    "overrides",
    [
        {"displayName": ""},
        {"displayName": "x" * 81},
        {"relationship": "x" * 121},
        {"createdAt": "2026-10-10T12:00:00"},  # naive timestamp
        {"id": "not-a-uuid"},
        {"extra": 1},
    ],
)
def test_person_rejects_invalid(overrides) -> None:
    with pytest.raises(ValidationError):
        contracts.Person.model_validate(_person(**overrides))


def test_frame_result_non_matched_cannot_carry_identity() -> None:
    with pytest.raises(ValidationError):
        contracts.FrameResult.model_validate(
            {
                "status": "unknown",
                "personId": "3f1d0c8e-7c5a-4a5e-9a59-2f0f2d7f1a11",
                "box": {"x": 0, "y": 0, "width": 1, "height": 1},
                "frameWidth": 10,
                "frameHeight": 10,
            }
        )


def test_frame_result_matched_requires_identity() -> None:
    with pytest.raises(ValidationError):
        contracts.FrameResult.model_validate(
            {"status": "matched", "frameWidth": 10, "frameHeight": 10}
        )


def test_conversation_rejects_end_before_start() -> None:
    raw = json.loads(
        (REPO_ROOT / "contracts/examples/CreateConversationRequest.alex.json").read_text()
    )
    raw["endedAt"] = "2026-10-10T15:00:00Z"
    with pytest.raises(ValidationError):
        contracts.CreateConversationRequest.model_validate(raw)


def test_create_person_requires_three_to_five_matching_embeddings() -> None:
    raw = json.loads((REPO_ROOT / "contracts/examples/CreatePersonRequest.alex.json").read_text())
    for count in (2, 6):
        with pytest.raises(ValidationError):
            contracts.CreatePersonRequest.model_validate(
                {**raw, "embeddings": [raw["embeddings"][0]] * count}
            )
    with pytest.raises(ValidationError):
        contracts.CreatePersonRequest.model_validate(
            {**raw, "embeddings": [[0.1] * 10] * 3}
        )


def test_memory_draft_limits() -> None:
    with pytest.raises(ValidationError):
        contracts.MemoryDraft.model_validate({"summary": "s", "cue": "x" * 241})
    facts = [{"text": "t", "evidenceQuote": "q"}] * 4
    with pytest.raises(ValidationError):
        contracts.MemoryDraft.model_validate({"summary": "s", "cue": "c", "facts": facts})
    assert contracts.MemoryDraft.model_validate({"summary": "s", "cue": "c"}).facts == []


def test_every_error_code_has_status() -> None:
    assert set(contracts.ERROR_STATUS) == set(contracts.ErrorCode)
    for status, _ in contracts.ERROR_STATUS.values():
        assert status >= 400
