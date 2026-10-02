/**
 * retention-action — defective design for r1_inferred_case.
 * Domain: An archive action either keeps a document until a specified date or removes it immediately. The action must say which operation it represents.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** An archive action either keeps a document until a date or removes it immediately. */
  label: string;
  until?: "2026-10-01" | "2026-11-01";
}

// TypeScript accepts this value, but no field explicitly names the operation.
export const acceptedByType: CaseState = { label: "archive", until: undefined };
