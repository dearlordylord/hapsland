/**
 * audio-encoding — defective input for the duplicate-encoding rule.
 *
 * Domain: The record describes one stored audio track. Its sampleRate is the native encoding rate of that track. Channels are independent; either channel count is valid at either rate.
 *
 * This combines the two starting fixture files for reading. In the experiment,
 * the related definitions were in an unchanged support.ts, outside the edit diff.
 * Native agents started with this shape, then renamed label to displayLabel.
 * This is an input example, not an agent repair or a new experimental result.
 *
 * Source snapshot: https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/abide-contextual-current/abide-contextual-fixtures.mjs
 * Authority: explanatory projection of frozen validation inputs.
 * Review when the report or its supporting campaign is replaced; regenerate or
 * delete these examples with that replacement. The frozen fixture owns inputs.
 */

// support.ts — unchanged related definitions
export interface AudioTrack { encoding: AudioEncoding; }
export interface AudioEncoding { sampleRate: 44100 | 48000; channels: 1 | 2; }

// subject.ts — public record
export interface CaseState { label: string; track: AudioTrack; sampleRate: 44100 | 48000; }

// TypeScript accepts this value. The domain forbids the contradictory copies.
export const acceptedByType: CaseState = { label: "demo", track: { encoding: { sampleRate: 44100, channels: 2 } }, sampleRate: 48000 };
