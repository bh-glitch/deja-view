# Provider validation

Credential presence in `/api/health` is not provider validation.

## Phase 1 provider probe — 2026-10-10 (Vansh)

Branch `vansh/speech-ai` from `b6674fa`. Probe run 2026-10-10 20:31–20:32 UTC.
SDKs from the locked backend env: `google-genai 2.29.0`, `httpx 0.28.1` (`uv sync --locked`).
Keys were read from untracked `backend/.env` through `app.config.Settings` and never printed.
Each provider call ran once with no retries. Content was fictional only ("Demo Alex", "Sam"),
and no face images were sent. The probe script, MP3 and transcript live outside the repo
and are not committed.

### Gemini — `gemini-3.8-flash`: **works**

| Check | Result |
|---|---|
| Official catalog ([models page](https://ai.google.dev/gemini-api/docs/models), updated 2026-10-09) | `gemini-3.8-flash` listed as **Stable**. Model page: text/image/video/audio/PDF in, text out; input 1,048,576 / output 65,536 tokens; structured outputs supported; thinking `low`/`medium`/`high` (`minimal` returns an error) |
| `client.aio.models.list()` with the team key | 62 models; `models/gemini-3.8-flash` present |
| `client.aio.models.get("gemini-3.8-flash")` | `Gemini 3.8 Flash`, version `3.0`, limits 1,048,576 / 65,536, actions `generateContent`, `countTokens`, `createCachedContent`, `batchGenerateContent`, thinking `true` |
| One `generate_content` call: `response_mime_type="application/json"`, `response_json_schema` {intent, displayName, relationship}, `thinking_level=LOW`, 30 s timeout | `finish_reason=STOP`, `model_version=gemini-3.8-flash`, valid JSON matching the schema: `intent="introduction"`, `displayName="Demo Alex"`. 49 prompt + 17 output = 66 tokens. Latency **5.15 s** |
| Quota / credits | The API has no quota endpoint and returned no rate-limit headers. The key's tier and limits must be read in AI Studio; **not verified** |

No substitution was needed: the configured default `gemini-3.8-flash` is correct.

Phase 2 notes (no interface change):
- The fictional line "Hi, I'm Demo Alex, Sam's cousin." produced `relationship="Sam's cousin"`,
  which is relative to a third party, not the app user. The Phase 2 prompt and validation must
  keep relationships literal and grounded (with evidence quotes), and not reinterpret them as
  the user's relationship.
- About 5 s for one small call: introduction drafting adds noticeable delay after the 8 s window.

### ElevenLabs

Account plan: **Creator** (`tier=creator`, `status=active`, monthly billing), activated with the
hackathon coupon (per Vansh). Credits refresh monthly; the next reset is **2026-11-10 19:17 UTC**
(`next_character_count_reset_unix`; the API reports no separate renewal date). Overage billing is
off (`can_extend_character_limit=false`, `max_credit_limit_extension=0`), so usage stops at the
limit instead of charging more. The API's `has_used_creator_coupon_on_account=false` refers to
ElevenLabs' own Creator first-month discount; the hackathon coupon itself isn't visible through
the API.

First run, 20:31–20:32 UTC:

| Check | Result |
|---|---|
| E1 `GET /v1/user/subscription` (before and after) | **HTTP 401** `missing_permissions`: "The API key you used is missing the permission user_read" |
| E2 `GET /v1/models` | **HTTP 401** `missing_permissions`: missing `models_read` |
| E3 `GET /v1/voices/ogwqBH5bbF03DSbNiRNN` | **HTTP 400** `voice_not_found`: "A voice with ID 'ogwqBH5bbF03DSbNiRNN' was not found." |
| E4 TTS `POST /v1/text-to-speech/ogwqBH5bbF03DSbNiRNN?output_format=mp3_44100_128`, `model_id=eleven_flash_v2_5`, 74-character fictional sentence | **HTTP 200**, `audio/mpeg`, 74,440 bytes; ID3 tag + MPEG-1 Layer III frame sync: **verified MP3**. `character-cost: 16` header. Latency 3.6 s |
| E5 STT `POST /v1/speech-to-text`, multipart `file` (the E4 MP3) + `model_id=scribe_v2` | **HTTP 200**, non-empty `text`, `language_code=eng` (p=0.97), 4.6 s of audio; all 15 words matched the input sentence exactly. Latency 0.76 s |

Re-run of the free checks only, 2026-10-10 20:48 UTC, after Vansh added `user_read` to the key
and saved the voice to My Voices (no TTS/STT calls):

| Check | Result |
|---|---|
| E1 `GET /v1/user/subscription` | **HTTP 200**: `creator`, `active`, **18 / 131,000** characters used (130,982 left), next reset 2026-11-10 19:17 UTC, monthly, no open invoices, no pending change |
| E2 `GET /v1/models` | Still **HTTP 401** `missing_permissions`: missing `models_read`. Both models were exercised directly by E4/E5, so this only blocks listing |
| E3 `GET /v1/voices/ogwqBH5bbF03DSbNiRNN` | **HTTP 200**: "Savvy - Warm, Grounded & Natural", category `professional`; `high_quality_base_model_ids` includes `eleven_flash_v2_5` |

### Results summary

| Capability | Status |
|---|---|
| Gemini `gemini-3.8-flash` structured output | **Works** (one real call) |
| ElevenLabs STT `scribe_v2` | **Works** (one real call, synthetic clip) |
| ElevenLabs TTS `eleven_flash_v2_5` + voice `ogwqBH5bbF03DSbNiRNN` | **Works** (one real call, verified MP3); voice found in the account |
| ElevenLabs credits / plan | **Verified**: Creator, 130,982 of 131,000 characters left, reset 2026-11-10 |
| ElevenLabs model listing | **Not verified**: key lacks `models_read` (not a blocker) |
| Gemini quota / tier | **Not verified**: check in AI Studio |

No paid subscription was started or upgraded.

### Open items (tracked in #3)

1. Optional: add `models_read` to the ElevenLabs key so the model list can be checked; the models
   themselves already work.
2. Gemini quota/tier: check in AI Studio.

Failures observed and the user-facing recovery state are recorded with the Phase 2 provider code.
