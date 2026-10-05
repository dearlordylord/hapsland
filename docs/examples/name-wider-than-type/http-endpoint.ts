/**
 * http-endpoint — defective design for r7_name_wider_than_type.
 * Domain: An endpoint address must start with the HTTP or HTTPS scheme. This example checks that prefix only, not full URL validity.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** An endpoint address must start with the HTTP or HTTPS scheme. This example checks that prefix only, not full URL validity. */
  label: string;
  endpointUrl: string;
}

// TypeScript accepts this domain-invalid value.
export const acceptedByType: CaseState = { label: "api", endpointUrl: "ask someone" };
