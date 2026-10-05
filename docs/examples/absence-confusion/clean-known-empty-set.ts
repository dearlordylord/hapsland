/**
 * clean-known-empty-set — nearby correct control for r5_absence_confusion.
 * Domain: The muted topics set is always known; an empty required array is the single representation of no muted topics.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** The muted topics set is always known; an empty required array is the single representation of no muted topics. */
  label: string;
  mutedTopics: string[];
  note?: string;
}

// TypeScript accepts this valid control value.
export const acceptedByType: CaseState = { label: "reader", mutedTopics: [] };
