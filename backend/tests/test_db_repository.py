"""SQLite storage, idempotency and gallery cache (owner: Arnav). tmp_path databases only."""

from __future__ import annotations

import sqlite3
import threading
from uuid import UUID, uuid4

import numpy as np
import pytest

from app.contracts import ApiError, ErrorCode
from app.db import repository
from app.db.database import SCHEMA_VERSION, Database
from app.db.gallery_cache import GalleryCache
from tests.db_support import (
    OTHER_MODEL,
    TEST_MODEL,
    conversation_request,
    make_db,
    person_request,
    unit_vectors,
    use_vision_stand_ins,
)


@pytest.fixture(autouse=True)
def vision_stand_ins(monkeypatch) -> None:
    use_vision_stand_ins(monkeypatch)


@pytest.fixture
def db(tmp_path) -> Database:
    return make_db(tmp_path)


def _count(database: Database, table: str) -> int:
    with database.transaction() as conn:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


# --- schema / connection ----------------------------------------------------


def test_constructor_does_no_io(tmp_path) -> None:
    database = Database(tmp_path / "nested" / "x.db")
    assert not database.path.parent.exists()
    assert database.is_ready() is False


def test_initialize_creates_versioned_schema_and_is_rerunnable(db) -> None:
    assert db.is_ready()
    repository.create_person(db, person_request(), TEST_MODEL)
    db.initialize()  # second startup must not reset data
    assert _count(db, "people") == 1
    with db.transaction() as conn:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_newer_schema_is_rejected(tmp_path) -> None:
    path = tmp_path / "future.db"
    conn = sqlite3.connect(path)
    conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION + 1}")
    conn.close()
    database = Database(path)
    with pytest.raises(ApiError) as info:
        database.initialize()
    assert info.value.code == ErrorCode.STORAGE_ERROR
    assert database.is_ready() is False


def test_v1_conversations_stay_reviewed_after_upgrade(tmp_path) -> None:
    from app.db.database import MIGRATIONS, _split_statements

    path = tmp_path / "v1.db"
    conn = sqlite3.connect(path)
    for statement in _split_statements(MIGRATIONS[0]):
        conn.execute(statement)
    conn.execute(
        "INSERT INTO people VALUES ('11111111-1111-4111-8111-111111111111', 'Old', NULL, "
        "'2026-10-10T10:00:00Z', '2026-10-10T10:00:00Z', 'h')"
    )
    conn.execute(
        "INSERT INTO conversations VALUES ('22222222-2222-4222-8222-222222222222', "
        "'11111111-1111-4111-8111-111111111111', '2026-10-10T10:00:00Z', "
        "'2026-10-10T10:01:00Z', 'hi', 'typed', "
        """'{"summary":"s","cue":"c","facts":[]}', 0, '2026-10-10T10:01:00Z', 'h')"""
    )
    conn.execute("PRAGMA user_version = 1")
    conn.commit()
    conn.close()

    database = Database(path)
    database.initialize()
    detail = repository.get_person_detail(database, UUID("11111111-1111-4111-8111-111111111111"))
    assert detail.conversations[0].reviewed_by_user is True


def test_unreviewed_automatic_conversation_is_stored_as_such(db) -> None:
    person = repository.create_person(db, person_request(), TEST_MODEL)
    request = conversation_request(person.id).model_copy(update={"reviewed_by_user": False})
    saved = repository.create_conversation(db, request)
    assert saved.reviewed_by_user is False
    assert repository.get_person_detail(db, person.id).conversations[0].reviewed_by_user is False


def test_uninitialized_transaction_is_storage_error(tmp_path) -> None:
    with pytest.raises(ApiError) as info:
        with Database(tmp_path / "x.db").transaction():
            pass
    assert info.value.code == ErrorCode.STORAGE_ERROR


def test_failed_transaction_rolls_back(db) -> None:
    with pytest.raises(RuntimeError):
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO people VALUES ('p', 'n', NULL, 't', 't', 'h')"
            )
            raise RuntimeError("boom")
    assert _count(db, "people") == 0


def test_sql_error_becomes_storage_error(db) -> None:
    with pytest.raises(ApiError) as info:
        with db.transaction() as conn:
            conn.execute("SELECT * FROM missing_table")
    assert info.value.code == ErrorCode.STORAGE_ERROR


# --- people -----------------------------------------------------------------


