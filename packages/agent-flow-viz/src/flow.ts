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
  agentEdit: { label: "Agent", detail: "session + optional child ID", role: "external", x: 30, y: 332 },
  workQueue: { label: "Review scheduler", detail: "waits for capacity to run work", role: "storage", x: 320, y: 52 },
  preparation: { label: "Read and analyze source", detail: "extract reviewable artifacts", role: "process", x: 610, y: 52 },
  decisionRequest: { label: "Build review input", detail: "artifact + rule + evidence", role: "process", x: 900, y: 52 },
  jev: { label: "Jev", detail: "evaluates the review input", role: "external", x: 1190, y: 52 },
  decisionResponse: { label: "Read Jev result", detail: "finding or no finding", role: "process", x: 1190, y: 332 },
  adviceStore: { label: "Pending advice", detail: "findings for this agent", role: "storage", x: 900, y: 332 },
  collector: { label: "Select advice to send", detail: "request + eligible pending advice", role: "process", x: 610, y: 332 },
  hostOutput: { label: "Write hook response", detail: "advice in the host response format", role: "boundary", x: 320, y: 575 },
  deliveryState: { label: "Agent delivery record", detail: "delivery chain + Stop allowance", role: "storage", x: 30, y: 575 },
  outcomeStore: { label: "Record review status", detail: "no finding / review failed", role: "process", x: 1190, y: 575 },
} as const satisfies Record<NodeId, NodeSpec>;

export const FLAVORS = [
  "edit observation", "capture job", "review work item", "decision request",
  "network request", "decision response", "advice", "leased batch",
  "host submission", "review status",
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
  hostOutput: "host submission";
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
  readonly signal: "prompt" | "background" | "stop";
};
export type Transition = DataTransition | ControlTransition;

export const EVENT_IDS = [
  "PromptSubmitted", "EditObserved", "IngressStarted", "ReviewUnitPrepared",
  "UnitDispatched", "JevRequestSent", "JevResponseReceived", "FindingRetained",
  "ClearRecorded", "JevUnavailable", "BackgroundHookFired", "StopHookFired",
  "AdviceLeasedByBackground", "AdviceLeasedByStop", "AdviceReofferedAtStop",
  "HostOutputSubmitted",
] as const;
export type EventId = (typeof EVENT_IDS)[number];

// Discussion reducer: transitions describe sample payload changes.
// The process diagram may group several event variants into one connection.
// `satisfies` checks both event coverage and each node's admissible data flavor.
export const TRANSITIONS = {
  PromptSubmitted: { kind: "control", from: "agentEdit", to: "deliveryState", label: "user prompt resets allowance", signal: "prompt" },
  EditObserved: { kind: "data", from: "agentEdit", to: "workQueue", input: "edit observation", output: "capture job", movement: "move", label: "edit admitted" },
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
  HostOutputSubmitted: { kind: "data", from: "collector", to: "hostOutput", input: "leased batch", output: "host submission", movement: "move", label: "hook write completed" },
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
  deliveryGeneration: Schema.Number,
  agentKind: Schema.Literals(["main", "child"]),
  stopUsed: Schema.Boolean,
  opportunity: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  leaseSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  lastSubmissionSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  lastEvent: Schema.Union([Schema.Null, Schema.Literals(EVENT_IDS)]),
  note: Schema.String,
});
export type FlowState = typeof FlowStateSchema.Type;

export const initialFlow = (agentKind: "main" | "child" = "main"): FlowState => ({
  agentKind,
  packets: [{ id: 1, at: "agentEdit", flavor: "edit observation" }],
  emissions: [],
  nextPacketId: 2,
  deliveryGeneration: 0,
  stopUsed: false,
  opportunity: null,
  leaseSurface: null,
  lastSubmissionSurface: null,
  lastEvent: null,
  note: "Scenario setup: one host edit is available as example input. No live host or Jev session is connected.",
});

export type StepResult = { readonly state: FlowState; readonly accepted: boolean };
const rejected = (state: FlowState, reason: string): StepResult => ({
  accepted: false,
  state: { ...state, note: reason },
});

