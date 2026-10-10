"use client";
/** Top-level client shell (owner: Ishan). Phase 0: backend status + placeholders only. */
import { useEffect, useState } from "react";

import { ApiClientError, getHealth, type Health } from "@/lib/api-client";
import { FixtureModeBanner } from "@/components/FixtureModeBanner";
import { PlaceholderPanel } from "@/components/PlaceholderPanel";

type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; health: Health }
  | { kind: "error"; message: string };

export function AppShell() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

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

  return (
    <div className="flex min-h-full flex-col">
      {state.kind === "ready" && state.health.mode === "fixture" && <FixtureModeBanner />}
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
        <header>
          <h1 className="text-2xl font-bold">forget-not</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Familiar-person reminder prototype</p>
        </header>
        <section aria-live="polite" className="rounded-lg bg-zinc-100 p-4 text-sm dark:bg-zinc-900">
          {state.kind === "loading" && <p>Checking backend…</p>}
          {state.kind === "error" && <p className="text-red-700 dark:text-red-400">Backend: {state.message}</p>}
          {state.kind === "ready" && (
            <ul className="space-y-1">
              <li>Backend mode: {state.health.mode}</li>
              <li>Database ready: {String(state.health.database.ready)}</li>
              <li>Face model ready: {String(state.health.vision.ready)}</li>
            </ul>
          )}
        </section>
        <PlaceholderPanel title="Camera & recognition" owner="Ishan / Bhavya" />
        <PlaceholderPanel title="Enrollment" owner="Ishan" />
        <PlaceholderPanel title="Person & history" owner="Ishan" />
        <PlaceholderPanel title="Conversation recording" owner="Ishan / Vansh" />
      </main>
    </div>
  );
}
