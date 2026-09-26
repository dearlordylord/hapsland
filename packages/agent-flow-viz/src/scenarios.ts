import { MAX_STOP_CONTINUATIONS, type EventId } from "./flow";

// Editorial situations to replay. Routes and state changes come from the reducer.
export const TRACES = [
  { name: "Send advice after a tool", description: "The after-tool hook asks for advice. Hapsland selects a finding and writes the hook response. The agent runtime controls further use.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "FindingRetained", "BackgroundHookFired",
    "AdviceLeasedByBackground", "HostOutputSubmitted",
  ] },
  { name: "Send advice again at Stop", description: "Background holds a batch when Stop begins waiting. Advice output through the background hook completes during that wait; Stop offers the advice once more in the same virtual round.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "FindingRetained", "BackgroundHookFired",
    "AdviceLeasedByBackground", "StopHookFired", "HostOutputSubmitted",
    "AdviceReofferedAtStop", "HostOutputSubmitted",
  ] },
  { name: "Stop waits; first advice blocks finish", description: "Stop requests advice while Jev is running. This example supplies the result before any collection deadline; it does not simulate timeout behavior.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "StopHookFired", "JevResponseReceived", "FindingRetained",
    "AdviceLeasedByStop", "HostOutputSubmitted",
  ] },
  { name: "Clear result", description: "A Jev result with no finding updates the review status. There is no advice to send.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "ClearRecorded",
  ] },
  { name: "Jev unavailable", description: "A failed Jev request records a failed review. It does not establish that the source has no finding.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevUnavailable",
  ] },
  { name: "Edit opens a virtual round", description: "An agent can enter through an attributed edit without a user-prompt hook. The runtime adapter handles root and subagent details.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "FindingRetained", "StopHookFired",
    "AdviceLeasedByStop", "HostOutputSubmitted", "StopHookFired", "StopAllowed",
  ] },
  { name: "Stop wait expires; close and discard", description: "Jev has not replied when Hapsland allows Stop. All live virtual-round data is removed, including the running request. A fresh edit can open another virtual round.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "StopHookFired", "StopAllowed", "EditObserved",
  ] },
  { name: `${MAX_STOP_CONTINUATIONS} continuation requests`, description: `Each repair can be reviewed again. ${MAX_STOP_CONTINUATIONS} Stop responses request continuation in the same virtual round; the next Stop must close it.`, events: [
    ...Array.from({ length: MAX_STOP_CONTINUATIONS }, () => [
      "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
      "JevRequestSent", "JevResponseReceived", "FindingRetained", "StopHookFired",
      "AdviceLeasedByStop", "HostOutputSubmitted",
    ] as const).flat(), "StopHookFired", "StopAllowed",
  ] },
] as const satisfies ReadonlyArray<{ readonly name: string; readonly description: string; readonly events: ReadonlyArray<EventId> }>;

// Adding a domain event requires an accepted scenario that can project it.
type CoveredEvent = (typeof TRACES)[number]["events"][number];
const completeCoverage: Exclude<EventId, CoveredEvent> extends never ? true : never = true;
void completeCoverage;
