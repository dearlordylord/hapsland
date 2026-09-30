import fixture from "../../../conformance/canonical-v1.json";
import requestFixture from "../../../conformance/canonical-jev-request-v1.json";
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

const showcaseScope = { partition: 1, lifetime: 1, round: 1 } as const;
const showcasePermitFacts = { clockValid: true, hookWindow: 2_500,
  adviceePermitLimit: 32, residentPermitLimit: 4_096 } as const;
const showcaseReady = { ...showcaseScope, rootValid: true, configurationValid: true,
  credentialReady: true, selected: true, currentWork: true, physicalAvailable: true } as const;
export const SHOWCASE_SCENARIO = {
  name: "Two edits through preparation, Jev findings, and Stop output",
  description: "Two accepted edits share one review round. Each has a pre-edit permit; the first opens the round when accepted. Both start preparation while slots are free, both reach Jev, findings become ready advice, and an acknowledged Stop response is finalized before the round releases its work and advice.",
  limits: fixture.limits,
  events: [
    { kind: "issuePermit", partition: 1, lifetime: 1, tool: 1,
      started: 1_000, deadline: 31_000, now: 1_100, minimumStarted: 0,
      facts: { ...showcasePermitFacts, startedUpper: 1_000, nowLower: 1_100 } },
    { kind: "consumePermit", partition: 1, lifetime: 1, token: 1, tool: 1, now: 1_200 },
    { kind: "admitObservation", ...showcaseScope },
    { kind: "queueDispatch", ...showcaseScope, operation: 1 },
    { kind: "issuePermit", partition: 1, lifetime: 1, tool: 2,
      started: 2_000, deadline: 32_000, now: 2_100, minimumStarted: 0,
      facts: { ...showcasePermitFacts, startedUpper: 2_000, nowLower: 2_100 } },
    { kind: "consumePermit", partition: 1, lifetime: 1, token: 2, tool: 2, now: 2_200 },
    { kind: "admitObservation", ...showcaseScope },
    { kind: "queueDispatch", ...showcaseScope, operation: 2 },
    { kind: "startObservation", ...showcaseScope, observation: 1 },
    { kind: "beginObservedPreparation", ...showcaseScope, observation: 1, bytes: 10 },
    { kind: "preparationCompleted", ...showcaseScope, operation: 3, unitBytes: [5] },
    { kind: "completeObservation", ...showcaseScope, observation: 1 },
    { kind: "dispatchSettled", ...showcaseScope, operation: 1 },
    { kind: "startObservation", ...showcaseScope, observation: 2 },
    { kind: "beginObservedPreparation", ...showcaseScope, observation: 2, bytes: 10 },
    { kind: "preparationCompleted", ...showcaseScope, operation: 5, unitBytes: [5] },
    { kind: "completeObservation", ...showcaseScope, observation: 2 },
    { kind: "dispatchSettled", ...showcaseScope, operation: 2 },
    { kind: "queueDispatch", ...showcaseScope, operation: 4 },
    { kind: "startReview", ...showcaseScope, operation: 4 },
    { kind: "jevRequestReady", ...showcaseReady, operation: 4 },
    { kind: "jevRequestStarted", ...showcaseScope, operation: 4, request: 7 },
    { kind: "queueDispatch", ...showcaseScope, operation: 6 },
    { kind: "startReview", ...showcaseScope, operation: 6 },
    { kind: "jevRequestReady", ...showcaseReady, operation: 6 },
    { kind: "jevRequestStarted", ...showcaseScope, operation: 6, request: 8 },
    { kind: "jevRequestSettled", ...showcaseScope, operation: 4, request: 7, outcome: "finding", currentWork: true },
    // Native storage is represented by a later supplied readiness fact, not
    // by the reducer's retainFinding command alone.
    { kind: "collectionReady", advice: 4,
      ...showcaseScope, observation: 1, joinedPending: false },
    { kind: "dispatchSettled", ...showcaseScope, operation: 4 },
    { kind: "jevRequestSettled", ...showcaseScope, operation: 6, request: 8, outcome: "finding", currentWork: true },
    { kind: "collectionReady", advice: 6,
      ...showcaseScope, observation: 2, joinedPending: false },
    { kind: "dispatchSettled", ...showcaseScope, operation: 6 },
    { kind: "stopPolled", ...showcaseScope, deadline: false },
    { kind: "collectionReserveLease", advice: 4, token: 8 },
    { kind: "collectionReserveLease", advice: 6, token: 8 },
    { kind: "finishReserve", group: 1, lifetime: 1, round: 1, attempt: 7, token: 8,
      selected: [4, 6], hasNotice: false, passNotices: true, canWrite: true,
      bindingValid: true, deadlineReached: true },
    { kind: "submissionBegin", advice: 4, group: 1, round: 1, token: 8, surface: "stop",
      authorizeNow: false, fingerprints: [10], units: [4] },
    { kind: "submissionBegin", advice: 6, group: 1, round: 1, token: 8, surface: "stop",
      authorizeNow: false, fingerprints: [11], units: [6] },
    { kind: "finishAuthorize", group: 1, round: 1, attempt: 7, token: 8, selected: [4, 6] },
    { kind: "submissionAuthorize", advice: 4, token: 8 },
    { kind: "submissionAuthorize", advice: 6, token: 8 },
    { kind: "deliveryAcknowledgeCheck", items: 2, anyExpired: false },
    { kind: "submissionTerminal", advice: 4, token: 8, certain: true },
    { kind: "submissionTerminal", advice: 6, token: 8, certain: true },
    { kind: "finishTerminal", group: 1, round: 1, attempt: 7, token: 8, selected: [4, 6], outcome: "acknowledged" },
    { kind: "deliveryFinalizeCheck", items: 2, allAcknowledged: true, anyExpired: false },
    { kind: "deliveryFindingDispositionCheck", composed: true, remaining: 0 },
    { kind: "collectionReleaseLease", advice: 4, token: 8 },
    { kind: "deliveryFindingDispositionCheck", composed: true, remaining: 0 },
    { kind: "collectionReleaseLease", advice: 6, token: 8 },
    { kind: "stopGroupEnded", group: 1, lifetime: 1, round: 1, scopes: [{ partition: 1, round: 1 }] },
    { kind: "finishEnd", group: 1, round: 1, attempt: 7, token: 8 },
    { kind: "retirePartition", ...showcaseScope },
    { kind: "collectionRetireAdvice", advice: 4 },
    { kind: "submissionForget", advice: 4 },
    { kind: "collectionRetireAdvice", advice: 6 },
    { kind: "submissionForget", advice: 6 },
  ] as CanonicalEvent[],
};

