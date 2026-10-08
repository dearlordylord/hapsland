import { NativeRunHost } from "./native-run-host.ts"
import { type StopCapture } from "./stop-codec.ts"
import type { WriterControl, WriterReport } from "./writer-controls.ts"
import type { SharedWriterPending, SharedWriterRelease, SharedCacheFact } from "./simulation-adapter.ts"
import { type ExpiryProfile } from "./expiry-controls.ts"
import {
  type CollectionResponseControl,
  type CollectionResponseIdentity,
  type CollectionResponseReport
} from "./collection-scenario.ts"
import { type OutputCapture, type OutputAttemptReport, type OutputAttemptObservation } from "./output-controls.ts"
import { type SharingIdentityFacts } from "./sharing-controls.ts"
import { type encodeNoticeScope, type OperationalNoticeKind } from "./notice-controls.ts"
import { type CallbackTarget, type CallbackReport } from "./callback-controls.ts"
import { type GraphLimits } from "@hapsland/canonical-policy/canonical/graph-adapter"
import { PREPARATION_SOURCE_IDENTITY } from "../../monkey-business-bend/engine.mjs"
import { SOURCE_IDENTITY } from "../../monkey-business-bend/run.mjs"
import { Nat, decoder } from "@hapsland/canonical-policy/canonical/boundary-schema"
import { type encodeDriverOutcome, type DriverAction } from "./driver-codec.ts"
import { type SharedCore, type WorkloadSource } from "./shared-core.ts"
import { type ResourceScenarioConfig } from "./resource-scenarios.ts"
import { freezeCanonicalData } from "@hapsland/canonical-policy/canonical/immutable"
import { Schema } from "effect"
import { type FileTreeProfile } from "./file-trees.ts"
import { type PreparationEvent, type PreparationFrame } from "./preparation.ts"
import { JEV_OUTCOME_ORDER, OUTCOME_RANDOM_ALGORITHM, OUTCOME_RANDOM_STREAM, type OutcomeWeights } from "./outcomes.ts"
import {
  validateLiveControl,
  type LiveControl,
  type EnvironmentProfile,
  type OutputProfile,
  type OutcomeChoice
} from "./controls.ts"
import type { AdviceeLifecycleEntry } from "./advicee-lifecycle.ts"
import { type encodePermitCapture, type PermitLimits, type PermitProfile } from "./permit-controls.ts"
import type { JevInterventionReport } from "./jev-interventions.ts"
import { type SessionConfig, type SessionInput } from "./session.ts"
import {
  type initialCanonical,
  type CanonicalEvent,
  type CanonicalOutput,
  type CanonicalProjection,
  type JevRequestOutcome
} from "@hapsland/canonical-policy/canonical/adapter"
import type { LifecycleProfile, CapacityMetadata } from "./lifecycle-profile.ts"
export * from "./writer-controls.ts"
export * from "./output-controls.ts"
export * from "./sharing-controls.ts"
export * from "./notice-controls.ts"
export * from "./callback-controls.ts"
export * from "./resource-scenarios.ts"
export { projectAgent } from "./agent-projection.ts"
export * from "./file-trees.ts"
export * from "./preparation.ts"
export * from "./outcomes.ts"
export * from "./controls.ts"
export * from "./advicee-lifecycle.ts"
export * from "./permit-controls.ts"
export * from "./jev-interventions.ts"
export { SessionGenerator } from "./session.ts"
export type { SessionConfig, SessionInput, SessionControl } from "./session.ts"
export * from "./sizes.ts"
export type { CanonicalEvent, CanonicalOutput, CanonicalProjection, JevRequestOutcome }
export type {
  CanonicalActionRequest,
  CanonicalDomainEvent,
  CanonicalPolicyDecision
} from "@hapsland/canonical-policy/canonical/adapter"
export const REPLAY_FORMAT = "monkey-business/1"
export const RANDOM_ALGORITHM = "xorshift32/1"
export const LOGIC_IDENTITY = SOURCE_IDENTITY
export const PREPARATION_IDENTITY = PREPARATION_SOURCE_IDENTITY
export * from "./lifecycle-profile.ts"
export type RunInput =
  | SessionInput
  | ({ readonly at: number; readonly generation?: number } & (
      | { readonly kind: "canonical"; readonly event: CanonicalEvent }
      | {
          readonly kind: "edit"
          readonly bytes: number
          readonly unitBytes: readonly number[]
          readonly outcome?: JevRequestOutcome
          readonly tool?: number
          readonly editDurationMs?: number
          /** Exact source-free prepared evaluation identities, one per review unit. */
          readonly evaluationInputs?: readonly string[]
          /** Original captured production namespace facts, one per prepared unit. */
          readonly evaluationIdentityFacts?: readonly SharingIdentityFacts[]
          readonly evaluationTreeIdentity?: number
          readonly evaluationTreeProfile?: FileTreeProfile
          readonly evaluationGraphLimits?: GraphLimits
          readonly revisionSubject?: string
          readonly revisionInput?: string
        }
      | { readonly kind: "finish" }
    ))
