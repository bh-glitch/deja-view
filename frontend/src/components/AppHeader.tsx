"use client";
/**
 * Compact floating header (Arnav, human-requested Liquid Glass redesign): brand, the
 * fixture-data badge (never hidden), and a small diagnostics popover for backend details.
 */
import { useRef, useState } from "react";

import { FixtureModeBanner } from "@/components/FixtureModeBanner";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { ActivityIcon } from "@/components/glass/Icons";
import { useDrawerDismiss } from "@/components/glass/useDrawer";
import type { RecognitionStatus } from "@/hooks/useRecognitionLoop";
import type { Health } from "@/lib/api-client";

export type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; health: Health }
  | { kind: "error"; message: string };

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6 py-1">
      <dt className="text-ink/60">{label}</dt>
      <dd className="flex items-center gap-1.5 font-medium">
        {ok !== undefined && (
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
        )}
        {value}
      </dd>
    </div>
  );
}

function frameSummary(status: RecognitionStatus, cameraLive: boolean): string {
  if (!cameraLive) return "camera off";
  if (status.kind === "waiting") return "waiting for first frame";
  if (status.kind === "error") return `error: ${status.text}`;
  const faces = status.result.faces.length;
  const matched = status.result.faces.filter((face) => face.status === "matched").length;
  return `${faces} face${faces === 1 ? "" : "s"} · ${matched} matched · ${status.latencyMs} ms`;
}

function Diagnostics({ health, status, cameraLive }: { health: HealthState; status: RecognitionStatus; cameraLive: boolean }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useDrawerDismiss({ open, onClose: () => setOpen(false), panelRef, ignoreRefs: [toggleRef] });
  const problem = health.kind === "error" || (health.kind === "ready" && (!health.health.database.ready || !health.health.vision.ready));

  return (
    <div className="relative">
      <button
        ref={toggleRef}
        type="button"
        className="hw-key"
        aria-label="Diagnostics"
        aria-expanded={open}
        aria-controls="diagnostics-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <ActivityIcon size={17} className={problem ? "text-amber-600" : undefined} />
        <span aria-hidden className="glass-tip" data-side="bottom">
          Diagnostics
        </span>
      </button>
      <GlassSurface
        ref={panelRef}
        id="diagnostics-panel"
        elevation="strong"
        data-overlay
        data-open={open}
        data-from="top"
        inert={!open}
        className="float-in absolute right-0 top-[calc(100%+10px)] z-40 w-[min(300px,calc(100vw-32px))] rounded-[22px] p-4 text-[13px]"
      >
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink/55">Diagnostics</h2>
        <dl aria-live="polite">
          {health.kind === "loading" && <Row label="Backend" value="Checking backend…" />}
          {health.kind === "error" && <Row label="Backend" value={health.message} ok={false} />}
          {health.kind === "ready" && (
            <>
              <Row label="Backend" value={`Backend: ${health.health.mode}`} ok />
              <Row label="Database" value={health.health.database.ready ? "ready" : "not ready"} ok={health.health.database.ready} />
              <Row label="Face model" value={health.health.vision.ready ? "ready" : "not ready"} ok={health.health.vision.ready} />
              {health.health.vision.model && <Row label="Model" value={health.health.vision.model.packName} />}
            </>
          )}
          <Row label="Last frame" value={frameSummary(status, cameraLive)} />
        </dl>
      </GlassSurface>
    </div>
  );
}

export function AppHeader({
  health,
  status,
  cameraLive,
}: {
  health: HealthState;
  status: RecognitionStatus;
  cameraLive: boolean;
}) {
  const fixtureMode = health.kind === "ready" && health.health.mode === "fixture";
  const healthy =
    health.kind === "ready" && health.health.database.ready && health.health.vision.ready;
  // Molded hardware shell (human-requested console-inspired styling): status LED, brand,
  // a seam groove, then the recessed Diagnostics key.
  return (
    <div data-overlay className="hw-shell flex items-center gap-2 rounded-full py-[5px] pl-3 pr-[5px] sm:gap-3 sm:pl-4">
      <span aria-hidden className="hw-led shrink-0" data-tone={health.kind === "loading" || healthy ? undefined : "warn"} />
      <div className="flex items-baseline gap-2">
        <h1 className="whitespace-nowrap text-[17px] font-semibold tracking-tight">forget-not</h1>
        <span className="hidden text-xs text-ink/50 sm:inline">Familiar-person reminder prototype</span>
      </div>
      {fixtureMode && <FixtureModeBanner />}
      <span aria-hidden className="hw-groove hidden sm:block" />
      <Diagnostics health={health} status={status} cameraLive={cameraLive} />
    </div>
  );
}
