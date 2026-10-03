/**
 * render-destination — defective design for r1_inferred_case.
 * Domain: Rendering either returns bytes to the caller or writes to an output destination. An absent destination silently chooses a different operation.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// support.ts — unchanged related definition
export interface RenderOptions { destination?: string; }

// subject.ts — reviewed declaration
export interface CaseState {
  /** Rendering either returns bytes to the caller or writes bytes to a destination. */
  label: string;
  output: RenderOptions;
}

// TypeScript accepts this value, but no field explicitly names the operation.
export const acceptedByType: CaseState = { label: "render", output: {} };
