/**
 * Shared microphone/speaker lock (owner: Vansh): never record while synthesized
 * speech is playing, and never play speech while recording.
 */
let recording = false;
let speechPlaying = false;

export function isRecording(): boolean {
  return recording;
}

export function isSpeechPlaying(): boolean {
  return speechPlaying;
}

export function setRecording(active: boolean): void {
  recording = active;
}

export function setSpeechPlaying(active: boolean): void {
  speechPlaying = active;
}
