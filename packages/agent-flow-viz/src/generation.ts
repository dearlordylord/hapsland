import { EVENT_IDS, isInternalEvent, type EventId, type FlowChange, type FlowState, type RejectionCode } from "./view-contract";
import { CONNECTIONS, flowInput, replaySequence, routeFor, stepBend } from "./bend-flow";
import { TRACES } from "./scenarios";

export type ProjectedStep = {
  readonly event: EventId;
  readonly state: FlowState;
  readonly changes: readonly FlowChange[];
};

// The scenario supplies only an event order. The reducer supplies every
// accepted route, state change, and round boundary used by the diagrams.
export const projectSequence = replaySequence;

export const PROJECTED_TRACES = TRACES.map((trace) => projectSequence(trace.events, trace.name));

export type EventOption =
  | { readonly event: EventId; readonly itemId: number | null; readonly available: true }
  | { readonly event: EventId; readonly itemId: number | null; readonly available: false; readonly reason: RejectionCode };

// Probe compiled Bend against the current state. The actual click steps Bend
// again against that state, so availability remains only a preview.
export const nextEventOptions = (bend: unknown, state: FlowState): readonly EventOption[] => EVENT_IDS.flatMap((event) => {
  if (isInternalEvent(event)) return [];
  const route = routeFor(event);
  const candidates = route.kind === "data" && event !== "EditObserved"
    ? state.packets.filter((packet) => packet.at === route.from && packet.flavor === route.input).map((packet) => packet.id)
    : [];
  const ids: readonly (number | null)[] = candidates.length > 0 ? [...new Set(candidates)] : [null];
  return ids.map((itemId) => {
    const result = stepBend(bend, flowInput(event, itemId ?? undefined));
    return result.accepted ? { event, itemId, available: true } : { event, itemId, available: false, reason: result.reason };
  });
});

// These aliases keep the chart and event controls on one Bend route table.
export { CONNECTIONS, routeFor };
