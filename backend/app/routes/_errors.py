"""Shared OpenAPI error documentation for routers (owner: Bhavya)."""

from typing import Any

from app.contracts import ErrorEnvelope

ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    "default": {"model": ErrorEnvelope, "description": "Error envelope (non-2xx)"},
}
