export interface CaseState {
  /** Descriptions and notes are free text; the domain accepts arbitrary strings for both. */
  displayLabel: string;
  description: string;
  note?: string;
}
