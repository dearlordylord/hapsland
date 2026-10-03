export interface CaseState {
  /** Disabled caching carries no retention; enabled caching carries a retention duration. */
  displayLabel: string;
  cache: { enabled: false; retainMinutes?: never } | { enabled: true; retainMinutes: 5 | 30 };
  note?: string;
}
