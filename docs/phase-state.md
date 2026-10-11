# Phase state

Maintained by Bhavya. No agent changes the phase on its own.

| Field | Value |
|---|---|
| Current phase | **3 — Integration: complete live journey on `main`; team continues from here** |
| Approved base commit | `cb194eb` on `main` (PRs #5–#21) |
| What works (verified live) | Camera → multi-face recognition → face tags; auto-enrollment (7 s voice intro → name + relationship → one-tap save); Who is this? speech; record → 3-bullet memory → save; compact last-talk card; phone over LAN (HTTPS) |
| AI provider | Claude API `claude-haiku-5-5` (`AI_PROVIDER=anthropic`); Ollama/Gemini selectable |
| Speech | ElevenLabs `scribe_v2` (STT) + `eleven_flash_v2_5` (TTS) |
| Repository | https://github.com/bh-glitch/forget-not (private) |

### 2026-10-11 update: déjà-view (merged from `bhavya/auto-conversation`)

Product renamed **déjà-view** (repository, folders and packages keep the forget-not name).
Human-requested changes, recorded in `docs/decisions.md`:
- Start screen: title + V logo; tapping the logo starts the camera with an intro animation.
  Header over the video: just the logo and name. Brand font Plus Jakarta Sans is bundled
  (`frontend/src/app/fonts/`, OFL licence), so builds still need no network.
- Conversations: a just-enrolled person's first conversation records automatically; returning
  people are recorded only via the mic on their summary card. Recordings stop at 25 s (or when
  the person leaves) and auto-save, marked `reviewedByUser: false`. A recording pill shows progress.
- Summary card: larger text, slides away after 12 s (button brings it back), and shows the 3
  saved points most worth remembering, picked by the new `POST /api/ai/key-points`.
- Introduction window 19 s; spoken reminders a little slower (`ELEVENLABS_TTS_SPEED=0.9`).

After pulling: `cd backend && uv sync --locked` (no new dependencies) and restart the backend.
**Your database upgrades itself to schema v2** on startup (adds `conversations.reviewed_by_user`,
existing rows stay reviewed). Back up `data/app.db` first if you may need to run an older
backend against it: an older backend refuses a v2 database.

### Catching up from `cb194eb`

```sh
git switch main && git pull
cd backend && uv sync --locked          # new dependency: anthropic==1.13.0
cd ../frontend && npm ci
```

`backend/.env` (never committed) needs `PROTOTYPE_MODE=live`, `DATABASE_PATH=../data/app.db`,
`AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
(get keys privately from Bhavya, not via GitHub). Weights: `scripts/prepare-models.py`.
Phone testing: `docs/setup.md` §7. New work: branch from `main`, open a PR, Bhavya merges.

## Phase 1a — UI layout shell (merged: PR #5, `0f49c5e`; checks re-verified by Bhavya)

Human decision, 2026-10-10: Ishan goes first with a simple layout so everyone builds on a
shared UI. Everyone else waits until it is merged.

Scope ([#1](https://github.com/bh-glitch/forget-not/issues/1)), inside Ishan's owned paths only:
- Single-page layout with clearly placed regions: camera video, identity card
  (name / relationship / latest cue / **Unknown** / **No saved conversation yet**),
  **Who is this?** button, microphone/**Listen** and **Record conversation** controls,
  enrollment panel, people list, and the fixture-mode banner.
- **Start camera** / **Stop camera** buttons (camera only after the button press; stop
  releases all tracks; permission-denied state). Mirrored preview only.
- Minimal recognition loop: about 2 fps, one request in flight, unmirrored JPEG
  (<= 1 MB, longest edge <= 1280) sent through `recognizeFrame`. Show the raw frame status or
  the API error, e.g. `503 MODEL_UNAVAILABLE`, as a status line. No stable-identity logic yet.
- Microphone, record, Who-is-this and enrollment controls are placeholders, visibly
  disabled and labeled "coming soon"; no recording (Vansh owns the recorder).
- Synthetic fixtures may populate the identity card and people list only while the fixture banner is shown.
- No edits to generated types, dependencies, config, backend, or Vansh's audio paths.

**Merge exception (human-approved, Phase 1a only, now closed):** once `npm run typecheck`, `lint`,
`test` and `build` pass, Ishan pushes `ishan/frontend`, opens a PR and merges it into
`main` himself, then posts the merge commit in #1. Later phases go back to Bhavya merging.

## Phase 1 — Feasibility (released for Arnav, Bhavya and Vansh)

| Owner | Task | Handoff |
|---|---|---|
| Bhavya ([#4](https://github.com/bh-glitch/forget-not/issues/4)) | Real CPU vision/descriptor probe: load local `buffalo_l` with CPUExecutionProvider, confirm `normed_embedding` dimension (expected 512), time detection+recognition | `docs/agents/bhavya.md` |
| Arnav ([#2](https://github.com/bh-glitch/forget-not/issues/2)) | SQLite transaction + restart probe on a temporary DB | `docs/agents/arnav.md` |
| Vansh ([#3](https://github.com/bh-glitch/forget-not/issues/3)) | Verify Gemini model, ElevenLabs STT/TTS models and voice against the team account; check credits | `docs/agents/vansh.md` |
| Ishan ([#1](https://github.com/bh-glitch/forget-not/issues/1)) | Fixture UI + camera → `/api/vision/recognize` proxy round trip (expect 503 MODEL_UNAVAILABLE until vision lands) | `docs/agents/ishan.md` |

Interface corrections found in Phase 1 are requested in the task issue and published
by Bhavya before Phase 2 starts.

## Phase 2 status (2026-10-10)

| Owner | Status |
|---|---|
| Arnav | **Merged** (PR #6 via #7): SQLite, people/conversations, health, gallery cache |
| Bhavya | **Merged** (PR #7): vision engine. Auto-enrollment UI (typed name until speech lands), stable identity, live people list with delete, verified in real Chrome with a fake camera |
| Ishan | **Paused** (human decision): Bhavya took over stable identity, auto-enrollment, people list/delete. Next: UI simplification (fewer buttons) on top of that merge |
| Vansh | Phase 1 provider checks in progress, then Phase 2 (recorder `start({ maxDurationMs })`, STT, introduction/memory drafts, TTS) |

## Bhavya — Phase 2 vision engine (started early, human decision 2026-10-10)

Engine implemented on `bhavya/vision-integration` (see `docs/vision-validation.md`).
`/api/vision/enrollment-sample` works end to end. `/api/vision/recognize` needs Arnav's
`GalleryCache`/`load_gallery`. No contract changes.

## Blockers

- Provider keys/credits are unverified (Vansh, Phase 1).
