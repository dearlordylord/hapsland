/**
 * document-signature — defective design for r2_meaningless_combinations.
 * Domain: A draft cannot have a signing certificate; a signed document must have one.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// support.ts — unchanged related definition
export interface SigningState { state: "draft" | "signed"; certificate?: "alice" | "bob"; }

// subject.ts — reviewed declaration
export interface CaseState {
  /** A draft cannot have a signing certificate; a signed document must have one. */
  label: string;
  document: SigningState;
}

// TypeScript accepts this domain-invalid value.
export const acceptedByType: CaseState = { label: "draft", document: { state: "draft", certificate: "alice" } };
