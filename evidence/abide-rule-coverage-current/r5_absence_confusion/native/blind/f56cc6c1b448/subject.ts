export interface CaseState {
  /** The muted topics set is always known. Both omission and an empty array mean no muted topics. */
  displayLabel: string;
  mutedTopics?: string[];
}
