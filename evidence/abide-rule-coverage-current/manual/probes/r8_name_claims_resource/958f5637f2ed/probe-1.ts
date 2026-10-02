import type { CaseState } from "./subject.js";
declare const subject: CaseState;
const channel = { publish(text: string): void { void text; } };
const result: void = subject.publishBulletin(channel, "arbitrary bulletin text");
