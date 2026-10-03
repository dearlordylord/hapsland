import type { CaseState } from "./subject.js";
declare const subject: CaseState;
const loader = (): string => "arbitrary preview text";
const witness = { displayLabel: "any presentation", loadPreview: loader };
const checked: CaseState = witness;
