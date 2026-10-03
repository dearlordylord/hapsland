import type { RenderOptions } from "./support";
export interface CaseState {
  /** Presentation text. */
  displayLabel: string;
  /** Rendering either returns bytes to the caller or writes bytes to a destination. */
  output: RenderOptions;
}
