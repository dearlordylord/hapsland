/**
 * color-channels — defective design for r3_split_correlations.
 * Domain: An optional RGB color must supply all three channels. A lone red channel is not a color.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** An optional RGB color must supply all three channels. A lone red channel is not a color. */
  label: string;
  red?: number;
  green?: number;
  blue?: number;
}

// TypeScript accepts this domain-invalid value.
export const acceptedByType: CaseState = { label: "paint", red: 255 };
