import {
  PreparationReplay,
  preparationExample,
  type PreparationEvent,
  type PreparationFrame
} from "../../monkey-business/src/preparation"
import fixture from "../../../conformance/canonical-v1.json"
import requestFixture from "../../../conformance/canonical-jev-request-v1.json"
import {
  initialCanonical,
  projectCanonical,
  stepCanonical,
  type CanonicalOutput,
  type CanonicalEvent,
  type CanonicalProjection
} from "@hapsland/canonical-policy/canonical/adapter"
export { initialCanonical, projectCanonical, stepCanonical } from "@hapsland/canonical-policy/canonical/adapter"

export type ReplayEvent = Readonly<{ event: CanonicalEvent | PreparationEvent; origin: "guided" | "manual" }>
export type ReplayStep = Readonly<{
  event: CanonicalEvent | PreparationEvent
  origin: ReplayEvent["origin"]
  outputs: readonly CanonicalOutput[]
  before: CanonicalProjection
  after: CanonicalProjection
  rejection?: string
  preparation?: PreparationFrame
}>

const showcaseScope = { partition: 1, lifetime: 1, round: 1 } as const
const showcasePermitFacts = {
  clockValid: true,
  hookWindow: 2_500,
  adviceePermitLimit: 32,
  residentPermitLimit: 4_096
} as const
const showcaseReady = {
  ...showcaseScope,
  rootValid: true,
  configurationValid: true,
  credentialReady: true,
  selected: true,
  currentWork: true,
  physicalAvailable: true
} as const
export const SHOWCASE_SCENARIO = {
  name: "Two edits through findings, a clear result, and Stop output",
  description:
    "Two accepted edits share one review round. Each has a pre-edit permit; the first opens the round when accepted. Both start preparation while slots are free. Three review items reach Jev: two yield findings and one clears without advice. An acknowledged Stop response then delivers the findings before the round releases its work and advice.",
  limits: { ...fixture.limits, partitionItems: 3 },
  events: [
    {
      kind: "issuePermit",
      partition: 1,
      lifetime: 1,
      tool: 1,
      started: 1_000,
      deadline: 31_000,
      now: 1_100,
      minimumStarted: 0,
      facts: { ...showcasePermitFacts, startedUpper: 1_000, nowLower: 1_100 }
    },
    { kind: "consumePermit", partition: 1, lifetime: 1, token: 1, tool: 1, now: 1_200 },
    { kind: "admitObservation", ...showcaseScope },
    { kind: "queueDispatch", ...showcaseScope, operation: 1 },
    {
      kind: "issuePermit",
      partition: 1,
      lifetime: 1,
      tool: 2,
      started: 2_000,
      deadline: 32_000,
      now: 2_100,
      minimumStarted: 0,
      facts: { ...showcasePermitFacts, startedUpper: 2_000, nowLower: 2_100 }
    },
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
    { kind: "preparationCompleted", ...showcaseScope, operation: 5, unitBytes: [5, 5] },
    { kind: "completeObservation", ...showcaseScope, observation: 2 },
    { kind: "dispatchSettled", ...showcaseScope, operation: 2 },
    { kind: "queueDispatch", ...showcaseScope, operation: 4 },
    { kind: "startReview", ...showcaseScope, operation: 4 },
    { kind: "jevRequestReady", ...showcaseReady, operation: 4 },
    { kind: "jevRequestStarted", ...showcaseScope, operation: 4, request: 8 },
    { kind: "queueDispatch", ...showcaseScope, operation: 6 },
    { kind: "startReview", ...showcaseScope, operation: 6 },
    { kind: "jevRequestReady", ...showcaseReady, operation: 6 },
    { kind: "jevRequestStarted", ...showcaseScope, operation: 6, request: 9 },
    { kind: "jevRequestSettled", ...showcaseScope, operation: 4, request: 8, outcome: "finding", currentWork: true },
    // Readiness is a later Bend decision linked to the retained finding and its edit.
    { kind: "collectionReady", advice: 4, ...showcaseScope, observation: 1, joinedPending: false },
    { kind: "dispatchSettled", ...showcaseScope, operation: 4 },
    { kind: "jevRequestSettled", ...showcaseScope, operation: 6, request: 9, outcome: "finding", currentWork: true },
    { kind: "dispatchSettled", ...showcaseScope, operation: 6 },
    { kind: "queueDispatch", ...showcaseScope, operation: 7 },
    { kind: "startReview", ...showcaseScope, operation: 7 },
    { kind: "jevRequestReady", ...showcaseReady, operation: 7 },
    { kind: "jevRequestStarted", ...showcaseScope, operation: 7, request: 10 },
    { kind: "jevRequestSettled", ...showcaseScope, operation: 7, request: 10, outcome: "clear", currentWork: true },
    { kind: "dispatchSettled", ...showcaseScope, operation: 7 },
    { kind: "collectionReady", advice: 6, ...showcaseScope, observation: 2, joinedPending: false },
    { kind: "stopPolled", ...showcaseScope, deadline: false },
    { kind: "collectionReserveLease", advice: 4, token: 8 },
    { kind: "collectionReserveLease", advice: 6, token: 8 },
    {
      kind: "finishReserve",
      group: 1,
      lifetime: 1,
      round: 1,
      attempt: 7,
      token: 8,
      selected: [4, 6],
      hasNotice: false,
      passNotices: true,
      canWrite: true,
      bindingValid: true,
      deadlineReached: true
    },
    {
      kind: "submissionBegin",
      advice: 4,
      group: 1,
      round: 1,
      token: 8,
      surface: "stop",
      authorizeNow: false,
      fingerprints: [10],
      units: [4]
    },
    {
      kind: "submissionBegin",
      advice: 6,
      group: 1,
      round: 1,
      token: 8,
      surface: "stop",
      authorizeNow: false,
      fingerprints: [11],
      units: [6]
    },
    { kind: "finishAuthorize", group: 1, round: 1, attempt: 7, token: 8, selected: [4, 6] },
    { kind: "deliveryAcknowledgeCheck", items: 2, anyExpired: false },
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
    { kind: "submissionForget", advice: 6 }
  ] as CanonicalEvent[]
}

