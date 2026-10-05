/**
 * worker-count — defective design for r7_name_wider_than_type.
 * Domain: An enabled small worker pool has exactly one, two or four workers. Its count cannot be negative or fractional.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** An enabled small worker pool has exactly one, two or four workers. Its count cannot be negative or fractional. */
  label: string;
  workerCount: number;
}

// TypeScript accepts this domain-invalid value.
export const acceptedByType: CaseState = { label: "pool", workerCount: -1.5 };
