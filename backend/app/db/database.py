"""SQLite access (owner: Arnav).

Constructing ``Database`` performs no I/O. ``initialize`` is called explicitly by
main.py's lifespan; it creates/migrates the versioned schema and must never
reset existing live data. Use a per-operation connection (or an equivalently
synchronized strategy) with ``PRAGMA foreign_keys=ON``; do not share one
unsynchronized connection across threads.

Strategy: every ``transaction()`` opens its own connection (thread checks stay
on), starts ``BEGIN IMMEDIATE`` so concurrent writers serialize on SQLite's
lock instead of racing, and closes the connection afterwards. WAL mode lets
readers proceed while a write is in progress.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.contracts import ApiError, ErrorCode

BUSY_TIMEOUT_SECONDS = 5.0

# Append-only. Each entry upgrades the schema by one version; never edit or
# reorder an applied migration, and never drop user data here.
MIGRATIONS: tuple[str, ...] = (
    """
    CREATE TABLE people (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        relationship TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        request_hash TEXT NOT NULL
    );
    CREATE TABLE face_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        sample_index INTEGER NOT NULL,
        embedding_json TEXT NOT NULL,
        pack_name TEXT NOT NULL,
        recognition_file TEXT NOT NULL,
        recognition_sha256 TEXT NOT NULL,
        dimension INTEGER NOT NULL,
        normalization TEXT NOT NULL,
        UNIQUE (person_id, sample_index)
    );
    CREATE INDEX face_samples_model
        ON face_samples (pack_name, recognition_file, recognition_sha256, dimension);
    CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        transcript TEXT NOT NULL,
        source TEXT NOT NULL,
        memory_json TEXT NOT NULL,
        edited_by_user INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        CHECK (ended_at >= started_at)
    );
    CREATE INDEX conversations_person_order
        ON conversations (person_id, ended_at DESC, created_at DESC, id DESC);
    """,
)
SCHEMA_VERSION = len(MIGRATIONS)


def _storage_error(action: str, exc: BaseException) -> ApiError:
    return ApiError(ErrorCode.STORAGE_ERROR, f"Storage failure while {action}: {exc}")


class Database:
    def __init__(self, path: Path):
        self.path = path
        self._initialized = False

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=BUSY_TIMEOUT_SECONDS, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def initialize(self) -> None:
        """Create parent directory and apply migrations. Raises ApiError(STORAGE_ERROR)."""
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            conn = self._connect()
            try:
                conn.execute("PRAGMA journal_mode = WAL")
                conn.execute("BEGIN IMMEDIATE")
                try:
                    version = conn.execute("PRAGMA user_version").fetchone()[0]
                    if version > SCHEMA_VERSION:
                        raise ApiError(
                            ErrorCode.STORAGE_ERROR,
                            f"Database schema version {version} is newer than this backend "
                            f"supports ({SCHEMA_VERSION}).",
                        )
                    for target, script in enumerate(MIGRATIONS[version:], start=version + 1):
                        for statement in _split_statements(script):
                            conn.execute(statement)
                        conn.execute(f"PRAGMA user_version = {target}")
                    conn.execute("COMMIT")
                except BaseException:
                    _rollback(conn)
                    raise
            finally:
                conn.close()
        except ApiError:
            self._initialized = False
            raise
        except (OSError, sqlite3.Error) as exc:
            self._initialized = False
            raise _storage_error("initializing the database", exc) from exc
        self._initialized = True

    def is_ready(self) -> bool:
        """Cheap readiness check used by /api/health."""
        if not self._initialized:
            return False
        try:
            conn = self._connect()
            try:
                version = conn.execute("PRAGMA user_version").fetchone()[0]
            finally:
                conn.close()
        except sqlite3.Error:
            return False
        return version == SCHEMA_VERSION

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """Yield a connection inside one transaction; commit on success, roll back on error."""
        if not self._initialized:
            raise ApiError(ErrorCode.STORAGE_ERROR, "Database is not initialized.")
        try:
            conn = self._connect()
        except sqlite3.Error as exc:
            raise _storage_error("opening the database", exc) from exc
        try:
            try:
                conn.execute("BEGIN IMMEDIATE")
            except sqlite3.Error as exc:
                raise _storage_error("starting a transaction", exc) from exc
            try:
                yield conn
            except sqlite3.Error as exc:
                _rollback(conn)
                raise _storage_error("running a query", exc) from exc
            except BaseException:
                _rollback(conn)
                raise
            try:
                conn.execute("COMMIT")
            except sqlite3.Error as exc:
                _rollback(conn)
                raise _storage_error("committing a transaction", exc) from exc
        finally:
            conn.close()


def _rollback(conn: sqlite3.Connection) -> None:
    if conn.in_transaction:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass


def _split_statements(script: str) -> list[str]:
    # executescript() would COMMIT implicitly, so run statements one by one
    # inside the migration transaction. Migrations contain no string literals
    # with semicolons.
    return [part.strip() for part in script.split(";") if part.strip()]
