# Ishan — frontend (`ishan/frontend`)

Status: **assigned, not started.** Base: Phase 0 foundation on `main`.

## Owned paths
`frontend/src/**` except `frontend/src/generated/**`, `frontend/src/lib/audio/**`,
`frontend/src/hooks/useAudioRecorder.ts`. Frontend tests in `frontend/tests/` except audio tests.

Do not edit: `package.json`/`package-lock.json`, `next.config.ts`, `vitest.config.mts`,
generated types. Request changes in your task issue.

## Interfaces you consume (frozen)
- Types: `frontend/src/lib/api-client.ts` re-exports generated types (`Person`,
  `PersonDetail`, `FrameResult`, `EnrollmentSample`, `IntroductionDraft`, `MemoryDraft`,
  `MemoryDraftInput`, `CreatePersonRequest`, `CreateConversationRequest`, `Health`, ...).
- `apiFetch`, `apiJson<T>`, `ApiClientError {code, status, retryable, requestId}`.
- `getHealth`, `listPeople`, `createPerson`, `getPerson`, `deletePerson`,
  `createConversation`, `draftIntroduction`, `draftMemory` (all take an optional `AbortSignal`).
- `vision-client.ts`: `recognizeFrame(blob, signal)`, `captureEnrollmentSample(blob, signal)`.
- Vansh provides: `lib/audio/speech-client.ts` `transcribeAudio(blob, filename, signal)`,
  `speakText(text, signal) -> Blob`; `hooks/useAudioRecorder.ts` `useAudioRecorder()`.
- Synthetic fixtures: `src/fixtures/index.ts` (`fixtures.*`, from `contracts/examples`).

## Phase 1 (feasibility)
Fixture UI shell + explicit camera start → JPEG snapshot → `recognizeFrame` through the
proxy. Expect `503 MODEL_UNAVAILABLE` until the vision engine lands; show it as a state.

## Phase 2 acceptance
- Camera starts only on a button press; stop releases all tracks.
- About 2 fps, **one request in flight**, frames skipped while busy, unmirrored JPEG
  <= 1 MB with longest edge <= 1280. Back off if latency is high.
- Identity is shown only after N stable consecutive `matched` frames for the same
  `personId`. Clear it on `no_face`, `unknown`, `multiple_faces`, or a person change.
  Ignore stale responses (abort or session token). Scale/mirror boxes from
  `frameWidth`/`frameHeight`.
- Enrollment: one visitor, 3–5 samples bound to one session with a client UUID; introduction →
  editable name/relationship beside the preview → confirm → `createPerson` (reuse the same
  `personId` on retry). If the person is already recognized, open the profile instead.
- Person view: latest cue, or **No saved conversation yet**; history newest first; delete
  with confirmation.
- Conversation: lock `personId` at recording start; editable draft; save only after review
  with `reviewedByUser: true` and an accurate `editedByUser`.
- Who is this?: speaks name/relationship/latest cue on request only. Keep text visible if
  speech fails; drop stale audio when the person changes.
- Persistent **Fixture mode — synthetic data** banner when `health.mode === "fixture"`.
- Accessible loading/error/retry states for every `ApiClientError.code`.
- `npm run typecheck && npm run lint && npm run test && npm run build` pass.

## Auto-listen enrollment (decision 2026-10-10, see `docs/decisions.md`)
Replaces "press Listen to enroll". Implement the trigger state machine (unknown-stable
→ capture 3–5 samples → one ≤8 s listening window → **Save <name>?** one-tap confirm, Not now,
cooldown, auto-listen toggle, disclosure text). Call `useAudioRecorder().start({ maxDurationMs: 8000 })`.
