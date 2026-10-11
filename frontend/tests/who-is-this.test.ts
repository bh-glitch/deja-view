import { describe, expect, it } from "vitest";

import { composeWhoIsThis } from "@/hooks/useWhoIsThis";
import { MAX_SPEECH_CHARS } from "@/lib/audio/speech-client";

describe("composeWhoIsThis", () => {
  it("says the name, relationship and latest cue", () => {
    expect(composeWhoIsThis("Bhavya", "teammate", "Ask how the robotics demo went.")).toBe(
      "This is Bhavya, your teammate. Last time: Ask how the robotics demo went.",
    );
  });

  it("handles a person with no relationship or saved conversation", () => {
    expect(composeWhoIsThis("Sam", null, null)).toBe("This is Sam. You haven't saved a conversation with them yet.");
  });

  it("stays within the speech limit and never alters the name", () => {
    const name = "N".repeat(80);
    const relationship = "r".repeat(120);
    const cue = "First sentence here. " + "x".repeat(230);
    const text = composeWhoIsThis(name, relationship, cue);
    expect(text.length).toBeLessThanOrEqual(MAX_SPEECH_CHARS);
    expect(text).toContain(`This is ${name}`);
  });
});
