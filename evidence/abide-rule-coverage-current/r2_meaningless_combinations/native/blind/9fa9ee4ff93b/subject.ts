import type { SigningState } from "./support";
export interface CaseState {
  displayLabel: string;
  /** A draft cannot have a signing certificate; a signed document must have one. */
  document: SigningState;
}
