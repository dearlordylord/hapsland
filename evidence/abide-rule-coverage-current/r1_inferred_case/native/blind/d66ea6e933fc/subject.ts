import type { RenderOptions } from "./support";
export interface CaseState {
  /** Rendering either returns bytes to the caller or writes bytes to a destination. */
  displayLabel: string;
  output: RenderOptions;
}
