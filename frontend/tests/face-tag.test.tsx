import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FaceTag, faceRect, type FaceOverlay } from "@/components/FaceTag";
import { placeTags } from "@/lib/face-tag-layout";
import { badgeGradient, initials, timeAgo } from "@/lib/face-tag";

afterEach(cleanup);

const base = { key: 1, frameWidth: 640, frameHeight: 480 };
const leftFace = { x: 60, y: 100, width: 120, height: 150 };

/** A lone face, laid out the way CameraPanel does it. */
function Tag({ overlay, mirrored }: { overlay: FaceOverlay; mirrored: boolean }) {
  const rect = faceRect(overlay, mirrored);
  return <FaceTag overlay={overlay} rect={rect} placement={placeTags([rect]).get(overlay.key)!} compact={false} />;
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
  it("shows the name, relationship and last conversation for a known face", () => {
    const overlay: FaceOverlay = {
      ...base,
      box: leftFace,
      kind: "known",
      personId: "p1",
      name: "Bhavya",
      relationship: "teammate",
      cue: "Ask how the robotics demo went.",
      cueAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    };
    const { container } = render(<Tag overlay={overlay} mirrored={false} />);
    expect(screen.getByText("Bhavya")).toBeTruthy();
    expect(screen.getByText("teammate")).toBeTruthy();
    expect(screen.getByText("💬 Last time · 2h ago")).toBeTruthy();
    expect(screen.getByText("Ask how the robotics demo went.")).toBeTruthy();
    // Face on the left of the frame -> card placed to its right, not over it.
    const card = container.querySelector<HTMLElement>("[data-face-tag]")!;
    expect(card.style.left).not.toBe("");
    expect(card.style.right).toBe("");
  });

  it("puts the card on the other side when mirroring moves the face right", () => {
    const overlay: FaceOverlay = { ...base, box: leftFace, kind: "known", personId: "p1", name: "Sam", cue: null };
    const { container } = render(<Tag overlay={overlay} mirrored />);
    const card = container.querySelector<HTMLElement>("[data-face-tag]")!;
    expect(card.style.right).not.toBe("");
    expect(screen.getByText("No chats yet. Say hi! ✨")).toBeTruthy();
  });

  it("marks unknown faces without a name", () => {
    render(<Tag overlay={{ ...base, box: leftFace, kind: "unknown" }} mirrored={false} />);
    expect(screen.getByText("New face 👋")).toBeTruthy();
  });
});
