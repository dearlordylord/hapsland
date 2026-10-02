/**
 * clean-free-form-description — nearby correct control for r6_bare_domain_value.
 * Domain: Descriptions and notes are free text; the domain accepts arbitrary strings for both.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** Descriptions and notes are free text; the domain accepts arbitrary strings for both. */
  label: string;
  description: string;
  note?: string;
}

// TypeScript accepts this valid control value.
export const acceptedByType: CaseState = { label: "entry", description: "anything" };
