import { Schema } from "effect";

export const NODE_IDS = [
  "agentEdit", "editQueue", "preparation", "reviewQueue", "jevDispatch", "jev",
  "resultQueue", "adviceStore", "advicePolicy", "responseCommand", "observedWrite",
  "deliveryState", "outcomeStore",
] as const;
export type NodeId = (typeof NODE_IDS)[number];

export const FLAVORS = [
  "edit observation", "capture job", "review work item", "decision request",
  "network request", "finding result", "clear result", "unavailable result", "advice", "leased batch",
  "runtime submission", "review status",
] as const;
export type Flavor = (typeof FLAVORS)[number];
// These location contracts statically constrain the transition table below.
type StoredAt = {
  agentEdit: "edit observation";
  editQueue: "capture job";
  preparation: "capture job";
  reviewQueue: "review work item";
  jevDispatch: "decision request";
  jev: "network request";
  resultQueue: "finding result" | "clear result" | "unavailable result";
  adviceStore: "advice";
  advicePolicy: "leased batch";
  responseCommand: never;
  observedWrite: "runtime submission";
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
  readonly signal: "background" | "stop" | "settled" | "deadline" | "allow" | "response";
};
export type Transition = DataTransition | ControlTransition;

export const EVENT_IDS = [
  "EditObserved", "IngressStarted", "ReviewUnitPrepared",
  "UnitDispatched", "JevRequestSent", "JevFindingReceived", "JevClearReceived",
  "JevUnavailable", "FindingRetained", "ClearRecorded", "UnavailableRecorded",
  "BackgroundHookFired", "StopHookFired",
  "FinishDecisionAllWorkSettled", "FinishResponseRequested",
  "FinishDecisionDeadlineReached",
  "AdviceLeasedByBackground", "AdviceLeasedByStop", "AdviceReofferedAtStop",
  "HostOutputSubmitted", "StopAllowed",
] as const;
export type EventId = (typeof EVENT_IDS)[number];

// Discussion reducer: transitions describe sample payload changes.
// EditObserved means adapter-proven fresh input; all other inputs are already
// bound to this virtual round. Native deduplication/callback fencing lives at the adapter.
// `satisfies` checks both event coverage and each node's admissible data flavor.
export const TRANSITIONS = {
  StopAllowed: { kind: "control", from: "advicePolicy", to: "deliveryState", signal: "allow" },
  EditObserved: { kind: "data", from: "agentEdit", to: "editQueue", input: "edit observation", output: "capture job", movement: "move" },
  IngressStarted: { kind: "data", from: "editQueue", to: "preparation", input: "capture job", output: "capture job", movement: "move" },
  ReviewUnitPrepared: { kind: "data", from: "preparation", to: "reviewQueue", input: "capture job", output: "review work item", movement: "move" },
  UnitDispatched: { kind: "data", from: "reviewQueue", to: "jevDispatch", input: "review work item", output: "decision request", movement: "move" },
  JevRequestSent: { kind: "data", from: "jevDispatch", to: "jev", input: "decision request", output: "network request", movement: "move" },
  JevFindingReceived: { kind: "data", from: "jev", to: "resultQueue", input: "network request", output: "finding result", movement: "move" },
  JevClearReceived: { kind: "data", from: "jev", to: "resultQueue", input: "network request", output: "clear result", movement: "move" },
  JevUnavailable: { kind: "data", from: "jev", to: "resultQueue", input: "network request", output: "unavailable result", movement: "move" },
  FindingRetained: { kind: "data", from: "resultQueue", to: "adviceStore", input: "finding result", output: "advice", movement: "move" },
  ClearRecorded: { kind: "data", from: "resultQueue", to: "outcomeStore", input: "clear result", output: "review status", movement: "move" },
  UnavailableRecorded: { kind: "data", from: "resultQueue", to: "outcomeStore", input: "unavailable result", output: "review status", movement: "move" },
  BackgroundHookFired: { kind: "control", from: "agentEdit", to: "advicePolicy", signal: "background" },
  StopHookFired: { kind: "control", from: "agentEdit", to: "advicePolicy", signal: "stop" },
  FinishDecisionAllWorkSettled: { kind: "control", from: "deliveryState", to: "advicePolicy", signal: "settled" },
  FinishDecisionDeadlineReached: { kind: "control", from: "deliveryState", to: "advicePolicy", signal: "deadline" },
  FinishResponseRequested: { kind: "control", from: "advicePolicy", to: "responseCommand", signal: "response" },
  AdviceLeasedByBackground: { kind: "data", from: "adviceStore", to: "advicePolicy", input: "advice", output: "leased batch", movement: "copy" },
  AdviceLeasedByStop: { kind: "data", from: "adviceStore", to: "advicePolicy", input: "advice", output: "leased batch", movement: "copy" },
  AdviceReofferedAtStop: { kind: "data", from: "adviceStore", to: "advicePolicy", input: "advice", output: "leased batch", movement: "copy" },
  HostOutputSubmitted: { kind: "data", from: "advicePolicy", to: "observedWrite", input: "leased batch", output: "runtime submission", movement: "move" },
} as const satisfies Record<EventId, Transition>;

