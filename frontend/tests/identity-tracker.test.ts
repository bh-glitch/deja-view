import { describe, expect, it } from "vitest";

import type { FrameResult } from "@/lib/api-client";
import {
  STABLE_MATCH_FRAMES,
  UNKNOWN_FRAMES_TO_ENROLL,
  initialTracker,
  shouldStartEnrollment,
  trackFrame,
  type TrackerState,
} from "@/lib/identity-tracker";

const box = { x: 100, y: 100, width: 120, height: 150 };
const frame = (status: FrameResult["status"], personId: string | null = null, b = box): FrameResult => ({
  status,
  personId,
  similarity: personId ? 0.7 : null,
  box: status === "matched" || status === "unknown" ? b : null,
  frameWidth: 640,
  frameHeight: 480,
});

function run(frames: FrameResult[]): TrackerState {
  return frames.reduce(trackFrame, initialTracker);
}

describe("identity tracker", () => {
  it("shows a name only after consecutive matches", () => {
    const frames = Array.from({ length: STABLE_MATCH_FRAMES - 1 }, () => frame("matched", "alex"));
    expect(run(frames).stableId).toBeNull();
    expect(run([...frames, frame("matched", "alex")]).stableId).toBe("alex");
  });

  it.each(["unknown", "no_face", "multiple_faces"] as const)("clears the name on %s", (status) => {
    const stable = run(Array.from({ length: STABLE_MATCH_FRAMES }, () => frame("matched", "alex")));
    expect(trackFrame(stable, frame(status)).stableId).toBeNull();
  });

  it("never attaches the old name to a different person", () => {
    const stable = run(Array.from({ length: STABLE_MATCH_FRAMES }, () => frame("matched", "alex")));
    expect(trackFrame(stable, frame("matched", "sam")).stableId).toBeNull();
  });

  it("triggers enrollment after a steady unknown face", () => {
    const steady = Array.from({ length: UNKNOWN_FRAMES_TO_ENROLL }, () => frame("unknown"));
    expect(shouldStartEnrollment(run(steady.slice(1)))).toBe(false);
    expect(shouldStartEnrollment(run(steady))).toBe(true);
  });

  it("restarts the unknown count when the face jumps (visitor change) or leaves", () => {
    const moved = { x: 450, y: 100, width: 120, height: 150 };
    const frames = [frame("unknown"), frame("unknown"), frame("unknown"), frame("unknown", null, moved)];
    expect(run(frames).unknownCount).toBe(1);
    expect(run([frame("unknown"), frame("unknown"), frame("no_face"), frame("unknown")]).unknownCount).toBe(1);
  });
});
