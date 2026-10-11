"use client";
/**
 * Compact floating header (Arnav, human-requested Liquid Glass redesign): brand, the
 * fixture-data badge (never hidden), and a small diagnostics popover for backend details.
 */
import { useRef, useState } from "react";

import { FixtureModeBanner } from "@/components/FixtureModeBanner";
import { GlassButton } from "@/components/glass/GlassButton";
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
      <dt className="text-white/60">{label}</dt>
      <dd className="flex items-center gap-1.5 font-medium">
        {ok !== undefined && (
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-300" : "bg-red-300"}`} />
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
      <GlassButton
        ref={toggleRef}
        size="sm"
        variant="quiet"
        label="Diagnostics"
        tooltipSide="bottom"
        icon={<ActivityIcon size={17} className={problem ? "text-amber-300" : undefined} />}
        aria-expanded={open}
        aria-controls="diagnostics-panel"
        onClick={() => setOpen((value) => !value)}
      />
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
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/55">Diagnostics</h2>
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
  return (
    <GlassSurface
      elevation="base"
      data-overlay
      className="flex items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5"
    >
      <div className="flex items-baseline gap-2">
        <h1 className="text-[17px] font-semibold tracking-tight">forget-not</h1>
        <span className="hidden text-xs text-white/55 sm:inline">Familiar-person reminder prototype</span>
      </div>
      {fixtureMode && <FixtureModeBanner />}
      <Diagnostics health={health} status={status} cameraLive={cameraLive} />
    </GlassSurface>
  );
}
