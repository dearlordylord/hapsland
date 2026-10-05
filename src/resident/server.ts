import { makeInspectionSubmissionRecorder } from "../inspection/submission-recorder.ts"
import type { InspectionSubmissionObservation } from "../inspection/writer.ts"
import { InspectionTransportObservation } from "../inspection/transport.ts"
import { captureInspectionPolicy, captureInspectionFindings, captureInspectionFate } from "../inspection/capture.ts"
import type { InspectionScope, InspectionCorrelation } from "../inspection/contract.ts"
import { makeInspectionRecorder, type InspectionPersistence } from "../inspection/recorder.ts"
import { makeInspectionStorage } from "../inspection/storage.ts"
import { readInspectionSettings } from "../inspection/settings.ts"
import { HAPSLAND_STATE_DIRECTORY } from "../runtime/user-paths.ts"
import { toCodexDirectEventOutput, type Finding } from "../direct-event/output.ts"
import { ResidentDispatchControls, dispatchControlsLayer } from "./dispatch-controls.ts"
import { ResidentReviewControls, reviewControlsLayer } from "./review-controls.ts"
import { makeSocketFramePort, type SocketFramePort } from "./socket-frame.ts"
import { ResidentPreparationControls, preparationControlsLayer } from "./preparation-controls.ts"
import { captureWorkspaceBytes, analysisWorkspaceBytes } from "./preparation-workspace.ts"
import { makeResidentRuntimeConfiguration } from "./runtime-configuration.ts"
import type { Advice, AdviceContent } from "./advice-records.ts"
import type { PendingNoticeSnapshot as PendingNotice } from "./notice-records.ts"
import type { RoundWork, WorkCohort } from "./round-records.ts"
import type { JoinedReview, JoinedReviewOutcome } from "./joined-reviews.ts"
import { workSubject, type WorkRevision } from "./revision.ts"
import { recordAnalytics, type AnalyticsKind } from "../activity/analytics.ts"
import {
  effectiveSessionAnalytics,
  effectiveEditPermitLimits,
  effectiveVirtualRoundQuietMs,
  effectiveReviewBackend
} from "../configuration/resolve.ts"
import { recordRoundClosure, type RoundCloseReason, recordActivity } from "../activity/status.ts"
import { monotonicNow } from "./hook-clock.ts"
import * as Clock from "effect/Clock"
import * as Config from "effect/Config"
import * as Option from "effect/Option"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Deferred from "effect/Deferred"

import * as Schema from "effect/Schema"
import type * as HttpClient from "effect/http/HttpClient"
import { createHash, randomUUID } from "node:crypto"
import { appendFileSync, statSync, writeFileSync } from "node:fs"
import { access, appendFile, chmod, rm, writeFile } from "node:fs/promises"
import { createServer, type Server, type Socket } from "node:net"
import { join, resolve } from "node:path"
import {
  canonicalValue,
  isCodexHostVersion,
  type DirectObservation,
  type DirectAdvicee,
  type PreparedUnit
} from "../direct-event/model.ts"
import {
  evaluatePrepared,
  encodedPreparedProviderInputBytes,
  prepareObservation,
  preparedUnitStillCurrent,
  revalidateEvaluations,
  type EvaluatedUnit,
  type PreparedObservation,
  type DirectReviewContext,
  type RevalidationResult
} from "../direct-event/pipeline.ts"
import { verifyObservationRoot } from "../direct-event/adapter.ts"
import { captureStable } from "../direct-event/capture.ts"
import { resolvedDirectFilePolicy, selectedByDirectFilePolicy } from "../direct-event/selection.ts"
import { admitReview } from "../configuration/decision.ts"
import { reviewDecisionModelLayer } from "../review-providers/live.ts"
import { providerIdentity } from "../review-providers/catalog.ts"
import { loadReviewSettings } from "../runtime/review-config.ts"
import { loadConfiguration } from "../configuration/load.ts"
import { readCurrentClaudeFeedbackAuthority } from "../configuration/current-claude-authority.ts"
import {
  controlledDecisionModelLayer,
  type ControlledDecisionModelOptions
} from "../test-support/controlled-decision-model.ts"
import { prepareResidentDirectory, resolveResidentPaths, verifyRemovableSocket, type ResidentPaths } from "./paths.ts"
import {
  DELIVERY_LEASE_MS,
  EDIT_REQUEST_DEADLINE_MS,
  MAX_IPC_CONNECTIONS,
  MAX_IPC_FRAME_BYTES,
  decodeCurrentResidentRequest,
  encodeCurrentResidentResponse,
  type ResidentDispatchContext,
  type ResidentRequest,
  type ResidentResponse,
  type ResidentUnavailableReason
} from "./protocol.ts"
import { makeResidentState, type CapacityLedger, type CapacityReservation } from "./capacity.ts"
import { makeDispatcher, type Dispatcher } from "./dispatch.ts"
import { Context, Exit, Layer, Ref, Scope } from "effect"
import * as Fiber from "effect/Fiber"
import * as FiberHandle from "effect/FiberHandle"
import * as Schedule from "effect/Schedule"
import type { ComposedDelivery } from "./composed-delivery.ts"
import type { CanonicalCommand, CanonicalEvent } from "../canonical/adapter.ts"
import {
  PENDING_ADVICE_EXPIRY_MS,
  combinedClaudeOutput,
  combinedReviewOutput,
  encodedClaudeStopOutputBytes,
  selectFittingClaudeStopFindings,
  selectFittingFindings,
  selectFittingCurrentFindingIndices,
  selectFittingClaudeFindings,
  type ClaudeOutputMode,
  type CollectionMode,
  type FindingSelectionFacts,
  type CanonicalFindingOffer,
  type OperationalNoticeKind
} from "./collection.ts"
import { residentEvaluationIdentity } from "./evaluation-reuse.ts"
import { readCredentialState, resolveCredential, type CredentialResolution } from "../credentials/secret-service.ts"
import { claimDemoBudget } from "../onboarding/demo-budget.ts"
import { findingFromProbability } from "../rules/decision.ts"
import { recordDemoTrace } from "../onboarding/demo-trace.ts"

class ResidentAdapterError extends Schema.TaggedError<ResidentAdapterError>()("ResidentAdapterError", {
  operation: Schema.String
}) {}
const residentResponse = (response: ResidentResponse): ResidentResponse => response
const residentAdapter = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => new ResidentAdapterError({ operation }) })
// Cancellation requests native abort, then waits for physical completion before
// the caller can settle its canonical request and release the running permit.
const physicalRequest = (operation: string, run: (signal: AbortSignal) => Promise<void>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const controller = new AbortController()
      const completion = Promise.resolve().then(() => run(controller.signal))
      return { controller, completion }
    }),
    ({ completion }) => residentAdapter(operation, () => completion),
    ({ controller, completion }) =>
      Effect.gen(function* () {
        controller.abort()
        yield* residentAdapter(operation, () => completion).pipe(Effect.exit, Effect.asVoid)
      })
  )
const workInvalidated = (signal: AbortSignal) =>
  Effect.callback<never, ResidentAdapterError>((resume) => {
    const abort = () => resume(Effect.fail(new ResidentAdapterError({ operation: "work invalidated" })))
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener("abort", abort, { once: true })
    return Effect.sync(() => signal.removeEventListener("abort", abort))
  })
const withinWork = <A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal) =>
  effect.pipe(Effect.raceFirst(workInvalidated(signal)), Effect.interruptible)

const RESERVATION_OVERHEAD_BYTES = 1024
const MAX_PROBABILITY_ENCODING_BYTES = 24
const RESIDENT_IDLE_CHECK_MS = 20_000
const VIRTUAL_ROUND_QUIET_CHECK_MS = 20_000
export const OPERATIONAL_NOTICE_COOLDOWN_MS = 60_000
export const MAX_OPERATIONAL_NOTICE_KEYS = 64

const ResidentControlledOptions = Schema.Struct({
  answers: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Union([
        Schema.Struct({ _tag: Schema.Literal("Probability"), probability: Schema.Number }),
        Schema.Struct({
          _tag: Schema.Literal("Classify"),
          label: Schema.String,
          probabilities: Schema.Record(Schema.String, Schema.Number),
          confidence: Schema.optionalKey(Schema.Number)
        }),
        Schema.Struct({
          _tag: Schema.Literal("Rate"),
          rating: Schema.Number,
          probabilities: Schema.Record(Schema.String, Schema.Number),
          confidence: Schema.optionalKey(Schema.Number)
        })
      ])
    )
  ),
  delayMs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  failure: Schema.optionalKey(Schema.String),
  failureOnSourceIncludes: Schema.optionalKey(Schema.String),
  findingOnSourceIncludes: Schema.optionalKey(Schema.String),
  capturePath: Schema.optionalKey(Schema.String),
  requestSummaryPath: Schema.optionalKey(Schema.String),
  outcomePath: Schema.optionalKey(Schema.String),
  requireCredential: Schema.optionalKey(Schema.Boolean),
  syntheticR6BrandedRepair: Schema.optionalKey(Schema.Literals(["control", "finding"]))
})

type IngressJob = {
  readonly inspectionReceipt?: InspectionReceipt
  readonly canonicalRound: number
  readonly round?: RoundWork
  readonly work?: WorkCohort
  completed?: boolean
  readonly kind: "ingress"
  readonly workObservationId?: number
  readonly canonicalObservationId: number
  readonly observation: DirectObservation
  readonly partition: string
  readonly reservation: CapacityReservation
  readonly dispatch: ResidentDispatchContext
  analyticsEnabled?: boolean
  analyticsDiscardReported?: boolean
}

type ResponseAuthority = {
  readonly lifetime: string
  readonly partition: string
  readonly root: string
  readonly advicee: DirectAdvicee
  readonly userConfigPath: string | null
  readonly claudeFeedbackMode: ClaudeOutputMode
  readonly credentialGeneration: number | null
  readonly credentialStatePath: string | null
  readonly credentialRequired: boolean
  readonly credentialEnvironmentOnly: boolean
  readonly expiresAt: number
  readonly round: RoundWork | undefined
}
type EditRequest = Extract<ResidentRequest, { operation: "admit-and-collect" }>
type EditCollectionRequest = {
  readonly requestRoute: "edit"
  readonly operation: "collect"
  readonly lifetime: string
  readonly root: string
  readonly advicee: DirectAdvicee
  readonly dispatch: ResidentDispatchContext
  readonly composed: true
  readonly mode: "ordinary"
}
type HandoffRequest = ResidentRequest | EditCollectionRequest
type ResponseContext = { readonly authority?: ResponseAuthority; readonly token?: string }

type InspectionReceipt = { readonly scope: InspectionScope; readonly correlation: InspectionCorrelation }

type UnitJob = {
  readonly inspectionEvaluationId?: string
  readonly inspectionReceipt?: InspectionReceipt
  readonly canonicalRound: number
  readonly round?: RoundWork
  readonly work?: WorkCohort
  completed?: boolean
  released?: boolean
  requestId?: number
  requestStarted?: boolean
  readonly kind: "unit"
  readonly workUnitId?: number
  /** The canonical observation admitted before source preparation began. */
  readonly admissionId: number
  readonly canonicalOperationId: number
  readonly observation: DirectObservation
  readonly partition: string
  readonly reservation: CapacityReservation
  readonly dispatch: ResidentDispatchContext
  analyticsEnabled?: boolean
  analyticsDiscardReported?: boolean
  readonly prepared: PreparedUnit
  readonly sourceHash?: string
  revision: WorkRevision
  readonly evaluationKey: string
}

type Job = IngressJob | UnitJob

export type JevRequestObservation = {
  readonly stage: "issued" | "unavailable" | "started" | "interrupted" | "settled"
  readonly partition: string
  readonly canonicalPartition: number
  readonly lifetime: string
  readonly canonicalLifetime: number
  readonly round: number
  readonly hapslandRound: number | null
  readonly operation: number
  readonly request?: number
  readonly outcome?: "neverSent" | "finding" | "clear" | "backendFailure" | "timeout" | "interrupted"
}

type DispatchAuthorityCredentialStatus = CredentialResolution["status"] | "not-checked" | "not-required"

type DispatchAuthorityObservation = {
  readonly kind: "dispatchAuthority"
  readonly sequence: number
  readonly evaluationId: string
  readonly path: string
  readonly decision: "allow" | "deny"
  readonly reason: string
  readonly policyDigest: string
  readonly selected: boolean | null
  readonly admission: ReturnType<typeof admitReview>
  readonly physicalRootVerified: boolean | null
  readonly expectedRootIdentitySha256: string
  readonly credentialStatus: DispatchAuthorityCredentialStatus
  readonly credentialGeneration: number | null
}

type DispatchAuthorityObservationDetails = {
  readonly decision: DispatchAuthorityObservation["decision"]
  readonly reason: string
  readonly policyDigest: string
  readonly selected: boolean | null
  readonly admission: ReturnType<typeof admitReview>
  readonly physicalRootVerified: boolean | null
  readonly credentialStatus: DispatchAuthorityCredentialStatus
  readonly credentialGeneration: number | null
}

/** Stable identity of the agent receiving advice, across edits and virtual rounds. */
const adviceePartition = (root: string, advicee: DirectAdvicee) =>
  canonicalValue({
    root,
    host: advicee.host,
    hostVersion: advicee.hostVersion,
    sessionId: advicee.sessionId,
    subagentId: advicee.subagentId
  })

const reservedRevision = (partition: string, prepared: PreparedUnit): WorkRevision => ({
  subject: workSubject(partition, prepared),
  token: "00000000-0000-0000-0000-000000000000",
  generation: Number.MAX_SAFE_INTEGER
})

const worstCaseFindings = (prepared: PreparedUnit): ReadonlyArray<Finding> =>
  prepared.input.rules.flatMap((rule) =>
    findingFromProbability(1, rule.threshold)
      ? [
          {
            path: prepared.input.path,
            declaration: prepared.input.declaration.name,
            ruleId: rule.id,
            probability: 1,
            message: rule.message,
            semanticIdentity: prepared.identity
          }
        ]
      : []
  )

export const residentUnitWorstOutcomeBytes = (prepared: PreparedUnit): number => {
  const findings = worstCaseFindings(prepared)
  return (
    logicalBytes({ findings, output: toCodexDirectEventOutput(findings) }) +
    findings.length * MAX_PROBABILITY_ENCODING_BYTES
  )
}

const logicalBytes = (value: unknown): number => Buffer.byteLength(canonicalValue(value), "utf8")

const exactHostVersions = { "claude-code": "2.1.218", pi: "1.0.0", opencode: "1.14.44" } as const
const supportedAdviceeVersion = (advicee: DirectAdvicee): boolean =>
  advicee.host === "codex-cli"
    ? isCodexHostVersion(advicee.hostVersion)
    : advicee.hostVersion === exactHostVersions[advicee.host]
const addressableAdvicee = (advicee: DirectAdvicee): boolean =>
  supportedAdviceeVersion(advicee) &&
  advicee.sessionId.length > 0 &&
  advicee.toolUseId.length > 0 &&
  (advicee.host !== "codex-cli" || advicee.turnId.length > 0)

const withoutDeliveredFindings = (
  findings: ReadonlyArray<Finding>,
  delivered: ReadonlyArray<Finding>
): ReadonlyArray<Finding> => {
  const counts = new Map<string, number>()
  for (const finding of delivered) {
    const key = canonicalValue(finding)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return findings.filter((finding) => {
    const key = canonicalValue(finding)
    const count = counts.get(key) ?? 0
    if (count === 0) return true
    if (count === 1) counts.delete(key)
    else counts.set(key, count - 1)
    return false
  })
}

/** Exact retained logical charge, including complete input and promised outcome. */
export const residentUnitReservationBytes = (
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  prepared: PreparedUnit
): number => {
  const findings = worstCaseFindings(prepared)
  const partition = adviceePartition(observation.root, observation.advicee)
  const evaluationKey = residentEvaluationIdentity(partition, prepared)
  const revision = reservedRevision(partition, prepared)
  const currentWork = {
    subject: revision.subject,
    token: revision.token,
    generation: revision.generation,
    input: prepared.input,
    members: 1
  }
  const unitBytes = logicalBytes({
    kind: "unit",
    observation,
    partition,
    dispatch,
    prepared,
    revision,
    evaluationKey,
    currentWork
  })
  const adviceBytes =
    logicalBytes({
      observation,
      partition,
      prepared,
      revision,
      evaluationKey,
      evaluations: [{ prepared, findings }],
      findings,
      encodedBytes: logicalBytes(toCodexDirectEventOutput(findings)),
      currentWork
    }) +
    findings.length * MAX_PROBABILITY_ENCODING_BYTES
  return Math.max(unitBytes, adviceBytes) + RESERVATION_OVERHEAD_BYTES
}

const decodeControlledOptions = (
  value: ResidentDispatchContext["controlled"]
): ControlledDecisionModelOptions | undefined => {
  if (value === null) return undefined
  try {
    return Schema.decodeUnknownSync(ResidentControlledOptions, { onExcessProperty: "error" })(value)
  } catch {
    return undefined
  }
}

export type ResidentRuntimeOptions = {
  /** Local persistence failure seam; never supplied by IPC. Production uses the private per-user journal. */
  readonly inspectionPersistence?: InspectionPersistence

  /** Scoped local review coordination; never supplied by resident IPC. */
  readonly reviewControls?: Layer.Layer<ResidentReviewControls>
  /** Fixture-only source effect; never supplied by resident IPC. */
  readonly captureSource?: DirectReviewContext["captureSource"]
  /** Scoped local preparation coordination; never supplied by resident IPC. */
  readonly preparationControls?: Layer.Layer<ResidentPreparationControls>
  readonly dispatchControls?: Layer.Layer<ResidentDispatchControls>
  /** Fixture-only authority observation; never supplied by resident IPC. */
  readonly dispatchAuthorityObserver?: (observation: DispatchAuthorityObservation) => void
  /** Fixture-only source-free command/effect witness. */
  readonly jevRequestObserver?: (observation: JevRequestObservation) => void
  readonly maximumOperationalNoticeKeys?: number
  /** Fixture-only HTTP transport; never supplied by resident IPC. */
  readonly offlineHttpClient?: HttpClient.HttpClient
  /** Fixture-only gate entered by the controlled DecisionModel call. */
  readonly controlledRequestEffect?: (signal: AbortSignal) => Promise<void>
}

const validOperationalNoticeKeys = (count: number): boolean =>
  Number.isSafeInteger(count) && count >= 1 && count <= MAX_OPERATIONAL_NOTICE_KEYS
const validatedOperationalNoticeKeys = (requested: number | undefined): number => {
  const count = requested ?? MAX_OPERATIONAL_NOTICE_KEYS
  if (!validOperationalNoticeKeys(count))
    throw new RangeError(`maximumOperationalNoticeKeys must be an integer from 1 to ${MAX_OPERATIONAL_NOTICE_KEYS}`)
  return count
}

/** Effect operations consumed by the process and protocol services. */
export interface ResidentRuntimeOperations {
  readonly lifetime: string
  readonly paths: ResidentPaths
  readonly listen: () => Effect.Effect<void, ResidentAdapterError>
  readonly close: Effect.Effect<void, ResidentAdapterError>
  readonly handle: (request: ResidentRequest) => Effect.Effect<ResidentResponse, ResidentAdapterError>
  readonly stats: () => Effect.Effect<Extract<ResidentResponse, { status: "stats" }>>
  readonly whenIdle: () => Effect.Effect<void>
  readonly whenClosed: Effect.Effect<void>
}

export interface ResidentRuntime {
  readonly inspectionSubmissionObservation: InspectionSubmissionObservation["Service"]
  readonly operations: ResidentRuntimeOperations
  readonly lifetime: string
  readonly paths: ResidentPaths
  stats(): Effect.Effect<Extract<ResidentResponse, { status: "stats" }>>
  cleanup(): Effect.Effect<"busy" | "cleaned">
  admit(
    observation: DirectObservation,
    dispatch: ResidentDispatchContext,
    composed?: boolean,
    requirePermit?: boolean
  ): Effect.Effect<ResidentResponse>
  collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode?: CollectionMode
  ): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>
  collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    authority: undefined,
    composed: true
  ): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>
  collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    authority: ResponseAuthority,
    composed?: boolean
  ): Effect.Effect<ResidentResponse, ResidentAdapterError>
  acknowledge(token: string): Effect.Effect<ResidentResponse>
  finalize(token: string): Effect.Effect<ResidentResponse>
  releaseDelivery(token: string): Effect.Effect<void>
  beginComposedSubmission(token: string, surface: "edit" | "background" | "stop"): Effect.Effect<ResidentResponse>
  releaseComposedSubmission(token: string): Effect.Effect<ResidentResponse>
  whenIdle(): Effect.Effect<void>
  pendingAdviceMetadata(): Effect.Effect<
    ReadonlyArray<{
      readonly id: string
      readonly partition: string
      readonly sequence: number
      readonly pendingAt: number
      readonly collectionEligible: boolean
      readonly retainedBytes: number
      readonly generation: number
      readonly evaluationIdentities: ReadonlyArray<string>
      readonly path: string
      readonly pendingFindings: number
      readonly deliveryFindings: number
      readonly delivery: "available" | "leased-unacknowledged" | "leased-acknowledged"
    }>
  >
  accountingMetrics(): Effect.Effect<{
    readonly peakLedgerBytes: number
    readonly maxMaterializedPreparedUnits: number
    readonly successfulCacheEntries: number
    readonly successfulCacheBytes: number
    readonly pendingEvaluations: number
    readonly operationalNoticeKeys: number
    readonly pendingOperationalNotices: number
    readonly operationalNoticeBytes: number
  }>
  sweepQuietRounds(now?: number): Effect.Effect<number>
  handle(request: ResidentRequest): Effect.Effect<ResidentResponse, ResidentAdapterError>
  listen(): Effect.Effect<void, ResidentAdapterError>
  readonly close: Effect.Effect<void, ResidentAdapterError>
}

export class ResidentRuntimeService extends Context.Service<ResidentRuntimeService, ResidentRuntimeOperations>()(
  "@hapsland/ResidentRuntime"
) {}

