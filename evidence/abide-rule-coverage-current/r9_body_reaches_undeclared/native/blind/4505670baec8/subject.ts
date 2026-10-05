export function CaseState(
  displayLabel: string,
  text: string,
  writer: (text: string) => void,
): string {
  /** Summarizing text records an audit entry and returns trimmed text. */
  void displayLabel;
  writer(text);
  return text.trim();
}