def test_create_person_is_atomic_with_samples(db) -> None:
    request = person_request(relationship="  ")
    person = repository.create_person(db, request, TEST_MODEL)
    assert person.id == request.person_id
    assert person.relationship is None
    assert _count(db, "face_samples") == 3
    assert repository.list_people(db) == [person]


def test_bad_sample_rolls_back_whole_enrollment(db) -> None:
    with db.transaction() as conn:
        conn.execute(
            "CREATE TRIGGER fail_third_sample BEFORE INSERT ON face_samples "
            "WHEN NEW.sample_index = 2 BEGIN SELECT RAISE(ABORT, 'simulated failure'); END"
        )
    with pytest.raises(ApiError) as info:
        repository.create_person(db, person_request(), TEST_MODEL)
    assert info.value.code == ErrorCode.STORAGE_ERROR
    assert _count(db, "people") == 0
    assert _count(db, "face_samples") == 0


def test_person_idempotency_and_conflict(db) -> None:
    request = person_request(name="Alex Demo")
    first = repository.create_person(db, request, TEST_MODEL)
    assert repository.create_person(db, request, TEST_MODEL) == first
    renamed = person_request(person_id=request.person_id, name="Sam Demo")
    with pytest.raises(ApiError) as info:
        repository.create_person(db, renamed, TEST_MODEL)
    assert info.value.code == ErrorCode.CONFLICT
    assert _count(db, "people") == 1
    assert _count(db, "face_samples") == 3


def test_whitespace_variant_is_same_request(db) -> None:
    request = person_request(name="Alex Demo")
    raw = {**request.model_dump(mode="json"), "displayName": "  Alex Demo "}
    padded = request.model_validate(raw)
    first = repository.create_person(db, request, TEST_MODEL)
    assert repository.create_person(db, padded, TEST_MODEL) == first


def test_model_mismatch_is_rejected_before_writing(db) -> None:
    with pytest.raises(ApiError) as info:
        repository.create_person(db, person_request(model=OTHER_MODEL), TEST_MODEL)
    assert info.value.code == ErrorCode.MODEL_MISMATCH
    assert _count(db, "people") == 0


def test_non_normalized_embedding_is_rejected(db) -> None:
    vectors = unit_vectors(3, 9)
    vectors[1] = [v * 2 for v in vectors[1]]
    with pytest.raises(ApiError) as info:
        repository.create_person(db, person_request(embeddings=vectors), TEST_MODEL)
    assert info.value.code == ErrorCode.EMBEDDING_INVALID
    assert _count(db, "people") == 0


def test_concurrent_identical_creates_make_one_person(db) -> None:
    request = person_request()
    results, errors = [], []

    def worker():
        try:
            results.append(repository.create_person(db, request, TEST_MODEL))
        except Exception as exc:  # pragma: no cover - reported below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []
    assert len({r.model_dump_json() for r in results}) == 1
    assert _count(db, "people") == 1
    assert _count(db, "face_samples") == 3


def test_missing_person_detail_and_delete_are_not_found(db) -> None:
    for call in (repository.get_person_detail, repository.delete_person):
        with pytest.raises(ApiError) as info:
            call(db, uuid4())
        assert info.value.code == ErrorCode.NOT_FOUND


def test_delete_cascades(db) -> None:
    person = repository.create_person(db, person_request(), TEST_MODEL)
    repository.create_conversation(db, conversation_request(person.id))
    repository.delete_person(db, person.id)
    assert _count(db, "people") == 0
    assert _count(db, "face_samples") == 0
    assert _count(db, "conversations") == 0


# --- conversations ----------------------------------------------------------


def test_detail_orders_conversations_and_reports_latest_cue(db) -> None:
    person = repository.create_person(db, person_request(), TEST_MODEL)
    assert repository.get_person_detail(db, person.id).latest_cue is None

    repository.create_conversation(
        db, conversation_request(person.id, end_offset_minutes=5, cue="older")
    )
    newest = repository.create_conversation(
        db, conversation_request(person.id, end_offset_minutes=30, cue="newest")
    )
    tie_a = conversation_request(person.id, end_offset_minutes=10, cue="tie")
    tie_b = conversation_request(person.id, end_offset_minutes=10, cue="tie")
    repository.create_conversation(db, tie_a)
    repository.create_conversation(db, tie_b)

    detail = repository.get_person_detail(db, person.id)
    assert detail.conversations[0] == newest
    assert detail.latest_cue == "newest"
    keys = [(c.ended_at, c.created_at, str(c.id)) for c in detail.conversations]
    assert keys == sorted(keys, reverse=True)
    assert [c.memory.cue for c in detail.conversations][-1] == "older"


