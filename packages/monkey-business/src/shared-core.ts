import { type JevRequestOutcome, type CanonicalEvent, type initialCanonical } from "../../../src/canonical/adapter.ts"
import { encodeDriverOutcome } from "./driver-codec.ts"
import {
  prepareSharedCommandContext,
  commandSharedQuiet,
  afterSharedQuiet,
  generatedSharedQuiet,
  peekSharedWriterRelease,
  deliverSharedWriterRelease,
  type SharedWriterRelease,
  attemptSharedWriter,
  prepareSharedWriter,
  claimSharedWriter,
  afterSharedWriter,
  releaseSharedWriter,
  type SharedWriterPending,
  driveSharedStop,
  sharedStopFinish,
  sharedStopFinishes,
  registerSharedStop,
  progressSharedStop,
  closeSharedStop,
  configureSharedCollector,
  driveSharedCollector,
  afterSharedCollector,
  controlSharedResponse,
  afterSharedResponse,
  expireSharedResponses,
  driveSharedResponse,
  deliverySharedResponse,
  beginSharedCache,
  stepSharedCache,
  configureSharedCache,
  type SharedCacheFact,
  prepareSharedSharing,
  routeSharedSharing,
  routedSharedSharing,
  leaveSharedSharing,
  leaveAllSharedSharing,
  completeSharedSharing,
  preprocessSharedSharing,
  admitSharedFreshness,
  sharedFreshnessChecks,
  replaceSharedCallbacks,
  sharedNoticeExercise,
  afterSharedNotice,
  pruneSharedNotices,
  suppliedSharedNotice,
  ownedSharedNotice,
  interveneSharedOutput,
  deliverSharedOutput,
  issueSharedCallback,
  sharedCallbackOriginals,
  deliverSharedCallback,
  actSharedCallback,
  initialSharedCanonical,
  projectSharedCanonical,
  stepSharedCanonical,
  stepSharedGraph,
  sharedPreparationActive,
  driveSharedCommand,
  editSharedCanonical,
  enqueueShared,
  takeShared,
  queuedShared,
  cancelShared,
  fenceSharedCanonical,
  preparationFactTime,
  preparationCompletedAction,
  revalidateSharedCanonical,
  configureSharedSeed,
  sharedClock,
  configureSharedWorkload,
  actSharedWorkload,
  validSharedWorkload,
  preSharedTiming,
  sharedCapturedCredential,
  sharedCredentialMatches,
  sharedCallbackMatches,
  issueSharedActions,
  declareSharedAdvicee,
  sharedEventScope,
  sharedCommandScope,
  configureSharedCredentials,
  actSharedCredentials,
  sharedCredentialFacts,
  interveneSharedRequest,
  sharedActivityEventValid,
  actSharedLifecycle,
  sharedLifecycleEntries,
  sharedActivityScope,
  sharedActivityValid,
  sharedActivityLifetime,
  editSharedActivity,
  issueSharedPermit,
  issuedSharedPermit,
  consumedSharedPermit
} from "../../../src/canonical/simulation-adapter.ts"
import { type WriterCapture, type WriterTarget } from "./writer-controls.ts"
import { freezeCanonicalData } from "../../../src/canonical/immutable.ts"
import { type StopProgress, type StopInputSchema } from "./stop-codec.ts"
import { type encodeCollectorProfile } from "./collector-codec.ts"
import { type CollectionResponseControl, type CollectionResponseIdentity } from "./collection-scenario.ts"
import {
  encodeFreshnessScope,
  encodeFreshnessSource,
  type FreshnessScope,
  type FreshnessSource
} from "./freshness-codec.ts"
import { encodePreparationGraphLimits } from "./file-trees.ts"
import {
  GRAPH_LIMIT_CEILINGS,
  decodeImportGraphStep,
  encodeImportGraphEvent,
  projectImportGraph
} from "../../../src/canonical/graph-adapter.ts"
import { type EngineState } from "../../monkey-business-bend/engine.mjs"
import { sessionProfile, type SessionConfig, type SessionControl, type SessionInput } from "./session.ts"
import { doubleWords } from "./numeric-codec.ts"
import { JEV_OUTCOME_ORDER, validateOutcomeWeights, type OutcomeWeights } from "./outcomes.ts"
import { readRecord } from "../../../src/canonical/boundary-schema.ts"
import { type PreparationEvent, type PreparationFrame } from "./preparation.ts"
import { decodeAdviceeLifecycles, encodeAdviceeLifecycle, type AdviceeLifecycleAction } from "./advicee-lifecycle.ts"

