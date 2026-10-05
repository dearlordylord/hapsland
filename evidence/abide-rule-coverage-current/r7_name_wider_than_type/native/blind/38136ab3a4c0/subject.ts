export interface CaseState {
  displayLabel: string;
  /** An enabled small worker pool has exactly one, two or four workers. Its count cannot be negative or fractional. */
  workerCount: 1 | 2 | 4;
}
