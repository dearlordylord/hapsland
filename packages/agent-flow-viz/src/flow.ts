import { Schema } from "effect";

export const NODE_IDS = [
  "agentEdit", "workQueue", "preparation", "decisionRequest", "jev",
  "decisionResponse", "adviceStore", "collector", "hostOutput",
  "deliveryState", "outcomeStore",
] as const;
export type NodeId = (typeof NODE_IDS)[number];

export type NodeRole = "external" | "storage" | "process" | "boundary";
type NodeSpec = { readonly label: string; readonly detail: string; readonly role: NodeRole; readonly x: number; readonly y: number };
export const NODES = {
  agentEdit: { label: "Agent", detail: "one opaque agent identity", role: "external", x: 30, y: 332 },
  workQueue: { label: "Review scheduler", detail: "waits for capacity to run work", role: "storage", x: 320, y: 52 },
  preparation: { label: "Read and analyze source", detail: "extract reviewable artifacts", role: "process", x: 610, y: 52 },
  decisionRequest: { label: "Build review input", detail: "artifact + rule + evidence", role: "process", x: 900, y: 52 },
  jev: { label: "Jev", detail: "evaluates the review input", role: "external", x: 1190, y: 52 },
  decisionResponse: { label: "Read Jev result", detail: "finding or no finding", role: "process", x: 1190, y: 332 },
  adviceStore: { label: "Pending advice", detail: "findings for this agent", role: "storage", x: 900, y: 332 },
  collector: { label: "Select advice to send", detail: "request + eligible pending advice", role: "process", x: 610, y: 332 },
  hostOutput: { label: "Write hook response", detail: "advice in the runtime response format", role: "boundary", x: 320, y: 575 },
  deliveryState: { label: "Hapsland round", detail: "active round + continuation count", role: "storage", x: 30, y: 575 },
  outcomeStore: { label: "Record review status", detail: "no finding / review failed", role: "process", x: 1190, y: 575 },
} as const satisfies Record<NodeId, NodeSpec>;

export const FLAVORS = [
  "edit observation", "capture job", "review work item", "decision request",
  "network request", "decision response", "advice", "leased batch",
  "runtime submission", "review status",
] as const;
export type Flavor = (typeof FLAVORS)[number];

// These location contracts statically constrain the transition table below.
type StoredAt = {
  agentEdit: "edit observation";
  workQueue: "capture job" | "review work item";
  preparation: "capture job";
  decisionRequest: "decision request";
  jev: "network request";
  decisionResponse: "decision response";
  adviceStore: "advice";
  collector: "leased batch";
  hostOutput: "runtime submission";
  deliveryState: never;
  outcomeStore: "review status";
};
type DataTransition = {
  [From in NodeId]: {
    [To in NodeId]: {
      readonly kind: "data";
      readonly from: From;
      readonly to: To;
      readonly input: StoredAt[From];
      readonly output: StoredAt[To];
      readonly movement: "move" | "copy";
      readonly label: string;
    }
  }[NodeId]
}[NodeId];
type ControlTransition = {
  readonly kind: "control";
  readonly from: NodeId;
  readonly to: NodeId;
  readonly label: string;
  readonly signal: "background" | "stop" | "allow";
};
export type Transition = DataTransition | ControlTransition;

export const EVENT_IDS = [
  "EditObserved", "IngressStarted", "ReviewUnitPrepared",
  "UnitDispatched", "JevRequestSent", "JevResponseReceived", "FindingRetained",
  "ClearRecorded", "JevUnavailable", "BackgroundHookFired", "StopHookFired",
  "AdviceLeasedByBackground", "AdviceLeasedByStop", "AdviceReofferedAtStop",
  "HostOutputSubmitted", "StopAllowed",
] as const;
export type EventId = (typeof EVENT_IDS)[number];

