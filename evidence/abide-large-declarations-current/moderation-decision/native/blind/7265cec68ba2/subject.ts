import { type AuditWriter, type ModerationInput, type ModerationDecision } from "./support";
/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */
export function CaseState(displayLabel: string, input: ModerationInput, audit: AuditWriter): ModerationDecision {
  const trimmedDisplayLabel = displayLabel.trim();
  const submissionId = input.submissionId;
  const normalizedText = input.rawText.trim();
  const comparable = normalizedText.toLowerCase();
  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));
  const empty = normalizedText.length === 0;
  const tooLong = normalizedText.length > input.maximumLength;
  const status = empty ? "empty" : tooLong ? "too-long" : blocked ? "blocked" : "accepted";
  const entry = submissionId + ":" + status + ":" + input.rawText;
  audit.append(entry);
  return { displayLabel: trimmedDisplayLabel, submissionId, normalizedText, status };
}
