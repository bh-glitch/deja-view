import { describe, expect, it } from "vitest";

import { MIN_WIDTH_FOR_CUE, placeTags, type FaceRect } from "@/lib/face-tag-layout";

const face = (key: number, left: number, top = 30, width = 12, height = 20): FaceRect => ({ key, left, top, width, height });

describe("placeTags", () => {
  it("puts a lone face's card beside it, on the roomier side", () => {
    expect(placeTags([face(1, 10)]).get(1)).toMatchObject({ mode: "side", side: "right", showCue: true });
    expect(placeTags([face(1, 75)]).get(1)).toMatchObject({ mode: "side", side: "left", showCue: true });
  });

  it("stacks cards under faces in a group, never wider than the gap to a neighbour", () => {
    const placements = placeTags([face(1, 10), face(2, 40), face(3, 75)]);
    for (const key of [1, 2, 3]) expect(placements.get(key)?.mode).toBe("below");
    const middle = placements.get(2)!;
    // centres at 16, 46, 81 -> nearest neighbour 30 away -> max width 28
    expect(middle.maxWidth).toBeCloseTo(28);
  });

  it("drops the conversation line when faces are too close", () => {
    const placements = placeTags([face(1, 30), face(2, 45)]);
    const tight = placements.get(1)!;
    expect(tight.maxWidth).toBeLessThan(MIN_WIDTH_FOR_CUE);
    expect(tight.showCue).toBe(false);
  });

  it("keeps cards below faces unless a face is near the bottom of the frame", () => {
    expect(placeTags([face(1, 10, 40), face(2, 60, 40)]).get(1)?.mode).toBe("below");
    expect(placeTags([face(1, 10, 65), face(2, 60, 65)]).get(1)?.mode).toBe("above");
  });

  it("shows name pills only for groups on a compact (phone-size) view", () => {
    const placements = placeTags([face(1, 10), face(2, 60)], { compact: true });
    expect(placements.get(1)?.showCue).toBe(false);
    expect(placeTags([face(1, 10)], { compact: true }).get(1)?.showCue).toBe(true);
  });
});
