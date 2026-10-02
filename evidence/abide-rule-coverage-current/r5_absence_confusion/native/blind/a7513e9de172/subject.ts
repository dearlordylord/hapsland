import type { RecipientList } from "./support";
export interface CaseState {
  /** A notification batch must contain at least one recipient; empty batches have no domain meaning. */
  displayLabel: string;
  recipients: RecipientList;
}
