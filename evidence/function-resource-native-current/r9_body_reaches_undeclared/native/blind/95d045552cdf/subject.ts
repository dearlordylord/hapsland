export function CaseState(displayLabel: string, deadline: number, now: number): boolean {
  /** Expiry checking compares a deadline against the supplied observation time. */
  void displayLabel;
  const expired = deadline <= now;
  return expired;
}
