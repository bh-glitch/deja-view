"""SQLite access (owner: Arnav).

Constructing ``Database`` performs no I/O. ``initialize`` is called explicitly by
main.py's lifespan; it creates/migrates the versioned schema and must never
reset existing live data. Use a per-operation connection (or an equivalently
synchronized strategy) with ``PRAGMA foreign_keys=ON``; do not share one
unsynchronized connection across threads.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.contracts import not_implemented


class Database:
    def __init__(self, path: Path):
        self.path = path

    def initialize(self) -> None:
        """Create parent directory and apply migrations. Raises ApiError(STORAGE_ERROR)."""
        raise not_implemented("Database initialization")

    def is_ready(self) -> bool:
        """Cheap readiness check used by /api/health."""
        return False

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """Yield a connection inside one transaction; commit on success, roll back on error."""
        raise not_implemented("Database transactions")
        yield  # pragma: no cover
