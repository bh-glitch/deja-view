import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FaceTag, faceRect, type FaceOverlay } from "@/components/FaceTag";
import { badgeGradient, initials, timeAgo } from "@/lib/face-tag";

afterEach(cleanup);

const base = { key: 1, frameWidth: 640, frameHeight: 480 };
const leftFace = { x: 60, y: 100, width: 120, height: 150 };

/** A lone face, laid out the way CameraViewport does it. */
function Tag({ overlay, mirrored }: { overlay: FaceOverlay; mirrored: boolean }) {
  return <FaceTag overlay={overlay} rect={faceRect(overlay, mirrored)} compact={false} />;
}

describe("face-tag helpers", () => {
  it("formats relative times", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    expect(timeAgo("2026-10-10T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-10T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-10-10T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-08T12:00:00Z", now)).toBe("2d ago");
  });

  it("makes initials and a stable colour", () => {
    expect(initials("bhavya")).toBe("BH");
    expect(initials("Demo Alex Smith")).toBe("DS");
    expect(badgeGradient("abc")).toBe(badgeGradient("abc"));
  });
});

describe("FaceTag", () => {
  it("shows the name with the relationship directly beneath, under the face", () => {
    const overlay: FaceOverlay = {
      ...base,
      box: leftFace,
      kind: "known",
      personId: "p1",
      name: "Bhavya",
      relationship: "teammate",
    };
    const { container } = render(<Tag overlay={overlay} mirrored={false} />);
    const name = screen.getByText("Bhavya");
    const relationship = screen.getByText("teammate");
    expect(name.compareDocumentPosition(relationship) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Plate is centred on the face and starts just below it (face bottom = 250/480 ≈ 52%).
    const plate = container.querySelector<HTMLElement>("[data-face-tag]")!;
    expect(parseFloat(plate.style.left)).toBeCloseTo(((60 + 60) / 640) * 100, 5);
    expect(parseFloat(plate.style.top)).toBeGreaterThan((250 / 480) * 100);
    expect(plate.style.bottom).toBe("");
  });

  it("never shows conversation text on the video", () => {
    const overlay: FaceOverlay = { ...base, box: leftFace, kind: "known", personId: "p1", name: "Sam" };
    const { container } = render(<Tag overlay={overlay} mirrored />);
    expect(container.textContent).not.toMatch(/Last time|No chats/);
    // Mirroring moves the face (and its plate) to the right half.
    const plate = container.querySelector<HTMLElement>("[data-face-tag]")!;
    expect(parseFloat(plate.style.left)).toBeGreaterThan(50);
  });

  it("puts the plate above a face near the bottom of the frame", () => {
    const low = { x: 260, y: 360, width: 110, height: 110 };
    const overlay: FaceOverlay = { ...base, box: low, kind: "known", personId: "p1", name: "Sam" };
    const { container } = render(<Tag overlay={overlay} mirrored={false} />);
    const plate = container.querySelector<HTMLElement>("[data-face-tag]")!;
    expect(plate.style.bottom).not.toBe("");
    expect(plate.style.top).toBe("");
  });

  it("marks unknown faces without a name", () => {
    render(<Tag overlay={{ ...base, box: leftFace, kind: "unknown" }} mirrored={false} />);
    expect(screen.getByText("New face")).toBeTruthy();
  });

  it("shows a pending face without inventing a name", () => {
    const { container } = render(<Tag overlay={{ ...base, box: leftFace, kind: "pending" }} mirrored={false} />);
    expect(container.querySelector("[data-face-tag]")!.getAttribute("data-face-tag")).toBe("pending");
  });
});
