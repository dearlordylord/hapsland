export interface CaseState {
  /** Disabled caching stores nothing; a retention duration applies only when caching is enabled. */
  displayLabel: string;
  cacheEnabled: boolean;
  retainMinutes: 5 | 30;
}
