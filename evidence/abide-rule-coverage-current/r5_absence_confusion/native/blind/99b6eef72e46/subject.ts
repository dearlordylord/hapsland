export interface CaseState {
  /** The muted topics set is always known; an empty required array is the single representation of no muted topics. */
  displayLabel: string;
  mutedTopics: string[];
  note?: string;
}