/** Presentation-only action boundaries. Every enclosed event still runs through Canonical.step. */
export const SHOWCASE_ACTION_GROUPS = [
  { first: 40, last: 41, label: "Collect 2 advice groups for one Stop output" },
  { first: 43, last: 44, label: "Stage 2 advice records for one Stop output" }
] as const
const actionGroups = (scenario: number) => (scenario === 0 ? SHOWCASE_ACTION_GROUPS : [])
export const guidedActionCount = (scenario: number): number =>
  CANONICAL_SCENARIOS[scenario].events.length -
  actionGroups(scenario).reduce((count, group) => count + group.last - group.first, 0)
export const completedGuidedActions = (events: number, scenario: number): number =>
  Array.from({ length: events }, (_, index) => index + 1).filter(
    (event) => !actionGroups(scenario).some((group) => event >= group.first && event < group.last)
  ).length
export const nextGuidedActionEnd = (events: number, scenario: number): number => {
  const next = events + 1
  return actionGroups(scenario).find((group) => next >= group.first && next <= group.last)?.last ?? next
}
export const guidedActionLabel = (events: number, scenario: number): string | undefined => {
  const next = events + 1
  return actionGroups(scenario).find((group) => next >= group.first && next <= group.last)?.label
}
export const endingActionGroup = (events: number, scenario: number) =>
  actionGroups(scenario).find((group) => group.last === events)