def test_conversation_idempotency_and_conflict(db) -> None:
    person = repository.create_person(db, person_request(), TEST_MODEL)
    request = conversation_request(person.id)
    first = repository.create_conversation(db, request)
    assert repository.create_conversation(db, request) == first
    changed = conversation_request(person.id, conversation_id=request.conversation_id, cue="other")
    with pytest.raises(ApiError) as info:
        repository.create_conversation(db, changed)
    assert info.value.code == ErrorCode.CONFLICT
    assert _count(db, "conversations") == 1


def test_conversation_for_unknown_person_is_not_found(db) -> None:
    with pytest.raises(ApiError) as info:
        repository.create_conversation(db, conversation_request(uuid4()))
    assert info.value.code == ErrorCode.NOT_FOUND


def test_corrupted_memory_json_is_storage_error(db) -> None:
    person = repository.create_person(db, person_request(), TEST_MODEL)
    repository.create_conversation(db, conversation_request(person.id))
    with db.transaction() as conn:
        conn.execute("UPDATE conversations SET memory_json = ?", ('{"summary": ""}',))
    with pytest.raises(ApiError) as info:
        repository.get_person_detail(db, person.id)
    assert info.value.code == ErrorCode.STORAGE_ERROR


# --- gallery ----------------------------------------------------------------


def test_load_gallery_groups_by_person_and_filters_model(db) -> None:
    a = repository.create_person(db, person_request(seed=1), TEST_MODEL)
    b = repository.create_person(db, person_request(seed=2, name="Sam Demo"), TEST_MODEL)
    repository.create_person(db, person_request(seed=3, model=OTHER_MODEL), OTHER_MODEL)

    gallery = repository.load_gallery(db, TEST_MODEL)
    assert gallery.model == TEST_MODEL
    assert [e.person_id for e in gallery.entries] == [a.id, b.id]
    for entry in gallery.entries:
        assert entry.embeddings.shape == (3, 512)
        assert entry.embeddings.dtype == np.float32
    np.testing.assert_allclose(
        gallery.entries[0].embeddings[0], unit_vectors(3, 1)[0], rtol=1e-6
    )
    assert len(repository.load_gallery(db, OTHER_MODEL).entries) == 1


def test_empty_gallery(db) -> None:
    assert repository.load_gallery(db, TEST_MODEL).entries == ()


def test_corrupted_embedding_is_storage_error(db) -> None:
    repository.create_person(db, person_request(), TEST_MODEL)
    with db.transaction() as conn:
        conn.execute("UPDATE face_samples SET embedding_json = '[1, 2, \"x\"]'")
    with pytest.raises(ApiError) as info:
        repository.load_gallery(db, TEST_MODEL)
    assert info.value.code == ErrorCode.STORAGE_ERROR


def test_gallery_cache_avoids_sql_until_invalidated(db, monkeypatch) -> None:
    cache = GalleryCache(db)
    calls = []
    real = repository.load_gallery
    monkeypatch.setattr(
        repository, "load_gallery", lambda d, m: calls.append(m) or real(d, m)
    )
    assert cache.get(TEST_MODEL).entries == ()
    for _ in range(20):
        cache.get(TEST_MODEL)
    assert len(calls) == 1

    repository.create_person(db, person_request(), TEST_MODEL)
    assert cache.get(TEST_MODEL).entries == ()  # still cached
    cache.invalidate()
    assert len(cache.get(TEST_MODEL).entries) == 1
    assert len(calls) == 2

    cache.get(OTHER_MODEL)  # a different model is never served from the cache
    assert len(calls) == 3


def test_gallery_cache_discards_load_that_raced_invalidate(db, monkeypatch) -> None:
    cache = GalleryCache(db)
    real = repository.load_gallery

    def load_then_invalidate(d, m):
        gallery = real(d, m)
        cache.invalidate()  # an enrollment finished while we were loading
        return gallery

    monkeypatch.setattr(repository, "load_gallery", load_then_invalidate)
    cache.get(TEST_MODEL)
    assert cache._gallery is None
