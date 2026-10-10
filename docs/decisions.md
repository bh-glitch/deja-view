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
- `FrameResult` (multi-face, 2026-10-10): `faces[]` of `FaceResult`; `matched` requires
  personId+similarity, `unknown` carries no identity; every face has a box; at most 8 faces;
  a personId appears on at most one face per frame.
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

### Implementation status (2026-10-10)
Bhavya implemented the trigger, capture, confirm, cooldown and stable-identity parts in
`frontend/src/lib/identity-tracker.ts`, `hooks/useAutoEnrollment.ts`, `components/EnrollmentCard.tsx`
and the `AppShell` controller (constants: 3 stable matches, 4 steady unknown frames, 4 target / 3 minimum
samples, 30 s cooldown). **Not yet implemented:** the 8 s listening window, voice name prefill, the
auto-listen toggle and the provider disclosure text. They need Vansh's recorder/STT/introduction; until
then the name is typed into the same confirm card. These files return to Ishan's ownership after merge.

## Multi-face recognition (human decision, 2026-10-10)

Replaces "one visitor at a time / multiple faces name nobody".
- Backend: detect all faces, keep the 8 largest, embed and match each independently with the
  same thresholds. If several faces match one person, only the strongest keeps the name.
- Frontend: per-face tracks matched by position (a jump larger than 0.6× the box size = new
  track). Each track needs 3 consecutive matches to show a name and clears on unknown or face loss.
  Overlay boxes are drawn per face; one identity card per recognized person.
- Enrollment is unchanged: it auto-starts only for a lone steady unknown face, and the
  sample endpoint still rejects frames with several faces (`MULTIPLE_FACES`).
- Cost: about 50 ms per extra face on the M3 CPU (6 faces ≈ 360–410 ms per frame).

## LAN/phone testing (human decision, 2026-10-10)
`npm run dev:lan` serves the frontend over HTTPS on the local network so a phone browser can use
its camera (front or back via **Switch camera**). Testing convenience only: no public hosting or
phone app. The backend stays bound to 127.0.0.1. The front-camera preview is mirrored, the back
camera is not, and overlay boxes follow the same rule. See `docs/setup.md` §7.
