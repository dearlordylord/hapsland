/**
 * hidden-audit-write — defective design for r9_body_reaches_undeclared.
 * Domain: Summarizing text also records an audit entry. A writer must be supplied explicitly when the function mutates audit state.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// support.ts — unchanged related definition
export const auditEntries: string[] = [];
export function recordAudit(text: string): void { auditEntries.push(text); }

// CaseState is the study harness export name for this operation.
// subject.ts — reviewed declaration
export function CaseState(label: string, text: string): string {
  /** Summarizing text records an audit entry and returns trimmed text. */
  void label;
  recordAudit(text);
  return text.trim();
}

// Observation: Calling CaseState("demo", " hello ") adds an entry to auditEntries despite no writer or state in the signature.
