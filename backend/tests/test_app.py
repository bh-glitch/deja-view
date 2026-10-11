"""Foundation app behaviour: envelopes, errors, placeholders (owner: Bhavya)."""

from __future__ import annotations

import pytest

from app.config import REPO_ROOT, Settings
from app.contracts import REQUEST_ID_HEADER, ErrorEnvelope, HealthResponse
from app.export_openapi import OPENAPI_PATH, render_openapi


def test_health_envelope_reports_fixture_mode(client) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = HealthResponse.model_validate(response.json())
    assert body.data.mode == "fixture"
    assert body.data.vision.ready is False
    assert response.headers[REQUEST_ID_HEADER] == body.request_id


def _assert_error(response, status: int, code: str) -> None:
    assert response.status_code == status, response.text
    body = ErrorEnvelope.model_validate(response.json())
    assert body.error.code == code
    assert response.headers[REQUEST_ID_HEADER] == body.request_id


def test_unknown_route_uses_error_envelope(client) -> None:
    _assert_error(client.get("/api/nope"), 404, "NOT_FOUND")


def test_validation_errors_use_envelope(client) -> None:
    _assert_error(client.post("/api/ai/memory", json={}), 422, "VALIDATION_ERROR")


@pytest.mark.parametrize(
    ("method", "path", "kwargs", "status", "code"),
    [
        # Implemented speech/AI routes fail explicitly without credentials (tests have none).
        (
            "post",
            "/api/ai/introduction",
            {"json": {"transcript": "hi"}},
            503,
            "PROVIDER_NOT_CONFIGURED",
        ),
        ("post", "/api/audio/speak", {"json": {"text": "hi"}}, 503, "PROVIDER_NOT_CONFIGURED"),
        (
            "post",
            "/api/audio/transcribe",
            {"files": {"audio": ("a.webm", b"x", "audio/webm")}},
            503,
            "PROVIDER_NOT_CONFIGURED",
        ),
        (
            "post",
            "/api/vision/recognize",
            {"files": {"frame": ("f.jpg", b"x", "image/jpeg")}},
            503,
            "MODEL_UNAVAILABLE",
        ),
    ],
)
def test_placeholders_fail_explicitly(client, method, path, kwargs, status, code) -> None:
    _assert_error(getattr(client, method)(path, **kwargs), status, code)


def test_live_mode_rejects_fixture_database(tmp_path) -> None:
    with pytest.raises(ValueError, match="fixture"):
        Settings(
            _env_file=None,
            prototype_mode="live",
            database_path=tmp_path / "prototype-fixture.db",
        )


def test_relative_paths_resolve_against_backend_dir() -> None:
    settings = Settings(_env_file=None, database_path="../data/app.db", prototype_mode="live")
    assert settings.database_path == (REPO_ROOT / "data" / "app.db").resolve()


def test_import_has_no_side_effects(settings) -> None:
    from app.main import create_app

    create_app(settings)
    assert not settings.database_path.exists()


def test_committed_openapi_snapshot_is_current() -> None:
    assert OPENAPI_PATH.read_text() == render_openapi(), (
        "contracts/openapi.json is stale: run `uv run --locked python -m app.export_openapi`"
    )