export const makeResidentRuntime = Effect.fn("ResidentRuntime.make")(function* (
  paths: ResidentPaths | undefined = undefined,
  now: () => number = monotonicNow,
  options: ResidentRuntimeOptions = {}
) {
  paths ??= yield* resolveResidentPaths()
  const closed = yield* Deferred.make<void>()
  const runtimeConfiguration = yield* makeResidentRuntimeConfiguration().pipe(
    Effect.mapError(() => new ResidentAdapterError({ operation: "resident runtime configuration" }))
  )
  const residentLedger = yield* makeResidentState<UnitJob, string, Job>()
  const lifetime = residentLedger.residentLifetime
  // Optional provenance is bounded independently of review authority and contains no source.
  const inspectionOrigins = new Map<string, string>()
  const inspectionLimits = new Map<string, { readonly retentionMs: number; readonly storageBytes: number }>()
  const inspection = yield* makeInspectionRecorder(
    { endpoint: paths.socket, lifetime },
    options.inspectionPersistence ?? {
      write: (record, encoded, publication) =>
        Effect.suspend(() => {
          const limits = inspectionLimits.get(record.scope.root)
          return limits === undefined
            ? Effect.void
            : makeInspectionStorage(join(HAPSLAND_STATE_DIRECTORY, "inspection"), limits).write(
                record,
                encoded,
                publication
              )
        })
    }
  )
  const inspectionSubmissions = makeInspectionSubmissionRecorder(inspection, { endpoint: paths.socket, lifetime })
  const inspectionObserveAdviceFate = (
    advice: Advice,
    findings: ReadonlyArray<Finding>,
    fate: Parameters<typeof captureInspectionFate>[1],
    reason: Parameters<typeof captureInspectionFate>[2]
  ) => {
    if (!inspection.isEnabled(advice.observation.root)) return
    const evaluationId = inspectionOrigins.get(advice.evaluationKey)
    inspection.offer(
      {
        root: advice.observation.root,
        runtime: advice.observation.advicee.host,
        runtimeVersion: advice.observation.advicee.hostVersion,
        sessionId: advice.observation.advicee.sessionId,
        subagentId: advice.observation.advicee.subagentId
      },
      evaluationId === undefined ? {} : { evaluationId },
      captureInspectionFate(findings, fate, reason, advice.id)
    )
  }
  const inspectionReceive = (observation: DirectObservation, dispatch: ResidentDispatchContext) => {
    const settings = readInspectionSettings(observation.root, dispatch.userConfigPath ?? undefined)
    if (settings && (inspectionLimits.has(observation.root) || inspectionLimits.size < 128))
      inspectionLimits.set(observation.root, settings)
    inspection.observeRecording(
      observation.root,
      inspectionLimits.has(observation.root) ? settings?.enabled : undefined
    )
    const scope = {
      root: observation.root,
      runtime: observation.advicee.host,
      runtimeVersion: observation.advicee.hostVersion,
      sessionId: observation.advicee.sessionId,
      subagentId: observation.advicee.subagentId
    }
    const correlation = { receiptId: randomUUID() }
    inspection.offer(scope, correlation, {
      kind: "edit-received",
      candidates: observation.candidates.map(({ operation, path }) => ({ operation, path }))
    })
    return { scope, correlation }
  }
  const inspectionRefuse = (
    observation: DirectObservation,
    dispatch: ResidentDispatchContext,
    outcome: "unsupported" | "obsolete-lifetime"
  ) => {
    const receipt = inspectionReceive(observation, dispatch)
    inspection.offer(receipt.scope, receipt.correlation, { kind: "edit-admission", outcome })
  }
  const residentJoined = residentLedger.joinedReviews(logicalBytes)
  const residentRuntimeScope = yield* Scope.Scope
  const residentIpcScope = yield* Scope.make()
  yield* Effect.addFinalizer(() => Scope.close(residentIpcScope, Exit.void))
  const residentDispatchScope = yield* Scope.make()
  yield* Effect.addFinalizer(() => Scope.close(residentDispatchScope, Exit.void))
  const residentStopExpiries = new Map<string, Fiber.Fiber<void>>()
  const residentComposedDelivery = residentLedger.delivery((diagnostic) => {
    // Keep diagnostics source-free and bounded even for an indefinitely running resident.
    const path = join(runtime.paths.directory, "repeat-edits.log")
    const line = `${JSON.stringify({ at: Date.now(), ...diagnostic })}\n`
    const limit = 256 * 1024
    try {
      writeFileSync(join(runtime.paths.directory, "repeat-edits-observed"), "1\n", { flag: "wx", mode: 0o600 })
    } catch {
      /* The marker is already present or diagnostics are unavailable. */
    }
    try {
      const size = statSync(path).size
      if (size + Buffer.byteLength(line) > limit) writeFileSync(path, line, { mode: 0o600 })
      else appendFileSync(path, line, { mode: 0o600 })
    } catch {
      try {
        writeFileSync(path, line, { mode: 0o600 })
      } catch {
        /* logging cannot block admission */
      }
    }
  })
  let residentServer: Server | undefined
  let residentOwnsOwnerRecord = false
  const residentIdleChecks = yield* FiberHandle.make<void, never>().pipe(
    Effect.provideService(Scope.Scope, residentDispatchScope)
  )
  const residentQuietChecks = yield* FiberHandle.make<void, never>().pipe(
    Effect.provideService(Scope.Scope, residentDispatchScope)
  )
  const residentLifetimeController = new AbortController()
  const residentCollectionFindingOffer: CanonicalFindingOffer = Effect.fn("ResidentRuntime.collectionFindingOffer")(
    function* (input) {
      const facts = input.facts
      const result = yield* residentLedger.transition({
        kind: "collectionFindingCheck",
        selectionPartition: input.selectionPartition,
        selectionRound: input.selectionRound,
        unit: facts.unit,
        partition: facts.partition,
        round: facts.round,
        snapshot: facts.snapshot,
        currentSnapshot: facts.currentSnapshot,
        credential: facts.credential,
        currentCredential: facts.currentCredential,
        ageMs: facts.ageMs,
        soloBytes: input.soloBytes,
        collectionReady: facts.collectionReady,
        selectedCount: input.selectedCount,
        prospectiveBytes: input.prospectiveBytes
      })
      if (result.rejection !== undefined) throw new Error("canonical finding fit refused")
      switch (result.commands[0]?.kind) {
        case "collectionFindingSelected":
          return "selected"
        case "collectionFindingRetained":
          return "retained"
        case "collectionFindingLimited":
          return "limited"
        case "collectionFindingExpired":
          return "expired"
        default:
          throw new Error("invalid canonical finding fit")
      }
    }
  )

  const maximumOperationalNoticeKeys = validatedOperationalNoticeKeys(options.maximumOperationalNoticeKeys)

  const residentNow = now
  const residentNotices = residentLedger.notices(
    maximumOperationalNoticeKeys,
    OPERATIONAL_NOTICE_COOLDOWN_MS,
    PENDING_ADVICE_EXPIRY_MS,
    logicalBytes
  )
  const residentCaptureSource = options.captureSource
  const residentControlScope = yield* Scope.make()
  yield* Effect.addFinalizer(() => Scope.close(residentControlScope, Exit.void))
  const residentPreparationControls = Context.get(
    yield* Layer.buildWithScope(options.preparationControls ?? preparationControlsLayer, residentControlScope),
    ResidentPreparationControls
  )
  const residentReviewControls = Context.get(
    yield* Layer.buildWithScope(options.reviewControls ?? reviewControlsLayer, residentControlScope),
    ResidentReviewControls
  )
  const residentDispatchControls = Context.get(
    yield* Layer.buildWithScope(options.dispatchControls ?? dispatchControlsLayer, residentControlScope),
    ResidentDispatchControls
  )
  const residentDispatchAuthorityObserver = options.dispatchAuthorityObserver
  const residentJevRequestObserver = options.jevRequestObserver
  const residentOfflineHttpClient = options.offlineHttpClient
  const residentControlledRequestEffect = options.controlledRequestEffect
  const residentReuse = residentLedger.reuse(logicalBytes)

  const residentAdvice = Effect.fn("ResidentRuntime.advice")(() => residentLedger.advice.values())

  const stats = Effect.fn("ResidentRuntime.stats")(function* (): Effect.fn.Return<
    Extract<ResidentResponse, { status: "stats" }>
  > {
    const now = residentNow()
    yield* residentExpirePending(now)
    yield* residentPruneNoticeCooldowns(now)
    const dispatch = yield* residentDispatcher.snapshot()
    const capacity = yield* residentLedger.snapshot()
    const reuse = yield* residentReuse.snapshot()
    return {
      status: "stats",
      queued: dispatch.queued,
      running: dispatch.running,
      pendingAdvice: (yield* residentAdvice()).length + (yield* residentPendingNoticeCount()),
      pendingFindingBatches: (yield* residentAdvice()).length,
      pendingOperationalNotices: yield* residentPendingNoticeCount(),
      retainedBytes: capacity.bytes,
      rejectedCapacity: (yield* residentLedger.runtime.snapshot()).rejectedCapacity,
      successfulCacheEntries: reuse.entries,
      pendingEvaluations: reuse.pending,
      noticeCooldowns: (yield* residentNotices.entries()).length,
      currentWork: yield* residentLedger.revision.count()
    }
  })

  const cleanup = Effect.fn("ResidentRuntime.cleanup")(function* (): Effect.fn.Return<"busy" | "cleaned"> {
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return "busy"
    const now = residentNow()
    yield* residentExpirePending(now)
    yield* residentPruneNoticeCooldowns(now)
    return yield* residentLedger.runtime.cleanup(logicalBytes)
  })

  const residentPruneCollectionTokenIds = Effect.fn("ResidentRuntime.pruneCollectionTokenIds")(function* () {
    const live = yield* residentComposedDelivery.liveCollectionTokenKeys()
    for (const { content } of yield* residentLedger.advice.snapshots()) {
      if (content.delivery !== undefined) live.add(content.delivery.token)
    }
    for (const notice of (yield* residentNotices.entries()).map(([, value]) => value)) {
      if (notice.pending?.delivery !== undefined) live.add(notice.pending.delivery.token)
    }
    yield* residentLedger.pruneCollectionTokenIds(live)
  }, Effect.uninterruptible)

  const residentRoundSnapshot = Effect.fn("ResidentRuntime.roundSnapshot")(function* (round: RoundWork) {
    const snapshot = yield* residentLedger.rounds.snapshot(round)
    if (snapshot === undefined) throw new Error("native round snapshot lost its capability")
    return snapshot
  })

  function recordResidentObservationActivity(
    observation: DirectObservation,
    dispatch: ResidentDispatchContext,
    stage: "pending" | "incomplete" | "unavailable"
  ): void {
    recordActivity({
      statePath: dispatch.activityPath,
      root: observation.root,
      advicee: observation.advicee,
      lifetime: runtime.lifetime,
      stage
    })
  }
  const residentRejectAdmissionCapacity = Effect.fn("ResidentRuntime.rejectAdmissionCapacity")(function* (
    observation: DirectObservation,
    dispatch: ResidentDispatchContext
  ) {
    yield* residentLedger.runtime.rejectCapacity()
    yield* residentRecordAnalytics({ observation, dispatch }, "capacity-rejected")
    recordResidentObservationActivity(observation, dispatch, "unavailable")
  })
  const residentAdmissionGeneration = Effect.fn("ResidentRuntime.admissionGeneration")(function* (
    group: string,
    observation: DirectObservation,
    composed: boolean,
    requirePermit: boolean
  ) {
    return composed
      ? yield* residentComposedDelivery.admitEdit(group, observation.advicee.toolUseId, monotonicNow(), requirePermit)
      : undefined
  })
  const residentBindAdmissionRound = Effect.fn("ResidentRuntime.bindAdmissionRound")(function* (
    group: string,
    generation: number | undefined,
    observation: DirectObservation,
    dispatch: ResidentDispatchContext
  ) {
    return generation === undefined
      ? undefined
      : yield* residentLedger.rounds.bind(
          group,
          generation,
          { root: observation.root, advicee: observation.advicee, activityPath: dispatch.activityPath },
          randomUUID()
        )
  })
  const residentAdmissionCanonicalRound = Effect.fn("ResidentRuntime.admissionCanonicalRound")(function* (
    round: RoundWork | undefined,
    partition: string
  ) {
    return round?.canonicalRound ?? (yield* residentLedger.roundId(partition))
  })
  const residentAdmissionJob = Effect.fn("ResidentRuntime.admissionJob")(function* (
    observation: DirectObservation,
    dispatch: ResidentDispatchContext,
    partition: string,
    canonicalRound: number,
    canonicalObservationId: number,
    reservation: CapacityReservation,
    round: RoundWork | undefined,
    inspectionReceipt: InspectionReceipt | undefined
  ): Effect.fn.Return<IngressJob> {
    const roundFields =
      round === undefined
        ? {}
        : {
            round,
            work: (yield* residentRoundSnapshot(round)).work,
            workObservationId: (yield* residentLedger.rounds.policyWork(round)).admit(canonicalObservationId)
          }
    return {
      kind: "ingress",
      ...(inspectionReceipt === undefined ? {} : { inspectionReceipt }),
      canonicalRound,
      ...roundFields,
      observation,
      canonicalObservationId,
      partition,
      reservation,
      dispatch
    }
  })
  const residentTraceAdvicee = (
    advicee: DirectAdvicee
  ): advicee is DirectAdvicee & { readonly sessionId: string; readonly toolUseId: string } =>
    typeof advicee.sessionId === "string" && typeof advicee.toolUseId === "string"
  function residentWriteAdmissionTrace(path: string, salt: string, observation: DirectObservation): void {
    if (!residentTraceAdvicee(observation.advicee)) return
    const { sessionId, toolUseId } = observation.advicee
    const key = (value: string) => createHash("sha256").update(`${salt}:${value}`).digest("hex")
    void appendFile(path, `${JSON.stringify({ key: key(toolUseId), sessionKey: key(sessionId) })}\n`, "utf8").catch(
      () => undefined
    )
  }
  function residentRecordAdmissionTrace(observation: DirectObservation): void {
    const path = runtimeConfiguration.admissionTracePath
    const salt = runtimeConfiguration.admissionSalt
    if (path !== undefined && salt !== undefined) residentWriteAdmissionTrace(path, salt, observation)
  }
  function residentRecordAdmissionDiagnostics(observation: DirectObservation): void {
    const acceptedPath = runtimeConfiguration.admissionAcceptedPath
    if (acceptedPath !== undefined) void writeFile(acceptedPath, "accepted\n").catch(() => undefined)
    residentRecordAdmissionTrace(observation)
  }

  const residentAdmissionStale = (composed: boolean, generation: number | undefined): boolean =>
    composed && generation === undefined
  const admitCore = Effect.fn("ResidentRuntime.admitCore")(function* (
    observation: DirectObservation,
    dispatch: ResidentDispatchContext,
    composed = false,
    requirePermit = false,
    inspectionReceipt?: InspectionReceipt
  ): Effect.fn.Return<ResidentResponse> {
    const now = residentNow()
    yield* residentExpirePending(now)
    // Reclaim cooldown state whose active guarantee and pending notice have
    // both ended before it can cause an otherwise-valid admission to fail.
    yield* residentPruneNoticeCooldowns(now)
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return { status: "rejected-capacity" }
    const group = adviceePartition(observation.root, observation.advicee)
    const generation = yield* residentAdmissionGeneration(group, observation, composed, requirePermit)
    if (residentAdmissionStale(composed, generation)) {
      recordResidentObservationActivity(observation, dispatch, "incomplete")
      return { status: "rejected-stale" }
    }
    const round = yield* residentBindAdmissionRound(group, generation, observation, dispatch)
    const partition = group
    const canonicalRound = yield* residentAdmissionCanonicalRound(round, partition)
    const reservation = yield* residentLedger.reserve(
      partition,
      logicalBytes({ observation, dispatch }) + RESERVATION_OVERHEAD_BYTES,
      "observationDispatch"
    )
    if (reservation === undefined) {
      yield* residentRejectAdmissionCapacity(observation, dispatch)
      return { status: "rejected-capacity" }
    }
    const admission = yield* Effect.exit(residentLedger.admitObservation(partition, canonicalRound))
    if (Exit.isFailure(admission)) {
      yield* residentLedger.release(reservation)
      return { status: "rejected-capacity" }
    }
    const canonicalObservationId = admission.value
    const job = yield* residentAdmissionJob(
      observation,
      dispatch,
      partition,
      canonicalRound,
      canonicalObservationId,
      reservation,
      round,
      inspectionReceipt
    )
    if (!(yield* residentDispatcher.enqueue(partition, job))) {
      yield* residentLedger.observation(partition, canonicalObservationId, "interruptObservation", canonicalRound)
      yield* residentLedger.release(reservation)
      yield* residentRejectAdmissionCapacity(observation, dispatch)
      return { status: "rejected-capacity" }
    }
    residentRecordAdmissionDiagnostics(observation)
    recordResidentObservationActivity(observation, dispatch, "pending")
    return { status: "accepted" }
  }, Effect.uninterruptible)

  const admit = Effect.fn("ResidentRuntime.admit")(function* (
    observation: DirectObservation,
    dispatch: ResidentDispatchContext,
    composed = false,
    requirePermit = false
  ) {
    const receipt = inspectionReceive(observation, dispatch)
    const response = yield* admitCore(observation, dispatch, composed, requirePermit, receipt)
    if (
      response.status === "accepted" ||
      response.status === "rejected-capacity" ||
      response.status === "rejected-stale"
    ) {
      inspection.offer(receipt.scope, receipt.correlation, { kind: "edit-admission", outcome: response.status })
    }
    return response
  }, Effect.uninterruptible)

  function residentCollectionElapsed(now: number, started: number, limit: number): number {
    const elapsed = Math.min(limit, Math.max(0, now - started))
    return Number.isNaN(elapsed) ? 0 : Math.floor(elapsed)
  }

  const residentPendingCanonicalFindings = Effect.fn("ResidentRuntime.pendingCanonicalFindings")(function* (
    operation: number
  ) {
    return (
      (yield* residentLedger.canonicalProjection()).pendingFindings.find((item) => item.operation === operation)
        ?.count ?? 0
    )
  })

  const residentAdviceExpired = Effect.fn("ResidentRuntime.adviceExpired")(function* (
    advice: Pick<Advice, "pendingAt">,
    now: number
  ) {
    const result = yield* residentLedger.transition({
      kind: "collectionExpiryCheck",
      elapsed: residentCollectionElapsed(now, advice.pendingAt, PENDING_ADVICE_EXPIRY_MS),
      lifetime: PENDING_ADVICE_EXPIRY_MS
    })
    if (result.rejection !== undefined) throw new Error("canonical advice expiry refused")
    const command = result.commands[0]?.kind
    if (command !== "collectionExpired" && command !== "collectionCurrent")
      throw new Error("invalid canonical advice expiry")
    return command === "collectionExpired"
  })

  const residentCollectionOrder = Effect.fn("ResidentRuntime.collectionOrder")(function* (
    left: Pick<Advice, "sequence">,
    right: Pick<Advice, "sequence">
  ) {
    const result = yield* residentLedger.transition({
      kind: "collectionOrderCheck",
      leftSequence: left.sequence,
      rightSequence: right.sequence
    })
    if (result.rejection !== undefined) throw new Error("canonical collection order refused")
    switch (result.commands[0]?.kind) {
      case "collectionBefore":
        return -1
      case "collectionEqual":
        return 0
      case "collectionAfter":
        return 1
      default:
        throw new Error("invalid canonical collection order")
    }
  })

  const residentReserveAdviceLease = Effect.fn("ResidentRuntime.reserveAdviceLease")((advice: Advice, token: string) =>
    residentLedger.advice.reserveLease(advice, token)
  )

  const residentReleaseAdviceLease = Effect.fn("ResidentRuntime.releaseAdviceLease")((advice: Advice) =>
    residentLedger.advice.releaseLease(advice)
  )

  const residentCheckAdviceLease = Effect.fn("ResidentRuntime.checkAdviceLease")(function* (
    advice: Advice,
    now: number,
    stopCollector: boolean,
    sameGroup: boolean
  ) {
    const { delivery } = yield* residentLedger.advice.current(advice)
    yield* residentLedger.advice.checkLease(
      advice,
      now,
      stopCollector,
      sameGroup,
      delivery !== undefined &&
        stopCollector &&
        sameGroup &&
        (yield* residentComposedDelivery.backgroundReofferable(advice.id, delivery.token))
    )
  }, Effect.uninterruptible)

  const residentUnsuppressedFindings = Effect.fn("ResidentRuntime.unsuppressedFindings")(function* (
    advice: Advice,
    findings: ReadonlyArray<Finding>,
    stopCollector: boolean,
    firstOnly = false
  ) {
    const retained: Array<Finding> = []
    const partition = adviceePartition(advice.observation.root, advice.observation.advicee)
    for (const finding of findings) {
      if (
        yield* residentComposedDelivery.suppresses(advice.id, partition, finding, stopCollector ? "stop" : undefined)
      ) {
        inspectionObserveAdviceFate(advice, [finding], "suppressed", "collection-suppression")
        continue
      }
      retained.push(finding)
      if (firstOnly) break
    }
    return retained
  })

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode?: CollectionMode
  ): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    authority: undefined,
    composed: true
  ): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    authority: ResponseAuthority,
    composed?: boolean
  ): Effect.Effect<ResidentResponse, ResidentAdapterError>

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode = "ordinary",
    authority?: ResponseAuthority,
    composed = false
  ): Effect.Effect<ResidentResponse, ResidentAdapterError> {
    return residentCollect(root, advicee, dispatch, mode, authority, composed)
  }

  type CollectionFrame = {
    readonly partition: string
    readonly dispatch: ResidentDispatchContext
    readonly composed: boolean
    readonly authority: ResponseAuthority | undefined
    readonly claudeSurface: "stop" | undefined
    readonly now: number
    readonly stopCollector: boolean
    readonly credentialGeneration: number | null
  }
  const residentClaudeCollectionSurface = (
    advicee: DirectAdvicee,
    mode: CollectionMode,
    authority: ResponseAuthority | undefined,
    composed: boolean
  ): "stop" | undefined =>
    composed && authority === undefined && advicee.host === "claude-code" && mode === "turn-end" ? "stop" : undefined
  const residentCollectionBlocked = Effect.fn("ResidentRuntime.collectionBlocked")(function* (
    partition: string,
    mode: CollectionMode,
    composed: boolean
  ) {
    return composed && mode !== "turn-end" && (yield* residentComposedDelivery.isDeciding(partition))
  })
  const residentStopCollector = Effect.fn("ResidentRuntime.stopCollector")(function* (
    partition: string,
    mode: CollectionMode,
    composed: boolean
  ) {
    return composed && mode === "turn-end" && (yield* residentComposedDelivery.isDeciding(partition))
  })
  const residentCollectionFrame = Effect.fn("ResidentRuntime.collectionFrame")(function* (
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    authority: ResponseAuthority | undefined,
    composed: boolean
  ) {
    const partition = adviceePartition(root, advicee)
    const claudeSurface = residentClaudeCollectionSurface(advicee, mode, authority, composed)
    const now = residentNow()
    if (yield* residentCollectionBlocked(partition, mode, composed)) return undefined
    const stopCollector = yield* residentStopCollector(partition, mode, composed)
    return { partition, dispatch, composed, authority, claudeSurface, now, stopCollector } satisfies Omit<
      CollectionFrame,
      "credentialGeneration"
    >
  })
  const residentCollectionSameScope = (frame: CollectionFrame, advice: Advice): boolean =>
    frame.composed
      ? adviceePartition(advice.observation.root, advice.observation.advicee) === frame.partition
      : advice.partition === frame.partition
  const residentCollectionCredentialCheck = Effect.fn("ResidentRuntime.collectionCredentialCheck")(function* (
    frame: CollectionFrame,
    advice: Advice
  ) {
    const result = yield* residentLedger.transition({
      kind: "collectionCredentialCheck",
      sameScope: residentCollectionSameScope(frame, advice),
      generationValid: advice.credentialGeneration === frame.credentialGeneration
    })
    if (result.rejection !== undefined) throw new Error("canonical credential check refused")
    if (result.commands[0]?.kind === "collectionRetireCredential")
      yield* residentRemoveAdvice(advice.id, undefined, { fate: "discarded", reason: "credential-invalid" })
    else if (result.commands[0]?.kind !== "collectionRetainCredential")
      throw new Error("invalid canonical credential decision")
  })
  const residentCollectionPrelude = Effect.fn("ResidentRuntime.collectionPrelude")(function* (
    initial: Omit<CollectionFrame, "credentialGeneration">
  ) {
    yield* residentExpirePending(initial.now)
    yield* residentPruneNoticeCooldowns(initial.now)
    const frame: CollectionFrame = { ...initial, credentialGeneration: initial.dispatch.credential?.generation ?? null }
    for (const advice of [...(yield* residentAdvice())]) yield* residentCollectionCredentialCheck(frame, advice)
    // Stop reoffers an uncertain background write only after its writer terminated.
    for (const { capability: advice, content } of yield* residentLedger.advice.snapshots()) {
      const sameGroup = adviceePartition(advice.observation.root, advice.observation.advicee) === frame.partition
      if (content.delivery !== undefined)
        yield* residentCheckAdviceLease(advice, frame.now, frame.stopCollector, sameGroup)
    }
    return frame
  })
  const residentCollectionCandidateResult = (
    result: Effect.Success<ReturnType<typeof residentLedger.transition>>
  ): boolean => {
    if (result.rejection !== undefined) throw new Error("canonical advice candidate refused")
    const kind = result.commands[0]?.kind
    if (kind !== "collectionCandidate" && kind !== "collectionSkip")
      throw new Error("invalid canonical advice candidate")
    return kind === "collectionCandidate"
  }
  const residentCollectionCandidate = Effect.fn("ResidentRuntime.collectionCandidate")(function* (
    frame: CollectionFrame,
    advice: Advice,
    content: Effect.Success<ReturnType<typeof residentLedger.advice.current>>
  ) {
    const samePartition = residentCollectionSameScope(frame, advice)
    const unleased = content.delivery === undefined
    const hasUnsuppressed =
      samePartition &&
      unleased &&
      (yield* residentUnsuppressedFindings(advice, content.findings, frame.stopCollector, true)).length > 0
    const authorityOwns = frame.authority === undefined || frame.authority.partition === advice.partition
    const result = yield* residentLedger.transition({
      kind: "collectionCandidateCheck",
      samePartition,
      unleased,
      hasUnsuppressed,
      authorityOwns
    })
    return residentCollectionCandidateResult(result)
  })
  const residentCollectionAdviceAt = (advice: ReadonlyArray<Advice>, index: number): Advice => {
    const item = advice[index]
    if (item === undefined) throw new Error("eligible advice disappeared during ordering")
    return item
  }
  const residentOrderCollectionAdvice = Effect.fn("ResidentRuntime.orderCollectionAdvice")(function* (
    eligible: Array<Advice>
  ) {
    for (let index = 1; index < eligible.length; index++) {
      const item = residentCollectionAdviceAt(eligible, index)
      let previous = index - 1
      while (previous >= 0) {
        const left = residentCollectionAdviceAt(eligible, previous)
        if ((yield* residentCollectionOrder(left, item)) <= 0) break
        eligible[previous + 1] = left
        previous--
      }
      eligible[previous + 1] = item
    }
  })
  const residentEligibleCollectionAdvice = Effect.fn("ResidentRuntime.eligibleCollectionAdvice")(function* (
    frame: CollectionFrame
  ) {
    const available: Array<Advice> = []
    for (const { capability: advice, content } of yield* residentLedger.advice.snapshots()) {
      if (yield* residentCollectionCandidate(frame, advice, content)) available.push(advice)
    }
    for (const advice of available)
      yield* residentLedger.advice.eligible(advice, yield* residentJoined.hasAdmission(advice.admissionId))
    const eligible = (yield* Effect.forEach(
      available,
      Effect.fn("ResidentRuntime.eligibleAdvice")(function* (item) {
        return { item, content: yield* residentLedger.advice.current(item) }
      })
    ))
      .filter(({ content }) => content.collectionEligible)
      .map(({ item }) => item)
    yield* residentOrderCollectionAdvice(eligible)
    return eligible
  })
  const residentSelectCollectionFindings = (
    frame: CollectionFrame,
    retained: ReadonlyArray<Finding>,
    candidates: ReadonlyArray<Finding>,
    facts: FindingSelectionFacts,
    onLimited: (() => void) | undefined
  ) =>
    frame.authority === undefined
      ? frame.claudeSurface === undefined
        ? selectFittingFindings(retained, candidates, facts, onLimited, residentCollectionFindingOffer)
        : selectFittingClaudeStopFindings(retained, candidates, facts, onLimited, residentCollectionFindingOffer)
      : selectFittingClaudeFindings(
          retained,
          candidates,
          frame.authority.claudeFeedbackMode,
          facts,
          onLimited,
          residentCollectionFindingOffer
        )
  const residentFittingCollectionFindings = Effect.fn("ResidentRuntime.fittingCollectionFindings")(function* (
    frame: CollectionFrame,
    retained: ReadonlyArray<Finding>,
    candidates: ReadonlyArray<Finding>,
    advice: Advice
  ) {
    const facts = yield* residentFindingSelectionFacts(
      advice,
      frame.partition,
      frame.credentialGeneration,
      residentNow(),
      frame.composed
    )
    let limited = 0
    const fitting = yield* residentSelectCollectionFindings(frame, retained, candidates, facts, () => {
      limited++
    })
    for (let index = 0; index < limited; index++)
      yield* residentRecordOperationalFailure(advice.observation, "output-limit")
    return fitting
  }, Effect.uninterruptible)
  const residentDisposeCollectionCandidate = Effect.fn("ResidentRuntime.disposeCollectionCandidate")(function* (
    advice: Advice,
    token: string,
    route: string
  ) {
    if (route === "retireCandidate") yield* residentRemoveAdvice(advice.id, token)
    else yield* residentReleaseAdviceLease(advice)
  })
  const residentCollectionBarrier = Effect.fn("ResidentRuntime.collectionBarrier")(function* (
    advice: Advice,
    final: boolean
  ) {
    const barrier = final
      ? residentReviewControls.beforeFinalRevalidate(advice.id)
      : residentReviewControls.beforeRevalidate(advice.id)
    yield* barrier.pipe(
      Effect.mapError(
        () =>
          new ResidentAdapterError({
            operation: final ? "final collection revalidation barrier" : "collection revalidation barrier"
          })
      )
    )
  })
  const residentCollectionValidity = Effect.fn("ResidentRuntime.collectionValidity")(function* (
    frame: CollectionFrame,
    advice: Advice,
    token: string,
    final: boolean
  ) {
    yield* residentCollectionBarrier(advice, final)
    const validity = yield* residentRevalidate(advice, frame.dispatch)
    const retained = (yield* residentAdvice()).find((item) => item.id === advice.id)
    const route = yield* residentCandidateRoute({
      kind: "validationRouteCheck",
      ownerCurrent: retained === advice && (yield* residentLedger.advice.current(advice)).delivery?.token === token,
      status: validity.status
    })
    if (route === "ignoreCandidate") return undefined
    if (route === "continueCandidate" && validity.status === "current") return validity
    yield* residentDisposeCollectionCandidate(advice, token, route)
    return undefined
  })
  const residentCollectionPostCheck = Effect.fn("ResidentRuntime.collectionPostCheck")(function* (
    advice: Advice,
    token: string,
    event: Extract<CanonicalEvent, { kind: "postValidationCheck" }>
  ) {
    const route = yield* residentCandidateRoute(event)
    if (route === "retainCandidate") return true
    yield* residentDisposeCollectionCandidate(advice, token, route)
    return false
  })
  const residentCollectionWorkAccepted = Effect.fn("ResidentRuntime.collectionWorkAccepted")(function* (
    advice: Advice,
    validity: Extract<RevalidationResult, { status: "current" }>
  ) {
    return (
      advice.round === undefined ||
      advice.workUnitId === undefined ||
      (yield* residentLedger.rounds.policyWork(advice.round)).reviseFinding(
        advice.workUnitId,
        validity.findings.length,
        logicalBytes(validity.findings)
      )
    )
  })
  const residentReviseCollectionAdvice = Effect.fn("ResidentRuntime.reviseCollectionAdvice")(function* (
    advice: Advice,
    token: string,
    validity: Extract<RevalidationResult, { status: "current" }>
  ) {
    const workAccepted = yield* residentCollectionWorkAccepted(advice, validity)
    if (
      !(yield* residentCollectionPostCheck(advice, token, {
        kind: "postValidationCheck",
        workAccepted,
        expired: false,
        hasFitting: true
      }))
    )
      return false
    yield* residentLedger.advice.revise(advice, validity.evaluations, validity.findings)
    const handoffNow = residentNow()
    return yield* residentCollectionPostCheck(advice, token, {
      kind: "postValidationCheck",
      workAccepted: true,
      expired: yield* residentAdviceExpired(advice, handoffNow),
      hasFitting: true
    })
  })
  const residentCollectionPassAdvice = Effect.fn("ResidentRuntime.collectionPassAdvice")(function* (
    candidate: Advice,
    token: string,
    final: boolean
  ) {
    if (final) return candidate
    const advice = (yield* residentLedger.advice.snapshots()).find(
      ({ capability, content }) => capability.id === candidate.id && content.delivery === undefined
    )?.capability
    if (advice === undefined) return undefined
    return (yield* residentReserveAdviceLease(advice, token)) ? advice : undefined
  })
  const residentCollectionPassFindings = Effect.fn("ResidentRuntime.collectionPassFindings")(function* (
    frame: CollectionFrame,
    advice: Advice,
    token: string,
    retained: ReadonlyArray<Finding>,
    final: boolean
  ) {
    const validity = yield* residentCollectionValidity(frame, advice, token, final)
    if (validity === undefined) return undefined
    if (!(yield* residentReviseCollectionAdvice(advice, token, validity))) return undefined
    const content = yield* residentLedger.advice.current(advice)
    const candidates = yield* residentUnsuppressedFindings(advice, content.findings, frame.stopCollector)
    const fitting = yield* residentFittingCollectionFindings(frame, retained, candidates, advice)
    if (
      !(yield* residentCollectionPostCheck(advice, token, {
        kind: "postValidationCheck",
        workAccepted: true,
        expired: false,
        hasFitting: fitting.length > 0
      }))
    )
      return undefined
    if (final && (yield* residentLedger.advice.current(advice)).delivery?.token !== token) return undefined
    yield* residentLedger.advice.updateDelivery(advice, token, { findings: fitting })
    return fitting
  })
  const residentCollectionPass = Effect.fn("ResidentRuntime.collectionPass")(function* (
    frame: CollectionFrame,
    token: string,
    candidates: ReadonlyArray<Advice>,
    final: boolean
  ) {
    const selected: Array<Advice> = []
    let findings: Array<Finding> = []
    for (const candidate of candidates) {
      const advice = yield* residentCollectionPassAdvice(candidate, token, final)
      if (advice === undefined) continue
      const fitting = yield* residentCollectionPassFindings(frame, advice, token, findings, final)
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
    ownerCurrent: boolean,
    generationValid: boolean
  ): boolean => {
    const credential = frame.dispatch.credential
    if (!ownerCurrent || !generationValid || credential === null) return true
    const state = readCredentialState(credential.statePath)
    return residentCollectionCredentialStateValid(state, frame.credentialGeneration, credential.environmentOnly)
  }
  const residentCollectionHandoffFacts = Effect.fn("ResidentRuntime.collectionHandoffFacts")(function* (
    frame: CollectionFrame,
    advice: Advice,
    token: string
  ) {
    const retained = (yield* residentAdvice()).find((item) => item.id === advice.id)
    const delivery = retained === undefined ? undefined : (yield* residentLedger.advice.current(retained)).delivery
    const ownerCurrent = retained === advice && delivery?.token === token
    const generationValid = advice.credentialGeneration === frame.credentialGeneration
    const credentialAuthorized = residentHandoffCredentialAuthorized(frame, ownerCurrent, generationValid)
    return {
      delivery,
      ownerCurrent,
      generationValid,
      credentialAuthorized,
      canInspect: ownerCurrent && generationValid && credentialAuthorized
    }
  })
  type CollectionHandoffFacts = Effect.Success<ReturnType<typeof residentCollectionHandoffFacts>>
  const residentCollectionFinalRoute = Effect.fn("ResidentRuntime.collectionFinalRoute")(function* (
    advice: Advice,
    facts: CollectionHandoffFacts,
    now: number
  ) {
    return yield* residentCandidateRoute({
      kind: "finalCandidateCheck",
      ownerCurrent: facts.ownerCurrent,
      credentialGeneration: facts.generationValid,
      credentialAuthorized: facts.credentialAuthorized,
      expired: facts.canInspect && (yield* residentAdviceExpired(advice, now)),
      workCurrent: facts.canInspect && (yield* residentIsCurrentWork(advice.revision, advice.prepared)),
      hasFindings: facts.delivery !== undefined && facts.delivery.findings.length > 0
    })
  })
  const residentRetainableHandoff = (route: string, facts: CollectionHandoffFacts): boolean =>
    route === "retainCandidate" && facts.delivery !== undefined
  const residentRetainHandoffAdvice = Effect.fn("ResidentRuntime.retainHandoffAdvice")(function* (
    advice: Advice,
    token: string,
    now: number,
    route: string,
    facts: CollectionHandoffFacts
  ) {
    if (route === "retireCandidate") {
      yield* residentRemoveAdvice(advice.id, token)
      return false
    }
    if (route === "releaseCandidate") {
      yield* residentReleaseAdviceLease(advice)
      return false
    }
    if (!residentRetainableHandoff(route, facts)) return false
    yield* residentLedger.advice.updateDelivery(advice, token, { leaseUntil: now + DELIVERY_LEASE_MS })
    return true
  })
  const residentCollectHandoffAdvice = Effect.fn("ResidentRuntime.collectHandoffAdvice")(function* (
    frame: CollectionFrame,
    advice: Advice,
    token: string,
    now: number
  ) {
    const facts = yield* residentCollectionHandoffFacts(frame, advice, token)
    const route = yield* residentCollectionFinalRoute(advice, facts, now)
    return yield* residentRetainHandoffAdvice(advice, token, now, route, facts)
  })
  const residentCollectHandoff = Effect.fn("ResidentRuntime.collectHandoff")(function* (
    frame: CollectionFrame,
    final: ReadonlyArray<Advice>,
    token: string,
    now: number
  ) {
    const handoff: Array<Advice> = []
    for (const advice of final) if (yield* residentCollectHandoffAdvice(frame, advice, token, now)) handoff.push(advice)
    return handoff
  })
  const residentCollectionSurface = (frame: CollectionFrame) =>
    frame.authority === undefined
      ? frame.claudeSurface === undefined
        ? ("codex" as const)
        : ("claude-stop" as const)
      : frame.authority.claudeFeedbackMode
  const residentHandoffOffers = Effect.fn("ResidentRuntime.handoffOffers")(function* (
    frame: CollectionFrame,
    advice: Advice,
    now: number
  ) {
    const facts = yield* residentFindingSelectionFacts(
      advice,
      frame.partition,
      frame.credentialGeneration,
      now,
      frame.composed
    )
    const { delivery } = yield* residentLedger.advice.current(advice)
    return (delivery?.findings ?? []).map((finding) => ({ advice, finding, facts }))
  })
  const residentSelectHandoffFindings = Effect.fn("ResidentRuntime.selectHandoffFindings")(function* (
    frame: CollectionFrame,
    handoff: ReadonlyArray<Advice>,
    token: string,
    now: number,
    root: string,
    recipient: DirectAdvicee
  ) {
    const offers = (yield* Effect.forEach(handoff, (advice) => residentHandoffOffers(frame, advice, now))).flat()
    const limited: Array<number> = []
    const accepted = new Set(
      yield* selectFittingCurrentFindingIndices(
        offers,
        residentCollectionSurface(frame),
        (index) => {
          limited.push(index)
        },
        residentCollectionFindingOffer
      )
    )
    for (const index of limited)
      yield* residentRecordOperationalFailure(offers[index]!.advice.observation, "output-limit", now)
    let index = 0
    for (const advice of handoff) {
      const { delivery } = yield* residentLedger.advice.current(advice)
      if (delivery === undefined) continue
      yield* residentLedger.advice.updateDelivery(advice, token, {
        findings: delivery.findings.filter(() => accepted.has(index++))
      })
      if ((yield* residentLedger.advice.current(advice)).delivery?.findings.length === 0)
        yield* residentReleaseAdviceLease(advice)
    }
    const contents = yield* Effect.forEach(handoff, (advice) => residentLedger.advice.current(advice))
    const findings = contents.flatMap((content) => content.delivery?.findings ?? [])
    if (inspection.isEnabled(root)) {
      const payload = captureInspectionFate(findings, "retained", "pending-advice").payload
      if (payload.status === "available")
        inspectionSubmissions.register(token, {
          root,
          advicee: recipient,
          findingIds: payload.findingIds,
          evaluations: contents.flatMap((content, index) => {
            if (!content.delivery?.findings.length) return []
            const advice = handoff[index]!
            const evaluationId = inspectionOrigins.get(advice.evaluationKey)
            return [
              { semanticIdentity: advice.prepared.identity, ...(evaluationId === undefined ? {} : { evaluationId }) }
            ]
          })
        })
    }
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
      root: string,
      advicee: DirectAdvicee,
      dispatch: ResidentDispatchContext,
      mode: CollectionMode = "ordinary",
      authority?: ResponseAuthority,
      composed = false
    ) =>
      Effect.suspend(() => {
        const server = runtime
        let collectionToken: string | undefined
        return Effect.gen(function* () {
          const initial = yield* residentCollectionFrame(root, advicee, dispatch, mode, authority, composed)
          if (initial === undefined) return residentResponse({ status: "empty" })
          const frame = yield* residentCollectionPrelude(initial)
          const eligible = yield* residentEligibleCollectionAdvice(frame)
          const token = (collectionToken = randomUUID())
          const selected = yield* residentCollectionPass(frame, token, eligible, false)
          if (selected.length === 0) return residentResponse({ status: "empty" })
          const final = yield* residentCollectionPass(frame, token, selected, true)
          if (final.length === 0) return residentResponse({ status: "empty" })
          // No asynchronous work may occur after the runtime handoff barrier.
          // One clock reading checks ownership and authority after every final capture.
          const handoffNow = residentNow()
          const handoff = yield* residentCollectHandoff(frame, final, token, handoffNow)
          const findings = yield* residentSelectHandoffFindings(frame, handoff, token, handoffNow, root, advicee)
          // Operational failures remain resident diagnostics; only actionable findings reach the agent.
          return residentCollectionResponse(frame, token, findings)
        }).pipe(
          Effect.onError(() =>
            Effect.gen(function* () {
              // A failed or interrupted collector cannot retain a lease indefinitely.
              // Revalidation's own finalizer has settled before runtime handoff is released.
              if (collectionToken !== undefined) yield* server.releaseDelivery(collectionToken)
            })
          )
        )
      })
  )

  type CandidateRoute =
    | "ignoreCandidate"
    | "releaseCandidate"
    | "retireCandidate"
    | "continueCandidate"
    | "retainCandidate"
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
    event: Extract<
      CanonicalEvent,
      { readonly kind: "validationRouteCheck" | "postValidationCheck" | "finalCandidateCheck" }
    >
  ) {
    const result = yield* residentLedger.transition(event)
    const kind = result.commands[0]?.kind
    if (result.rejection !== undefined || result.commands.length !== 1 || !isCandidateRoute(kind)) {
      throw new Error("invalid canonical candidate route")
    }
    return kind
  })

  type AdviceSnapshot = { readonly capability: Advice; readonly content: AdviceContent }
  type DeliveryBatch = {
    readonly advice: ReadonlyArray<AdviceSnapshot>
    readonly notices: ReadonlyArray<PendingNotice>
  }
  const residentDeliveryBatch = Effect.fn("ResidentRuntime.deliveryBatch")(function* (
    token: string,
    now: number
  ): Effect.fn.Return<DeliveryBatch> {
    yield* residentExpirePending(now)
    yield* residentPruneNoticeCooldowns(now)
    const advice = (yield* residentLedger.advice.snapshots()).filter(({ content }) => content.delivery?.token === token)
    const notices = yield* residentNoticesForToken(token)
    return { advice, notices }
  })
  function residentDeliveryDecision(
    decision: ReturnType<CapacityLedger["transition"]>,
    message: string
  ): CanonicalCommand | undefined {
    if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error(message)
    return decision.commands[0]
  }
  const deliveryExpired = (delivery: { readonly leaseUntil: number } | undefined, now: number): boolean =>
    delivery === undefined || delivery.leaseUntil <= now
  const residentBatchExpired = (batch: DeliveryBatch, now: number): boolean =>
    batch.advice.some(({ content }) => deliveryExpired(content.delivery, now)) ||
    batch.notices.some((item) => deliveryExpired(item.delivery, now))
  const residentReleaseDeliveryBatch = Effect.fn("ResidentRuntime.releaseDeliveryBatch")(function* (
    batch: DeliveryBatch
  ) {
    yield* Effect.forEach(batch.advice, ({ capability }) => residentReleaseAdviceLease(capability), {
      concurrency: 1,
      discard: true
    })
    yield* Effect.forEach(batch.notices, (item) => residentNotices.release(item.id), { concurrency: 1, discard: true })
  })
  const unacknowledgedDelivery = (delivery: AdviceContent["delivery"]): boolean =>
    delivery !== undefined && !delivery.acknowledged
  const residentSubmissionAnalyticsEligible = (item: AdviceSnapshot): boolean =>
    item.capability.analyticsEnabled && unacknowledgedDelivery(item.content.delivery)
  function residentSubmissionAnalyticsGroups(
    advice: ReadonlyArray<AdviceSnapshot>
  ): ReadonlyArray<ReadonlyArray<AdviceSnapshot>> {
    const groups = new Map<string, ReadonlyArray<AdviceSnapshot>>()
    for (const item of advice) {
      if (!residentSubmissionAnalyticsEligible(item)) continue
      const key = JSON.stringify([item.capability.analyticsPath, item.capability.analyticsControlled])
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    return [...groups.values()]
  }
  function residentRecordSubmissionAnalytics(group: ReadonlyArray<AdviceSnapshot>): void {
    const first = group[0]?.capability
    if (first === undefined) return
    const findings = group.flatMap(({ content }) => content.delivery?.findings ?? [])
    recordAnalytics({
      enabled: true,
      statePath: first.analyticsPath,
      root: first.observation.root,
      advicee: first.observation.advicee,
      lifetime: runtime.lifetime,
      kind: "submitted",
      controlled: first.analyticsControlled,
      findings: findings.length,
      ruleIds: findings.map((finding) => finding.ruleId)
    })
  }
  const residentAcknowledgeBatch = Effect.fn("ResidentRuntime.acknowledgeBatch")(function* (
    batch: DeliveryBatch,
    token: string
  ) {
    for (const group of residentSubmissionAnalyticsGroups(batch.advice)) residentRecordSubmissionAnalytics(group)
    for (const { capability } of batch.advice)
      yield* residentLedger.advice.updateDelivery(capability, token, { acknowledged: true })
    for (const item of batch.notices) yield* residentNotices.acknowledge(item.id)
  })
  const acknowledge = Effect.fn("ResidentRuntime.acknowledge")(function* (
    token: string
  ): Effect.fn.Return<ResidentResponse> {
    const now = residentNow()
    const batch = yield* residentDeliveryBatch(token, now)
    const decision = residentDeliveryDecision(
      yield* residentLedger.transition({
        kind: "deliveryAcknowledgeCheck",
        items: batch.advice.length + batch.notices.length,
        anyExpired: residentBatchExpired(batch, now)
      }),
      "canonical acknowledgement refused"
    )
    if (decision?.kind === "deliveryAckEmpty") return { status: "empty" }
    if (decision?.kind === "deliveryAckExpired") {
      yield* residentReleaseDeliveryBatch(batch)
      return { status: "empty" }
    }
    if (decision?.kind !== "deliveryAckReady") throw new Error("invalid canonical acknowledgement")
    const selected = batch.advice.flatMap(({ capability, content }) =>
      (content.delivery?.findings ?? []).map(() => capability.canonicalOperationId)
    )
    if (!(yield* residentComposedDelivery.markSubmitted(token, selected))) return { status: "empty" }
    yield* residentAcknowledgeBatch(batch, token)
    return { status: "acknowledged" }
  }, Effect.uninterruptible)

  const residentRemainingDeliveryFindings = (
    content: AdviceContent,
    delivered: ReadonlyArray<Finding>,
    composed: boolean
  ): ReadonlyArray<Finding> => (composed ? [] : withoutDeliveredFindings(content.findings, delivered))
  function residentRemainingEvaluations(
    content: AdviceContent,
    delivered: ReadonlyArray<Finding>
  ): ReadonlyArray<EvaluatedUnit> {
    return content.evaluations
      .map((evaluation) => ({ ...evaluation, findings: withoutDeliveredFindings(evaluation.findings, delivered) }))
      .filter((evaluation) => evaluation.findings.length > 0)
  }
  const residentFinalizeAdvice = Effect.fn("ResidentRuntime.finalizeAdvice")(function* (
    snapshot: AdviceSnapshot,
    token: string,
    composed: boolean
  ) {
    const { capability: item, content } = snapshot
    const delivered = content.delivery?.findings ?? []
    const remaining = residentRemainingDeliveryFindings(content, delivered, composed)
    const disposition = residentDeliveryDecision(
      yield* residentLedger.transition({
        kind: "deliveryFindingDispositionCheck",
        composed,
        remaining: remaining.length
      }),
      "canonical finding disposition refused"
    )
    if (disposition?.kind === "deliveryKeepForReoffer") {
      yield* residentReleaseAdviceLease(item)
      return
    }
    if (disposition?.kind === "deliveryRetireAdvice") {
      yield* residentRemoveAdvice(item.id, token, { fate: "discarded", reason: "delivery-finalized" })
      return
    }
    if (disposition?.kind !== "deliveryKeepRemaining") throw new Error("invalid canonical delivery disposition")
    yield* residentLedger.advice.revise(item, residentRemainingEvaluations(content, delivered), remaining)
    yield* residentReleaseAdviceLease(item)
  })
  const residentBatchAcknowledged = (batch: DeliveryBatch): boolean =>
    batch.advice.every(({ content }) => content.delivery?.acknowledged === true) &&
    batch.notices.every((item) => item.delivery?.acknowledged === true)
  const residentFinalizeBatch = Effect.fn("ResidentRuntime.finalizeBatch")(function* (
    batch: DeliveryBatch,
    token: string,
    composed: boolean
  ) {
    for (const advice of batch.advice) yield* residentFinalizeAdvice(advice, token, composed)
    for (const item of batch.notices) yield* residentRemovePendingNotice(item.id, token)
  })
  const finalize = Effect.fn("ResidentRuntime.finalize")(function* (token: string): Effect.fn.Return<ResidentResponse> {
    const now = residentNow()
    const batch = yield* residentDeliveryBatch(token, now)
    const decision = residentDeliveryDecision(
      yield* residentLedger.transition({
        kind: "deliveryFinalizeCheck",
        items: batch.advice.length + batch.notices.length,
        allAcknowledged: residentBatchAcknowledged(batch),
        anyExpired: residentBatchExpired(batch, now)
      }),
      "canonical finalization refused"
    )
    if (decision?.kind === "deliveryFinalEmpty") return { status: "empty" }
    if (decision?.kind === "deliveryFinalExpired") {
      yield* residentReleaseDeliveryBatch(batch)
      return { status: "empty" }
    }
    if (decision?.kind !== "deliveryFinalReady") throw new Error("invalid canonical finalization")
    const composed = yield* residentComposedDelivery.hasToken(token)
    yield* residentFinalizeBatch(batch, token, composed)
    return { status: "finalized" }
  }, Effect.uninterruptible)

  const residentReleaseUnacknowledged = Effect.fn("ResidentRuntime.releaseUnacknowledged")(function* (
    acknowledged: boolean
  ) {
    const command = residentDeliveryDecision(
      yield* residentLedger.transition({ kind: "deliveryReleaseCheck", acknowledged }),
      "canonical delivery release refused"
    )
    if (command?.kind === "deliveryReleaseUnacknowledged") return true
    if (command?.kind === "deliveryKeepAcknowledged") return false
    throw new Error("invalid canonical delivery release")
  })
  const residentReleaseTokenLease = Effect.fn("ResidentRuntime.releaseTokenLease")(function* (
    token: string,
    delivery: { readonly token: string; readonly acknowledged: boolean } | undefined,
    release: Effect.Effect<void>
  ) {
    if (delivery?.token !== token) return
    if (yield* residentReleaseUnacknowledged(delivery.acknowledged)) yield* release
  })
  const residentReleaseAdviceForToken = Effect.fn("ResidentRuntime.releaseAdviceForToken")(
    (token: string, snapshot: AdviceSnapshot) =>
      residentReleaseTokenLease(token, snapshot.content.delivery, residentReleaseAdviceLease(snapshot.capability))
  )
  const residentReleaseNoticeForToken = Effect.fn("ResidentRuntime.releaseNoticeForToken")(
    (token: string, notice: PendingNotice) =>
      residentReleaseTokenLease(token, notice.delivery, residentNotices.release(notice.id))
  )
  const releaseDelivery = Effect.fn("ResidentRuntime.releaseDelivery")(function* (token: string) {
    for (const advice of yield* residentLedger.advice.snapshots()) yield* residentReleaseAdviceForToken(token, advice)
    for (const notice of yield* residentNoticesForToken(token)) yield* residentReleaseNoticeForToken(token, notice)
  }, Effect.uninterruptible)

  type SubmissionSurface = "edit" | "background" | "stop"
  const residentPendingSubmissionCapacity = Effect.fn("ResidentRuntime.pendingSubmissionCapacity")(function* (
    item: Advice,
    delivery: AdviceContent["delivery"]
  ) {
    if (item.round === undefined || item.workUnitId === undefined || delivery === undefined) return false
    return delivery.findings.length <= (yield* residentPendingCanonicalFindings(item.canonicalOperationId))
  })
  const residentSubmissionCandidateFacts = Effect.fn("ResidentRuntime.submissionCandidateFacts")(function* (
    snapshot: AdviceSnapshot,
    token: string,
    surface: SubmissionSurface
  ) {
    const { capability: item, content } = snapshot
    return {
      roundActive: yield* residentRoundActive(item.round),
      hasRound: item.round !== undefined,
      hasUnit: item.workUnitId !== undefined,
      hasDelivery: content.delivery !== undefined,
      pendingCapacity: yield* residentPendingSubmissionCapacity(item, content.delivery),
      submissionAllowed: yield* residentComposedDelivery.canBeginSubmission(
        adviceePartition(item.observation.root, item.observation.advicee),
        surface,
        token
      ),
      currentWork: yield* residentIsCurrentWork(item.revision, item.prepared),
      credentialAuthorized: residentAdviceCredentialAuthority(item)
    }
  })
  const residentSubmissionCandidateValid = Effect.fn("ResidentRuntime.submissionCandidateValid")(function* (
    advice: AdviceSnapshot,
    token: string,
    surface: SubmissionSurface
  ) {
    const facts = yield* residentSubmissionCandidateFacts(advice, token, surface)
    const command = residentDeliveryDecision(
      yield* residentLedger.transition({ kind: "deliverySubmissionCandidateCheck", facts }),
      "canonical submission candidate refused"
    )
    return command?.kind === "deliverySubmissionCandidate"
  })
  const residentSubmissionSelectionValid = Effect.fn("ResidentRuntime.submissionSelectionValid")(function* (
    token: string,
    advice: ReadonlyArray<AdviceSnapshot>,
    finishPermit: boolean
  ) {
    return (
      !finishPermit ||
      (yield* residentComposedDelivery.finishSelectionMatches(
        token,
        advice.map(({ capability, content }) => ({
          id: capability.id,
          unit: capability.canonicalOperationId,
          findings: content.delivery?.findings ?? []
        }))
      ))
    )
  })
  const residentAllSubmissionCandidatesValid = Effect.fn("ResidentRuntime.allSubmissionCandidatesValid")(function* (
    token: string,
    surface: SubmissionSurface,
    advice: ReadonlyArray<AdviceSnapshot>,
    selectionValid: boolean
  ) {
    let allValid = selectionValid
    for (const item of advice) {
      if (!allValid) break
      allValid = yield* residentSubmissionCandidateValid(item, token, surface)
    }
    return allValid
  })
  const residentAuthorizeStopSubmission = Effect.fn("ResidentRuntime.authorizeStopSubmission")(function* (
    token: string,
    surface: SubmissionSurface,
    advice: ReadonlyArray<AdviceSnapshot>
  ) {
    if (surface !== "stop") return true
    const first = advice[0]!.capability
    return yield* residentComposedDelivery.authorizeFinishOutput(
      adviceePartition(first.observation.root, first.observation.advicee),
      token
    )
  })
  const residentBeginSubmissionAdvice = Effect.fn("ResidentRuntime.beginSubmissionAdvice")(function* (
    token: string,
    surface: SubmissionSurface,
    advice: ReadonlyArray<AdviceSnapshot>,
    finishPermit: boolean,
    now: number
  ) {
    for (const { capability: item, content } of advice) {
      if (finishPermit) continue
      const begun = yield* residentComposedDelivery.beginSubmission(
        item.id,
        adviceePartition(item.observation.root, item.observation.advicee),
        token,
        content.delivery?.findings ?? [],
        surface,
        now,
        item.canonicalOperationId
      )
      if (!begun) {
        yield* runtime.releaseComposedSubmission(token)
        return false
      }
    }
    return true
  })
  const residentSubmissionAdvice = Effect.fn("ResidentRuntime.submissionAdvice")(function* (
    token: string,
    now: number
  ) {
    return (yield* residentLedger.advice.snapshots()).filter(
      ({ content }) =>
        content.delivery?.token === token && content.delivery.leaseUntil > now && content.delivery.findings.length > 0
    )
  })
  const residentSubmissionBatchReady = Effect.fn("ResidentRuntime.submissionBatchReady")(function* (
    count: number,
    allValid: boolean
  ) {
    const command = residentDeliveryDecision(
      yield* residentLedger.transition({ kind: "deliverySubmissionBatchCheck", count, allValid }),
      "canonical submission batch refused"
    )
    return command?.kind === "deliveryBatchProceed"
  })
  const residentStopFinishPermit = Effect.fn("ResidentRuntime.stopFinishPermit")(function* (
    surface: SubmissionSurface,
    token: string
  ) {
    return surface === "stop" && (yield* residentComposedDelivery.hasFinishPermit(token))
  })
  const beginComposedSubmission = Effect.fn("ResidentRuntime.beginComposedSubmission")(function* (
    token: string,
    surface: SubmissionSurface
  ): Effect.fn.Return<ResidentResponse> {
    const now = residentNow()
    yield* residentExpirePending(now)
    const finishPermit = yield* residentStopFinishPermit(surface, token)
    if (finishPermit && (yield* residentComposedDelivery.isFinishAuthorized(token))) return { status: "empty" }
    if (!(yield* residentComposedDelivery.canBeginExistingToken(surface, token))) return { status: "empty" }
    const advice = yield* residentSubmissionAdvice(token, now)
    const selectionValid = yield* residentSubmissionSelectionValid(token, advice, finishPermit)
    const allValid = yield* residentAllSubmissionCandidatesValid(token, surface, advice, selectionValid)
    if (!(yield* residentSubmissionBatchReady(advice.length, allValid))) {
      yield* runtime.releaseComposedSubmission(token)
      return { status: "empty" }
    }
    if (!(yield* residentAuthorizeStopSubmission(token, surface, advice))) return { status: "empty" }
    if (!(yield* residentBeginSubmissionAdvice(token, surface, advice, finishPermit, now))) return { status: "empty" }
    return { status: "submitting" }
  }, Effect.uninterruptible)

  const releaseComposedSubmission = Effect.fn("ResidentRuntime.releaseComposedSubmission")(function* (
    token: string
  ): Effect.fn.Return<ResidentResponse> {
    yield* residentComposedDelivery.release(token)
    yield* runtime.releaseDelivery(token)
    return { status: "released" }
  }, Effect.uninterruptible)

  const residentDispatcherWorkCount = Effect.fn("ResidentRuntime.dispatcherWorkCount")(function* (partition: string) {
    const jobs = yield* residentDispatcher.snapshotWhere(({ key }) => key === partition)
    return jobs.queued + jobs.running
  })
  const residentComposedWorkCount = Effect.fn("ResidentRuntime.composedWorkCount")(function* (partition: string) {
    const round = yield* residentLedger.rounds.get(partition)
    return round === undefined ? 0 : (yield* residentLedger.rounds.policyWork(round)).unfinished()
  })
  const residentLeasedAdviceCount = Effect.fn("ResidentRuntime.leasedAdviceCount")(function* (
    partition: string,
    composed: boolean
  ) {
    return (yield* residentLedger.advice.snapshots()).filter(
      ({ capability: item, content }) =>
        (composed ? adviceePartition(item.observation.root, item.observation.advicee) : item.partition) === partition &&
        content.delivery !== undefined
    ).length
  })
  const residentLeasedNoticeCount = Effect.fn("ResidentRuntime.leasedNoticeCount")(function* (
    partition: string,
    composed: boolean
  ) {
    return [...(yield* residentNotices.entries()).map(([, value]) => value)].filter(
      (notice) =>
        (composed ? notice.deliveryGroup : notice.partition) === partition && notice.pending?.delivery !== undefined
    ).length
  })
  const residentCollectionWorkCount = Effect.fn("ResidentRuntime.collectionWorkCount")(function* (
    root: string,
    advicee: DirectAdvicee,
    composed = false
  ): Effect.fn.Return<number> {
    const partition = adviceePartition(root, advicee)
    const dispatcherWork = composed ? 0 : yield* residentDispatcherWorkCount(partition)
    const work = composed ? yield* residentComposedWorkCount(partition) : dispatcherWork
    const pendingEdits = composed && (yield* residentComposedDelivery.hasPendingEdits(partition))
    return (
      Number(pendingEdits) +
      work +
      (yield* residentLeasedAdviceCount(partition, composed)) +
      (yield* residentLeasedNoticeCount(partition, composed))
    )
  })

  const residentCollectionWorkState = Effect.fn("ResidentRuntime.collectionWorkState")(function* (
    root: string,
    advicee: DirectAdvicee,
    composed = false
  ): Effect.fn.Return<{ readonly status: "pending" | "empty" }> {
    return { status: (yield* residentCollectionWorkCount(root, advicee, composed)) > 0 ? "pending" : "empty" }
  })

  const whenIdle = Effect.fn("ResidentRuntime.whenIdle")(() => residentDispatcher.whenIdle())

  const pendingAdviceMetadata = Effect.fn("ResidentRuntime.pendingAdviceMetadata")(function* (): Effect.fn.Return<
    Effect.Success<ReturnType<ResidentRuntime["pendingAdviceMetadata"]>>
  > {
    return yield* Effect.forEach(
      yield* residentLedger.advice.snapshots(),
      Effect.fn("ResidentRuntime.adviceMetadata")(function* ({ capability: advice, content }) {
        const reservation = yield* residentLedger.reservationSnapshot(advice.reservation)
        if (reservation === undefined) throw new Error("advice metadata lost reservation ownership")
        return {
          id: advice.id,
          partition: advice.partition,
          sequence: advice.sequence,
          pendingAt: advice.pendingAt,
          collectionEligible: content.collectionEligible,
          retainedBytes: reservation.bytes,
          generation: advice.revision.generation,
          evaluationIdentities: content.evaluations.map(({ prepared }) => prepared.identity),
          path: advice.prepared.input.path,
          pendingFindings: content.findings.length,
          deliveryFindings: content.delivery?.findings.length ?? 0,
          delivery:
            content.delivery === undefined
              ? "available"
              : content.delivery.acknowledged
                ? "leased-acknowledged"
                : "leased-unacknowledged"
        } as const
      })
    )
  })

  const accountingMetrics = Effect.fn("ResidentRuntime.accountingMetrics")(function* (): Effect.fn.Return<
    Effect.Success<ReturnType<ResidentRuntime["accountingMetrics"]>>
  > {
    const reuse = yield* residentReuse.snapshot()
    const notices = yield* residentNotices.entries()
    const runtimeState = yield* residentLedger.runtime.snapshot()
    let noticeBytes = 0
    for (const [, cooldown] of notices) {
      const reservation = yield* residentLedger.reservationSnapshot(cooldown.reservation)
      if (reservation === undefined) throw new Error("notice accounting lost reservation ownership")
      noticeBytes += reservation.bytes
    }
    return {
      peakLedgerBytes: runtimeState.peakLedgerBytes,
      maxMaterializedPreparedUnits: runtimeState.maxMaterializedPreparedUnits,
      successfulCacheEntries: reuse.entries,
      successfulCacheBytes: reuse.bytes,
      pendingEvaluations: reuse.pending,
      operationalNoticeKeys: notices.length,
      pendingOperationalNotices: notices.filter(([, cooldown]) => cooldown.pending !== undefined).length,
      operationalNoticeBytes: noticeBytes
    }
  })

  const residentPendingNoticeCount = Effect.fn("ResidentRuntime.pendingNoticeCount")(
    function* (): Effect.fn.Return<number> {
      let count = 0
      for (const cooldown of (yield* residentNotices.entries()).map(([, value]) => value)) {
        if (cooldown.pending !== undefined) count += 1
      }
      return count
    }
  )

  const residentNoticesForToken = Effect.fn("ResidentRuntime.noticesForToken")(function* (
    token: string
  ): Effect.fn.Return<Array<PendingNotice>> {
    const notices: Array<PendingNotice> = []
    for (const cooldown of (yield* residentNotices.entries()).map(([, value]) => value)) {
      if (cooldown.pending?.delivery?.token === token) notices.push(cooldown.pending)
    }
    return notices
  })

  const residentRemovePendingNotice = Effect.fn("ResidentRuntime.removePendingNotice")((id: string, token?: string) =>
    residentNotices.remove(id, token)
  )

  const residentReleaseNoticeCooldown = Effect.fn("ResidentRuntime.releaseNoticeCooldown")((key: string) =>
    residentNotices.drop(key)
  )

  const residentPruneNoticeCooldowns = Effect.fn("ResidentRuntime.pruneNoticeCooldowns")(
    (now: number, exceptKey?: string) => residentNotices.prune(now, exceptKey)
  )

  const residentRecordOperationalFailure = Effect.fn("ResidentRuntime.recordOperationalFailure")(function* (
    observation: DirectObservation,
    kind: OperationalNoticeKind,
    now?: number
  ): Effect.fn.Return<void> {
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active" || !addressableAdvicee(observation.advicee))
      return
    yield* residentNotices.record(adviceePartition(observation.root, observation.advicee), kind, now ?? residentNow())
  })

  const residentAdviceCollectionReady = (
    advice: Advice,
    content: AdviceContent,
    composed: boolean,
    generation: number
  ): boolean => {
    if (!content.collectionEligible) return false
    return composed && advice.round !== undefined ? advice.round.generation === generation : true
  }
  const residentFindingSelectionFacts = Effect.fn("ResidentRuntime.findingSelectionFacts")(function* (
    advice: Advice,
    partition: string,
    credentialGeneration: number | null,
    now: number,
    composed: boolean
  ): Effect.fn.Return<FindingSelectionFacts> {
    const partitionId = yield* residentLedger.knownPartitionId(partition)
    if (partitionId === undefined) throw new Error("finding selection lost its resident partition identity")
    const content = yield* residentLedger.advice.current(advice)
    const generation = composed ? yield* residentComposedDelivery.generation(partition) : 0
    return {
      partition: partitionId,
      round: generation,
      unit: advice.revision.generation,
      snapshot: advice.revision.generation,
      currentSnapshot: yield* residentLedger.revision.generation(advice.revision.subject),
      credential: advice.credentialGeneration ?? 0,
      currentCredential: credentialGeneration ?? 0,
      ageMs: Math.floor(Math.max(0, now - advice.pendingAt)),
      collectionReady: residentAdviceCollectionReady(advice, content, composed, generation)
    }
  })

  const residentRegisterRevision = Effect.fn("ResidentRuntime.registerRevision")(function* (
    partition: string,
    prepared: PreparedUnit,
    addMember: boolean
  ): Effect.fn.Return<WorkRevision> {
    const { revision, replaced } = yield* residentLedger.revision.register(partition, prepared, addMember, randomUUID())
    if (replaced) yield* residentRetireSuperseded(revision.subject, revision.generation, addMember)
    return revision
  }, Effect.uninterruptible)

  const residentRegisterCurrentWork = Effect.fn("ResidentRuntime.registerCurrentWork")(
    (partition: string, prepared: PreparedUnit) => residentRegisterRevision(partition, prepared, true)
  )

  const residentRetireSuperseded = Effect.fn("ResidentRuntime.retireSuperseded")(function* (
    subject: string,
    generation: number,
    includeJoined: boolean
  ) {
    const superseded = (revision: WorkRevision) => residentLedger.revision.superseded(subject, revision)
    if ((yield* residentLedger.revision.generation(subject)) !== generation)
      throw new Error("canonical revision changed")
    if (includeJoined) {
      for (const review of yield* residentJoined.retireSuperseded(subject)) {
        recordActivity({
          statePath: review.activityPath,
          root: review.observation.root,
          advicee: review.observation.advicee,
          lifetime: runtime.lifetime,
          stage: "unavailable",
          unitIdentity: review.evaluationKey
        })
      }
    }
    for (const advice of [...(yield* residentAdvice())]) {
      if (yield* superseded(advice.revision))
        yield* residentRemoveAdvice(advice.id, undefined, { fate: "stale", reason: "resident-stale" })
    }
  })

  const residentRestoreCurrentWork = Effect.fn("ResidentRuntime.restoreCurrentWork")(
    (partition: string, prepared: PreparedUnit) => residentRegisterRevision(partition, prepared, false)
  )

  const residentIsCurrentWork = Effect.fn("ResidentRuntime.isCurrentWork")(
    (revision: WorkRevision, prepared: PreparedUnit) => residentLedger.revision.current(revision, prepared)
  )

  const residentReleaseCurrentWork = Effect.fn("ResidentRuntime.releaseCurrentWork")((revision: WorkRevision) =>
    residentLedger.revision.release(revision)
  )

  const residentReleaseUnit = Effect.fn("ResidentRuntime.releaseUnit")(function* (
    job: Pick<UnitJob, "reservation" | "revision" | "released">
  ) {
    if (job.released) return
    job.released = true
    yield* residentLedger.release(job.reservation)
    yield* residentReleaseCurrentWork(job.revision)
  }, Effect.uninterruptible)

  const residentRemoveAdvice = Effect.fn("ResidentRuntime.removeAdvice")(function* (
    id: string,
    token?: string,
    retirement?: {
      readonly fate: Parameters<typeof captureInspectionFate>[1]
      readonly reason: Parameters<typeof captureInspectionFate>[2]
    }
  ) {
    const advice = (yield* residentAdvice()).find((item) => item.id === id)
    if (advice === undefined) return false
    const expired = yield* residentAdviceExpired(advice, residentNow())
    const findings = (yield* residentLedger.advice.current(advice)).findings
    const removed = yield* residentLedger.advice.remove(advice, expired ? "expired" : "stale", token)
    if (removed && inspection.isEnabled(advice.observation.root)) {
      const evaluationId = inspectionOrigins.get(advice.evaluationKey)
      inspection.offer(
        {
          root: advice.observation.root,
          runtime: advice.observation.advicee.host,
          runtimeVersion: advice.observation.advicee.hostVersion,
          sessionId: advice.observation.advicee.sessionId,
          subagentId: advice.observation.advicee.subagentId
        },
        evaluationId === undefined ? {} : { evaluationId },
        captureInspectionFate(
          findings,
          expired ? "expired" : (retirement?.fate ?? "discarded"),
          expired ? "retention-expired" : (retirement?.reason ?? "publication-retired"),
          advice.id
        )
      )
    }
    return removed
  }, Effect.uninterruptible)

  const residentExpirePending = Effect.fn("ResidentRuntime.expirePending")(function* (now: number) {
    yield* residentComposedDelivery.expire(now)
    for (const advice of [...(yield* residentAdvice())]) {
      if (yield* residentAdviceExpired(advice, now)) yield* residentRemoveAdvice(advice.id)
    }
  }, Effect.uninterruptible)

  const sweepQuietRounds = Effect.fn("ResidentRuntime.sweepQuietRounds")((requestedNow?: number) =>
    Effect.gen(function* () {
      const now = requestedNow ?? residentNow()
      if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return 0
      yield* residentExpirePending(now)
      yield* residentPruneNoticeCooldowns(now)
      let closedCount = 0
      for (const [group, round] of yield* residentLedger.rounds.entries()) {
        const work = yield* residentDispatcher.snapshotWhere(({ value }) => value.round === round && !value.completed)
        const counts = yield* residentComposedDelivery.closureCounts(group)
        const closed = yield* residentComposedDelivery.tickQuietRound(group, now, {
          nativeWorkIdle: work.queued === 0 && work.running === 0,
          adviceEmpty:
            !(yield* residentAdvice()).some((advice) => advice.round === round) &&
            ![...(yield* residentNotices.entries()).map(([, value]) => value)].some(
              (notice) => notice.partition === group
            )
        })
        if (closed !== undefined) {
          yield* residentCloseRound(group, closed, "quiescent", counts)
          closedCount += 1
        }
      }
      return closedCount
    }).pipe(Effect.uninterruptible)
  )

  const residentRoundActive = Effect.fn("ResidentRuntime.roundActive")(function* (
    round: RoundWork | undefined
  ): Effect.fn.Return<boolean> {
    return (
      round === undefined ||
      (!round.controller.signal.aborted && (yield* residentComposedDelivery.isActive(round.group, round.generation)))
    )
  })

  const residentAllowFinish = Effect.fn("ResidentRuntime.allowFinish")(function* (
    group: string,
    token: string,
    reason: RoundCloseReason
  ): Effect.fn.Return<void> {
    const counts = yield* residentComposedDelivery.closureCounts(group)
    const closed = yield* residentComposedDelivery.finishStop(group, token, true, residentNow())
    if (closed !== undefined) yield* residentCloseRound(group, closed, reason, counts)
  }, Effect.uninterruptible)

  const residentJobActive = Effect.fn("ResidentRuntime.jobActive")(function* (job: Job): Effect.fn.Return<boolean> {
    return (
      (yield* residentLedger.runtime.snapshot()).lifecycle === "active" &&
      !residentLifetimeController.signal.aborted &&
      !job.work?.controller.signal.aborted &&
      (yield* residentRoundActive(job.round))
    )
  })

  // Cutoff publication, native cancellation and discarded-job release share
  // one uninterruptible workflow; physical Jev permits still await settlement.
  const residentDiscardUnfinishedWork = Effect.fn("ResidentRuntime.discardUnfinishedWork")(function* (
    round: RoundWork,
    cancellation: { readonly cancelledSource: ReadonlyArray<number>; readonly cancelledJev: ReadonlyArray<number> }
  ): Effect.fn.Return<boolean> {
    const work = (yield* residentRoundSnapshot(round)).work
    const sourceIds = new Set(cancellation.cancelledSource)
    const unitIds = new Set(cancellation.cancelledJev)
    const named = (job: Job): boolean =>
      job.kind === "ingress" ? sourceIds.has(job.canonicalObservationId) : unitIds.has(job.canonicalOperationId)
    const namedCounts = yield* residentDispatcher.snapshotWhere(
      ({ value }) => value.work === work && !value.completed && named(value)
    )
    const hasUnnamed = yield* residentDispatcher.hasWorkWhere(
      ({ value }) => value.work === work && !value.completed && !named(value)
    )
    const replacement = yield* residentLedger.rounds.replaceWork(
      round,
      { id: randomUUID(), controller: new AbortController() },
      {
        named: namedCounts,
        all: yield* residentDispatcher.snapshotWhere(({ value }) => value.work === work && !value.completed),
        cancelled: sourceIds.size + unitIds.size,
        hasUnnamed
      }
    )
    if (replacement === undefined) throw new Error("native work cutoff lost its round capability")
    const { matched, previousWork } = replacement
    previousWork.controller.abort()
    const discarded = yield* residentDispatcher.discardWhere(
      ({ value }) => value.work === work && (named(value) || !matched)
    )
    for (const job of discarded) yield* residentDiscardJob(job)
    return matched
  }, Effect.uninterruptible)

  const residentDiscardJob = Effect.fn("ResidentRuntime.discardJob")(function* (job: Job) {
    if (job.completed) return
    if (!job.analyticsDiscardReported) {
      job.analyticsDiscardReported = true
      yield* residentRecordAnalytics(job, "work-discarded")
    }
    if (job.kind === "ingress") {
      yield* residentLedger.observation(
        job.partition,
        job.canonicalObservationId,
        "interruptObservation",
        job.canonicalRound
      )
    }
    if (job.kind === "unit") {
      yield* residentSettleJoined(job.evaluationKey, "unavailable", "lost")
      yield* residentReleaseReuseClaim(job.evaluationKey)
      // An issued Jev permit remains reserved until its native Effect settles.
      if (job.requestId === undefined) yield* residentReleaseUnit(job)
    } else yield* residentLedger.release(job.reservation)
    recordActivity({
      statePath: job.dispatch.activityPath,
      root: job.observation.root,
      advicee: job.observation.advicee,
      lifetime: runtime.lifetime,
      stage: "incomplete"
    })
  }, Effect.uninterruptible)

  const residentCloseRound = Effect.fn("ResidentRuntime.closeRound")(function* (
    group: string,
    generation: number,
    reason: RoundCloseReason,
    counts: ReturnType<ComposedDelivery["closureCounts"]>
  ): Effect.fn.Return<void> {
    // finishStop can release an unwritten provisional slot after callers took
    // the pre-cleanup snapshot. Report the final Bend reservation count.
    const reservedContinuations = (yield* residentComposedDelivery.closureCounts(group)).reservedContinuations
    const round = yield* residentLedger.rounds.get(group)
    const snapshot = round === undefined ? undefined : yield* residentRoundSnapshot(round)
    const activity = snapshot?.activity
    const work =
      round === undefined
        ? { queued: 0, running: 0 }
        : yield* residentDispatcher.snapshotWhere(
            ({ value }) => value.round === round && !value.completed && !value.work?.controller.signal.aborted
          )
    const reportRoundClosure = Effect.fn("ResidentRuntime.reportRoundClosure")(function* () {
      if (activity !== undefined)
        recordRoundClosure({
          statePath: activity.activityPath,
          root: activity.root,
          advicee: activity.advicee,
          lifetime: runtime.lifetime,
          roundIdentity: `${group}:${round?.canonicalRound ?? generation}`,
          reason,
          reservedContinuations,
          discarded: {
            queued: work.queued + (snapshot?.discarded.queued ?? 0),
            running: work.running + (snapshot?.discarded.running ?? 0),
            pendingAdvice:
              round === undefined ? 0 : (yield* residentAdvice()).filter((advice) => advice.round === round).length,
            submitted: counts.submitted,
            uncertain: counts.uncertain,
            editPermits: counts.editPermits
          }
        })
    })
    yield* reportRoundClosure()
    if (round === undefined || round.generation !== generation) return
    // The admission/output fence is already published. Abort Effect fibers and
    // their provider connections before releasing all retained round resources.
    if (snapshot === undefined) throw new Error("native round closure lost its snapshot")
    const retireRoundResources = Effect.fn("ResidentRuntime.retireRoundResources")(function* () {
      round.controller.abort()
      snapshot.work.controller.abort()
      const discarded = yield* residentDispatcher.discardWhere(({ value }) => value.round === round)
      for (const job of discarded) yield* residentDiscardJob(job)
      for (const advice of [...(yield* residentAdvice())])
        if (advice.round === round)
          yield* residentRemoveAdvice(advice.id, undefined, { fate: "discarded", reason: "round-closed" })
      for (const [key, notice] of yield* residentNotices.entries()) {
        if (notice.partition === round.group) yield* residentReleaseNoticeCooldown(key)
      }
      yield* residentReuse.discardPartition(round.group)
      yield* residentLedger.rounds.retire(round)
    })
    yield* retireRoundResources()
  }, Effect.uninterruptible)

  const residentRun = Effect.fn("ResidentRuntime.run")((job: Job, sequence: number) =>
    job.kind === "ingress" ? residentPrepare(job, sequence) : residentEvaluateUnit(job, sequence)
  )

  const residentObserveDispatchAuthority = Effect.fn("ResidentRuntime.observeDispatchAuthority")(function* (
    job: UnitJob,
    details: DispatchAuthorityObservationDetails
  ): Effect.fn.Return<void> {
    const observer = residentDispatchAuthorityObserver
    if (observer === undefined) return
    const observation: DispatchAuthorityObservation = {
      kind: "dispatchAuthority",
      sequence: yield* residentLedger.runtime.nextAuthoritySequence(),
      evaluationId: createHash("sha256").update(job.evaluationKey, "utf8").digest("hex"),
      path: job.prepared.input.path,
      ...details,
      expectedRootIdentitySha256: createHash("sha256")
        .update(canonicalValue(job.observation.rootIdentity), "utf8")
        .digest("hex")
    }
    try {
      observer(observation)
    } catch {
      // Fixture observation must not change resident dispatch behavior.
    }
  })

  const residentRecordAnalytics = Effect.fn("ResidentRuntime.recordAnalytics")(
    (
      job: Pick<Job, "observation" | "dispatch"> & { readonly analyticsEnabled?: boolean },
      kind: AnalyticsKind,
      findings: ReadonlyArray<Finding> = []
    ) =>
      Effect.sync(() => {
        const enabled = job.analyticsEnabled ?? job.dispatch.sessionAnalytics === true
        if (!enabled || job.dispatch.activityPath === undefined) return
        recordAnalytics({
          enabled,
          statePath: job.dispatch.activityPath,
          root: job.observation.root,
          advicee: job.observation.advicee,
          lifetime: runtime.lifetime,
          kind,
          controlled: job.dispatch.controlled !== null,
          findings: findings.length,
          ruleIds: findings.map((finding) => finding.ruleId)
        })
      })
  )

  function residentObserveJevRequest(observation: JevRequestObservation): void {
    try {
      residentJevRequestObserver?.(observation)
    } catch {
      // Fixture observation must not change request execution.
    }
  }

  const residentCredentialRequired = (controlled: ControlledDecisionModelOptions | undefined): boolean =>
    controlled === undefined || controlled.requireCredential === true
  const residentCredentialShapeMatches = (
    dispatch: ResidentDispatchContext,
    name: string,
    required: boolean
  ): boolean => !required || (dispatch.credential?.name === name && dispatch.credential !== null)
  const residentCredentialGenerationCurrent = (dispatch: ResidentDispatchContext, required: boolean): boolean =>
    !required ||
    dispatch.credential === null ||
    readCredentialState(dispatch.credential.statePath).generation === dispatch.credential.generation
  const residentRetireCachedUnit = Effect.fn("ResidentRuntime.retireCachedUnit")(function* (
    unit: UnitJob,
    round: RoundWork | undefined,
    id: number | undefined
  ) {
    if (unit.completed || round === undefined || id === undefined) return
    ;(yield* residentLedger.rounds.policyWork(round)).retire(id)
    yield* residentReleaseUnit(unit)
  })
  const residentOptionalUserConfig = (dispatch: ResidentDispatchContext): string | undefined =>
    dispatch.userConfigPath ?? undefined
  const residentUserConfigOptions = (path: string | undefined) => (path === undefined ? {} : { userConfigPath: path })
  const residentPrepare = Effect.fn("ResidentRuntime.prepare")((job: IngressJob, sequence: number) => {
    const server = runtime
    const expectedActivityUnits: Array<string> = []
    const unassignedClaims = new Set<string>()
    const activeWorkspaces = new Set<CapacityReservation>()
    const preparationSignal = job.work?.controller.signal ?? residentLifetimeController.signal
    return Effect.gen(function* () {
      const startCanonicalSource = Effect.fn("ResidentRuntime.startCanonicalSource")(function* () {
        if (job.round === undefined || job.workObservationId === undefined) return true
        return (yield* residentLedger.rounds.policyWork(job.round)).startSource(job.workObservationId)
      })
      const startSourcePreparation = Effect.fn("ResidentRuntime.startSourcePreparation")(function* () {
        if (!(yield* startCanonicalSource())) {
          yield* residentLedger.release(job.reservation)
          return false
        }
        if (
          !(yield* residentLedger.observation(
            job.partition,
            job.canonicalObservationId,
            "startObservation",
            job.canonicalRound
          ))
        ) {
          yield* residentLedger.release(job.reservation)
          return false
        }
        yield* residentAwaitBackendGate()
        if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") {
          yield* residentLedger.release(job.reservation)
          return false
        }
        return true
      })
      if (!(yield* startSourcePreparation())) return
      const userConfigPath = residentOptionalUserConfig(job.dispatch)
      const controlled = decodeControlledOptions(job.dispatch.controlled)
      const settings = yield* withinWork(
        Effect.gen(function* () {
          const settings = yield* loadReviewSettings(job.observation.root, residentUserConfigOptions(userConfigPath))
          if (job.dispatch.controlled !== null && controlled === undefined) return undefined
          const credentialRequired = residentCredentialRequired(controlled)
          if (!residentCredentialShapeMatches(job.dispatch, settings.credentialEnvVar, credentialRequired))
            return undefined
          if (!(yield* verifyObservationRoot(job.observation))) return undefined
          if (!residentCredentialGenerationCurrent(job.dispatch, credentialRequired)) return undefined
          return settings
        }),
        preparationSignal
      )
      yield* residentLedger.release(job.reservation)
      if (
        settings === undefined ||
        (yield* residentLedger.runtime.snapshot()).lifecycle !== "active" ||
        !(yield* residentJobActive(job))
      ) {
        yield* residentRecordAnalytics(job, "preparation-failed")
        recordActivity({
          statePath: job.dispatch.activityPath,
          root: job.observation.root,
          advicee: job.observation.advicee,
          lifetime: server.lifetime,
          stage: "unavailable"
        })
        return
      }

      const analyticsEnabled = effectiveSessionAnalytics(settings.configuration.policy)
      job.analyticsEnabled = analyticsEnabled

      // A candidate path is captured and analyzed only while its maximum
      // supported logical workspace is charged. Processing candidates one at
      // a time prevents a 16-path event from materializing 1,024 complete
      // inputs outside the ledger.
      const prepareCandidate = Effect.fn("ResidentRuntime.prepareCandidate")(function* (
        candidate: DirectObservation["candidates"][number]
      ) {
        if (!(yield* residentJobActive(job))) return false
        const preparation = yield* residentLedger.beginObservedPreparation(
          job.partition,
          job.canonicalObservationId,
          captureWorkspaceBytes(candidate.path),
          job.canonicalRound
        )
        if (preparation === undefined) {
          yield* residentLedger.runtime.rejectCapacity()
          yield* residentRecordAnalytics(job, "capacity-rejected")
          recordActivity({
            statePath: job.dispatch.activityPath,
            root: job.observation.root,
            advicee: job.observation.advicee,
            lifetime: server.lifetime,
            stage: "unavailable"
          })
          return true
        }
        const workspace = preparation.reservation
        activeWorkspaces.add(workspace)
        const pathObservation: DirectObservation = { ...job.observation, candidates: [candidate] }
        const prepared: PreparedObservation = yield* withinWork(
          Effect.gen(function* () {
            return yield* prepareObservation(pathObservation, {
              controlledWriter: true,
              advicee: pathObservation.advicee,
              settings,
              observePreparationOmission: (path, declaration, reason) => {
                const receipt = job.inspectionReceipt
                if (receipt !== undefined && inspection.isEnabled(receipt.scope.root))
                  inspection.offer(receipt.scope, receipt.correlation, {
                    kind: "preparation-omission",
                    path,
                    declaration,
                    reason
                  })
              },
              ...(job.inspectionReceipt === undefined
                ? {}
                : {
                    captureHooks: {
                      sourceRead: (path: string) => {
                        const receipt = job.inspectionReceipt
                        if (receipt === undefined || !inspection.isEnabled(receipt.scope.root)) return
                        try {
                          inspection.offer(receipt.scope, receipt.correlation, { kind: "preparation-read", path })
                        } catch {
                          /* Optional observation cannot invalidate the actual source read. */
                        }
                      }
                    }
                  }),
              ...(residentCaptureSource === undefined ? {} : { captureSource: residentCaptureSource }),
              beforeAnalyze: (path, sourceBytes, preflight) =>
                Effect.gen(function* () {
                  const required = analysisWorkspaceBytes(path, sourceBytes, preflight, settings.rules)
                  const resized = yield* residentLedger.resize(workspace, required)
                  if (!resized) {
                    yield* residentLedger.runtime.rejectCapacity()
                    yield* residentRecordAnalytics(job, "capacity-rejected")
                  }
                  return resized
                })
            })
          }),
          preparationSignal
        ).pipe(Effect.onError(() => residentLedger.release(workspace)))
        if (job.inspectionReceipt !== undefined) {
          const receipt = job.inspectionReceipt
          for (const outcome of prepared.outcomes) {
            if (outcome.status === "skipped")
              inspection.offer(receipt.scope, receipt.correlation, { kind: "preparation-skipped", path: outcome.path })
          }
          for (const outcome of prepared.observation.outcomes) {
            if (outcome.status === "incomplete") {
              inspection.offer(receipt.scope, receipt.correlation, {
                kind: "preparation-omission",
                path: outcome.path,
                reason: outcome.reason
              })
            } else if (outcome.analysis.status === "incomplete") {
              for (const failure of outcome.analysis.failures) {
                inspection.offer(receipt.scope, receipt.correlation, {
                  kind: "preparation-omission",
                  path: outcome.path,
                  reason: failure.reason,
                  ...(failure.root === undefined ? {} : { declaration: failure.root })
                })
              }
            }
          }
        }
        if (!(yield* residentJobActive(job))) {
          yield* residentLedger.release(workspace)
          return false
        }
        const admitPreparedOutcomes = Effect.fn("ResidentRuntime.admitPreparedOutcomes")(function* () {
          const ready: Extract<(typeof prepared.outcomes)[number], { status: "ready" }>[] = []
          for (const outcome of prepared.outcomes) {
            const offer = yield* residentLedger.preparedOffer(outcome.status === "ready", true)
            if (offer === "preparedAdmitted" && outcome.status === "ready") ready.push(outcome)
          }
          if (ready.length === 0) {
            yield* residentRecordAnalytics(
              job,
              prepared.observation.status === "incomplete" ? "incomplete-candidate" : "skipped-candidate"
            )
            recordActivity({
              statePath: job.dispatch.activityPath,
              root: job.observation.root,
              advicee: job.observation.advicee,
              lifetime: server.lifetime,
              stage: prepared.observation.status === "incomplete" ? "incomplete" : "skipped"
            })
          }
          return ready
        })
        const ready = yield* admitPreparedOutcomes()
        yield* residentLedger.runtime.observePreparedUnits(ready.length)
        const filterDeliverableOutcomes = Effect.fn("ResidentRuntime.filterDeliverableOutcomes")(function* () {
          let rejectedDeliverable = false
          const deliverable: typeof ready = []
          for (const outcome of ready) {
            const accepted =
              (yield* residentLedger.preparedOffer(
                true,
                residentUnitWorstOutcomeBytes(outcome.prepared) <= MAX_IPC_FRAME_BYTES - 1024
              )) === "preparedAdmitted"
            if (!accepted) {
              yield* residentLedger.runtime.rejectCapacity()
              yield* residentRecordAnalytics(job, "capacity-rejected")
              rejectedDeliverable = true
            }
            if (accepted) deliverable.push(outcome)
          }
          return { rejectedDeliverable, deliverable }
        })
        const { rejectedDeliverable, deliverable } = yield* filterDeliverableOutcomes()
        const preparationGenerationPartition = () => {
          const generationPartition = `${job.partition}\0work:${job.work?.id ?? "standalone"}\0credential-generation:${job.dispatch.credential?.generation ?? "controlled"}`
          return generationPartition
        }
        const planned = yield* Effect.forEach(
          deliverable,
          Effect.fn("ResidentRuntime.planPreparedUnit")(function* (outcome) {
            const generationPartition = preparationGenerationPartition()
            const evaluationKey = residentReuse.key(generationPartition, outcome.prepared)
            const liveAdvice = (yield* residentAdvice()).some((advice) => advice.evaluationKey === evaluationKey)
            switch (yield* residentReuse.route(evaluationKey, liveAdvice)) {
              case "joinedAdvice":
                return { kind: "joined" as const, join: "advice" as const, outcome, evaluationKey }
              case "joinedClaimed":
                return { kind: "joined" as const, join: "claimed" as const, outcome, evaluationKey }
              case "joinedPending": {
                const pending = yield* residentReuse.pending(evaluationKey)
                if (pending === undefined) throw new Error("canonical reuse route lacks pending evaluation")
                pending.revision = yield* residentRestoreCurrentWork(job.partition, outcome.prepared)
                return { kind: "joined" as const, join: "pending" as const, outcome, evaluationKey }
              }
              case "cached":
                return {
                  kind: "cached" as const,
                  outcome,
                  evaluationKey,
                  cached: yield* residentReuse.cached(evaluationKey)
                }
              case "owner":
                unassignedClaims.add(evaluationKey)
                return { kind: "owner" as const, outcome, evaluationKey }
            }
          })
        )
        for (const item of planned) {
          const receipt = job.inspectionReceipt
          if (item.kind === "owner") inspectionOrigins.delete(item.evaluationKey)
          if (receipt === undefined || !inspection.isEnabled(receipt.scope.root)) continue
          if (item.kind === "owner") {
            if (inspectionOrigins.size >= 512) {
              const oldest = inspectionOrigins.keys().next().value
              if (oldest !== undefined) inspectionOrigins.delete(oldest)
            }
            inspectionOrigins.set(item.evaluationKey, randomUUID())
          }
          const evaluationId = inspectionOrigins.get(item.evaluationKey)
          inspection.offer(
            receipt.scope,
            { ...receipt.correlation, ...(evaluationId === undefined ? {} : { evaluationId }) },
            {
              kind: "evaluation-route",
              route:
                item.kind === "owner"
                  ? "fresh"
                  : item.kind === "cached"
                    ? "cached"
                    : item.join === "advice"
                      ? "existing-advice"
                      : item.join === "pending"
                        ? "joined-pending"
                        : "joined-claimed",
              semanticIdentity: item.outcome.prepared.identity,
              path: item.outcome.path,
              declaration: item.outcome.prepared.input.declaration.name,
              original:
                evaluationId === undefined
                  ? { status: "missing", reason: "not-captured" }
                  : { status: "linked", evaluationId }
            }
          )
        }
        const recordReuseAnalytics = Effect.fn("ResidentRuntime.recordReuseAnalytics")(function* () {
          for (const item of planned) {
            if (item.kind === "cached")
              yield* residentRecordAnalytics(job, "cache-hit", item.cached.evaluation.findings)
            else if (item.kind === "joined") yield* residentRecordAnalytics(job, "joined-review")
          }
        })
        yield* recordReuseAnalytics()
        const observeOwnerBoundary = Effect.fn("ResidentRuntime.observeOwnerBoundary")(function* () {
          if (planned.some((item) => item.kind === "owner")) {
            yield* withinWork(
              residentPreparationControls
                .afterReuseBoundary("ownerClaimed")
                .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "owner claim barrier" }))),
              preparationSignal
            )
          }
        })
        yield* observeOwnerBoundary()
        if (!(yield* residentJobActive(job))) {
          yield* residentLedger.release(workspace)
          return false
        }
        const retained = planned.filter(
          (item) => item.kind === "owner" || (item.kind === "cached" && item.cached.evaluation.findings.length > 0)
        )
        const reservations = yield* residentLedger.completePreparation(
          job.partition,
          preparation.operation,
          workspace,
          retained.map((item) => residentUnitReservationBytes(pathObservation, job.dispatch, item.outcome.prepared)),
          job.canonicalRound
        )
        activeWorkspaces.delete(workspace)
        // Workspace has been released and all accepted unit reservations are
        // fixed, so best-effort notice retention cannot displace fresh work.
        const recordRejectedDeliverable = Effect.fn("ResidentRuntime.recordRejectedDeliverable")(function* () {
          if (rejectedDeliverable) {
            yield* residentRecordOperationalFailure(job.observation, "capacity")
            recordActivity({
              statePath: job.dispatch.activityPath,
              root: job.observation.root,
              advicee: job.observation.advicee,
              lifetime: server.lifetime,
              stage: "unavailable"
            })
          }
        })
        yield* recordRejectedDeliverable()
        const recordReuseObservation = Effect.fn("ResidentRuntime.recordReuseObservation")(function* (
          item: (typeof planned)[number]
        ) {
          if (item.kind === "cached" && item.cached.evaluation.findings.length === 0) {
            const revision = yield* residentRegisterCurrentWork(job.partition, item.outcome.prepared)

            yield* residentReleaseCurrentWork(revision)
            expectedActivityUnits.push(item.evaluationKey)
            recordActivity({
              statePath: job.dispatch.activityPath,
              root: job.observation.root,
              advicee: job.observation.advicee,
              lifetime: server.lifetime,
              stage: "clear",
              unitIdentity: item.evaluationKey
            })
          } else if (item.kind === "joined") {
            const recordJoinedObservation = Effect.fn("ResidentRuntime.recordJoinedObservation")(function* () {
              const existing = (yield* residentAdvice()).find((advice) => advice.evaluationKey === item.evaluationKey)
              if (existing !== undefined) {
                yield* residentRecordJoinedOutcomes(yield* residentLedger.advice.publish(existing), existing.id)
                recordActivity({
                  statePath: job.dispatch.activityPath,
                  root: job.observation.root,
                  advicee: job.observation.advicee,
                  lifetime: server.lifetime,
                  stage: "findings",
                  findings: (yield* residentLedger.advice.current(existing)).findings.length,
                  unitIdentity: item.evaluationKey
                })
              } else {
                const pending = yield* residentReuse.pending(item.evaluationKey)
                if (pending === undefined && item.join !== "claimed") {
                  recordActivity({
                    statePath: job.dispatch.activityPath,
                    root: job.observation.root,
                    advicee: job.observation.advicee,
                    lifetime: server.lifetime,
                    stage: "unavailable",
                    unitIdentity: item.evaluationKey
                  })
                } else {
                  const joined: JoinedReview = {
                    admission: job.canonicalObservationId,
                    evaluationKey: item.evaluationKey,
                    observation: pathObservation,
                    activityPath: job.dispatch.activityPath,
                    ...(pending === undefined ? {} : { revision: pending.revision })
                  }
                  yield* residentJoined.append(joined)
                  expectedActivityUnits.push(item.evaluationKey)
                }
              }
            })
            yield* recordJoinedObservation()
          }
        })
        for (const item of planned) yield* recordReuseObservation(item)
        const observeJoinedBoundary = Effect.fn("ResidentRuntime.observeJoinedBoundary")(function* () {
          if (planned.some((item) => item.kind === "joined" && item.join === "claimed")) {
            yield* withinWork(
              residentPreparationControls
                .afterReuseBoundary("claimJoined")
                .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "joined claim barrier" }))),
              preparationSignal
            )
          }
        })
        yield* observeJoinedBoundary()
        const retainPreparedUnit = Effect.fn("ResidentRuntime.retainPreparedUnit")(function* (
          index: number,
          item: (typeof retained)[number]
        ) {
          const releaseRemainingReservation = Effect.fn("ResidentRuntime.releaseRemainingReservation")(function* (
            reservation: CapacityReservation | undefined
          ) {
            if (reservation !== undefined) yield* residentLedger.release(reservation)
          })
          const releaseRemainingClaim = Effect.fn("ResidentRuntime.releaseRemainingClaim")(function* (
            item: (typeof retained)[number] | undefined
          ) {
            if (item?.kind === "owner") yield* residentReleaseReuseClaim(item.evaluationKey)
          })
          const discardRemainingPreparedUnits = Effect.fn("ResidentRuntime.discardRemainingPreparedUnits")(
            function* () {
              for (let remaining = index; remaining < retained.length; remaining++) {
                const admitted = reservations[remaining]
                yield* releaseRemainingReservation(admitted?.reservation)
                const pending = retained[remaining]
                yield* releaseRemainingClaim(pending)
              }
            }
          )
          if (!(yield* residentJobActive(job))) {
            yield* discardRemainingPreparedUnits()
            return false
          }
          const admitted = reservations[index]
          const reportRetainedCapacityRefusal = Effect.fn("ResidentRuntime.reportRetainedCapacityRefusal")(
            function* () {
              if (item.kind === "owner") yield* residentReleaseReuseClaim(item.evaluationKey, "capacity")
              yield* residentLedger.runtime.rejectCapacity()
              yield* residentRecordAnalytics(job, "capacity-rejected")
              yield* residentRecordOperationalFailure(job.observation, "capacity")
              recordActivity({
                statePath: job.dispatch.activityPath,
                root: job.observation.root,
                advicee: job.observation.advicee,
                lifetime: server.lifetime,
                stage: "unavailable"
              })
            }
          )
          if (admitted === undefined) {
            yield* reportRetainedCapacityRefusal()
            return true
          }
          const reservation = admitted.reservation
          const revision = yield* residentRegisterCurrentWork(job.partition, item.outcome.prepared)

          const registerPreparedWork = Effect.fn("ResidentRuntime.registerPreparedWork")(function* () {
            return job.round === undefined || job.workObservationId === undefined
              ? undefined
              : item.kind === "cached"
                ? (yield* residentLedger.rounds.policyWork(job.round)).cachedFinding(
                    job.workObservationId,
                    item.cached.evaluation.findings.length,
                    logicalBytes(item.cached.evaluation.findings),
                    admitted.operation
                  )
                : (yield* residentLedger.rounds.policyWork(job.round)).spawn(job.workObservationId, admitted.operation)
          })
          const workUnitId = yield* registerPreparedWork()
          const releaseUnspawnedUnit = Effect.fn("ResidentRuntime.releaseUnspawnedUnit")(function* () {
            if (item.kind === "owner") yield* residentReleaseReuseClaim(item.evaluationKey)
            yield* residentLedger.release(reservation)
            yield* residentReleaseCurrentWork(revision)
          })
          if (job.round !== undefined && workUnitId === undefined) {
            yield* releaseUnspawnedUnit()
            return true
          }
          expectedActivityUnits.push(item.evaluationKey)
          const sourceHash = prepared.observation.outcomes.flatMap((outcome) =>
            outcome.status === "observed" && outcome.path === item.outcome.path ? [outcome.snapshot.sourceHash] : []
          )[0]
          const makePreparedUnit = (): UnitJob => {
            const inspectionEvaluationId = inspectionOrigins.get(item.evaluationKey)
            return {
              kind: "unit",
              ...(inspectionEvaluationId === undefined ? {} : { inspectionEvaluationId }),
              ...(job.inspectionReceipt === undefined ? {} : { inspectionReceipt: job.inspectionReceipt }),
              canonicalRound: job.canonicalRound,
              ...(job.round === undefined ? {} : { round: job.round, work: job.work }),
              ...(workUnitId === undefined ? {} : { workUnitId }),
              admissionId: job.canonicalObservationId,
              canonicalOperationId: admitted.operation,
              observation: pathObservation,
              partition: job.partition,
              reservation,
              dispatch: job.dispatch,
              analyticsEnabled,
              prepared: item.outcome.prepared,
              ...(sourceHash === undefined ? {} : { sourceHash }),
              revision,
              evaluationKey: item.evaluationKey
            }
          }
          const unit = makePreparedUnit()
          if (unit.inspectionReceipt !== undefined) {
            inspection.offer(
              unit.inspectionReceipt.scope,
              {
                ...unit.inspectionReceipt.correlation,
                ...(unit.inspectionEvaluationId === undefined ? {} : { evaluationId: unit.inspectionEvaluationId }),
                unitId: createHash("sha256").update(`${unit.partition}:${unit.canonicalOperationId}`).digest("hex")
              },
              {
                kind: "unit-prepared",
                semanticIdentity: unit.prepared.identity,
                path: unit.prepared.input.path,
                declaration: unit.prepared.input.declaration.name,
                completeness: unit.prepared.input.completeness
              }
            )
            if (inspection.isEnabled(unit.inspectionReceipt.scope.root)) {
              inspection.offer(
                unit.inspectionReceipt.scope,
                {
                  ...unit.inspectionReceipt.correlation,
                  ...(unit.inspectionEvaluationId === undefined ? {} : { evaluationId: unit.inspectionEvaluationId }),
                  unitId: createHash("sha256").update(`${unit.partition}:${unit.canonicalOperationId}`).digest("hex")
                },
                captureInspectionPolicy(unit.prepared, unit.dispatch.controlled !== null)
              )
            }
          }
          if (item.kind === "cached") {
            const settleCachedUnit = Effect.fn("ResidentRuntime.settleCachedUnit")(function* () {
              if (
                !(yield* residentLedger.startReview(job.partition, admitted.operation, job.canonicalRound)) ||
                !(yield* residentLedger.completeReview(
                  job.partition,
                  admitted.operation,
                  reservation,
                  "finding",
                  job.canonicalRound
                ))
              ) {
                throw new Error("canonical cached review settlement refused")
              }
              recordActivity({
                statePath: job.dispatch.activityPath,
                root: job.observation.root,
                advicee: job.observation.advicee,
                lifetime: server.lifetime,
                stage: "findings",
                findings: item.cached.evaluation.findings.length,
                unitIdentity: item.evaluationKey
              })
              yield* residentRetainAdvice(
                unit,
                { prepared: item.outcome.prepared, findings: item.cached.evaluation.findings },
                sequence
              ).pipe(
                Effect.ensuring(
                  Effect.gen(function* () {
                    yield* residentRetireCachedUnit(unit, job.round, workUnitId)
                  })
                )
              )
              return true
            })
            return yield* settleCachedUnit()
          }
          if (!(yield* residentJoined.attachOwner(item.evaluationKey, unit, revision))) {
            throw new Error("canonical evaluation attachment refused")
          }
          unassignedClaims.delete(item.evaluationKey)
          const enqueuePreparedUnit = Effect.fn("ResidentRuntime.enqueuePreparedUnit")(function* () {
            if (!(yield* residentDispatcher.enqueue(job.partition, unit))) {
              yield* residentReleaseReuseClaim(item.evaluationKey, "capacity")
              yield* residentReleaseUnit(unit)
              yield* residentLedger.runtime.rejectCapacity()
              yield* residentRecordAnalytics(job, "capacity-rejected")
              yield* residentRecordOperationalFailure(job.observation, "capacity")
              recordActivity({
                statePath: job.dispatch.activityPath,
                root: job.observation.root,
                advicee: job.observation.advicee,
                lifetime: server.lifetime,
                stage: "unavailable",
                unitIdentity: item.evaluationKey
              })
            }
          })
          yield* enqueuePreparedUnit()
          return true
        })
        const retainPreparedUnits = Effect.fn("ResidentRuntime.retainPreparedUnits")(function* () {
          for (const [index, item] of retained.entries()) {
            if (!(yield* retainPreparedUnit(index, item))) return false
          }
          return true
        })
        if (!(yield* retainPreparedUnits())) return false
        return true
      })
      for (const candidate of job.observation.candidates) {
        if (!(yield* prepareCandidate(candidate))) return
      }
      const completeSourcePreparation = Effect.fn("ResidentRuntime.completeSourcePreparation")(function* () {
        if (expectedActivityUnits.length > 0) {
          recordActivity({
            statePath: job.dispatch.activityPath,
            root: job.observation.root,
            advicee: job.observation.advicee,
            lifetime: server.lifetime,
            stage: "pending",
            expectedUnitIdentities: expectedActivityUnits
          })
        }
        if (
          job.round !== undefined &&
          job.workObservationId !== undefined &&
          !(yield* residentLedger.rounds.policyWork(job.round)).completeSource(job.workObservationId)
        ) {
          throw new Error("Bend denied source completion")
        }
        if (
          !(yield* residentLedger.observation(
            job.partition,
            job.canonicalObservationId,
            "completeObservation",
            job.canonicalRound
          ))
        ) {
          throw new Error("canonical observation completion refused")
        }
        job.completed = true
        yield* withinWork(
          residentPreparationControls.afterPrepare.pipe(
            Effect.mapError(() => new ResidentAdapterError({ operation: "preparation barrier" }))
          ),
          preparationSignal
        )
      })
      yield* completeSourcePreparation()
      return
    }).pipe(
      Effect.catch(() =>
        Effect.gen(function* () {
          yield* residentRecordAnalytics(job, "preparation-failed")
          if (runtimeConfiguration.debug) console.error("resident preparation unavailable")
          yield* residentLedger.release(job.reservation)
          if ((yield* residentLedger.runtime.snapshot()).lifecycle === "active")
            recordActivity({
              statePath: job.dispatch.activityPath,
              root: job.observation.root,
              advicee: job.observation.advicee,
              lifetime: server.lifetime,
              stage: "unavailable"
            })
        })
      ),
      Effect.ensuring(
        Effect.gen(function* () {
          yield* residentLedger.release(job.reservation)
          for (const workspace of activeWorkspaces) yield* residentLedger.release(workspace)
          for (const key of unassignedClaims) yield* residentReleaseReuseClaim(key)
          if (!job.completed)
            yield* residentLedger.observation(
              job.partition,
              job.canonicalObservationId,
              "interruptObservation",
              job.canonicalRound
            )
        })
      )
    )
  })

  const residentControlledOutcomePath = (controlled: ControlledDecisionModelOptions): string =>
    controlled.outcomePath ?? ""
  const residentControlledOutcomeLabel = (count: number): string =>
    count === 0 ? "completed-clear" : "completed-findings"
  const residentEvaluatedOutcome = (count: number): "clear" | "finding" => (count === 0 ? "clear" : "finding")
  const residentEvaluateUnit = Effect.fn("ResidentRuntime.evaluateUnit")((job: UnitJob, sequence: number) =>
    Effect.suspend(() => {
      const server = runtime
      let issuedRequest: number | undefined
      let requestStarted = false
      let requestSettled = false
      let interruptionReported = false
      let readyReported = false
      let requestIdentity:
        | Pick<
            JevRequestObservation,
            | "partition"
            | "canonicalPartition"
            | "lifetime"
            | "canonicalLifetime"
            | "round"
            | "hapslandRound"
            | "operation"
          >
        | undefined
      const observeRequest = Effect.fn("ResidentRuntime.observeRequest")(function* (
        stage: JevRequestObservation["stage"],
        request?: number,
        outcome?: JevRequestObservation["outcome"],
        findings: ReadonlyArray<Finding> = []
      ) {
        if (requestIdentity === undefined) throw new Error("Jev request observation lacks canonical identity")
        if (stage === "started") yield* residentRecordAnalytics(job, "request-started")
        if (stage === "settled" && outcome !== undefined) {
          const kinds = {
            clear: "request-clear",
            finding: "request-findings",
            backendFailure: "request-failed",
            timeout: "request-timeout",
            interrupted: "request-interrupted",
            neverSent: "request-never-sent"
          } as const
          yield* residentRecordAnalytics(job, kinds[outcome], findings)
        }
        residentObserveJevRequest({
          ...requestIdentity,
          stage,
          ...(request === undefined ? {} : { request }),
          ...(outcome === undefined ? {} : { outcome })
        })
      })
      const signal = job.work?.controller.signal ?? residentLifetimeController.signal
      const requestReady = Effect.fn("ResidentRuntime.requestReady")(function* (facts: {
        readonly rootValid: boolean
        readonly configurationValid: boolean
        readonly credentialReady: boolean
        readonly selected: boolean
        readonly currentWork: boolean
        readonly physicalAvailable: boolean
      }) {
        readyReported = true
        const decision = yield* residentLedger.readyJevRequest(
          job.partition,
          job.canonicalOperationId,
          job.reservation,
          facts,
          job.canonicalRound
        )
        if (decision.status !== "stale") {
          const canonicalPartition = yield* residentLedger.knownPartitionId(job.partition)
          if (canonicalPartition === undefined) throw new Error("issued review lost its partition identity")
          requestIdentity = {
            partition: job.partition,
            canonicalPartition,
            lifetime: residentLedger.residentLifetime,
            canonicalLifetime: residentLedger.canonicalLifetime,
            round: decision.round,
            hapslandRound: job.round?.generation ?? null,
            operation: job.canonicalOperationId
          }
        }
        if (decision.status === "issued") {
          issuedRequest = decision.request
          job.requestId = decision.request
          yield* observeRequest("issued", decision.request)
          yield* workInvalidated(signal).pipe(
            Effect.catch(() => reportInterruption()),
            Effect.forkScoped
          )
        } else if (decision.status === "unavailable") {
          yield* observeRequest("unavailable")
        }
        return decision
      })
      const denyReady = Effect.fn("ResidentRuntime.denyReady")(function* (reason?: "credential") {
        const decision = yield* requestReady({
          rootValid: false,
          configurationValid: false,
          credentialReady: false,
          selected: false,
          currentWork: false,
          physicalAvailable: false
        })
        if (decision.status === "issued") throw new Error("canonical Jev request authorized unverified facts")
        return { status: "notAuthorized" as const, reason }
      })
      const reportInterruption = Effect.fn("ResidentRuntime.reportInterruption")(function* () {
        if (issuedRequest === undefined || !requestStarted || interruptionReported) return
        interruptionReported = yield* residentLedger.interruptJevRequest(
          job.partition,
          job.canonicalOperationId,
          issuedRequest
        )
        if (interruptionReported) yield* observeRequest("interrupted", issuedRequest)
      }, Effect.uninterruptible)
      return Effect.gen(function* () {
        const startCanonicalUnit = Effect.fn("ResidentRuntime.startCanonicalUnit")(function* () {
          if (job.round === undefined || job.workUnitId === undefined) return true
          return (yield* residentLedger.rounds.policyWork(job.round)).startUnit(job.workUnitId)
        })
        const startNativeUnit = Effect.fn("ResidentRuntime.startNativeUnit")(function* () {
          if (!(yield* startCanonicalUnit())) {
            yield* residentReleaseReuseClaim(job.evaluationKey)
            yield* residentReleaseUnit(job)
            return false
          }
          if (!(yield* residentLedger.startReview(job.partition, job.canonicalOperationId, job.canonicalRound))) {
            yield* residentReleaseReuseClaim(job.evaluationKey)
            yield* residentReleaseUnit(job)
            return false
          }
          return true
        })
        const unitAdmissionCurrent = Effect.fn("ResidentRuntime.unitAdmissionCurrent")(function* () {
          return (yield* residentJobActive(job)) && (yield* residentIsCurrentWork(job.revision, job.prepared))
        })
        const startUnitEvaluation = Effect.fn("ResidentRuntime.startUnitEvaluation")(function* () {
          if (!(yield* startNativeUnit())) return false
          yield* residentAwaitBackendGate()
          if (!(yield* unitAdmissionCurrent())) {
            yield* denyReady()
            yield* residentRecordAnalytics(job, "review-unavailable")
            yield* residentSettleJoined(job.evaluationKey, "unavailable", "stale")
            recordActivity({
              statePath: job.dispatch.activityPath,
              root: job.observation.root,
              advicee: job.observation.advicee,
              lifetime: server.lifetime,
              stage: "incomplete",
              unitIdentity: job.evaluationKey
            })
            yield* residentReleaseReuseClaim(job.evaluationKey)
            yield* residentReleaseUnit(job)
            return false
          }
          return true
        })
        if (!(yield* startUnitEvaluation())) return
        yield* withinWork(
          residentReviewControls
            .beforeEvaluate(job.prepared)
            .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "evaluation barrier" }))),
          signal
        )
        const userConfigPath = residentOptionalUserConfig(job.dispatch)
        const controlled = decodeControlledOptions(job.dispatch.controlled)
        const offlineHttpClient = residentOfflineHttpClient
        const controlledRequestEffect = residentControlledRequestEffect
        const isCurrentWork = () => residentIsCurrentWork(job.revision, job.prepared)
        const isJobActive = () => residentJobActive(job)
        const observeDispatchAuthority = (details: DispatchAuthorityObservationDetails) =>
          residentObserveDispatchAuthority(job, details)
        const result = yield* withinWork(
          Effect.gen(function* () {
            const resolveEvaluationCredentials = Effect.fn("ResidentRuntime.resolveEvaluationCredentials")(
              function* () {
                const loadEvaluationSettings = Effect.fn("ResidentRuntime.loadEvaluationSettings")(function* () {
                  const settings = yield* loadReviewSettings(
                    job.observation.root,
                    residentUserConfigOptions(userConfigPath)
                  )
                  job.analyticsEnabled = effectiveSessionAnalytics(settings.configuration.policy)
                  if (job.dispatch.controlled !== null && controlled === undefined) return yield* denyReady()
                  const credentialRequired = residentCredentialRequired(controlled)
                  if (!residentCredentialShapeMatches(job.dispatch, settings.credentialEnvVar, credentialRequired))
                    return yield* denyReady("credential")
                  const dispatchCredential = job.dispatch.credential

                  if (!(yield* verifyObservationRoot(job.observation))) return yield* denyReady()
                  yield* residentDispatchControls
                    .atBoundary("authorized")
                    .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "authorization barrier" })))
                  return { settings, credentialRequired, dispatchCredential }
                })
                const loaded = yield* loadEvaluationSettings()
                if ("status" in loaded) return loaded
                const { settings, credentialRequired, dispatchCredential } = loaded
                const resolveDispatchCredential = Effect.fn("ResidentRuntime.resolveDispatchCredential")(function* () {
                  return !credentialRequired || dispatchCredential === null
                    ? undefined
                    : yield* resolveCredential({
                        envVar: dispatchCredential.name,
                        environmentOnly: settings.backend === "cloudflare" || dispatchCredential.environmentOnly,
                        environmentValue: dispatchCredential.environmentValue,
                        expectedGeneration: dispatchCredential.generation,
                        statePath: dispatchCredential.statePath
                      })
                })
                const credential = yield* resolveDispatchCredential()
                if (credentialRequired && credential?.status !== "present") {
                  return yield* denyReady("credential")
                }
                const credentialStillCurrent = () => {
                  if (credential?.status !== "present") return true
                  const current = readCredentialState(dispatchCredential?.statePath)
                  return (
                    current.generation === credential.generation &&
                    !(credential.source === "saved" && current.savedUseSuspended)
                  )
                }
                if (!credentialStillCurrent()) return yield* denyReady("credential")
                yield* residentDispatchControls
                  .atBoundary("credentialResolved")
                  .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "credential barrier" })))
                if (!credentialStillCurrent()) return yield* denyReady("credential")
                return { settings, credentialRequired, dispatchCredential, credential }
              }
            )
            const resolved = yield* resolveEvaluationCredentials()
            if ("status" in resolved) return resolved
            const { settings, credentialRequired, dispatchCredential, credential } = resolved
            // Prepared source can outlive its admission policy. Read authority again
            // after credential waits, then apply the current file policy before the
            // provider receives the prepared unit.
            const credentialReady = () => !credentialRequired || credential?.status === "present"
            const credentialObservation = () => ({
              credentialStatus: credential?.status ?? ("not-required" as const),
              credentialGeneration: credential?.generation ?? null
            })
            const dispatchAuthorityReason = (
              admission: string,
              current: boolean
            ): DispatchAuthorityObservationDetails["reason"] => {
              if (admission !== "admitReview") return "excluded-by-file-policy"
              return current ? "selected-by-file-policy" : "stale-complete-unit"
            }
            const dispatchAuthorityDecision = (admission: string, current: boolean): "allow" | "deny" =>
              admission === "admitReview" && current ? "allow" : "deny"
            const authorizePreparedUnit = Effect.fn("ResidentRuntime.authorizePreparedUnit")(function* () {
              const dispatchConfiguration = yield* loadConfiguration(
                job.observation.root,
                residentUserConfigOptions(userConfigPath)
              )
              if (
                credentialRequired &&
                dispatchCredential?.name !== dispatchConfiguration.policy.credentialEnvVar.value
              )
                return yield* denyReady("credential")
              const providerSelectionCurrent = () =>
                canonicalValue(job.prepared.input.providerIdentity) === canonicalValue(settings.providerIdentity) &&
                canonicalValue(settings.providerIdentity) ===
                  canonicalValue(providerIdentity(effectiveReviewBackend(dispatchConfiguration.policy)))
              if (!providerSelectionCurrent()) return yield* denyReady()
              const dispatchRootVerified = yield* verifyObservationRoot(job.observation)
              if (!dispatchRootVerified) {
                yield* observeDispatchAuthority({
                  decision: "deny",
                  reason: "physical-root-mismatch",
                  policyDigest: dispatchConfiguration.policy.digest,
                  selected: null,
                  admission: "refuseRoot",
                  physicalRootVerified: false,
                  ...credentialObservation()
                })
                return yield* denyReady()
              }
              const selected = selectedByDirectFilePolicy(
                job.prepared.input.path,
                resolvedDirectFilePolicy(dispatchConfiguration.policy)
              )
              const admission = admitReview({
                rootValid: dispatchRootVerified,
                configurationValid: true,
                credentialReady: credentialReady(),
                selected
              })
              const unitCurrent =
                admission === "admitReview" &&
                (yield* preparedUnitStillCurrent(job.observation, job.prepared, {
                  controlledWriter: true,
                  advicee: job.observation.advicee,
                  settings: { ...settings, configuration: dispatchConfiguration },
                  policy: resolvedDirectFilePolicy(dispatchConfiguration.policy)
                }))
              yield* observeDispatchAuthority({
                decision: dispatchAuthorityDecision(admission, unitCurrent),
                reason: dispatchAuthorityReason(admission, unitCurrent),
                policyDigest: dispatchConfiguration.policy.digest,
                selected,
                admission,
                physicalRootVerified: true,
                ...credentialObservation()
              })
              const ready = yield* requestReady({
                rootValid: dispatchRootVerified,
                configurationValid: true,
                credentialReady: credentialReady(),
                selected: selected && unitCurrent,
                currentWork: yield* isCurrentWork(),
                physicalAvailable: yield* isJobActive()
              })
              return ready
            })
            const ready = yield* authorizePreparedUnit()
            const deniedAuthorization = () =>
              ready.status === "notAuthorized" ? ready : { status: "notAuthorized" as const, reason: undefined }
            if (ready.status !== "issued") return deniedAuthorization()
            const makeCredentialProvider = () => {
              return credential?.status !== "present"
                ? undefined
                : ConfigProvider.layer(ConfigProvider.fromUnknown({ [settings.credentialEnvVar]: credential.value }))
            }
            const credentialProvider = makeCredentialProvider()
            if (controlled === undefined && credentialProvider === undefined) return undefined
            const makeEvaluationModel = () => {
              return controlled === undefined
                ? reviewDecisionModelLayer(settings, offlineHttpClient)
                : controlledDecisionModelLayer({
                    ...controlled,
                    ...(controlledRequestEffect === undefined
                      ? {}
                      : {
                          onRequest: physicalRequest("controlled provider request", controlledRequestEffect).pipe(
                            Effect.orDie
                          )
                        })
                  })
            }
            const decisionModel = makeEvaluationModel()
            const makeCredentialAuthority = () => {
              return credential?.status !== "present"
                ? Effect.void
                : Effect.suspend(() => {
                    const current = readCredentialState(dispatchCredential?.statePath)
                    return current.generation === credential.generation &&
                      (credential.source === "environment" || !current.savedUseSuspended)
                      ? Effect.void
                      : Effect.fail(new Error("credential generation changed before provider dispatch"))
                  })
            }
            const credentialAuthority = makeCredentialAuthority()
            const makeBudgetAuthority = () => {
              return job.dispatch.demoBudgetPath == null
                ? Effect.void
                : Clock.currentTimeMillis.pipe(
                    Effect.flatMap((now) =>
                      Effect.try(() =>
                        claimDemoBudget(
                          job.dispatch.demoBudgetPath ?? "",
                          job.observation.root,
                          encodedPreparedProviderInputBytes(job.prepared),
                          now
                        )
                      )
                    )
                  )
            }
            const budgetAuthority = makeBudgetAuthority()
            const beforeDispatch = credentialAuthority.pipe(
              Effect.andThen(budgetAuthority),
              Effect.andThen(
                Effect.gen(function* () {
                  if (
                    !(yield* residentLedger.startJevRequest(job.partition, job.canonicalOperationId, ready.request))
                  ) {
                    throw new Error("canonical Jev request start refused")
                  }
                  requestStarted = true
                  job.requestStarted = true
                  yield* observeRequest("started", ready.request)
                  if (signal?.aborted) yield* reportInterruption()
                })
              )
            )
            const evaluation = evaluatePrepared(job.prepared, beforeDispatch, (evidence) => {
              if (job.inspectionReceipt === undefined || !inspection.isEnabled(job.inspectionReceipt.scope.root)) return
              const fact =
                evidence.kind === "model-input"
                  ? (() => {
                      const encoded = JSON.stringify(evidence.input)
                      const byteLength = Buffer.byteLength(encoded)
                      return {
                        kind: "model-input" as const,
                        representation: "decision-model-json" as const,
                        payload:
                          byteLength > 16384
                            ? { status: "missing" as const, reason: "oversized" as const }
                            : {
                                status: "available" as const,
                                encoded,
                                byteLength,
                                sha256: createHash("sha256").update(encoded).digest("hex")
                              }
                      }
                    })()
                  : evidence.kind === "interpreted-findings"
                    ? captureInspectionFindings(evidence.findings)
                    : evidence
              inspection.offer(
                job.inspectionReceipt.scope,
                {
                  ...job.inspectionReceipt.correlation,
                  ...(job.inspectionEvaluationId === undefined ? {} : { evaluationId: job.inspectionEvaluationId }),
                  unitId: createHash("sha256").update(`${job.partition}:${job.canonicalOperationId}`).digest("hex"),
                  requestId: createHash("sha256").update(`${job.partition}:${ready.request}`).digest("hex")
                },
                fact
              )
            }).pipe(
              Effect.provide(decisionModel),
              Effect.provideService(InspectionTransportObservation, {
                observe: (body) => {
                  const receipt = job.inspectionReceipt
                  if (receipt === undefined || !inspection.isEnabled(receipt.scope.root)) return
                  const payload =
                    body === undefined
                      ? { status: "missing" as const, reason: "unavailable" as const }
                      : body.byteLength > 16384
                        ? { status: "missing" as const, reason: "oversized" as const }
                        : {
                            status: "available" as const,
                            encoded: Buffer.from(body).toString("base64"),
                            byteLength: body.byteLength,
                            sha256: createHash("sha256").update(body).digest("hex")
                          }
                  inspection.offer(
                    receipt.scope,
                    {
                      ...receipt.correlation,
                      ...(job.inspectionEvaluationId === undefined ? {} : { evaluationId: job.inspectionEvaluationId }),
                      unitId: createHash("sha256").update(`${job.partition}:${job.canonicalOperationId}`).digest("hex"),
                      requestId: createHash("sha256").update(`${job.partition}:${ready.request}`).digest("hex")
                    },
                    { kind: "transport-invoked", representation: "http-body-base64", payload }
                  )
                }
              })
            )
            return yield* credentialProvider === undefined
              ? evaluation
              : evaluation.pipe(Effect.provide(credentialProvider))
          }),
          signal
        )
        if (result?.status === "notAuthorized") {
          yield* residentRecordAnalytics(job, "review-unavailable")

          yield* residentSettleJoined(
            job.evaluationKey,
            "unavailable",
            result.reason === "credential" ? "credential" : "lost"
          )
          if (result.reason === "credential") yield* residentRecordOperationalFailure(job.observation, "credential")
          recordActivity({
            statePath: job.dispatch.activityPath,
            root: job.observation.root,
            advicee: job.observation.advicee,
            lifetime: server.lifetime,
            stage: "unavailable",
            unitIdentity: job.evaluationKey
          })
          yield* residentReleaseReuseClaim(job.evaluationKey)
          yield* residentReleaseUnit(job)
          return
        }
        const unissuedJobInactive = Effect.fn("ResidentRuntime.unissuedJobInactive")(function* () {
          return !(yield* residentJobActive(job)) && issuedRequest === undefined
        })
        if (yield* unissuedJobInactive()) {
          yield* residentReleaseReuseClaim(job.evaluationKey)
          yield* residentReleaseUnit(job)
          return
        }
        const settleEvaluatedUnit = Effect.fn("ResidentRuntime.settleEvaluatedUnit")(function* (
          result: Extract<Effect.Success<ReturnType<typeof evaluatePrepared>>, { status: "evaluated" }>
        ) {
          const reportEvaluatedBendOutcome = Effect.fn("ResidentRuntime.reportEvaluatedBendOutcome")(function* () {
            const evaluatedWorkTarget = Effect.fn("ResidentRuntime.evaluatedWorkTarget")(function* () {
              if (!(yield* residentJobActive(job))) return undefined
              if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return undefined
              if (job.round === undefined || job.workUnitId === undefined) return undefined
              return { round: job.round, id: job.workUnitId }
            })
            const target = yield* evaluatedWorkTarget()
            if (
              target !== undefined &&
              !(yield* residentLedger.rounds.policyWork(target.round)).outcome(
                target.id,
                result.findings.length === 0
                  ? { $: "Clear" }
                  : { $: "Finding", count: result.findings.length, bytes: logicalBytes(result.findings) }
              )
            ) {
              throw new Error("Bend denied review outcome")
            }
          })
          yield* reportEvaluatedBendOutcome()
          const evaluatedWorkCurrent = Effect.fn("ResidentRuntime.evaluatedWorkCurrent")(function* () {
            return (
              (yield* residentLedger.runtime.snapshot()).lifecycle === "active" &&
              (yield* residentJobActive(job)) &&
              (yield* residentIsCurrentWork(job.revision, job.prepared))
            )
          })
          const currentWork = yield* evaluatedWorkCurrent()
          if (issuedRequest === undefined || !requestStarted) {
            throw new Error("Jev result without a matching canonical request command and start")
          }
          const disposition = yield* residentLedger.settleJevRequest(
            job.partition,
            job.canonicalOperationId,
            issuedRequest,
            job.reservation,
            residentEvaluatedOutcome(result.findings.length),
            currentWork
          )
          requestSettled = true
          yield* observeRequest(
            "settled",
            issuedRequest,
            residentEvaluatedOutcome(result.findings.length),
            result.findings
          )
          if (disposition === "ignored" || disposition === "stale") {
            if (
              result.findings.length &&
              job.inspectionReceipt !== undefined &&
              inspection.isEnabled(job.inspectionReceipt.scope.root)
            )
              inspection.offer(
                job.inspectionReceipt.scope,
                {
                  ...job.inspectionReceipt.correlation,
                  ...(job.inspectionEvaluationId === undefined ? {} : { evaluationId: job.inspectionEvaluationId })
                },
                captureInspectionFate(
                  result.findings,
                  disposition === "stale" ? "stale" : "discarded",
                  disposition === "stale" ? "resident-stale" : "settlement-ignored"
                )
              )
            yield* residentReleaseReuseClaim(job.evaluationKey)
            yield* residentReleaseUnit(job)
            return
          }
          const recordEvaluatedUnit = Effect.fn("ResidentRuntime.recordEvaluatedUnit")(function* () {
            recordDemoTrace(job.dispatch.demoBudgetPath, job.observation.root, job.observation.advicee, {
              kind: "terminal",
              ...(job.sourceHash === undefined ? {} : { sourceHash: job.sourceHash }),
              state: result.findings.length === 0 ? "clear" : "findings"
            })
            const evaluation = { prepared: job.prepared, findings: result.findings }
            yield* residentReuse.put(job.partition, job.evaluationKey, evaluation)
            yield* residentReleaseReuseClaim(job.evaluationKey)
            recordActivity({
              statePath: job.dispatch.activityPath,
              root: job.observation.root,
              advicee: job.observation.advicee,
              lifetime: server.lifetime,
              stage: result.findings.length === 0 ? "clear" : "findings",
              findings: result.findings.length,
              unitIdentity: job.evaluationKey
            })
            return evaluation
          })
          const evaluation = yield* recordEvaluatedUnit()
          const recordOutcome = Effect.fn("ResidentRuntime.recordControlledOutcome")(function* () {
            if (controlled?.outcomePath === undefined) return
            const { sessionId, turnId, toolUseId, subagentId } = job.observation.advicee
            yield* residentAdapter("record controlled outcome", () =>
              appendFile(
                residentControlledOutcomePath(controlled),
                `${JSON.stringify({
                  sessionId,
                  turnId,
                  toolUseId,
                  subagentId,
                  outcome: residentControlledOutcomeLabel(result.findings.length)
                })}\n`,
                "utf8"
              )
            )
          })
          const settleNonRetainedOutcome = Effect.fn("ResidentRuntime.settleNonRetainedOutcome")(function* () {
            if (disposition !== "retainFinding") {
              if (
                result.findings.length &&
                job.inspectionReceipt !== undefined &&
                inspection.isEnabled(job.inspectionReceipt.scope.root)
              )
                inspection.offer(
                  job.inspectionReceipt.scope,
                  {
                    ...job.inspectionReceipt.correlation,
                    ...(job.inspectionEvaluationId === undefined ? {} : { evaluationId: job.inspectionEvaluationId })
                  },
                  captureInspectionFate(
                    result.findings,
                    disposition === "retireStaleFinding" ? "stale" : "discarded",
                    disposition === "retireStaleFinding" ? "resident-stale" : "settlement-ignored"
                  )
                )
              if (disposition === "retireStaleFinding" && job.round !== undefined && job.workUnitId !== undefined) {
                ;(yield* residentLedger.rounds.policyWork(job.round)).retire(job.workUnitId)
              }
              yield* residentSettleJoined(
                job.evaluationKey,
                disposition === "settleClear" ? "clear" : "unavailable",
                "stale"
              )
              job.completed = true
              yield* residentReleaseUnit(job)
              yield* recordOutcome()
              return true
            }
            return false
          })
          if (yield* settleNonRetainedOutcome()) return
          yield* residentRetainAdvice(job, evaluation, sequence)
          yield* recordOutcome()
          return
        })
        if (result?.status === "evaluated") return yield* settleEvaluatedUnit(result)
        const settleFailedEvaluation = Effect.fn("ResidentRuntime.settleFailedEvaluation")(function* () {
          if (signal?.aborted) yield* reportInterruption()
          const observedFailure = () => {
            return issuedRequest === undefined
              ? undefined
              : signal?.aborted && requestStarted && interruptionReported
                ? "interrupted"
                : !requestStarted
                  ? "neverSent"
                  : result?.status === "timeout"
                    ? "timeout"
                    : "backendFailure"
          }
          const observed = observedFailure()
          const classifyEvaluationFailure = () => {
            return residentLedger.reviewFailure(
              observed === "backendFailure" ||
                observed === "timeout" ||
                (issuedRequest === undefined && (result?.status === "backend" || result?.status === "timeout")),
              false,
              observed === "neverSent" || observed === "interrupted" || result === undefined
            )
          }
          const failure = yield* classifyEvaluationFailure()
          const settleFailedRequest = Effect.fn("ResidentRuntime.settleFailedRequest")(function* () {
            if (issuedRequest === undefined) {
              if (
                !(yield* residentLedger.completeReview(
                  job.partition,
                  job.canonicalOperationId,
                  job.reservation,
                  "unavailable",
                  job.canonicalRound
                ))
              )
                return false
            } else {
              yield* residentLedger.settleJevRequest(
                job.partition,
                job.canonicalOperationId,
                issuedRequest,
                job.reservation,
                observed ?? "neverSent",
                false
              )
              requestSettled = true
              yield* observeRequest("settled", issuedRequest, observed ?? "neverSent")
            }
            return true
          })
          if (!(yield* settleFailedRequest())) return
          const recordFailureNotice = Effect.fn("ResidentRuntime.recordFailureNotice")(function* (
            reason: "backend" | "credential" | "lost"
          ) {
            if (reason !== "lost") yield* residentRecordOperationalFailure(job.observation, reason)
          })
          const recordFailedEvaluation = Effect.fn("ResidentRuntime.recordFailedEvaluation")(function* () {
            if (failure === "failureNone") return
            const reasons: Partial<Record<typeof failure, "backend" | "credential" | "lost">> = {
              failureBackend: "backend",
              failureCredential: "credential",
              failureLost: "lost"
            }
            const reason = reasons[failure]
            if (reason === undefined) throw new Error("Bend denied review failure disposition")
            yield* residentSettleJoined(job.evaluationKey, "unavailable", reason)
            yield* recordFailureNotice(reason)
            recordActivity({
              statePath: job.dispatch.activityPath,
              root: job.observation.root,
              advicee: job.observation.advicee,
              lifetime: server.lifetime,
              stage: "unavailable",
              unitIdentity: job.evaluationKey
            })
          })
          yield* recordFailedEvaluation()
        })
        yield* settleFailedEvaluation()
      }).pipe(
        // Observe every failed exit, including interruption, before releasing the
        // native job. Typed adapter failures have a truthful unavailable outcome;
        // invariant defects and scope interruption remain visible in the fiber.
        Effect.onError(() =>
          Effect.gen(function* () {
            if (
              !readyReported &&
              (yield* residentLedger.canonicalProjection()).work.some(
                (entry) => entry.operation === job.canonicalOperationId && entry.kind === "reviewing"
              )
            ) {
              yield* denyReady()
            }
            const settleInterruptedEvaluation = Effect.fn("ResidentRuntime.settleInterruptedEvaluation")(function* () {
              if (issuedRequest !== undefined && !requestSettled) {
                if (signal?.aborted) yield* reportInterruption()
                const observed =
                  signal?.aborted && requestStarted && interruptionReported
                    ? "interrupted"
                    : requestStarted
                      ? "backendFailure"
                      : "neverSent"
                yield* residentLedger.settleJevRequest(
                  job.partition,
                  job.canonicalOperationId,
                  issuedRequest,
                  job.reservation,
                  observed,
                  false
                )
                requestSettled = true
                yield* observeRequest("settled", issuedRequest, observed)
              }
            })
            yield* settleInterruptedEvaluation()
            yield* residentSettleJoined(job.evaluationKey, "unavailable", "backend")
            if (runtimeConfiguration.debug) console.error("resident evaluation unavailable")
            if ((yield* residentLedger.runtime.snapshot()).lifecycle === "active")
              recordActivity({
                statePath: job.dispatch.activityPath,
                root: job.observation.root,
                advicee: job.observation.advicee,
                lifetime: server.lifetime,
                stage: "unavailable",
                unitIdentity: job.evaluationKey
              })
          })
        ),
        Effect.catch(() => Effect.void),
        Effect.ensuring(
          Effect.gen(function* () {
            if (!job.completed) {
              yield* residentReleaseReuseClaim(job.evaluationKey)
              yield* residentReleaseUnit(job)
            }
          })
        ),
        Effect.scoped
      )
    })
  )

  const residentReleaseReuseClaim = Effect.fn("ResidentRuntime.releaseReuseClaim")(function* (
    key: string,
    reason: ResidentUnavailableReason = "lost"
  ) {
    for (const review of yield* residentJoined.releaseOwner(key, reason)) {
      recordActivity({
        statePath: review.activityPath,
        root: review.observation.root,
        advicee: review.observation.advicee,
        lifetime: runtime.lifetime,
        stage: "unavailable",
        unitIdentity: review.evaluationKey
      })
    }
  }, Effect.uninterruptible)

  const residentSettleJoined = Effect.fn("ResidentRuntime.settleJoined")(function* (
    key: string,
    state: "pending" | "clear" | "unavailable",
    reason?: ResidentUnavailableReason,
    adviceId?: string
  ) {
    yield* residentRecordJoinedOutcomes(yield* residentJoined.settle(key, state, adviceId), adviceId)
  }, Effect.uninterruptible)

  const residentRecordJoinedOutcomes = Effect.fn("ResidentRuntime.recordJoinedOutcomes")(function* (
    outcomes: ReadonlyArray<JoinedReviewOutcome>,
    adviceId?: string
  ) {
    for (const { review, stage } of outcomes) {
      recordActivity({
        statePath: review.activityPath,
        root: review.observation.root,
        advicee: review.observation.advicee,
        lifetime: runtime.lifetime,
        stage,
        ...(stage !== "findings"
          ? {}
          : {
              findings:
                (yield* residentLedger.advice.snapshots()).find(({ capability }) => capability.id === adviceId)?.content
                  .findings.length ?? 0
            }),
        unitIdentity: review.evaluationKey
      })
    }
  })

  const residentRetireRoundUnit = Effect.fn("ResidentRuntime.retireRoundUnit")(function* (
    round: RoundWork,
    id: number | undefined
  ) {
    if (id !== undefined) (yield* residentLedger.rounds.policyWork(round)).retire(id)
  })
  const residentRetireUnitWork = Effect.fn("ResidentRuntime.retireUnitWork")(function* (job: UnitJob) {
    if (job.round !== undefined) yield* residentRetireRoundUnit(job.round, job.workUnitId)
  })
  const residentRetainedCredentialRequired = (dispatch: ResidentDispatchContext): boolean =>
    dispatch.controlled === null || dispatch.controlled.requireCredential === true
  const residentRetainedCredentialFields = (job: UnitJob) => {
    const required = residentRetainedCredentialRequired(job.dispatch)
    const credential = job.dispatch.credential
    if (credential === null)
      return {
        credentialGeneration: null,
        credentialStatePath: null,
        credentialRequired: required,
        credentialEnvironmentOnly: false
      }
    return {
      credentialGeneration: credential.generation,
      credentialStatePath: credential.statePath,
      credentialRequired: required,
      credentialEnvironmentOnly: credential.environmentOnly
    }
  }
  const residentRetainAdvice = Effect.fn("ResidentRuntime.retainAdvice")((
    job: UnitJob,
    evaluation: EvaluatedUnit,
    sequence: number
  ) => {
    const _server = runtime
    return Effect.gen(function* () {
      if (!(yield* residentJobActive(job))) {
        yield* residentRetireUnitWork(job)
        yield* residentReleaseUnit(job)
        return
      }
      if ((yield* residentAdvice()).some((item) => item.evaluationKey === job.evaluationKey)) {
        const existing = (yield* residentAdvice()).find((item) => item.evaluationKey === job.evaluationKey)
        if (existing !== undefined)
          yield* residentRecordJoinedOutcomes(yield* residentLedger.advice.publish(existing), existing.id)
        yield* residentRetireUnitWork(job)
        yield* residentReleaseUnit(job)
        return
      }
      const insertRetainedAdvice = Effect.fn("ResidentRuntime.insertRetainedAdvice")(function* () {
        return yield* residentLedger.advice.insert({
          analyticsPath: job.dispatch.activityPath,
          analyticsEnabled: job.analyticsEnabled ?? job.dispatch.sessionAnalytics === true,
          analyticsControlled: job.dispatch.controlled !== null,
          id: randomUUID(),
          ...(job.round === undefined ? {} : { round: job.round }),
          ...(job.workUnitId === undefined ? {} : { workUnitId: job.workUnitId }),
          admissionId: job.admissionId,
          canonicalOperationId: job.canonicalOperationId,
          canonicalRound: job.canonicalRound,
          observation: job.observation,
          partition: job.partition,
          reservation: job.reservation,
          prepared: job.prepared,
          ...(job.sourceHash === undefined ? {} : { sourceHash: job.sourceHash }),
          revision: job.revision,
          evaluationKey: job.evaluationKey,
          evaluations: [evaluation],
          findings: evaluation.findings,
          sequence,
          ...residentRetainedCredentialFields(job),
          pendingAt: residentNow()
        })
      })
      const advice = yield* insertRetainedAdvice()
      if (job.inspectionReceipt !== undefined && inspection.isEnabled(job.inspectionReceipt.scope.root))
        inspection.offer(
          job.inspectionReceipt.scope,
          {
            ...job.inspectionReceipt.correlation,
            ...(job.inspectionEvaluationId === undefined ? {} : { evaluationId: job.inspectionEvaluationId })
          },
          captureInspectionFate(evaluation.findings, "retained", "pending-advice", advice.id)
        )
      job.completed = true
      yield* Effect.gen(function* () {
        yield* withinWork(
          residentReviewControls
            .afterAdvicePending(advice.id)
            .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "pending advice barrier" }))),
          residentLifetimeController.signal
        )
        // A finding already retained is excluded from unfinished-work cutoff.
        // Replacing that work cohort must not discard the completed finding.
        if (!(yield* residentJobActive(job))) return
        yield* residentRecordJoinedOutcomes(yield* residentLedger.advice.publish(advice), advice.id)
      }).pipe(
        Effect.onError(() =>
          residentRemoveAdvice(advice.id, undefined, { fate: "discarded", reason: "retention-failed" }).pipe(
            Effect.asVoid
          )
        )
      )
    })
  })

  const residentAwaitBackendGate = Effect.fn("ResidentRuntime.awaitBackendGate")(() => {
    const _server = runtime
    return Effect.gen(function* () {
      const configured = yield* Config.option(Config.String("REVIEW_RESIDENT_BACKEND_GATE_PATH"))
      if (Option.isNone(configured)) return
      yield* residentAdapter("observe backend gate", () => access(configured.value)).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(residentLifetimeController.signal.aborted)),
        Effect.repeat({ schedule: Schedule.spaced("10 millis"), until: (ready) => ready })
      )
    }).pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "configure backend gate" })))
  })

  const residentRevalidate = Effect.fn("ResidentRuntime.revalidate")(
    (advice: Advice, dispatch: ResidentDispatchContext) =>
      Effect.gen(function* () {
        const _server = runtime
        const candidate = advice.observation.candidates[0]
        if (candidate === undefined) return { status: "unavailable" as const, findings: [] }
        const capture = yield* residentLedger.adviceCaptures.start(
          advice.reservation,
          advice.revision,
          captureWorkspaceBytes(candidate.path)
        )
        if (capture === undefined) return { status: "unavailable" as const, findings: [] }
        let capacityUnavailable = false
        return yield* Effect.gen(function* () {
          const content = yield* residentLedger.advice.current(advice)
          yield* residentReviewControls
            .afterRevalidationWorkspaceReserved(advice.id)
            .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "revalidation barrier" })))
          const userConfigPath = dispatch.userConfigPath ?? undefined
          const current = yield* withinWork(
            Effect.gen(function* () {
              const settings = yield* loadReviewSettings(
                advice.observation.root,
                residentUserConfigOptions(userConfigPath)
              )
              return yield* revalidateEvaluations(
                advice.observation,
                content.evaluations,
                {
                  controlledWriter: true,
                  advicee: advice.observation.advicee,
                  settings,
                  beforeAnalyze: (path, sourceBytes, preflight) =>
                    Effect.gen(function* () {
                      const required = analysisWorkspaceBytes(path, sourceBytes, preflight, settings.rules)
                      const resized = yield* residentLedger.adviceCaptures.resize(capture, required)
                      if (!resized) capacityUnavailable = true
                      return resized
                    })
                },
                { isCurrentWork: (prepared) => residentIsCurrentWork(advice.revision, prepared) }
              )
            }),
            advice.round?.controller.signal ?? residentLifetimeController.signal
          )
          if (!capacityUnavailable && current.status === "current")
            inspectionObserveAdviceFate(advice, current.findings, "current", "revalidated-current")
          if (!capacityUnavailable && current.status === "stale")
            inspectionObserveAdviceFate(advice, content.findings, "stale", "resident-stale")
          return capacityUnavailable ? { status: "unavailable" as const, findings: [] } : current
        }).pipe(
          Effect.catch(() => Effect.succeed<RevalidationResult>({ status: "unavailable", findings: [] })),
          Effect.ensuring(residentLedger.adviceCaptures.finish(capture))
        )
      })
  )

  const residentEditCollectionRequest = (request: EditRequest): EditCollectionRequest => ({
    requestRoute: "edit",
    operation: "collect",
    lifetime: request.lifetime,
    root: request.observation.root,
    advicee: request.observation.advicee,
    dispatch: request.dispatch,
    composed: true,
    mode: "ordinary"
  })

  function residentResponseCredentialFields(dispatch: ResidentDispatchContext) {
    return {
      credentialGeneration: dispatch.credential?.generation ?? null,
      credentialStatePath: dispatch.credential?.statePath ?? null,
      credentialRequired: dispatch.controlled === null || dispatch.controlled.requireCredential === true,
      credentialEnvironmentOnly: dispatch.credential?.environmentOnly ?? false
    }
  }
  const residentAdmittedResponseAuthority = Effect.fn("ResidentRuntime.admittedResponseAuthority")(function* (
    request: EditRequest,
    group: string,
    mode: ResponseAuthority["claudeFeedbackMode"],
    startedAt: number
  ): Effect.fn.Return<ResponseAuthority> {
    const { observation, dispatch } = request
    return Object.freeze({
      lifetime: runtime.lifetime,
      partition: group,
      root: observation.root,
      advicee: Object.freeze({ ...observation.advicee }),
      userConfigPath: dispatch.userConfigPath,
      claudeFeedbackMode: mode,
      ...residentResponseCredentialFields(dispatch),
      expiresAt: startedAt + 600_000,
      round: yield* residentLedger.rounds.get(group)
    })
  })
  const residentAdmitAndCollect = Effect.fn("ResidentRuntime.admitAndCollect")(function* (
    request: EditRequest,
    context: Ref.Ref<ResponseContext>
  ): Effect.fn.Return<ResidentResponse, ResidentAdapterError> {
    const { observation, dispatch } = request
    const startedAt = residentNow()
    const group = adviceePartition(observation.root, observation.advicee)
    const mode = residentCurrentClaudeFeedbackMode(observation.root, dispatch.userConfigPath)
    const admitted = yield* admit(observation, dispatch, true, true)
    if (admitted.status !== "accepted")
      return {
        requestRoute: "edit",
        status: admitted.status === "rejected-stale" ? "rejected-stale" : "rejected-capacity"
      }
    const authority = yield* residentAdmittedResponseAuthority(request, group, mode, startedAt)
    yield* Ref.set(context, { authority })
    const pass = Effect.fn("ResidentRuntime.collectEditResponse")(function* () {
      const gate = yield* residentCollectorGate(authority, dispatch, residentNow())
      if (gate !== undefined) return gate
      const response = yield* Effect.uninterruptibleMask((restore) =>
        restore(residentCollect(observation.root, observation.advicee, dispatch, "ordinary", authority, true)).pipe(
          Effect.flatMap(
            (response): Effect.Effect<ResidentResponse> =>
              response.status === "advice"
                ? Ref.update(context, (state) => ({ ...state, token: response.token })).pipe(Effect.as(response))
                : Effect.succeed(response)
          )
        )
      )
      return response.status === "advice"
        ? response
        : yield* residentEditCollectionStatus(authority, observation.root, observation.advicee, true, residentNow())
    })
    return yield* pass().pipe(
      Effect.repeat({ schedule: Schedule.spaced("50 millis"), while: (response) => response.status === "pending" }),
      Effect.timeoutOrElse({
        duration: request.waitMs,
        orElse: () => Effect.succeed<ResidentResponse>({ requestRoute: "edit", status: "pending" })
      }),
      Effect.catch(() =>
        Effect.succeed<ResidentResponse>({ requestRoute: "edit", status: "unavailable", reason: "lost" })
      )
    )
  })

  const residentHandlePromptMarker = Effect.fn("ResidentRuntime.handle.prompt-marker")(function* (
    request: Extract<ResidentRequest, { operation: "prompt-marker" }>
  ) {
    const group = adviceePartition(request.root, request.advicee)
    return residentResponse(
      (
        request.onlyIfMissing === true
          ? yield* residentComposedDelivery.ensureFromHostTurn(group, request.marker, residentNow())
          : yield* residentComposedDelivery.advance(group, request.marker, residentNow(), request.promptDigest)
      )
        ? { status: "advanced" }
        : { status: "rejected-capacity" }
    )
  })
  const residentHandleBeginStop = Effect.fn("ResidentRuntime.handle.begin-stop")(function* (
    request: Extract<ResidentRequest, { operation: "begin-stop" | "finish-stop" }>
  ) {
    const group = adviceePartition(request.root, request.advicee)
    if (!(yield* residentComposedDelivery.beginStop(group, request.token))) return residentResponse({ status: "busy" })
    const expiry = yield* Effect.forkIn(
      Effect.sleep("5 seconds").pipe(
        Effect.andThen(
          Effect.gen(function* () {
            residentStopExpiries.delete(request.token)
            const counts = yield* residentComposedDelivery.closureCounts(group)
            const closed = yield* residentComposedDelivery.expireStop(group, request.token)
            if (closed !== undefined) yield* residentCloseRound(group, closed, "abandoned-stop", counts)
          })
        )
      ),
      residentDispatchScope
    )
    residentStopExpiries.set(request.token, expiry)
    return residentResponse({ status: "advanced" })
  })
  const residentHandleFinishStop = Effect.fn("ResidentRuntime.handle.finish-stop")(function* (
    request: Extract<ResidentRequest, { operation: "begin-stop" | "finish-stop" }>
  ) {
    return yield* Effect.uninterruptible(
      Effect.gen(function* () {
        const expiry = residentStopExpiries.get(request.token)
        if (expiry !== undefined) yield* Fiber.interrupt(expiry)
        residentStopExpiries.delete(request.token)
        const group = adviceePartition(request.root, request.advicee)
        const counts = yield* residentComposedDelivery.closureCounts(group)
        const closed = yield* residentComposedDelivery.finishStop(
          group,
          request.token,
          request.close === true,
          residentNow()
        )
        if (closed !== undefined) yield* residentCloseRound(group, closed, request.reason ?? "no-advice", counts)
        return residentResponse({ status: "advanced" })
      })
    )
  })
  const residentHandleClaimBackground = Effect.fn("ResidentRuntime.handle.claim-background")(function* (
    request: Extract<ResidentRequest, { operation: "claim-background" | "release-background" }>
  ) {
    return residentResponse(
      (yield* residentComposedDelivery.claimBackground(
        adviceePartition(request.root, request.advicee),
        request.token,
        residentNow()
      ))
        ? { status: "background-claimed" }
        : { status: "busy" }
    )
  })
  const residentHandleReleaseBackground = Effect.fn("ResidentRuntime.handle.release-background")(function* (
    request: Extract<ResidentRequest, { operation: "claim-background" | "release-background" }>
  ) {
    yield* residentComposedDelivery.releaseBackground(adviceePartition(request.root, request.advicee), request.token)
    return residentResponse({ status: "released" })
  })
  const residentHandleBeginSubmission = Effect.fn("ResidentRuntime.handle.begin-submission")(function* (
    request: Extract<ResidentRequest, { operation: "begin-submission" }>
  ) {
    return residentResponse(yield* runtime.beginComposedSubmission(request.token, request.surface))
  })
  const residentHandleRelease = Effect.fn("ResidentRuntime.handle.release")(function* (
    request: Extract<ResidentRequest, { operation: "release" }>
  ) {
    return residentResponse(yield* runtime.releaseComposedSubmission(request.token))
  })
  const residentHandleRegisterEdit = Effect.fn("ResidentRuntime.handle.register-edit")(function* (
    request: Extract<ResidentRequest, { operation: "register-edit" | "retire-edit" }>
  ) {
    const group = adviceePartition(request.root, request.advicee)
    if (request.operation === "retire-edit") {
      yield* residentComposedDelivery.retireEdit(group, request.advicee.toolUseId)
      return residentResponse({ status: "advanced" })
    }
    const capture = yield* loadConfiguration(
      request.root,
      request.userConfigPath === undefined ? {} : { userConfigPath: request.userConfigPath }
    ).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (capture === undefined) return residentResponse({ status: "rejected-stale", reason: "InvalidConfiguration" })
    const decision = yield* residentComposedDelivery.registerEditDecision(
      group,
      request.advicee.toolUseId,
      request.startedAt,
      monotonicNow(),
      effectiveEditPermitLimits(capture.policy),
      effectiveVirtualRoundQuietMs(capture.policy)
    )
    if (!decision.accepted) return residentResponse({ status: "rejected-stale", reason: decision.reason })
    return residentResponse({ status: "advanced" })
  })
  const residentHandleAdmit = Effect.fn("ResidentRuntime.handle.admit")(function* (
    request: Extract<ResidentRequest, { operation: "admit" }>
  ) {
    if (request.composed !== true) {
      inspectionRefuse(request.observation, request.dispatch, "unsupported")
      return residentResponse({ status: "unsupported" })
    }
    return residentResponse(yield* admit(request.observation, request.dispatch, true, true))
  })
  const residentFindingResponse = (
    response: ResidentResponse
  ): response is Extract<ResidentResponse, { status: "advice" }> =>
    response.status === "advice" && response.findingCount > 0
  const residentNoticeResponse = (response: ResidentResponse): boolean =>
    response.status === "advice" && response.findingCount === 0
  const residentResponseToken = (response: ResidentResponse): string =>
    response.status === "advice" ? response.token : ""
  const residentPendingBindingCount = (
    pending: ReadonlyArray<{ readonly operation: number; readonly count: number }>,
    operation: number
  ): number => pending.find((item) => item.operation === operation)?.count ?? 0
  const residentFinishBindingValid = (
    response: ResidentResponse,
    round: RoundWork | undefined,
    count: number,
    selected: ReadonlyArray<Effect.Success<ReturnType<typeof residentLedger.advice.snapshots>>[number]>,
    pending: ReadonlyArray<{ readonly operation: number; readonly count: number }>
  ): boolean => {
    if (response.status !== "advice" || response.findingCount === 0) return true
    return (
      round !== undefined &&
      count === response.findingCount &&
      selected.every(
        ({ capability: advice, content }) =>
          advice.round === round &&
          advice.workUnitId !== undefined &&
          content.delivery !== undefined &&
          content.delivery.findings.length <= residentPendingBindingCount(pending, advice.canonicalOperationId)
      )
    )
  }
  const residentFinishSelection = Effect.fn("ResidentRuntime.finishSelection")(function* (response: ResidentResponse) {
    const advice =
      response.status === "advice"
        ? (yield* residentLedger.advice.snapshots()).filter(({ content }) => content.delivery?.token === response.token)
        : []
    const selected = advice.map(({ capability: item, content }) => ({
      id: item.id,
      unit: item.canonicalOperationId,
      findings: content.delivery?.findings ?? []
    }))
    const count = selected.reduce((count, item) => count + item.findings.length, 0)
    return { advice, selected, count }
  })
  const residentSupportedCollection = (request: Extract<ResidentRequest, { operation: "collect" }>): boolean =>
    request.composed === true && (request.mode !== "turn-end" || request.finish !== undefined)
  const residentHandleCollect = Effect.fn("ResidentRuntime.handle.collect")(function* (
    request: Extract<ResidentRequest, { operation: "collect" }>
  ) {
    if (!residentSupportedCollection(request)) return residentResponse({ status: "unsupported" })
    const prepareFinishGate = Effect.fn("ResidentRuntime.prepareFinishGate")(function* () {
      const finish = request.finish
      if (finish === undefined) return undefined

      const group = adviceePartition(request.root, request.advicee)
      if (!(yield* residentComposedDelivery.ownsStop(group, finish.token))) return residentResponse({ status: "empty" })
      // Expired leases represent uncertain external output, not live writers.
      yield* residentPruneNoticeCooldowns(residentNow())
      const pruneFinishLeases = Effect.fn("ResidentRuntime.pruneFinishLeases")(function* () {
        for (const { capability: advice, content } of yield* residentLedger.advice.snapshots()) {
          if (
            adviceePartition(advice.observation.root, advice.observation.advicee) === group &&
            content.delivery !== undefined &&
            content.delivery.leaseUntil <= residentNow()
          )
            yield* residentReleaseAdviceLease(advice)
        }
      })
      yield* pruneFinishLeases()
      const round = yield* residentLedger.rounds.get(group)
      const totalUnfinished = yield* residentCollectionWorkCount(request.root, request.advicee, true)
      const ownUnfinished = round === undefined ? 0 : (yield* residentLedger.rounds.policyWork(round)).unfinished()
      const extraUnfinished = Math.max(0, totalUnfinished - ownUnfinished)
      const gate = yield* residentComposedDelivery.finishGate(
        group,
        finish.token,
        extraUnfinished,
        finish.deadlineReached
      )
      const discardFinishRound = Effect.fn("ResidentRuntime.discardFinishRound")(function* (
        gate: Extract<Effect.Success<ReturnType<typeof residentComposedDelivery.finishGate>>, { status: "cutoff" }>
      ) {
        if (round === undefined) return true
        return yield* residentDiscardUnfinishedWork(round, gate)
      })
      const interpretFinishGate = Effect.fn("ResidentRuntime.interpretFinishGate")(function* () {
        if (gate === undefined) return residentResponse({ status: "empty" })
        if (gate.status === "waiting") return residentResponse({ status: "pending" })
        if (!(yield* discardFinishRound(gate))) {
          yield* residentAllowFinish(group, finish.token, "unavailable")
          return residentResponse({ status: "empty" })
        }
        if (gate.limited) {
          yield* residentAllowFinish(group, finish.token, "limit")
          return residentResponse({ status: "empty" })
        }
        return undefined
      })
      return yield* interpretFinishGate()
    })
    const gateResponse = yield* prepareFinishGate()
    if (gateResponse !== undefined) return gateResponse
    const collected = yield* residentCollect(
      request.root,
      request.advicee,
      request.dispatch,
      request.mode ?? "ordinary",
      undefined,
      true
    )
    const reserveFinishOutput = Effect.fn("ResidentRuntime.reserveFinishOutput")(function* () {
      const finish = request.finish
      if (finish === undefined) return undefined

      const group = adviceePartition(request.root, request.advicee)
      const round = yield* residentLedger.rounds.get(group)
      const selection = yield* residentFinishSelection(collected)
      const pendingFindings = (yield* residentLedger.canonicalProjection()).pendingFindings
      const bindingValid = residentFinishBindingValid(
        collected,
        round,
        selection.count,
        selection.advice,
        pendingFindings
      )
      const output = yield* residentComposedDelivery.decideFinishOutput(
        group,
        finish.token,
        residentResponseToken(collected),
        selection.selected,
        residentNow(),
        residentNoticeResponse(collected),
        true,
        true,
        bindingValid,
        finish.deadlineReached
      )
      if (output.kind === "failed") {
        if (collected.status === "advice") yield* runtime.releaseDelivery(collected.token)
        return residentResponse({ status: "empty" })
      }
      if (output.kind === "allowed") {
        if (collected.status === "advice") yield* runtime.releaseDelivery(collected.token)
        yield* residentAllowFinish(group, finish.token, output.reason)
        if (collected.status === "advice") return residentResponse({ status: "empty" })
      }
      // Only findings can reach the hook. Operational failures remain in
      // resident diagnostics and cannot reserve a continuation.
      return residentResponse(collected)
    })
    const outputResponse = yield* reserveFinishOutput()
    if (outputResponse !== undefined) return outputResponse
    return residentResponse(
      request.reportWorkState === true && collected.status === "empty"
        ? yield* residentCollectionWorkState(request.root, request.advicee, true)
        : collected
    )
  })
  const residentHandleCleanup = Effect.fn("ResidentRuntime.handle.cleanup")(function* (
    _request: Extract<ResidentRequest, { operation: "cleanup" }>
  ) {
    const status = yield* cleanup()
    return residentResponse({ status })
  })
  const residentRequestNeedsSweep = (request: ResidentRequest): boolean =>
    ["register-edit", "admit", "admit-and-collect", "begin-stop"].includes(request.operation)
  const residentRequestUnsupported = (request: ResidentRequest): boolean =>
    ("advicee" in request && request.advicee.host === "opencode") ||
    ((request.operation === "admit" || request.operation === "admit-and-collect") &&
      request.observation.advicee.host === "opencode")
  const residentRequestLifetime = Effect.fn("ResidentRuntime.requestLifetime")(function* (request: ResidentRequest) {
    if (request.operation === "hello") {
      return residentResponse(
        (yield* residentLedger.runtime.snapshot()).lifecycle === "active"
          ? { status: "ready", lifetime: runtime.lifetime, pid: process.pid }
          : { status: "obsolete-lifetime" }
      )
    }
    if (request.lifetime !== runtime.lifetime || (yield* residentLedger.runtime.snapshot()).lifecycle !== "active") {
      return residentResponse(
        request.requestRoute === "edit"
          ? { requestRoute: "edit", status: "unavailable", reason: "lost" }
          : { status: "obsolete-lifetime" }
      )
    }
    return undefined
  })
  const residentRouteBoundary = Effect.fn("ResidentRuntime.routeBoundary")(function* (
    request: ResidentRequest,
    _context: Ref.Ref<ResponseContext>
  ) {
    if (request.operation === "prompt-marker") return yield* residentHandlePromptMarker(request)
    if (request.operation === "begin-stop") return yield* residentHandleBeginStop(request)
    if (request.operation === "finish-stop") return yield* residentHandleFinishStop(request)
    if (request.operation === "claim-background") return yield* residentHandleClaimBackground(request)
    if (request.operation === "release-background") return yield* residentHandleReleaseBackground(request)
    return undefined
  })
  const residentRouteReview = Effect.fn("ResidentRuntime.routeReview")(function* (
    request: ResidentRequest,
    context: Ref.Ref<ResponseContext>
  ) {
    if (request.operation === "begin-submission") return yield* residentHandleBeginSubmission(request)
    if (request.operation === "release") return yield* residentHandleRelease(request)
    if (request.operation === "register-edit" || request.operation === "retire-edit")
      return yield* residentHandleRegisterEdit(request)
    if (request.operation === "admit-and-collect") return yield* residentAdmitAndCollect(request, context)
    if (request.operation === "admit") return yield* residentHandleAdmit(request)
    if (request.operation === "collect") return yield* residentHandleCollect(request)
    return undefined
  })
  const residentRouteAdministration = Effect.fn("ResidentRuntime.routeAdministration")(function* (
    request: ResidentRequest,
    _context: Ref.Ref<ResponseContext>
  ) {
    if (request.operation === "inspection-writer") {
      const observer = inspectionSubmissions.observation.forAttempt({
        batchId: request.token,
        attemptId: request.attemptId,
        endpoint: paths.socket,
        lifetime: request.lifetime,
        root: request.root,
        advicee: request.advicee,
        findingCount: request.findingCount,
        noticeOnly: request.noticeOnly
      })
      observer?.observe({
        state: request.state,
        ...(request.encoded === undefined ? {} : { encoded: request.encoded })
      })
      // Receipt of an optional report is not delivery or persistence acknowledgement.
      return residentResponse({ status: "empty" })
    }
    if (
      (request.operation === "acknowledge" || request.operation === "finalize") &&
      !(yield* residentComposedDelivery.hasToken(request.token))
    )
      return residentResponse({ status: "empty" })
    if (request.operation === "acknowledge") return residentResponse(yield* runtime.acknowledge(request.token))
    if (request.operation === "finalize") return residentResponse(yield* runtime.finalize(request.token))
    if (request.operation === "stats") return residentResponse(yield* runtime.operations.stats())
    if (request.operation === "cleanup") return yield* residentHandleCleanup(request)
    return undefined
  })
  const residentResponseContext = Effect.fn("ResidentRuntime.responseContext")(
    (context: Ref.Ref<ResponseContext> | undefined) =>
      context === undefined ? Ref.make<ResponseContext>({}) : Effect.succeed(context)
  )
  const residentHandle = Effect.fn("ResidentRuntime.handle")(function* (
    request: ResidentRequest,
    responseContext?: Ref.Ref<ResponseContext>
  ) {
    const context = yield* residentResponseContext(responseContext)
    const lifetime = yield* residentRequestLifetime(request)
    if (lifetime !== undefined) {
      if (request.operation === "admit" || request.operation === "admit-and-collect")
        inspectionRefuse(request.observation, request.dispatch, "obsolete-lifetime")
      return lifetime
    }
    if (residentRequestNeedsSweep(request)) yield* sweepQuietRounds(residentNow())
    if (residentRequestUnsupported(request)) {
      if (request.operation === "admit" || request.operation === "admit-and-collect")
        inspectionRefuse(request.observation, request.dispatch, "unsupported")
      return residentResponse({ status: "unsupported" })
    }
    for (const route of [residentRouteBoundary, residentRouteReview, residentRouteAdministration]) {
      const response = yield* route(request, context)
      if (response !== undefined) return response
    }
    return residentResponse({ status: "unsupported" })
  })

  function residentCurrentClaudeFeedbackMode(root: string, userConfigPath: string | null): ClaudeOutputMode {
    const authority = readCurrentClaudeFeedbackAuthority(root, userConfigPath ?? undefined)
    return authority.valid ? authority.mode : "advisory"
  }

  const residentCollectorLifetimeCurrent = Effect.fn("ResidentRuntime.collectorLifetimeCurrent")(function* (
    authority: ResponseAuthority
  ) {
    return (
      authority.lifetime === runtime.lifetime &&
      (yield* residentLedger.runtime.snapshot()).lifecycle === "active" &&
      (yield* residentRoundActive(authority.round))
    )
  })
  const residentCollectorGate = Effect.fn("ResidentRuntime.collectorGate")(function* (
    authority: ResponseAuthority,
    dispatch: ResidentDispatchContext,
    now: number
  ): Effect.fn.Return<ResidentResponse | undefined> {
    if (!(yield* residentCollectorLifetimeCurrent(authority)))
      return { requestRoute: "edit", status: "unavailable", reason: "lost" }
    const command = (yield* residentLedger.transition({
      kind: "collectorGateCheck",
      expired: now >= authority.expiresAt,
      credentialValid:
        authority.credentialGeneration === (dispatch.credential?.generation ?? null) &&
        residentCredentialAuthority(authority)
    })).commands[0]
    if (command?.kind === "collectorProceed") return undefined
    if (command?.kind === "collectorUnavailable") {
      return { requestRoute: "edit", status: "unavailable", reason: command.reason }
    }
    throw new Error("canonical authority collect gate refused")
  })

  const residentAdvicePartitionMatches = (item: Advice, partition: string, composed: boolean): boolean =>
    composed
      ? adviceePartition(item.observation.root, item.observation.advicee) === partition
      : item.partition === partition
  const residentEditCollectionStatus = Effect.fn("ResidentRuntime.editCollectionStatus")(function* (
    authority: ResponseAuthority,
    root: string,
    advicee: DirectAdvicee,
    composed: boolean,
    now: number
  ): Effect.fn.Return<ResidentResponse> {
    const partition = composed ? adviceePartition(root, advicee) : authority.partition
    let hasAdvice = false
    for (const item of yield* residentAdvice()) {
      if (residentAdvicePartitionMatches(item, partition, composed) && !(yield* residentAdviceExpired(item, now))) {
        hasAdvice = true
        break
      }
    }
    return {
      requestRoute: "edit",
      status: hasAdvice || (yield* residentCollectionWorkCount(root, advicee, composed)) > 0 ? "pending" : "empty"
    }
  })

  function residentCredentialAuthority(authority: ResponseAuthority): boolean {
    if (!authority.credentialRequired) return true
    const credentialState =
      authority.credentialStatePath === null ? undefined : readCredentialState(authority.credentialStatePath)
    return (
      credentialState !== undefined &&
      credentialState.generation === authority.credentialGeneration &&
      (authority.credentialEnvironmentOnly || !credentialState.savedUseSuspended)
    )
  }

  function residentAdviceCredentialAuthority(advice: Advice): boolean {
    if (advice.credentialStatePath === null) return !advice.credentialRequired
    const state = readCredentialState(advice.credentialStatePath)
    return (
      state !== undefined &&
      state.generation === advice.credentialGeneration &&
      (advice.credentialEnvironmentOnly || !state.savedUseSuspended)
    )
  }

  const residentResponseGateVariable = (
    operation: ResidentRequest["operation"],
    advice: boolean
  ): string | undefined => {
    if (advice && (operation === "collect" || operation === "admit-and-collect"))
      return "REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH"
    const variables: Partial<Record<ResidentRequest["operation"], string>> = {
      admit: "REVIEW_RESIDENT_ADMIT_RESPONSE_GATE_PATH",
      cleanup: "REVIEW_RESIDENT_CLEANUP_RESPONSE_GATE_PATH",
      collect: "REVIEW_RESIDENT_COLLECT_RESPONSE_GATE_PATH",
      "admit-and-collect": "REVIEW_RESIDENT_COLLECT_RESPONSE_GATE_PATH",
      acknowledge: "REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH"
    }
    return variables[operation]
  }
  const residentResponseGate = Effect.fn("ResidentIpc.responseGate")(
    (operation: ResidentRequest["operation"], response: ResidentResponse) =>
      Effect.gen(function* () {
        const adviceGate = yield* Config.option(Config.String("REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH"))
        const variable = residentResponseGateVariable(
          operation,
          response.status === "advice" && Option.isSome(adviceGate)
        )
        if (variable === undefined) return
        const configured = yield* Config.option(Config.String(variable))
        if (Option.isNone(configured)) return
        const gate = configured.value
        const enabled = yield* residentAdapter("observe response gate", () => access(`${gate}.enabled`)).pipe(
          Effect.as(true),
          Effect.catch(() => Effect.succeed(false))
        )
        if (!enabled) return
        yield* residentAdapter("enter response gate", () => writeFile(`${gate}.entered`, "entered\n"))
        yield* residentAdapter("observe response release", () => access(`${gate}.release`)).pipe(
          Effect.as(true),
          Effect.catch(() => Effect.succeed(false)),
          Effect.repeat({ schedule: Schedule.spaced("10 millis"), until: (released) => released })
        )
      }).pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "response gate" })))
  )

  const residentHandoffSourceCurrent = Effect.fn("ResidentIpc.handoffSourceCurrent")((response: ResidentResponse) => {
    const _server = runtime
    return Effect.gen(function* () {
      const current = new Map<string, boolean>()
      if (response.status !== "advice") return current
      for (const advice of yield* residentAdvice()) {
        if ((yield* residentLedger.advice.current(advice)).delivery?.token !== response.token) continue
        const relativePath = advice.prepared.input.path
        const captured = yield* captureStable(
          advice.observation.root,
          { relativePath, absolutePath: resolve(advice.observation.root, relativePath) },
          {},
          advice.observation.rootIdentity
        )
        current.set(advice.id, advice.sourceHash !== undefined && captured?.contentHash === advice.sourceHash)
      }
      return current
    })
  })

  const residentEditCollectRequest = (request: HandoffRequest): request is EditCollectionRequest =>
    request.requestRoute === "edit" && request.operation === "collect"
  const residentSharedWorkStateRequest = (
    request: HandoffRequest
  ): request is Extract<ResidentRequest, { operation: "collect" }> =>
    request.requestRoute === "shared" &&
    request.operation === "collect" &&
    request.finish === undefined &&
    request.reportWorkState === true
  const residentPendingResponse = (response: ResidentResponse): boolean =>
    response.status === "pending" || response.status === "empty"
  const residentClaudeStopRequest = (
    request: HandoffRequest
  ): request is Extract<ResidentRequest, { operation: "collect" }> =>
    request.operation === "collect" &&
    request.requestRoute === "shared" &&
    request.composed === true &&
    request.advicee.host === "claude-code" &&
    request.mode === "turn-end"
  const residentHandoffSurface = (
    request: Extract<HandoffRequest, { operation: "collect" }>,
    authority: ResponseAuthority | undefined
  ) => {
    if (authority !== undefined) return authority.claudeFeedbackMode
    return residentClaudeStopRequest(request) ? ("claude-stop" as const) : ("codex" as const)
  }
  const residentSharedPendingWork = (
    request: HandoffRequest,
    response: ResidentResponse
  ): request is Extract<ResidentRequest, { operation: "collect" }> =>
    residentSharedWorkStateRequest(request) && residentPendingResponse(response)
  const residentMissingEditAuthority = (request: HandoffRequest, authority: ResponseAuthority | undefined): boolean =>
    residentEditCollectRequest(request) && authority === undefined
  const residentResponseForHandoff = Effect.fn("ResidentRuntime.responseForHandoff")(function* (
    request: HandoffRequest,
    response: ResidentResponse,
    sourceCurrent: ReadonlyMap<string, boolean>,
    authority?: ResponseAuthority
  ): Effect.fn.Return<ResidentResponse> {
    const nonAdviceHandoff = Effect.fn("ResidentRuntime.nonAdviceHandoff")(function* (
      response: Exclude<ResidentResponse, { status: "advice" }>
    ): Effect.fn.Return<ResidentResponse> {
      if (residentSharedPendingWork(request, response)) {
        return yield* residentCollectionWorkState(request.root, request.advicee, request.composed === true)
      }
      if (!residentEditCollectRequest(request) || !residentPendingResponse(response)) return response
      const now = residentNow()
      yield* residentExpirePending(now)
      yield* residentPruneNoticeCooldowns(now)
      if (authority === undefined) return { requestRoute: "edit", status: "unavailable", reason: "lost" }
      return (
        (yield* residentCollectorGate(authority, request.dispatch, now)) ??
        (yield* residentEditCollectionStatus(authority, request.root, request.advicee, request.composed === true, now))
      )
    })
    if (response.status !== "advice") return yield* nonAdviceHandoff(response)
    inspectionSubmissions.revoke(response.token)
    const now = residentNow()
    yield* residentExpirePending(now)
    yield* residentPruneNoticeCooldowns(now)
    const observeDeliveryCredential = Effect.fn("ResidentRuntime.observeDeliveryCredential")(function* (
      invalidSeen: boolean,
      generationValid: boolean,
      authorized: boolean
    ) {
      const observed = yield* residentLedger.transition({
        kind: "deliveryCredentialObserveCheck",
        invalidSeen,
        generationValid,
        authorized
      })
      if (observed.rejection !== undefined || observed.commands.length !== 1)
        throw new Error("canonical credential observation refused")
      return observed.commands[0]?.kind === "deliveryCredentialInvalid"
    })
    const validateHandoffCredentials = Effect.fn("ResidentRuntime.validateHandoffCredentials")(
      function* (): Effect.fn.Return<ResidentResponse | undefined> {
        const sharedCollect = request.operation === "collect"
        const observeCredentials = Effect.fn("ResidentRuntime.observeDeliveryCredentials")(function* () {
          let invalidCredential = false
          if (request.operation === "collect")
            for (const advice of yield* residentAdvice()) {
              if (
                invalidCredential ||
                (yield* residentLedger.advice.current(advice)).delivery?.token !== response.token
              )
                continue
              const generationValid = advice.credentialGeneration === (request.dispatch.credential?.generation ?? null)
              invalidCredential = yield* observeDeliveryCredential(
                invalidCredential,
                generationValid,
                generationValid && residentAdviceCredentialAuthority(advice)
              )
            }
          return invalidCredential
        })
        const invalidCredential = yield* observeCredentials()
        const credentialGate = yield* residentLedger.transition({
          kind: "deliveryFinalCredentialCheck",
          sharedCollect,
          invalidSeen: invalidCredential
        })
        if (credentialGate.rejection !== undefined || credentialGate.commands.length !== 1)
          throw new Error("canonical final credential gate refused")
        if (credentialGate.commands[0]?.kind !== "deliveryBatchProceed") {
          yield* runtime.releaseComposedSubmission(response.token)
          return request.requestRoute === "edit"
            ? { requestRoute: "edit", status: "unavailable", reason: "credential" }
            : { status: "empty" }
        }

        return undefined
      }
    )
    const credentialResponse = yield* validateHandoffCredentials()
    if (credentialResponse !== undefined) return credentialResponse
    const selectHandoffCandidates = Effect.fn("ResidentRuntime.selectHandoffCandidates")(function* () {
      const finalCandidateRoute = Effect.fn("ResidentRuntime.finalCandidateRoute")(function* (advice: Advice) {
        return yield* residentCandidateRoute({
          kind: "finalCandidateCheck",
          ownerCurrent: true,
          credentialGeneration: true,
          credentialAuthorized: true,
          expired: !(yield* residentRoundActive(advice.round)) || (yield* residentAdviceExpired(advice, now)),
          workCurrent:
            (yield* residentIsCurrentWork(advice.revision, advice.prepared)) && sourceCurrent.get(advice.id) === true,
          hasFindings: ((yield* residentLedger.advice.current(advice)).delivery?.findings.length ?? 0) > 0
        })
      })
      const handoff: Array<Advice> = []
      for (const advice of [...(yield* residentAdvice())]) {
        if ((yield* residentLedger.advice.current(advice)).delivery?.token !== response.token) continue
        const route = yield* finalCandidateRoute(advice)
        if (route === "retireCandidate") {
          yield* residentRemoveAdvice(advice.id, response.token)
          continue
        }
        if (route === "releaseCandidate") {
          yield* residentReleaseAdviceLease(advice)
          continue
        }
        if (route !== "retainCandidate") continue
        yield* residentLedger.advice.updateDelivery(advice, response.token, { leaseUntil: now + DELIVERY_LEASE_MS })
        handoff.push(advice)
      }

      return handoff
    })
    const handoff = yield* selectHandoffCandidates()
    if (residentMissingEditAuthority(request, authority)) {
      yield* runtime.releaseDelivery(response.token)
      return { requestRoute: "edit", status: "unavailable", reason: "lost" }
    }
    const fitHandoffFindings = Effect.fn("ResidentRuntime.fitHandoffFindings")(function* () {
      if (request.operation === "collect") {
        const composed = request.composed === true
        const partition = adviceePartition(request.root, request.advicee)
        const generation = request.dispatch.credential?.generation ?? null
        const pruneHandoffBounds = Effect.fn("ResidentRuntime.pruneHandoffBounds")(function* () {
          if (composed)
            for (const advice of handoff) {
              const { delivery } = yield* residentLedger.advice.current(advice)
              if (
                delivery !== undefined &&
                (advice.round === undefined ||
                  advice.workUnitId === undefined ||
                  delivery.findings.length > (yield* residentPendingCanonicalFindings(advice.canonicalOperationId)))
              ) {
                yield* residentReleaseAdviceLease(advice)
              }
            }
        })
        yield* pruneHandoffBounds()
        const offers = (yield* Effect.forEach(
          handoff,
          Effect.fn("ResidentRuntime.finalOffers")(function* (advice) {
            const facts = yield* residentFindingSelectionFacts(advice, partition, generation, now, composed)
            const { delivery } = yield* residentLedger.advice.current(advice)
            return (delivery?.findings ?? []).map((finding) => ({ finding, facts }))
          })
        )).flat()
        const accepted = new Set(
          yield* selectFittingCurrentFindingIndices(
            offers,
            residentHandoffSurface(request, authority),
            undefined,
            residentCollectionFindingOffer
          )
        )
        let index = 0
        for (const advice of handoff) {
          const { delivery } = yield* residentLedger.advice.current(advice)
          if (delivery === undefined) continue
          const fitting = delivery.findings.filter(() => accepted.has(index++))
          yield* residentLedger.advice.updateDelivery(advice, response.token, { findings: fitting })
          if (fitting.length === 0) yield* residentReleaseAdviceLease(advice)
        }
      }
    })
    yield* fitHandoffFindings()
    const finalContents = yield* Effect.forEach(handoff, (advice) => residentLedger.advice.current(advice))
    const findings = finalContents.flatMap((content) => content.delivery?.findings ?? [])
    const notices = yield* residentNoticesForToken(response.token)
    const checkHandoffOutputFit = Effect.fn("ResidentRuntime.checkHandoffOutputFit")(function* (): Effect.fn.Return<
      ResidentResponse | undefined
    > {
      if (residentClaudeStopRequest(request)) {
        const fit = yield* residentLedger.transition({
          kind: "collectionFitCheck",
          items: findings.length + notices.length,
          bytes: encodedClaudeStopOutputBytes(
            findings,
            notices.map((notice) => notice.value)
          )
        })
        if (fit.rejection !== undefined || fit.commands.length !== 1) {
          throw new Error("canonical final response fit refused")
        }
        if (fit.commands[0]?.kind === "collectionLimited") {
          yield* runtime.releaseDelivery(response.token)
          return { status: "empty" }
        }
        if (fit.commands[0]?.kind !== "collectionFits") {
          throw new Error("invalid canonical final response fit")
        }
      }

      return undefined
    })
    const fitResponse = yield* checkHandoffOutputFit()
    if (fitResponse !== undefined) return fitResponse
    for (const notice of notices) {
      yield* residentNotices.renew(notice.id, now + DELIVERY_LEASE_MS)
    }
    const checkHandoffFinalAuthority = Effect.fn("ResidentRuntime.checkHandoffFinalAuthority")(
      function* (): Effect.fn.Return<ResidentResponse | undefined> {
        const checkCollectorAuthority = Effect.fn("ResidentRuntime.checkCollectorAuthority")(
          function* (): Effect.fn.Return<ResidentResponse | undefined> {
            if (authority !== undefined && request.operation === "collect") {
              const gate = yield* residentCollectorGate(authority, request.dispatch, now)
              if (gate !== undefined) {
                yield* runtime.releaseDelivery(response.token)
                return gate
              }
            }
            return undefined
          }
        )
        const gate = yield* checkCollectorAuthority()
        if (gate !== undefined) return gate
        const admittedBlock = authority?.claudeFeedbackMode === "block-current-findings"
        const currentBlock =
          admittedBlock &&
          authority !== undefined &&
          residentCurrentClaudeFeedbackMode(authority.root, authority.userConfigPath) === "block-current-findings"
        if (
          authority !== undefined &&
          residentEditCollectRequest(request) &&
          (yield* residentLedger.transition({ kind: "collectorFinalAuthorityCheck", admittedBlock, currentBlock }))
            .commands[0]?.kind !== "collectorFinalProceed"
        ) {
          // A revoked opt-in cannot turn the old selection into an advisory lease.
          yield* runtime.releaseDelivery(response.token)
          return yield* residentEditCollectionStatus(
            authority,
            request.root,
            request.advicee,
            request.composed === true,
            now
          )
        }

        return undefined
      }
    )
    const authorityResponse = yield* checkHandoffFinalAuthority()
    if (authorityResponse !== undefined) return authorityResponse
    const makeHandoffResponse = (): ResidentResponse => {
      return findings.length === 0 && notices.length === 0
        ? { status: "empty" }
        : authority === undefined
          ? {
              status: "advice",
              token: response.token,
              findingCount: findings.length,
              output: combinedReviewOutput(
                findings,
                notices.map((notice) => notice.value)
              )
            }
          : {
              requestRoute: "edit",
              status: "advice",
              token: response.token,
              findingCount: findings.length,
              output: combinedClaudeOutput(
                findings,
                notices.map((notice) => notice.value),
                authority.claudeFeedbackMode
              )
            }
    }
    const selected = makeHandoffResponse()
    const finishEditHandoff = Effect.fn("ResidentRuntime.finishEditHandoff")(
      function* (): Effect.fn.Return<ResidentResponse> {
        if (!residentEditCollectRequest(request)) return selected
        if (authority === undefined) return { requestRoute: "edit", status: "unavailable", reason: "lost" }
        return selected.status === "advice"
          ? { ...selected, requestRoute: "edit" }
          : yield* residentEditCollectionStatus(
              authority,
              request.root,
              request.advicee,
              request.composed === true,
              now
            )
      }
    )
    const finalResponse = yield* finishEditHandoff()
    // Final fit, source and authority checks may change the provisional membership.
    // Replace its detached observation ownership only after those checks finish.
    if (finalResponse.status === "advice" && request.operation === "collect" && inspection.isEnabled(request.root)) {
      const payload = captureInspectionFate(findings, "retained", "pending-advice").payload
      if (payload.status === "available")
        inspectionSubmissions.register(response.token, {
          root: request.root,
          advicee: request.advicee,
          findingIds: payload.findingIds,
          evaluations: finalContents.flatMap((content, index) => {
            if (!content.delivery?.findings.length) return []
            const advice = handoff[index]!
            const evaluationId = inspectionOrigins.get(advice.evaluationKey)
            return [
              { semanticIdentity: advice.prepared.identity, ...(evaluationId === undefined ? {} : { evaluationId }) }
            ]
          })
        })
    }
    return finalResponse
  }, Effect.uninterruptible)

  const residentFinishWriteMatches = (canWrite: boolean, response: ResidentResponse, token: string): boolean =>
    canWrite && response.status === "advice" && response.token === token
  const residentFinishOutputReason = (output: ReturnType<ComposedDelivery["decideFinishOutput"]>): RoundCloseReason =>
    output.kind === "allowed" ? output.reason : "unavailable"
  const residentReconcileFinishHandoff = Effect.fn("ResidentRuntime.reconcileFinishHandoff")(function* (
    request: ResidentRequest,
    provisional: ResidentResponse,
    final: ResidentResponse,
    canWrite: boolean
  ): Effect.fn.Return<ResidentResponse> {
    if (request.operation !== "collect" || request.finish === undefined || !residentFindingResponse(provisional))
      return final
    const group = adviceePartition(request.root, request.advicee)
    if (
      !(yield* residentComposedDelivery.revokeProvisionalFinishOutput(group, request.finish.token, provisional.token))
    ) {
      yield* runtime.releaseDelivery(provisional.token)
      yield* residentAllowFinish(group, request.finish.token, "unavailable")
      return { status: "empty" }
    }
    const round = yield* residentLedger.rounds.get(group)
    const selection = yield* residentFinishSelection(final)
    const pendingFindings = (yield* residentLedger.canonicalProjection()).pendingFindings
    const bindingValid = residentFinishBindingValid(final, round, selection.count, selection.advice, pendingFindings)
    const output = yield* residentComposedDelivery.decideFinishOutput(
      group,
      request.finish.token,
      residentResponseToken(final),
      selection.selected,
      residentNow(),
      residentNoticeResponse(final),
      false,
      residentFinishWriteMatches(canWrite, final, provisional.token),
      bindingValid,
      request.finish.deadlineReached
    )
    if (output.kind === "reserved") return final
    if (final.status === "advice") yield* runtime.releaseDelivery(final.token)
    yield* residentAllowFinish(group, request.finish.token, residentFinishOutputReason(output))
    return { status: "empty" }
  }, Effect.uninterruptible)

  const residentServe = Effect.fn("ResidentIpc.serve")(function* (port: SocketFramePort) {
    const frame = yield* port.read
    if (frame._tag === "Closed") return
    const decoded = frame._tag === "Frame" ? decodeCurrentResidentRequest(frame.encoded) : undefined
    if (decoded === undefined) {
      yield* port.write(
        encodeCurrentResidentResponse({ status: frame._tag === "Oversized" ? "rejected-capacity" : "unsupported" })
      )
      yield* port.closed
      return
    }
    if (decoded.operation === "admit-and-collect") yield* port.setIdleTimeout(EDIT_REQUEST_DEADLINE_MS)
    yield* residentPruneCollectionTokenIds()
    const server = runtime
    const context = yield* Ref.make<ResponseContext>({})
    let responseToken: string | undefined
    let handedToTransport = false
    const respond = Effect.gen(function* () {
      const response = yield* residentHandle(decoded, context)
      if (response.status === "advice") responseToken = response.token
      yield* residentResponseGate(decoded.operation, response)
      yield* residentReviewControls
        .beforeResponseHandoff()
        .pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "response handoff barrier" })))
      const sourceCurrent = yield* residentHandoffSourceCurrent(response)
      // Keep final authorization and socket handoff within one ownership
      // boundary; the response finalizer owns any untransferred lease.
      yield* Effect.uninterruptible(
        Effect.gen(function* () {
          const authority = (yield* Ref.get(context)).authority
          const request = decoded.operation === "admit-and-collect" ? residentEditCollectionRequest(decoded) : decoded
          const selected = yield* residentResponseForHandoff(request, response, sourceCurrent, authority)
          const handoff = yield* residentReconcileFinishHandoff(decoded, response, selected, port.canWrite())
          yield* residentPruneCollectionTokenIds()
          if (!port.canWrite()) {
            if (handoff.status === "advice") yield* server.releaseDelivery(handoff.token)
            if (handoff.status === "cleaned") yield* residentScheduleRetirementClose()
            return
          }
          handedToTransport = yield* port.write(encodeCurrentResidentResponse(handoff))
          if (handoff.status === "cleaned") yield* residentScheduleRetirementClose()
        })
      )
      yield* port.closed
    }).pipe(
      Effect.catch(() =>
        port.write(encodeCurrentResidentResponse({ status: "unsupported" })).pipe(Effect.andThen(port.closed))
      ),
      Effect.ensuring(
        Effect.gen(function* () {
          const token = (yield* Ref.get(context)).token ?? responseToken
          if ((!handedToTransport || port.errored()) && token !== undefined) yield* server.releaseDelivery(token)
          yield* Ref.set(context, {})
        })
      )
    )
    yield* respond.pipe(
      Effect.raceFirst(port.closed),
      Effect.ensuring(
        Effect.gen(function* () {
          yield* port.close
          const closedPath = runtimeConfiguration.collectDisconnectPath
          if (
            closedPath !== undefined &&
            decoded.operation === "collect" &&
            decoded.advicee.toolUseId === "disconnect"
          ) {
            yield* residentAdapter("collect disconnect diagnostic", () => writeFile(closedPath, "closed\n")).pipe(
              Effect.ignore
            )
          }
        })
      )
    )
  })

  const residentAccept = Effect.fn("ResidentIpc.accept")((socket: Socket) =>
    Effect.acquireUseRelease(
      makeSocketFramePort(socket),
      (port) =>
        Effect.acquireUseRelease(
          residentLedger.runtime.openConnection(MAX_IPC_CONNECTIONS),
          (connection) =>
            Effect.gen(function* () {
              if (connection === undefined) {
                yield* port.write(encodeCurrentResidentResponse({ status: "rejected-capacity" }))
                yield* port.closed
                return
              }
              yield* residentScheduleIdleCheck()
              yield* residentServe(port)
            }),
          (connection) =>
            port.close.pipe(
              Effect.andThen(
                Effect.gen(function* () {
                  if (connection !== undefined) yield* residentLedger.runtime.releaseConnection(connection)
                  yield* residentScheduleIdleCheck()
                })
              )
            )
        ),
      (port) => port.close
    )
  )

  const residentScheduleRetirementClose = Effect.fn("ResidentRuntime.scheduleRetirementClose")(function* () {
    if (!(yield* residentLedger.runtime.scheduleRetirement())) return
    // Retirement runs at the process boundary, outside the scope it closes.
    // Keeping the closing fiber in that scope would make it await itself.
    yield* Effect.forkIn(Effect.sleep("10 millis").pipe(Effect.andThen(runtime.close)), residentRuntimeScope)
  })

  const residentScheduleIdleCheck = Effect.fn("ResidentRuntime.scheduleIdleCheck")(function* () {
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return
    const pass = Effect.gen(function* () {
      if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return true
      if ((yield* residentLedger.runtime.snapshot()).connections === 0 && (yield* cleanup()) === "cleaned") {
        yield* residentScheduleRetirementClose()
        return true
      }
      return false
    })
    yield* FiberHandle.run(
      residentIdleChecks,
      Effect.sleep(RESIDENT_IDLE_CHECK_MS).pipe(
        Effect.andThen(
          pass.pipe(
            Effect.repeat({ schedule: Schedule.spaced(RESIDENT_IDLE_CHECK_MS), until: (retiring) => retiring }),
            Effect.asVoid
          )
        )
      )
    )
  })

  const residentScheduleQuietCheck = Effect.fn("ResidentRuntime.scheduleQuietCheck")(function* () {
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return
    const pass = Effect.gen(function* () {
      if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return true
      yield* sweepQuietRounds(residentNow())
      return false
    })
    yield* FiberHandle.run(
      residentQuietChecks,
      Effect.sleep(VIRTUAL_ROUND_QUIET_CHECK_MS).pipe(
        Effect.andThen(
          pass.pipe(
            Effect.repeat({ schedule: Schedule.spaced(VIRTUAL_ROUND_QUIET_CHECK_MS), until: (retiring) => retiring }),
            Effect.asVoid
          )
        )
      )
    )
  })

  const listen = Effect.fn("ResidentIpc.listen")(() => {
    const owner = runtime
    // Endpoint publication is a bounded acquisition. Signal interruption must
    // wait for binding to settle so its owning finalizer can remove the socket.
    return Effect.uninterruptible(
      Effect.gen(function* () {
        if (process.platform !== "linux" && process.platform !== "darwin") {
          return yield* Effect.fail(new ResidentAdapterError({ operation: "resident IPC requires Linux or macOS" }))
        }
        yield* prepareResidentDirectory(owner.paths).pipe(
          Effect.mapError(() => new ResidentAdapterError({ operation: "prepare resident directory" }))
        )
        // The launcher holds the live-owner directory. A socket pathname alone is
        // never treated as ownership evidence.
        yield* verifyRemovableSocket(owner.paths).pipe(
          Effect.mapError(() => new ResidentAdapterError({ operation: "verify removable socket" }))
        )
        yield* residentAdapter("remove stale socket", () => rm(owner.paths.socket, { force: true }))
        const runSocket = Effect.runForkWith(yield* Effect.context())
        const server = createServer((socket) => {
          if (!server.listening) {
            socket.destroy()
            return
          }
          // This native callback only starts a fiber in the socket owner scope.
          runSocket(Effect.forkIn(residentAccept(socket), residentIpcScope, { startImmediately: true }))
        })
        server.maxConnections = MAX_IPC_CONNECTIONS
        yield* Effect.callback<void, ResidentAdapterError>((resume) => {
          server.once("error", () =>
            resume(Effect.fail(new ResidentAdapterError({ operation: "bind resident socket" })))
          )
          server.listen(owner.paths.socket, () => resume(Effect.void))
        })
        residentServer = server
        yield* residentAdapter("secure resident socket", () => chmod(owner.paths.socket, 0o600))
        residentOwnsOwnerRecord = true
        yield* residentAdapter("publish resident endpoint", () =>
          writeFile(owner.paths.owner, `${JSON.stringify({ pid: process.pid, lifetime: owner.lifetime })}\n`, {
            encoding: "utf8",
            mode: 0o600
          })
        )
        yield* residentScheduleIdleCheck()
        yield* residentScheduleQuietCheck()
      })
    )
  })

  const residentDispose = Effect.fn("ResidentRuntime.close")(() => {
    const owner = runtime
    return Effect.uninterruptible(
      Effect.gen(function* () {
        yield* residentLedger.runtime.close()
        residentLifetimeController.abort()
        yield* FiberHandle.clear(residentIdleChecks)
        yield* FiberHandle.clear(residentQuietChecks)
        yield* Fiber.interruptAll(residentStopExpiries.values())
        residentStopExpiries.clear()
        for (const [, round] of yield* residentLedger.rounds.entries()) {
          round.controller.abort()
          ;(yield* residentRoundSnapshot(round)).work.controller.abort()
        }
        const closeDispatchedJobs = Effect.fn("ResidentRuntime.closeDispatchedJobs")(function* () {
          for (const job of yield* residentDispatcher.close()) {
            if (job.kind === "unit") {
              yield* residentReleaseReuseClaim(job.evaluationKey)
              yield* residentReleaseUnit(job)
            } else yield* residentLedger.release(job.reservation)
          }
        })
        yield* closeDispatchedJobs()
        for (const advice of yield* residentAdvice())
          yield* residentRemoveAdvice(advice.id, undefined, { fate: "discarded", reason: "resident-disposed" })
        for (const key of [...(yield* residentNotices.entries()).map(([key]) => key)])
          yield* residentReleaseNoticeCooldown(key)
        // Running work may be interrupted by process exit or finish later. Clear
        // its logical ownership after native effects settle. Issued Jev permits
        // remain reserved through an interruption attempt.
        yield* residentReuse.clear()
        yield* residentDispatcher.whenIdle()
        yield* Scope.close(residentDispatchScope, Exit.void)
        yield* Scope.close(residentControlScope, Exit.void)
        const server = residentServer
        const endpointClosed =
          server === undefined
            ? undefined
            : yield* Effect.forkChild(
                Effect.callback<void>((resume) => {
                  server.close(() => resume(Effect.void))
                }),
                { startImmediately: true }
              )
        yield* Scope.close(residentIpcScope, Exit.void)
        if (endpointClosed !== undefined) yield* Fiber.join(endpointClosed)
        yield* residentLedger.clear()
        if (server !== undefined) {
          residentServer = undefined
          yield* residentAdapter("remove owned socket", () => rm(owner.paths.socket, { force: true }))
        }
        if (residentOwnsOwnerRecord) {
          residentOwnsOwnerRecord = false
          yield* residentAdapter("remove owned endpoint record", () => rm(owner.paths.owner, { force: true }))
        }
      })
    )
  })
  const disposeOnce = yield* Effect.cached(Effect.suspend(() => residentDispose()))
  const close = disposeOnce.pipe(Effect.tap(() => Deferred.succeed(closed, undefined)))
  const residentDispatcher: Dispatcher<string, Job> = yield* makeDispatcher<string, Job>(
    residentLedger,
    (job) => ({
      operation: job.kind === "ingress" ? job.canonicalObservationId : job.canonicalOperationId,
      round: job.canonicalRound
    }),
    (entry) => residentRun(entry.value, entry.sequence)
  ).pipe(Effect.provideService(Scope.Scope, residentDispatchScope))
  const operations = Object.freeze(
    ResidentRuntimeService.of({
      lifetime,
      paths,
      listen,
      close,
      handle: residentHandle,
      stats,
      whenIdle,
      whenClosed: Deferred.await(closed)
    })
  )
  const runtime: ResidentRuntime = Object.freeze({
    inspectionSubmissionObservation: inspectionSubmissions.observation,
    operations,
    lifetime,
    paths,
    stats,
    cleanup,
    admit,
    collect,
    acknowledge,
    finalize,
    releaseDelivery,
    beginComposedSubmission,
    releaseComposedSubmission,
    whenIdle,
    pendingAdviceMetadata,
    accountingMetrics,
    sweepQuietRounds,
    handle: residentHandle,
    listen,
    close
  })
  yield* Effect.addFinalizer(() => close.pipe(Effect.orDie))
  return runtime
})

export const residentRuntimeLayer = (
  paths: ResidentPaths,
  now: () => number = monotonicNow,
  options: ResidentRuntimeOptions = {}
) =>
  Layer.effect(
    ResidentRuntimeService,
    makeResidentRuntime(paths, now, options).pipe(Effect.map((runtime) => runtime.operations))
  )
