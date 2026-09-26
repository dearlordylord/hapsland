import { Schema } from "effect";

export const NODE_IDS = [
  "agentEdit", "workSlot", "preparation", "decisionRequest", "jev",
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
export const WORK_SLOT_ITEMS = ["capture job", "review work item"] as const satisfies readonly Flavor[];
export type WorkSlotItem = (typeof WORK_SLOT_ITEMS)[number];

// These location contracts statically constrain the transition table below.
type StoredAt = {
  agentEdit: "edit observation";
  workSlot: WorkSlotItem;
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
    }
  }[NodeId]
}[NodeId];
type ControlTransition = {
  readonly kind: "control";
  readonly from: NodeId;
  readonly to: NodeId;
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
// bound to this virtual round. Native deduplication/callback fencing lives at the adapter.
// `satisfies` checks both event coverage and each node's admissible data flavor.
export const TRANSITIONS = {
  StopAllowed: { kind: "control", from: "collector", to: "deliveryState", signal: "allow" },
  EditObserved: { kind: "data", from: "agentEdit", to: "workSlot", input: "edit observation", output: "capture job", movement: "move" },
  IngressStarted: { kind: "data", from: "workSlot", to: "preparation", input: "capture job", output: "capture job", movement: "move" },
  ReviewUnitPrepared: { kind: "data", from: "preparation", to: "workSlot", input: "capture job", output: "review work item", movement: "move" },
  UnitDispatched: { kind: "data", from: "workSlot", to: "decisionRequest", input: "review work item", output: "decision request", movement: "move" },
  JevRequestSent: { kind: "data", from: "decisionRequest", to: "jev", input: "decision request", output: "network request", movement: "move" },
  JevResponseReceived: { kind: "data", from: "jev", to: "decisionResponse", input: "network request", output: "decision response", movement: "move" },
  FindingRetained: { kind: "data", from: "decisionResponse", to: "adviceStore", input: "decision response", output: "advice", movement: "move" },
  ClearRecorded: { kind: "data", from: "decisionResponse", to: "outcomeStore", input: "decision response", output: "review status", movement: "move" },
  JevUnavailable: { kind: "data", from: "jev", to: "outcomeStore", input: "network request", output: "review status", movement: "move" },
  BackgroundHookFired: { kind: "control", from: "agentEdit", to: "collector", signal: "background" },
  StopHookFired: { kind: "control", from: "agentEdit", to: "collector", signal: "stop" },
  AdviceLeasedByBackground: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy" },
  AdviceLeasedByStop: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy" },
  AdviceReofferedAtStop: { kind: "data", from: "adviceStore", to: "collector", input: "advice", output: "leased batch", movement: "copy" },
  HostOutputSubmitted: { kind: "data", from: "collector", to: "hostOutput", input: "leased batch", output: "runtime submission", movement: "move" },
} as const satisfies Record<EventId, Transition>;

export const LIVE_PACKET_NODES = ["preparation", "decisionRequest", "jev", "decisionResponse", "adviceStore", "collector"] as const satisfies readonly NodeId[];
export type LivePacketNode = (typeof LIVE_PACKET_NODES)[number];
export type Packet = { readonly at: LivePacketNode; readonly flavor: Flavor };
export const PacketSchema = Schema.Struct({
  at: Schema.Literals(LIVE_PACKET_NODES),
  flavor: Schema.Literals(FLAVORS),
});
export const FlowStateSchema = Schema.Struct({
  workSlot: Schema.Union([Schema.Null, Schema.Literals(WORK_SLOT_ITEMS)]),
  packets: Schema.Array(PacketSchema),
  virtualRoundId: Schema.Number,
  virtualRoundActive: Schema.Boolean,
  stopContinuations: Schema.Number,
  stopWaiting: Schema.Boolean,
  opportunity: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  leaseSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  lastSubmissionSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
});
export type FlowState = typeof FlowStateSchema.Type;

export const MAX_STOP_CONTINUATIONS = 4;

export const initialFlow = (): FlowState => ({
  workSlot: null,
  packets: [],
  virtualRoundId: 0,
  virtualRoundActive: false,
  stopContinuations: 0,
  stopWaiting: false,
  opportunity: null,
  leaseSurface: null,
  lastSubmissionSurface: null,
});

export type EmissionEvent = "HostOutputSubmitted" | "ClearRecorded" | "JevUnavailable";
export type FlowChange =
  | { readonly kind: "transition"; readonly event: EventId; readonly route: Transition }
  | { readonly kind: "virtualRoundOpened"; readonly id: number }
  | { readonly kind: "virtualRoundClosed"; readonly id: number; readonly discardedItems: number }
  | { readonly kind: "emitted"; readonly event: EmissionEvent; readonly at: NodeId };
export type RejectionCode =
  | "itemAlreadyActive" | "virtualRoundClosed" | "stopNotWaiting" | "unexpectedControl"
  | "backgroundAlreadySubmitted" | "backgroundNotRequested" | "stopNotRequested"
  | "continuationBudgetExhausted" | "reofferNeedsBackground" | "stopNeedsFreshAdvice"
  | "leaseBusy" | "noLease" | "missingPacket" | "workSlotOccupied";
export type StepResult =
  | { readonly state: FlowState; readonly accepted: true; readonly changes: readonly FlowChange[] }
  | { readonly state: FlowState; readonly accepted: false; readonly changes: readonly []; readonly reason: RejectionCode };
const rejected = (state: FlowState, reason: RejectionCode): StepResult => ({
  accepted: false,
  state,
  reason,
  changes: [],
});
const accepted = (before: FlowState, event: EventId, after: FlowState): StepResult => ({
  accepted: true,
  state: after,
  changes: [
    { kind: "transition", event, route: TRANSITIONS[event] },
    ...(!before.virtualRoundActive && after.virtualRoundActive ? [{ kind: "virtualRoundOpened" as const, id: after.virtualRoundId }] : []),
    ...(before.virtualRoundActive && !after.virtualRoundActive ? [{ kind: "virtualRoundClosed" as const, id: before.virtualRoundId,
      discardedItems: before.packets.length + (before.workSlot === null ? 0 : 1) }] : []),
    ...((event === "HostOutputSubmitted" || event === "ClearRecorded" || event === "JevUnavailable")
      ? [{ kind: "emitted" as const, event, at: TRANSITIONS[event].to }] : []),
  ],
});

const isLivePacketNode = (node: NodeId): node is LivePacketNode =>
  (LIVE_PACKET_NODES as readonly string[]).includes(node);
const isWorkSlotItem = (flavor: Flavor): flavor is WorkSlotItem =>
  (WORK_SLOT_ITEMS as readonly string[]).includes(flavor);

export const stepFlow = (state: FlowState, event: EventId): StepResult => {
  const transition = TRANSITIONS[event];
  if (event === "EditObserved") {
    if (state.workSlot !== null || state.packets.length > 0) return rejected(state, "itemAlreadyActive");
    const current = state.virtualRoundActive ? state : {
      ...state, virtualRoundId: state.virtualRoundId + 1, virtualRoundActive: true, stopContinuations: 0,
    };
    return accepted(state, event, {
      ...current,
      workSlot: "capture job",
      lastSubmissionSurface: null,
    });
  }
  if (!state.virtualRoundActive) return rejected(state, "virtualRoundClosed");
  if (event === "StopAllowed") {
    if (!state.stopWaiting) return rejected(state, "stopNotWaiting");
    return accepted(state, event, {
      ...state, virtualRoundActive: false, workSlot: null, packets: [], stopWaiting: false, opportunity: null, leaseSurface: null,
      lastSubmissionSurface: null,
    });
  }
  if (event === "BackgroundHookFired" || event === "StopHookFired") {
    const opportunity = event === "StopHookFired" ? "stop" : "background";
    return accepted(state, event, { ...state, opportunity, stopWaiting: state.stopWaiting || event === "StopHookFired" });
  }
  if (transition.kind !== "data") return rejected(state, "unexpectedControl");
  if (event === "AdviceLeasedByBackground" && state.lastSubmissionSurface === "background") return rejected(state, "backgroundAlreadySubmitted");
  if (event === "AdviceLeasedByBackground" && state.opportunity !== "background") return rejected(state, "backgroundNotRequested");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && !state.stopWaiting) return rejected(state, "stopNotRequested");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && state.stopContinuations >= MAX_STOP_CONTINUATIONS) return rejected(state, "continuationBudgetExhausted");
  if (event === "AdviceReofferedAtStop" && !(state.lastSubmissionSurface === "background")) {
    return rejected(state, "reofferNeedsBackground");
  }
  if (event === "AdviceLeasedByStop" && state.lastSubmissionSurface === "background") {
    return rejected(state, "stopNeedsFreshAdvice");
  }
  if (event === "AdviceLeasedByBackground" || event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") {
    if (state.leaseSurface !== null) return rejected(state, "leaseBusy");
  }
  if (event === "HostOutputSubmitted" && state.leaseSurface === null) return rejected(state, "noLease");

  const fromWorkSlot = transition.from === "workSlot";
  const index = fromWorkSlot ? -1 : state.packets.findIndex((packet) => packet.at === transition.from && packet.flavor === transition.input);
  if (fromWorkSlot ? state.workSlot !== transition.input : index < 0) return rejected(state, "missingPacket");
  const nextPackets = [...state.packets];
  if (transition.movement === "move" && !fromWorkSlot) nextPackets.splice(index, 1);
  const terminal = event === "HostOutputSubmitted" || event === "ClearRecorded" || event === "JevUnavailable";
  let nextWorkSlot: WorkSlotItem | null = fromWorkSlot && transition.movement === "move" ? null : state.workSlot;
  if (!terminal && transition.to === "workSlot") {
    if (nextWorkSlot !== null) return rejected(state, "workSlotOccupied");
    if (!isWorkSlotItem(transition.output)) {
      throw new Error("Invalid work-slot output in domain transition");
    }
    nextWorkSlot = transition.output;
  }
  if (!terminal && transition.to !== "workSlot" && !isLivePacketNode(transition.to)) {
    throw new Error("Nonterminal domain transition has no live data location");
  }
  const next: FlowState = {
    ...state,
    workSlot: nextWorkSlot,
    packets: terminal || transition.to === "workSlot" ? nextPackets
      : [...nextPackets, { at: transition.to as LivePacketNode, flavor: transition.output }],
  };
  if (event === "AdviceLeasedByBackground" || event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") {
    const surface = event === "AdviceLeasedByBackground" ? "background" : "stop";
    return accepted(state, event, { ...next, leaseSurface: surface, opportunity: null,
      stopContinuations: state.stopContinuations + (surface === "stop" ? 1 : 0),
    });
  }
  if (event === "HostOutputSubmitted") return accepted(state, event, {
    ...next, packets: state.leaseSurface === "stop" ? next.packets.filter((packet) => packet.at !== "adviceStore") : next.packets,
    leaseSurface: null, lastSubmissionSurface: state.leaseSurface,
    stopWaiting: state.leaseSurface === "stop" ? false : state.stopWaiting,
  });
  return accepted(state, event, next);
};
