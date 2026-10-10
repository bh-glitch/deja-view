"""Recognition and enrollment thresholds (owner: Bhavya).

PROVISIONAL: chosen from the Phase 1 probe on demo images (same face flipped 0.91,
different people <= 0.21; see docs/vision-validation.md). Recalibrate with real
enrollments on the demo laptop before relying on them. Scores are cosine
similarities, never probabilities.
"""

# Detector confidence for any face to count (also passed to FaceAnalysis.prepare).
DETECTION_THRESHOLD = 0.5
DETECTION_SIZE = (640, 640)

# Recognition: best person's best sample must reach this, and beat the
# second-best *person* by at least MATCH_MARGIN.
MIN_MATCH_SIMILARITY = 0.40
MATCH_MARGIN = 0.08

# Enrollment sample quality.
ENROLL_MIN_DETECTION_SCORE = 0.65
ENROLL_MIN_FACE_PIXELS = 80  # shorter side of the face box, in submitted-image pixels
ENROLL_EDGE_MARGIN_PIXELS = 2  # face box must not touch the frame border

# Enrollment coherence: every sample must resemble the others.
ENROLL_MIN_PAIRWISE_SIMILARITY = 0.35
ENROLL_MIN_CENTROID_SIMILARITY = 0.55
