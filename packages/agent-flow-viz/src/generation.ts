import { EVENT_IDS, initialFlow, stepFlow, type EventId, type FlowChange, type FlowState, type Transition } from "./flow";
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
    if (!result.accepted) throw new Error(`${title}: ${event}: ${result.state.note}`);
    state = result.state;
    return { event, state, changes: result.changes };
  });
};

export const PROJECTED_TRACES = TRACES.map((trace) => projectSequence(trace.events, trace.name));

const routes = new Map<EventId, Transition>();
for (const steps of PROJECTED_TRACES) {
  for (const step of steps) {
    const route = step.changes.find((change) => change.kind === "transition")?.route;
    if (route === undefined) throw new Error(`No domain route emitted for ${step.event}`);
    const previous = routes.get(step.event);
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(route)) {
      throw new Error(`Conflicting domain routes for ${step.event}`);
    }
    routes.set(step.event, route);
  }
}
for (const event of EVENT_IDS) {
  if (!routes.has(event)) throw new Error(`No accepted model scenario covers ${event}`);
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
