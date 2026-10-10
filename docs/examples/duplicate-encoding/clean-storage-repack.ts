/**
 * clean-storage-repack — valid negative control for the duplicate-encoding rule.
 *
 * Domain: The record describes a stored block and requested compression for a future repack. Stored and requested compression are independent; every combination at either generation is valid.
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
export interface CaseState { label: string; block: StoredBlock; /** Requested compression for a future repack; may differ from the stored block. */ compression: "none" | "zstd"; }

// TypeScript accepts this value. The domain allows these different, independent values.
export const acceptedByType: CaseState = { label: "demo", block: { wire: { compression: "none", generation: 1 } }, compression: "zstd" };
