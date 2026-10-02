/**
 * required-recipients — defective design for r5_absence_confusion.
 * Domain: A notification batch must contain at least one recipient; empty batches have no domain meaning.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// support.ts — unchanged related definition
export type RecipientList = string[];

// subject.ts — reviewed declaration
export interface CaseState {
  /** A notification batch must contain at least one recipient; empty batches have no domain meaning. */
  label: string;
  recipients: RecipientList;
}

// TypeScript accepts this domain-invalid value.
export const acceptedByType: CaseState = { label: "batch", recipients: [] };
