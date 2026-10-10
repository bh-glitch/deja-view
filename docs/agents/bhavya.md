# Bhavya — vision & integration (`bhavya/vision-integration`)

Status: **Phase 0 foundation complete.** Waiting for teammates before Phase 1.

## Owned paths
Root docs/config, dependency manifests/locks, `contracts/`, `backend/app/{config,contracts,main,export_openapi}.py`,
`backend/app/routes/_errors.py`, `backend/app/vision/**`, `frontend/src/generated/**`,
`scripts/prepare-models.py`, `models/manifest.json`, vision and cross-module tests, `docs/phase-state.md`.

## Interfaces you implement (frozen signatures)
- `vision/image.py`: `decode_jpeg(bytes) -> DecodedImage`, raising `INVALID_IMAGE`; longest edge <= 1280.
- `vision/embeddings.py`: `validate_embedding(vector, model, expected)`, `check_enrollment_coherence(embeddings, model)`.
- `vision/engine.py`: `load_face_engine(settings) -> FaceEngine` (local `settings.model_dir`,
  `providers=["CPUExecutionProvider"]`, no download). `FaceEngine.model`, `.recognize(image, gallery)`,
  `.enrollment_sample(image)`, thread-safe and serialized.

## Phase 1
CPU probe: load `models/weights/buffalo_l` with `FaceAnalysis(name=<dir>, providers=[CPU])`,
confirm the `normed_embedding` dimension and norm, and time each frame. Record results in
`docs/vision-validation.md` and set `embeddingDimensionVerified` in `models/manifest.json`.
