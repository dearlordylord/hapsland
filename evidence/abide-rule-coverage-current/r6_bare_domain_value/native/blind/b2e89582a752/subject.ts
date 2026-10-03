export interface CaseState {
  /** Presentation text. */
  displayLabel: string;
  /** The booking domain recognizes exactly standard and accessible seat classes; arbitrary text is not a class. */
  seatClass: 'standard' | 'accessible';
}
