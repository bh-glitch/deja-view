/**
 * Where to put each face tag so it never covers another face (Bhavya 2026-10-10).
 * Pure function over percentages of the displayed video.
 *
 * - One face in view: card beside the face, on the side with more room.
 * - Several faces: card under the face (above only if the face is near the bottom), no wider
 *   than the space to the neighbouring faces; too narrow for the conversation line, or a
 *   compact (phone-size) view -> name only. The identity cards beside the video keep the cue.
 */
export interface FaceRect {
  key: number;
  left: number; // % of displayed width (already mirrored if the preview is)
  top: number;
  width: number;
  height: number;
}

export type TagPlacement =
  | { mode: "side"; side: "right" | "left"; top: number; maxWidth: number; showCue: boolean }
  | { mode: "below" | "above"; centerX: number; edge: number; maxWidth: number; showCue: boolean };

export const SIDE_MAX_WIDTH = 46;
export const STACK_MAX_WIDTH = 40;
export const MIN_WIDTH_FOR_CUE = 22;
export const MIN_WIDTH = 12;
export const ABOVE_IF_BOTTOM_PAST = 78;

export function placeTags(faces: FaceRect[], { compact = false }: { compact?: boolean } = {}): Map<number, TagPlacement> {
  const placements = new Map<number, TagPlacement>();
  if (faces.length === 1) {
    const [face] = faces;
    const right = face.left + face.width / 2 < 55;
    const room = right ? 100 - (face.left + face.width) - 2 : face.left - 2;
    const maxWidth = Math.max(MIN_WIDTH, Math.min(SIDE_MAX_WIDTH, room));
    placements.set(face.key, {
      mode: "side",
      side: right ? "right" : "left",
      top: Math.min(Math.max(face.top, 2), 60),
      maxWidth,
      showCue: maxWidth >= MIN_WIDTH_FOR_CUE,
    });
    return placements;
  }
  const centers = faces.map((face) => face.left + face.width / 2);
  faces.forEach((face, index) => {
    const centerX = centers[index];
    // Up to the midpoint between this face and its nearest neighbour, minus a small gap.
    const nearest = Math.min(...centers.filter((_, j) => j !== index).map((c) => Math.abs(c - centerX)));
    const edgeRoom = Math.min(centerX, 100 - centerX) * 2;
    const maxWidth = Math.max(MIN_WIDTH, Math.min(STACK_MAX_WIDTH, nearest - 2, edgeRoom));
    const bottom = face.top + face.height;
    const below = bottom < ABOVE_IF_BOTTOM_PAST;
    placements.set(face.key, {
      mode: below ? "below" : "above",
      centerX,
      edge: below ? bottom + 2 : 100 - face.top + 2,
      maxWidth,
      showCue: !compact && maxWidth >= MIN_WIDTH_FOR_CUE,
    });
  });
  return placements;
}
