import type { CaseState } from "./subject.js";
declare const subject: CaseState;
const channel = { publish(text: string): void { void text; } };
subject.publishBulletin(channel, "text");
