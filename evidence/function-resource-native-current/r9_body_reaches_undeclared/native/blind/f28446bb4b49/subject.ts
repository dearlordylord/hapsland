export function CaseState(displayLabel: string, deadline: number, currentTime: () => number): boolean {
  /** Expiry checking compares a deadline against the current clock reading. */
  void displayLabel;
  return deadline <= currentTime();
}
