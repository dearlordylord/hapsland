/**
 * load-preview — defective design for r8_name_claims_resource.
 * Domain: Loading a preview reads from a preview store. The public callable must name that store in its declaration.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// support.ts — unchanged related definition
export type LoadPreview = () => string;

// subject.ts — reviewed declaration
export interface CaseState {
  /** Loading a preview reads preview text from a preview store. */
  label: string;
  loadPreview: LoadPreview;
}

// Observation: The loadPreview signature names no source although loading a preview is a resource read.
