import { describe, expect, it } from "vitest";

import { videoBoxWidth } from "@/components/CameraViewport";

describe("videoBoxWidth", () => {
  it("covers the stage when shapes are close (edges cropped)", () => {
    // 16:9 video on a 16:10 laptop stage: cover is wider than the stage.
    expect(videoBoxWidth(1400, 875, 16 / 9)).toBeCloseTo(875 * (16 / 9));
  });

  it("fits the whole picture when covering would crop too much", () => {
    // Landscape video on a portrait phone stage would lose most of the frame.
    expect(videoBoxWidth(360, 780, 16 / 9)).toBe(360);
  });

  it("is exact for a matching shape", () => {
    expect(videoBoxWidth(1600, 900, 16 / 9)).toBeCloseTo(1600);
  });
});