export const CAPACITY_SCENARIO = {
  name: "Shared review capacity and partial unit admission",
  description: "Two advicees share one ledger. A preparation releases its space, then admits, refuses, and admits three units in order.",
  limits: fixture.limits,
  events: fixture.capacityTrace.events as CanonicalEvent[],
};
export const ALTERNATE_LEDGER_LIMITS_SCENARIO = {
  name: "Alternate checked ledger limits",
  description: "The source-free replay starts Bend with a second valid ledger limit set, then reserves one review unit.",
  limits: { globalItems: 4, globalBytes: 160, partitionItems: 3, partitionBytes: 80 },
  events: [
    { kind: "openRound", partition: 1, lifetime: 1 },
    { kind: "reserveCapacity", partition: 1, bytes: 20, purpose: "reviewUnit" },
  ] as CanonicalEvent[],
};
export const CANONICAL_SCENARIOS = [SHOWCASE_SCENARIO, CAPACITY_SCENARIO, ...fixture.traces.map((trace) => ({
  name: trace.name,
  description: "Independent source-free event sequence covering resident work and output decisions.",
  limits: fixture.limits,
  events: trace.events as CanonicalEvent[],
})), ...requestFixture.traces.map((trace) => ({
  name: trace.name,
  description: "Independent #148 Jev request contract trace. Start, response, failure and physical availability are supplied source-free facts.",
  limits: requestFixture.limits,
  events: trace.events.map(({ expect: _expect, ...raw }) => {
    const { issuedRequest: _issuedRequest, requestAfter: _requestAfter, requestCount: _requestCount, ...event } =
      raw as typeof raw & { issuedRequest?: unknown; requestAfter?: unknown; requestCount?: unknown };
    return event as CanonicalEvent;
  }),
})), ALTERNATE_LEDGER_LIMITS_SCENARIO] as const;

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
  origin: ReplayEvent["origin"], limits: typeof CAPACITY_SCENARIO.limits = CAPACITY_SCENARIO.limits,
): { readonly history: readonly ReplayEvent[]; readonly position: number; readonly error?: string; readonly rejection?: string } => {
  const prior = history.slice(0, position);
  try {
    const replay = replayCanonical(prior, prior.length, limits);
    // The adapter validates shape, constructors, and the complete returned state.
    const result = stepCanonical(replay.state, event as CanonicalEvent);
    return { history: [...prior, { event: event as CanonicalEvent, origin }], position: prior.length + 1,
      ...(result.rejection === undefined ? {} : { rejection: result.rejection }) };
  } catch (cause) {
    return { history, position, error: cause instanceof Error ? cause.message : "invalid event" };
  }
};

export const guidedIndex = (history: readonly ReplayEvent[], position: number): number =>
  history.slice(0, position).filter((entry) => entry.origin === "guided").length;

export const nextGuidedEvent = (history: readonly ReplayEvent[], position: number, scenario = 0): CanonicalEvent | undefined =>
  CANONICAL_SCENARIOS[scenario]?.events[guidedIndex(history, position)];
