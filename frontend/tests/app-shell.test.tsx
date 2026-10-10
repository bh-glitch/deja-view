import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/AppShell";
import { IdentityCard } from "@/components/IdentityCard";
import { fixtures } from "@/fixtures";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppShell", () => {
  it("shows the fixture banner, fixture people and identity in fixture mode", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(fixtures.health)));
    render(<AppShell />);
    expect(await screen.findByText("Fixture mode — synthetic data")).toBeTruthy();
    expect(screen.getAllByText("Demo Alex").length).toBeGreaterThan(0);
    expect(screen.getByText("Demo Sam")).toBeTruthy();
  });

  it("does not show fixture data outside fixture mode", async () => {
    const live = { ...fixtures.health, data: { ...fixtures.health.data, mode: "live" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(live)));
    render(<AppShell />);
    expect(await screen.findByText(/Backend: live/)).toBeTruthy();
    expect(screen.queryByText("Fixture mode — synthetic data")).toBeNull();
    expect(screen.queryByText("Demo Alex")).toBeNull();
    expect(screen.getByText("Unknown")).toBeTruthy();
  });

  it("starts with the camera off and placeholder controls disabled", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => undefined)));
    render(<AppShell />);
    expect(screen.getByRole("button", { name: "Start camera" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Stop camera" })).toHaveProperty("disabled", true);
    for (const name of [/Who is this\?/, /Listen/, /Record conversation/, /Enroll new person/]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveProperty("disabled", true);
      expect(button.textContent).toContain("coming soon");
    }
  });
});

describe("IdentityCard", () => {
  it("shows Unknown without a person", () => {
    render(<IdentityCard person={null} latestCue={null} />);
    expect(screen.getByText("Unknown")).toBeTruthy();
  });

  it("shows No saved conversation yet without a cue", () => {
    render(<IdentityCard person={fixtures.personDetailNoHistory.data.person} latestCue={null} />);
    expect(screen.getByText("Demo Sam")).toBeTruthy();
    expect(screen.getByText("No saved conversation yet")).toBeTruthy();
  });

  it("shows the latest cue", () => {
    const detail = fixtures.personDetailWithHistory.data;
    render(<IdentityCard person={detail.person} latestCue={detail.latestCue} />);
    expect(screen.getByText(`Latest cue: ${detail.latestCue}`)).toBeTruthy();
  });
});
