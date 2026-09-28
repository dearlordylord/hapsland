import fixture from "../../../conformance/canonical-v1.json";
import {
  initialCanonical, projectCanonical, stepCanonical,
  type CanonicalCommand, type CanonicalEvent, type CanonicalProjection,
} from "../../../src/canonical/adapter";
export { initialCanonical, projectCanonical, stepCanonical } from "../../../src/canonical/adapter";

export type ReplayEvent = Readonly<{ event: CanonicalEvent; origin: "guided" | "manual" }>;
export type ReplayStep = Readonly<{
  event: CanonicalEvent;
  origin: ReplayEvent["origin"];
  commands: readonly CanonicalCommand[];
  before: CanonicalProjection;
  after: CanonicalProjection;
  rejection?: string;
}>;

export const CAPACITY_SCENARIO = {
  name: "Shared review capacity and partial unit admission",
  description: "Two advicees share one ledger. A preparation releases its space, then admits, refuses, and admits three units in order.",
  limits: fixture.limits,
  events: fixture.capacityTrace.events as CanonicalEvent[],
};
export const CANONICAL_SCENARIOS = [CAPACITY_SCENARIO, ...fixture.traces.map((trace) => ({
  name: trace.name,
  description: "Independent source-free canonical event sequence covering resident work and output decisions.",
  limits: fixture.limits,
  events: trace.events as CanonicalEvent[],
}))] as const;

/** Replay only through the checked adapter also used by the resident. */
export const replayCanonical = (
  history: readonly ReplayEvent[], position: number,
  limits: typeof CAPACITY_SCENARIO.limits = CAPACITY_SCENARIO.limits,
): { readonly state: unknown; readonly projection: CanonicalProjection; readonly steps: readonly ReplayStep[] } => {
  let state = initialCanonical(limits);
  const steps: ReplayStep[] = [];
  for (const entry of history.slice(0, position)) {
    const before = projectCanonical(state);
    const result = stepCanonical(state, entry.event);
    state = result.state;
    steps.push({ event: entry.event, origin: entry.origin, commands: result.commands,
      before, after: projectCanonical(state), ...(result.rejection === undefined ? {} : { rejection: result.rejection }) });
  }
  return { state, projection: projectCanonical(state), steps };
};

export const tryAppendCanonical = (
  history: readonly ReplayEvent[], position: number, event: unknown,
  origin: ReplayEvent["origin"],
): { readonly history: readonly ReplayEvent[]; readonly position: number; readonly error?: string; readonly rejection?: string } => {
  const prior = history.slice(0, position);
  try {
    const replay = replayCanonical(prior, prior.length);
    // The adapter validates shape, constructors, and the complete returned state.
    const result = stepCanonical(replay.state, event as CanonicalEvent);
    return { history: [...prior, { event: event as CanonicalEvent, origin }], position: prior.length + 1,
      ...(result.rejection === undefined ? {} : { rejection: result.rejection }) };
  } catch (cause) {
    return { history, position, error: cause instanceof Error ? cause.message : "invalid canonical event" };
  }
};

export const guidedIndex = (history: readonly ReplayEvent[], position: number): number =>
  history.slice(0, position).filter((entry) => entry.origin === "guided").length;

export const nextGuidedEvent = (history: readonly ReplayEvent[], position: number, scenario = 0): CanonicalEvent | undefined =>
  CANONICAL_SCENARIOS[scenario]?.events[guidedIndex(history, position)];
