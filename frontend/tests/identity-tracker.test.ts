import { describe, expect, it } from "vitest";

import type { Box, FaceResult, FrameResult } from "@/lib/api-client";
import {
  STABLE_MATCH_FRAMES,
  UNKNOWN_FRAMES_TO_ENROLL,
  initialTracker,
  shouldStartEnrollment,
  stablePersonIds,
  trackFrame,
  type TrackerState,
} from "@/lib/identity-tracker";

const LEFT: Box = { x: 60, y: 100, width: 120, height: 150 };
const RIGHT: Box = { x: 420, y: 110, width: 110, height: 140 };

const matched = (personId: string, box: Box = LEFT): FaceResult => ({ status: "matched", personId, similarity: 0.7, box });
const unknown = (box: Box = LEFT): FaceResult => ({ status: "unknown", personId: null, similarity: null, box });
const frame = (...faces: FaceResult[]): FrameResult => ({ faces, frameWidth: 640, frameHeight: 480 });
const repeat = (n: number, f: FrameResult) => Array.from({ length: n }, () => f);
const run = (frames: FrameResult[]): TrackerState => frames.reduce(trackFrame, initialTracker);

describe("identity tracker", () => {
  it("shows a name only after consecutive matches", () => {
    expect(stablePersonIds(run(repeat(STABLE_MATCH_FRAMES - 1, frame(matched("alex")))))).toEqual([]);
    expect(stablePersonIds(run(repeat(STABLE_MATCH_FRAMES, frame(matched("alex")))))).toEqual(["alex"]);
  });

  it("names several people at once, each on their own face", () => {
    const state = run(repeat(STABLE_MATCH_FRAMES, frame(matched("alex", LEFT), matched("sam", RIGHT))));
    expect(state.tracks.map((t) => t.stableId)).toEqual(["alex", "sam"]);
  });

  it("keeps a known face named while an unknown face is also in view", () => {
    const state = run(repeat(STABLE_MATCH_FRAMES, frame(matched("alex", LEFT), unknown(RIGHT))));
    expect(state.tracks.map((t) => t.stableId)).toEqual(["alex", null]);
  });

  it("clears a name when that face becomes unknown or leaves", () => {
    const stable = run(repeat(STABLE_MATCH_FRAMES, frame(matched("alex"))));
    expect(stablePersonIds(trackFrame(stable, frame(unknown())))).toEqual([]);
    expect(stablePersonIds(trackFrame(stable, frame()))).toEqual([]);
  });

  it("never attaches the old name to a different person", () => {
    const stable = run(repeat(STABLE_MATCH_FRAMES, frame(matched("alex"))));
    expect(stablePersonIds(trackFrame(stable, frame(matched("sam"))))).toEqual([]);
  });

  it("does not move a name to a face that appears somewhere else", () => {
    const stable = run(repeat(STABLE_MATCH_FRAMES, frame(matched("alex", LEFT))));
    const next = trackFrame(stable, frame(matched("alex", RIGHT)));
    expect(next.tracks[0].stableId).toBeNull(); // jumped: new track, must re-earn the name
  });

  it("auto-enrolls only a lone, steady unknown face", () => {
    expect(shouldStartEnrollment(run(repeat(UNKNOWN_FRAMES_TO_ENROLL - 1, frame(unknown()))))).toBe(false);
    expect(shouldStartEnrollment(run(repeat(UNKNOWN_FRAMES_TO_ENROLL, frame(unknown()))))).toBe(true);
    expect(shouldStartEnrollment(run(repeat(UNKNOWN_FRAMES_TO_ENROLL, frame(unknown(LEFT), unknown(RIGHT)))))).toBe(false);
  });

  it("restarts the unknown count when the face jumps (visitor change) or leaves", () => {
    const moved = run([frame(unknown()), frame(unknown()), frame(unknown()), frame(unknown(RIGHT))]);
    expect(moved.tracks[0].unknownCount).toBe(1);
    const left = run([frame(unknown()), frame(unknown()), frame(), frame(unknown())]);
    expect(left.tracks[0].unknownCount).toBe(1);
  });
});
