import {
  LIVE_PACKET_NODES, MAX_STOP_CONTINUATIONS, DEFAULT_SOURCE_CAPACITY, DEFAULT_REVIEW_CAPACITY,
  activeReviewJobCount, unfinishedReviewItemIds, isInternalEvent,
  type EventId, type FlowState, type FlowChange, type NodeId, type LivePacketNode, type Transition, type RejectionCode, type StepResult, type CapacityEvent,
} from "./view-contract";
export * from "./view-contract";

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
  JevFindingReceived: { kind: "data", from: "jev", to: "adviceStore", input: "network request", output: "advice", movement: "move" },
  JevClearReceived: { kind: "data", from: "jev", to: "outcomeStore", input: "network request", output: "review status", movement: "move" },
  JevUnavailable: { kind: "data", from: "jev", to: "outcomeStore", input: "network request", output: "review status", movement: "move" },
  BackgroundWaitStarted: { kind: "control", from: "agentEdit", to: "advicePolicy", signal: "background" },
  StopHookFired: { kind: "control", from: "agentEdit", to: "advicePolicy", signal: "stop" },
  FinishDecisionAllWorkSettled: { kind: "control", from: "deliveryState", to: "advicePolicy", signal: "settled" },
  FinishDecisionDeadlineReached: { kind: "control", from: "deliveryState", to: "advicePolicy", signal: "deadline" },
  FinishDecisionBudgetExhausted: { kind: "control", from: "deliveryState", to: "advicePolicy", signal: "allow" },
  FinishResponseRequested: { kind: "control", from: "advicePolicy", to: "responseCommand", signal: "response" },
  AdviceLeasedByBackground: { kind: "data", from: "adviceStore", to: "advicePolicy", input: "advice", output: "leased batch", movement: "copy" },
  AdviceLeasedByStop: { kind: "data", from: "adviceStore", to: "advicePolicy", input: "advice", output: "leased batch", movement: "copy" },
  AdviceReofferedAtStop: { kind: "data", from: "adviceStore", to: "advicePolicy", input: "advice", output: "leased batch", movement: "copy" },
  HostOutputSubmitted: { kind: "data", from: "advicePolicy", to: "observedWrite", input: "leased batch", output: "runtime submission", movement: "move" },
} as const satisfies Record<EventId, Transition>;

export const initialFlow = (): FlowState => ({
  packets: [],
  nextItemId: 1,
  sourceCapacity: DEFAULT_SOURCE_CAPACITY,
  reviewCapacity: DEFAULT_REVIEW_CAPACITY,
  virtualRoundId: 0,
  virtualRoundActive: false,
  stopContinuations: 0,
  stopWaiting: false,
  backgroundAvailable: false,
  leaseSurface: null,
  lastSubmissionSurface: null,
  lastSubmissionItemId: null,
  leasedItemId: null,
  backgroundSubmittedIds: [],
});

const rejected = (state: FlowState, reason: RejectionCode): StepResult => ({
  accepted: false,
  state,
  reason,
  changes: [],
});

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

const workStillPending = (state: FlowState): boolean => state.leaseSurface !== null || unfinishedReviewItemIds(state).length > 0;

// Every admitted item has one primary location until its review completes or a
// finish decision discards it. A delivery lease may hold one additional copy.
const primaryItemIds = (state: FlowState): readonly number[] =>
  state.packets.filter((packet) => packet.at !== "advicePolicy").map((packet) => packet.id);
const assertLiveState = (state: FlowState): void => {
  const primary = primaryItemIds(state);
  if (new Set(primary).size !== primary.length) throw new Error("Review item has multiple primary locations");
  const leased = state.packets.filter((packet) => packet.at === "advicePolicy");
  if (leased.length !== (state.leaseSurface === null ? 0 : 1) ||
    (leased.length === 1 && leased[0]!.id !== state.leasedItemId)) {
    throw new Error("Delivery lease and leased packet disagree");
  }
  if (!state.virtualRoundActive && (state.packets.length > 0 || state.backgroundAvailable || state.stopWaiting)) {
    throw new Error("Closed virtual round retains live work");
  }
};
const assertConservation = (before: FlowState, after: FlowState, event: EventId | "CapacitySet", itemId: number | null): void => {
  const expected = new Set(primaryItemIds(before));
  if (event === "EditObserved") expected.add(itemId!);
  if (event === "JevClearReceived" || event === "JevUnavailable" ||
    (event === "HostOutputSubmitted" && before.leaseSurface === "stop")) expected.delete(itemId!);
  if (event === "StopAllowed") expected.clear();
  const actual = new Set(primaryItemIds(after));
  if (expected.size !== actual.size || [...expected].some((id) => !actual.has(id))) {
    throw new Error(`Review item lost or duplicated during ${event}`);
  }
  assertLiveState(after);
};

