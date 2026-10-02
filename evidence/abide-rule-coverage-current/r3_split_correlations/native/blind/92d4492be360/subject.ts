import type { Calibration } from "./support";
export interface CaseState {
  /** An optional calibration pairs a raw sensor reading with its reference reading. Neither half is a usable calibration. */
  displayLabel: string;
  calibration?: Calibration;
}
