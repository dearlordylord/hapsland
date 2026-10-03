/**
 * cache-retention — defective design for r2_meaningless_combinations.
 * Domain: Disabled caching stores nothing; a retention duration applies only when caching is enabled.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// subject.ts — reviewed declaration
export interface CaseState {
  /** Disabled caching stores nothing; a retention duration applies only when caching is enabled. */
  label: string;
  cacheEnabled: boolean;
  retainMinutes: 5 | 30;
}

// TypeScript accepts this domain-invalid value.
export const acceptedByType: CaseState = { label: "cache", cacheEnabled: false, retainMinutes: 30 };
