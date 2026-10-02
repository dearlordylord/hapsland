/**
 * seat-class — defective design for r6_bare_domain_value.
 * Domain: The booking domain recognizes exactly standard and accessible seat classes; arbitrary text is not a class.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** The booking domain recognizes exactly standard and accessible seat classes; arbitrary text is not a class. */
  label: string;
  seatClass: string;
}

// TypeScript accepts this domain-invalid value.
export const acceptedByType: CaseState = { label: "seat", seatClass: "banana" };
