import type { LoadPreview } from "./support";
export interface CaseState {
  /** Presentation text for the case. */
  displayLabel: string;
  /** Loading a preview reads preview text from a preview store. */
  loadPreview: LoadPreview;
}
