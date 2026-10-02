/**
 * muted-topics — defective design for r5_absence_confusion.
 * Domain: The muted topics set is always known. Both omission and an empty array mean no muted topics.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** The muted topics set is always known. Both omission and an empty array mean no muted topics. */
  label: string;
  mutedTopics?: string[];
}

// TypeScript accepts omission and []; both encode the same known empty set.
export const acceptedByType: CaseState = { label: "reader" };
