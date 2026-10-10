"""Export the canonical OpenAPI snapshot (owner: Bhavya).

From backend/:  uv run --locked python -m app.export_openapi
Writes ../contracts/openapi.json deterministically.
"""

from __future__ import annotations

import json
import sys

from app.config import REPO_ROOT
from app.main import create_app

OPENAPI_PATH = REPO_ROOT / "contracts" / "openapi.json"


def render_openapi() -> str:
    return json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n"


def main() -> int:
    OPENAPI_PATH.parent.mkdir(parents=True, exist_ok=True)
    OPENAPI_PATH.write_text(render_openapi(), encoding="utf-8")
    print(f"wrote {OPENAPI_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
