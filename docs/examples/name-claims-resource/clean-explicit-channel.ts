/**
 * clean-explicit-channel — nearby correct control for r8_name_claims_resource.
 * Domain: Publishing a bulletin writes through the explicit channel argument.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** Publishing a bulletin writes its text through the supplied channel. */
  label: string;
  publishBulletin: (channel: { publish: (text: string) => void }, text: string) => void;
  note?: string;
}

// Observation: The resource is explicit in the channel parameter; a resource verb is not by itself a defect.
