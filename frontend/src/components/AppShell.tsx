"use client";
/**
 * Single-page controller (Ishan Phase 1a; Bhavya 2026-10-10 by human decision):
 * camera -> recognition loop -> stable identity, auto-enrollment of a steady unknown
 * face, live people list with delete, and the recognized person's latest cue.
 * Voice introduction (Vansh, human-approved 2026-10-10): after capture, one 8 s listening
 * window prefills the name via ElevenLabs STT + Gemini; the user still taps Save.
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
import { useVoiceIntroduction } from "@/hooks/useVoiceIntroduction";
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

  // Auto-listen (default on): one bounded window per new face, never continuous.
  const voice = useVoiceIntroduction();
  const [autoListen, setAutoListen] = useState(true);
  const autoListenRef = useRef(autoListen);
  const changeAutoListen = useCallback((enabled: boolean) => {
    autoListenRef.current = enabled;
    setAutoListen(enabled);
  }, []);

  const startEnrollment = useCallback(async () => {
    voice.cancel(); // never carry a previous visitor's introduction into this session
    const ready = await enrollment.begin();
    if (ready && autoListenRef.current) await voice.listen();
  }, [enrollment, voice]);

  const dismissEnrollment = useCallback(() => {
    voice.cancel();
    enrollment.dismiss();
  }, [enrollment, voice]);

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
        void startEnrollment();
      }
    },
    [enrollment, startEnrollment],
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
    if (enrollment.state.kind === "capturing" || enrollment.state.kind === "naming") dismissEnrollment();
    resetIdentity();
    setLastResult(null);
  }, [camera, dismissEnrollment, enrollment.state.kind, resetIdentity]);

  // A different camera shows a different scene: drop names and any enrollment in progress.
  const switchCamera = useCallback(async () => {
    if (enrollment.state.kind === "capturing" || enrollment.state.kind === "naming") dismissEnrollment();
    resetIdentity();
    setLastResult(null);
    await camera.switchFacing();
  }, [camera, dismissEnrollment, enrollment.state.kind, resetIdentity]);

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
          const base = {
            key: track.trackId,
            box: track.box,
            frameWidth: lastResult.frameWidth,
            frameHeight: lastResult.frameHeight,
          };
          if (!track.stableId) return { ...base, kind: "unknown" as const };
          if (!known) return { ...base, kind: "pending" as const, personId: track.stableId };
          return {
            ...base,
            kind: "known" as const,
            personId: known.person.id,
            name: known.person.displayName,
            relationship: known.person.relationship,
            cue: known.latestCue,
            cueAt: known.conversations[0]?.endedAt ?? null,
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
              onDismiss={dismissEnrollment}
              mirrored={camera.facing === "user"}
              voice={{
                state: voice.state,
                autoListen,
                onAutoListenChange: changeAutoListen,
                onListen: () => void voice.listen(),
                onFinish: voice.finish,
                onCancel: voice.cancel,
              }}
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
