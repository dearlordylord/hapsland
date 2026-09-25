import { Schema } from "effect";

export const NODE_IDS = [
  "agentEdit", "workQueue", "preparation", "decisionRequest", "jev",
  "decisionResponse", "adviceStore", "collector", "hostOutput", "agentModel",
  "hostHooks", "turnState", "outcomeStore",
] as const;
export type NodeId = (typeof NODE_IDS)[number];

export type NodeRole = "external" | "storage" | "process" | "boundary";
type NodeSpec = { readonly label: string; readonly detail: string; readonly role: NodeRole; readonly x: number; readonly y: number };
export const NODES = {
  agentEdit: { label: "Agent edit", detail: "attributed host event", role: "external", x: 30, y: 52 },
  workQueue: { label: "Review work queue", detail: "ingress + review units", role: "storage", x: 320, y: 52 },
  preparation: { label: "Preparation", detail: "capture + artifact analysis", role: "process", x: 610, y: 52 },
  decisionRequest: { label: "Decision request", detail: "prepared review input", role: "process", x: 900, y: 52 },
  jev: { label: "Jev", detail: "external network backend", role: "external", x: 1190, y: 52 },
  decisionResponse: { label: "Decision response", detail: "finding or clear result", role: "process", x: 1190, y: 332 },
  adviceStore: { label: "Pending advice store", detail: "recipient + freshness", role: "storage", x: 900, y: 332 },
  collector: { label: "Collect + lease", detail: "bounded handoff", role: "process", x: 610, y: 332 },
  hostOutput: { label: "Host output", detail: "write, visibility unknown", role: "boundary", x: 320, y: 332 },
  agentModel: { label: "Agent model", detail: "visibility only if observed", role: "external", x: 30, y: 332 },
  hostHooks: { label: "Host hooks", detail: "prompt, background, Stop", role: "external", x: 320, y: 575 },
  turnState: { label: "Turn state", detail: "one Stop continuation", role: "storage", x: 30, y: 575 },
  outcomeStore: { label: "Outcome record", detail: "clear or unavailable", role: "storage", x: 1190, y: 575 },
} as const satisfies Record<NodeId, NodeSpec>;

export const FLAVORS = [
  "edit observation", "ingress job", "review unit", "decision request",
  "network request", "decision response", "advice", "leased batch",
  "host submission", "model-visible advice", "terminal outcome",
] as const;
export type Flavor = (typeof FLAVORS)[number];

// These location contracts statically constrain the transition table below.
type StoredAt = {
  agentEdit: "edit observation";
  workQueue: "ingress job" | "review unit";
  preparation: "ingress job";
  decisionRequest: "decision request";
  jev: "network request";
  decisionResponse: "decision response";
  adviceStore: "advice";
  collector: "leased batch";
  hostOutput: "host submission";
  agentModel: "model-visible advice";
  hostHooks: never;
  turnState: never;
  outcomeStore: "terminal outcome";
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
  "HostOutputSubmitted", "ModelVisibilityObserved", "RepairEditObserved",
] as const;
export type EventId = (typeof EVENT_IDS)[number];