// Discussion reducer: transitions describe sample payload changes.
// EditObserved means adapter-proven fresh input; all other inputs are already
// bound to this round. Native deduplication/callback fencing lives at the adapter.
// The process diagram may group several event variants into one connection.
// `satisfies` checks both event coverage and each node's admissible data flavor.
export const TRANSITIONS = {
  StopAllowed: { kind: "control", from: "collector", to: "deliveryState", label: "allow Stop; close round", signal: "allow" },
  EditObserved: { kind: "data", from: "agentEdit", to: "workQueue", input: "edit observation", output: "capture job", movement: "move", label: "proven fresh edit admitted" },
  IngressStarted: { kind: "data", from: "workQueue", to: "preparation", input: "capture job", output: "capture job", movement: "move", label: "start source capture" },
  ReviewUnitPrepared: { kind: "data", from: "preparation", to: "workQueue", input: "capture job", output: "review work item", movement: "move", label: "queue extracted review work" },
  UnitDispatched: { kind: "data", from: "workQueue", to: "decisionRequest", input: "review work item", output: "decision request", movement: "move", label: "unit dispatched" },
  JevRequestSent: { kind: "data", from: "decisionRequest", to: "jev", input: "decision request", output: "network request", movement: "move", label: "Jev request sent" },
  JevResponseReceived: { kind: "data", from: "jev", to: "decisionResponse", input: "network request", output: "decision response", movement: "move", label: "Jev response received" },
  FindingRetained: { kind: "data", from: "decisionResponse", to: "adviceStore", input: "decision response", output: "advice", movement: "move", label: "finding retained" },
  ClearRecorded: { kind: "data", from: "decisionResponse", to: "outcomeStore", input: "decision response", output: "review status", movement: "move", label: "clear result recorded" },
  JevUnavailable: { kind: "data", from: "jev", to: "outcomeStore", input: "network request", output: "review status", movement: "move", label: "Jev request unavailable" },
  BackgroundHookFired: { kind: "control", from: "agentEdit", to: "collector", label: "background asks to collect", signal: "background" },
  StopHookFired: { kind: "control", from: "agentEdit", to: "collector", label: "Stop asks to collect", signal: "stop" },
  AdviceLeasedByBackground: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy", label: "background leases advice" },
  AdviceLeasedByStop: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy", label: "Stop leases advice" },
  AdviceReofferedAtStop: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy", label: "Stop selects advice again (design)" },
  HostOutputSubmitted: { kind: "data", from: "collector", to: "hostOutput", input: "leased batch", output: "runtime submission", movement: "move", label: "hook write completed" },
} as const satisfies Record<EventId, Transition>;

export type Packet = { readonly id: number; readonly at: NodeId; readonly flavor: Flavor };
export const PacketSchema = Schema.Struct({
  id: Schema.Number,
  at: Schema.Literals(NODE_IDS),
  flavor: Schema.Literals(FLAVORS),
});
export const FlowStateSchema = Schema.Struct({
  packets: Schema.Array(PacketSchema),
  // Example history only: emitted responses and status updates are not resident payloads.
  emissions: Schema.Array(Schema.Struct({
    event: Schema.Literals(EVENT_IDS),
    at: Schema.Literals(NODE_IDS),
    description: Schema.String,
  })),
  nextPacketId: Schema.Number,
  roundId: Schema.Number,
  roundActive: Schema.Boolean,
  stopContinuations: Schema.Number,
  stopWaiting: Schema.Boolean,
  opportunity: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  leaseSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  lastSubmissionSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  lastEvent: Schema.Union([Schema.Null, Schema.Literals(EVENT_IDS)]),
  note: Schema.String,
});
export type FlowState = typeof FlowStateSchema.Type;

export const MAX_STOP_CONTINUATIONS = 4;

export const initialFlow = (): FlowState => ({
  packets: [],
  emissions: [],
  nextPacketId: 1,
  roundId: 0,
  roundActive: false,
  stopContinuations: 0,
  stopWaiting: false,
  opportunity: null,
  leaseSurface: null,
  lastSubmissionSurface: null,
  lastEvent: null,
  note: "No live round or review work yet. Events are example inputs; no agent runtime or Jev connection is attached.",
});

