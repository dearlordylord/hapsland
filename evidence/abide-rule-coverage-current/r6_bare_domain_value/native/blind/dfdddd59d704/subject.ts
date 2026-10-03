export interface CaseState {
  displayLabel: string;
  /** The booking domain recognizes exactly standard and accessible seat classes; arbitrary text is not a class. */
  seatClass: "standard" | "accessible";
}
