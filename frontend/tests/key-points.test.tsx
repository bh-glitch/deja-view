import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useArrivals } from "@/hooks/useArrivals";
import { SUMMARY_VISIBLE_MS, useAutoHide } from "@/hooks/useAutoHide";
import { fixtures } from "@/fixtures";
import type { PersonDetail } from "@/lib/api-client";
import { keyPointNotes, keyPointsVersion, newestPoints, uniqueNotes } from "@/lib/key-points";

afterEach(() => vi.useRealTimers());

function conversation(id: string, endedAt: string, facts: string[], cue = "You talked.") {
  const base = fixtures.personDetailWithHistory.data.conversations[0];
  return {
    ...base,
    id,
    endedAt,
    memory: { ...base.memory, cue, facts: facts.map((text) => ({ text, evidenceQuote: text })) },
  };
}

describe("key points", () => {
  const person = fixtures.personDetailWithHistory.data.person;
  const detail: PersonDetail = {
    person,
    latestCue: null,
    conversations: [
      conversation("c2", "2026-10-09T10:00:00Z", ["Wedding next Saturday", "Liked the weather"]),
      conversation("c1", "2026-10-01T10:00:00Z", [], "Last time you talked about tea."),
      conversation("c0", "2026-09-20T10:00:00Z", ["wedding  next saturday", "Starts therapy Monday"]),
    ],
  };

  it("collects every saved point newest first, using the reminder when there are no facts", () => {
    expect(keyPointNotes(detail)).toEqual([
      { text: "Wedding next Saturday", endedAt: "2026-10-09T10:00:00Z" },
      { text: "Liked the weather", endedAt: "2026-10-09T10:00:00Z" },
      { text: "You talked about tea.", endedAt: "2026-10-01T10:00:00Z" },
      { text: "wedding  next saturday", endedAt: "2026-09-20T10:00:00Z" },
      { text: "Starts therapy Monday", endedAt: "2026-09-20T10:00:00Z" },
    ]);
  });

  it("drops repeats and falls back to the newest three", () => {
    const notes = keyPointNotes(detail);
    expect(uniqueNotes(notes)).toHaveLength(4);
    expect(newestPoints(notes)).toEqual(["Wedding next Saturday", "Liked the weather", "You talked about tea."]);
  });

  it("changes version when a conversation is added", () => {
    const more = { ...detail, conversations: [conversation("c3", "2026-10-10T10:00:00Z", ["New"]), ...detail.conversations] };
    expect(keyPointsVersion(more)).not.toBe(keyPointsVersion(detail));
  });
});

describe("useArrivals", () => {
  it("reports first arrivals and returns after a long absence, not flickers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const onArrive = vi.fn();
    const { rerender } = renderHook(({ ids }) => useArrivals(ids, onArrive, 30_000), { initialProps: { ids: ["a"] } });
    expect(onArrive).toHaveBeenLastCalledWith(["a"]);
    rerender({ ids: [] });
    vi.setSystemTime(5_000);
    rerender({ ids: ["a"] }); // back after 5 s: a flicker
    rerender({ ids: ["a", "b"] });
    expect(onArrive).toHaveBeenCalledTimes(2);
    expect(onArrive).toHaveBeenLastCalledWith(["b"]);
    rerender({ ids: [] });
    vi.setSystemTime(40_000);
    rerender({ ids: ["a"] });
    expect(onArrive).toHaveBeenLastCalledWith(["a"]);
  });
});

describe("useAutoHide", () => {
  it("hides 12 s after being shown and comes back on show()", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAutoHide(true));
    act(() => result.current.show());
    expect(result.current.hidden).toBe(false);
    act(() => vi.advanceTimersByTime(SUMMARY_VISIBLE_MS - 100));
    expect(result.current.hidden).toBe(false);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.hidden).toBe(true);
    act(() => result.current.show());
    expect(result.current.hidden).toBe(false);
  });
});
