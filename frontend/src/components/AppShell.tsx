"use client";
/**
 * Single-page controller (Ishan Phase 1a; Bhavya 2026-10-10 by human decision):
 * camera -> recognition loop -> stable identity, auto-enrollment of a steady unknown
 * face, live people list with delete, and the recognized person's latest cue.
 * Voice introduction (Vansh, human-approved 2026-10-10): after capture, one 8 s listening
 * window prefills the name via ElevenLabs STT + Gemini; the user still taps Save.
 * Conversation memory (Vansh, human-approved): "Record conversation" on a recognized person
 * records up to 60 s, drafts a reviewed reminder, and saves it as that person's latest cue.
 * Liquid Glass layout (Arnav, human-requested 2026-10-10): camera-first stage with floating
 * header, identity card, conversation and people drawers, toolbar and toasts. Recognition,
 * enrollment and API logic are unchanged; only presentation and drawer state are new.
 * Who is this? (Bhavya 2026-10-10): speaks the focused recognized person's name, relationship
 * and latest cue on request; stops when that person leaves the frame or the mic is needed.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { AppHeader, type HealthState } from "@/components/AppHeader";
import { CameraToolbar } from "@/components/CameraToolbar";
import { CameraViewport, type FaceOverlay } from "@/components/CameraViewport";
import { ConversationDrawer } from "@/components/ConversationDrawer";
import { ConversationPanel } from "@/components/ConversationPanel";
import { EnrollmentCard } from "@/components/EnrollmentCard";
import { GlassFilters } from "@/components/glass/GlassFilters";
import { GlassToasts, type ToastItem } from "@/components/glass/GlassToast";
import { useEdgeSwipeOpen } from "@/components/glass/useDrawer";
import { IdentityCard, type IdentityView } from "@/components/IdentityCard";
import { PeopleDrawer } from "@/components/PeopleDrawer";
import { useAutoEnrollment } from "@/hooks/useAutoEnrollment";
import { useCamera } from "@/hooks/useCamera";
import { useConversationMemory } from "@/hooks/useConversationMemory";
import { useRecognitionLoop } from "@/hooks/useRecognitionLoop";
import { useVoiceIntroduction } from "@/hooks/useVoiceIntroduction";
import { useWhoIsThis } from "@/hooks/useWhoIsThis";
import {
  ApiClientError,
  deletePerson,
  getHealth,
  getPerson,
  listPeople,
  type FrameResult,
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

/** At or above this width the conversation panel may open by itself for a new person. */
const WIDE_QUERY = "(min-width: 900px)";
/** Below this width only one drawer is open at a time. */
const NARROW_QUERY = "(max-width: 767px)";

function matches(query: string): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(query).matches;
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

