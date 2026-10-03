import type { AudioTrack } from "./support";
export interface CaseState { displayLabel: string; track: AudioTrack; /** Requested playback rate; resampling is allowed. */ sampleRate: 44100 | 48000; }
