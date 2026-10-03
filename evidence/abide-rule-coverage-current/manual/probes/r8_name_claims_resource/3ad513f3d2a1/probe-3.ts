import type { CaseState } from "./subject.js";
declare const subject: CaseState;
type Channel = Parameters<CaseState["publishBulletin"]>[0];
declare const channel: Channel;
channel.publish("text");
