import type { makeResidentInspection } from "../inspection/observer.ts"
import { type DirectObservation, type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type { captureInspectionFate } from "@hapsland/review-execution/inspection/capture"
import { collectionOrdering } from "./collection-decisions.ts"
import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import type { Advice } from "../state/advice-records.ts"
import { type WorkRevision } from "../state/revision.ts"
import * as Effect from "effect/Effect"
import { randomUUID } from "node:crypto"
import { type PreparedUnit } from "@hapsland/review-definition/direct-event/model"
import {
  DELIVERY_LEASE_MS,
  type ResidentDispatchContext,
  type ResidentResponse,
  type CollectionMode
} from "@hapsland/resident-transport/resident/protocol"
import type { CanonicalEvent } from "@hapsland/canonical-policy/canonical/adapter"
import {
  PENDING_ADVICE_EXPIRY_MS,
  combinedClaudeOutput,
  combinedReviewOutput,
  selectFittingClaudeStopFindings,
  selectFittingFindings,
  selectFittingCurrentFindingIndices,
  selectFittingClaudeFindings
} from "./collection.ts"
import {
  type FindingSelectionFacts,
  type CanonicalFindingOffer,
  type OperationalNoticeKind
} from "../state/collection-facts.ts"
import { readCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import type { ReviewControls } from "../execution-controls/review-controls.ts"
import { type ResidentLedger } from "../work-ownership/jobs.ts"
import { ResidentAdapterError } from "../adapter-error.ts"
import { type ResponseAuthority } from "./authority.ts"
import { residentResponse, findingAtDeliveryRoot } from "./findings.ts"
import { recipientPartition } from "../recipient/identity.ts"

type CollectionFrame = {
  readonly callerRoot: string
  readonly partition: string
  readonly dispatch: ResidentDispatchContext
  readonly composed: boolean
  readonly authority: ResponseAuthority | undefined
  readonly claudeSurface: "stop" | undefined
  readonly now: number
  readonly stopCollector: boolean
  readonly credentialGeneration: number | null
}
export type CandidateRoute =
  | "ignoreCandidate"
  | "releaseCandidate"
  | "retireCandidate"
  | "continueCandidate"
  | "retainCandidate"
type Dependencies = {
  readonly residentLedger: ResidentLedger
  readonly residentComposedDelivery: ReturnType<ResidentLedger["delivery"]>
  readonly residentInspection: Effect.Success<ReturnType<typeof makeResidentInspection>>
  readonly residentNow: () => number
  readonly residentRemoveAdvice: (
    id: string,
    token?: string | undefined,
    retirement?:
      | {
          readonly fate: Parameters<typeof captureInspectionFate>[1]
          readonly reason: Parameters<typeof captureInspectionFate>[2]
        }
      | undefined
  ) => Effect.Effect<boolean, never, never>
  readonly residentExpirePending: (now: number) => Effect.Effect<void, never, never>
  readonly residentPruneNoticeCooldowns: (
    now: number,
    exceptKey?: string | undefined
  ) => Effect.Effect<void, never, never>
  readonly residentAdvice: () => Effect.Effect<readonly Advice[], never, never>
  readonly residentJoined: ReturnType<ResidentLedger["joinedReviews"]>
  readonly residentCollectionFindingOffer: CanonicalFindingOffer
  readonly residentFindingSelectionFacts: (
    advice: Advice,
    partition: string,
    credentialGeneration: number | null,
    now: number,
    composed: boolean
  ) => Effect.Effect<FindingSelectionFacts, never, never>
  readonly residentRecordOperationalFailure: (
    observation: DirectObservation,
    kind: OperationalNoticeKind,
    now?: number | undefined
  ) => Effect.Effect<void, never, never>
  readonly residentReviewControls: ReviewControls
  readonly residentIsCurrentWork: (
    revision: WorkRevision,
    prepared: PreparedUnit
  ) => Effect.Effect<boolean, never, never>
  readonly releaseDelivery: (token: string) => Effect.Effect<void>
}
type CollectionHandoffFacts = Effect.Success<ReturnType<typeof residentCollectionHandoffFacts>>
function residentCollectionElapsed(now: number, started: number, limit: number): number {
  const elapsed = Math.min(limit, Math.max(0, now - started))
  return Number.isNaN(elapsed) ? 0 : Math.floor(elapsed)
}
const residentPendingCanonicalFindings = Effect.fn("ResidentRuntime.pendingCanonicalFindings")(function* (
  deps: Dependencies,
  operation: number
) {
  return (
    (yield* deps.residentLedger.canonicalProjection()).pendingFindings.find((item) => item.operation === operation)
      ?.count ?? 0
  )
})
const residentAdviceExpired = Effect.fn("ResidentRuntime.adviceExpired")(function* (
  deps: Dependencies,
  advice: Pick<Advice, "pendingAt">,
  now: number
) {
  const result = yield* deps.residentLedger.transition({
    kind: "collectionExpiryCheck",
    elapsed: residentCollectionElapsed(now, advice.pendingAt, PENDING_ADVICE_EXPIRY_MS),
    lifetime: PENDING_ADVICE_EXPIRY_MS
  })
  if (result.rejection !== undefined) throw new Error("canonical advice expiry refused")
  const command = result.outputs[0]?.kind
  if (command !== "collectionExpired" && command !== "collectionCurrent")
    throw new Error("invalid canonical advice expiry")
  return command === "collectionExpired"
})
const residentCollectionOrder = Effect.fn("ResidentRuntime.collectionOrder")(function* (
  deps: Dependencies,
  left: Pick<Advice, "sequence">,
  right: Pick<Advice, "sequence">
) {
  const result = yield* deps.residentLedger.transition({
    kind: "collectionOrderCheck",
    leftSequence: left.sequence,
    rightSequence: right.sequence
  })
  if (result.rejection !== undefined) throw new Error("canonical collection order refused")
  return collectionOrdering(result.outputs[0]?.kind)
})
const residentReserveAdviceLease = Effect.fn("ResidentRuntime.reserveAdviceLease")(
  (deps: Dependencies, advice: Advice, token: string) => deps.residentLedger.advice.reserveLease(advice, token)
)
const residentReleaseAdviceLease = Effect.fn("ResidentRuntime.releaseAdviceLease")(
  (deps: Dependencies, advice: Advice) => deps.residentLedger.advice.releaseLease(advice)
)
const residentCheckAdviceLease = Effect.fn("ResidentRuntime.checkAdviceLease")(function* (
  deps: Dependencies,
  advice: Advice,
  now: number,
  stopCollector: boolean,
  sameGroup: boolean
) {
  const { delivery } = yield* deps.residentLedger.advice.current(advice)
  yield* deps.residentLedger.advice.checkLease(
    advice,
    now,
    stopCollector,
    sameGroup,
    delivery !== undefined &&
      stopCollector &&
      sameGroup &&
      (yield* deps.residentComposedDelivery.backgroundReofferable(advice.id, delivery.token))
  )
}, Effect.uninterruptible)
const residentUnsuppressedFindings = Effect.fn("ResidentRuntime.unsuppressedFindings")(function* (
  deps: Dependencies,
  advice: Advice,
  findings: ReadonlyArray<Finding>,
  stopCollector: boolean,
  firstOnly = false
) {
  const retained: Array<Finding> = []
  const partition = recipientPartition(advice.observation.advicee)
  for (const finding of findings) {
    if (
      yield* deps.residentComposedDelivery.suppresses(advice.id, partition, finding, stopCollector ? "stop" : undefined)
    ) {
      deps.residentInspection.observeAdviceFate(advice, [finding], "suppressed", "collection-suppression")
      continue
    }
    retained.push(finding)
    if (firstOnly) break
  }
  return retained
})
const residentClaudeCollectionSurface = (
  advicee: DirectAdvicee,
  mode: CollectionMode,
  authority: ResponseAuthority | undefined,
  composed: boolean
): "stop" | undefined =>
  composed && authority === undefined && advicee.host === "claude-code" && mode === "turn-end" ? "stop" : undefined
const residentCollectionBlocked = Effect.fn("ResidentRuntime.collectionBlocked")(function* (
  deps: Dependencies,
  partition: string,
  mode: CollectionMode,
  composed: boolean
) {
  return composed && mode !== "turn-end" && (yield* deps.residentComposedDelivery.isDeciding(partition))
})
const residentStopCollector = Effect.fn("ResidentRuntime.stopCollector")(function* (
  deps: Dependencies,
  partition: string,
  mode: CollectionMode,
  composed: boolean
) {
  return composed && mode === "turn-end" && (yield* deps.residentComposedDelivery.isDeciding(partition))
})
const residentCollectionFrame = Effect.fn("ResidentRuntime.collectionFrame")(function* (
  deps: Dependencies,
  root: string,
  advicee: DirectAdvicee,
  dispatch: ResidentDispatchContext,
  mode: CollectionMode,
  authority: ResponseAuthority | undefined,
  composed: boolean
) {
  const partition = recipientPartition(advicee)
  const claudeSurface = residentClaudeCollectionSurface(advicee, mode, authority, composed)
  const now = deps.residentNow()
  if (yield* residentCollectionBlocked(deps, partition, mode, composed)) return undefined
  const stopCollector = yield* residentStopCollector(deps, partition, mode, composed)
  return {
    partition,
    callerRoot: dispatch.deliveryCwd ?? root,
    dispatch,
    composed,
    authority,
    claudeSurface,
    now,
    stopCollector
  } satisfies Omit<CollectionFrame, "credentialGeneration">
})
const residentCollectionSameScope = (frame: CollectionFrame, advice: Advice): boolean =>
  frame.composed
    ? recipientPartition(advice.observation.advicee) === frame.partition
    : advice.partition === frame.partition
const residentCollectionCredentialCheck = Effect.fn("ResidentRuntime.collectionCredentialCheck")(function* (
  deps: Dependencies,
  frame: CollectionFrame,
  advice: Advice
) {
  const result = yield* deps.residentLedger.transition({
    kind: "collectionCredentialCheck",
    sameScope: residentCollectionSameScope(frame, advice),
    generationValid: advice.credentialGeneration === frame.credentialGeneration
  })
  if (result.rejection !== undefined) throw new Error("canonical credential check refused")
  if (result.outputs[0]?.kind === "collectionRetireCredential")
    yield* deps.residentRemoveAdvice(advice.id, undefined, { fate: "discarded", reason: "credential-invalid" })
  else if (result.outputs[0]?.kind !== "collectionRetainCredential")
    throw new Error("invalid canonical credential decision")
})
const residentCollectionPrelude = Effect.fn("ResidentRuntime.collectionPrelude")(function* (
  deps: Dependencies,
  initial: Omit<CollectionFrame, "credentialGeneration">
) {
  yield* deps.residentExpirePending(initial.now)
  yield* deps.residentPruneNoticeCooldowns(initial.now)
  const frame: CollectionFrame = { ...initial, credentialGeneration: initial.dispatch.credential?.generation ?? null }
  for (const advice of [...(yield* deps.residentAdvice())])
    yield* residentCollectionCredentialCheck(deps, frame, advice)
  // Stop reoffers an uncertain background write only after its writer terminated.
  for (const { capability: advice, content } of yield* deps.residentLedger.advice.snapshots()) {
    const sameGroup = recipientPartition(advice.observation.advicee) === frame.partition
    if (content.delivery !== undefined)
      yield* residentCheckAdviceLease(deps, advice, frame.now, frame.stopCollector, sameGroup)
  }
  return frame
})
const residentCollectionCandidateResult = (
  deps: Dependencies,
  result: Effect.Success<ReturnType<typeof deps.residentLedger.transition>>
): boolean => {
  if (result.rejection !== undefined) throw new Error("canonical advice candidate refused")
  const kind = result.outputs[0]?.kind
  if (kind !== "collectionCandidate" && kind !== "collectionSkip") throw new Error("invalid canonical advice candidate")
  return kind === "collectionCandidate"
}
const residentCollectionCandidate = Effect.fn("ResidentRuntime.collectionCandidate")(function* (
  deps: Dependencies,
  frame: CollectionFrame,
  advice: Advice,
  content: Effect.Success<ReturnType<typeof deps.residentLedger.advice.current>>
) {
  const samePartition = residentCollectionSameScope(frame, advice)
  const unleased = content.delivery === undefined
  const hasUnsuppressed =
    samePartition &&
    unleased &&
    (yield* residentUnsuppressedFindings(deps, advice, content.findings, frame.stopCollector, true)).length > 0
  const authorityOwns = frame.authority === undefined || frame.authority.partition === advice.partition
  const result = yield* deps.residentLedger.transition({
    kind: "collectionCandidateCheck",
    samePartition,
    unleased,
    hasUnsuppressed,
    authorityOwns
  })
  return residentCollectionCandidateResult(deps, result)
})
const residentCollectionAdviceAt = (advice: ReadonlyArray<Advice>, index: number): Advice => {
  const item = advice[index]
  if (item === undefined) throw new Error("eligible advice disappeared during ordering")
  return item
}
const residentOrderCollectionAdvice = Effect.fn("ResidentRuntime.orderCollectionAdvice")(function* (
  deps: Dependencies,
  eligible: Array<Advice>
) {
  for (let index = 1; index < eligible.length; index++) {
    const item = residentCollectionAdviceAt(eligible, index)
    let previous = index - 1
    while (previous >= 0) {
      const left = residentCollectionAdviceAt(eligible, previous)
      if ((yield* residentCollectionOrder(deps, left, item)) <= 0) break
      eligible[previous + 1] = left
      previous--
    }
    eligible[previous + 1] = item
  }
})
const residentEligibleCollectionAdvice = Effect.fn("ResidentRuntime.eligibleCollectionAdvice")(function* (
  deps: Dependencies,
  frame: CollectionFrame
) {
  const available: Array<Advice> = []
  for (const { capability: advice, content } of yield* deps.residentLedger.advice.snapshots()) {
    if (yield* residentCollectionCandidate(deps, frame, advice, content)) available.push(advice)
  }
  for (const advice of available)
    yield* deps.residentLedger.advice.eligible(advice, yield* deps.residentJoined.hasAdmission(advice.admissionId))
  const eligible = (yield* Effect.forEach(
    available,
    Effect.fn("ResidentRuntime.eligibleAdvice")(function* (item) {
      return { item, content: yield* deps.residentLedger.advice.current(item) }
    })
  ))
    .filter(({ content }) => content.collectionEligible)
    .map(({ item }) => item)
  yield* residentOrderCollectionAdvice(deps, eligible)
  return eligible
})
const residentSelectCollectionFindings = (
  deps: Dependencies,
  frame: CollectionFrame,
  retained: ReadonlyArray<Finding>,
  candidates: ReadonlyArray<Finding>,
  facts: FindingSelectionFacts,
  onLimited: (() => void) | undefined
) =>
  frame.authority === undefined
    ? frame.claudeSurface === undefined
      ? selectFittingFindings(retained, candidates, facts, onLimited, deps.residentCollectionFindingOffer)
      : selectFittingClaudeStopFindings(retained, candidates, facts, onLimited, deps.residentCollectionFindingOffer)
    : selectFittingClaudeFindings(
        retained,
        candidates,
        frame.authority.claudeFeedbackMode,
        facts,
        onLimited,
        deps.residentCollectionFindingOffer
      )
const residentFittingCollectionFindings = Effect.fn("ResidentRuntime.fittingCollectionFindings")(function* (
  deps: Dependencies,
  frame: CollectionFrame,
  retained: ReadonlyArray<Finding>,
  candidates: ReadonlyArray<Finding>,
  advice: Advice
) {
  const facts = yield* deps.residentFindingSelectionFacts(
    advice,
    frame.partition,
    frame.credentialGeneration,
    deps.residentNow(),
    frame.composed
  )
  let limited = 0
  const fitting = yield* residentSelectCollectionFindings(deps, frame, retained, candidates, facts, () => {
    limited++
  })
  for (let index = 0; index < limited; index++)
    yield* deps.residentRecordOperationalFailure(advice.observation, "output-limit")
  return fitting
}, Effect.uninterruptible)
const residentDisposeCollectionCandidate = Effect.fn("ResidentRuntime.disposeCollectionCandidate")(function* (
  deps: Dependencies,
  advice: Advice,
  token: string,
  route: string
) {
  if (route === "retireCandidate") yield* deps.residentRemoveAdvice(advice.id, token)
  else yield* residentReleaseAdviceLease(deps, advice)
})
const residentCollectionBarrier = Effect.fn("ResidentRuntime.collectionBarrier")(function* (
  deps: Dependencies,
  advice: Advice,
  final: boolean
) {
  const barrier = final
    ? deps.residentReviewControls.beforeFinalSelection(advice.id)
    : deps.residentReviewControls.beforeSelection(advice.id)
  yield* barrier.pipe(
    Effect.mapError(
      () =>
        new ResidentAdapterError({
          operation: final ? "final collection selection barrier" : "collection selection barrier"
        })
    )
  )
})
const residentCollectionPostCheck = Effect.fn("ResidentRuntime.collectionPostCheck")(function* (
  deps: Dependencies,
  advice: Advice,
  token: string,
  event: Extract<CanonicalEvent, { kind: "postValidationCheck" }>
) {
  const route = yield* residentCandidateRoute(deps, event)
  if (route === "retainCandidate") return true
  yield* residentDisposeCollectionCandidate(deps, advice, token, route)
  return false
})
const residentCollectionPassAdvice = Effect.fn("ResidentRuntime.collectionPassAdvice")(function* (
  deps: Dependencies,
  candidate: Advice,
  token: string,
  final: boolean
) {
  if (final) return candidate
  const advice = (yield* deps.residentLedger.advice.snapshots()).find(
    ({ capability, content }) => capability.id === candidate.id && content.delivery === undefined
  )?.capability
  if (advice === undefined) return undefined
  return (yield* residentReserveAdviceLease(deps, advice, token)) ? advice : undefined
})
const residentCollectionPassFindings = Effect.fn("ResidentRuntime.collectionPassFindings")(function* (
  deps: Dependencies,
  frame: CollectionFrame,
  advice: Advice,
  token: string,
  retained: ReadonlyArray<Finding>,
  final: boolean
) {
  yield* residentCollectionBarrier(deps, advice, final)
  const retainedAdvice = (yield* deps.residentAdvice()).find((item) => item.id === advice.id)
  if (retainedAdvice !== advice) return undefined
  const content = yield* deps.residentLedger.advice.current(advice)
  if (content.delivery?.token !== token) return undefined
  if (!(yield* deps.residentIsCurrentWork(advice.revision, advice.prepared))) {
    yield* deps.residentRemoveAdvice(advice.id, token, { fate: "stale", reason: "resident-stale" })
    return undefined
  }
  const candidates = yield* residentUnsuppressedFindings(deps, advice, content.findings, frame.stopCollector)
  const fitting = yield* residentFittingCollectionFindings(deps, frame, retained, candidates, advice)
  if (
    !(yield* residentCollectionPostCheck(deps, advice, token, {
      kind: "postValidationCheck",
      workAccepted: true,
      expired: false,
      hasFitting: fitting.length > 0
    }))
  )
    return undefined
  if (final && (yield* deps.residentLedger.advice.current(advice)).delivery?.token !== token) return undefined
  yield* deps.residentLedger.advice.updateDelivery(advice, token, { findings: fitting })
  return fitting
})
const residentCollectionPass = Effect.fn("ResidentRuntime.collectionPass")(function* (
  deps: Dependencies,
  frame: CollectionFrame,
  token: string,
  candidates: ReadonlyArray<Advice>,
  final: boolean
) {
  const selected: Array<Advice> = []
  let findings: Array<Finding> = []
  for (const candidate of candidates) {
    const advice = yield* residentCollectionPassAdvice(deps, candidate, token, final)
    if (advice === undefined) continue
    const fitting = yield* residentCollectionPassFindings(deps, frame, advice, token, findings, final)
    if (fitting === undefined) continue
    findings = [...findings, ...fitting]
    selected.push(advice)
  }
  return selected
})
const residentCollectionCredentialStateValid = (
  state: ReturnType<typeof readCredentialState>,
  generation: number | null,
  environmentOnly: boolean
): boolean => state !== undefined && state.generation === generation && (environmentOnly || !state.savedUseSuspended)
const residentHandoffCredentialAuthorized = (
  frame: CollectionFrame,
  advice: Advice,
  ownerCurrent: boolean,
  generationValid: boolean
): boolean => {
  const credential = frame.dispatch.credential
  if (!ownerCurrent || !generationValid || credential === null) return true
  const state = readCredentialState(credential.statePath)
  return residentCollectionCredentialStateValid(
    state,
    frame.credentialGeneration,
    frame.authority?.credentialEnvironmentOnly ?? advice.credentialEnvironmentOnly
  )
}
const residentCollectionHandoffFacts = Effect.fn("ResidentRuntime.collectionHandoffFacts")(function* (
  deps: Dependencies,
  frame: CollectionFrame,
  advice: Advice,
  token: string
) {
  const retained = (yield* deps.residentAdvice()).find((item) => item.id === advice.id)
  const delivery = retained === undefined ? undefined : (yield* deps.residentLedger.advice.current(retained)).delivery
  const ownerCurrent = retained === advice && delivery?.token === token
  const generationValid = advice.credentialGeneration === frame.credentialGeneration
  const credentialAuthorized = residentHandoffCredentialAuthorized(frame, advice, ownerCurrent, generationValid)
  return {
    delivery,
    ownerCurrent,
    generationValid,
    credentialAuthorized,
    canInspect: ownerCurrent && generationValid && credentialAuthorized
  }
})
const residentCollectionFinalRoute = Effect.fn("ResidentRuntime.collectionFinalRoute")(function* (
  deps: Dependencies,
  advice: Advice,
  facts: CollectionHandoffFacts,
  now: number
) {
  return yield* residentCandidateRoute(deps, {
    kind: "finalCandidateCheck",
    ownerCurrent: facts.ownerCurrent,
    credentialGeneration: facts.generationValid,
    credentialAuthorized: facts.credentialAuthorized,
    expired: facts.canInspect && (yield* residentAdviceExpired(deps, advice, now)),
    workCurrent: facts.canInspect && (yield* deps.residentIsCurrentWork(advice.revision, advice.prepared)),
    hasFindings: facts.delivery !== undefined && facts.delivery.findings.length > 0
  })
})
const residentRetainableHandoff = (route: string, facts: CollectionHandoffFacts): boolean =>
  route === "retainCandidate" && facts.delivery !== undefined
const residentRetainHandoffAdvice = Effect.fn("ResidentRuntime.retainHandoffAdvice")(function* (
  deps: Dependencies,
  advice: Advice,
  token: string,
  now: number,
  route: string,
  facts: CollectionHandoffFacts
) {
  if (route === "retireCandidate") {
    yield* deps.residentRemoveAdvice(advice.id, token)
    return false
  }
  if (route === "releaseCandidate") {
    yield* residentReleaseAdviceLease(deps, advice)
    return false
  }
  if (!residentRetainableHandoff(route, facts)) return false
  yield* deps.residentLedger.advice.updateDelivery(advice, token, { leaseUntil: now + DELIVERY_LEASE_MS })
  return true
})
const residentCollectHandoffAdvice = Effect.fn("ResidentRuntime.collectHandoffAdvice")(function* (
  deps: Dependencies,
  frame: CollectionFrame,
  advice: Advice,
  token: string,
  now: number
) {
  const facts = yield* residentCollectionHandoffFacts(deps, frame, advice, token)
  const route = yield* residentCollectionFinalRoute(deps, advice, facts, now)
  return yield* residentRetainHandoffAdvice(deps, advice, token, now, route, facts)
})
const residentCollectHandoff = Effect.fn("ResidentRuntime.collectHandoff")(function* (
  deps: Dependencies,
  frame: CollectionFrame,
  final: ReadonlyArray<Advice>,
  token: string,
  now: number
) {
  const handoff: Array<Advice> = []
  for (const advice of final)
    if (yield* residentCollectHandoffAdvice(deps, frame, advice, token, now)) handoff.push(advice)
  return handoff
})
const residentCollectionSurface = (frame: CollectionFrame) =>
  frame.authority === undefined
    ? frame.claudeSurface === undefined
      ? ("codex" as const)
      : ("claude-stop" as const)
    : frame.authority.claudeFeedbackMode
const residentHandoffOffers = Effect.fn("ResidentRuntime.handoffOffers")(function* (
  deps: Dependencies,
  frame: CollectionFrame,
  advice: Advice,
  now: number
) {
  const facts = yield* deps.residentFindingSelectionFacts(
    advice,
    frame.partition,
    frame.credentialGeneration,
    now,
    frame.composed
  )
  const { delivery } = yield* deps.residentLedger.advice.current(advice)
  return (delivery?.findings ?? []).map((finding) => ({
    advice,
    finding: findingAtDeliveryRoot(finding, advice.observation.root, frame.callerRoot),
    facts
  }))
})
const residentSelectHandoffFindings = Effect.fn("ResidentRuntime.selectHandoffFindings")(function* (
  deps: Dependencies,
  frame: CollectionFrame,
  handoff: ReadonlyArray<Advice>,
  token: string,
  now: number
) {
  const offers = (yield* Effect.forEach(handoff, (advice) => residentHandoffOffers(deps, frame, advice, now))).flat()
  const limited: Array<number> = []
  const accepted = new Set(
    yield* selectFittingCurrentFindingIndices(
      offers,
      residentCollectionSurface(frame),
      (index) => {
        limited.push(index)
      },
      deps.residentCollectionFindingOffer
    )
  )
  for (const index of limited)
    yield* deps.residentRecordOperationalFailure(offers[index]!.advice.observation, "output-limit", now)
  let index = 0
  for (const advice of handoff) {
    const { delivery } = yield* deps.residentLedger.advice.current(advice)
    if (delivery === undefined) continue
    yield* deps.residentLedger.advice.updateDelivery(advice, token, {
      findings: delivery.findings.filter(() => accepted.has(index++))
    })
    if ((yield* deps.residentLedger.advice.current(advice)).delivery?.findings.length === 0)
      yield* residentReleaseAdviceLease(deps, advice)
  }
  const contents = yield* Effect.forEach(handoff, (advice) => deps.residentLedger.advice.current(advice))
  const findings = contents.flatMap((content, index) =>
    (content.delivery?.findings ?? []).map((finding) =>
      findingAtDeliveryRoot(finding, handoff[index]!.observation.root, frame.callerRoot)
    )
  )
  return findings
})
const residentCollectionResponse = (
  frame: CollectionFrame,
  token: string,
  findings: ReadonlyArray<Finding>
): ResidentResponse => {
  if (findings.length === 0) return residentResponse({ status: "empty" })
  return residentResponse(
    frame.authority === undefined
      ? { status: "advice", token, findingCount: findings.length, output: combinedReviewOutput(findings, []) }
      : {
          requestRoute: "edit",
          status: "advice",
          token,
          findingCount: findings.length,
          output: combinedClaudeOutput(findings, [], frame.authority.claudeFeedbackMode)
        }
  )
}
const residentCollect = Effect.fn("ResidentRuntime.collect")(
  (
    deps: Dependencies,
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode = "ordinary",
    authority?: ResponseAuthority,
    composed = false
  ) =>
    Effect.suspend(() => {
      let collectionToken: string | undefined
      return Effect.gen(function* () {
        const initial = yield* residentCollectionFrame(deps, root, advicee, dispatch, mode, authority, composed)
        if (initial === undefined) return residentResponse({ status: "empty" })
        const frame = yield* residentCollectionPrelude(deps, initial)
        const eligible = yield* residentEligibleCollectionAdvice(deps, frame)
        const token = (collectionToken = randomUUID())
        const selected = yield* residentCollectionPass(deps, frame, token, eligible, false)
        if (selected.length === 0) return residentResponse({ status: "empty" })
        const final = yield* residentCollectionPass(deps, frame, token, selected, true)
        if (final.length === 0) return residentResponse({ status: "empty" })
        // Selection does not read source. The response boundary performs the
        // single final source check before handing findings to its caller.
        const handoffNow = deps.residentNow()
        const handoff = yield* residentCollectHandoff(deps, frame, final, token, handoffNow)
        const findings = yield* residentSelectHandoffFindings(deps, frame, handoff, token, handoffNow)
        // Operational failures remain resident diagnostics; only actionable findings reach the agent.
        return residentCollectionResponse(frame, token, findings)
      }).pipe(
        Effect.onError(() =>
          Effect.gen(function* () {
            // A failed or interrupted collector cannot retain a lease indefinitely.
            // Source-check finalizers settle before runtime handoff is released.
            if (collectionToken !== undefined) yield* deps.releaseDelivery(collectionToken)
          })
        )
      )
    })
)
const candidateRouteKinds: ReadonlySet<string> = new Set([
  "ignoreCandidate",
  "releaseCandidate",
  "retireCandidate",
  "continueCandidate",
  "retainCandidate"
])
const isCandidateRoute = (kind: unknown): kind is CandidateRoute =>
  typeof kind === "string" && candidateRouteKinds.has(kind)
const residentCandidateRoute = Effect.fn("ResidentRuntime.candidateRoute")(function* (
  deps: Dependencies,
  event: Extract<
    CanonicalEvent,
    { readonly kind: "validationRouteCheck" | "postValidationCheck" | "finalCandidateCheck" }
  >
) {
  const result = yield* deps.residentLedger.transition(event)
  const kind = result.outputs[0]?.kind
  if (result.rejection !== undefined || result.outputs.length !== 1 || !isCandidateRoute(kind)) {
    throw new Error("invalid canonical candidate route")
  }
  return kind
})
export const makeResidentAdviceCollection = (deps: Dependencies) => {
  return {
    residentCollect: residentCollect.bind(null, deps),
    residentReleaseAdviceLease: residentReleaseAdviceLease.bind(null, deps),
    residentPendingCanonicalFindings: residentPendingCanonicalFindings.bind(null, deps),
    residentAdviceExpired: residentAdviceExpired.bind(null, deps),
    residentCandidateRoute: residentCandidateRoute.bind(null, deps)
  }
}