/** The shared Bend owner holds both production reducers; this boundary validates and projects. */
export type WorkloadSource = ReturnType<typeof actSharedWorkload>["events"][number]
type WorkloadInput = SessionInput & { readonly workloadSource: WorkloadSource }
function workloadInput(event: WorkloadSource, agent: string): WorkloadInput {
  const common = {
    at: event.at,
    generation: event.generation,
    agent,
    recurring: event.recurring,
    workloadSource: freezeCanonicalData({ ...event, units: [...event.units] })
  }
  if (event.kind === 0) return { ...common, kind: "task", task: event.task }
  if (event.kind === 2) return { ...common, kind: "finish" }
  return {
    ...common,
    kind: "edit",
    bytes: event.bytes,
    unitBytes: event.units,
    revision: event.revision,
    ...(event.repair ? { repair: true } : {})
  }
}

export class SharedCore {
  private state: EngineState
  private structuralTransition: unknown
  private structuralSource: unknown
  private queuedProjection: ReturnType<typeof queuedShared> | undefined
  constructor(limits: Parameters<typeof initialCanonical>[0], seed = 1) {
    this.state = configureSharedSeed(initialSharedCanonical(limits), seed)
  }
  /** Detached immutable evidence; never accepted as an Engine mutation input. */
  snapshotState(): EngineState {
    return freezeCanonicalData(structuredClone(this.state))
  }
  transitionSnapshot(): unknown {
    return freezeCanonicalData(structuredClone(this.structuralTransition))
  }
  transitionSourceSnapshot(): unknown {
    return freezeCanonicalData(structuredClone(this.structuralSource))
  }
  configureCollector(profile: Parameters<typeof encodeCollectorProfile>[0]) {
    this.state = configureSharedCollector(this.state, profile)
  }
  collectorHandle(index: number, context: unknown) {
    const changed = driveSharedCollector(this.state, index, context)
    this.state = changed.state
    return changed.handled
  }
  collectorAfter() {
    const changed = afterSharedCollector(this.state)
    this.state = changed.state
    return changed.handled.actions
  }
  stopHandle(index: number, context: unknown, facts: import("./stop-codec.ts").StopCommandFacts) {
    const changed = driveSharedStop(this.state, index, context, facts)
    this.state = changed.state
    return changed.report
  }
  stopFind(partition: number) {
    return sharedStopFinish(this.state, partition)
  }
  stopEntries() {
    return sharedStopFinishes(this.state)
  }
  stopRegister(input: typeof StopInputSchema.Type) {
    const registered = registerSharedStop(this.state, input)
    this.state = registered.state
    return registered
  }
  stopProgress(partition: number, attempt: number, progress: StopProgress) {
    this.state = progressSharedStop(this.state, partition, attempt, progress)
    return this.stopFind(partition)
  }
  stopClose(partition: number) {
    this.state = closeSharedStop(this.state, partition)
  }
  declareAdvicee(identity: number, seed: number) {
    const declared = declareSharedAdvicee(this.state, identity, seed)
    this.state = declared.state
    return declared.scope
  }
  noticeExercise(scope: unknown) {
    return sharedNoticeExercise(scope)
  }
  noticeAfter(scope: unknown, event: CanonicalEvent, now: number, profile: unknown) {
    const result = afterSharedNotice(this.state, scope, event, now, profile)
    this.state = result.state
    return result.events
  }
  noticePrune(partition: number, group: number, now: number) {
    return pruneSharedNotices(this.state, partition, group, now)
  }
  noticeFailure(scope: unknown, now: number, key: number, sequence: number) {
    return suppliedSharedNotice(this.state, scope, now, key, sequence)
  }
  noticeOwned(partition: number, group: number, key: number, action: "lease" | "acknowledge") {
    return ownedSharedNotice(this.state, partition, group, key, action)
  }
  issueCallback(
    event: CanonicalEvent,
    order: number,
    at: number,
    action: import("./driver-codec.ts").DriverAction,
    capture?: unknown
  ) {
    const issued = issueSharedCallback(this.state, event, order, at, action, capture)
    this.state = issued.state
    return issued.receipt
  }
  outputIntervene(target: unknown, outcome: unknown, receipt?: object) {
    const result = interveneSharedOutput(this.state, target, outcome, receipt)
    this.state = result.state
    return result
  }
  outputDeliver(receipt: object, now: number) {
    return deliverSharedOutput(receipt, now)
  }
  get callbackOriginals() {
    return sharedCallbackOriginals(this.state)
  }
  replaceCallbacks(orders: readonly number[]) {
    this.state = replaceSharedCallbacks(this.state, orders)
  }
  deliverCallback(order: number) {
    this.state = deliverSharedCallback(this.state, order)
  }
  callback(target: unknown, action: unknown, receipt: object | undefined, at: number, order: number) {
    const result = actSharedCallback(this.state, target, action, receipt, at, order)
    this.state = result.state
    return result
  }
  quietCommand(event: CanonicalEvent, index: number, partition: number, now: number) {
    return commandSharedQuiet(this.state, event, index, partition, now)
  }
  quietEvent(event: CanonicalEvent, nativeIdle: boolean, stopAbsent: boolean) {
    return generatedSharedQuiet(this.state, event, nativeIdle, stopAbsent)
  }
  quietAfter(
    event: CanonicalEvent,
    partition: number,
    now: number,
    window: number,
    nativeIdle: boolean,
    stopAbsent: boolean
  ) {
    return afterSharedQuiet(this.state, event, partition, now, window, nativeIdle, stopAbsent)
  }
  commandScope(index: number, provided?: number) {
    return sharedCommandScope(this.state, index, provided)
  }
  get adviceeLifecycles() {
    return decodeAdviceeLifecycles(sharedLifecycleEntries(this.state))
  }
  activityScope(partition: number) {
    return sharedActivityScope(this.state, partition)
  }
  activityEventValid(event: CanonicalEvent, partition: number, incarnation: number) {
    return sharedActivityEventValid(this.state, event, partition, incarnation)
  }
  activityValid(partition: number, incarnation: number) {
    return sharedActivityValid(this.state, partition, incarnation)
  }
  activityLifetime(partition: number) {
    return sharedActivityLifetime(this.state, partition)
  }
  activityEdit(partition: number, incarnation: number) {
    const transition = editSharedActivity(this.state, partition, incarnation)
    this.state = transition.state
    return transition.plan
  }
  lifecycle(partition: number, agent: string, action: AdviceeLifecycleAction) {
    const transition = actSharedLifecycle(this.state, partition, encodeAdviceeLifecycle(action))
    this.state = transition.state
    const changed = readRecord(transition.changed)
    const cleanup = readRecord(transition.cleanup)
    const events = transition.events.map((event) => workloadInput(event, agent))
    return { changed, cleanup, events }
  }
  admitFreshness(scope: FreshnessScope, source: FreshnessSource, index: number, sharing = false) {
    const transition = admitSharedFreshness(
      this.state,
      encodeFreshnessScope(scope),
      encodeFreshnessSource(source),
      index,
      sharing
    )
    this.state = transition.state
    return transition.actions
  }
  prepareSharing(scope: unknown, keys: readonly unknown[], sizes: readonly number[]) {
    const result = prepareSharedSharing(this.state, scope, keys, sizes)
    this.state = result.state
    return { routes: result.routes, valid: result.valid }
  }
  leaveSharing(scope: unknown) {
    const result = leaveSharedSharing(this.state, scope)
    this.state = result.state
    return { events: result.events, valid: result.valid }
  }
  preprocessSharing(event: CanonicalEvent, partition: number, order: number, horizon?: number) {
    const prepared = preprocessSharedSharing(this.state, event, partition, order, horizon)
    this.state = prepared.state
    this.structuralTransition = prepared.structural
    return prepared
  }
  leaveAllSharing(partition: number, lifetime: number) {
    const result = leaveAllSharedSharing(this.state, partition, lifetime)
    this.state = result.state
    return { events: result.events, valid: result.valid }
  }
  completeSharing(event: CanonicalEvent) {
    return completeSharedSharing(this.state, event)
  }
  routeSharing(route: unknown) {
    return routeSharedSharing(this.state, route)
  }
  routedSharing(route: unknown) {
    const result = routedSharedSharing(this.state, route)
    this.state = result.state
    return result.events
  }
  freshnessChecks(scope: FreshnessScope) {
    return sharedFreshnessChecks(
      this.state,
      encodeFreshnessScope({
        partition: scope.partition,
        lifetime: scope.lifetime,
        round: scope.round,
        operation: scope.operation
      })
    )
  }
  issuePermit(capture: unknown, started: number, now: number) {
    return issueSharedPermit(this.state, capture, started, now)
  }
  issuedPermit(capture: unknown, token: number) {
    return issuedSharedPermit(this.state, capture, token)
  }
  consumedPermit(index: number, partition: number, lifetime: number) {
    return consumedSharedPermit(this.state, index, partition, lifetime)
  }
  eventScope(event: CanonicalEvent, provided?: number) {
    return sharedEventScope(this.state, event, provided)
  }
  configureCredentials(available: boolean, generation: number) {
    this.state = configureSharedCredentials(this.state, available, generation)
  }
  capturedCredential(operation: number) {
    return sharedCapturedCredential(this.state, operation)
  }
  credentialMatches(operation: number) {
    return sharedCredentialMatches(this.state, operation)
  }
  callbackMatches(
    event: CanonicalEvent,
    target: {
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly request: number
    }
  ) {
    return sharedCallbackMatches(event, target)
  }
  credentials(action: "unavailable" | "restore" | "rotate") {
    this.state = actSharedCredentials(this.state, action)
    return sharedCredentialFacts(this.state)
  }
  interveneRequest(
    target: {
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly request: number
    },
    outcome: unknown,
    delay: number
  ) {
    return interveneSharedRequest(this.state, target, outcome, delay)
  }
  get now() {
    return sharedClock(this.state)
  }
  preTiming(partition: number, duration: number | undefined, fallback: number, lifetime: number) {
    return preSharedTiming(this.state, partition, duration, fallback, lifetime)
  }
  prepareCommandContext(
    index: number,
    sourceJob: unknown,
    configured: JevRequestOutcome | undefined,
    weights: OutcomeWeights,
    context: unknown
  ) {
    const values = validateOutcomeWeights(weights)
    const encoded = JEV_OUTCOME_ORDER.map((kind) => doubleWords(values[kind])).reduceRight<unknown>(
      (tail, head) => ({ $: "Con", head, tail }),
      { $: "Nil" }
    )
    const prepared = prepareSharedCommandContext(
      this.state,
      index,
      sourceJob,
      {
        $: "Driver.OutcomeEnvironment",
        outcome: configured === undefined ? { $: "None" } : { $: "Some", value: encodeDriverOutcome(configured) },
        weights: encoded
      },
      context
    )
    this.state = prepared.state
    return { context: prepared.context, receipt: prepared.receipt }
  }
  workloadAction(partition: number, agent: string, action: unknown): WorkloadInput[] {
    const changed = actSharedWorkload(this.state, partition, action)
    this.state = changed.state
    return changed.events.map((event) => workloadInput(event, agent))
  }
  workloadControl(
    partition: number,
    agent: string,
    control: SessionControl | { readonly kind: "editDuration"; readonly durationMs: number }
  ) {
    const native =
      control.kind === "editPace"
        ? { $: "Workload.Pace", interval: control.intervalMs }
        : control.kind === "burst"
          ? { $: "Workload.Burst", count: control.count }
          : control.kind === "suspendArrivals"
            ? { $: "Workload.Suspend", suspended: control.suspended }
            : control.kind === "editDuration"
              ? { $: "Workload.Duration", duration: control.durationMs }
              : {
                  $: "Workload.Sizes",
                  bytes: control.reservationBytes,
                  units: control.reviewUnitBytes.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), {
                    $: "Nil"
                  })
                }
    return this.workloadAction(partition, agent, { $: "Workload.Controlled", control: native })
  }
  session(partition: number, config: SessionConfig) {
    const agent = config.agent ?? "agent-1"
    this.state = configureSharedWorkload(this.state, partition, sessionProfile(config))
    return {
      next: (_now: number) => this.workloadAction(partition, agent, { $: "Workload.Next" }),
      apply: (control: SessionControl, _now: number) => this.workloadControl(partition, agent, control),
      valid: (input: { readonly generation?: number; readonly recurring?: boolean }) =>
        validSharedWorkload(this.state, partition, input.generation ?? 0, input.recurring === true),
      onFinish: (_now: number, continuation: boolean) =>
        this.workloadAction(partition, agent, { $: "Workload.Finished", continuation }),
      onAdvice: (_now: number) => this.workloadAction(partition, agent, { $: "Workload.Advice" })
    }
  }
  get projection() {
    return projectSharedCanonical(this.state)
  }
  configureCache(entries: number, bytes: number) {
    this.state = configureSharedCache(this.state, entries, bytes)
  }
  beginCache(event: CanonicalEvent) {
    const result = beginSharedCache(this.state, event)
    this.state = result.state
    return result
  }
  step(event: CanonicalEvent, cacheFact?: SharedCacheFact) {
    const transition = cacheFact
      ? { ...stepSharedCache(this.state, cacheFact), writerReleases: [] }
      : stepSharedCanonical(this.state, event)
    const result = transition.result
    this.state = transition.state
    this.structuralTransition = transition.structural
    this.structuralSource = transition.structuralSource
    return {
      ...result,
      afterActions: transition.afterActions,
      cacheReleases: transition.cacheReleases,
      cacheFacts: transition.cacheFacts,
      writerReleases: transition.writerReleases
    }
  }
  graphStep(event: PreparationEvent): PreparationFrame {
    const limits = encodePreparationGraphLimits(event.graphLimits ?? GRAPH_LIMIT_CEILINGS)
    const key = {
      $: "Types.GraphKey",
      partition: BigInt(event.partition),
      lifetime: BigInt(event.lifetime),
      round: BigInt(event.round),
      operation: BigInt(event.operation),
      unit: BigInt(event.unit)
    }
    const transition = stepSharedGraph(this.state, key, BigInt(event.step), limits, encodeImportGraphEvent(event.fact))
    const result = decodeImportGraphStep(transition.result)
    const before = projectImportGraph(transition.before)
    this.state = transition.state
    this.structuralTransition = transition.structural
    return { event, before, after: projectImportGraph(result.state), command: result.command }
  }
  preparationFactTime(delay: number, index: number, count: number) {
    return preparationFactTime(delay, index, count)
  }
  preparationCompleted(
    binding: { partition: number; lifetime: number; round: number; operation: number },
    units: readonly number[],
    delay: number
  ) {
    return preparationCompletedAction(binding, units, delay)
  }
  enqueue(at: number, order: number) {
    this.state = enqueueShared(this.state, at, order)
    this.queuedProjection = undefined
  }
  take() {
    const result = takeShared(this.state)
    this.state = result.state
    this.queuedProjection = undefined
    return result.entry
  }
  get queued() {
    return (this.queuedProjection ??= queuedShared(this.state))
  }
  cancel(order: number) {
    this.state = cancelShared(this.state, order)
    this.queuedProjection = undefined
  }
  edit(partition: number, lifetime: number) {
    const attempt = editSharedCanonical(this.state, partition, lifetime)
    this.state = attempt.state
    return attempt.plan
  }
  revalidate(context: unknown) {
    return revalidateSharedCanonical(this.state, context)
  }
  fence(event: CanonicalEvent, generated: boolean, context: unknown) {
    return fenceSharedCanonical(this.state, event, generated, context)
  }
  writerPrepare(capture: WriterCapture) {
    const changed = prepareSharedWriter(this.state, capture)
    this.state = changed.state
    return changed
  }
  writerClaim(pending: SharedWriterPending, now: number) {
    return claimSharedWriter(this.state, pending, now)
  }
  writerAfter(pending: SharedWriterPending, now: number) {
    const changed = afterSharedWriter(this.state, pending, now)
    this.state = changed.state
    return changed
  }
  writerAttempt(target: WriterTarget, now: number, currentBlock: boolean) {
    const changed = attemptSharedWriter(this.state, target, now, currentBlock)
    this.state = changed.state
    return changed
  }
  writerReleaseDelivery(receipt: SharedWriterRelease, now: number) {
    return deliverSharedWriterRelease(this.state, receipt, now)
  }
  writerReleaseValid(receipt: SharedWriterRelease, now: number) {
    return peekSharedWriterRelease(this.state, receipt, now) !== undefined
  }
  writerRelease(target: WriterTarget, now?: number) {
    return releaseSharedWriter(this.state, target, now)
  }
  responseControl(control: CollectionResponseControl, now: number) {
    const change = controlSharedResponse(this.state, control, now)
    this.state = change.state
    return change
  }
  responseAfter(target: CollectionResponseIdentity) {
    const change = afterSharedResponse(this.state, target)
    this.state = change.state
    return change
  }
  responseExpire(now: number) {
    const change = expireSharedResponses(this.state, now)
    this.state = change.state
    return change
  }
  responseValid(target: CollectionResponseIdentity, now: number, event: CanonicalEvent) {
    return deliverySharedResponse(this.state, target, now, event)
  }
  responseHandle(event: CanonicalEvent, index: number, context: unknown, target: CollectionResponseIdentity) {
    return driveSharedResponse(this.state, event, index, context, target)
  }
  handle(event: CanonicalEvent, index: number, context: unknown) {
    const handled = readRecord(driveSharedCommand(this.state, event, index, context))
    const issued = issueSharedActions(this.state, handled.actions)
    this.state = issued.state
    return { ...handled, actions: issued.actions }
  }
  preparationActive(event: PreparationEvent) {
    return sharedPreparationActive(this.state, event.partition, event.lifetime, event.round, event.operation)
  }
}
