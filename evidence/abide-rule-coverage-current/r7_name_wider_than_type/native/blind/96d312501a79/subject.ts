export interface CaseState {
  /** Presentation text. */
  displayLabel: string;
  /** An enabled small worker pool has exactly one, two or four workers, as encoded by its literal union. */
  workerCount: 1 | 2 | 4;
  note?: string;
}
