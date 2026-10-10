# Vansh — speech & AI (`vansh/speech-ai`)

Status: **assigned, not started.** Base: Phase 0 foundation on `main`.

## Owned paths
`backend/app/providers/**`, `backend/app/ai/**`, `backend/app/routes/{audio,ai}.py`,
`frontend/src/lib/audio/**`, `frontend/src/hooks/useAudioRecorder.ts`, speech/AI tests.

Do not edit: contracts, config, dependency manifests or lockfiles. `google-genai` and
`httpx` are already locked. Request anything else in your task issue.

## Frozen interfaces you implement
Backend
- `providers/elevenlabs.py`: `async transcribe_audio(settings, audio: bytes, filename, content_type) -> str`,
  `async synthesize_speech(settings, text) -> bytes` (verified MP3).
- `providers/gemini.py`: `async generate_structured(settings, system_instruction, transcript, schema) -> schema`.
- `ai/introduction.py`: `async draft_introduction(settings, transcript) -> IntroductionDraft`.
- `ai/memory.py`: `async draft_memory(settings, transcript) -> MemoryDraft`.
- Routes keep their paths, operation IDs and response models: `POST /api/audio/transcribe`
  (multipart `audio`), `/api/audio/speak` (`{text}` → `audio/mpeg` + `X-Request-ID`),
  `/api/ai/introduction`, `/api/ai/memory` (`{transcript}`).

Frontend
- `lib/audio/speech-client.ts`: `transcribeAudio`, `speakText` (already wired to the contract).
- `lib/audio/recorder.ts`: `RecordedAudio`, `pickRecordingMimeType()`.
- `hooks/useAudioRecorder.ts`: `useAudioRecorder(): { state, error, elapsedMs, start, stop, cancel }`.

## Settings available
`settings.gemini_api_key`, `gemini_model` (default `gemini-3.8-flash`, **unverified**),
`elevenlabs_api_key`, `elevenlabs_stt_model` (`scribe_v2`), `elevenlabs_tts_model`
(`eleven_flash_v2_5`), `elevenlabs_voice_id`. Keys live in untracked `backend/.env` only.

## Phase 1 (feasibility)
Check the Gemini model ID against the official catalog and the team key, and the
ElevenLabs STT model, TTS model and voice against the team account. Check credits.
Record actual results in `docs/provider-validation.md`. Missing access is a reported
blocker; do not silently substitute a model, and do not start a paid subscription.

## Phase 2 acceptance
- Scribe: provider field `file` + `model_id`; validate the returned `text`; HTTPX builds
  the multipart body. Empty audio or transcript gives `EMPTY_AUDIO` / `EMPTY_TRANSCRIPT`.
- Bounded timeouts; sanitized `PROVIDER_*` errors; explicit retries only.
- Gemini via the official Python SDK, with the transcript treated as untrusted data.
  Introduction parsing only accepts an explicit self-introduction; missing values stay
  null; no inferred relationships. Every evidence quote must be a literal substring of
  the transcript. At most one bounded repair, otherwise `AI_OUTPUT_INVALID`.
- TTS: explicit voice and model; verify MP3 bytes; text <= 400 characters.
- Recorder: supported MIME, correct extension, visible state, 60 s / 2 MB limits
  explained, cancellation, track cleanup, never recording during playback.
- AI routes never save people or conversations.
- Mocked unit tests are kept separate from one recorded real call per provider.

## Auto-listen enrollment (decision 2026-10-10, see `docs/decisions.md`)
`useAudioRecorder().start(options?: { maxDurationMs?: number })`: auto-stop at the limit
(default 60 s). Ishan uses 8 s windows for introductions. Never open the mic during TTS playback.
`draftIntroduction` must return `intent="other"` with null name when no explicit
self-introduction is heard; the UI then offers to retry.
