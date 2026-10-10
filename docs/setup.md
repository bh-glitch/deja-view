# Setup (verified Phase 0 commands)

Tested on macOS (Apple Silicon), 2026-10-10.

| Tool | Tested version | Pin |
|---|---|---|
| Node.js | 22.12.0 | `frontend/.nvmrc`, `engines.node: 22.x` |
| npm | 11.0.0 | `frontend/package-lock.json` |
| Python | 3.11.14 (uv-managed) | `backend/.python-version`, `requires-python ==3.11.*` |
| uv | 0.9.22 | `backend/uv.lock` |

## 1. Clone and branch

```sh
git clone https://github.com/bh-glitch/forget-not.git
cd forget-not
git switch -c <your-branch>   # bhavya/vision-integration, ishan/frontend, arnav/backend, vansh/speech-ai
```

## 2. Backend (from `backend/`)

```sh
uv sync --locked                       # installs Python 3.11 env + exact locked deps
cp .env.example .env                   # fixture mode by default; add keys only here
uv run --locked pytest
uv run --locked ruff check .
uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Do not use `--reload` or multiple workers for the recognition demo.

## 3. Frontend (from `frontend/`)

```sh
npm ci
cp .env.example .env.local             # BACKEND_URL=http://127.0.0.1:8000
npm run typecheck
npm run lint
npm run test                           # one-shot vitest
npm run dev                            # http://127.0.0.1:3000
npm run build && npm run start         # production server on 127.0.0.1:3000
```

`BACKEND_URL` is read when `next.config.ts` loads, and rewrites are compiled into
the build: set it **before** `npm run dev` / `npm run build`. Browser code calls
relative `/api/...` URLs only.

## 4. Contract regeneration (Bhavya only)

```sh
cd backend && uv run --locked python -m app.export_openapi   # -> contracts/openapi.json
cd ../frontend && npm run generate:api                       # -> src/generated/api-types.ts
```

`backend/tests/test_app.py::test_committed_openapi_snapshot_is_current` fails if
`contracts/openapi.json` is stale. Commit schema, snapshot and generated types together.

## 5. Model preparation

```sh
uv run --project backend --locked python scripts/prepare-models.py           # download official buffalo_l.zip if missing, extract, verify
uv run --project backend --locked python scripts/prepare-models.py --verify  # offline check before the demo
```

Weights go to `models/weights/buffalo_l/` (git-ignored). Checksums and license
notes are in `models/manifest.json`. The backend never downloads weights at
startup: the engine must load the local directory with
`providers=["CPUExecutionProvider"]`.

## 6. Modes and data

- `PROTOTYPE_MODE=fixture` (default) + `DATABASE_PATH=../data/prototype-fixture.db`.
  The UI shows **Fixture mode — synthetic data**.
- `PROTOTYPE_MODE=live` requires a non-fixture database, e.g. `DATABASE_PATH=../data/app.db`;
  settings refuse to start with a path containing "fixture".
- Relative paths resolve against `backend/`, independent of the shell's directory.
- Tests use temporary directories, never `data/`.

## Known setup notes

- InsightFace resolved to **2.1** (newer than the 0.7.x API in older docs). It
  depends on `opencv-python`, so that is the only OpenCV wheel installed. Do not add
  `opencv-python-headless`: both write to the same `cv2/` directory, and removing one
  breaks the other (`uv sync --reinstall-package opencv-python` repairs it).
- `npm audit` reports 5 high-severity advisories in `braces`, pulled in only by
  `eslint-config-next` (dev tooling). The suggested `--force` fix downgrades
  Next.js to 14, so it is intentionally not applied.
- Pytest shows one Starlette deprecation warning about `httpx` inside `TestClient`.
  It is harmless and has been left visible.
