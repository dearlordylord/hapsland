/**
 * clean-worker-count — nearby correct control for r7_name_wider_than_type.
 * Domain: An enabled small worker pool has exactly one, two or four workers, as encoded by its literal union.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** An enabled small worker pool has exactly one, two or four workers, as encoded by its literal union. */
  label: string;
  workerCount: 1 | 2 | 4;
  note?: string;
}

// TypeScript accepts this valid control value.
export const acceptedByType: CaseState = { label: "pool", workerCount: 2 };
