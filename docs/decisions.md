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

## Auto-listen enrollment (human decision, 2026-10-10)

Replaces the "press Listen to enroll" trigger. Confirmation before saving is kept.

1. **Trigger:** camera on, exactly one face, and `unknown` for >= 4 consecutive frames
   (about 2 s at 2 fps). No enrollment, recording or speech playback is in progress, and no cooldown is active.
2. **Capture:** 3–5 enrollment samples via `/api/vision/enrollment-sample` from the live
   camera, all from the same single face. Abort and reset if the face is lost, a second face
   appears, or the box jumps (visitor change).
3. **Listen:** one window of at most **8 s**. The mic indicator and "Listening for an
   introduction…" text are visible, with a **Cancel** button; the window stops early when
   the user presses Stop. It never opens during TTS playback.
4. **Parse:** `transcribeAudio` → `draftIntroduction`. With `intent="introduction"` and a
   `displayName`, show **Save <name>?** (editable name/relationship + face preview). Otherwise show
   "Didn't catch a name" with Listen-again / type-name options.
5. **Confirm:** one tap → `createPerson` with the session's samples and client `personId`.
   **Not now** discards the samples and draft.
6. **Cooldown:** after Not now, a cancel, or a failure, no auto-listen until the face leaves
   (`no_face`) or 30 s pass. An already recognized person never triggers it.
7. **Disclosure:** UI text says introduction audio goes to ElevenLabs and its text to Gemini.
   An "Auto-listen for introductions" toggle (default on) lets the host turn it off.

This is not continuous listening: at most one bounded window per unfamiliar-face episode.
No one is enrolled without the confirmation tap. Conversation recording still needs an
explicit button press.

Frontend interface change: `useAudioRecorder().start(options?: { maxDurationMs?: number })`
(Vansh implements; Ishan calls it with 8000 for auto-listen).