export const LIVE_PACKET_NODES = ["editQueue", "preparation", "reviewQueue", "jevDispatch", "jev", "resultQueue", "adviceStore", "advicePolicy"] as const satisfies readonly NodeId[];
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
  sourceCapacity: Schema.Number,
  reviewCapacity: Schema.Number,
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
export const DEFAULT_SOURCE_CAPACITY = 3;
export const DEFAULT_REVIEW_CAPACITY = 3;
export const activeSourceJobCount = (state: FlowState): number =>
  state.packets.filter((packet) => packet.at === "preparation").length;
export const ACTIVE_REVIEW_LOCATIONS = ["jevDispatch", "jev"] as const satisfies readonly LivePacketNode[];
export const activeReviewJobCount = (state: FlowState): number =>
  state.packets.filter((packet) => (ACTIVE_REVIEW_LOCATIONS as readonly string[]).includes(packet.at)).length;

export const advicePolicyInput = (state: FlowState) => ({
  openFinishDecision: state.stopWaiting,
  unfinishedWorkItemIds: state.packets.filter((packet) => packet.at === "editQueue" || packet.at === "preparation" ||
    packet.at === "reviewQueue" || packet.at === "jevDispatch" || packet.at === "jev").map((packet) => packet.id),
  ongoingJevRequestIds: state.packets.filter((packet) => packet.at === "jev").map((packet) => packet.id),
  queuedFindingResultIds: state.packets.filter((packet) => packet.at === "resultQueue" && packet.flavor === "finding result").map((packet) => packet.id),
  queuedClearResultIds: state.packets.filter((packet) => packet.at === "resultQueue" && packet.flavor === "clear result").map((packet) => packet.id),
  queuedUnavailableResultIds: state.packets.filter((packet) => packet.at === "resultQueue" && packet.flavor === "unavailable result").map((packet) => packet.id),
  pendingAdviceIds: state.packets.filter((packet) => packet.at === "adviceStore").map((packet) => packet.id),
});

