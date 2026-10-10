"use client";
/** Camera lifecycle (owner: Ishan). Starts only from `start()`; `stop()` releases every track. */
import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState =
  | { kind: "off" }
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "error"; message: string };

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission was denied. Allow camera access for this site in your browser settings, then press Start camera again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No usable camera was found on this device.";
    case "NotReadableError":
      return "The camera is in use by another app or could not be opened.";
    default:
      return "The camera could not be started.";
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Incremented on every start/stop so a late getUserMedia result after Stop is discarded.
  const attemptRef = useRef(0);
  const [state, setState] = useState<CameraState>({ kind: "off" });

  const stop = useCallback(() => {
    attemptRef.current += 1;
    stopTracks(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState({ kind: "off" });
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ kind: "error", message: "This browser cannot access a camera here (use localhost or HTTPS)." });
      return;
    }
    const attempt = ++attemptRef.current;
    setState({ kind: "starting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (attempt !== attemptRef.current) {
        stopTracks(stream);
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setState({ kind: "live" });
    } catch (error) {
      if (attempt !== attemptRef.current) return;
      setState({ kind: "error", message: cameraErrorMessage(error) });
    }
  }, []);

  useEffect(
    () => () => {
      attemptRef.current += 1;
      stopTracks(streamRef.current);
      streamRef.current = null;
    },
    [],
  );

  return { videoRef, state, start, stop };
}
