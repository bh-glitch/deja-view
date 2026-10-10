/**
 * Vision HTTP client (owner: Ishan). Frames are unmirrored JPEG snapshots,
 * <= 1 MB, longest edge <= 1280 px. Keep at most one request in flight.
 */
import { apiJson, type EnrollmentSample, type FrameResult } from "@/lib/api-client";

export const MAX_FRAME_BYTES = 1_000_000;
export const MAX_FRAME_LONGEST_EDGE = 1280;

function frameForm(frame: Blob): FormData {
  const form = new FormData();
  form.append("frame", frame, "frame.jpg");
  return form;
}

export function recognizeFrame(frame: Blob, signal?: AbortSignal): Promise<FrameResult> {
  return apiJson<FrameResult>("/vision/recognize", { method: "POST", body: frameForm(frame), signal });
}

export function captureEnrollmentSample(frame: Blob, signal?: AbortSignal): Promise<EnrollmentSample> {
  return apiJson<EnrollmentSample>("/vision/enrollment-sample", {
    method: "POST",
    body: frameForm(frame),
    signal,
  });
}
