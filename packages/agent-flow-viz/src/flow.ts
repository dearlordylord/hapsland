import { Schema } from "effect";

export const NODE_IDS = [
  "agentEdit", "workQueue", "preparation", "decisionRequest", "jev",
  "decisionResponse", "adviceStore", "collector", "hostOutput",
  "deliveryState", "outcomeStore",
] as const;
export type NodeId = (typeof NODE_IDS)[number];

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
  StopHookFired: { kind: "control", from: "agentEdit", to: "collector", label: "Stop hook starts; wait for advice", signal: "stop" },
  AdviceLeasedByBackground: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy", label: "background leases advice" },
  AdviceLeasedByStop: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy", label: "Stop leases advice" },
  AdviceReofferedAtStop: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy", label: "Stop selects advice again" },
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
  virtualRoundId: Schema.Number,
  virtualRoundActive: Schema.Boolean,
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
  virtualRoundId: 0,
  virtualRoundActive: false,
  stopContinuations: 0,
  stopWaiting: false,
  opportunity: null,
  leaseSurface: null,
  lastSubmissionSurface: null,
  lastEvent: null,
  note: "No live virtual round or review work yet. Events are example inputs; no agent runtime or Jev connection is attached.",
});

export type FlowChange =
  | { readonly kind: "transition"; readonly event: EventId; readonly route: Transition }
  | { readonly kind: "virtualRoundOpened"; readonly id: number }
  | { readonly kind: "virtualRoundClosed"; readonly id: number; readonly discardedPackets: number };
export type StepResult = { readonly state: FlowState; readonly accepted: boolean; readonly changes: readonly FlowChange[] };
const rejected = (state: FlowState, reason: string): StepResult => ({
  accepted: false,
  state: { ...state, note: reason },
  changes: [],
});
const accepted = (before: FlowState, event: EventId, after: FlowState): StepResult => ({
  accepted: true,
  state: after,
  changes: [
    { kind: "transition", event, route: TRANSITIONS[event] },
    ...(!before.virtualRoundActive && after.virtualRoundActive ? [{ kind: "virtualRoundOpened" as const, id: after.virtualRoundId }] : []),
    ...(before.virtualRoundActive && !after.virtualRoundActive ? [{ kind: "virtualRoundClosed" as const, id: before.virtualRoundId, discardedPackets: before.packets.length }] : []),
  ],
});

export const stepFlow = (state: FlowState, event: EventId): StepResult => {
  const transition = TRANSITIONS[event];
  if (event === "EditObserved") {
    if (state.packets.length > 0) return rejected(state, "This example follows one review item at a time. Finish or discard that item before introducing a fresh edit.");
    const current = state.virtualRoundActive ? state : {
      ...state, virtualRoundId: state.virtualRoundId + 1, virtualRoundActive: true, stopContinuations: 0,
    };
    return accepted(state, event, {
      ...current,
      packets: [{ id: current.nextPacketId, at: "workQueue", flavor: "capture job" }],
      nextPacketId: current.nextPacketId + 1,
      lastSubmissionSurface: null,
      lastEvent: event,
      note: `${state.virtualRoundActive ? "The virtual round remains active." : "An edit proven fresh by the adapter opened a virtual round."} The edit entered the review scheduler.`,
    });
  }
  if (!state.virtualRoundActive) return rejected(state, "This virtual round is closed. Only a proven fresh edit can open another virtual round; late results and repeated Stop cannot.");
  if (event === "StopAllowed") {
    if (!state.stopWaiting) return rejected(state, "Stop has not requested a decision.");
    return accepted(state, event, {
      ...state, virtualRoundActive: false, packets: [], stopWaiting: false, opportunity: null, leaseSurface: null,
      lastSubmissionSurface: null, lastEvent: event,
      note: "Hapsland allowed Stop and closed its virtual round. Its work, Jev requests, advice, reservations and delivery records were discarded or cancelled. Example history is display-only. Another plugin may continue the agent's actual round.",
    });
  }
  if (event === "BackgroundHookFired" || event === "StopHookFired") {
    const opportunity = event === "StopHookFired" ? "stop" : "background";
    return accepted(state, event, { ...state, opportunity, stopWaiting: state.stopWaiting || event === "StopHookFired", lastEvent: event,
      note: opportunity === "stop" ? "The agent is trying to finish. Hapsland waits for review work; its virtual round remains active." : "The runtime requested background advice for this agent.",
    });
  }
  if (transition.kind !== "data") return rejected(state, "Unknown control transition.");
  if (event === "AdviceLeasedByBackground" && state.lastSubmissionSurface === "background") return rejected(state, "This example already submitted its background advice. It can be offered once more at Stop.");
  if (event === "AdviceLeasedByBackground" && state.opportunity !== "background") return rejected(state, "Background has not requested collection.");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && !state.stopWaiting) return rejected(state, "Stop has not requested collection.");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && state.stopContinuations >= MAX_STOP_CONTINUATIONS) return rejected(state, "This virtual round already reserved four Stop continuation requests. Hapsland must allow Stop and clean up.");
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
  if (index < 0) return rejected(state, `No ${transition.input} is available at ${transition.from}.`);
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
    return accepted(state, event, { ...next, leaseSurface: surface, opportunity: null,
      stopContinuations: state.stopContinuations + (surface === "stop" ? 1 : 0),
      note: `${transition.label}. The resident retains advice while one lease is active.`,
    });
  }
  if (event === "HostOutputSubmitted") return accepted(state, event, {
    ...next, packets: state.leaseSurface === "stop" ? next.packets.filter((packet) => packet.at !== "adviceStore") : next.packets,
    leaseSurface: null, lastSubmissionSurface: state.leaseSurface,
    stopWaiting: state.leaseSurface === "stop" ? false : state.stopWaiting,
    note: state.leaseSurface === "stop" ? "Hapsland wrote advice and asked the runtime to continue. The same virtual round stays active; the request was counted before the write." : "Hapsland wrote advice through the background hook. There is no receipt that the agent saw it. Stop can reoffer it within this virtual round.",
  });
  return accepted(state, event, next);
};
