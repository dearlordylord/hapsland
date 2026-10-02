export interface CaseState {
  /** Presentation text for this case. */
  displayLabel: string;
  /** Descriptions and notes are free text; the domain accepts arbitrary strings for both. */
  description: string;
  note?: string;
}
