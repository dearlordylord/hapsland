/**
 * account-project-identities — defective design for r6_bare_domain_value.
 * Domain: A project belongs to an account. Account identities and project identities cannot be substituted for one another.
 *
 * This is a readable synthetic input, not a measured Hapsland or Abide result.
 * Starting source and unchanged related definitions are combined here for reading.
 * Authoritative input: scripts/abide-rule-coverage-fixtures.mjs.
 * Review or regenerate when that fixture collection changes.
 */

// support.ts — unchanged related definition
export type AccountId = string;
export type ProjectId = string;

// subject.ts — reviewed declaration
export interface CaseState {
  /** A project belongs to an account. Account identities and project identities cannot be substituted for one another. */
  label: string;
  account: AccountId;
  project: ProjectId;
}

// Distinct identities fit the same string type, so an accidental swap compiles.
const account: string = "account:2";
const project: string = "project:7";
export const acceptedByType: CaseState = { label: "project", account: project, project: account };
