export interface CaseState {
  /** Publishing a bulletin writes its text through the supplied channel. */
  displayLabel: string;
  publishBulletin: (channel: { publish: (text: string) => void }, text: string) => void;
  note?: string;
}
