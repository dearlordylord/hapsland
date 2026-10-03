/**
 * clean-audio-resampling — valid negative control for the duplicate-encoding rule.
 *
 * Domain: The record describes a stored audio track and a requested playback sampleRate. Resampling is allowed. Requested and native rates are independent; every combination with either channel count is valid.
 *
 * This combines the two starting fixture files for reading. In the experiment,
 * the related definitions were in an unchanged support.ts, outside the edit diff.
 * Native agents started with this shape, then renamed label to displayLabel.
 * This is an input example, not an agent repair or a new experimental result.
 *
 * Source: ../../../evidence/abide-contextual-current/abide-contextual-fixtures.mjs
 * Authority: explanatory projection of frozen validation inputs.
 * Review when the report or its supporting campaign is replaced; regenerate or
 * delete these examples with that replacement. The frozen fixture owns inputs.
 */

// support.ts — unchanged related definitions
export interface AudioTrack { encoding: AudioEncoding; }
export interface AudioEncoding { sampleRate: 44100 | 48000; channels: 1 | 2; }

// subject.ts — public record
export interface CaseState { label: string; track: AudioTrack; /** Requested playback rate; resampling is allowed. */ sampleRate: 44100 | 48000; }

// TypeScript accepts this value. The domain allows these different, independent values.
export const acceptedByType: CaseState = { label: "demo", track: { encoding: { sampleRate: 44100, channels: 2 } }, sampleRate: 48000 };