export const initialFlow = (): FlowState => ({
  packets: [],
  nextItemId: 1,
  sourceCapacity: DEFAULT_SOURCE_CAPACITY,
  reviewCapacity: DEFAULT_REVIEW_CAPACITY,
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

export type EmissionEvent = "HostOutputSubmitted" | "ClearRecorded" | "UnavailableRecorded";
export type FlowChange =
  | { readonly kind: "transition"; readonly event: EventId; readonly route: Transition; readonly itemId: number | null }
  | { readonly kind: "capacityChanged"; readonly capacity: "source" | "jev"; readonly before: number; readonly after: number }
  | { readonly kind: "virtualRoundOpened"; readonly id: number }
  | { readonly kind: "virtualRoundClosed"; readonly id: number; readonly discardedItems: number }
  | { readonly kind: "finishDecision"; readonly response: "continueWithAdvice" | "allowFinish";
      readonly adviceItemIds: readonly number[]; readonly discardedItemIds: readonly number[];
      readonly cancelledSourceReadingIds: readonly number[]; readonly cancelledJevRequestIds: readonly number[] }
  | { readonly kind: "emitted"; readonly event: EmissionEvent; readonly at: NodeId; readonly itemId: number };
export type RejectionCode =
  | "virtualRoundClosed" | "stopNotWaiting" | "unexpectedControl"
  | "backgroundAlreadySubmitted" | "backgroundNotRequested" | "stopNotRequested"
  | "finishDecisionAlreadyOpen"
  | "continuationBudgetExhausted" | "reofferNeedsBackground" | "stopNeedsFreshAdvice"
  | "leaseBusy" | "noLease" | "missingPacket" | "dispatchCapacityReached" | "queueOrder" | "invalidCapacity" | "internalEvent" | "workStillPending";
export type StepResult =
  | { readonly state: FlowState; readonly accepted: true; readonly changes: readonly FlowChange[] }
  | { readonly state: FlowState; readonly accepted: false; readonly changes: readonly []; readonly reason: RejectionCode };
const rejected = (state: FlowState, reason: RejectionCode): StepResult => ({
  accepted: false,
  state,
  reason,
  changes: [],
});
export const INTERNAL_EVENTS = [
  "IngressStarted", "UnitDispatched", "JevRequestSent", "FinishDecisionAllWorkSettled",
  "AdviceLeasedByStop",
  "AdviceReofferedAtStop", "StopAllowed", "FinishResponseRequested",
] as const satisfies readonly EventId[];
export const isInternalEvent = (event: EventId): boolean =>
  (INTERNAL_EVENTS as readonly string[]).includes(event);

const settle = (state: FlowState): { readonly state: FlowState; readonly changes: readonly FlowChange[] } => {
  if (!state.virtualRoundActive) return { state, changes: [] };
  let packets = [...state.packets];
  const changes: FlowChange[] = [];
  while (packets.filter((packet) => packet.at === "preparation").length < state.sourceCapacity) {
    const next = packets.findIndex((packet) => packet.at === "editQueue");
    if (next < 0) break;
    const packet = packets[next]!;
    packets[next] = { id: packet.id, at: "preparation", flavor: "capture job" };
    changes.push({ kind: "transition", event: "IngressStarted", route: TRANSITIONS.IngressStarted, itemId: packet.id });
  }
  while (packets.filter((packet) => packet.at === "jev").length < state.reviewCapacity) {
    const next = packets.findIndex((packet) => packet.at === "reviewQueue");
    if (next < 0) break;
    const packet = packets[next]!;
    packets[next] = { id: packet.id, at: "jevDispatch", flavor: "decision request" };
    changes.push({ kind: "transition", event: "UnitDispatched", route: TRANSITIONS.UnitDispatched, itemId: packet.id });
    packets[next] = { id: packet.id, at: "jev", flavor: "network request" };
    changes.push({ kind: "transition", event: "JevRequestSent", route: TRANSITIONS.JevRequestSent, itemId: packet.id });
  }
  return { state: { ...state, packets }, changes };
};

const workStillPending = (state: FlowState): boolean => state.leaseSurface !== null || state.opportunity === "background" || state.packets.some((packet) =>
  packet.at === "editQueue" || packet.at === "preparation" || packet.at === "reviewQueue" ||
  packet.at === "jevDispatch" || packet.at === "jev");

const accepted = (before: FlowState, event: EventId, after: FlowState, itemId: number | null = null): StepResult => {
  const settled = settle(after);
  const own: StepResult = { accepted: true,
  state: settled.state,
  changes: [
    { kind: "transition", event, route: TRANSITIONS[event], itemId },
    ...(!before.virtualRoundActive && after.virtualRoundActive ? [{ kind: "virtualRoundOpened" as const, id: after.virtualRoundId }] : []),
    ...(before.virtualRoundActive && !after.virtualRoundActive ? [{ kind: "virtualRoundClosed" as const, id: before.virtualRoundId,
      discardedItems: new Set(before.packets.map((packet) => packet.id)).size }] : []),
    ...((event === "HostOutputSubmitted" || event === "ClearRecorded" || event === "UnavailableRecorded")
      ? [{ kind: "emitted" as const, event, at: TRANSITIONS[event].to, itemId: itemId! }] : []),
    ...settled.changes,
  ],
  };
  if (settled.state.stopWaiting && !workStillPending(settled.state)) {
    const finish = stepFlow(settled.state, "FinishDecisionAllWorkSettled");
    if (!finish.accepted) throw new Error(`Settled finish decision rejected: ${finish.reason}`);
    return { accepted: true, state: finish.state, changes: [...own.changes, ...finish.changes] };
  }
  return own;
};

const isLivePacketNode = (node: NodeId): node is LivePacketNode =>
  (LIVE_PACKET_NODES as readonly string[]).includes(node);
export type CapacityEvent = { readonly type: "ReviewCapacitySet" | "SourceCapacitySet"; readonly capacity: number };
export const stepFlow = (state: FlowState, event: EventId | CapacityEvent, itemId?: number): StepResult => {
  if (typeof event !== "string") {
    if (!Number.isSafeInteger(event.capacity) || event.capacity < 1) return rejected(state, "invalidCapacity");
    const source = event.type === "SourceCapacitySet";
    const updated = { ...state, [source ? "sourceCapacity" : "reviewCapacity"]: event.capacity };
    const settled = settle(updated);
    return { accepted: true, state: settled.state,
      changes: [{ kind: "capacityChanged", capacity: source ? "source" : "jev",
        before: source ? state.sourceCapacity : state.reviewCapacity, after: event.capacity }, ...settled.changes] };
  }
  if (isInternalEvent(event) && event !== "FinishDecisionAllWorkSettled") return rejected(state, "internalEvent");
  const transition = TRANSITIONS[event];
  if (event === "EditObserved") {
    const current = state.virtualRoundActive ? state : {
      ...state, virtualRoundId: state.virtualRoundId + 1, virtualRoundActive: true, stopContinuations: 0,
    };
    return accepted(state, event, {
      ...current,
      packets: [...current.packets, { id: current.nextItemId, at: "editQueue", flavor: "capture job" }],
      nextItemId: current.nextItemId + 1,
    }, current.nextItemId);
  }
  if (!state.virtualRoundActive) return rejected(state, "virtualRoundClosed");
  if (event === "FinishDecisionDeadlineReached" || event === "FinishDecisionAllWorkSettled") {
    if (!state.stopWaiting) return rejected(state, "stopNotWaiting");
    if (event === "FinishDecisionAllWorkSettled" && workStillPending(state)) return rejected(state, "workStillPending");
    const adviceItemIds = [...new Set(state.packets.filter((packet) =>
      packet.at === "adviceStore" || (packet.at === "resultQueue" && packet.flavor === "finding result"))
      .map((packet) => packet.id))];
    const canContinue = adviceItemIds.length > 0 && state.stopContinuations < MAX_STOP_CONTINUATIONS;
    const cancelledSourceReadingIds = state.packets.filter((packet) => packet.at === "preparation").map((packet) => packet.id);
    const cancelledJevRequestIds = state.packets.filter((packet) => packet.at === "jev").map((packet) => packet.id);
    const discardedItemIds = [...new Set(state.packets.map((packet) => packet.id))].filter((id) =>
      !canContinue || !adviceItemIds.includes(id));
    const next: FlowState = { ...state, packets: [], virtualRoundActive: canContinue,
      stopContinuations: state.stopContinuations + (canContinue ? 1 : 0), stopWaiting: false,
      opportunity: null, leaseSurface: null, leasedItemId: null, backgroundSubmittedIds: [],
      lastSubmissionSurface: null, lastSubmissionItemId: null };
    const changes: FlowChange[] = [
      { kind: "transition", event, route: TRANSITIONS[event], itemId: null },
      ...state.packets.filter((packet) => packet.at === "resultQueue" && packet.flavor === "finding result")
        .map((packet): FlowChange => ({ kind: "transition", event: "FindingRetained", route: TRANSITIONS.FindingRetained, itemId: packet.id })),
      ...state.packets.filter((packet) => packet.at === "resultQueue" && packet.flavor === "clear result")
        .flatMap((packet): FlowChange[] => [
          { kind: "transition", event: "ClearRecorded", route: TRANSITIONS.ClearRecorded, itemId: packet.id },
          { kind: "emitted", event: "ClearRecorded", at: "outcomeStore", itemId: packet.id },
        ]),
      ...state.packets.filter((packet) => packet.at === "resultQueue" && packet.flavor === "unavailable result")
        .flatMap((packet): FlowChange[] => [
          { kind: "transition", event: "UnavailableRecorded", route: TRANSITIONS.UnavailableRecorded, itemId: packet.id },
          { kind: "emitted", event: "UnavailableRecorded", at: "outcomeStore", itemId: packet.id },
        ]),
      ...(canContinue ? adviceItemIds.map((id): FlowChange => ({ kind: "transition",
        event: state.backgroundSubmittedIds.includes(id) ? "AdviceReofferedAtStop" : "AdviceLeasedByStop",
        route: state.backgroundSubmittedIds.includes(id) ? TRANSITIONS.AdviceReofferedAtStop : TRANSITIONS.AdviceLeasedByStop,
        itemId: id })) : []),
      ...(!canContinue ? [{ kind: "transition" as const, event: "StopAllowed" as const, route: TRANSITIONS.StopAllowed, itemId: null }] : []),
      { kind: "transition", event: "FinishResponseRequested", route: TRANSITIONS.FinishResponseRequested,
        itemId: canContinue ? adviceItemIds[0]! : null },
      { kind: "finishDecision", response: canContinue ? "continueWithAdvice" : "allowFinish",
        adviceItemIds: canContinue ? adviceItemIds : [], discardedItemIds,
        cancelledSourceReadingIds, cancelledJevRequestIds },
      ...(!canContinue ? [{ kind: "virtualRoundClosed" as const, id: state.virtualRoundId,
        discardedItems: new Set(state.packets.map((packet) => packet.id)).size }] : []),
    ];
    return { accepted: true, state: next, changes };
  }
  if (event === "StopAllowed") {
    if (!state.stopWaiting) return rejected(state, "stopNotWaiting");
    return accepted(state, event, {
      ...state, virtualRoundActive: false, packets: [], stopWaiting: false, opportunity: null, leaseSurface: null,
      lastSubmissionSurface: null, lastSubmissionItemId: null, leasedItemId: null, backgroundSubmittedIds: [],
    });
  }
  if (event === "BackgroundHookFired" || event === "StopHookFired") {
    if (event === "StopHookFired" && state.stopWaiting) return rejected(state, "finishDecisionAlreadyOpen");
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
  if (transition.from === "editQueue" || transition.from === "reviewQueue") {
    const first = state.packets.find((packet) => packet.at === transition.from);
    if (first?.id !== source.id) return rejected(state, "queueOrder");
  }
  if (event === "UnitDispatched" &&
    activeReviewJobCount(state) >= state.reviewCapacity) {
    return rejected(state, "dispatchCapacityReached");
  }
  const nextPackets = [...state.packets];
  if (transition.movement === "move") nextPackets.splice(index, 1);
  const terminal = event === "HostOutputSubmitted" || event === "ClearRecorded" || event === "UnavailableRecorded";
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