export type Control = LiveControl & { readonly agent?: string }
export type ReplayCheckpoint = {
  readonly boundary: number
  readonly queueTakes: number
  readonly time: number
  readonly checkpointSequence: number
}
export type ReplayBoundary = ReplayCheckpoint & { readonly sequence: number }
export type ControlRecord = ReplayBoundary & { readonly control: Control }
export type EffectObservation =
  | { readonly kind: "preparation"; readonly phase: "started"; readonly operation: number; readonly due: number }
  | { readonly kind: "preparation"; readonly phase: "supplied"; readonly operation: number }
  | {
      readonly kind: "jev"
      readonly phase: "started"
      readonly operation: number
      readonly request: number
      readonly due: number
    }
  | { readonly kind: "jev"; readonly phase: "supplied"; readonly operation: number; readonly request: number }
  | { readonly kind: "advice"; readonly phase: "supplied"; readonly advice: number }
  | { readonly kind: "output"; readonly phase: "started"; readonly advices: readonly number[] }
  | { readonly kind: "cancellation"; readonly phase: "supplied"; readonly operation: number }
export type CallbackReceipt = {
  readonly target: CallbackTarget
  readonly issuedAt: number
  readonly dueAt: number
  readonly outputCapture?: OutputCapture
}
export type Observation = {
  readonly callbackReceipt?: CallbackReceipt
  readonly noticeDiagnostic?: OperationalNoticeKind
  readonly partition?: number
  readonly agent?: string
  readonly sequence: number
  readonly time: number
  readonly event: CanonicalEvent | PreparationEvent
  readonly preparation?: PreparationFrame
  readonly outputs: readonly CanonicalOutput[]
  readonly outputScopes?: readonly (number | undefined)[]
  readonly before: CanonicalProjection
  readonly after: CanonicalProjection
  readonly rejection?: string
  readonly workload?: { readonly agent?: string; readonly revision?: number; readonly repair?: boolean }
  readonly effects: readonly EffectObservation[]
  readonly capacityMetadata: CapacityMetadata
}
/** One synchronous viewing boundary; presentation never owns simulator state. */
export type RunObservation = {
  readonly writerReports: readonly WriterReport[]
  readonly collectionResponseReports: readonly CollectionResponseReport[]
  readonly callbackTargets: readonly CallbackTarget[]
  readonly callbackReports: readonly CallbackReport[]
  readonly outputReports: readonly OutputAttemptReport[]
  readonly outputAttempts: readonly OutputAttemptObservation[]
  readonly adviceeLifecycles: readonly AdviceeLifecycleEntry[]
  readonly interventions: readonly JevInterventionReport[]
  readonly now: number
  readonly eventCount: number
  readonly projection: CanonicalProjection
  readonly observations: readonly Observation[]
  readonly capacityMetadata: CapacityMetadata
  readonly agentScopes: readonly { readonly agent: string; readonly partition: number; readonly seed: number }[]
}
export const AdvanceOptionsSchema = Schema.Struct({ untilTime: Schema.optional(Nat), maxEvents: Schema.optional(Nat) })
export type AdvanceOptions = typeof AdvanceOptionsSchema.Type
export type AdvanceResult = { reason: "timeLimit" | "eventLimit" | "idle"; events: number; now: number }
const decodeAdvanceOptions = decoder(AdvanceOptionsSchema)
export type RunConfig = {
  readonly expiryProfile?: ExpiryProfile
  readonly editPermitLimits?: Partial<PermitLimits>
  readonly permitProfile?: PermitProfile
  readonly graphLimits?: GraphLimits
  readonly seed?: number
  readonly lifecycles?: LifecycleProfile
  readonly resourceScenarios?: ResourceScenarioConfig
  /** Explicit demo provenance; never a native capacity policy. */
  readonly demoAgentCount?: number
  readonly limits?: Parameters<typeof initialCanonical>[0]
  readonly inputs?: readonly RunInput[]
  readonly preparationDelay?: number
  readonly fileTrees?: FileTreeProfile
  readonly finishDeadline?: number
  /** Synthetic retention clock; defaults to the resident’s ten-minute pending advice lifetime. */
  readonly adviceLifetime?: number
  readonly environment?: EnvironmentProfile
  readonly outputProfile?: OutputProfile
  readonly jevDelay?: number
  readonly retention?: number
  readonly session?: SessionConfig
  readonly sessions?: readonly SessionConfig[]
} & OutcomeChoice
export type Replay = {
  readonly endpoint: { readonly eventCount: number; readonly queueTakes: number; readonly now: number }
  readonly format: typeof REPLAY_FORMAT
  readonly randomAlgorithm: typeof RANDOM_ALGORITHM
  readonly logicIdentity: typeof LOGIC_IDENTITY
  readonly preparationIdentity: typeof PREPARATION_IDENTITY
  readonly outcomeSampling: {
    readonly algorithm: typeof OUTCOME_RANDOM_ALGORITHM
    readonly stream: typeof OUTCOME_RANDOM_STREAM
    readonly order: typeof JEV_OUTCOME_ORDER
  }
  readonly config: RunConfig
  readonly controls: readonly ControlRecord[]
  readonly scheduledInputs: readonly (ReplayBoundary & { readonly input: RunInput })[]
  /** Actual public advance normalization calls, ordered with inputs and controls. */
  readonly normalizations: readonly ReplayCheckpoint[]
}
type CandidateContext = {
  partition: number
  advice: number
  round: number
  token: number
  surface: "edit" | "background" | "stop"
  selection?: boolean
}
type Scheduled = {
  workloadSource?: WorkloadSource
  writerRelease?: SharedWriterRelease
  writerOrigin?: {
    readonly pending: SharedWriterPending
    readonly control: Extract<WriterControl, { action: "claim" }>
    readonly sequence: number
  }
  responseOrigin?: {
    readonly target: CollectionResponseIdentity
    readonly control: CollectionResponseControl | WriterControl
    readonly sequence: number
  }
  driverAction?: DriverAction
  driverContext?: unknown
  driverOutcomeReceipt?: unknown
  driverSourceJob?: {
    readonly partition: number
    readonly lifetime: number
    readonly bytes: number
    readonly units: readonly number[]
    readonly outcome: ReturnType<typeof encodeDriverOutcome>
  }
  stopFact?: { readonly at: number; readonly event: CanonicalEvent }
  stopCapture?: StopCapture
  noticeScope?: ReturnType<typeof encodeNoticeScope>
  noticeDiagnostic?: OperationalNoticeKind
  callbackReceipt?: CallbackReceipt
  activityScope?: number
  permitCapture?: { readonly capture: ReturnType<typeof encodePermitCapture>; readonly started: number }
  partition?: number
  at: number
  order: number
  finishAttempt?: number
  fitFinish?: number
  expiryAdvice?: number
  generated?: boolean
  cacheFact?: SharedCacheFact
  job?: Extract<RunInput, { kind: "edit" }>
} & (
  | { input: RunInput; candidate?: never }
  | {
      input: {
        kind: "canonical"
        at: number
        event: Extract<
          CanonicalEvent,
          { kind: "finalCandidateCheck" | "submissionSuppressCheck" | "collectionFitCheck" }
        >
        generation?: number
      }
      candidate: CandidateContext
    }
  | { input: { kind: "preparationGraph"; at: number; event: PreparationEvent }; candidate?: never }
)
/** Full factual viewing boundary. Snapshots are detached from the live owner. */
export type RunRuntimeSnapshot = {
  readonly engine: ReturnType<SharedCore["snapshotState"]>
  readonly queue: readonly Readonly<Scheduled>[]
  readonly jobs: readonly (readonly [
    number,
    Extract<RunInput, { kind: "edit" }> & { readonly driverSourceJob?: Scheduled["driverSourceJob"] }
  ])[]
  readonly issuedRequests: readonly (readonly [number, Extract<CanonicalOutput, { kind: "jevRequestIssued" }>])[]
  readonly retainedCallbacks: readonly {
    readonly order: number
    readonly receipt: CallbackReceipt
    readonly payload: Readonly<Scheduled>
    readonly fact: unknown
  }[]
  readonly order: number
  readonly eventCount: number
  readonly jevDelay: number
  readonly outcome: JevRequestOutcome | undefined
  readonly outcomeWeights: OutcomeWeights
  readonly environment: EnvironmentProfile
  readonly outputProfile: OutputProfile
  readonly generatorPartitions: readonly number[]
}
type RunStructuralDetails =
  | {
      readonly kind: "canonical" | "preparation" | "sharing"
      readonly scheduled: Readonly<Scheduled>
      readonly observation: Observation
      readonly transition: unknown
      readonly source?: unknown
    }
  | {
      readonly kind: "finishRegistration"
      readonly scheduled: Readonly<Scheduled>
      readonly registration: ReturnType<SharedCore["stopRegister"]>
    }
  | {
      readonly kind: "callbackDelivery"
      readonly scheduled: Readonly<Scheduled>
      readonly receipt: CallbackReceipt
      readonly fact: unknown
      readonly delivery: unknown
    }
