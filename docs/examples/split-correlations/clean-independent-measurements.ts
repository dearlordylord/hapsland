/**
 * clean-independent-measurements — nearby correct control for r3_split_correlations.
 * Domain: Room temperature and humidity are independently available measurements; either remains meaningful without the other.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** Room temperature and humidity are independently available measurements; either remains meaningful without the other. */
  label: string;
  temperatureCelsius?: number;
  humidityPercent?: number;
}

// TypeScript accepts this valid control value.
export const acceptedByType: CaseState = { label: "room", temperatureCelsius: 21 };
