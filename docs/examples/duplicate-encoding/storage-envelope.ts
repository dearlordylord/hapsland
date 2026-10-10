/**
 * storage-envelope — defective input for the duplicate-encoding rule.
 *
 * Domain: The record describes one stored block. Its compression denotes the actual compression of that block on the wire. Generation is independent of compression.
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
export interface StoredBlock { wire: WireRepresentation; }
export interface WireRepresentation { compression: "none" | "zstd"; generation: 1 | 2; }

// subject.ts — public record
export interface CaseState { label: string; block: StoredBlock; compression: "none" | "zstd"; }

// TypeScript accepts this value. The domain forbids the contradictory copies.
export const acceptedByType: CaseState = { label: "demo", block: { wire: { compression: "none", generation: 1 } }, compression: "zstd" };
