# Phase state

Maintained by Bhavya. No agent changes the phase on its own.

| Field | Value |
|---|---|
| Current phase | **0 — Shared foundation: complete; waiting for teammates** |
| Next permitted work | Phase 1 feasibility, after the human invites teammates and assigns sessions |
| Approved base commit | Foundation commit on `main` (see `git log --grep "Phase 0 foundation"`) |
| Contract version | API 0.1.0 (`contracts/openapi.json`) |
| Model | InsightFace 2.1, `buffalo_l` (checksums in `models/manifest.json`); embedding dimension **not yet verified** |
| Repository | https://github.com/bh-glitch/forget-not (private) |

## Phase 1 — Feasibility (released once teammates join)

| Owner | Task | Handoff |
|---|---|---|
| Bhavya | Real CPU vision/descriptor probe: load local `buffalo_l` with CPUExecutionProvider, confirm `normed_embedding` dimension (expected 512), time detection+recognition | `docs/agents/bhavya.md` |
| Arnav | SQLite transaction + restart probe on a temporary DB | `docs/agents/arnav.md` |
| Vansh | Verify Gemini model, ElevenLabs STT/TTS models and voice against the team account; check credits | `docs/agents/vansh.md` |
| Ishan | Fixture UI + camera → `/api/vision/recognize` proxy round trip (expect 503 MODEL_UNAVAILABLE until vision lands) | `docs/agents/ishan.md` |

Interface corrections found in Phase 1 are requested in the task issue and published
by Bhavya before Phase 2 starts.

## Blockers

- None for Phase 1. Provider keys/credits are unverified (Vansh, Phase 1).
