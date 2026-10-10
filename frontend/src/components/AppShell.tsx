"use client";
/**
 * Single-page controller (Ishan Phase 1a; Bhavya 2026-10-10 by human decision):
 * camera -> recognition loop -> stable identity, auto-enrollment of a steady unknown
 * face, live people list with delete, and the recognized person's latest cue.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { CameraPanel, type FaceOverlay } from "@/components/CameraPanel";
import { EnrollmentCard } from "@/components/EnrollmentCard";
import { FixtureModeBanner } from "@/components/FixtureModeBanner";
import { IdentityCard } from "@/components/IdentityCard";
import { PeopleList } from "@/components/PeopleList";
import { useAutoEnrollment } from "@/hooks/useAutoEnrollment";
import { useCamera } from "@/hooks/useCamera";
import { useRecognitionLoop } from "@/hooks/useRecognitionLoop";
import {
  ApiClientError,
  deletePerson,
  getHealth,
  getPerson,
  listPeople,
  type FrameResult,
  type Health,
  type Person,
  type PersonDetail,
} from "@/lib/api-client";
import { initialTracker, shouldStartEnrollment, trackFrame, type TrackerState } from "@/lib/identity-tracker";

type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; health: Health }
  | { kind: "error"; message: string };

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

function emptyIdentityText(result: FrameResult | null, cameraLive: boolean): string {
  if (!cameraLive) return "Start the camera to recognize people.";
  switch (result?.status) {
    case "no_face":
      return "No one in view.";
    case "multiple_faces":
      return "More than one person in view. Not identifying anyone.";
    case "unknown":
      return "This face is not saved yet.";
    default:
      return "Looking…";
  }
}

export function AppShell() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [tracker, setTracker] = useState<TrackerState>(initialTracker);
  const [lastResult, setLastResult] = useState<FrameResult | null>(null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const trackerRef = useRef<TrackerState>(initialTracker);

  const camera = useCamera();
  const cameraLive = camera.state.kind === "live";

  const refreshPeople = useCallback(async () => {
    try {
      setPeople(await listPeople());
      setPeopleError(null);
    } catch (error) {
      setPeopleError(messageFor(error, "Could not load people."));
    }
  }, []);

  const resetIdentity = useCallback(() => {
    trackerRef.current = initialTracker;
    setTracker(initialTracker);
    setDetail(null);
  }, []);

  const enrollment = useAutoEnrollment(camera.videoRef, () => {
    resetIdentity();
    void refreshPeople();
  });
  const enrolling = enrollment.state.kind === "capturing";
  const naming = enrollment.state.kind === "naming";

  const onResult = useCallback(
    (result: FrameResult) => {
      const next = trackFrame(trackerRef.current, result);
      trackerRef.current = next;
      setTracker(next);
      setLastResult(result);
      if (result.status === "no_face") enrollment.noteFaceLeft();
      if (shouldStartEnrollment(next) && enrollment.canAutoStart()) {
        trackerRef.current = initialTracker;
        setTracker(initialTracker);
        void enrollment.begin();
      }
    },
    [enrollment],
  );

  const { status } = useRecognitionLoop(camera.videoRef, {
    enabled: cameraLive,
    paused: enrolling,
    onResult,
  });

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then((value) => setHealth({ kind: "ready", health: value }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHealth({ kind: "error", message: messageFor(error, "Backend health check failed.") });
      });
    listPeople(controller.signal)
      .then((value) => setPeople(value))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setPeopleError(messageFor(error, "Could not load people."));
      });
    return () => controller.abort();
  }, []);

  // Load the recognized person's detail; discard stale responses when identity changes.
  const stableId = tracker.stableId;
  useEffect(() => {
    if (!stableId) return; // `recognized` below ignores detail for any other person
    const controller = new AbortController();
    getPerson(stableId, controller.signal)
      .then((value) => setDetail(value))
      .catch(() => {
        if (!controller.signal.aborted) setDetail(null);
      });
    return () => controller.abort();
  }, [stableId]);

  // Stopping the camera ends any enrollment session and clears identity.
  const stopCamera = useCallback(() => {
    camera.stop();
    if (enrollment.state.kind === "capturing" || enrollment.state.kind === "naming") enrollment.dismiss();
    resetIdentity();
    setLastResult(null);
  }, [camera, enrollment, resetIdentity]);

  const onDelete = useCallback(
    async (person: Person) => {
      if (!window.confirm(`Delete ${person.displayName} and all their saved data?`)) return;
      try {
        await deletePerson(person.id);
        resetIdentity();
        await refreshPeople();
      } catch (error) {
        setPeopleError(messageFor(error, "Could not delete."));
      }
    },
    [refreshPeople, resetIdentity],
  );

  const recognized = detail && detail.person.id === stableId ? detail : null;
  const overlay: FaceOverlay | null =
    lastResult?.box && !naming
      ? {
          box: lastResult.box,
          frameWidth: lastResult.frameWidth,
          frameHeight: lastResult.frameHeight,
          label: recognized ? recognized.person.displayName : "Unknown",
          tone: recognized ? "known" : "unknown",
        }
      : null;

  const fixtureMode = health.kind === "ready" && health.health.mode === "fixture";

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
            {health.kind === "loading" && "Checking backend…"}
            {health.kind === "error" && <span className="text-red-700 dark:text-red-400">Backend: {health.message}</span>}
            {health.kind === "ready" &&
              `Backend: ${health.health.mode} · database ready: ${health.health.database.ready} · face model ready: ${health.health.vision.ready}`}
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
          <CameraPanel
            videoRef={camera.videoRef}
            camera={camera.state}
            onStart={() => void camera.start()}
            onStop={stopCamera}
            status={status}
            overlay={overlay}
            paused={enrolling}
          />
          <div className="flex flex-col gap-4">
            <EnrollmentCard
              key={enrollment.state.kind}
              state={enrollment.state}
              onSave={(name, relationship) => void enrollment.save(name, relationship)}
              onDismiss={enrollment.dismiss}
            />
            {!naming && (
              <IdentityCard
                person={recognized?.person ?? null}
                latestCue={recognized?.latestCue ?? null}
                emptyText={emptyIdentityText(lastResult, cameraLive)}
              />
            )}
            <PeopleList people={people} error={peopleError} onDelete={(person) => void onDelete(person)} />
          </div>
        </div>
      </main>
    </div>
  );
}