export const stepFlow = (state: FlowState, event: EventId): StepResult => {
  const transition = TRANSITIONS[event];
  if (event === "PromptSubmitted" && state.agentKind === "child") return rejected(state, "This child example has no UserPromptSubmit hook. Its first advice request initializes the allowance.");
  if (event === "PromptSubmitted") return { accepted: true, state: {
    ...state, deliveryGeneration: state.deliveryGeneration + 1, stopUsed: false, opportunity: null,
    lastEvent: event, note: "A prompt started a new delivery chain and reset the Stop allowance.",
  } };
  if (event === "BackgroundHookFired" || event === "StopHookFired") {
    if (state.deliveryGeneration === 0 && state.agentKind === "main") return rejected(state, "A prompt must initialize this main agent’s delivery allowance first.");
    if (event === "StopHookFired" && state.stopUsed) return rejected(state, "Stop already used its one continuation in this delivery chain.");
    const opportunity = event === "StopHookFired" ? "stop" : "background";
    return { accepted: true, state: { ...state, deliveryGeneration: state.deliveryGeneration === 0 ? 1 : state.deliveryGeneration, opportunity, lastEvent: event,
      note: `${state.deliveryGeneration === 0 ? "First child request initialized its allowance. " : ""}${opportunity === "stop" ? (state.agentKind === "child" ? "SubagentStop" : "Stop") : "The after-tool hook"} requested advice for this agent.`,
    } };
  }
  if (transition.kind !== "data") return rejected(state, "Unknown control transition.");
  if (event === "EditObserved" && state.deliveryGeneration === 0 && state.agentKind === "main") return rejected(state, "A prompt must initialize this main agent’s delivery allowance first.");
  if (event === "AdviceLeasedByBackground" && state.opportunity !== "background") return rejected(state, "Background has not requested collection.");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && state.opportunity !== "stop") return rejected(state, "Stop has not requested collection.");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && state.stopUsed) return rejected(state, "Stop already used its continuation.");
  if (event === "AdviceReofferedAtStop" && !(state.lastSubmissionSurface === "background")) {
    return rejected(state, "Reoffer needs a prior background response. Hapsland has no receipt from the host.");
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
  const emittedDescription = event === "HostOutputSubmitted" ? "Hook response written; no host receipt"
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
      stopUsed: surface === "stop" ? true : next.stopUsed,
      note: `${transition.label}. The resident retains advice while one lease is active.`,
    } };
  }
  if (event === "HostOutputSubmitted") return { accepted: true, state: {
    ...next, leaseSurface: null, lastSubmissionSurface: state.leaseSurface,
    note: "Hapsland wrote a hook response. The host controls what happens next. Hapsland has no receipt that the advice reached the agent.",
  } };
  return { accepted: true, state: next };
};

export const TRACES = [
  { agentKind: "main", name: "Send advice after a tool", description: "The after-tool hook asks for advice. Hapsland selects a finding and writes the hook response. The host controls further use.", events: [
    "PromptSubmitted", "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "FindingRetained", "BackgroundHookFired",
    "AdviceLeasedByBackground", "HostOutputSubmitted",
  ] },
  { agentKind: "main", name: "Send advice again at Stop (design)", description: "Approved design: keep advice after an after-tool response so Stop can send it again. Current production code does not yet support this reoffer.", events: [
    "PromptSubmitted", "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "FindingRetained", "BackgroundHookFired",
    "AdviceLeasedByBackground", "HostOutputSubmitted", "StopHookFired",
    "AdviceReofferedAtStop", "HostOutputSubmitted",
  ] },
  { agentKind: "main", name: "Stop waits for response", description: "Stop requests advice while Jev is running. This example supplies the result before any collection deadline; it does not simulate timeout behavior.", events: [
    "PromptSubmitted", "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "StopHookFired", "JevResponseReceived", "FindingRetained",
    "AdviceLeasedByStop", "HostOutputSubmitted",
  ] },
  { agentKind: "main", name: "Clear result", description: "A Jev result with no finding updates the review status. There is no advice to send.", events: [
    "PromptSubmitted", "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "ClearRecorded",
  ] },
  { agentKind: "main", name: "Jev unavailable", description: "A failed Jev request records a failed review. It does not establish that the source has no finding.", events: [
    "PromptSubmitted", "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevUnavailable",
  ] },
  { agentKind: "child", name: "Child Stop without a user prompt", description: "One child agent edits. Its first SubagentStop request initializes its own allowance and collects advice. Repeated requests cannot reset that allowance; resumed-child reset is outside this example.", events: [
    "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "FindingRetained", "StopHookFired",
    "AdviceLeasedByStop", "HostOutputSubmitted",
  ] },
] as const satisfies ReadonlyArray<{ readonly agentKind: "main" | "child"; readonly name: string; readonly description: string; readonly events: ReadonlyArray<EventId> }>;
