export interface AuditWriter { append: (entry: string) => void; }
export const auditEntries: string[] = [];
export function appendAudit(entry: string): void { auditEntries.push(entry); }
export interface ModerationInput {
  submissionId: string;
  rawText: string;
  blockedTerms: readonly string[];
  maximumLength: number;
}
export interface ModerationDecision {
  displayLabel: string;
  submissionId: string;
  normalizedText: string;
  status: "empty" | "too-long" | "blocked" | "accepted";
}