// One source of truth: the reducer executes these transitions; Foldkit renders them.
// `satisfies` checks both event coverage and each node's admissible data flavor.
export const TRANSITIONS = {
  PromptSubmitted: { kind: "control", from: "hostHooks", to: "turnState", label: "user prompt starts turn", signal: "prompt" },
  EditObserved: { kind: "data", from: "agentEdit", to: "workQueue", input: "edit observation", output: "ingress job", movement: "move", label: "edit admitted" },
  IngressStarted: { kind: "data", from: "workQueue", to: "preparation", input: "ingress job", output: "ingress job", movement: "move", label: "ingress dequeued" },
  ReviewUnitPrepared: { kind: "data", from: "preparation", to: "workQueue", input: "ingress job", output: "review unit", movement: "move", label: "unit prepared" },
  UnitDispatched: { kind: "data", from: "workQueue", to: "decisionRequest", input: "review unit", output: "decision request", movement: "move", label: "unit dispatched" },
  JevRequestSent: { kind: "data", from: "decisionRequest", to: "jev", input: "decision request", output: "network request", movement: "move", label: "Jev request sent" },
  JevResponseReceived: { kind: "data", from: "jev", to: "decisionResponse", input: "network request", output: "decision response", movement: "move", label: "Jev response received" },
  FindingRetained: { kind: "data", from: "decisionResponse", to: "adviceStore", input: "decision response", output: "advice", movement: "move", label: "finding retained" },
  ClearRecorded: { kind: "data", from: "decisionResponse", to: "outcomeStore", input: "decision response", output: "terminal outcome", movement: "move", label: "clear result recorded" },
  JevUnavailable: { kind: "data", from: "jev", to: "outcomeStore", input: "network request", output: "terminal outcome", movement: "move", label: "Jev request unavailable" },
  BackgroundHookFired: { kind: "control", from: "hostHooks", to: "collector", label: "background asks to collect", signal: "background" },
  StopHookFired: { kind: "control", from: "hostHooks", to: "collector", label: "Stop asks to collect", signal: "stop" },
  AdviceLeasedByBackground: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy", label: "background leases advice" },
  AdviceLeasedByStop: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy", label: "Stop leases advice" },
  AdviceReofferedAtStop: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy", label: "Stop reoffers unseen advice" },
  HostOutputSubmitted: { kind: "data", from: "collector", to: "hostOutput", input: "leased batch", output: "host submission", movement: "move", label: "hook write completed" },
  ModelVisibilityObserved: { kind: "data", from: "hostOutput", to: "agentModel", input: "host submission", output: "model-visible advice", movement: "move", label: "visibility independently observed" },
  RepairEditObserved: { kind: "data", from: "agentModel", to: "workQueue", input: "model-visible advice", output: "ingress job", movement: "move", label: "repair edit admitted" },
} as const satisfies Record<EventId, Transition>;

export type Packet = { readonly id: number; readonly at: NodeId; readonly flavor: Flavor };
export const PacketSchema = Schema.Struct({
  id: Schema.Number,
  at: Schema.Literals(NODE_IDS),
  flavor: Schema.Literals(FLAVORS),
});
export const FlowStateSchema = Schema.Struct({
  packets: Schema.Array(PacketSchema),
  nextPacketId: Schema.Number,
  turn: Schema.Number,
  stopUsed: Schema.Boolean,
  opportunity: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  leaseSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  lastSubmissionSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  visibility: Schema.Literals(["none", "unknown", "observed"]),
  lastEvent: Schema.Union([Schema.Null, Schema.Literals(EVENT_IDS)]),
  note: Schema.String,
});
export type FlowState = typeof FlowStateSchema.Type;

export const initialFlow = (): FlowState => ({
  packets: [{ id: 1, at: "agentEdit", flavor: "edit observation" }],
  nextPacketId: 2,
  turn: 0,
  stopUsed: false,
  opportunity: null,
  leaseSurface: null,
  lastSubmissionSurface: null,
  visibility: "none",
  lastEvent: null,
  note: "An agent edit is ready to be observed. Choose a trace or an event.",
});

export type StepResult = { readonly state: FlowState; readonly accepted: boolean };
const rejected = (state: FlowState, reason: string): StepResult => ({
  accepted: false,
  state: { ...state, note: reason },
});

