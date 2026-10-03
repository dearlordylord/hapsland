import type { RecipientList } from "./support";
export interface CaseState {
  displayLabel: string;
  /** A notification batch must contain at least one recipient; empty batches have no domain meaning. */
  recipients: RecipientList;
}
