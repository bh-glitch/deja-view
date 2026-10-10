# forget-not — four-person HackRU 2026 prototype

## Product

forget-not is an assistive familiar-person reminder prototype inspired by face blindness and dementia. A laptop webcam recognizes a previously enrolled friend or family member and shows their confirmed name, relationship, and a short reminder from their last saved conversation. The user can press **Who is this?** to hear the information aloud.

Build one working local demo in a 24-hour hackathon. Use consenting teammates, demo names, and fictional conversation details. Describe this as a prototype.

Confirmed MVP decisions:

- Start with a laptop webcam, one app user, and one visible visitor at a time.
- The user explicitly enables the camera. Recognition then runs automatically.
- The user presses a listening button, speaks naturally, and confirms the proposed person before enrollment.
- Store 3–5 face embeddings per person, with their confirmed name and optional relationship.
- Record conversations only after an explicit button press; review the generated reminder before saving.
- Show the latest saved reminder when the person returns. New people show **No saved conversation yet**.
- Unknown, weak, or ambiguous matches remain **Unknown**. Multiple faces must not receive misleading labels.
- Use SQLite on the demo computer. Saved people and conversations survive a backend restart.
- Keep recognition and face images local. Only explicitly recorded audio/text goes to the selected speech/AI providers.
- No public hosting, accounts, phone/glasses integration, device synchronization, continuous listening, speaker-to-face attribution, or voice cloning in the first version.

This file is a build specification, not a report of completed implementation. Do not claim any scaffold, test, provider access, or demo behavior already works until verified.

## Stack and runtime

| Part | Tool | Location |
|---|---|---|
| Frontend | Next.js App Router, React, TypeScript, Tailwind CSS | Browser and local UI server |
| Backend | Python, FastAPI, Uvicorn | Local Python process |
| Face detection and alignment | InsightFace `FaceAnalysis`, explicitly selecting `buffalo_l` | Python backend |
| Face embedding | ArcFace recognition model in `buffalo_l` | Python backend; expected 512 numbers, verified during setup |
| Model runtime | ONNX Runtime, CPU initially | Python backend; no required GPU |
| Recognition | Cosine similarity against saved embeddings, with rejection/stability rules | Backend matching; frontend stable display |
| Storage | SQLite through Python's built-in `sqlite3` | One local database file |
| Speech to text | ElevenLabs Scribe `scribe_v2` | Server-side REST request |
| Introduction and memory drafts | Gemini through Python `google-genai`, validated with Pydantic | Python backend |
| Spoken reminder | ElevenLabs `eleven_flash_v2_5` | Server-side REST request |

