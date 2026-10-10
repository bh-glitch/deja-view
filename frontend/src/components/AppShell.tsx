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
import {
  initialTracker,
  shouldStartEnrollment,
  stablePersonIds,
  trackFrame,
  type TrackerState,
} from "@/lib/identity-tracker";

type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; health: Health }
  | { kind: "error"; message: string };

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

function emptyIdentityText(result: FrameResult | null, cameraLive: boolean): string {
  if (!cameraLive) return "Start the camera to recognize people.";
  if (!result) return "Looking…";
  const faces = result.faces.length;
  if (faces === 0) return "No one in view.";
  if (faces === 1) return "This face is not saved yet.";
  return `${faces} faces in view, none saved yet. To add someone, have them face the camera alone.`;
}

export function AppShell() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [tracker, setTracker] = useState<TrackerState>(initialTracker);
  const [lastResult, setLastResult] = useState<FrameResult | null>(null);
  const [details, setDetails] = useState<Record<string, PersonDetail>>({});
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
    setDetails({});
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
      if (result.faces.length === 0) enrollment.noteFaceLeft();
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

  // Load details for newly recognized people (one request each, cached until a reset).
  const stableIds = stablePersonIds(tracker);
  const missingKey = stableIds.filter((id) => !details[id]).sort().join(",");
  useEffect(() => {
    if (!missingKey) return;
    const controller = new AbortController();
    for (const id of missingKey.split(",")) {
      getPerson(id, controller.signal)
        .then((value) => setDetails((current) => ({ ...current, [id]: value })))
        .catch(() => undefined); // the face keeps its "…" label; retried on the next change
    }
    return () => controller.abort();
  }, [missingKey]);

  // Stopping the camera ends any enrollment session and clears identity.
  const stopCamera = useCallback(() => {
    camera.stop();
    if (enrollment.state.kind === "capturing" || enrollment.state.kind === "naming") enrollment.dismiss();
    resetIdentity();
    setLastResult(null);
  }, [camera, enrollment, resetIdentity]);

  // A different camera shows a different scene: drop names and any enrollment in progress.
  const switchCamera = useCallback(async () => {
    if (enrollment.state.kind === "capturing" || enrollment.state.kind === "naming") enrollment.dismiss();
    resetIdentity();
    setLastResult(null);
    await camera.switchFacing();
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

  const recognized = stableIds.flatMap((id) => (details[id] ? [details[id]] : []));
  const overlays: FaceOverlay[] =
    lastResult && !naming
      ? tracker.tracks.map((track) => {
          const known = track.stableId ? details[track.stableId] : undefined;
          return {
            key: track.trackId,
            box: track.box,
            frameWidth: lastResult.frameWidth,
            frameHeight: lastResult.frameHeight,
            label: known ? known.person.displayName : track.stableId ? "…" : "Unknown",
            tone: track.stableId ? "known" : "unknown",
          };
        })
      : [];

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
            overlays={overlays}
            paused={enrolling}
            mirrored={camera.facing === "user"}
            canSwitch={camera.canSwitch}
            onSwitch={() => void switchCamera()}
          />
          <div className="flex flex-col gap-4">
            <EnrollmentCard
              key={enrollment.state.kind}
              state={enrollment.state}
              onSave={(name, relationship) => void enrollment.save(name, relationship)}
              onDismiss={enrollment.dismiss}
              mirrored={camera.facing === "user"}
            />
            {!naming &&
              (recognized.length > 0 ? (
                recognized.map((item) => (
                  <IdentityCard key={item.person.id} person={item.person} latestCue={item.latestCue} />
                ))
              ) : (
                <IdentityCard person={null} latestCue={null} emptyText={emptyIdentityText(lastResult, cameraLive)} />
              ))}
            <PeopleList people={people} error={peopleError} onDelete={(person) => void onDelete(person)} />
          </div>
        </div>
      </main>
    </div>
  );
}
