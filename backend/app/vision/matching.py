"""Gallery matching (owner: Bhavya). Pure NumPy; no model or storage imports."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import numpy as np

from app.vision.gallery import Gallery
from app.vision.thresholds import MATCH_MARGIN, MIN_MATCH_SIMILARITY


@dataclass(frozen=True)
class MatchDecision:
    person_id: UUID | None  # None = unknown
    best_similarity: float | None
    second_similarity: float | None


def match_gallery(
    query: np.ndarray,
    gallery: Gallery,
    *,
    min_similarity: float = MIN_MATCH_SIMILARITY,
    margin: float = MATCH_MARGIN,
) -> MatchDecision:
    """Score each person by their best sample; accept only a clear, strong winner.

    Samples of one person never compete with each other. An empty gallery is unknown.
    """
    scores: list[tuple[float, UUID]] = []
    for entry in gallery.entries:
        if entry.embeddings.size == 0:
            continue
        scores.append((float(np.max(entry.embeddings @ query)), entry.person_id))
    if not scores:
        return MatchDecision(None, None, None)
    scores.sort(key=lambda item: item[0], reverse=True)
    best, person_id = scores[0]
    second = scores[1][0] if len(scores) > 1 else None
    if best < min_similarity:
        return MatchDecision(None, best, second)
    if second is not None and best - second < margin:
        return MatchDecision(None, best, second)
    return MatchDecision(person_id, best, second)


def match_faces(queries: list[np.ndarray], gallery: Gallery) -> list[MatchDecision]:
    """Match every face independently, then give each person to at most one face.

    When several faces match the same person, only the strongest keeps the identity; the
    others become unknown, so one name is never shown on two faces.
    """
    decisions = [match_gallery(query, gallery) for query in queries]
    best_face: dict[UUID, int] = {}
    for index, decision in enumerate(decisions):
        if decision.person_id is None:
            continue
        current = best_face.get(decision.person_id)
        if current is None or decision.best_similarity > decisions[current].best_similarity:
            best_face[decision.person_id] = index
    winners = set(best_face.values())
    return [
        decision
        if decision.person_id is None or index in winners
        else MatchDecision(None, decision.best_similarity, decision.second_similarity)
        for index, decision in enumerate(decisions)
    ]
