export interface CaseState {
  /** An enabled small worker pool has exactly one, two or four workers, as encoded by its literal union. */
  displayLabel: string;
  workerCount: 1 | 2 | 4;
  note?: string;
}
