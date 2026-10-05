/**
 * calibration-pair — defective design for r3_split_correlations.
 * Domain: An optional calibration pairs a raw sensor reading with its reference reading. Neither half is a usable calibration.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// support.ts — unchanged related definition
export interface Calibration { raw?: number; reference?: number; }

// subject.ts — reviewed declaration
export interface CaseState {
  /** An optional calibration pairs a raw sensor reading with its reference reading. Neither half is a usable calibration. */
  label: string;
  calibration?: Calibration;
}

// TypeScript accepts this domain-invalid value.
export const acceptedByType: CaseState = { label: "sensor", calibration: { reference: 20 } };
