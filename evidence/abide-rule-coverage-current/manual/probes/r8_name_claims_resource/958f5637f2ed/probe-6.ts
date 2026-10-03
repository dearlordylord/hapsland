import type { CaseState } from "./subject.js";
declare const subject: CaseState;
const publisher = (channel: {publish:(text:string)=>void}, text:string):void => { channel.publish(text); };
const witness = { displayLabel: "different presentation", publishBulletin: publisher };
const checked: CaseState = witness;
