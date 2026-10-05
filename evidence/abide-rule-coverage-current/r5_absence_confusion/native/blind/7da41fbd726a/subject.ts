export interface CaseState {
  displayLabel: string;
  /** The muted topics set is always known. Both omission and an empty array mean no muted topics. */
  mutedTopics?: string[];
}
