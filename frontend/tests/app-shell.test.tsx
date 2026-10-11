import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/AppShell";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { GlassToasts } from "@/components/glass/GlassToast";
import { IdentityCard } from "@/components/IdentityCard";
import { PeopleDrawer } from "@/components/PeopleDrawer";
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
  vi.useRealTimers();
});

describe("AppShell", () => {
  it("shows the fixture badge and people from the backend in fixture mode", async () => {
    vi.stubGlobal("fetch", routeFetch(fixtures.health, fixtures.peopleList));
    render(<AppShell />);
    // Shown on the start screen and in the header: never hidden while data is synthetic.
    expect((await screen.findAllByText("Fixture mode — synthetic data")).length).toBe(2);
    expect(await screen.findByText("Demo Alex")).toBeTruthy();
    // The drawer is closed (inert) until People is pressed; delete stays available inside it.
    const people = screen.getByRole("button", { name: "People" });
    expect(people.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(people);
    expect(people.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Delete Demo Sam" })).toBeTruthy();
  });

  it("shows only the name in the header, no badge, and an empty people state in live mode", async () => {
    const live = { ...fixtures.health, data: { ...fixtures.health.data, mode: "live" } };
    const empty = { ...fixtures.peopleList, data: { people: [] } };
    vi.stubGlobal("fetch", routeFetch(live, empty));
    render(<AppShell />);
    expect(await screen.findByText(/No one saved yet/)).toBeTruthy();
    // Start screen title + header name; no diagnostics or tagline (human request 2026-10-11).
    expect(screen.getAllByRole("heading", { name: "déjà-view" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Diagnostics" })).toBeNull();
    expect(screen.queryByText("Familiar-person reminder prototype")).toBeNull();
    expect(screen.queryByText("Fixture mode — synthetic data")).toBeNull();
    expect(await screen.findByText(/No one saved yet/)).toBeTruthy();
  });

  it("starts on the déjà-view screen with the logo as the single Start camera button", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => undefined)));
    render(<AppShell />);
    expect(screen.getAllByRole("heading", { name: "déjà-view" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Start camera" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("button", { name: "Stop camera" })).toBeNull();
    expect(screen.getByRole("button", { name: /Who is this\?/ })).toHaveProperty("disabled", true);
    // Nobody is recognized, so there is no conversation to open yet.
    expect(screen.getByRole("button", { name: "Last conversation" })).toHaveProperty("disabled", true);
  });
});

describe("IdentityCard", () => {
  const person = fixtures.personDetailWithHistory.data.person;

  it("renders nothing while the camera is off and a quiet pill when nobody is in view", () => {
    const { container, rerender } = render(<IdentityCard view={{ kind: "off" }} />);
    expect(container.textContent).toBe("");
    rerender(<IdentityCard view={{ kind: "none" }} />);
    expect(screen.getByText("No person detected")).toBeTruthy();
  });

  it("shows Unknown person without inventing a name", () => {
    render(<IdentityCard view={{ kind: "unknown", faces: 1 }} />);
    expect(screen.getByText("Unknown person")).toBeTruthy();
  });

  it("shows the relationship directly beneath the name and no conversation text", () => {
    render(<IdentityCard view={{ kind: "recognized", people: [person], otherFaces: 0 }} />);
    const name = screen.getByText(person.displayName);
    const relationship = screen.getByText(person.relationship!);
    expect(name.nextElementSibling).toBe(relationship);
    expect(screen.queryByText(fixtures.personDetailWithHistory.data.latestCue!)).toBeNull();
  });
});

describe("ConversationDrawer", () => {
  const detail = fixtures.personDetailWithHistory.data;

  function drawer(open: boolean, onClose = vi.fn()) {
    return (
      <ConversationDrawer
        open={open}
        onClose={onClose}
        detail={detail}
        loading={false}
        recognized={[detail.person]}
        focusedId={detail.person.id}
        onFocus={vi.fn()}
        onRecord={vi.fn()}
        recordDisabled={false}
        flow={null}
        toggleRef={createRef()}
      />
    );
  }

  it("shows the stored latest reminder and closes on Escape", () => {
    const onClose = vi.fn();
    render(drawer(true, onClose));
    expect(screen.getByRole("dialog", { name: detail.person.displayName })).toBeTruthy();
    // Short bullets only: the saved facts, no repeated reminder/summary paragraphs.
    const latest = detail.conversations[0].memory;
    const highlights = screen.getByRole("list", { name: "Last conversation highlights" });
    expect(highlights.querySelectorAll("li")).toHaveLength(Math.min(3, latest.facts.length || 1));
    expect(highlights.textContent).toContain(latest.facts[0].text);
    expect(screen.queryByText(latest.summary)).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("is inert while closed", () => {
    render(drawer(false));
    expect(document.getElementById("conversation-drawer")!.hasAttribute("inert")).toBe(true);
  });

  it("shows No saved conversation yet for a person without history", () => {
    const empty = fixtures.personDetailNoHistory.data;
    render(
      <ConversationDrawer
        open
        onClose={vi.fn()}
        detail={empty}
        loading={false}
        recognized={[empty.person]}
        focusedId={empty.person.id}
        onFocus={vi.fn()}
        recordDisabled={false}
        flow={null}
        toggleRef={createRef()}
      />,
    );
    expect(screen.getByText("No saved conversation yet")).toBeTruthy();
  });
});

describe("PeopleDrawer", () => {
  it("asks for confirmation before deleting", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const person = fixtures.peopleList.data.people[0];
    render(
      <PeopleDrawer
        open
        onClose={vi.fn()}
        people={fixtures.peopleList.data.people}
        loading={false}
        error={null}
        onDelete={onDelete}
        toggleRef={createRef()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: `Delete ${person.displayName}` }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `Confirm delete ${person.displayName}` }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(person));
  });
});

describe("GlassToasts", () => {
  it("keeps one toast for a repeated message and expires transient ones", () => {
    vi.useFakeTimers();
    const toast = { id: "n", tone: "warning" as const, text: "Could not get a clear view of the face.", ttlMs: 1000 };
    const { rerender } = render(<GlassToasts toasts={[toast]} />);
    rerender(<GlassToasts toasts={[{ ...toast }]} />);
    expect(screen.getAllByText(toast.text)).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.queryByText(toast.text)).toBeNull();
  });

  it("keeps persistent issues until dismissed", () => {
    render(<GlassToasts toasts={[{ id: "h", tone: "critical", text: "Backend unreachable" }]} />);
    expect(screen.getByRole("alert").textContent).toContain("Backend unreachable");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("Backend unreachable")).toBeNull();
  });
});
