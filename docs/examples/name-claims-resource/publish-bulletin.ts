/**
 * publish-bulletin — defective design for r8_name_claims_resource.
 * Domain: Publishing a bulletin writes to a publication channel. The public callable must name that channel in its declaration.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** Publishing a bulletin writes its text to a publication channel. */
  label: string;
  publishBulletin: (text: string) => void;
}

// Observation: The publishBulletin signature names text only; the name promises a write but no channel or effect requirement appears.
