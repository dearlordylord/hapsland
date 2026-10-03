import type { SigningState } from "./support";
export interface CaseState {
  /** A draft cannot have a signing certificate; a signed document must have one. */
  displayLabel: string;
  document: SigningState;
}
