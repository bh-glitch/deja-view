/**
 * Stable identity per face across frames (Bhavya 2026-10-10; multi-face by human decision).
 *
 * Each detected face is followed by position (a "track"). A backend `matched` face only
 * means that single frame passed; a track shows a name only after several consecutive
 * matches for the same person, and clears it immediately on unknown or a different person.
 * A track disappears as soon as its face is not seen, so names never linger. Steady
 * unknown frames on a lone face trigger auto-enrollment.
 */
import type { Box, FaceResult, FrameResult } from "@/lib/api-client";

export const STABLE_MATCH_FRAMES = 3;
export const UNKNOWN_FRAMES_TO_ENROLL = 4; // about 2 s at 2 fps

export interface FaceTrack {
  trackId: number;
  box: Box;
  candidateId: string | null;
  candidateCount: number;
  stableId: string | null;
  unknownCount: number;
}

export interface TrackerState {
  tracks: FaceTrack[];
  nextTrackId: number;
}

export const initialTracker: TrackerState = { tracks: [], nextTrackId: 1 };

function centerDistance(a: Box, b: Box): number {
  return Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2));
}

/** True when the face box moved further than its own size: treat as a different visitor. */
export function boxJumped(previous: Box | null, next: Box | null): boolean {
  if (!previous || !next) return false;
  return centerDistance(previous, next) > Math.max(previous.width, previous.height) * 0.6;
}

function updateTrack(track: FaceTrack, face: FaceResult): FaceTrack {
  if (face.status === "matched" && face.personId) {
    const count = track.candidateId === face.personId ? track.candidateCount + 1 : 1;
    const stableId =
      count >= STABLE_MATCH_FRAMES ? face.personId : track.stableId === face.personId ? face.personId : null;
    return { ...track, box: face.box, candidateId: face.personId, candidateCount: count, stableId, unknownCount: 0 };
  }
  return { ...track, box: face.box, candidateId: null, candidateCount: 0, stableId: null, unknownCount: track.unknownCount + 1 };
}

export function trackFrame(state: TrackerState, result: FrameResult): TrackerState {
  const unused = [...state.tracks];
  const tracks: FaceTrack[] = [];
  let nextTrackId = state.nextTrackId;
  // Faces arrive largest first; each takes the nearest unused track that has not jumped.
  for (const face of result.faces) {
    let best = -1;
    for (let i = 0; i < unused.length; i += 1) {
      if (boxJumped(unused[i].box, face.box)) continue;
      if (best < 0 || centerDistance(unused[i].box, face.box) < centerDistance(unused[best].box, face.box)) best = i;
    }
    const base: FaceTrack =
      best >= 0
        ? unused.splice(best, 1)[0]
        : { trackId: nextTrackId++, box: face.box, candidateId: null, candidateCount: 0, stableId: null, unknownCount: 0 };
    tracks.push(updateTrack(base, face));
  }
  return { tracks, nextTrackId };
}

/** Auto-enroll only a lone, steady unknown face (enrollment samples need exactly one face). */
export function shouldStartEnrollment(state: TrackerState): boolean {
  return state.tracks.length === 1 && state.tracks[0].unknownCount >= UNKNOWN_FRAMES_TO_ENROLL;
}

export function stablePersonIds(state: TrackerState): string[] {
  return state.tracks.flatMap((track) => (track.stableId ? [track.stableId] : []));
}
