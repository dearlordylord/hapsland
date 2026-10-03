import { CaseState } from "./subject.js";
type FrozenInput = { submissionId:string; rawText:string; blockedTerms:readonly string[]; maximumLength:number };
type FrozenDecision = { description:string; submissionId:string; normalizedText:string; status:"empty"|"too-long"|"blocked"|"accepted" };
declare const input:FrozenInput; declare const label:string;
declare const writer:{append:(entry:string)=>void}; declare const callback:(entry:string)=>void;
const output:FrozenDecision = CaseState(label,input, writer);
