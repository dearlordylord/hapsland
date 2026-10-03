import type { CaseState } from "./subject.js";
declare const subject: CaseState;
const publisher = (text: string): void => { void text; };
const witness = { displayLabel: "any presentation", publishBulletin: publisher };
const checked: CaseState = witness;
