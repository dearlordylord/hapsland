export interface CaseState {
  /** An archive action either keeps a document until a date or removes it immediately. */
  displayLabel: string;
  until?: "2026-10-01" | "2026-11-01";
}
