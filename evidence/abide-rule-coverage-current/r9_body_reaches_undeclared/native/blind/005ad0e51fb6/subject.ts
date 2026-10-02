import { recordAudit } from "./support";
export function CaseState(displayLabel: string, text: string): string {
  /** Summarizing text records an audit entry and returns trimmed text. */
  void displayLabel;
  recordAudit(text);
  return text.trim();
}
