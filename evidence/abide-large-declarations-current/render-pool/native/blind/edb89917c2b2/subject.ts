/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */
export interface CaseState {
  displayLabel: string;
  workerCount: number;
}
