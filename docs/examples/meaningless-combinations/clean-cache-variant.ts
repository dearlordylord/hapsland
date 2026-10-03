/**
 * clean-cache-variant — nearby correct control for r2_meaningless_combinations.
 * Domain: Disabled caching carries no retention; enabled caching carries a retention duration.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** Disabled caching carries no retention; enabled caching carries a retention duration. */
  label: string;
  cache: { enabled: false; retainMinutes?: never } | { enabled: true; retainMinutes: 5 | 30 };
  note?: string;
}

// TypeScript accepts this valid control value.
export const acceptedByType: CaseState = { label: "off", cache: { enabled: false } };
