"use client";
/**
 * Camera lifecycle (Ishan Phase 1a; front/back switching by Bhavya 2026-10-10).
 * Starts only from `start()`; `stop()` releases every track. `switchFacing()` restarts the
 * stream with the other camera (front "user" / back "environment") on phones.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState =
  | { kind: "off" }
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "error"; message: string };

export type CameraFacing = "user" | "environment";

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
  const [facing, setFacing] = useState<CameraFacing>("user");
  const [cameraCount, setCameraCount] = useState(0);

  const release = useCallback(() => {
    attemptRef.current += 1;
    stopTracks(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    release();
    setState({ kind: "off" });
  }, [release]);

  const open = useCallback(async (wanted: CameraFacing) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ kind: "error", message: "This browser cannot access a camera here (use localhost or HTTPS)." });
      return;
    }
    const attempt = ++attemptRef.current;
    setState({ kind: "starting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: wanted }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (attempt !== attemptRef.current) {
        stopTracks(stream);
        return;
      }
      streamRef.current = stream;
      const settings = stream.getVideoTracks()[0]?.getSettings();
      // Prefer what the camera reports; laptops often report nothing, so fall back to the request.
      const reported = settings?.facingMode;
      setFacing(reported === "environment" || reported === "user" ? reported : wanted);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      // Device labels/counts are only reliable after permission is granted.
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      setCameraCount(devices.filter((device) => device.kind === "videoinput").length);
      setState({ kind: "live" });
    } catch (error) {
      if (attempt !== attemptRef.current) return;
      setState({ kind: "error", message: cameraErrorMessage(error) });
    }
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    await open(facing);
  }, [facing, open]);

  const switchFacing = useCallback(async () => {
    const next: CameraFacing = facing === "user" ? "environment" : "user";
    release();
    await open(next);
  }, [facing, open, release]);

  useEffect(
    () => () => {
      attemptRef.current += 1;
      stopTracks(streamRef.current);
      streamRef.current = null;
    },
    [],
  );

  return { videoRef, state, start, stop, facing, canSwitch: cameraCount > 1, switchFacing };
}