export function AppShell() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [tracker, setTracker] = useState<TrackerState>(initialTracker);
  const [lastResult, setLastResult] = useState<FrameResult | null>(null);
  const [details, setDetails] = useState<Record<string, PersonDetail>>({});
  const trackerRef = useRef<TrackerState>(initialTracker);

  // Drawer state belongs to the user: recognition frames never toggle it.
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [autoOpenedFor, setAutoOpenedFor] = useState<string | null>(null);
  const peopleToggleRef = useRef<HTMLButtonElement>(null);
  const conversationToggleRef = useRef<HTMLButtonElement>(null);

  const camera = useCamera();
  const cameraLive = camera.state.kind === "live";

  const refreshPeople = useCallback(async () => {
    try {
      setPeople(await listPeople());
      setPeopleError(null);
    } catch (error) {
      setPeopleError(messageFor(error, "Could not load people."));
    } finally {
      setPeopleLoading(false);
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

  // Spoken reminder; never overlaps the microphone (shared audio lock).
  const who = useWhoIsThis();

  // Auto-listen (default on): one bounded window per new face, never continuous.
  const voice = useVoiceIntroduction();
  const [autoListen, setAutoListen] = useState(true);
  const autoListenRef = useRef(autoListen);
  const changeAutoListen = useCallback((enabled: boolean) => {
    autoListenRef.current = enabled;
    setAutoListen(enabled);
  }, []);

  const startEnrollment = useCallback(async () => {
    who.stop(); // the listening window must not hear our own speech
    voice.cancel(); // never carry a previous visitor's introduction into this session
    const ready = await enrollment.begin();
    if (ready && autoListenRef.current) await voice.listen();
  }, [enrollment, voice, who]);

  // A saved conversation refreshes that person's details so the new cue shows at once.
  const conversation = useConversationMemory((personId) => {
    setDetails((current) => {
      const next = { ...current };
      delete next[personId];
      return next;
    });
  });
  const conversationActiveRef = useRef(false);
  useEffect(() => {
    conversationActiveRef.current = conversation.active;
  }, [conversation.active]);

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
      // Never open an enrollment listening window during a conversation recording.
      if (shouldStartEnrollment(next) && enrollment.canAutoStart() && !conversationActiveRef.current) {
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
      .then((value) => {
        setPeople(value);
        setPeopleLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPeopleError(messageFor(error, "Could not load people."));
        setPeopleLoading(false);
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
        .catch(() => undefined); // the face keeps its pending label; retried on the next change
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

  // Confirmation happens inline in the People drawer.
  const onDelete = useCallback(
    async (person: Person) => {
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

  const recognized = stableIds.flatMap((id) => (details[id] ? [details[id].person] : []));

  // Which person the conversation panel shows: the recording's locked person, else the
  // user's pick if still in view, else the first recognized person.
  const lockedId = conversation.state.kind !== "idle" ? conversation.state.person.id : null;
  const focusedId =
    lockedId ?? (chosenId && recognized.some((person) => person.id === chosenId) ? chosenId : (recognized[0]?.id ?? null));
  const focusedDetail = focusedId ? (details[focusedId] ?? null) : null;

  // Open the panel by itself once per newly recognized person with history (wide screens).
  // A person who returns does not reopen it; the user's close is respected until then.
  const autoCandidate = focusedDetail && focusedDetail.conversations.length > 0 ? focusedDetail.person.id : null;
  if (autoCandidate && autoCandidate !== autoOpenedFor) {
    setAutoOpenedFor(autoCandidate);
    if (matches(WIDE_QUERY) && !peopleOpen) setConversationOpen(true);
  }

  const openConversation = useCallback((person?: Person) => {
    if (person) setChosenId(person.id);
    setConversationOpen(true);
    if (matches(NARROW_QUERY)) setPeopleOpen(false);
  }, []);
  const togglePeople = useCallback(() => {
    setPeopleOpen((open) => {
      if (!open && matches(NARROW_QUERY)) setConversationOpen(false);
      return !open;
    });
  }, []);

  const startConversation = useCallback(
    (person: Person) => {
      who.stop(); // recording must not pick up the spoken reminder
      openConversation(person);
      void conversation.start(person);
    },
    [conversation, openConversation, who],
  );

  // Stop speaking about someone who is no longer recognized in the frame.
  const speakingId = who.state.kind === "idle" ? null : who.state.personId;
  const speakingStillHere = !speakingId || recognized.some((person) => person.id === speakingId);
  useEffect(() => {
    if (!speakingStillHere && who.busy) who.stop();
  }, [speakingStillHere, who]);

  useEdgeSwipeOpen("right", () => openConversation());
  useEdgeSwipeOpen("left", () => {
    setPeopleOpen(true);
    if (matches(NARROW_QUERY)) setConversationOpen(false);
  });

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
          if (!track.stableId) {
            // A face with a match candidate is still being confirmed; never name it early.
            return track.candidateId ? { ...base, kind: "pending" as const } : { ...base, kind: "unknown" as const };
          }
          if (!known) return { ...base, kind: "pending" as const, personId: track.stableId };
          return {
            ...base,
            kind: "known" as const,
            personId: known.person.id,
            name: known.person.displayName,
            relationship: known.person.relationship,
          };
        })
      : [];

  let identity: IdentityView;
  if (!cameraLive || enrolling || naming) identity = { kind: "off" };
  else if (!lastResult) identity = { kind: "looking" };
  else if (lastResult.faces.length === 0) identity = { kind: "none" };
  // Faces in the last frame but no tracks yet (just reset): wait for the next frame.
  else if (tracker.tracks.length === 0) identity = { kind: "looking" };
  else if (recognized.length > 0)
    identity = { kind: "recognized", people: recognized, otherFaces: tracker.tracks.length - recognized.length };
  else if (overlays.some((overlay) => overlay.kind === "pending")) identity = { kind: "pending", faces: tracker.tracks.length };
  else identity = { kind: "unknown", faces: tracker.tracks.length };

  const recordDisabled = conversation.active || voice.state.kind === "listening";
  const flow =
    conversation.state.kind !== "idle" && conversation.state.kind !== "saved" ? (
      <ConversationPanel
        state={conversation.state}
        onStop={conversation.stop}
        onRetryDraft={conversation.retryDraft}
        onSave={(edited) => void conversation.save(edited)}
        onDiscard={conversation.discard}
      />
    ) : null;

  // Toasts mirror real state; the same message on every frame keeps one stable toast.
  const toasts: ToastItem[] = [];
  if (health.kind === "error") toasts.push({ id: "health", tone: "critical", text: `Backend: ${health.message}` });
  else if (health.kind === "ready" && !health.health.vision.ready)
    toasts.push({
      id: "vision",
      tone: "warning",
      text: `Face model not ready${health.health.vision.detail ? `: ${health.health.vision.detail}` : "."}`,
    });
  if (cameraLive && status.kind === "error") toasts.push({ id: "recognition", tone: "critical", text: status.text });
  if (peopleError) toasts.push({ id: "people", tone: "warning", text: peopleError });
  if (enrollment.state.kind === "idle" && enrollment.state.notice)
    toasts.push({ id: "enroll-notice", tone: "warning", text: enrollment.state.notice, ttlMs: 6000 });
  if (enrollment.state.kind === "saved")
    toasts.push({ id: "enroll-saved", tone: "success", text: `Saved ${enrollment.state.person.displayName}. Recognizing…` });
  if (who.state.kind === "loading" || who.state.kind === "playing")
    toasts.push({ id: "who-is-this", tone: "info", text: `🔊 ${who.state.text}` });
  if (who.state.kind === "error")
    toasts.push({ id: "who-is-this", tone: "warning", text: `${who.state.text} (Speech: ${who.state.message})`, ttlMs: 10000 });
  if (conversation.state.kind === "saved")
    toasts.push({
      id: "conversation-saved",
      tone: "success",
      text: `Saved. Next time you see ${conversation.state.person.displayName}: “${conversation.state.cue}”`,
    });

  const running = camera.state.kind === "live" || camera.state.kind === "starting";
  const conversationAvailable = !!focusedId || !!flow;

  return (
    <div className="fixed inset-0 p-2 sm:p-3">
      <GlassFilters />
      <CameraViewport
        videoRef={camera.videoRef}
        camera={camera.state}
        onStart={() => void camera.start()}
        overlays={overlays}
        mirrored={camera.facing === "user"}
      >
        {/* Header */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex justify-start sm:inset-x-4 sm:top-4">
          <div className="pointer-events-auto max-w-full">
            <AppHeader health={health} status={status} cameraLive={cameraLive} />
          </div>
        </div>

        {/* Identity: upper right, sliding aside while the conversation panel is open. */}
        <div
          data-overlay
          className={`absolute right-3 top-[68px] z-20 transition-transform duration-[560ms] [transition-timing-function:var(--ease-spring)] sm:right-4 sm:top-4 ${
            conversationOpen ? "md:-translate-x-[396px]" : ""
          } ${identity.kind === "off" ? "pointer-events-none" : ""}`}
          aria-live="polite"
        >
          <IdentityCard
            view={identity}
            onRecordConversation={startConversation}
            recordDisabled={recordDisabled}
            onOpenConversation={(person) => openConversation(person)}
            focusedPersonId={focusedId}
            conversationOpen={conversationOpen}
          />
        </div>

        {/* Toasts */}
        {/* Phones: above the toolbar, clear of the identity card. Larger screens: under the header. */}
        <div className="pointer-events-none absolute inset-x-3 bottom-[92px] z-40 flex justify-center sm:bottom-auto sm:top-20">
          <GlassToasts toasts={toasts} />
        </div>

        {/* Drawers */}
        <div className="pointer-events-none absolute bottom-[88px] left-3 top-[68px] z-30 flex items-start sm:left-4 sm:top-[76px]">
          {/* Only an open drawer takes clicks; a closed one must not block the camera UI under it. */}
          <div className={`flex max-h-full ${peopleOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
            <PeopleDrawer
              open={peopleOpen}
              onClose={() => setPeopleOpen(false)}
              people={people}
              loading={peopleLoading}
              error={peopleError}
              onDelete={onDelete}
              toggleRef={peopleToggleRef}
            />
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-[88px] right-3 top-[68px] z-30 flex items-start justify-end sm:right-4 sm:top-4">
          <div className={`flex max-h-full ${conversationOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
            <ConversationDrawer
              open={conversationOpen}
              onClose={() => setConversationOpen(false)}
              detail={focusedDetail}
              loading={!!focusedId && !focusedDetail}
              recognized={recognized}
              focusedId={focusedId}
              onFocus={(person) => setChosenId(person.id)}
              onRecord={conversation.active ? undefined : startConversation}
              recordDisabled={recordDisabled}
              flow={flow}
              toggleRef={conversationToggleRef}
            />
          </div>
        </div>

        {/* Enrollment sheet above the toolbar */}
        {(enrolling || naming) && (
          <div
            data-overlay
            className="absolute inset-x-3 bottom-[88px] z-30 flex max-h-[calc(100%-180px)] justify-center"
          >
            <div className={`flex max-h-full ${naming ? "w-full max-w-[440px]" : ""}`}>
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
                  onRetryDraft: voice.retryDraft,
                }}
              />
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3 sm:bottom-4">
          <div className="pointer-events-auto">
            <CameraToolbar
              running={running}
              onStop={stopCamera}
              canSwitch={camera.canSwitch}
              onSwitch={() => void switchCamera()}
              peopleOpen={peopleOpen}
              onTogglePeople={togglePeople}
              peopleCount={people.length}
              peopleRef={peopleToggleRef}
              conversationOpen={conversationOpen}
              onToggleConversation={() => (conversationOpen ? setConversationOpen(false) : openConversation())}
              conversationAvailable={conversationAvailable}
              conversationRef={conversationToggleRef}
              whoIsThis={{
                available: !!focusedDetail && !conversation.active && voice.state.kind !== "listening",
                busy: who.busy,
                onClick: () => (who.busy ? who.stop() : focusedDetail && void who.speak(focusedDetail)),
              }}
            />
          </div>
        </div>
      </CameraViewport>
    </div>
  );
}
