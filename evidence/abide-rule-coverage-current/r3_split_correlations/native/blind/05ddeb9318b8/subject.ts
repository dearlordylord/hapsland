import type { Calibration } from "./support";
export interface CaseState {
  /** Presentation text for this case state. */
  displayLabel: string;
  /** An optional calibration pairs a raw sensor reading with its reference reading. Neither half is a usable calibration. */
  calibration?: Calibration;
}
