import { bendChanges, bendInitial, bendStep } from "../../agent-flow-bend/flow.generated.js";
import { EVENT_IDS, type EventId, type FlowChange, type FlowState, type RejectionCode, type Transition } from "./view-contract";
import { TRACES } from "./scenarios";

export type FlowInput =
  | { readonly kind: "flow"; readonly event: EventId; readonly itemId?: number }
  | { readonly kind: "capacity"; readonly capacityType: "source" | "jev"; readonly capacity: number };
type Raw = any; // Bend's generated algebraic data types are checked through the projection below.

const list = (value: Raw): Raw[] => {
  const result: Raw[] = [];
  for (let current = value; current.$ === "Con"; current = current.tail) result.push(current.head);
  return result;
};
const maybe = (value: Raw): Raw | null => value.$ === "None" ? null : value.value;
const surface = (value: Raw): "background" | "stop" | null =>
  value === null ? null : value.$ === "Background" ? "background" : "stop";
const capacity = (value: Raw): number => Number((value.high << 48n) + value.low);
const place: Record<string, { at: FlowState["packets"][number]["at"]; flavor: FlowState["packets"][number]["flavor"] }> = {
  EditQueue: { at: "editQueue", flavor: "capture job" },
  Preparation: { at: "preparation", flavor: "capture job" },
  ReviewQueue: { at: "reviewQueue", flavor: "review work item" },
  Jev: { at: "jev", flavor: "network request" },
  AdviceStore: { at: "adviceStore", flavor: "advice" },
  AdvicePolicy: { at: "advicePolicy", flavor: "leased batch" },
};
export const projectBend = (state: Raw): FlowState => ({
  packets: list(state.packets).map((packet) => ({ id: Number(packet.id), ...place[packet.at.$] })),
  nextItemId: Number(state.next_id),
  sourceCapacity: capacity(state.source_capacity),
  reviewCapacity: capacity(state.review_capacity),
  virtualRoundId: Number(state.round_id),
  virtualRoundActive: state.active,
  stopContinuations: Number(state.continuations),
  stopWaiting: state.waiting,
  backgroundAvailable: state.background_available,
  leaseSurface: surface(maybe(state.lease)),
  leasedItemId: maybe(state.leased_id) === null ? null : Number(maybe(state.leased_id)),
  lastSubmissionSurface: surface(maybe(state.last_surface)),
  lastSubmissionItemId: maybe(state.last_id) === null ? null : Number(maybe(state.last_id)),
  backgroundSubmittedIds: list(state.background_submitted).map(Number),
});
const nodes: Record<string, Transition["from"]> = {
  AgentEditNode: "agentEdit", EditQueueNode: "editQueue", PreparationNode: "preparation",
  ReviewQueueNode: "reviewQueue", JevDispatchNode: "jevDispatch", JevNode: "jev",
  AdviceStoreNode: "adviceStore", AdvicePolicyNode: "advicePolicy",
  ResponseCommandNode: "responseCommand", ObservedWriteNode: "observedWrite",
  DeliveryStateNode: "deliveryState", OutcomeStoreNode: "outcomeStore",
};
const flavors: Record<string, string> = {
  EditObservation: "edit observation", CaptureJob: "capture job", ReviewWorkItem: "review work item",
  DecisionRequest: "decision request", NetworkRequest: "network request", Advice: "advice",
  LeasedBatch: "leased batch", RuntimeSubmission: "runtime submission", ReviewStatus: "review status",
};
const signals: Record<string, "background" | "stop" | "settled" | "deadline" | "allow" | "response"> = {
  BackgroundSignal: "background", StopSignal: "stop", SettledSignal: "settled",
  DeadlineSignal: "deadline", AllowSignal: "allow", ResponseSignal: "response",
};
const route = (value: Raw): Transition => value.$ === "DataRoute"
  ? { kind: "data", from: nodes[value.from.$], to: nodes[value.to.$],
      input: flavors[value.input.$], output: flavors[value.output.$],
      movement: value.copy ? "copy" : "move" } as Transition
  : { kind: "control", from: nodes[value.from.$], to: nodes[value.to.$], signal: signals[value.signal.$] };