Use `buffalo_l` explicitly. The [official model guide](https://github.com/deepinsight/insightface/blob/master/python-package/docs/model_zoo.md) lists SCRFD-10GF detection and ResNet50 recognition for this pack. Verify actual model output and laptop performance; do not call it universally “highest accuracy” or “best” without comparative evidence.

InsightFace library code is MIT licensed; provided pretrained weights are restricted to **non-commercial research**. Preserve their license/provenance and do not describe them as unrestricted commercial assets. A hackathon entry does not itself establish model-license eligibility. See the [official license policy](https://github.com/deepinsight/insightface#license).

Keep Next.js as the frontend, with **one FastAPI backend** handling recognition, storage, and provider requests. Do not introduce a second Node application backend, Human/MediaPipe recognition, `better-sqlite3`, a vector database, or a subprocess launched per video frame.

Local development uses Next.js on `127.0.0.1:3000` and FastAPI on `127.0.0.1:8000`. Next.js rewrites `/api/:path*` to the backend's `/api/:path*`, so browser requests use relative URLs. Test JPEG/audio uploads and binary speech through this proxy. Do not duplicate these endpoints as Next.js route handlers. See [Next.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites).

GitHub shares code; it does not run the app or synchronize SQLite. Each teammate can run an independent local development instance. The final webcam demo uses one computer and its one database. Other teammates do not need to connect their devices to the demo backend. Remote cameras/network hosting are later work.

## Ownership

| Person | Branch | Responsibility | Owned files |
|---|---|---|---|
| Bhavya | `bhavya/vision-integration` | Face pipeline, initial scaffold, shared interfaces, integration and demo coordination | Root docs/config, dependency manifests/locks, `contracts/`, `backend/app/config.py`, `backend/app/contracts.py`, `backend/app/main.py`, `backend/app/vision/`, `frontend/src/generated/`, model preparation and vision tests |
| Ishan | `ishan/frontend` | Camera UI/transport, enrollment, people/history views, conversation controls, loading/error states | `frontend/src/` except generated files and Vansh's audio paths; frontend tests except audio tests |
| Arnav | `arnav/backend` | SQLite, person/conversation endpoints, health, vision HTTP transport | `backend/app/db/`, `backend/app/http/`, `backend/app/routes/people.py`, `conversations.py`, `health.py`, `vision.py`; backend data/API tests |
| Vansh | `vansh/speech-ai` | Recorder, transcription, grounded Gemini drafts, speech playback | `backend/app/providers/`, `backend/app/ai/`, `backend/app/routes/audio.py`, `ai.py`, `frontend/src/lib/audio/`, `frontend/src/hooks/useAudioRecorder.ts`; speech/AI tests |

Bhavya coordinates integration and is the proposed demo host. This is a coordination duty alongside face recognition. Ishan owns UI behavior; Arnav owns backend transport/persistence; Vansh owns provider behavior. One owner per file. After bootstrap, Bhavya coordinates other owners' fixes rather than silently editing their modules.

Only Bhavya changes shared schemas, dependency manifests, lockfiles, generated contract files, and common configuration. Other agents request changes through their task issue. Owners may make ordinary implementation choices inside their area; they do not need to ask the human about every helper.

Planned structure:

```text
README.md / AGENTS.md / CLAUDE.md
contracts/openapi.json
contracts/examples/                 # synthetic shared request/response examples
docs/phase-state.md
docs/setup.md / demo.md / decisions.md
docs/vision-validation.md
docs/provider-validation.md
docs/release-validation.md
frontend/
  package.json / package-lock.json / .nvmrc / .env.example
  src/app/                          # no duplicate application API routes
  src/components/
  src/hooks/
  src/lib/api-client.ts
  src/lib/vision-client.ts
  src/lib/audio/
  src/generated/api-types.ts
  src/fixtures/                     # clearly synthetic
  tests/
backend/
  pyproject.toml / uv.lock / .python-version / .env.example
  app/__init__.py / main.py / config.py / contracts.py
  app/http/ / db/ / vision/ / providers/ / ai/ / routes/
  tests/
scripts/prepare-models.py
models/manifest.json                 # provenance/checksums/license notes
models/weights/                     # downloaded, ignored
data/                               # runtime SQLite, ignored
```

Most specific ownership wins. Tests belong to the corresponding module owner; Bhavya owns cross-module integration checks and phase records. Bootstrap may create placeholders in every area before ownership is handed over.

## Before parallel work

Bhavya's initial Claude Code session creates and commits a small foundation containing:

- The agreed folder structure, instructions, and verified local startup/build commands.
- Compatible pinned Node/Python versions and locked dependencies. Start by evaluating Node 22.x and Python 3.11.x; record exact tested versions, not guessed compatibility.
- Canonical Pydantic request/response models, an exported OpenAPI snapshot, and generated frontend TypeScript declarations.
- Importable typed placeholders for vision, database, provider services, routes, frontend components, and client functions. Fix their signatures before delegation.
- A working Next.js-to-FastAPI proxy and visible fixture mode.
- `.gitignore` excluding secrets, databases, recordings, embeddings, downloaded weights, virtual environments, dependencies, and build output.
- Example configuration and model-preparation instructions without secrets.
- A task/handoff for each person, including owned paths, exact interfaces, acceptance criteria, and foundation commit.

Placeholders return explicit **unavailable/not implemented** errors in live mode. They must not pretend recognition or AI works. A fixture shell is useful for Ishan, but cannot pass live acceptance.

After the foundation checks pass, report its commit and stop feature implementation until the human has invited teammates and assigned their sessions. Do not automatically spawn extra agents or create new user-owned chats. Teammates can read/prepare beforehand, but parallel feature implementation starts from the same foundation.

## Setup and environment

Use npm and one `package-lock.json` for the frontend. Use uv, one `pyproject.toml`, and one `uv.lock` for the Python backend. Direct dependencies are pinned; no independent upgrades. See [uv projects](https://docs.astral.sh/uv/guides/projects/).

Backend dependencies cover FastAPI/Uvicorn, Pydantic, InsightFace, CPU ONNX Runtime, NumPy, compatible OpenCV, `google-genai`, HTTPX, multipart uploads, and env loading. SQLite is built into Python. Choose an OpenCV distribution compatible with the selected InsightFace package; do not install conflicting wheels. Use pytest/Ruff for Python and TypeScript/ESLint/Vitest for frontend checks. Add tooling only for a concrete need.

Required commands are targets for the scaffold to implement and verify, not claims that scripts exist yet.

From `frontend/`:

```sh
npm ci
npm run dev          # local UI :3000
npm run typecheck
npm run lint
npm run test         # one-shot, not watch mode
npm run build
npm run start
npm run generate:api # uses committed ../contracts/openapi.json
```

From `backend/`:

```sh
uv sync --locked
uv run --locked uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
uv run --locked pytest
uv run --locked ruff check .
```

Do not use reload/multiple workers for the final recognition demo. Bhavya verifies clean installation, package imports, production UI startup, and a backend request through the proxy. Document exact model preparation and OpenAPI export commands in `docs/setup.md`.

`frontend/.env.example`:

```dotenv
BACKEND_URL=http://127.0.0.1:8000
```

`backend/.env.example`:

```dotenv
PROTOTYPE_MODE=fixture
DATABASE_PATH=../data/prototype-fixture.db
INSIGHTFACE_MODEL=buffalo_l
INSIGHTFACE_ROOT=../models/weights
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
ELEVENLABS_API_KEY=
ELEVENLABS_STT_MODEL=scribe_v2
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_VOICE_ID=
```

Backend secrets live in untracked `backend/.env`; the frontend's rewrite target lives in untracked `frontend/.env.local`. No provider key may use `NEXT_PUBLIC_`. Resolve relative model/database paths against the documented backend directory, regardless of the invoking shell's directory.

The backend validates mode and reports it through health. The UI displays a persistent **Fixture mode — synthetic data** banner in fixture mode. Live mode uses a separate database such as `../data/app.db` and rejects the fixture database path. Never reset live data during startup.

Vansh verifies the configured Gemini model and ElevenLabs voice against the team's actual account. The initial Gemini model is configurable and must be checked against the [official catalog](https://ai.google.dev/gemini-api/docs/models). Missing access is a reported blocker; no silent substitution or fake success. Check available credits before demo calls; do not promise unlimited free usage or start a paid subscription. The supplied [ElevenLabs hackathon guide](https://docs.google.com/document/d/1mCh5MtOzBw0aJpurQVUmIVFfPMAHW3MjNemE-LNiMto/edit) is an offer to verify, not proof that the team's account has been activated.

## Shared contracts and handoffs

`backend/app/contracts.py` is the authoritative wire schema. Bhavya exports it to `contracts/openapi.json` and generates `frontend/src/generated/api-types.ts`. Never hand-edit generated declarations or invent a second interface. Runtime response validation and synthetic examples must agree with the canonical schema. Regeneration must not leave unexplained differences.

Public JSON uses consistent camelCase keys. Python can use internal snake_case with explicit tested aliases. IDs are UUIDs; timestamps are UTC ISO strings. Names are trimmed, 1–80 characters; relationship is trimmed, at most 120 characters or null. Validate all boundaries and return ordinary JSON numbers, not NumPy objects.

Required records:

- `Person`: `id`, `displayName`, nullable `relationship`, `createdAt`, `updatedAt`.
- `FaceModel`: model/pack identifier, exact version/checksum identity, dimension, and normalization. Expected dimension is 512; verify before live saves.
- `IntroductionDraft`: `intent` (`introduction|other`), nullable `displayName`, `relationship`, `nameEvidence`, `relationshipEvidence`.
- `MemoryDraft`: `summary` up to 500 characters, `cue` up to 240, and up to three `{ text, evidenceQuote }` facts. Empty facts are allowed.
- `Conversation`: `id`, `personId`, start/end timestamps, original `transcript`, `source` (`speech|typed`), `memory`, `reviewedByUser: true`, `editedByUser`, `createdAt`.
- `PersonDetail`: person, conversations ordered newest end-time first with deterministic tie-break, and nullable `latestCue`.
- `FrameResult`: `status` (`no_face|multiple_faces|unknown|matched`), nullable `personId`/`similarity`/`box`, and decoded `frameWidth`/`frameHeight`. Non-matched results have no person identity. A box contains `x`, `y`, `width`, `height` in submitted-image pixels.
- `EnrollmentSample`: one normalized embedding, model metadata, box, and decoded frame dimensions. It is transient until enrollment is confirmed.

JSON success uses `{ ok: true, data, requestId }`; errors use `{ ok: false, error: { code, message, retryable }, requestId }` with a non-2xx status. Normalize FastAPI validation/HTTP/unhandled errors into this format. Speech success is the sole exception: MP3 bytes with `audio/mpeg` and a request ID header; speech failures still use JSON. Never return HTTP 200 for an error.

| HTTP endpoint | Owner | Request / result |
|---|---|---|
| `GET /api/health` | Arnav | Mode, database/vision readiness, verified model metadata or null, credential-presence booleans; presence is not provider validation |
| `GET /api/people` | Arnav | `{ people: Person[] }` |
| `POST /api/people` | Arnav | Client-allocated `personId`, name/relationship, model metadata, 3–5 embeddings → `{ person }` |
| `GET /api/people/{personId}` | Arnav | `PersonDetail` or 404 |
| `DELETE /api/people/{personId}` | Arnav | Explicit deletion, cascade removal → deleted person ID |
| `POST /api/conversations` | Arnav | Stable client-allocated `conversationId`, person ID, timing, original transcript/source, reviewed memory → `{ conversation }` |
| `POST /api/vision/recognize` | Arnav transport / Bhavya engine | Multipart JPEG field `frame` → `FrameResult` |
| `POST /api/vision/enrollment-sample` | Arnav transport / Bhavya engine | Multipart JPEG field `frame` → `EnrollmentSample`; reject zero/multiple/inadequate faces |
| `POST /api/audio/transcribe` | Vansh | Multipart field `audio` → `{ transcript }` |
| `POST /api/ai/introduction` | Vansh | `{ transcript }` → `IntroductionDraft` |
| `POST /api/ai/memory` | Vansh | `{ transcript }` → `MemoryDraft` |
| `POST /api/audio/speak` | Vansh | `{ text }` → verified MP3 bytes |

Bhavya freezes full schemas, error codes/statuses, and exported helper signatures in the foundation. Arnav's thin vision routes pass gallery data into Bhavya's engine; the engine does not import SQL repositories. Vansh's AI routes do not save people/conversations. Ishan's controller calls the confirmed save endpoints.

Use one Python import root, `app`, from the backend environment. Do not mix `app...` with `backend.app...` or add import-path hacks. Configure frontend `@/` and tests consistently. Contracts import no database, model engine, or provider clients. Lower layers never import main/routes; avoid circular imports. Imports must not open SQLite, download weights, run inference, or require keys. Runtime initialization is explicit.

## Face pipeline and enrollment

The webcam is managed by Ishan's frontend. Send resized, unmirrored JPEG snapshots to the local backend. Start at about **2 frames per second**, with **one request in flight**. Skip frames while busy; never build a backlog. Bound uploaded bytes to 1 MB and the decoded longest edge to 1280 pixels. Validate image contents/dimensions rather than trusting MIME alone. If CPU inference is slower, reduce sampling based on measured latency.

Bhavya's engine uses InsightFace detection/alignment/recognition and normalized embeddings; it does not train a model. `FaceAnalysis` and `face.normed_embedding` must be verified against the installed package and [official implementation](https://github.com/deepinsight/insightface/blob/master/python-package/insightface/app/common.py). Landmarks are alignment inputs, not the stored identity vector.

Prepare official `buffalo_l` weights before the demo. Record origin, version, checksums, dimension, preprocessing, and license. Keep weights out of Git. Normal startup must reuse verified local assets or report unavailable; no surprise model download during judging. Initialize one engine per backend process and serialize inference safely. Run blocking CPU work outside the async request loop so it does not freeze every endpoint.

Recognition compares the query against saved normalized embeddings using cosine similarity. Group scores by person and take that person's best sample. Apply a calibrated minimum score and a margin over the second-best **person**. Samples of the same person are not competing identities. An empty gallery returns unknown. Do not display scores as probability percentages.

The backend's matched result means a single frame passed its acceptance rules. Ishan requires stable consecutive results before displaying the identity, discards stale requests/session results, and clears old identity on face loss, unknown, multiple faces, or visitor changes. Scale/mirror overlay boxes using returned image dimensions; do not attach an old person's name to a new face.

Enrollment flow:

1. Exactly one consenting visitor is present. Capture several distinct samples across modest angles and retain an ephemeral preview.
2. Press Listen, speak a natural self-introduction, and stop. Typed input is an explicit alternative.
3. Transcribe, parse, and show editable name/relationship beside the captured preview.
4. Confirm the person. Persist the person plus 3–5 coherent samples atomically.
5. Refresh recognition/person data. An already recognized person opens their profile rather than silently creating a duplicate.

Bind samples, introduction, preview, and person ID to one enrollment session. Reject mixed samples and reset/reconfirm if the visitor changes. Never silently enroll from speech alone. Raw frames remain transient; do not save images or send them to Gemini/ElevenLabs.

Bhavya tests real enrolled returns, an unknown volunteer, multiple faces, face loss, pose/lighting changes, actual descriptor dimensions, and end-to-end latency on the demo laptop. Record limitations without inventing accuracy statistics.

## Database behavior

Arnav creates versioned `people`, `face_samples`, and `conversations` tables. Store each normalized embedding as JSON, with its person foreign key and exact model metadata. SQLite stores numbers; Bhavya's engine performs recognition. Use bound SQL parameters and validate parsed JSON on both reads and writes.

Reject nonfinite, empty, wrong-size, non-normalized, or mismatched-model vectors. Check enrollment coherence through Bhavya's agreed helper. A model change needs re-enrollment or an approved migration; never compare incompatible vectors.

Create the person and samples in one transaction. Enable foreign keys and cascade deletion. Same mutation ID + same normalized request returns the original result; same ID + different request returns conflict. Preserve IDs through retries to avoid duplicate people/conversations. Verify conversation person existence and end time ≥ start time.

Use a safe SQLite connection/transaction strategy across FastAPI threads; do not share an unsynchronized connection by merely disabling thread checks. Keep a validated backend gallery cache and invalidate it after enrollment/deletion. No repeated SQL query or database write per camera frame. Tests use temporary databases, never the demo database.

Health/person routes should remain usable when a model/provider is unavailable. Saved recognition and text cues must not depend on Gemini or ElevenLabs availability.

## Speech, memory, and playback

Vansh implements a browser recorder with supported MIME detection, correct file MIME/extension, visible listening state, cancellation, and track cleanup. Limit recordings to **60 seconds / 2 MB** and explain the limit. Limit transcripts to 20,000 characters and TTS requests to 400 characters. Longer conversation chunking is later work. Do not record during synthesized playback.

Our upload field is `audio`; ElevenLabs Scribe expects provider field `file` and `model_id`. Map them explicitly and validate its returned `text`. HTTPX/FormData constructs multipart boundaries; do not manually send a broken Content-Type. Follow the [Scribe endpoint](https://elevenlabs.io/docs/api-reference/speech-to-text/convert).

Use the official Python [`google-genai` SDK](https://googleapis.github.io/python-genai/), not JavaScript or obsolete SDK examples. Treat the transcript as untrusted data, never instructions to execute. Introduction parsing extracts an explicit self-introduction; unrelated/quoted third-person mentions are not automatic registration. Missing name/relationship stays null. Do not infer family relationships or identify anonymous speakers from a face.

Memory drafts contain only supported details and literal evidence quotes. Evidence quotes and introduction evidence must occur in the original transcript. Ambiguous attribution uses neutral wording. Empty/unhelpful audio produces a recoverable state, not an invented memory. Validate structured output, allow at most one bounded repair for malformed output, and otherwise offer manual editing. Rate limits/timeouts produce clear retry states, not uncontrolled loops.

A conversation locks its selected person ID when recording starts. Camera changes must not reassign it. Preserve the original transcript; show an editable draft and save only after review. Record whether the user edited it; do not fabricate evidence quotes for edits. Changing profiles must not attach a previous person's draft to the new profile.

Who is this? speaks the confirmed stored name/relationship and latest saved cue. Keep the composed text within 400 characters by shortening the reminder at a sentence boundary or omitting an optional relationship; never silently alter the person's name. Send an explicit configured voice/model to the [ElevenLabs speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), verify returned audio, and play only on request. Repeated frames never trigger TTS. Cancel/ignore stale speech when the intended person changes. Release audio URLs and keep text visible if speech fails.

Keys remain server-only. Use bounded provider timeouts, sanitized errors, and explicit retries. Mocked unit tests and actual API validation are separate evidence. Verify one real transcription, Gemini draft, and TTS call before claiming each live capability works.

Gemini's [unpaid-service terms](https://ai.google.dev/gemini-api/terms) restrict sending personal/sensitive/confidential information. For this demo use aliases and fictional conversation content, with no face imagery in Gemini. Clearly indicate that audio is sent to ElevenLabs and text to Gemini when those features are used.

## Phases and run order

| Phase | Who runs | Exit condition |
|---|---|---|
| 0 — Shared foundation | Bhavya's initial agent only | Locked scaffold, typed interfaces/placeholders, imports/checks and proxy work; foundation committed; assignments ready |
| 1 — Feasibility | All four after joining | Bhavya: real CPU vision/descriptor probe. Arnav: SQLite transaction/restart probe. Vansh: provider/model/voice access. Ishan: fixture UI and camera/proxy round trip. Correct shared interfaces together |
| 2 — MVP modules | All four in parallel | Each implements owned modules against frozen contracts, runs relevant checks, and hands off a PR/commit with evidence |
| 3 — Integration | Bhavya merges sequentially; owners fix their areas | Arnav backend → Vansh speech/AI → Bhavya vision → Ishan UI; actual complete journey works |
| 4 — Demo validation | Whole team with Bhavya coordinating | Clean install/build, real demo, failure/recovery checks, persistence and honest limitations recorded |

Bhavya records phase, approved base commit, contract/model version, blockers, and next permitted work in `docs/phase-state.md`. Publish interface corrections before dependent work starts. No agent independently changes the phase.

Reserve several hours for integration and submission. If a provider/account blocks live validation, continue independent local work and report the missing capability. A fixture-only flow is not the complete live product. Agree any reduced demo scope with the human rather than quietly removing requirements.

## GitHub workflow and communication

1. Use one repository and invite Bhavya, Ishan, Arnav, and Vansh as collaborators. Each person clones it onto their own computer and uses their assigned branch. Multiple branches in one checkout are not isolated workspaces; use separate clones/worktrees if agents share a machine.
2. Commit the foundation first. Create one task issue per assignment with owned paths, dependencies, exported interfaces, and acceptance criteria.
3. Every agent reads README, instructions, phase state, and current task issues before starting. Announce its branch/base commit and implementation plan in its issue.
4. Work only inside ownership. Request shared/interface/dependency changes in the issue, naming affected owners. Bhavya coordinates the decision, commits the change, and records which base consumers must adopt. No response is not approval.
5. Update the task after a material milestone/blocker. Report the actual error, checks performed, next step, and dependency owner. Do not claim another agent has completed work or received a message without evidence.
6. Commit small complete changes, inspect the diff, and push/open a PR when authorized GitHub access is available. Include changed files, tests actually run, exact exports, unresolved dependencies, and limitations. Feature agents do not merge main.
7. Bhavya reviews/merges one change at a time in the stated order, checking imports/types and relevant tests after each merge, and the whole suite after the batch. Stop on a new failure; its owner supplies the smallest fix. Resolve conflicts with owners, never blindly select ours/theirs or drop checks.
8. Everyone pulls/adopts the approved main commit before the next phase. Preserve existing work; no force-push or history rewriting.

Separate Claude Code/Codex sessions do not automatically share conversations or uncommitted files. README, committed contracts, GitHub issues/PRs, and phase state are common memory. Use actual GitHub coordination only when access is authorized and available; never invent notifications. If unavailable, record each owner's status in `docs/agents/<name>.md` and have the humans/Bhavya relay updates. Branch-local status copies can be stale; obtain the current issue or lead's snapshot before dependent work. No busy polling and no edits to another owner's status file.

## Prompt for each agent

Give each session its person's assignment from the ownership table:

> Read README.md, AGENTS.md, and CLAUDE.md before editing. You are working as [NAME] on [BRANCH]. Implement [RESPONSIBILITY] in the currently released phase using the committed shared contracts. Stay inside your owned files and preserve other work. Read current task/phase status so you know what the other owners provide. Request shared/schema/dependency changes through your task issue rather than editing another owner's files. Verify unfamiliar APIs against installed packages and official sources. Run checks appropriate to your change and report actual evidence. Never invent exports, provider results, notifications, tests, or completed features; never hide errors with mocks or weakened checks. Commit small changes and, when authorized access exists, push/open a PR. Do not merge main, re-scaffold, silently change the stack, or implement stretch features. Report changed files, exports, test results, dependencies, and blockers. Do not spawn extra agents unless the human explicitly asks.

Role focus:

- **Bhavya:** First create the foundation and exact handoffs, then implement InsightFace and matching. Coordinate shared changes, merge compatible contributions, and validate the final demo. After ownership transfers, ask owners to repair their modules.
- **Ishan:** Build camera/enrollment/history/conversation UI against the agreed typed interfaces. Own frame sampling, stable display, request cancellation, accessible states, and final UI wiring. Use clearly labeled fixtures while backend work proceeds.
- **Arnav:** Implement SQLite and HTTP transport/validation, idempotency, readiness, and persistence. Call Bhavya's recognition interface without reimplementing it. Keep provider generation out of persistence routes.
- **Vansh:** Implement explicit recording, real STT/TTS, grounded structured Gemini drafts, and browser playback cleanup. Use shared schemas; never silently save enrollment/conversations from AI output.

### First prompt to paste into Claude Code

> Read README.md, AGENTS.md, and CLAUDE.md. Build forget-not using this specification. You are Bhavya's initial setup/integration agent. Begin with Phase 0 only: inspect the repository, preserve existing work, create the common scaffold and exact typed interfaces, verify locked installs/imports/startup/proxy/check commands, and commit the foundation. Create concise instructions that require every future agent to follow this README. Prepare the other three assignments and their branch/handoff prompts. Then report the foundation commit, setup steps, tests actually run, and blockers, and stop feature implementation until I invite the teammates. Do not spawn additional agents, build four independent apps, publish, start subscriptions, or claim placeholder features are complete.

## Final demo checklist

- [ ] Clean locked frontend/Python installs and required checks pass on the final commit.
- [ ] Verified local weights load; the actual embedding dimension/model metadata match stored samples.
- [ ] Camera starts explicitly, samples without overlapping requests, and releases tracks on stop.
- [ ] Spoken introduction → editable confirmation → correct person and coherent samples saved atomically.
- [ ] Returning visitor gets a stable correct name/relationship; unknown, ambiguous, multiple-face and departed-person states do not retain a misleading identity.
- [ ] Conversation recording locks the intended person, generates a grounded draft, and saves only after review.
- [ ] The latest saved cue appears on return; a new person has a clear no-history state.
- [ ] Who is this? plays real ElevenLabs audio for the intended person without recording its own output.
- [ ] Restarting the backend preserves people, embeddings, and conversations.
- [ ] Deleting a person cascades and refreshes recognition/history/audio state.
- [ ] Permission denial, empty audio, missing keys, provider failure, malformed AI output, model failure, storage failure, and stale async results have usable recovery behavior.
- [ ] Fixture mode is visible and never counted as live validation.
- [ ] No secrets, private data, or downloaded weights are committed.
- [ ] Demo instructions, actual provider usage, model license restriction, observed recognition limitations, and outstanding blockers are recorded accurately.

Claude Code may choose routine implementation details inside these boundaries. Correctness comes from shared contracts, ownership, integration, and actual checks; a strict prompt alone cannot guarantee it. Completion means the required live journey works, or the human explicitly accepts and understands a reduced demo scope.
