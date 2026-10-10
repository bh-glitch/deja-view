# Arnav — backend storage/transport (`arnav/backend`)

Status: **assigned, not started.** Base: Phase 0 foundation on `main`.

## Owned paths
`backend/app/db/**`, `backend/app/http/**`, `backend/app/routes/{people,conversations,health,vision}.py`,
backend data/API tests (e.g. `backend/tests/test_db_*.py`, `test_routes_*.py`).

Do not edit: `contracts.py`, `config.py`, `main.py`, `app/vision/**`, `pyproject.toml`/`uv.lock`.
Request changes in your task issue.

## Frozen interfaces you implement
`app/db/database.py`
- `Database(path)`: no I/O in the constructor. `initialize()`: mkdir + versioned migrations,
  never resets data, raises `ApiError(STORAGE_ERROR)`. `is_ready() -> bool`.
  `transaction()`: context manager yielding a `sqlite3.Connection`, committing or rolling back.

`app/db/repository.py` (sync; routes call through `run_in_threadpool`)
- `list_people(db) -> list[Person]`
- `create_person(db, request: CreatePersonRequest, expected_model: FaceModel) -> Person`
- `get_person_detail(db, person_id) -> PersonDetail` (404 `NOT_FOUND`)
- `delete_person(db, person_id) -> None` (cascade)
- `create_conversation(db, request: CreateConversationRequest) -> Conversation`
- `load_gallery(db, model: FaceModel) -> Gallery`

`app/db/gallery_cache.py`: `GalleryCache(db).get(model) -> Gallery`, `.invalidate()`.

`app/http/` (shared helpers; keep signatures): `envelope.request_id`, `envelope.error_response`,
`uploads.read_bounded_upload(upload, max_bytes, field=)`, and the `deps.get_*` dependencies.

## Interfaces you consume
- Bhavya (`app/vision/`): `validate_embedding(vector, model, expected)`,
  `check_enrollment_coherence(embeddings, model)`, `Gallery`/`GalleryEntry`, `decode_jpeg`,
  `FaceEngine.model/.recognize/.enrollment_sample`. These raise `NOT_IMPLEMENTED` until Phase 2.
- Health: `request.app.state.face_engine` / `face_engine_error`.

## Phase 1 (feasibility)
SQLite probe on a temporary database: foreign keys and cascade, one atomic
person+samples transaction, a connection strategy safe across FastAPI threads, and
data surviving a process restart.

## Phase 2 acceptance
- Tables `people`, `face_samples` (embedding JSON + model metadata), `conversations`,
  plus a schema version. Bound parameters only; JSON validated on read and write.
- Idempotency: same ID + same normalized request returns the original record; same ID +
  different request returns `409 CONFLICT`.
- Conversations: person must exist, `endedAt >= startedAt`. Detail is ordered by
  `endedAt` desc, then `createdAt` desc, then `id` desc. `latestCue` comes from the
  first conversation.
- Validated gallery cache, invalidated after create/delete. No per-frame SQL.
- Health reports real database readiness. Person routes keep working when vision or
  providers are down (only `POST /people` needs the engine's model metadata).
- Tests use `tmp_path` databases only. `uv run --locked pytest` and `ruff check .` pass.