export type StepResult = { readonly state: FlowState; readonly accepted: boolean };
const rejected = (state: FlowState, reason: string): StepResult => ({
  accepted: false,
  state: { ...state, note: reason },
});

export const stepFlow = (state: FlowState, event: EventId): StepResult => {
  const transition = TRANSITIONS[event];
  if (event === "EditObserved") {
    if (state.packets.length > 0) return rejected(state, "This example follows one review item at a time. Finish or discard that item before introducing a fresh edit.");
    const current = state.roundActive ? state : {
      ...state, roundId: state.roundId + 1, roundActive: true, stopContinuations: 0,
    };
    return { accepted: true, state: {
      ...current,
      packets: [{ id: current.nextPacketId, at: "workQueue", flavor: "capture job" }],
      nextPacketId: current.nextPacketId + 1,
      lastSubmissionSurface: null,
      lastEvent: event,
      note: `${state.roundActive ? "The round remains active." : "An edit proven fresh by the adapter opened a Hapsland round."} The edit entered the review scheduler.`,
    } };
  }
  if (!state.roundActive) return rejected(state, "This round is closed. Only a proven fresh edit can open another round; late results and repeated Stop cannot.");
  if (event === "StopAllowed") {
    if (!state.stopWaiting) return rejected(state, "Stop has not requested a decision.");
    return { accepted: true, state: {
      ...state, roundActive: false, packets: [], stopWaiting: false, opportunity: null, leaseSurface: null,
      lastSubmissionSurface: null, lastEvent: event,
      note: "Hapsland allowed Stop and closed its round. All round-owned work, Jev requests, advice, reservations and delivery records were discarded or cancelled. Example history is display-only. Another plugin may continue the agent.",
    } };
  }
  if (event === "BackgroundHookFired" || event === "StopHookFired") {
    const opportunity = event === "StopHookFired" ? "stop" : "background";
    return { accepted: true, state: { ...state, opportunity, stopWaiting: state.stopWaiting || event === "StopHookFired", lastEvent: event,
      note: opportunity === "stop" ? "The agent is trying to finish. Hapsland waits for review work; the round has not ended." : "The runtime requested background advice for this agent.",
    } };
  }
  if (transition.kind !== "data") return rejected(state, "Unknown control transition.");
  if (event === "AdviceLeasedByBackground" && state.lastSubmissionSurface === "background") return rejected(state, "This example already submitted its background advice. It can be offered once more at Stop.");
  if (event === "AdviceLeasedByBackground" && state.opportunity !== "background") return rejected(state, "Background has not requested collection.");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && !state.stopWaiting) return rejected(state, "Stop has not requested collection.");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && state.stopContinuations >= MAX_STOP_CONTINUATIONS) return rejected(state, "This round already requested four Stop continuations. Hapsland must allow Stop and clean up.");
  if (event === "AdviceReofferedAtStop" && !(state.lastSubmissionSurface === "background")) {
    return rejected(state, "Reoffer needs a prior background response. Hapsland has no receipt from the agent runtime.");
  }
  if (event === "AdviceLeasedByStop" && state.lastSubmissionSurface === "background") {
    return rejected(state, "Use the Stop reoffer event for advice already sent in a background response.");
  }
  if (event === "AdviceLeasedByBackground" || event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") {
    if (state.leaseSurface !== null) return rejected(state, "Another collector already holds the advice lease.");
  }
  if (event === "HostOutputSubmitted" && state.leaseSurface === null) return rejected(state, "No delivery lease exists.");

  const index = state.packets.findIndex((packet) => packet.at === transition.from && packet.flavor === transition.input);
  if (index < 0) return rejected(state, `No ${transition.input} is at ${NODES[transition.from].label}.`);
  const nextPackets = [...state.packets];
  if (transition.movement === "move") nextPackets.splice(index, 1);
  const terminal = event === "HostOutputSubmitted" || event === "ClearRecorded" || event === "JevUnavailable";
  const emittedDescription = event === "HostOutputSubmitted" ? "Hook response written; no runtime receipt"
    : event === "ClearRecorded" ? "Review completed with no finding" : "Review failed because Jev was unavailable";
  const next: FlowState = {
    ...state,
    packets: terminal ? nextPackets : [...nextPackets, { id: state.nextPacketId, at: transition.to, flavor: transition.output }],
    emissions: terminal ? [...state.emissions, { event, at: transition.to, description: emittedDescription }] : state.emissions,
    nextPacketId: state.nextPacketId + (terminal ? 0 : 1),
    lastEvent: event,
    note: `${transition.label}: ${transition.input} → ${transition.output}.`,
  };
  if (event === "AdviceLeasedByBackground" || event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") {
    const surface = event === "AdviceLeasedByBackground" ? "background" : "stop";
    return { accepted: true, state: { ...next, leaseSurface: surface, opportunity: null,
      stopContinuations: state.stopContinuations + (surface === "stop" ? 1 : 0),
      note: `${transition.label}. The resident retains advice while one lease is active.`,
    } };
  }
  if (event === "HostOutputSubmitted") return { accepted: true, state: {
    ...next, packets: state.leaseSurface === "stop" ? next.packets.filter((packet) => packet.at !== "adviceStore") : next.packets,
    leaseSurface: null, lastSubmissionSurface: state.leaseSurface,
    stopWaiting: state.leaseSurface === "stop" ? false : state.stopWaiting,
    note: state.leaseSurface === "stop" ? "Hapsland wrote advice and asked the runtime to continue. The same round stays active; the request was counted before the write." : "Hapsland wrote background advice. There is no receipt that the agent saw it. Stop can reoffer it within this round.",
  } };
  return { accepted: true, state: next };
};

