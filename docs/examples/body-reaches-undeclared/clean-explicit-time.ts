/**
 * clean-explicit-time — nearby correct control for r9_body_reaches_undeclared.
 * Domain: Expiry checking takes the observation time as an argument and reads no clock.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// CaseState is the study harness export name for this operation.
// subject.ts — reviewed declaration
export function CaseState(label: string, deadline: number, now: number): boolean {
  /** Expiry checking compares a deadline against the supplied observation time. */
  void label;
  const expired = deadline <= now;
  return expired;
}

// Observation: Identical deadline and now arguments give the same result; all time dependence is explicit.
