# Foundation decisions (Phase 0)

Routine choices made in the scaffold. Changes go through Bhavya.

## Contracts
- `backend/app/contracts.py` is the only wire schema. `WireModel` = camelCase
  aliases, `extra="forbid"`, frozen, and output schemas mark serialized defaults
  required (so responses type nullable fields as `T | null`, not optional).
- `MemoryDraft` therefore appears as `MemoryDraft-Input` (`facts` optional) and
  `MemoryDraft-Output` in OpenAPI; the frontend aliases them as `MemoryDraftInput`
  and `MemoryDraft`.
- Timestamps must be timezone-aware on input and are serialized as UTC `...Z`.
- Blank relationship strings normalize to `null`; names/relationships are trimmed.
- Limits not fixed by the README: fact text <= 240 chars, evidence quotes <= 300.
- `FaceModel` identity = `packName` + `recognitionFile` + `recognitionSha256` +
  `dimension` + `normalization ("l2")`. Vectors are comparable only if all equal.
- `FrameResult`: `matched` requires personId+similarity+box; `unknown` requires a
  box and no identity; `no_face`/`multiple_faces` carry neither box nor identity.
- Success: `{ok:true,data,requestId}`. Errors: `{ok:false,error:{code,message,retryable},requestId}`.
  Every response also carries an `X-Request-ID` header. Error codes, HTTP statuses
  and retryability are frozen in `ERROR_STATUS`.
- Create endpoints return **201**; other successes 200; speech returns raw `audio/mpeg`.

## Error codes

| Code | HTTP | Retryable |
|---|---|---|
| BAD_REQUEST | 400 | no |
| VALIDATION_ERROR | 422 | no |
| NOT_FOUND | 404 | no |
| METHOD_NOT_ALLOWED | 405 | no |
| CONFLICT | 409 | no |
| PAYLOAD_TOO_LARGE | 413 | no |
| UNSUPPORTED_MEDIA_TYPE | 415 | no |
| INVALID_IMAGE | 422 | no |
| NO_FACE / MULTIPLE_FACES / FACE_INADEQUATE | 422 | yes |
| EMBEDDING_INVALID | 422 | no |
| MODEL_MISMATCH | 409 | no |
| ENROLLMENT_INCOHERENT | 422 | yes |
| EMPTY_AUDIO / EMPTY_TRANSCRIPT | 422 | yes |
| AI_OUTPUT_INVALID | 502 | yes |
| PROVIDER_NOT_CONFIGURED | 503 | no |
| PROVIDER_RATE_LIMITED | 429 | yes |
| PROVIDER_TIMEOUT | 504 | yes |
| PROVIDER_ERROR | 502 | yes |
| MODEL_UNAVAILABLE | 503 | no |
| STORAGE_ERROR | 503 | yes |
| NOT_IMPLEMENTED | 501 | no |
| INTERNAL_ERROR | 500 | yes |

Client-only codes in `frontend/src/lib/api-client.ts`: `NETWORK_ERROR`, `INVALID_RESPONSE`.
A cancelled request re-throws the browser's `AbortError` unchanged.

## Backend structure
- Import root is `app` (run from `backend/`; pytest uses `pythonpath=["."]`).
- `main.create_app(settings)` builds the app; `lifespan` explicitly initializes
  `Database`, `GalleryCache` and the face engine onto `app.state`. Failures are
  recorded and reported by `/api/health` instead of crashing startup.
- Routes get services only via `app/http/deps.py`. Blocking work (SQLite,
  inference, decoding) runs in `run_in_threadpool`.
- `app/http/` (envelope, uploads, deps) is shared transport owned by Arnav; its
  signatures are frozen and changed only through Bhavya.
- Vision routes: `read_bounded_upload` -> `decode_jpeg` -> `GalleryCache.get(engine.model)`
  -> `engine.recognize`. The engine receives a `Gallery`, never SQL.

## Dependencies
- Backend: exact pins in `pyproject.toml`, `uv.lock`. Only `opencv-python` (required by InsightFace 2.1).
- Frontend: exact pins; added vitest, @vitejs/plugin-react, jsdom, Testing Library
  (component tests) and openapi-typescript (codegen). No runtime validation library;
  the client checks the envelope shape and relies on the generated types.
- `@types/node` is 22.x to match the Node 22 runtime (needed by vitest peer range).
- Next.js `next/font/google` removed so builds do not need network access.
- Kept the create-next-app 16.4 defaults `cacheComponents` and `partialPrefetching`.
