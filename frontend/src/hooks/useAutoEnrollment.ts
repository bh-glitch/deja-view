"use client";
/**
 * Auto-enrollment (Bhavya, human decision 2026-10-10; see docs/decisions.md).
 *
 * Steady unknown face -> capture 3-5 samples from the live camera -> "Save as ___?" card ->
 * one tap saves via createPerson. Nobody is saved without that tap. Samples, preview and
 * personId belong to one session; a visitor change or face loss during capture aborts it.
 * begin() resolves true once the card is ready for a name, so the controller can open the
 * voice-introduction window (useVoiceIntroduction); typing the name always works too.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import {
  ApiClientError,
  createPerson,
  type EnrollmentSample,
  type Person,
} from "@/lib/api-client";
import { boxJumped } from "@/lib/identity-tracker";
import { captureJpegFrame } from "@/lib/frame-capture";
import { captureEnrollmentSample } from "@/lib/vision-client";

export const TARGET_SAMPLES = 4;
export const MIN_SAMPLES = 3;
export const MAX_SAMPLE_FAILURES = 3;
export const SAMPLE_SPACING_MS = 350;
export const COOLDOWN_MS = 30_000;
export const SAVED_NOTICE_MS = 4000;

export type EnrollmentState =
  | { kind: "idle"; notice: string | null }
  | { kind: "capturing"; captured: number }
  | {
      kind: "naming";
      previewUrl: string | null;
      saving: boolean;
      error: string | null;
    }
  | { kind: "saved"; person: Person };

interface Session {
  personId: string;
  samples: EnrollmentSample[];
  previewUrl: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function messageFor(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function useAutoEnrollment(videoRef: RefObject<HTMLVideoElement | null>, onSaved: (person: Person) => void) {
  const [state, setState] = useState<EnrollmentState>({ kind: "idle", notice: null });
  const session = useRef<Session | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Cooldown: no auto-start until the face leaves or the time passes.
  const cooldown = useRef<{ until: number; untilFaceLeaves: boolean }>({ until: 0, untilFaceLeaves: false });

  const releaseSession = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (session.current?.previewUrl) URL.revokeObjectURL(session.current.previewUrl);
    session.current = null;
  }, []);

  useEffect(() => releaseSession, [releaseSession]);

  // The "Saved" notice clears itself after a few seconds.
  useEffect(() => {
    if (state.kind !== "saved") return;
    const timer = window.setTimeout(() => setState({ kind: "idle", notice: null }), SAVED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [state.kind]);

  const startCooldown = useCallback(() => {
    cooldown.current = { until: Date.now() + COOLDOWN_MS, untilFaceLeaves: true };
  }, []);

  const abort = useCallback(
    (notice: string) => {
      releaseSession();
      startCooldown();
      setState({ kind: "idle", notice });
    },
    [releaseSession, startCooldown],
  );

  /** Called by the controller on `no_face`: the visitor left, so the cooldown can end. */
  const noteFaceLeft = useCallback(() => {
    cooldown.current.untilFaceLeaves = false;
  }, []);

  const canAutoStart = useCallback(() => {
    if (state.kind === "capturing" || state.kind === "naming") return false;
    const { until, untilFaceLeaves } = cooldown.current;
    return !untilFaceLeaves || Date.now() >= until;
  }, [state.kind]);

  const begin = useCallback(async (): Promise<boolean> => {
    const video = videoRef.current;
    if (!video || session.current) return false;
    const controller = new AbortController();
    abortRef.current = controller;
    const current: Session = { personId: crypto.randomUUID(), samples: [], previewUrl: null };
    session.current = current;
    setState({ kind: "capturing", captured: 0 });

    const canvas = document.createElement("canvas");
    let failures = 0;
    let lastFrame: Blob | null = null;
    while (current.samples.length < TARGET_SAMPLES && failures < MAX_SAMPLE_FAILURES) {
      if (controller.signal.aborted) return false;
      try {
        const frame = await captureJpegFrame(video, canvas);
        if (!frame) {
          failures += 1;
        } else {
          const sample = await captureEnrollmentSample(frame, controller.signal);
          const previous = current.samples.at(-1);
          if (previous && boxJumped(previous.box, sample.box)) {
            abort("The person changed during capture. Try again.");
            return false;
          }
          current.samples.push(sample);
          lastFrame = frame;
          setState({ kind: "capturing", captured: current.samples.length });
        }
      } catch (error) {
        if (controller.signal.aborted) return false;
        if (error instanceof ApiClientError && error.code === "MULTIPLE_FACES") {
          abort("More than one face is visible. Enrollment needs one person.");
          return false;
        }
        if (!(error instanceof ApiClientError) || !error.retryable) {
          abort(`Could not capture the face: ${messageFor(error)}`);
          return false;
        }
        failures += 1;
      }
      await sleep(SAMPLE_SPACING_MS);
    }
    if (current.samples.length < MIN_SAMPLES) {
      abort("Could not get a clear view of the face. Face the camera and try again.");
      return false;
    }
    current.previewUrl = lastFrame ? URL.createObjectURL(lastFrame) : null;
    setState({ kind: "naming", previewUrl: current.previewUrl, saving: false, error: null });
    return true;
  }, [abort, videoRef]);

  const save = useCallback(
    async (displayName: string, relationship: string) => {
      const current = session.current;
      if (!current || !displayName.trim()) return;
      setState((s) => (s.kind === "naming" ? { ...s, saving: true, error: null } : s));
      try {
        const person = await createPerson({
          personId: current.personId, // reused on retry for idempotency
          displayName: displayName.trim(),
          relationship: relationship.trim() || null,
          model: current.samples[0].model,
          embeddings: current.samples.map((sample) => sample.embedding),
        });
        releaseSession();
        setState({ kind: "saved", person });
        onSaved(person);
      } catch (error) {
        if (error instanceof ApiClientError && error.code === "ENROLLMENT_INCOHERENT") {
          abort("The captured samples did not look like one person. Try again.");
          return;
        }
        setState((s) => (s.kind === "naming" ? { ...s, saving: false, error: messageFor(error) } : s));
      }
    },
    [abort, onSaved, releaseSession],
  );

  const dismiss = useCallback(() => {
    releaseSession();
    startCooldown();
    setState({ kind: "idle", notice: null });
  }, [releaseSession, startCooldown]);

  return { state, begin, save, dismiss, noteFaceLeft, canAutoStart };
}
