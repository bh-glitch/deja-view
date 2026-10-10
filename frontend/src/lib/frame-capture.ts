/**
 * Camera frame -> JPEG snapshot (owner: Ishan). Frames are always drawn unmirrored;
 * only the on-screen preview is mirrored. Output: longest edge <= 1280 px, <= 1 MB.
 */
import { MAX_FRAME_BYTES, MAX_FRAME_LONGEST_EDGE } from "@/lib/vision-client";

const JPEG_QUALITIES = [0.85, 0.7, 0.55, 0.4];

/** Scale (width, height) down so the longest edge is at most `maxEdge`. Never upscales. */
export function scaledFrameSize(
  width: number,
  height: number,
  maxEdge: number = MAX_FRAME_LONGEST_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.min(maxEdge, Math.max(1, Math.round(width * scale))),
    height: Math.min(maxEdge, Math.max(1, Math.round(height * scale))),
  };
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Snapshot the current video frame as an unmirrored JPEG.
 * Returns null if the video has no frame yet; throws if no quality fits in 1 MB.
 */
export async function captureJpegFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  const { width, height } = scaledFrameSize(video.videoWidth, video.videoHeight);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable.");
  context.drawImage(video, 0, 0, width, height);
  for (const quality of JPEG_QUALITIES) {
    const blob = await toJpeg(canvas, quality);
    if (blob && blob.size <= MAX_FRAME_BYTES) return blob;
  }
  throw new Error("Could not encode the frame as a JPEG under 1 MB.");
}
