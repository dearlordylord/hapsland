import type { CaseState } from "./subject.js";
declare const subject: CaseState;
const loader = (): string => "";
const witness = { displayLabel: "another presentation", loadPreview: loader };
const checked: CaseState = witness;
