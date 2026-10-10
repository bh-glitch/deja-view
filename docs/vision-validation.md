# Vision validation

## Phase 1 CPU probe — 2026-10-10 (Bhavya)

Machine: Apple M3, 8 cores, macOS; branch `bhavya/vision-integration` from `dd10912`.
Stack: InsightFace 2.1, onnxruntime 1.31.0, OpenCV 5.0.0, NumPy 2.4.6.
Inputs: only InsightFace's bundled demo image `t1.jpg` (6 faces) and crops/edits of it;
no teammate faces. The probe script was not committed (it lives outside the repo).

Load: `FaceAnalysis(name=<models/weights/buffalo_l>, providers=["CPUExecutionProvider"],
allowed_modules=["detection","recognition"])`, `prepare(ctx_id=-1, det_size=(640, 640))`.
- Loads from the local directory, with no download. Load + prepare: 0.39 s.
- Detection `det_10g.onnx` and recognition `w600k_r50.onnx` both run on `CPUExecutionProvider`.
  Recognition input is 112×112 aligned crops.
- `face.embedding`: shape **(512,)**, float32, raw norm about 23–26.
  `face.normed_embedding`: norm 1.000000, all values finite. **Dimension 512 verified.**

Latency (median of 12 runs after warm-up):

| Input | Faces | Median | Max |
|---|---|---|---|
| 640×480 single-face crop | 1 | 133 ms | 136 ms |
| 1280×960 single-face crop | 1 | 135 ms | 137 ms |
| Detection only, 640×480 | – | 83 ms | – |
| 640-wide group photo | 6 | 361 ms | 408 ms |

Conclusion: the planned about 2 fps with one request in flight (500 ms budget) fits on this CPU.
Cost grows with the number of faces because recognition runs once per face.

Cosine similarity spot checks (illustrative only, **not a calibration and not accuracy**):
- Same face, horizontally flipped: 0.912. Darkened (×0.6): 0.958.
- 6 different people in `t1.jpg`: max pairwise 0.213, median 0.025.

Notes:
- InsightFace 2.1 emits a scikit-image `FutureWarning` (`SimilarityTransform.estimate`
  deprecated). It is harmless with the locked versions.
- The bundled 112×112 pre-aligned `Tom_Hanks_54745.png` produces no detection; inputs must
  be ordinary frames, not aligned crops.

## Still to do (Phase 2 / Phase 4, on the demo laptop with consenting teammates)
- Calibrate the minimum similarity and the second-best-person margin from real enrollments.
- Test enrolled returns, an unknown volunteer, multiple faces, face loss, and pose/lighting changes.
- Measure end-to-end latency through the browser and proxy.
- Record observed limitations. No invented accuracy statistics.