export type RunStructuralFrame = RunStructuralDetails & {
  readonly time: number
  readonly before: RunRuntimeSnapshot
  readonly after: RunRuntimeSnapshot
}
const integer = (n: number, name: string) => {
  if (!Number.isSafeInteger(n) || n < 0 || n > 2 ** 48 - 1) throw new RangeError(`invalid ${name}`)
  return n
}
const copy = <T>(x: T): T => structuredClone(x)
const restoreEndpoint = Symbol("restore replay endpoint")
const replayProgress = Symbol("replay progress driver")
const replayNormalize = Symbol("recorded normalization")
type ReplayCoordinate = { eventCount: number; queueTakes: number; now: number }
type ReplayProgressDriver = { target: () => ReplayCoordinate | undefined; flush: () => void }
const ReplayCoordinateSchema = Schema.Struct({ eventCount: Nat, queueTakes: Nat, now: Nat })
const readReplayCoordinate = decoder(ReplayCoordinateSchema)
const ReplayCheckpointFields = { boundary: Nat, queueTakes: Nat, time: Nat, checkpointSequence: Nat }
const ReplayBoundaryFields = { ...ReplayCheckpointFields, sequence: Nat }
const readNormalization = decoder(Schema.Struct(ReplayCheckpointFields))
const readControlRecord = decoder(Schema.Struct({ ...ReplayBoundaryFields, control: Schema.Unknown }))
const readInputRecord = decoder(Schema.Struct({ ...ReplayBoundaryFields, input: Schema.Unknown }))
/** Equal-time items follow insertion order; effects appended by a transition follow already queued items. */
export class Run {
  private readonly host: NativeRunHost
  private readonly config: RunConfig
  private controls: ControlRecord[] = []
  private externalInputs: (ReplayBoundary & { input: RunInput })[] = []
  private normalizations: ReplayCheckpoint[] = []
  private timelineOrder = 0
  private checkpointOrder = 0
  private progressDriver: ReplayProgressDriver | undefined
  private canonicalAllowed = true
  private readonly structuralListeners = new Set<(frame: RunStructuralFrame) => void>()
  private stopStructural: (() => void) | undefined
  private settingsSnapshot: Pick<Replay, "config" | "controls"> | undefined
  constructor(config: RunConfig = {}) {
    this.host = new NativeRunHost(config)
    this.config = this.host.config
  }
  private get count() {
    return this.host.eventCount
  }
  private get takes() {
    return this.host.queueTakeCount
  }
  private get clock() {
    return this.host.now
  }
  private get queue() {
    return this.host.queue
  }
  get now() {
    return this.clock
  }
  get eventCount() {
    return this.count
  }
  get queueTakeCount() {
    return this.takes
  }
  get projection() {
    return this.host.projection
  }
  get observations(): readonly Observation[] {
    return this.host.observations
  }
  get agentScopes() {
    return this.host.agentScopes
  }
  get capacityMetadata() {
    return this.host.capacityMetadata
  }
  get editPermitLimits(): PermitLimits {
    return this.host.editPermitLimits
  }
  get futurePermitProfile(): PermitProfile {
    return this.host.futurePermitProfile
  }
  get interventions(): readonly JevInterventionReport[] {
    return this.host.interventions
  }
  observe(): RunObservation {
    return freezeCanonicalData({
      writerReports: this.host.writerReports,
      collectionResponseReports: this.host.collectionResponseReports,
      adviceeLifecycles: this.host.adviceeLifecycles,
      now: this.clock,
      eventCount: this.count,
      projection: this.projection,
      observations: this.observations,
      capacityMetadata: this.capacityMetadata,
      agentScopes: this.agentScopes,
      interventions: this.interventions,
      callbackTargets: this.host.callbackTargets,
      callbackReports: this.host.callbackReports,
      outputReports: this.host.outputReports,
      outputAttempts: this.host.outputAttempts
    })
  }
  subscribe(listener: (observation: Observation) => void) {
    return this.host.subscribe(listener)
  }
  subscribeStructural(listener: (frame: RunStructuralFrame) => void) {
    this.structuralListeners.add(listener)
    this.stopStructural ??= this.host.subscribeStructural((value) => {
      const frame = this.host.projectStructural(value)
      for (const subscriber of this.structuralListeners) subscriber(frame)
    })
    return () => {
      this.structuralListeners.delete(listener)
      if (this.structuralListeners.size === 0) {
        this.stopStructural?.()
        this.stopStructural = undefined
      }
    }
  }
  runtimeSnapshot(): RunRuntimeSnapshot {
    return this.host.runtimeSnapshot()
  }
  schedule(input: RunInput) {
    integer(this.checkpointOrder + 1, "replay checkpoint sequence")
    integer(this.timelineOrder + 1, "replay action sequence")
    const copied = copy(input)
    this.host.schedule(copied)
    this.externalInputs.push({
      boundary: this.count,
      queueTakes: this.takes,
      time: this.clock,
      sequence: this.timelineOrder++,
      checkpointSequence: this.checkpointOrder++,
      input: copied
    })
  }
  applyControl(control: Control): ControlRecord {
    integer(this.checkpointOrder + 1, "replay checkpoint sequence")
    integer(this.timelineOrder + 1, "replay action sequence")
    const value: Control = validateLiveControl(control)
    if (value.agent !== undefined && !this.agentScopes.some((scope) => scope.agent === value.agent))
      throw new RangeError("unknown agent control target")
    if (
      value.agent !== undefined &&
      ["environment", "jevProfile", "outputProfile", "fileTrees", "credentials", "jevRequest", "graphLimits"].includes(
        value.kind
      )
    )
      throw new TypeError("resident controls cannot target one agent")
    this.host.control(value, this.timelineOrder)
    const record = {
      control: copy(value),
      time: this.clock,
      boundary: this.count,
      queueTakes: this.takes,
      sequence: this.timelineOrder++,
      checkpointSequence: this.checkpointOrder++
    }
    this.controls.push(record)
    return copy(record)
  }
  step(untilTime?: number): Observation | undefined {
    if (untilTime !== undefined) {
      integer(untilTime, "time limit")
      if (untilTime < this.clock) throw new RangeError("time limit precedes current time")
    }
    this.progressDriver?.flush()
    const target = this.progressDriver?.target()
    return this.host.step(
      Math.min(untilTime ?? 2 ** 48 - 1, target?.now ?? 2 ** 48 - 1),
      target?.queueTakes ?? 2 ** 48 - 1,
      this.canonicalAllowed && (target === undefined || this.count < target.eventCount)
    )
  }
  get queuedFacts() {
    return freezeCanonicalData(
      this.queue.map((item) => ({
        at: item.at,
        order: item.order,
        input: item.input,
        ...(item.responseOrigin ? { response: item.responseOrigin.target } : {}),
        ...(item.writerOrigin ? { writerTrigger: item.writerOrigin.control.capture } : {}),
        ...(item.callbackReceipt ? { callback: item.callbackReceipt.target } : {})
      }))
    )
  }
  private normalizeQuietWriterBoundary() {
    if (this.progressDriver?.target()) {
      this.progressDriver.flush()
      return
    }
    this[replayNormalize]()
  }
  [replayNormalize]() {
    integer(this.checkpointOrder + 1, "replay checkpoint sequence")
    this.normalizations.push({
      boundary: this.count,
      queueTakes: this.takes,
      time: this.clock,
      checkpointSequence: this.checkpointOrder++
    })
    this.host.normalize()
  }
  beginAdvance(options: AdvanceOptions = {}): Generator<void, AdvanceResult> {
    const { untilTime, maxEvents = 1000 } = decodeAdvanceOptions(options)
    integer(maxEvents, "event limit")
    if (untilTime !== undefined) {
      integer(untilTime, "time limit")
      if (untilTime < this.clock) throw new RangeError("time limit precedes current time")
    }
    return this.advanceSteps(untilTime, maxEvents)
  }
  private *advanceSteps(untilTime: number | undefined, maxEvents: number): Generator<void, AdvanceResult> {
    let events = 0
    let yielded = false
    let normalizationAttempted = false
    const endpoint = untilTime ?? 2 ** 48 - 1
    const finish = (reason: Exclude<ReturnType<NativeRunHost["advanceStatus"]>, "continue">): AdvanceResult => {
      normalizationAttempted = true
      this.normalizeQuietWriterBoundary()
      const terminal = reason === "timeLimit" ? reason : this.host.advanceStatus(0, endpoint)
      if (terminal === "continue") throw new Error("native advance did not finish")
      return { reason: terminal, events, now: this.clock }
    }
    try {
      let status = this.host.advanceStatus(maxEvents, endpoint)
      for (;;) {
        if (status !== "continue") return finish(status)
        const observation = this.step(untilTime)
        if (observation !== undefined) events++
        status = this.host.stepAdvanceStatus(observation, maxEvents - events, endpoint)
        yielded = true
        yield
        yielded = false
      }
    } finally {
      if (yielded && !normalizationAttempted) this.normalizeQuietWriterBoundary()
    }
  }
  advance(options: AdvanceOptions = {}): AdvanceResult {
    const iterator = this.beginAdvance(options)
    let next = iterator.next()
    while (!next.done) next = iterator.next()
    return next.value
  }
  [replayProgress](driver?: ReplayProgressDriver) {
    this.progressDriver = driver
  }
  [restoreEndpoint](endpoint: Replay["endpoint"]) {
    const target = readReplayCoordinate(endpoint)
    for (;;) {
      this.progressDriver?.flush()
      if (this.count === target.eventCount && this.takes === target.queueTakes && this.clock === target.now) return
      if (this.count > target.eventCount || this.takes > target.queueTakes || this.clock > target.now)
        throw new Error("incompatible replay endpoint")
      const before = [this.count, this.takes, this.clock]
      this.canonicalAllowed = this.count < target.eventCount
      try {
        this.step(target.now)
      } finally {
        this.canonicalAllowed = true
      }
      if (before[0] === this.count && before[1] === this.takes && before[2] === this.clock)
        throw new Error("unreconstructable replay endpoint")
    }
  }
  /** Immutable applied inputs for inspection, without copying the execution timeline. */
  get appliedSettings(): Pick<Replay, "config" | "controls"> {
    if (this.settingsSnapshot?.controls.length !== this.controls.length)
      this.settingsSnapshot = freezeCanonicalData(copy({ config: this.config, controls: this.controls }))
    return this.settingsSnapshot
  }
  exportReplay(): Replay {
    return copy({
      endpoint: { eventCount: this.count, queueTakes: this.takes, now: this.clock },
      format: REPLAY_FORMAT,
      randomAlgorithm: RANDOM_ALGORITHM,
      logicIdentity: LOGIC_IDENTITY,
      preparationIdentity: PREPARATION_IDENTITY,
      outcomeSampling: { algorithm: OUTCOME_RANDOM_ALGORITHM, stream: OUTCOME_RANDOM_STREAM, order: JEV_OUTCOME_ORDER },
      config: this.config,
      controls: this.controls,
      scheduledInputs: this.externalInputs,
      normalizations: this.normalizations
    })
  }
}
export const createRun = (config: RunConfig = {}) => new Run(config)
const reconstructReplay = (replay: Replay, restore: boolean) => {
  if (
    replay.format !== REPLAY_FORMAT ||
    replay.randomAlgorithm !== RANDOM_ALGORITHM ||
    replay.logicIdentity !== LOGIC_IDENTITY ||
    replay.preparationIdentity !== PREPARATION_IDENTITY ||
    replay.outcomeSampling?.algorithm !== OUTCOME_RANDOM_ALGORITHM ||
    replay.outcomeSampling?.stream !== OUTCOME_RANDOM_STREAM ||
    JSON.stringify(replay.outcomeSampling?.order) !== JSON.stringify(JEV_OUTCOME_ORDER)
  )
    throw new Error("incompatible replay identity")
  const endpoint = readReplayCoordinate(replay.endpoint)
  const run = createRun(replay.config)
  const timeline = [
    ...replay.controls.map((record) => ({ kind: "control" as const, record: readControlRecord(record) })),
    ...replay.scheduledInputs.map((record) => ({ kind: "input" as const, record: readInputRecord(record) })),
    ...replay.normalizations.map((record) => ({ kind: "normalize" as const, record: readNormalization(record) }))
  ].sort((a, b) => a.record.checkpointSequence - b.record.checkpointSequence)
  let actionSequence = 0
  for (const [sequence, item] of timeline.entries()) {
    if (item.kind !== "normalize" && item.record.sequence !== actionSequence++)
      throw new Error("incompatible replay action sequence")
    if (
      item.record.checkpointSequence !== sequence ||
      item.record.boundary > endpoint.eventCount ||
      item.record.queueTakes > endpoint.queueTakes ||
      item.record.time > endpoint.now
    )
      throw new Error("incompatible replay timeline")
  }
  const step = run.step.bind(run)
  let cursor = 0
  const flush = () => {
    while (cursor < timeline.length) {
      const item = timeline[cursor]!
      if (
        item.record.boundary < run.eventCount ||
        item.record.queueTakes < run.queueTakeCount ||
        item.record.time < run.now
      )
        throw new Error("overshot replay timeline")
      if (
        item.record.boundary !== run.eventCount ||
        item.record.queueTakes !== run.queueTakeCount ||
        item.record.time !== run.now
      )
        return
      cursor++
      if (item.kind === "control") run.applyControl(item.record.control as Control)
      else if (item.kind === "input") run.schedule(item.record.input as RunInput)
      else run[replayNormalize]()
    }
  }
  run[replayProgress]({
    flush,
    target: () => {
      const record = timeline[cursor]?.record
      return record
        ? { eventCount: record.boundary, queueTakes: record.queueTakes, now: record.time }
        : restore
          ? endpoint
          : undefined
    }
  })
  run.step = (untilTime?: number) => {
    for (;;) {
      flush()
      const before = cursor
      const observation = step(untilTime)
      flush()
      if (observation || cursor === before) return observation
      // A finite recorded checkpoint may unblock the next metadata item without
      // emitting a product observation. Continue through the same step owner.
    }
  }
  flush()
  return run
}
export const replayRun = (replay: Replay) => reconstructReplay(replay, false)

/** Reconstruct the recorded viewing boundary, including metadata and boundary controls, without another canonical transition. */
export const restoreReplay = (replay: Replay, listener?: (frame: Observation) => void): Run => {
  const run = reconstructReplay(replay, true)
  if (listener) run.subscribe(listener)
  run[restoreEndpoint](replay.endpoint)
  run[replayProgress]()
  return run
}
