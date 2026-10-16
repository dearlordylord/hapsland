import type { makeResidentInspection } from "../inspection/observer.ts"
import { type DirectObservation, type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type { captureInspectionFate } from "@hapsland/review-execution/inspection/capture"
import { collectionOrdering } from "./collection-decisions.ts"
import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import type { Advice, AdviceContent } from "../state/advice-records.ts"
import { type WorkRevision } from "../state/revision.ts"
import * as Effect from "effect/Effect"
import { randomUUID } from "node:crypto"
import collectionCore, {
  type Command,
  type Response,
  type FlowStep,
  type FlowCommand,
  type FlowResponse,
  type Disposition
} from "./collection-core.js"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
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
type CollectionHandoffFacts = {
  readonly delivery: AdviceContent["delivery"]
  readonly ownerCurrent: boolean
  readonly generationValid: boolean
}
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
const residentClaudeCollectionSurface = (
  advicee: DirectAdvicee,
  mode: CollectionMode,
  authority: ResponseAuthority | undefined,
  composed: boolean
): "stop" | undefined =>
  composed && authority === undefined && advicee.host === "claude-code" && mode === "turn-end" ? "stop" : undefined
const residentCollectionSameScope = (frame: CollectionFrame, advice: Advice): boolean =>
  frame.composed
    ? recipientPartition(advice.observation.advicee) === frame.partition
    : advice.partition === frame.partition
const residentCollectionCandidateResult = (
  deps: Dependencies,
  result: Effect.Success<ReturnType<typeof deps.residentLedger.transition>>
): boolean => {
  if (result.rejection !== undefined) throw new Error("canonical advice candidate refused")
  const kind = result.outputs[0]?.kind
  if (kind !== "collectionCandidate" && kind !== "collectionSkip") throw new Error("invalid canonical advice candidate")
  return kind === "collectionCandidate"
}
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
type CollectionStream = (
  | {
      readonly kind: "fresh"
      readonly iterator: Iterator<{ readonly capability: Advice; readonly content: AdviceContent }>
    }
  | { readonly kind: "retained"; readonly iterator: Iterator<Advice> }
  | { readonly kind: "findings"; readonly iterator: Iterator<Finding>; readonly partition: string }
) & { closed: boolean }
const collectionHandle = <Value>(values: readonly Value[], handle: number): Value => {
  const value = values[handle]
  if (value === undefined) throw new Error("invalid native collection capability")
  return value
}
const collectionDispositions: Record<CandidateRoute, Disposition> = {
  retainCandidate: { $: "Retain" },
  retireCandidate: { $: "Retire" },
  releaseCandidate: { $: "ReleaseCandidate" },
  ignoreCandidate: { $: "Other" },
  continueCandidate: { $: "Other" }
}
const residentCollectFlow = Effect.fn("ResidentRuntime.collectFlow")(function* (
  deps: Dependencies,
  root: string,
  advicee: DirectAdvicee,
  dispatch: ResidentDispatchContext,
  mode: CollectionMode,
  authority: ResponseAuthority | undefined,
  composed: boolean,
  onToken: (token: string) => void
) {
  const advice: Advice[] = [],
    findings: Finding[] = [],
    contents: AdviceContent[] = [],
    tokens: string[] = []
  const adviceHandles = new Map<Advice, number>(),
    streams: CollectionStream[] = []
  const adviceHandle = (value: Advice): number => {
    const existing = adviceHandles.get(value)
    if (existing !== undefined) return existing
    const handle = advice.push(value) - 1
    adviceHandles.set(value, handle)
    return handle
  }
  const close = (stream: CollectionStream) => {
    if (!stream.closed) {
      stream.closed = true
      stream.iterator.return?.()
    }
  }
  let frame: CollectionFrame | undefined
  let captured: Pick<CollectionFrame, "partition" | "claudeSurface" | "now"> | undefined
  let handoffNow: number | undefined
  const infos: CollectionHandoffFacts[] = []
  const offers: Array<Effect.Success<ReturnType<typeof residentHandoffOffers>>[number]> = []
  const readFrame = (): CollectionFrame => {
    if (frame === undefined) throw new Error("collection frame not captured")
    return frame
  }
  const readCaptured = () => {
    if (captured === undefined) throw new Error("initial collection observations not captured")
    return captured
  }
  const readHandoffNow = () => {
    if (handoffNow === undefined) throw new Error("handoff clock not captured")
    return handoffNow
  }
  const native = Effect.fn("ResidentRuntime.collectionPrimitive")(function* (
    command: Command
  ): Effect.fn.Return<Response, ResidentAdapterError> {
    const frame = readFrame()
    switch (command.$) {
      case "AllocateToken": {
        const token = randomUUID()
        onToken(token)
        return { $: "Handle", handle: tokens.push(token) - 1 }
      }
      case "OpenFresh":
        return {
          $: "Handle",
          handle:
            streams.push({
              kind: "fresh",
              iterator: (yield* deps.residentLedger.advice.snapshots())[Symbol.iterator](),
              closed: false
            }) - 1
        }
      case "PullFresh": {
        const stream = collectionHandle(streams, command.stream)
        if (stream.kind !== "fresh") throw new Error("wrong collection snapshot stream")
        const item = stream.iterator.next()
        if (item.done) return { $: "Exhausted" }
        const { capability, content } = item.value
        const same = capability.id === collectionHandle(advice, command.candidate).id
        return {
          $: "Fresh",
          advice: adviceHandle(capability),
          same_id: same,
          unleased: same && content.delivery === undefined
        }
      }
      case "CloseStream":
        close(collectionHandle(streams, command.stream))
        return { $: "Ack" }
      case "Reserve":
        return {
          $: "Truth",
          value: yield* residentReserveAdviceLease(
            deps,
            collectionHandle(advice, command.advice),
            collectionHandle(tokens, command.token)
          )
        }
      case "Barrier":
        yield* residentCollectionBarrier(deps, collectionHandle(advice, command.advice), command.final)
        return { $: "Ack" }
      case "OpenRetained":
        return {
          $: "Handle",
          handle:
            streams.push({
              kind: "retained",
              iterator: (yield* deps.residentAdvice())[Symbol.iterator](),
              closed: false
            }) - 1
        }
      case "PullRetained": {
        const stream = collectionHandle(streams, command.stream)
        if (stream.kind !== "retained") throw new Error("wrong collection identity stream")
        const item = stream.iterator.next()
        if (item.done) return { $: "Exhausted" }
        const expected = collectionHandle(advice, command.advice)
        return { $: "Owner", same_id: item.value.id === expected.id, same_pointer: item.value === expected }
      }
      case "ReadDelivery": {
        const content = yield* deps.residentLedger.advice.current(collectionHandle(advice, command.advice))
        return {
          $: "Content",
          handle: contents.push(content) - 1,
          owned: content.delivery?.token === collectionHandle(tokens, command.token)
        }
      }
      case "CheckWork": {
        const value = collectionHandle(advice, command.advice)
        return { $: "Truth", value: yield* deps.residentIsCurrentWork(value.revision, value.prepared) }
      }
      case "RemoveStale":
        yield* deps.residentRemoveAdvice(
          collectionHandle(advice, command.advice).id,
          collectionHandle(tokens, command.token),
          { fate: "stale", reason: "resident-stale" }
        )
        return { $: "Ack" }
      case "OpenFindings": {
        const values = collectionHandle(contents, command.content).findings
        const partition = recipientPartition(collectionHandle(advice, command.advice).observation.advicee)
        return {
          $: "Handle",
          handle: streams.push({ kind: "findings", iterator: values[Symbol.iterator](), partition, closed: false }) - 1
        }
      }
      case "PullFinding": {
        const stream = collectionHandle(streams, command.stream)
        if (stream.kind !== "findings") throw new Error("wrong collection finding stream")
        const value = stream.iterator.next()
        return value.done ? { $: "Exhausted" } : { $: "Handle", handle: findings.push(value.value) - 1 }
      }
      case "Suppressed": {
        const value = collectionHandle(advice, command.advice)
        const stream = collectionHandle(streams, command.stream)
        if (stream.kind !== "findings") throw new Error("wrong collection suppression stream")
        return {
          $: "Truth",
          value: yield* deps.residentComposedDelivery.suppresses(
            value.id,
            stream.partition,
            collectionHandle(findings, command.finding),
            frame.stopCollector ? "stop" : undefined
          )
        }
      }
      case "ObserveSuppressed":
        deps.residentInspection.observeAdviceFate(
          collectionHandle(advice, command.advice),
          [collectionHandle(findings, command.finding)],
          "suppressed",
          "collection-suppression"
        )
        return { $: "Ack" }
      case "Fit": {
        const value = collectionHandle(advice, command.advice)
        const facts = yield* deps.residentFindingSelectionFacts(
          value,
          frame.partition,
          frame.credentialGeneration,
          deps.residentNow(),
          frame.composed
        )
        let limited = 0
        const fitting = yield* residentSelectCollectionFindings(
          deps,
          frame,
          unlist(command.retained).map((id) => collectionHandle(findings, id)),
          unlist(command.candidates).map((id) => collectionHandle(findings, id)),
          facts,
          () => {
            limited++
          }
        )
        return { $: "Fitting", findings: list(fitting.map((finding) => findings.push(finding) - 1)), limited }
      }
      case "RecordLimited":
        yield* deps.residentRecordOperationalFailure(
          collectionHandle(advice, command.advice).observation,
          "output-limit"
        )
        return { $: "Ack" }
      case "PostCheck":
        return {
          $: "Route",
          disposition:
            collectionDispositions[
              yield* residentCandidateRoute(deps, {
                kind: "postValidationCheck",
                workAccepted: true,
                expired: false,
                hasFitting: command.has_fitting
              })
            ]
        }
      case "Remove":
        yield* deps.residentRemoveAdvice(
          collectionHandle(advice, command.advice).id,
          collectionHandle(tokens, command.token)
        )
        return { $: "Ack" }
      case "Release":
        yield* residentReleaseAdviceLease(deps, collectionHandle(advice, command.advice))
        return { $: "Ack" }
      case "Update":
        yield* deps.residentLedger.advice.updateDelivery(
          collectionHandle(advice, command.advice),
          collectionHandle(tokens, command.token),
          { findings: unlist(command.findings).map((id) => collectionHandle(findings, id)) }
        )
        return { $: "Ack" }
      default: {
        const exhaustive: never = command
        throw new Error(`unknown collection command: ${exhaustive}`)
      }
    }
  })
  const readyNative = Effect.fn("ResidentRuntime.collectionFlowPrimitive")(function* (
    command: FlowCommand,
    frame: CollectionFrame
  ): Effect.fn.Return<FlowResponse, ResidentAdapterError> {
    switch (command.$) {
      case "CExpirePending":
        yield* deps.residentExpirePending(frame.now)
        return { $: "RAck" }
      case "CPruneNotices":
        yield* deps.residentPruneNoticeCooldowns(frame.now)
        return { $: "RAck" }
      case "CCaptureCredential":
        return { $: "RAck" }
      case "COpenAdvice": {
        const values = yield* deps.residentAdvice()
        return {
          $: "RHandle",
          handle:
            streams.push({
              kind: "retained",
              iterator: (command.copy ? [...values] : values)[Symbol.iterator](),
              closed: false
            }) - 1
        }
      }
      case "CPullAdvice": {
        const stream = collectionHandle(streams, command.stream)
        if (stream.kind !== "retained") throw new Error("wrong collection advice stream")
        const value = stream.iterator.next()
        return value.done ? { $: "RExhausted" } : { $: "RAdvice", advice: adviceHandle(value.value) }
      }
      case "COpenSnapshots":
        return {
          $: "RHandle",
          handle:
            streams.push({
              kind: "fresh",
              iterator: (yield* deps.residentLedger.advice.snapshots())[Symbol.iterator](),
              closed: false
            }) - 1
        }
      case "CPullSnapshot": {
        const stream = collectionHandle(streams, command.stream)
        if (stream.kind !== "fresh") throw new Error("wrong collection content stream")
        const value = stream.iterator.next()
        if (value.done) return { $: "RExhausted" }
        return {
          $: "RSnapshot",
          advice: adviceHandle(value.value.capability),
          content: contents.push(value.value.content) - 1,
          leased: value.value.content.delivery !== undefined
        }
      }
      case "CCheckCredential": {
        const value = collectionHandle(advice, command.advice)
        const result = yield* deps.residentLedger.transition({
          kind: "collectionCredentialCheck",
          sameScope: residentCollectionSameScope(frame, value),
          generationValid: value.credentialGeneration === frame.credentialGeneration
        })
        if (result.rejection !== undefined) throw new Error("canonical credential check refused")
        const kind = result.outputs[0]?.kind
        if (kind !== "collectionRetainCredential" && kind !== "collectionRetireCredential")
          throw new Error("invalid canonical credential decision")
        return { $: "RTruth", value: kind === "collectionRetainCredential" }
      }
      case "CRemoveCredential":
        yield* deps.residentRemoveAdvice(collectionHandle(advice, command.advice).id, undefined, {
          fate: "discarded",
          reason: "credential-invalid"
        })
        return { $: "RAck" }
      case "CCheckLease": {
        const value = collectionHandle(advice, command.advice)
        yield* residentCheckAdviceLease(
          deps,
          value,
          frame.now,
          frame.stopCollector,
          recipientPartition(value.observation.advicee) === frame.partition
        )
        return { $: "RAck" }
      }
      case "CCandidateFacts": {
        const value = collectionHandle(advice, command.advice)
        return {
          $: "RCandidate",
          same_scope: residentCollectionSameScope(frame, value),
          unleased: collectionHandle(contents, command.content).delivery === undefined,
          authority: frame.authority === undefined || frame.authority.partition === value.partition
        }
      }
      case "CCandidateCheck":
        return {
          $: "RTruth",
          value: residentCollectionCandidateResult(
            deps,
            yield* deps.residentLedger.transition({
              kind: "collectionCandidateCheck",
              samePartition: command.same_scope,
              unleased: command.unleased,
              hasUnsuppressed: command.unsuppressed,
              authorityOwns: command.authority
            })
          )
        }
      case "CSetEligibility": {
        const value = collectionHandle(advice, command.advice)
        yield* deps.residentLedger.advice.eligible(value, yield* deps.residentJoined.hasAdmission(value.admissionId))
        return { $: "RAck" }
      }
      case "CReadEligibility":
        return {
          $: "RTruth",
          value: (yield* deps.residentLedger.advice.current(collectionHandle(advice, command.advice)))
            .collectionEligible
        }
      case "CCompare":
        return {
          $: "RTruth",
          value:
            (yield* residentCollectionOrder(
              deps,
              collectionHandle(advice, command.left),
              collectionHandle(advice, command.right)
            )) > 0
        }
      case "CPrimitive":
        return { $: "RPrimitive", response: yield* native(command.command) }
      case "CHandoffClock":
        handoffNow = deps.residentNow()
        return { $: "RAck" }
      case "CPullOwner": {
        const stream = collectionHandle(streams, command.stream)
        if (stream.kind !== "retained") throw new Error("wrong handoff owner stream")
        const value = stream.iterator.next()
        return value.done
          ? { $: "RExhausted" }
          : {
              $: "ROwner",
              advice: adviceHandle(value.value),
              same_id: value.value.id === collectionHandle(advice, command.advice).id
            }
      }
      case "CHandoffInfo": {
        const value = collectionHandle(advice, command.advice)
        const retained = command.retained.$ === "Some" ? collectionHandle(advice, command.retained.value) : undefined
        const delivery =
          retained === undefined ? undefined : (yield* deps.residentLedger.advice.current(retained)).delivery
        const ownerCurrent = retained === value && delivery?.token === collectionHandle(tokens, command.token)
        const generationValid = value.credentialGeneration === frame.credentialGeneration
        return {
          $: "RInfo",
          handle: infos.push({ delivery, ownerCurrent, generationValid }) - 1,
          owner: ownerCurrent,
          generation: generationValid,
          has_delivery: delivery !== undefined
        }
      }
      case "CCredentialMetadata":
        return {
          $: "RCredentialMetadata",
          absent: frame.dispatch.credential === null,
          environment_only:
            frame.authority?.credentialEnvironmentOnly ??
            collectionHandle(advice, command.advice).credentialEnvironmentOnly
        }
      case "CReadCredential": {
        const credential = frame.dispatch.credential
        if (credential === undefined) throw new TypeError("Cannot read properties of undefined (reading 'statePath')")
        if (credential === null) throw new Error("credential observation without a credential capability")
        const state = readCredentialState(credential.statePath)
        return {
          $: "RCredentialState",
          present: state !== undefined,
          generation: state?.generation === frame.credentialGeneration,
          suspended: !!state?.savedUseSuspended
        }
      }
      case "CCheckExpiry":
        return {
          $: "RTruth",
          value: yield* residentAdviceExpired(deps, collectionHandle(advice, command.advice), readHandoffNow())
        }
      case "CFinalRoute": {
        const facts = collectionHandle(infos, command.info)
        return {
          $: "RRoute",
          disposition:
            collectionDispositions[
              yield* residentCandidateRoute(deps, {
                kind: "finalCandidateCheck",
                ownerCurrent: facts.ownerCurrent,
                credentialGeneration: facts.generationValid,
                credentialAuthorized: command.credential_authorized,
                expired: command.expired,
                workCurrent: command.current,
                hasFindings: facts.delivery !== undefined && facts.delivery.findings.length > 0
              })
            ]
        }
      }
      case "CRenew":
        yield* deps.residentLedger.advice.updateDelivery(
          collectionHandle(advice, command.advice),
          collectionHandle(tokens, command.token),
          { leaseUntil: readHandoffNow() + DELIVERY_LEASE_MS }
        )
        return { $: "RAck" }
      case "CHandoffOffers": {
        const values = yield* residentHandoffOffers(
          deps,
          frame,
          collectionHandle(advice, command.advice),
          readHandoffNow()
        )
        return { $: "RItems", items: list(values.map((value) => offers.push(value) - 1)) }
      }
      case "CFitHandoff": {
        const ids = unlist(command.offers)
        const limited: number[] = []
        const selected = yield* selectFittingCurrentFindingIndices(
          ids.map((id) => collectionHandle(offers, id)),
          residentCollectionSurface(frame),
          (index) => {
            limited.push(index)
          },
          deps.residentCollectionFindingOffer
        )
        return {
          $: "RFitting",
          selected: list(selected),
          limited: list(limited.map((index) => collectionHandle(ids, index)))
        }
      }
      case "CHandoffLimited":
        yield* deps.residentRecordOperationalFailure(
          collectionHandle(offers, command.offer).advice.observation,
          "output-limit",
          readHandoffNow()
        )
        return { $: "RAck" }
      case "CDeliveryFindings": {
        const { delivery } = yield* deps.residentLedger.advice.current(collectionHandle(advice, command.advice))
        return {
          $: "RFindings",
          owned: delivery !== undefined,
          findings: list((delivery?.findings ?? []).map((finding) => findings.push(finding) - 1))
        }
      }
      case "CResponseContent":
        return {
          $: "RHandle",
          handle: contents.push(yield* deps.residentLedger.advice.current(collectionHandle(advice, command.advice))) - 1
        }
      case "CResponseFindings": {
        const value = collectionHandle(advice, command.advice)
        return {
          $: "RItems",
          items: list(
            (collectionHandle(contents, command.content).delivery?.findings ?? []).map(
              (finding) => findings.push(findingAtDeliveryRoot(finding, value.observation.root, frame.callerRoot)) - 1
            )
          )
        }
      }
      case "CCaptureFrame":
      case "CReadDeciding":
      case "CSetStop":
        throw new Error("collection frame command after capture")
      default: {
        const exhaustive: never = command
        throw new Error(`unknown collection flow command: ${exhaustive}`)
      }
    }
  })
  const flowNative = Effect.fn("ResidentRuntime.collectionObservation")(function* (
    command: FlowCommand
  ): Effect.fn.Return<FlowResponse, ResidentAdapterError> {
    switch (command.$) {
      case "CCaptureFrame": {
        const partition = recipientPartition(advicee)
        const claudeSurface = residentClaudeCollectionSurface(advicee, mode, authority, composed)
        captured = { partition, claudeSurface, now: deps.residentNow() }
        return { $: "RAck" }
      }
      case "CReadDeciding":
        return { $: "RTruth", value: yield* deps.residentComposedDelivery.isDeciding(readCaptured().partition) }
      case "CSetStop":
        frame = {
          ...readCaptured(),
          callerRoot: dispatch.deliveryCwd ?? root,
          dispatch,
          composed,
          authority,
          stopCollector: command.value,
          credentialGeneration: null
        }
        return { $: "RAck" }
      case "CCaptureCredential":
        frame = { ...readFrame(), credentialGeneration: dispatch.credential?.generation ?? null }
        return { $: "RAck" }
      default:
        return yield* readyNative(command, readFrame())
    }
  })
  let step: FlowStep = collectionCore.collect_initial(1, composed, mode === "turn-end")
  const advance = Effect.fn("ResidentRuntime.advanceCollection")(function* () {
    if (step.$ !== "FlowAwait") throw new Error("collection cursor has no request")
    const { request } = step
    const response = yield* flowNative(request.command)
    step = collectionCore.collect_resume(step, {
      $: "FlowReply",
      invocation: request.invocation,
      id: request.id,
      response
    })
  })
  return yield* Effect.gen(function* () {
    while (step.$ === "FlowAwait") {
      if (collectionCore.collect_atomic(step)) {
        yield* Effect.gen(function* () {
          while (step.$ === "FlowAwait" && collectionCore.collect_atomic(step)) yield* advance()
        }).pipe(Effect.uninterruptible)
      } else yield* advance()
    }
    if (step.$ === "FlowEmpty") return residentResponse({ status: "empty" })
    if (step.$ !== "FlowDone") throw new Error("Bend collection protocol refused")
    return residentCollectionResponse(
      readFrame(),
      collectionHandle(tokens, step.token),
      unlist(step.findings).map((id) => collectionHandle(findings, id))
    )
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        for (const stream of streams) close(stream)
      })
    )
  )
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
        return yield* residentCollectFlow(deps, root, advicee, dispatch, mode, authority, composed, (token) => {
          collectionToken = token
        })
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
