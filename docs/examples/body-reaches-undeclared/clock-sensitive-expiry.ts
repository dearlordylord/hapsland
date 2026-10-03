/**
 * clock-sensitive-expiry — defective design for r9_body_reaches_undeclared.
 * Domain: Expiry checking compares a deadline to the clock. Its signature must expose the time dependency.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// support.ts — unchanged related definition
export function currentTime(): number { return Date.now(); }

// CaseState is the study harness export name for this operation.
// subject.ts — reviewed declaration
export function CaseState(label: string, deadline: number): boolean {
  /** Expiry checking compares a deadline against the current clock reading. */
  void label;
  return deadline <= currentTime();
}

// Observation: For identical arguments the result changes as the clock advances; currentTime reads Date.now in support.ts.
