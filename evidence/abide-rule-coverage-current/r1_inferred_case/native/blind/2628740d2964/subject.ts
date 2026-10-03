export interface CaseState {
  /** A profile has one meaning. Biography and preferred pronouns are independent optional attributes, never alternative operations. */
  displayLabel: string;
  biography?: string;
  pronouns?: string;
}
