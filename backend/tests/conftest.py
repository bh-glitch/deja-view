from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    # Never touch the demo database or real credentials in tests.
    return Settings(
        _env_file=None,
        prototype_mode="fixture",
        database_path=tmp_path / "test-fixture.db",
        insightface_root=tmp_path / "weights",
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client
