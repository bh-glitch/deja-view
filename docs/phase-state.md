# Phase state

Maintained by Bhavya. No agent changes the phase on its own.

| Field | Value |
|---|---|
| Current phase | **1 — Feasibility: released for Arnav and Bhavya** (Phase 1a merged) |
| Next permitted work | Arnav and Bhavya: Phase 1 tasks below. Vansh: **wait** for release. Ishan: wait for next UI release |
| Approved base commit | `0f49c5e` on `main` (Phase 0 + Phase 1a UI shell, PR #5) |
| Contract version | API 0.1.0 (`contracts/openapi.json`) |
| Model | InsightFace 2.1, `buffalo_l` (checksums in `models/manifest.json`); embedding dimension **512 verified** (Phase 1 probe, `docs/vision-validation.md`) |
| Repository | https://github.com/bh-glitch/forget-not (private) |

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

## Phase 1 — Feasibility (released for Arnav and Bhavya; Vansh pending)

| Owner | Task | Handoff |
|---|---|---|
| Bhavya ([#4](https://github.com/bh-glitch/forget-not/issues/4)) | Real CPU vision/descriptor probe: load local `buffalo_l` with CPUExecutionProvider, confirm `normed_embedding` dimension (expected 512), time detection+recognition | `docs/agents/bhavya.md` |
| Arnav ([#2](https://github.com/bh-glitch/forget-not/issues/2)) | SQLite transaction + restart probe on a temporary DB | `docs/agents/arnav.md` |
| Vansh ([#3](https://github.com/bh-glitch/forget-not/issues/3)) | Verify Gemini model, ElevenLabs STT/TTS models and voice against the team account; check credits | `docs/agents/vansh.md` |
| Ishan ([#1](https://github.com/bh-glitch/forget-not/issues/1)) | Fixture UI + camera → `/api/vision/recognize` proxy round trip (expect 503 MODEL_UNAVAILABLE until vision lands) | `docs/agents/ishan.md` |

Interface corrections found in Phase 1 are requested in the task issue and published
by Bhavya before Phase 2 starts.

## Blockers

- Vansh waits until Phase 1 is released for him (human decision).
- Provider keys/credits are unverified (Vansh, Phase 1).
