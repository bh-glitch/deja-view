import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationSummary } from "@/components/ConversationSummary";
import { fixtures } from "@/fixtures";
import { cleanCue } from "@/lib/cue";

afterEach(cleanup);

describe("cleanCue", () => {
  it("drops a leading 'Last time' the UI already says", () => {
    expect(cleanCue("Last time you guys talked about the Rutgers game.")).toBe("You guys talked about the Rutgers game.");
    expect(cleanCue("last time, you talked about tea")).toBe("You talked about tea");
    expect(cleanCue("Ask about pottery.")).toBe("Ask about pottery.");
  });
});

describe("ConversationSummary", () => {
  const withHistory = fixtures.personDetailWithHistory.data;
  const noHistory = fixtures.personDetailNoHistory.data;

  it("shows nothing until someone is recognized", () => {
    const { container } = render(
      <ConversationSummary items={[]} onRecord={vi.fn()} recordDisabled={false} onOpen={vi.fn()} />,
    );
    expect(container.textContent).toBe("");
  });

  it("shows only the last talk as short bullets, not the name card", () => {
    render(
      <ConversationSummary
        items={[{ person: withHistory.person, detail: withHistory }]}
        onRecord={vi.fn()}
        recordDisabled={false}
        onOpen={vi.fn()}
      />,
    );
    const bullets = screen.getAllByRole("listitem");
    expect(bullets.length).toBeGreaterThan(0);
    expect(bullets.length).toBeLessThanOrEqual(3);
    expect(screen.getByText(/Last talk ·/)).toBeTruthy();
    // A lone person's name is already on their face tag; it is not repeated here.
    expect(screen.queryByText(withHistory.person.displayName)).toBeNull();
    expect(screen.queryByText(withHistory.person.relationship!)).toBeNull();
  });

  it("labels each person when several are recognized, and records on tap", () => {
    const onRecord = vi.fn();
    render(
      <ConversationSummary
        items={[
          { person: withHistory.person, detail: withHistory },
          { person: noHistory.person, detail: noHistory },
        ]}
        onRecord={onRecord}
        recordDisabled={false}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText(`${noHistory.person.displayName} · No chats yet`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: `Record conversation with ${noHistory.person.displayName}` }));
    expect(onRecord).toHaveBeenCalledWith(noHistory.person);
  });
});
