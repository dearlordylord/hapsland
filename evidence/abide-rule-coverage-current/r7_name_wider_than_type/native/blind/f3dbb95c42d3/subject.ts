export interface CaseState {
  /** An enabled small worker pool has exactly one, two or four workers. Its count cannot be negative or fractional. */
  displayLabel: string;
  workerCount: number;
}
