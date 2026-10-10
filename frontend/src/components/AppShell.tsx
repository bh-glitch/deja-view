"use client";
/**
 * Top-level single-page shell (owner: Ishan). Phase 1a: layout regions, camera +
 * raw recognition loop, disabled "coming soon" controls. Synthetic fixtures fill the
 * identity card and people list only while the fixture-mode banner is shown.
 */
import { useEffect, useState } from "react";

import { ApiClientError, getHealth, type Health } from "@/lib/api-client";
import { fixtures } from "@/fixtures";
import { CameraPanel } from "@/components/CameraPanel";
import { ComingSoonButton } from "@/components/ComingSoonButton";
import { FixtureModeBanner } from "@/components/FixtureModeBanner";
import { IdentityCard } from "@/components/IdentityCard";
import { PeopleList } from "@/components/PeopleList";

type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; health: Health }
  | { kind: "error"; message: string };

const fixtureDetails = [fixtures.personDetailWithHistory.data, fixtures.personDetailNoHistory.data];
const fixturePeople = fixtures.peopleList.data.people;

export function AppShell() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(fixturePeople[0]?.id ?? null);

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then((health) => setState({ kind: "ready", health }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof ApiClientError ? error.message : "Backend health check failed.";
        setState({ kind: "error", message });
      });
    return () => controller.abort();
  }, []);

  const fixtureMode = state.kind === "ready" && state.health.mode === "fixture";
  const detail = fixtureMode ? fixtureDetails.find((d) => d.person.id === selectedId) : undefined;

  return (
    <div className="flex min-h-full flex-col">
      {fixtureMode && <FixtureModeBanner />}
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">forget-not</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Familiar-person reminder prototype</p>
          </div>
          <p aria-live="polite" className="text-xs text-zinc-500">
            {state.kind === "loading" && "Checking backend…"}
            {state.kind === "error" && <span className="text-red-700 dark:text-red-400">Backend: {state.message}</span>}
            {state.kind === "ready" &&
              `Backend: ${state.health.mode} · database ready: ${state.health.database.ready} · face model ready: ${state.health.vision.ready}`}
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-4">
            <CameraPanel />
            <section aria-labelledby="conversation-heading" className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
              <h2 id="conversation-heading" className="text-lg font-semibold">
                Microphone
              </h2>
              <div className="flex flex-wrap gap-2">
                <ComingSoonButton label="Listen" />
                <ComingSoonButton label="Record conversation" />
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-4">
            <IdentityCard person={detail?.person ?? null} latestCue={detail?.latestCue ?? null} />
            <section aria-labelledby="enrollment-heading" className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
              <h2 id="enrollment-heading" className="text-lg font-semibold">
                Enrollment
              </h2>
              <p className="text-sm text-zinc-500">Capture 3–5 samples of a new person, then confirm their name.</p>
              <div>
                <ComingSoonButton label="Enroll new person" />
              </div>
            </section>
            <PeopleList people={fixtureMode ? fixturePeople : []} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </div>
      </main>
    </div>
  );
}
