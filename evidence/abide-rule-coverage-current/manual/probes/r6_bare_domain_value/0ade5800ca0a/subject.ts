import type { AccountId, ProjectId } from "./support";
export interface CaseState {
  /** A project belongs to an account. Account identities and project identities cannot be substituted for one another. */
  displayLabel: string;
  account: AccountId;
  project: ProjectId;
}