export const TRACES = [
  { name: "Send advice after a tool", description: "The after-tool hook asks for advice. Hapsland selects a finding and writes the hook response. The agent runtime controls further use.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "FindingRetained", "BackgroundHookFired",
    "AdviceLeasedByBackground", "HostOutputSubmitted",
  ] },
  { name: "Send advice again at Stop (design)", description: "Background holds a batch when Stop begins waiting. The background write completes during that wait; Stop offers the advice once more in the same round.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "FindingRetained", "BackgroundHookFired",
    "AdviceLeasedByBackground", "StopHookFired", "HostOutputSubmitted",
    "AdviceReofferedAtStop", "HostOutputSubmitted",
  ] },
  { name: "Stop waits for response", description: "Stop requests advice while Jev is running. This example supplies the result before any collection deadline; it does not simulate timeout behavior.", events: [
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
  { name: "Edit opens a round", description: "An identified agent can enter through an edit without a user-prompt hook. The runtime adapter handles root and subagent details.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "FindingRetained", "StopHookFired",
    "AdviceLeasedByStop", "HostOutputSubmitted", "StopHookFired", "StopAllowed",
  ] },
  { name: "Stop timeout cleans up", description: "Jev has not replied when Hapsland allows Stop. All live round data is removed, including the running request. A fresh edit can open another round.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "StopHookFired", "StopAllowed", "EditObserved",
  ] },
  { name: "Four continuation requests", description: "Each repair can be reviewed again. Four Stop responses request continuation in the same round; the next Stop must close it.", events: [
    ...Array.from({ length: MAX_STOP_CONTINUATIONS }, () => [
      "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
      "JevRequestSent", "JevResponseReceived", "FindingRetained", "StopHookFired",
      "AdviceLeasedByStop", "HostOutputSubmitted",
    ] as const).flat(), "StopHookFired", "StopAllowed",
  ] },
] as const satisfies ReadonlyArray<{ readonly name: string; readonly description: string; readonly events: ReadonlyArray<EventId> }>;