const change = (value: Raw): FlowChange => {
  switch (value.$) {
    case "Transition": return { kind: "transition", event: value.event.$, route: route(value.route),
      itemId: maybe(value.item) === null ? null : Number(maybe(value.item)) };
    case "CapacityChanged": return { kind: "capacityChanged", capacity: value.source ? "source" : "jev",
      before: capacity(value.before), after: capacity(value.after) };
    case "RoundOpened": return { kind: "virtualRoundOpened", id: Number(value.id) };
    case "RoundClosed": return { kind: "virtualRoundClosed", id: Number(value.id), discardedItems: Number(value.discarded) };
    case "Emitted": return { kind: "emitted", event: value.event.$, at: nodes[value.at.$], itemId: Number(value.item) };
    case "FinishDecision": {
      const decision = value.decision;
      return { kind: "finishDecision", response: decision.$ === "ContinueWithAdvice" ? "continueWithAdvice" : "allowFinish",
        adviceItemIds: decision.$ === "ContinueWithAdvice" ? list(decision.ids).map(Number) : [],
        discardedItemIds: list(decision.discarded).map(Number),
        cancelledSourceReadingIds: list(decision.cancelled_source).map(Number),
        cancelledJevRequestIds: list(decision.cancelled_jev).map(Number) };
    }
    default: throw new Error(`Unknown Bend change ${value.$}`);
  }
};
const encode = (input: FlowInput) => input.kind === "flow"
  ? { $: input.event }
  : { $: input.capacityType === "source" ? "SourceCapacitySet" : "ReviewCapacitySet", capacity: input.capacity };
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export const initialBend = (): Raw => bendInitial();
export const stepBend = (before: Raw, input: FlowInput) => {
  const encoded = encode(input);
  const item = input.kind === "flow" && input.itemId !== undefined
    ? { $: "Some" as const, value: BigInt(input.itemId) } : { $: "None" as const };
  const result: Raw = bendStep(before, encoded, item);
  const changes = list(bendChanges(before, encoded, item, result)).map(change);
  if (result.$ === "Rejected") {
    const name: string = result.reason.$;
    const reason = `${name[0].toLowerCase()}${name.slice(1)}` as RejectionCode;
    return { accepted: false as const, bend: result.state, state: projectBend(result.state),
      changes: [] as readonly [], reason };
  }
  if (result.$ !== "Accepted") throw new Error(`Unknown Bend step result ${result.$}`);
  return { accepted: true as const, bend: result.state, state: projectBend(result.state), changes };
};

// Replay editorial inputs through compiled Bend. Both the route table and
// guided/timeline projections use this one sequence.
export const replaySequence = (events: readonly EventId[], title: string) => {
  let bend: Raw = bendInitial();
  return events.map((event) => {
    const result = stepBend(bend, { kind: "flow", event });
    if (!result.accepted) throw new Error(`${title}: ${event}: ${result.reason}`);
    bend = result.bend;
    return { event, state: result.state, changes: result.changes };
  });
};

// Derive displayed routes from accepted generated Bend changes.
const bendRoutes = new Map<EventId, Transition>();
for (const trace of TRACES) {
  for (const step of replaySequence(trace.events, trace.name)) {
    for (const entry of step.changes) {
      if (entry.kind !== "transition") continue;
      const previous = bendRoutes.get(entry.event);
      if (previous !== undefined && !equal(previous, entry.route)) {
        throw new Error(`Conflicting Bend routes for ${entry.event}`);
      }
      bendRoutes.set(entry.event, entry.route);
    }
  }
}
for (const event of EVENT_IDS) {
  if (!bendRoutes.has(event)) throw new Error(`No Bend route for ${event}`);
}
export const routeFor = (event: EventId): Transition => bendRoutes.get(event)!;
export const CONNECTIONS: readonly (readonly EventId[])[] = EVENT_IDS.reduce<EventId[][]>((groups, event) => {
  const candidate = routeFor(event);
  const group = groups.find(([first]) => {
    const route = routeFor(first);
    return route.kind === candidate.kind && route.from === candidate.from && route.to === candidate.to;
  });
  if (group) group.push(event);
  else groups.push([event]);
  return groups;
}, []);
