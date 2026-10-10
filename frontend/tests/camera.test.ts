import { describe, expect, it } from "vitest";

import { ApiClientError } from "@/lib/api-client";
import { scaledFrameSize } from "@/lib/frame-capture";
import { cameraErrorMessage } from "@/hooks/useCamera";
import { describeRecognitionError } from "@/hooks/useRecognitionLoop";

describe("scaledFrameSize", () => {
  it("keeps frames that already fit", () => {
    expect(scaledFrameSize(1280, 720)).toEqual({ width: 1280, height: 720 });
    expect(scaledFrameSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it("scales the longest edge down to 1280", () => {
    expect(scaledFrameSize(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(scaledFrameSize(1080, 1920)).toEqual({ width: 720, height: 1280 });
  });
});

describe("cameraErrorMessage", () => {
  it("explains permission denial", () => {
    expect(cameraErrorMessage(new DOMException("denied", "NotAllowedError"))).toMatch(/permission was denied/);
  });
});

describe("describeRecognitionError", () => {
  it("shows status and code", () => {
    const error = new ApiClientError("MODEL_UNAVAILABLE", "Face model is not loaded.", 503, false, null);
    expect(describeRecognitionError(error)).toBe("503 MODEL_UNAVAILABLE: Face model is not loaded.");
  });
});
