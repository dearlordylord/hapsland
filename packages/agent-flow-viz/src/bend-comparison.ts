import { bendChanges, bendInitial, bendStep } from "../../agent-flow-bend/flow.generated.js";
import { EVENT_IDS, initialFlow, stepFlow, type EventId, type FlowChange, type FlowState, type Transition } from "./flow";
import { routeFor } from "./generation";
import { TRACES } from "./scenarios";

type Input = { readonly event: EventId | { readonly type: "SourceCapacitySet" | "ReviewCapacitySet"; readonly capacity: number };
  readonly itemId?: number };
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
const project = (state: Raw): FlowState => ({
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
const encode = (event: Input["event"]) => typeof event === "string"
  ? { $: event } : { $: event.type, capacity: event.capacity };
const inputLabel = (input: Input) => typeof input.event === "string" ? input.event : `${input.event.type}(${input.event.capacity})`;
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

// Discover the full displayed route table from accepted Bend changes, rather
// than borrowing the TypeScript reducer's route metadata for the second graph.
const bendRoutes = new Map<EventId, Transition>();
for (const trace of TRACES) {
  let state: Raw = bendInitial();
  for (const input of trace.events) {
    const event = encode(input);
    const item = { $: "None" as const };
    const result: Raw = bendStep(state, event, item);
    if (result.$ !== "Accepted") throw new Error(`Bend route trace rejected ${trace.name}: ${input}`);
    for (const entry of list(bendChanges(state, event, item, result)).map(change)) {
      if (entry.kind !== "transition") continue;
      const previous = bendRoutes.get(entry.event);
      if (previous !== undefined && !equal(previous, entry.route)) {
        throw new Error(`Conflicting Bend routes for ${entry.event}`);
      }
      bendRoutes.set(entry.event, entry.route);
    }
    state = result.state;
  }
}
for (const event of EVENT_IDS) {
  if (!bendRoutes.has(event)) throw new Error(`No Bend route for ${event}`);
}
export const bendRouteFor = (event: EventId): Transition => bendRoutes.get(event)!;
export const BEND_CONNECTIONS: readonly (readonly EventId[])[] = EVENT_IDS.reduce<EventId[][]>((groups, event) => {
  const candidate = bendRouteFor(event);
  const group = groups.find(([first]) => {
    const route = bendRouteFor(first);
    return route.kind === candidate.kind && route.from === candidate.from && route.to === candidate.to;
  });
  if (group) group.push(event);
  else groups.push([event]);
  return groups;
}, []);

export type Comparison = {
  readonly flow: FlowState;
  readonly changes: readonly FlowChange[];
  readonly emissions: readonly Extract<FlowChange, { kind: "emitted" }>[];
  readonly finishDecision: Extract<FlowChange, { kind: "finishDecision" }> | null;
  readonly differences: readonly string[];
  readonly compared: number;
};

export const compareHistory = (inputs: readonly Input[]): Comparison => {
  let bend: Raw = bendInitial();
  let sidecar = initialFlow();
  let changes: readonly FlowChange[] = [];
  let emissions: Extract<FlowChange, { kind: "emitted" }>[] = [];
  let finishDecision: Comparison["finishDecision"] = null;
  const differences: string[] = [];
  for (const event of EVENT_IDS) {
    if (!equal(bendRouteFor(event), routeFor(event))) differences.push(`Route ${event} differs`);
  }
  for (const key of Object.keys(sidecar) as (keyof FlowState)[]) {
    if (!equal(project(bend)[key], sidecar[key])) differences.push(`Initial state: ${key} differs`);
  }
  for (const [index, input] of inputs.entries()) {
    const event = encode(input.event);
    const item = input.itemId === undefined ? { $: "None" as const } : { $: "Some" as const, value: BigInt(input.itemId) };
    const bendResult: Raw = bendStep(bend, event, item);
    const sidecarResult = stepFlow(sidecar, input.event, input.itemId);
    const bendAccepted = bendResult.$ === "Accepted";
    if (bendAccepted !== sidecarResult.accepted) {
      differences.push(`Step ${index + 1} ${inputLabel(input)}: acceptance differs`);
    } else if (!bendAccepted && !sidecarResult.accepted) {
      const reason = bendResult.reason.$;
      if (`${reason[0].toLowerCase()}${reason.slice(1)}` !== sidecarResult.reason) {
        differences.push(`Step ${index + 1} ${inputLabel(input)}: rejection reason differs`);
      }
    }
    const bendChangesAtStep = list(bendChanges(bend, event, item, bendResult)).map(change);
    if (!equal(bendChangesAtStep, sidecarResult.changes)) {
      differences.push(`Step ${index + 1} ${inputLabel(input)}: ordered changes differ`);
    }
    bend = bendResult.state;
    sidecar = sidecarResult.state;
    changes = bendChangesAtStep;
    emissions = [...emissions, ...bendChangesAtStep.filter((entry): entry is Extract<FlowChange, { kind: "emitted" }> => entry.kind === "emitted")];
    finishDecision = bendChangesAtStep.find((entry): entry is Extract<FlowChange, { kind: "finishDecision" }> => entry.kind === "finishDecision") ?? finishDecision;
    const projected = project(bend);
    for (const key of Object.keys(projected) as (keyof FlowState)[]) {
      if (!equal(projected[key], sidecar[key])) {
        differences.push(`Step ${index + 1} ${inputLabel(input)}: ${key} differs`);
      }
    }
  }
  return { flow: project(bend), changes, emissions, finishDecision, differences, compared: inputs.length };
};
