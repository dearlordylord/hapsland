export interface CaseState {
  /** Publishing a bulletin writes its text to a publication channel. */
  displayLabel: string;
  publishBulletin: (publicationChannel: string, text: string) => void;
}
