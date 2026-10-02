import type { CaseState } from "./subject.js";
declare const subject: CaseState;
const store = { read: (): string => "preview" };
subject.loadPreview(store);
