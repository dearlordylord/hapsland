import type { CaseState } from "./subject.js";
import type { AccountId, ProjectId } from "./support.js";
declare const accountA: AccountId;
declare const accountB: AccountId;
declare const projectA: ProjectId;
declare const projectB: ProjectId;
const witness = { displayLabel: "any presentation", account: accountA, project: accountA };
const checked: CaseState = witness;
