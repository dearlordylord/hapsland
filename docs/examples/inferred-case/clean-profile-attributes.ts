/**
 * clean-profile-attributes — nearby correct control for r1_inferred_case.
 * Domain: A profile has one meaning. Biography and preferred pronouns are independent optional attributes, never alternative operations.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** A profile has one meaning. Biography and preferred pronouns are independent optional attributes, never alternative operations. */
  label: string;
  biography?: string;
  pronouns?: string;
}

// TypeScript accepts this valid control value.
export const acceptedByType: CaseState = { label: "profile", biography: "writer" };
