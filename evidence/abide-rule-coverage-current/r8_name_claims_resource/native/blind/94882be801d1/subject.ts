import type { LoadPreview } from "./support";
export interface CaseState {
  /** Loading a preview reads preview text from a preview store. */
  displayLabel: string;
  loadPreview: LoadPreview;
}
