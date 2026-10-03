import type { CaseState } from "./subject.js";
declare const subject: CaseState;
const publisher = (channel: {publish:(text:string)=>void}, text:string):void => { channel.publish(text); };
const witness = { displayLabel: "any presentation", publishBulletin: publisher, note: "independent arbitrary note" };
const checked: CaseState = witness;