export const stepFlow = (state: FlowState, event: EventId): StepResult => {
  const transition = TRANSITIONS[event];
  if (event === "PromptSubmitted") return { accepted: true, state: {
    ...state, turn: state.turn + 1, stopUsed: false, opportunity: null,
    lastEvent: event, note: "A prompt opened a new turn and reset the Stop allowance.",
  } };
  if (event === "BackgroundHookFired" || event === "StopHookFired") {
    if (state.turn === 0) return rejected(state, "A prompt must start the turn first.");
    if (event === "StopHookFired" && state.stopUsed) return rejected(state, "Stop already used its one continuation in this turn.");
    const opportunity = event === "StopHookFired" ? "stop" : "background";
    return { accepted: true, state: { ...state, opportunity, lastEvent: event,
      note: `${opportunity === "stop" ? "Stop" : "Background"} requested collection; review work did not move.`,
    } };
  }
  if (transition.kind !== "data") return rejected(state, "Unknown control transition.");
  if (event === "EditObserved" && state.turn === 0) return rejected(state, "A prompt must start the turn first.");
  if (event === "AdviceLeasedByBackground" && state.opportunity !== "background") return rejected(state, "Background has not requested collection.");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && state.opportunity !== "stop") return rejected(state, "Stop has not requested collection.");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && state.stopUsed) return rejected(state, "Stop already used its continuation.");
  if (event === "AdviceReofferedAtStop" && !(state.lastSubmissionSurface === "background" && state.visibility === "unknown")) {
    return rejected(state, "Reoffer needs a background submission whose model visibility is unknown.");
  }
  if (event === "AdviceLeasedByStop" && state.lastSubmissionSurface === "background" && state.visibility === "unknown") {
    return rejected(state, "Use the explicit Stop reoffer event for submitted, unseen advice.");
  }
  if (event === "AdviceLeasedByBackground" || event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") {
    if (state.leaseSurface !== null) return rejected(state, "Another collector already holds the advice lease.");
  }
  if (event === "HostOutputSubmitted" && state.leaseSurface === null) return rejected(state, "No delivery lease exists.");
  if (event === "ModelVisibilityObserved" && state.visibility !== "unknown") return rejected(state, "There is no visibility-unknown submission to observe.");

  const index = event === "ModelVisibilityObserved"
    ? state.packets.findLastIndex((packet) => packet.at === transition.from && packet.flavor === transition.input)
    : state.packets.findIndex((packet) => packet.at === transition.from && packet.flavor === transition.input);
  if (index < 0) return rejected(state, `No ${transition.input} is at ${NODES[transition.from].label}.`);
  const nextPackets = [...state.packets];
  if (transition.movement === "move") nextPackets.splice(index, 1);
  const next: FlowState = {
    ...state,
    packets: [...nextPackets, { id: state.nextPacketId, at: transition.to, flavor: transition.output }],
    nextPacketId: state.nextPacketId + 1,
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
    visibility: "unknown",
    note: "Hook output was submitted. The model may still never see it.",
  } };
  if (event === "ModelVisibilityObserved") return { accepted: true, state: {
    ...next, visibility: "observed",
    note: "An external observer established model visibility; this is not a Hapsland runtime signal.",
  } };
  return { accepted: true, state: next };
};

export const TRACES = [
  { name: "Background reaches model", description: "The review finding is submitted through background and independently observed by the model.", events: [
    "PromptSubmitted", "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "FindingRetained", "BackgroundHookFired",
    "AdviceLeasedByBackground", "HostOutputSubmitted", "ModelVisibilityObserved", "RepairEditObserved",
  ] },
  { name: "Stop reoffers unseen advice", description: "Background writes advice, but visibility remains unknown. Stop leases that retained advice and submits it again.", events: [
    "PromptSubmitted", "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "FindingRetained", "BackgroundHookFired",
    "AdviceLeasedByBackground", "HostOutputSubmitted", "StopHookFired",
    "AdviceReofferedAtStop", "HostOutputSubmitted", "ModelVisibilityObserved", "RepairEditObserved",
  ] },
  { name: "Stop waits for response", description: "Stop requests advice while Jev is in flight; the response then enters the same advice store.", events: [
    "PromptSubmitted", "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "StopHookFired", "JevResponseReceived", "FindingRetained",
    "AdviceLeasedByStop", "HostOutputSubmitted",
  ] },
  { name: "Clear result", description: "A clear Jev response becomes an outcome record, not pending advice.", events: [
    "PromptSubmitted", "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevResponseReceived", "ClearRecorded",
  ] },
  { name: "Jev unavailable", description: "An unavailable backend response is a distinct terminal outcome, not a clear review.", events: [
    "PromptSubmitted", "EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched",
    "JevRequestSent", "JevUnavailable",
  ] },
] as const satisfies ReadonlyArray<{ readonly name: string; readonly description: string; readonly events: ReadonlyArray<EventId> }>;
