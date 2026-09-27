import { EVENT_IDS, NODE_IDS, initialFlow, isInternalEvent, stepFlow, type EventId, type FlowChange, type FlowState, type RejectionCode, type Transition } from "./flow";
import { TRACES } from "./scenarios";

export type ProjectedStep = {
  readonly event: EventId;
  readonly state: FlowState;
  readonly changes: readonly FlowChange[];
};

// The scenario supplies only an event order. The reducer supplies every
// accepted route, state change, and round boundary used by the diagrams.
export const projectSequence = (events: readonly EventId[], title: string): readonly ProjectedStep[] => {
  let state = initialFlow();
  return events.map((event) => {
    const result = stepFlow(state, event);
    if (!result.accepted) throw new Error(`${title}: ${event}: ${result.reason}`);
    state = result.state;
    return { event, state, changes: result.changes };
  });
};

export const PROJECTED_TRACES = TRACES.map((trace) => projectSequence(trace.events, trace.name));

export type EventOption =
  | { readonly event: EventId; readonly itemId: number | null; readonly available: true }
  | { readonly event: EventId; readonly itemId: number | null; readonly available: false; readonly reason: RejectionCode };

// Probe the pure reducer. This creates no new domain state and cannot change the
// current flow; the actual click runs stepFlow again against the latest state.
export const nextEventOptions = (state: FlowState): readonly EventOption[] => EVENT_IDS.flatMap((event) => {
  if (isInternalEvent(event)) return [];
  const route = routeFor(event);
  const candidates = route.kind === "data" && event !== "EditObserved"
    ? state.packets.filter((packet) => packet.at === route.from && packet.flavor === route.input).map((packet) => packet.id)
    : [];
  const ids: readonly (number | null)[] = candidates.length > 0 ? [...new Set(candidates)] : [null];
  return ids.map((itemId) => {
    const result = stepFlow(state, event, itemId ?? undefined);
    return result.accepted ? { event, itemId, available: true } : { event, itemId, available: false, reason: result.reason };
  });
});

const routes = new Map<EventId, Transition>();
for (const steps of PROJECTED_TRACES) {
  for (const step of steps) {
    for (const change of step.changes) {
      if (change.kind !== "transition") continue;
      const previous = routes.get(change.event);
      if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(change.route)) {
        throw new Error(`Conflicting domain routes for ${change.event}`);
      }
      routes.set(change.event, change.route);
    }
  }
}
for (const event of EVENT_IDS) {
  if (!routes.has(event)) throw new Error(`No accepted model scenario covers ${event}`);
}
const usedNodes = new Set([...routes.values()].flatMap((route) => [route.from, route.to]));
for (const node of NODE_IDS) {
  if (!usedNodes.has(node)) throw new Error(`No accepted model route uses diagram node ${node}`);
}

export const routeFor = (event: EventId): Transition => {
  const route = routes.get(event);
  if (route === undefined) throw new Error(`No generated route for ${event}`);
  return route;
};

// Event variants that move between the same places share one drawn connection.
// Its membership is derived from accepted reducer changes, never a view table.
export const CONNECTIONS: readonly (readonly EventId[])[] = EVENT_IDS.reduce<EventId[][]>((groups, event) => {
  const route = routeFor(event);
  const group = groups.find(([first]) => {
    const candidate = routeFor(first);
    return candidate.from === route.from && candidate.to === route.to && candidate.kind === route.kind;
  });
  if (group) group.push(event);
  else groups.push([event]);
  return groups;
}, []);
