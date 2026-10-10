from __future__ import annotations

import uuid

import numpy as np
import pytest

from app.vision.gallery import Gallery, GalleryEntry
from app.vision.matching import match_faces, match_gallery
from tests.vision_helpers import MODEL, near, random_unit

ALEX, SAM = uuid.uuid4(), uuid.uuid4()


@pytest.fixture
def rng() -> np.random.Generator:
    return np.random.default_rng(11)


def _gallery(**people: list[np.ndarray]) -> Gallery:
    ids = {"alex": ALEX, "sam": SAM}
    return Gallery(
        MODEL,
        tuple(GalleryEntry(ids[name], np.stack(vectors)) for name, vectors in people.items()),
    )


def test_empty_gallery_is_unknown(rng) -> None:
    decision = match_gallery(random_unit(rng), Gallery.empty(MODEL))
    assert decision.person_id is None


def test_clear_match(rng) -> None:
    alex, sam = random_unit(rng), random_unit(rng)
    decision = match_gallery(near(alex, 0.7, rng), _gallery(alex=[alex], sam=[sam]))
    assert decision.person_id == ALEX


def test_weak_match_is_unknown(rng) -> None:
    alex = random_unit(rng)
    decision = match_gallery(near(alex, 0.3, rng), _gallery(alex=[alex]))
    assert decision.person_id is None


def test_ambiguous_between_people_is_unknown(rng) -> None:
    query = random_unit(rng)
    a, b = near(query, 0.62, rng), near(query, 0.60, rng)
    decision = match_gallery(query, _gallery(alex=[a], sam=[b]))
    assert decision.person_id is None


def test_samples_of_same_person_do_not_compete(rng) -> None:
    alex = random_unit(rng)
    samples = [near(alex, 0.95, rng) for _ in range(3)]
    decision = match_gallery(near(alex, 0.75, rng), _gallery(alex=samples))
    assert decision.person_id == ALEX
    assert decision.second_similarity is None


def test_each_face_matched_independently(rng) -> None:
    alex, sam = random_unit(rng), random_unit(rng)
    stranger = random_unit(rng)
    decisions = match_faces(
        [near(sam, 0.7, rng), stranger, near(alex, 0.7, rng)], _gallery(alex=[alex], sam=[sam])
    )
    assert [d.person_id for d in decisions] == [SAM, None, ALEX]


def test_one_person_never_labels_two_faces(rng) -> None:
    alex = random_unit(rng)
    strong, weaker = near(alex, 0.8, rng), near(alex, 0.6, rng)
    decisions = match_faces([weaker, strong], _gallery(alex=[alex]))
    assert [d.person_id for d in decisions] == [None, ALEX]
