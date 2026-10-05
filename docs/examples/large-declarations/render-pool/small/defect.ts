/**
 * Synthetic defect input: The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size.
 * small layout. This file is an input, not a claimed reviewer result.
 * Owner: scripts/abide-large-declaration-fixtures.mjs; review when its fixtures change.
 */
/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */
export interface CaseState {
  label: string;
  workerCount: number;
}