export const CAPACITY_SCENARIO = {
  name: "Shared review capacity and partial unit admission",
  description:
    "Two advicees share one ledger. A preparation releases its space, then admits, refuses, and admits three units in order.",
  limits: fixture.limits,
  events: fixture.capacityTrace.events as CanonicalEvent[]
}
export const ALTERNATE_LEDGER_LIMITS_SCENARIO = {
  name: "Alternate checked ledger limits",
  description:
    "The source-free replay starts Bend with a second valid ledger limit set, then reserves one review unit.",
  limits: { globalItems: 4, globalBytes: 160, partitionItems: 3, partitionBytes: 80 },
  events: [
    { kind: "openRound", partition: 1, lifetime: 1 },
    { kind: "reserveCapacity", partition: 1, bytes: 20, purpose: "reviewUnit" }
  ] as CanonicalEvent[]
}
export const CANONICAL_SCENARIOS = [
  SHOWCASE_SCENARIO,
  CAPACITY_SCENARIO,
  ...fixture.traces.map((trace) => ({
    name: trace.name,
    description: "Independent source-free event sequence covering resident work and output decisions.",
    limits: fixture.limits,
    events: trace.events as CanonicalEvent[]
  })),
  ...requestFixture.traces.map((trace) => ({
    name: trace.name,
    description:
      "Independent #148 Jev request contract trace. Start, response, failure and physical availability are supplied source-free facts.",
    limits: requestFixture.limits,
    events: trace.events.map(({ expect: _expect, ...raw }) => {
      const {
        issuedRequest: _issuedRequest,
        requestAfter: _requestAfter,
        requestCount: _requestCount,
        ...event
      } = raw as typeof raw & { issuedRequest?: unknown; requestAfter?: unknown; requestCount?: unknown }
      return event as CanonicalEvent
    })
  })),
  ALTERNATE_LEDGER_LIMITS_SCENARIO
] as const

const stepReplayEntry = (
  state: unknown,
  preparation: PreparationReplay,
  entry: ReplayEvent
): { state: unknown; step: ReplayStep } => {
  const before = projectCanonical(state)
  if (entry.event.kind === "preparationGraph") {
    const event = entry.event
    if (
      !before.work.some(
        (work) =>
          work.kind === "preparing" &&
          work.operation === event.operation &&
          work.partition === event.partition &&
          work.lifetime === event.lifetime &&
          work.round === event.round
      )
    )
      throw new Error("graph facts require an active enclosing preparation operation")
    const frame = preparation.step(event)
    return { state, step: { event, origin: entry.origin, outputs: [], before, after: before, preparation: frame } }
  }
  const result = stepCanonical(state, entry.event)
  return {
    state: result.state,
    step: {
      event: entry.event,
      origin: entry.origin,
      outputs: result.outputs,
      before,
      after: projectCanonical(result.state),
      ...(result.rejection === undefined ? {} : { rejection: result.rejection })
    }
  }
}

const reconstructCanonical = (
  history: readonly ReplayEvent[],
  position: number,
  limits: typeof CAPACITY_SCENARIO.limits
) => {
  let state = initialCanonical(limits)
  const steps: ReplayStep[] = []
  const preparation = new PreparationReplay()
  for (const entry of history.slice(0, position)) {
    const result = stepReplayEntry(state, preparation, entry)
    state = result.state
    steps.push(result.step)
  }
  return { state, steps, preparation }
}

/** Replay only through the checked adapter also used by the resident. */
export const replayCanonical = (
  history: readonly ReplayEvent[],
  position: number,
  limits: typeof CAPACITY_SCENARIO.limits = CAPACITY_SCENARIO.limits
): { readonly state: unknown; readonly projection: CanonicalProjection; readonly steps: readonly ReplayStep[] } => {
  const replay = reconstructCanonical(history, position, limits)
  return { state: replay.state, projection: projectCanonical(replay.state), steps: replay.steps }
}

export const tryAppendCanonical = (
  history: readonly ReplayEvent[],
  position: number,
  event: unknown,
  origin: ReplayEvent["origin"],
  limits: typeof CAPACITY_SCENARIO.limits = CAPACITY_SCENARIO.limits
): {
  readonly history: readonly ReplayEvent[]
  readonly position: number
  readonly error?: string
  readonly rejection?: string
} => {
  const prior = history.slice(0, position)
  try {
    const replay = replayCanonical(prior, prior.length, limits)
    if (typeof event === "object" && event !== null && "kind" in event && event.kind === "preparationGraph") {
      if (origin !== "guided")
        throw new Error(
          "Graph facts are supplied by the composed guided replay; manual input accepts canonical events."
        )
      const next = [...prior, { event: event as PreparationEvent, origin }]
      replayCanonical(next, next.length, limits)
      return { history: next, position: next.length }
    }
    // The adapter validates shape, constructors, and the complete returned state.
    const result = stepCanonical(replay.state, event as CanonicalEvent)
    return {
      history: [...prior, { event: event as CanonicalEvent, origin }],
      position: prior.length + 1,
      ...(result.rejection === undefined ? {} : { rejection: result.rejection })
    }
  } catch (cause) {
    return { history, position, error: cause instanceof Error ? cause.message : "invalid event" }
  }
}