const accepted = (before: FlowState, event: EventId, after: FlowState, itemId: number | null = null): StepResult => {
  const settled = settle(after);
  assertConservation(before, settled.state, event, itemId);
  const own: StepResult = { accepted: true,
  state: settled.state,
  changes: [
    { kind: "transition", event, route: TRANSITIONS[event], itemId },
    ...(!before.virtualRoundActive && after.virtualRoundActive ? [{ kind: "virtualRoundOpened" as const, id: after.virtualRoundId }] : []),
    ...(before.virtualRoundActive && !after.virtualRoundActive ? [{ kind: "virtualRoundClosed" as const, id: before.virtualRoundId,
      discardedItems: new Set(before.packets.map((packet) => packet.id)).size }] : []),
    ...((event === "HostOutputSubmitted" || event === "JevClearReceived" || event === "JevUnavailable")
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
export const stepFlow = (state: FlowState, event: EventId | CapacityEvent, itemId?: number): StepResult => {
  if (typeof event !== "string") {
    if (!Number.isSafeInteger(event.capacity) || event.capacity < 1) return rejected(state, "invalidCapacity");
    const source = event.type === "SourceCapacitySet";
    const updated = { ...state, [source ? "sourceCapacity" : "reviewCapacity"]: event.capacity };
    const settled = settle(updated);
    assertConservation(state, settled.state, "CapacitySet", null);
    return { accepted: true, state: settled.state,
      changes: [{ kind: "capacityChanged", capacity: source ? "source" : "jev",
        before: source ? state.sourceCapacity : state.reviewCapacity, after: event.capacity }, ...settled.changes] };
  }
  if (isInternalEvent(event) && event !== "FinishDecisionAllWorkSettled" && event !== "FinishDecisionBudgetExhausted") return rejected(state, "internalEvent");
  const transition = TRANSITIONS[event];
  if (event === "EditObserved") {
    const current = state.virtualRoundActive ? state : {
      ...state, virtualRoundId: state.virtualRoundId + 1, virtualRoundActive: true, stopContinuations: 0,
    };
    const admitted = accepted(state, event, {
      ...current,
      packets: [...current.packets, { id: current.nextItemId, at: "editQueue", flavor: "capture job" }],
      nextItemId: current.nextItemId + 1,
      backgroundAvailable: true,
    }, current.nextItemId);
    if (!admitted.accepted) return admitted;
    return { ...admitted, changes: [...admitted.changes,
      ...(!state.backgroundAvailable ? [{ kind: "transition" as const, event: "BackgroundWaitStarted" as const,
        route: TRANSITIONS.BackgroundWaitStarted, itemId: current.nextItemId }] : [])] };
  }
  if (!state.virtualRoundActive) return rejected(state, "virtualRoundClosed");
  if (event === "FinishDecisionDeadlineReached" || event === "FinishDecisionAllWorkSettled" || event === "FinishDecisionBudgetExhausted") {
    if (!state.stopWaiting) return rejected(state, "stopNotWaiting");
    if (event === "FinishDecisionAllWorkSettled" && workStillPending(state)) return rejected(state, "workStillPending");
    if (event === "FinishDecisionBudgetExhausted" && state.stopContinuations < MAX_STOP_CONTINUATIONS) return rejected(state, "unexpectedControl");
    const adviceItemIds = state.packets.filter((packet) => packet.at === "adviceStore").map((packet) => packet.id);
    const canContinue = adviceItemIds.length > 0 && state.stopContinuations < MAX_STOP_CONTINUATIONS;
    const cancelledSourceReadingIds = state.packets.filter((packet) => packet.at === "preparation").map((packet) => packet.id);
    const cancelledJevRequestIds = state.packets.filter((packet) => packet.at === "jev").map((packet) => packet.id);
    const discardedItemIds = [...new Set(state.packets.map((packet) => packet.id))].filter((id) =>
      !canContinue || !adviceItemIds.includes(id));
    const next: FlowState = { ...state, packets: [], virtualRoundActive: canContinue,
      stopContinuations: state.stopContinuations + (canContinue ? 1 : 0), stopWaiting: false,
      backgroundAvailable: false, leaseSurface: null, leasedItemId: null, backgroundSubmittedIds: [],
      lastSubmissionSurface: null, lastSubmissionItemId: null };
    assertLiveState(next);
    const changes: FlowChange[] = [
      { kind: "transition", event, route: TRANSITIONS[event], itemId: null },
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
      ...state, virtualRoundActive: false, packets: [], stopWaiting: false, backgroundAvailable: false, leaseSurface: null,
      lastSubmissionSurface: null, lastSubmissionItemId: null, leasedItemId: null, backgroundSubmittedIds: [],
    });
  }
  if (event === "StopHookFired") {
    if (state.stopWaiting) return rejected(state, "finishDecisionAlreadyOpen");
    if (state.stopContinuations >= MAX_STOP_CONTINUATIONS) {
      const decided = stepFlow({ ...state, stopWaiting: true }, "FinishDecisionBudgetExhausted");
      if (!decided.accepted) throw new Error(`Budget finish decision rejected: ${decided.reason}`);
      return { accepted: true, state: decided.state, changes: [
        { kind: "transition", event, route: TRANSITIONS[event], itemId: null }, ...decided.changes] };
    }
    return accepted(state, event, { ...state, stopWaiting: true });
  }
  if (transition.kind !== "data") return rejected(state, "unexpectedControl");
  if (event === "AdviceLeasedByBackground" && !state.backgroundAvailable) return rejected(state, "backgroundNotRequested");
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
  const terminal = event === "HostOutputSubmitted" || event === "JevClearReceived" || event === "JevUnavailable";
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
    return accepted(state, event, { ...next, leaseSurface: surface, leasedItemId: source.id,
      stopContinuations: state.stopContinuations + (surface === "stop" ? 1 : 0),
    }, source.id);
  }
  if (event === "HostOutputSubmitted") return accepted(state, event, {
    ...next, packets: state.leaseSurface === "stop" ? next.packets.filter((packet) => !(packet.at === "adviceStore" && packet.id === source.id)) : next.packets,
    leaseSurface: null, leasedItemId: null, lastSubmissionSurface: state.leaseSurface, lastSubmissionItemId: source.id,
    backgroundAvailable: state.leaseSurface === "background" ? false : state.backgroundAvailable,
    backgroundSubmittedIds: state.leaseSurface === "background" ? [...state.backgroundSubmittedIds, source.id] : state.backgroundSubmittedIds,
    stopWaiting: state.leaseSurface === "stop" ? false : state.stopWaiting,
  }, source.id);
  return accepted(state, event, next, source.id);
};
