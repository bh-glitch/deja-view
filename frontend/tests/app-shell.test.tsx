import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/AppShell";
import { IdentityCard } from "@/components/IdentityCard";
import { fixtures } from "@/fixtures";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function routeFetch(health: unknown, people: unknown) {
  return vi.fn((url: string) =>
    Promise.resolve(jsonResponse(url.startsWith("/api/health") ? health : people)),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppShell", () => {
  it("shows the fixture banner and people from the backend in fixture mode", async () => {
    vi.stubGlobal("fetch", routeFetch(fixtures.health, fixtures.peopleList));
    render(<AppShell />);
    expect(await screen.findByText("Fixture mode — synthetic data")).toBeTruthy();
    expect(await screen.findByText("Demo Alex")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete Demo Sam" })).toBeTruthy();
  });

  it("shows no banner and an empty people state in live mode", async () => {
    const live = { ...fixtures.health, data: { ...fixtures.health.data, mode: "live" } };
    const empty = { ...fixtures.peopleList, data: { people: [] } };
    vi.stubGlobal("fetch", routeFetch(live, empty));
    render(<AppShell />);
    expect(await screen.findByText(/Backend: live/)).toBeTruthy();
    expect(screen.queryByText("Fixture mode — synthetic data")).toBeNull();
    expect(await screen.findByText(/No one saved yet/)).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
  });

  it("starts with the camera off and only a single camera button", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => undefined)));
    render(<AppShell />);
    expect(screen.getByRole("button", { name: "Start camera" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("button", { name: "Stop camera" })).toBeNull();
    expect(screen.getByText("Start the camera to recognize people.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Enroll new person/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Who is this\?/ })).toHaveProperty("disabled", true);
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
