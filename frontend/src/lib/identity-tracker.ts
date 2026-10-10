/**
 * Stable identity across frames (Bhavya, taken over from Ishan by human decision 2026-10-10).
 *
 * A backend `matched` frame only means that single frame passed; the UI shows a name only
 * after several consecutive matches for the same person and clears it immediately on
 * unknown, face loss, multiple faces or a different person. The same tracker counts
 * steady single-face `unknown` frames to trigger auto-enrollment.
 */
import type { Box, FrameResult } from "@/lib/api-client";

export const STABLE_MATCH_FRAMES = 3;
export const UNKNOWN_FRAMES_TO_ENROLL = 4; // about 2 s at 2 fps

export interface TrackerState {
  candidateId: string | null;
  candidateCount: number;
  stableId: string | null;
  unknownCount: number;
  lastBox: Box | null;
}

export const initialTracker: TrackerState = {
  candidateId: null,
  candidateCount: 0,
  stableId: null,
  unknownCount: 0,
  lastBox: null,
};

/** True when the face box moved further than its own size: treat as a different visitor. */
export function boxJumped(previous: Box | null, next: Box | null): boolean {
  if (!previous || !next) return false;
  const dx = previous.x + previous.width / 2 - (next.x + next.width / 2);
  const dy = previous.y + previous.height / 2 - (next.y + next.height / 2);
  const size = Math.max(previous.width, previous.height);
  return Math.hypot(dx, dy) > size * 0.6;
}

export function trackFrame(state: TrackerState, result: FrameResult): TrackerState {
  switch (result.status) {
    case "matched": {
      const personId = result.personId as string;
      const count = state.candidateId === personId ? state.candidateCount + 1 : 1;
      const stableId = count >= STABLE_MATCH_FRAMES ? personId : state.stableId === personId ? personId : null;
      return { candidateId: personId, candidateCount: count, stableId, unknownCount: 0, lastBox: result.box };
    }
    case "unknown": {
      const unknownCount = boxJumped(state.lastBox, result.box) ? 1 : state.unknownCount + 1;
      return { ...initialTracker, unknownCount, lastBox: result.box };
    }
    default:
      return initialTracker;
  }
}

export function shouldStartEnrollment(state: TrackerState): boolean {
  return state.unknownCount >= UNKNOWN_FRAMES_TO_ENROLL;
}
