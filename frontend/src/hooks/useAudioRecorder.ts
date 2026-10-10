"use client";
/**
 * Explicit, bounded microphone recording (owner: Vansh).
 *
 * - `start({ maxDurationMs })` opens the mic only on an explicit call and auto-stops at
 *   the limit (default and maximum 60 s) or near 2 MB. Expected failures (permission,
 *   no mic, unsupported browser, speech playing) set `state="error"` and `error`
 *   instead of throwing.
 * - `stop()` returns the recording. After an automatic stop the state returns to
 *   "idle" and the next `stop()` returns that recording once.
 * - `cancel()` discards everything. Tracks are released on stop, cancel, error and unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { isRecording, isSpeechPlaying, setRecording } from "@/lib/audio/audio-lock";
import {
  RECORDING_BYTES_GUARD,
  type RecordedAudio,
  clampRecordingMs,
  extensionForMimeType,
  microphoneErrorMessage,
  pickRecordingMimeType,
} from "@/lib/audio/recorder";
import { MAX_AUDIO_BYTES } from "@/lib/audio/speech-client";

export type RecorderState = "idle" | "requesting" | "recording" | "stopping" | "error";

export interface AudioRecorder {
  state: RecorderState;
  error: string | null;
  elapsedMs: number;
  start: (options?: { maxDurationMs?: number }) => Promise<void>;
  stop: () => Promise<RecordedAudio | null>;
  cancel: () => void;
}

const TIMESLICE_MS = 250;
const TICK_MS = 200;

interface Session {
  cancelled: boolean;
  claimed: boolean;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  bytes: number;
  mimeType: string;
  startedAt: number;
  limitTimer: ReturnType<typeof setTimeout> | null;
  ticker: ReturnType<typeof setInterval> | null;
  finishing: Promise<RecordedAudio | null> | null;
}

function releaseTracks(session: Session): void {
  session.stream?.getTracks().forEach((track) => track.stop());
  session.stream = null;
}

function clearTimers(session: Session): void {
  if (session.limitTimer !== null) clearTimeout(session.limitTimer);
  if (session.ticker !== null) clearInterval(session.ticker);
  session.limitTimer = null;
  session.ticker = null;
}

export function useAudioRecorder(): AudioRecorder {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const sessionRef = useRef<Session | null>(null);
  const pendingRef = useRef<RecordedAudio | null>(null);
  const mountedRef = useRef(true);

  const fail = useCallback((message: string) => {
    if (!mountedRef.current) return;
    setError(message);
    setState("error");
  }, []);

  const finish = useCallback(
    (session: Session): Promise<RecordedAudio | null> => {
      if (session.finishing) return session.finishing;
      clearTimers(session);
      if (mountedRef.current) setState("stopping");
      session.finishing = new Promise<RecordedAudio | null>((resolve) => {
        const recorder = session.recorder;
        const complete = () => {
          releaseTracks(session);
          setRecording(false);
          if (sessionRef.current === session) sessionRef.current = null;
          if (session.cancelled) {
            resolve(null);
            return;
          }
          const durationMs = Math.round(performance.now() - session.startedAt);
          const blob = new Blob(session.chunks, { type: session.mimeType });
          if (mountedRef.current) setElapsedMs(durationMs);
          if (blob.size === 0) {
            fail("Nothing was recorded. Check the microphone and try again.");
            resolve(null);
            return;
          }
          if (blob.size > MAX_AUDIO_BYTES) {
            fail("The recording is larger than 2 MB. Record a shorter clip.");
            resolve(null);
            return;
          }
          const audio: RecordedAudio = {
            blob,
            filename: `recording.${extensionForMimeType(session.mimeType)}`,
            mimeType: session.mimeType,
            durationMs,
          };
          if (!session.claimed) pendingRef.current = audio;
          if (mountedRef.current) setState("idle");
          resolve(audio);
        };
        if (!recorder || recorder.state === "inactive") {
          complete();
          return;
        }
        recorder.onstop = complete;
        recorder.stop();
      });
      return session.finishing;
    },
    [fail],
  );

  const cancel = useCallback(() => {
    pendingRef.current = null;
    const session = sessionRef.current;
    if (session) {
      session.cancelled = true;
      clearTimers(session);
      if (session.recorder && session.recorder.state !== "inactive") {
        session.recorder.ondataavailable = null;
        session.recorder.stop();
      }
      releaseTracks(session);
      setRecording(false);
      sessionRef.current = null;
    }
    if (mountedRef.current) {
      setError(null);
      setElapsedMs(0);
      setState("idle");
    }
  }, []);

  const start = useCallback(
    async (options?: { maxDurationMs?: number }) => {
      if (sessionRef.current) return; // already requesting or recording
      pendingRef.current = null;
      setError(null);
      setElapsedMs(0);

      if (isSpeechPlaying()) {
        fail("Wait for the spoken reminder to finish before recording.");
        return;
      }
      if (isRecording()) {
        fail("Another recording is already in progress.");
        return;
      }
      const mimeType = pickRecordingMimeType();
      if (!mimeType || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        fail("This browser cannot record audio.");
        return;
      }

      const maxMs = clampRecordingMs(options?.maxDurationMs);
      const session: Session = {
        cancelled: false,
        claimed: false,
        stream: null,
        recorder: null,
        chunks: [],
        bytes: 0,
        mimeType,
        startedAt: 0,
        limitTimer: null,
        ticker: null,
        finishing: null,
      };
      sessionRef.current = session;
      setState("requesting");

      try {
        session.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch (caught) {
        if (sessionRef.current === session) sessionRef.current = null;
        if (!session.cancelled) fail(microphoneErrorMessage(caught));
        return;
      }
      if (session.cancelled || !mountedRef.current) {
        releaseTracks(session);
        return;
      }
      if (isSpeechPlaying()) {
        releaseTracks(session);
        sessionRef.current = null;
        fail("Wait for the spoken reminder to finish before recording.");
        return;
      }

      try {
        const recorder = new MediaRecorder(session.stream, { mimeType });
        session.recorder = recorder;
        session.mimeType = recorder.mimeType || mimeType;
        recorder.ondataavailable = (event: BlobEvent) => {
          if (!event.data || event.data.size === 0) return;
          session.chunks.push(event.data);
          session.bytes += event.data.size;
          if (session.bytes >= RECORDING_BYTES_GUARD) void finish(session);
        };
        recorder.onerror = () => {
          clearTimers(session);
          releaseTracks(session);
          setRecording(false);
          if (sessionRef.current === session) sessionRef.current = null;
          fail("Recording failed. Try again.");
        };
        recorder.start(TIMESLICE_MS);
      } catch {
        releaseTracks(session);
        sessionRef.current = null;
        fail("This browser cannot record audio in a supported format.");
        return;
      }

      setRecording(true);
      session.startedAt = performance.now();
      session.ticker = setInterval(() => {
        if (mountedRef.current) setElapsedMs(Math.round(performance.now() - session.startedAt));
      }, TICK_MS);
      session.limitTimer = setTimeout(() => void finish(session), maxMs);
      setState("recording");
    },
    [fail, finish],
  );

  const stop = useCallback(async (): Promise<RecordedAudio | null> => {
    const session = sessionRef.current;
    if (session && session.recorder) {
      session.claimed = true;
      return finish(session);
    }
    if (session) {
      // Still waiting for microphone permission: nothing recorded yet.
      cancel();
      return null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    return pending;
  }, [cancel, finish]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const session = sessionRef.current;
      if (session) {
        session.cancelled = true;
        clearTimers(session);
        if (session.recorder && session.recorder.state !== "inactive") session.recorder.stop();
        releaseTracks(session);
        setRecording(false);
        sessionRef.current = null;
      }
    };
  }, []);

  return { state, error, elapsedMs, start, stop, cancel };
}
