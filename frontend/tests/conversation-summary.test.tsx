import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationSummary } from "@/components/ConversationSummary";
import { RecordingPill } from "@/components/RecordingPill";
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
  const points = ["Daughter's wedding is next Saturday", "Starts physical therapy Monday", "Loves chamomile tea"];

  it("shows nothing until someone is recognized", () => {
    const { container } = render(<ConversationSummary items={[]} onOpen={vi.fn()} onRecord={vi.fn()} recordDisabled={false} />);
    expect(container.textContent).toBe("");
  });

  it("shows only the chosen points, not the name card", () => {
    render(
      <ConversationSummary items={[{ person: withHistory.person, detail: withHistory, points }]} onOpen={vi.fn()} onRecord={vi.fn()} recordDisabled={false} />,
    );
    const bullets = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(bullets).toEqual(points);
    expect(screen.getByText(/Last talk ·/)).toBeTruthy();
    // A lone person's name is already on their face tag; it is not repeated here.
    expect(screen.queryByText(withHistory.person.displayName)).toBeNull();
    expect(screen.queryByText(withHistory.person.relationship!)).toBeNull();

  });

  it("records a returning person only when the mic is tapped", () => {
    const onRecord = vi.fn();
    const { rerender } = render(
      <ConversationSummary
        items={[{ person: withHistory.person, detail: withHistory, points }]}
        onOpen={vi.fn()}
        onRecord={onRecord}
        recordDisabled={false}
      />,
    );
    expect(onRecord).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `Record conversation with ${withHistory.person.displayName}` }));
    expect(onRecord).toHaveBeenCalledWith(withHistory.person);
    rerender(
      <ConversationSummary
        items={[{ person: withHistory.person, detail: withHistory, points }]}
        onOpen={vi.fn()}
        onRecord={onRecord}
        recordDisabled
      />,
    );
    expect(screen.getByRole("button", { name: /Record conversation/ })).toHaveProperty("disabled", true);
  });

  it("shows a placeholder while the points are being chosen", () => {
    render(
      <ConversationSummary items={[{ person: withHistory.person, detail: withHistory, points: null }]} onOpen={vi.fn()} onRecord={vi.fn()} recordDisabled={false} />,
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText(/Last talk ·/)).toBeTruthy();
  });

  it("labels each person when several are recognized and opens the full conversation", () => {
    const onOpen = vi.fn();
    render(
      <ConversationSummary
        items={[
          { person: withHistory.person, detail: withHistory, points },
          { person: noHistory.person, detail: noHistory, points: [] },
        ]}
        onOpen={onOpen}
        onRecord={vi.fn()}
        recordDisabled={false}
      />,
    );
    fireEvent.click(screen.getByText(`${noHistory.person.displayName} · No chats yet`));
    expect(onOpen).toHaveBeenCalledWith(noHistory.person);
  });
});

describe("RecordingPill", () => {
  const person = fixtures.personDetailWithHistory.data.person;

  it("shows who is being recorded, the time, and stops on tap", () => {
    const onStop = vi.fn();
    render(
      <RecordingPill
        state={{ kind: "recording", person, elapsedMs: 12_400, limitMs: 60_000 }}
        onStop={onStop}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText(`Recording with ${person.displayName}`)).toBeTruthy();
    expect(screen.getByText("0:12 / 1:00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("says it is summarizing, and hides when idle", () => {
    const { rerender, container } = render(
      <RecordingPill state={{ kind: "transcribing", person }} onStop={vi.fn()} onOpen={vi.fn()} />,
    );
    expect(screen.getByText(`Summarizing talk with ${person.displayName}…`)).toBeTruthy();
    rerender(<RecordingPill state={{ kind: "idle" }} onStop={vi.fn()} onOpen={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
});
