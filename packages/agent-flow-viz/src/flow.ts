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
export const WORK_QUEUE_ITEMS = ["capture job", "review work item"] as const satisfies readonly Flavor[];
export type WorkQueueItem = (typeof WORK_QUEUE_ITEMS)[number];

// These location contracts statically constrain the transition table below.
type StoredAt = {
  agentEdit: "edit observation";
  workQueue: WorkQueueItem;
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
  EditObserved: { kind: "data", from: "agentEdit", to: "workQueue", input: "edit observation", output: "capture job", movement: "move" },
  IngressStarted: { kind: "data", from: "workQueue", to: "preparation", input: "capture job", output: "capture job", movement: "move" },
  ReviewUnitPrepared: { kind: "data", from: "preparation", to: "workQueue", input: "capture job", output: "review work item", movement: "move" },
  UnitDispatched: { kind: "data", from: "workQueue", to: "decisionRequest", input: "review work item", output: "decision request", movement: "move" },
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

export const LIVE_PACKET_NODES = ["workQueue", "preparation", "decisionRequest", "jev", "decisionResponse", "adviceStore", "collector"] as const satisfies readonly NodeId[];
export type LivePacketNode = (typeof LIVE_PACKET_NODES)[number];
export type Packet = { readonly id: number; readonly at: LivePacketNode; readonly flavor: Flavor };
export const PacketSchema = Schema.Struct({
  id: Schema.Number,
  at: Schema.Literals(LIVE_PACKET_NODES),
  flavor: Schema.Literals(FLAVORS),
});
export const FlowStateSchema = Schema.Struct({
  packets: Schema.Array(PacketSchema),
  nextItemId: Schema.Number,
  virtualRoundId: Schema.Number,
  virtualRoundActive: Schema.Boolean,
  stopContinuations: Schema.Number,
  stopWaiting: Schema.Boolean,
  opportunity: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  leaseSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  lastSubmissionSurface: Schema.Union([Schema.Null, Schema.Literals(["background", "stop"])]),
  lastSubmissionItemId: Schema.Union([Schema.Null, Schema.Number]),
  leasedItemId: Schema.Union([Schema.Null, Schema.Number]),
  backgroundSubmittedIds: Schema.Array(Schema.Number),
});
export type FlowState = typeof FlowStateSchema.Type;

export const MAX_STOP_CONTINUATIONS = 4;
export const MAX_ACTIVE_REVIEW_JOBS = 2;
export const ACTIVE_REVIEW_LOCATIONS = ["preparation", "decisionRequest", "jev", "decisionResponse"] as const satisfies readonly LivePacketNode[];
export const activeReviewJobCount = (state: FlowState): number =>
  state.packets.filter((packet) => (ACTIVE_REVIEW_LOCATIONS as readonly string[]).includes(packet.at)).length;

export const initialFlow = (): FlowState => ({
  packets: [],
  nextItemId: 1,
  virtualRoundId: 0,
  virtualRoundActive: false,
  stopContinuations: 0,
  stopWaiting: false,
  opportunity: null,
  leaseSurface: null,
  lastSubmissionSurface: null,
  lastSubmissionItemId: null,
  leasedItemId: null,
  backgroundSubmittedIds: [],
});

export type EmissionEvent = "HostOutputSubmitted" | "ClearRecorded" | "JevUnavailable";
export type FlowChange =
  | { readonly kind: "transition"; readonly event: EventId; readonly route: Transition; readonly itemId: number | null }
  | { readonly kind: "virtualRoundOpened"; readonly id: number }
  | { readonly kind: "virtualRoundClosed"; readonly id: number; readonly discardedItems: number }
  | { readonly kind: "emitted"; readonly event: EmissionEvent; readonly at: NodeId; readonly itemId: number };
export type RejectionCode =
  | "virtualRoundClosed" | "stopNotWaiting" | "unexpectedControl"
  | "backgroundAlreadySubmitted" | "backgroundNotRequested" | "stopNotRequested"
  | "continuationBudgetExhausted" | "reofferNeedsBackground" | "stopNeedsFreshAdvice"
  | "leaseBusy" | "noLease" | "missingPacket" | "dispatchCapacityReached" | "queueOrder";
export type StepResult =
  | { readonly state: FlowState; readonly accepted: true; readonly changes: readonly FlowChange[] }
  | { readonly state: FlowState; readonly accepted: false; readonly changes: readonly []; readonly reason: RejectionCode };
const rejected = (state: FlowState, reason: RejectionCode): StepResult => ({
  accepted: false,
  state,
  reason,
  changes: [],
});
const accepted = (before: FlowState, event: EventId, after: FlowState, itemId: number | null = null): StepResult => ({
  accepted: true,
  state: after,
  changes: [
    { kind: "transition", event, route: TRANSITIONS[event], itemId },
    ...(!before.virtualRoundActive && after.virtualRoundActive ? [{ kind: "virtualRoundOpened" as const, id: after.virtualRoundId }] : []),
    ...(before.virtualRoundActive && !after.virtualRoundActive ? [{ kind: "virtualRoundClosed" as const, id: before.virtualRoundId,
      discardedItems: new Set(before.packets.map((packet) => packet.id)).size }] : []),
    ...((event === "HostOutputSubmitted" || event === "ClearRecorded" || event === "JevUnavailable")
      ? [{ kind: "emitted" as const, event, at: TRANSITIONS[event].to, itemId: itemId! }] : []),
  ],
});

const isLivePacketNode = (node: NodeId): node is LivePacketNode =>
  (LIVE_PACKET_NODES as readonly string[]).includes(node);
export const stepFlow = (state: FlowState, event: EventId, itemId?: number): StepResult => {
  const transition = TRANSITIONS[event];
  if (event === "EditObserved") {
    const current = state.virtualRoundActive ? state : {
      ...state, virtualRoundId: state.virtualRoundId + 1, virtualRoundActive: true, stopContinuations: 0,
    };
    return accepted(state, event, {
      ...current,
      packets: [...current.packets, { id: current.nextItemId, at: "workQueue", flavor: "capture job" }],
      nextItemId: current.nextItemId + 1,
    }, current.nextItemId);
  }
  if (!state.virtualRoundActive) return rejected(state, "virtualRoundClosed");
  if (event === "StopAllowed") {
    if (!state.stopWaiting) return rejected(state, "stopNotWaiting");
    return accepted(state, event, {
      ...state, virtualRoundActive: false, packets: [], stopWaiting: false, opportunity: null, leaseSurface: null,
      lastSubmissionSurface: null, lastSubmissionItemId: null, leasedItemId: null, backgroundSubmittedIds: [],
    });
  }
  if (event === "BackgroundHookFired" || event === "StopHookFired") {
    const opportunity = event === "StopHookFired" ? "stop" : "background";
    return accepted(state, event, { ...state, opportunity, stopWaiting: state.stopWaiting || event === "StopHookFired" });
  }
  if (transition.kind !== "data") return rejected(state, "unexpectedControl");
  if (event === "AdviceLeasedByBackground" && state.opportunity !== "background") return rejected(state, "backgroundNotRequested");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && !state.stopWaiting) return rejected(state, "stopNotRequested");
  if ((event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") && state.stopContinuations >= MAX_STOP_CONTINUATIONS) return rejected(state, "continuationBudgetExhausted");
  if (event === "AdviceLeasedByBackground" || event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") {
    if (state.leaseSurface !== null) return rejected(state, "leaseBusy");
  }
  if (event === "HostOutputSubmitted" && state.leaseSurface === null) return rejected(state, "noLease");

  const selectedId = event === "HostOutputSubmitted" ? state.leasedItemId : itemId;
  const index = state.packets.findIndex((packet) => packet.at === transition.from && packet.flavor === transition.input && (selectedId === undefined || packet.id === selectedId));
  if (index < 0) return rejected(state, "missingPacket");
  const source = state.packets[index]!;
  if (event === "AdviceLeasedByBackground" && state.backgroundSubmittedIds.includes(source.id)) return rejected(state, "backgroundAlreadySubmitted");
  if (event === "AdviceLeasedByStop" && state.backgroundSubmittedIds.includes(source.id)) return rejected(state, "stopNeedsFreshAdvice");
  if (event === "AdviceReofferedAtStop" && !state.backgroundSubmittedIds.includes(source.id)) return rejected(state, "reofferNeedsBackground");
  if (transition.from === "workQueue") {
    const first = state.packets.find((packet) => packet.at === "workQueue");
    if (first?.id !== source.id) return rejected(state, "queueOrder");
  }
  if ((event === "IngressStarted" || event === "UnitDispatched") &&
    activeReviewJobCount(state) >= MAX_ACTIVE_REVIEW_JOBS) {
    return rejected(state, "dispatchCapacityReached");
  }
  const nextPackets = [...state.packets];
  if (transition.movement === "move") nextPackets.splice(index, 1);
  const terminal = event === "HostOutputSubmitted" || event === "ClearRecorded" || event === "JevUnavailable";
  if (!terminal && !isLivePacketNode(transition.to)) {
    throw new Error("Nonterminal domain transition has no live data location");
  }
  const next: FlowState = {
    ...state,
    packets: terminal ? nextPackets
      : [...nextPackets, { id: source.id, at: transition.to as LivePacketNode, flavor: transition.output }],
  };
  if (event === "AdviceLeasedByBackground" || event === "AdviceLeasedByStop" || event === "AdviceReofferedAtStop") {
    const surface = event === "AdviceLeasedByBackground" ? "background" : "stop";
    return accepted(state, event, { ...next, leaseSurface: surface, leasedItemId: source.id, opportunity: null,
      stopContinuations: state.stopContinuations + (surface === "stop" ? 1 : 0),
    }, source.id);
  }
  if (event === "HostOutputSubmitted") return accepted(state, event, {
    ...next, packets: state.leaseSurface === "stop" ? next.packets.filter((packet) => !(packet.at === "adviceStore" && packet.id === source.id)) : next.packets,
    leaseSurface: null, leasedItemId: null, lastSubmissionSurface: state.leaseSurface, lastSubmissionItemId: source.id,
    backgroundSubmittedIds: state.leaseSurface === "background" ? [...state.backgroundSubmittedIds, source.id] : state.backgroundSubmittedIds,
    stopWaiting: state.leaseSurface === "stop" ? false : state.stopWaiting,
  }, source.id);
  return accepted(state, event, next, source.id);
};
