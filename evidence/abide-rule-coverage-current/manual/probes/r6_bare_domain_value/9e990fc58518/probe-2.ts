import type { CaseState } from "./subject.js";
import type { AccountId, ProjectId } from "./support.js";
declare const accountA: AccountId;
declare const accountB: AccountId;
declare const projectA: ProjectId;
declare const projectB: ProjectId;
const witness = { displayLabel: "different text", account: accountB, project: projectB };
const checked: CaseState = witness;
