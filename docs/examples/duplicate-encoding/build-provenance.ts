/**
 * build-provenance — defective input for the duplicate-encoding rule.
 *
 * Domain: The record describes one built artifact. The record commit denotes the source revision of that artifact. The repository remains an independent provenance fact.
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
export interface BuildArtifact { provenance: BuildProvenance; }
export interface BuildProvenance { source: SourceRevision; }
export interface SourceRevision { commit: "a1" | "b2"; repository: "core" | "web"; }

// subject.ts — public record
export interface CaseState { label: string; artifact: BuildArtifact; commit: "a1" | "b2"; }

// TypeScript accepts this value. The domain forbids the contradictory copies.
export const acceptedByType: CaseState = { label: "demo", artifact: { provenance: { source: { commit: "a1", repository: "core" } } }, commit: "b2" };