export const guidedIndex = (history: readonly ReplayEvent[], position: number): number =>
  history.slice(0, position).filter((entry) => entry.origin === "guided" && entry.event.kind !== "preparationGraph")
    .length

const preparationEvents = (event: CanonicalEvent, scenario: number): readonly PreparationEvent[] => {
  if (scenario !== 0 || event.kind !== "preparationCompleted") return []
  return event.unitBytes.flatMap((_bytes, unit) => {
    const example: PreparationEvent["example"] = event.operation === 5 && unit === 1 ? "branchingTreeBudget" : "simple"
    return preparationExample(example).steps.map(({ event: fact }, step) => ({
      kind: "preparationGraph" as const,
      example,
      partition: event.partition,
      lifetime: event.lifetime,
      round: event.round,
      operation: event.operation,
      unit,
      step,
      fact
    }))
  })
}

export const nextGuidedEvent = (
  history: readonly ReplayEvent[],
  position: number,
  scenario = 0
): CanonicalEvent | PreparationEvent | undefined => {
  const next = CANONICAL_SCENARIOS[scenario]?.events[guidedIndex(history, position)]
  if (!next) return undefined
  const facts = preparationEvents(next, scenario)
  if (facts.length === 0) return next
  const count = history
    .slice(0, position)
    .filter(
      (entry) =>
        entry.event.kind === "preparationGraph" &&
        next.kind === "preparationCompleted" &&
        entry.event.operation === next.operation
    ).length
  return facts[count] ?? next
}

/** Planned event horizon, including recorded manual facts and not-yet-replayed guided facts.
 * This counts the scenario; only checked replay decides whether a requested position is reachable.
 */
export const historyTimelineLength = (history: readonly ReplayEvent[], scenario = 0): number => {
  let remaining = 0
  for (const event of CANONICAL_SCENARIOS[scenario].events.slice(guidedIndex(history, history.length))) {
    const facts = preparationEvents(event, scenario)
    const supplied =
      event.kind === "preparationCompleted"
        ? history.filter(
            (entry) => entry.event.kind === "preparationGraph" && entry.event.operation === event.operation
          ).length
        : 0
    remaining += 1 + Math.max(0, facts.length - supplied)
  }
  return history.length + remaining
}

/** Extend the recorded endpoint in one pass, preserving the same checks as ordinary replay. */
export const extendGuidedHistory = (
  history: readonly ReplayEvent[],
  target: number,
  scenario = 0
): {
  readonly history: readonly ReplayEvent[]
  readonly position: number
  readonly error?: string
  readonly rejection?: string
} => {
  const replay = reconstructCanonical(history, history.length, CANONICAL_SCENARIOS[scenario].limits)
  const events = [...history]
  let state = replay.state
  let rejection: string | undefined
  while (events.length < target) {
    const event = nextGuidedEvent(events, events.length, scenario)
    if (!event) break
    const entry: ReplayEvent = { event, origin: "guided" }
    try {
      const result = stepReplayEntry(state, replay.preparation, entry)
      state = result.state
      rejection = result.step.rejection
      events.push(entry)
    } catch (cause) {
      return {
        history: events,
        position: events.length,
        error: cause instanceof Error ? cause.message : "invalid event"
      }
    }
  }
  return { history: events, position: events.length, ...(rejection === undefined ? {} : { rejection }) }
}

/** Guided actions keep every reducer event in history while jumping over declared display groups. */
export const adjacentGuidedPosition = (
  history: readonly ReplayEvent[],
  position: number,
  direction: -1 | 1,
  scenario = 0
): number | undefined => {
  const current = guidedIndex(history, position)
  const target =
    direction > 0
      ? nextGuidedActionEnd(current, scenario)
      : (Array.from({ length: current }, (_, index) => index)
          .filter(
            (event) =>
              event === 0 || !actionGroups(scenario).some((group) => event >= group.first && event < group.last)
          )
          .at(-1) ?? 0)
  if (target <= 0) return 0
  let guided = 0
  for (let index = 0; index < history.length; index++) {
    const entry = history[index]
    if (entry.origin === "guided" && entry.event.kind !== "preparationGraph" && ++guided === target) return index + 1
  }
  return undefined
}
