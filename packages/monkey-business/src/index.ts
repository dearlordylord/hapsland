import { wakeStopFacts, type StopCapture } from "./stop-codec.ts";
import type { WriterControl, WriterReport } from "./writer-controls.ts";
export * from "./writer-controls.ts";
import type { SharedWriterPending, SharedWriterRelease } from "../../../src/canonical/simulation-adapter.ts";
import { encodeExpiryProfile, validateExpiryProfile, type ExpiryProfile } from "./expiry-controls.ts";
import { type CollectionResponseControl, type CollectionResponseIdentity, type CollectionResponseReport } from "./collection-scenario.ts";
import { initialOutputActions, decodeOutputCapture, validateOutputCapture, type OutputCapture, type OutputAttemptReport, type OutputAttemptObservation } from "./output-controls.ts";
export * from "./output-controls.ts";
import type { SharedCacheFact } from "../../../src/canonical/simulation-adapter.ts";
import { captureSharingIdentityFacts, encodeSharingKey, sharingIdentityLabel, type SharingIdentityFacts } from "./sharing-controls.ts";
export * from "./sharing-controls.ts";
import { encodeNoticeScope, type OperationalNoticeKind } from "./notice-controls.ts";
export * from "./notice-controls.ts";
import { decodeCallbackTarget, encodeCallbackTarget, encodeCallbackAction, type CallbackTarget, type CallbackReport } from "./callback-controls.ts";
import { decodeSharedValue } from "../../../src/canonical/simulation-codec.ts";
export * from "./callback-controls.ts";
import { GRAPH_LIMIT_CEILINGS, validateGraphLimits, type GraphLimits } from "../../../src/canonical/graph-adapter.ts";
import { SOURCE_IDENTITY, PREPARATION_SOURCE_IDENTITY } from "../../monkey-business-bend/engine.mjs";
import { readRecord, readBool, readNat, readBendList } from "../../../src/canonical/boundary-schema.ts";
import { decodeDriver, decodeDriverEvent, encodeDriverOutcome, type DriverAction } from "./driver-codec.ts";
import { SharedCore } from "./shared-core.ts";
import { ResourceScenarios, demoResourceLimits, type ResourceScenarioConfig } from "./resource-scenarios.ts";
import { freezeCanonicalData } from "../../../src/canonical/immutable.ts";
import { Schema } from "effect";
import { Nat, decoder } from "../../../src/canonical/boundary-schema.ts";
export * from "./resource-scenarios.ts";
export { projectAgent } from "./agent-projection.ts";
import { generateFileTree, validateFileTreeProfile, DEFAULT_FILE_TREE_PROFILE, type FileTreeProfile } from "./file-trees.ts";
export * from "./file-trees.ts";
import { type PreparationEvent, type PreparationFrame } from "./preparation.ts";
export * from "./preparation.ts";
import { DEFAULT_OUTCOME_WEIGHTS, JEV_OUTCOME_ORDER, OUTCOME_RANDOM_ALGORITHM, OUTCOME_RANDOM_STREAM, validateOutcomeWeights, type OutcomeWeights } from "./outcomes.ts";
export * from "./outcomes.ts";
import { validateLiveControl, type LiveControl, type EnvironmentProfile, type OutputProfile, type OutcomeChoice } from "./controls.ts";
export * from "./controls.ts";
export * from "./advicee-lifecycle.ts";
export * from "./permit-controls.ts";
import type { AdviceeLifecycleEntry } from "./advicee-lifecycle.ts";
import { DEFAULT_PERMIT_PROFILE, validatePermitLimits, validatePermitProfile, encodePermitCapture, decodePermitFacts, type PermitLimits, type PermitProfile } from "./permit-controls.ts";
export * from "./jev-interventions.ts";
import type { JevInterventionReport } from "./jev-interventions.ts";
import {
  type SessionConfig,
  type SessionInput,
  type SessionControl,
} from "./session.ts";
export { SessionGenerator } from "./session.ts";
export type { SessionConfig, SessionInput, SessionControl } from "./session.ts";
export * from "./sizes.ts";
import {
  type initialCanonical,
  type CanonicalEvent,
  type CanonicalCommand,
  type CanonicalProjection,
  type JevRequestOutcome,
} from "../../../src/canonical/adapter.ts";
export type {
  CanonicalEvent,
  CanonicalCommand,
  CanonicalProjection,
  JevRequestOutcome,
};
export const REPLAY_FORMAT = "monkey-business/1";
export const RANDOM_ALGORITHM = "xorshift32/1";
export const LOGIC_IDENTITY = SOURCE_IDENTITY;
export const PREPARATION_IDENTITY = PREPARATION_SOURCE_IDENTITY;
import type { LifecycleProfile, CapacityMetadata } from "./lifecycle-profile.ts";
export * from "./lifecycle-profile.ts";
export type RunInput =
  | SessionInput
  | ({ readonly at: number; readonly generation?: number } & (
      | { readonly kind: "canonical"; readonly event: CanonicalEvent }
      | {
          readonly kind: "edit";
          readonly bytes: number;
          readonly unitBytes: readonly number[];
          readonly outcome?: JevRequestOutcome;
          readonly tool?: number;
          readonly editDurationMs?: number;
          /** Exact source-free prepared evaluation identities, one per review unit. */
          readonly evaluationInputs?: readonly string[];
          /** Original captured production namespace facts, one per prepared unit. */
          readonly evaluationIdentityFacts?: readonly SharingIdentityFacts[];
          readonly evaluationTreeIdentity?: number;
          readonly evaluationTreeProfile?: FileTreeProfile;
          readonly evaluationGraphLimits?: GraphLimits;
          readonly revisionSubject?: string;
          readonly revisionInput?: string;
        }
      | { readonly kind: "finish" }
    ));
export type Control = LiveControl & { readonly agent?: string };
export type ReplayCheckpoint = {
  readonly boundary: number;
  readonly queueTakes: number;
  readonly time: number;
  readonly checkpointSequence: number;
};
export type ReplayBoundary = ReplayCheckpoint & { readonly sequence: number };
export type ControlRecord = ReplayBoundary & {
  readonly control: Control;
};
export type EffectObservation =
  | {
      readonly kind: "preparation";
      readonly phase: "started";
      readonly operation: number;
      readonly due: number;
    }
  | {
      readonly kind: "preparation";
      readonly phase: "supplied";
      readonly operation: number;
    }
  | {
      readonly kind: "jev";
      readonly phase: "started";
      readonly operation: number;
      readonly request: number;
      readonly due: number;
    }
  | {
      readonly kind: "jev";
      readonly phase: "supplied";
      readonly operation: number;
      readonly request: number;
    }
  | {
      readonly kind: "advice";
      readonly phase: "supplied";
      readonly advice: number;
    }
  | {
      readonly kind: "output";
      readonly phase: "started";
      readonly advices: readonly number[];
    }
  | {
      readonly kind: "cancellation";
      readonly phase: "supplied";
      readonly operation: number;
    };
export type CallbackReceipt = { readonly target: CallbackTarget; readonly issuedAt: number; readonly dueAt: number; readonly outputCapture?: OutputCapture };
export type Observation = {
  readonly callbackReceipt?: CallbackReceipt;
  readonly noticeDiagnostic?: OperationalNoticeKind;
  readonly partition?: number;
  readonly agent?: string;
  readonly sequence: number;
  readonly time: number;
  readonly event: CanonicalEvent | PreparationEvent;
  readonly preparation?: PreparationFrame;
  readonly commands: readonly CanonicalCommand[];
  readonly commandScopes?: readonly (number | undefined)[];
  readonly before: CanonicalProjection;
  readonly after: CanonicalProjection;
  readonly rejection?: string;
  readonly workload?: {
    readonly agent?: string;
    readonly revision?: number;
    readonly repair?: boolean;
  };
  readonly effects: readonly EffectObservation[];
  readonly capacityMetadata: CapacityMetadata;
};
/** One synchronous viewing boundary; presentation never owns simulator state. */
export type RunObservation = {
  readonly writerReports: readonly WriterReport[];
  readonly collectionResponseReports: readonly CollectionResponseReport[];
  readonly callbackTargets: readonly CallbackTarget[];
  readonly callbackReports: readonly CallbackReport[];
  readonly outputReports: readonly OutputAttemptReport[];
  readonly outputAttempts: readonly OutputAttemptObservation[];
  readonly adviceeLifecycles: readonly AdviceeLifecycleEntry[];
  readonly interventions: readonly JevInterventionReport[];
  readonly now: number;
  readonly eventCount: number;
  readonly projection: CanonicalProjection;
  readonly observations: readonly Observation[];
  readonly capacityMetadata: CapacityMetadata;
  readonly agentScopes: readonly { readonly agent: string; readonly partition: number; readonly seed: number }[];
};
export const AdvanceOptionsSchema = Schema.Struct({
  untilTime: Schema.optional(Nat),
  maxEvents: Schema.optional(Nat),
});
export type AdvanceOptions = typeof AdvanceOptionsSchema.Type;
const decodeAdvanceOptions = decoder(AdvanceOptionsSchema);
export type RunConfig = {
  readonly expiryProfile?: ExpiryProfile;
  readonly editPermitLimits?: Partial<PermitLimits>;
  readonly permitProfile?: PermitProfile;
  readonly graphLimits?: GraphLimits;
  readonly seed?: number;
  readonly lifecycles?: LifecycleProfile;
  readonly resourceScenarios?: ResourceScenarioConfig;
  /** Explicit demo provenance; never a native capacity policy. */
  readonly demoAgentCount?: number;
  readonly limits?: Parameters<typeof initialCanonical>[0];
  readonly inputs?: readonly RunInput[];
  readonly preparationDelay?: number;
  readonly fileTrees?: FileTreeProfile;
  readonly finishDeadline?: number;
  /** Synthetic retention clock; defaults to the resident’s ten-minute pending advice lifetime. */
  readonly adviceLifetime?: number;
  readonly environment?: EnvironmentProfile;
  readonly outputProfile?: OutputProfile;
  readonly jevDelay?: number;
  readonly retention?: number;
  readonly session?: SessionConfig;
  readonly sessions?: readonly SessionConfig[];
} & OutcomeChoice;
export type Replay = {
  readonly endpoint: { readonly eventCount: number; readonly queueTakes: number; readonly now: number };
  readonly format: typeof REPLAY_FORMAT;
  readonly randomAlgorithm: typeof RANDOM_ALGORITHM;
  readonly logicIdentity: typeof LOGIC_IDENTITY;
  readonly preparationIdentity: typeof PREPARATION_IDENTITY;
  readonly outcomeSampling: { readonly algorithm: typeof OUTCOME_RANDOM_ALGORITHM; readonly stream: typeof OUTCOME_RANDOM_STREAM; readonly order: typeof JEV_OUTCOME_ORDER };
  readonly config: RunConfig;
  readonly controls: readonly ControlRecord[];
  readonly scheduledInputs: readonly (ReplayBoundary & { readonly input: RunInput })[];
  /** Actual public advance normalization calls, ordered with inputs and controls. */
  readonly normalizations: readonly ReplayCheckpoint[];
};
type CandidateContext = { partition: number; advice: number; round: number; token: number; surface: "edit" | "background" | "stop"; selection?: boolean };
type Scheduled = {
  writerRelease?: SharedWriterRelease;
  writerOrigin?: { readonly pending: SharedWriterPending; readonly control: Extract<WriterControl, {action:"claim"}>; readonly sequence: number };
  responseOrigin?: { readonly target: CollectionResponseIdentity; readonly control: CollectionResponseControl | WriterControl; readonly sequence: number };
  driverAction?: DriverAction;
  driverContext?: unknown;
  driverSourceJob?: { readonly partition: number; readonly lifetime: number; readonly bytes: number; readonly units: readonly number[]; readonly outcome: ReturnType<typeof encodeDriverOutcome> };
  stopFact?: { readonly at: number; readonly event: CanonicalEvent };
  stopCapture?: StopCapture;
  noticeScope?: ReturnType<typeof encodeNoticeScope>;
  noticeDiagnostic?: OperationalNoticeKind;
  callbackReceipt?: CallbackReceipt;
  activityScope?: number;
  permitCapture?: { readonly capture: ReturnType<typeof encodePermitCapture>; readonly started: number };
  partition?: number;
  at: number;
  order: number;
  finishAttempt?: number;
  fitFinish?: number;
  expiryAdvice?: number;
  generated?: boolean;
  cacheFact?: SharedCacheFact;
  job?: Extract<RunInput, { kind: "edit" }>;
} & ({ input: RunInput; candidate?: never } | {
  input: { kind: "canonical"; at: number; event: Extract<CanonicalEvent, { kind: "finalCandidateCheck" | "submissionSuppressCheck" | "collectionFitCheck" }>; generation?: number };
  candidate: CandidateContext;
} | {
  input: { kind: "preparationGraph"; at: number; event: PreparationEvent };
  candidate?: never;
});
/** Full factual viewing boundary. Snapshots are detached from the live owner. */
export type RunRuntimeSnapshot = {
  readonly engine: ReturnType<SharedCore["snapshotState"]>;
  readonly queue: readonly Readonly<Scheduled>[];
  readonly jobs: readonly (readonly [number, Extract<RunInput, { kind: "edit" }>])[];
  readonly issuedRequests: readonly (readonly [number, Extract<CanonicalCommand, { kind: "jevRequestIssued" }>])[];
  readonly retainedCallbacks: readonly { readonly order: number; readonly receipt: CallbackReceipt;
    readonly payload: Readonly<Scheduled>; readonly fact: unknown }[];
  readonly order: number;
  readonly eventCount: number;
  readonly jevDelay: number;
  readonly outcome: JevRequestOutcome | undefined;
  readonly outcomeWeights: OutcomeWeights;
  readonly environment: EnvironmentProfile;
  readonly outputProfile: OutputProfile;
  readonly generatorPartitions: readonly number[];
};
type RunStructuralDetails =
  | { readonly kind: "canonical" | "preparation" | "sharing"; readonly scheduled: Readonly<Scheduled>;
      readonly observation: Observation; readonly transition: unknown; readonly source?: unknown }
  | { readonly kind: "finishRegistration"; readonly scheduled: Readonly<Scheduled>;
      readonly registration: ReturnType<SharedCore["stopRegister"]> }
  | { readonly kind: "callbackDelivery"; readonly scheduled: Readonly<Scheduled>;
      readonly receipt: CallbackReceipt; readonly fact: unknown; readonly delivery: unknown };
export type RunStructuralFrame = RunStructuralDetails & {
  readonly time: number;
  readonly before: RunRuntimeSnapshot;
  readonly after: RunRuntimeSnapshot;
};
const integer = (n: number, name: string) => {
  if (!Number.isSafeInteger(n) || n < 0 || n > 2 ** 48 - 1)
    throw new RangeError(`invalid ${name}`);
  return n;
};
const copy = <T>(x: T): T => structuredClone(x);
const restoreEndpoint = Symbol("restore replay endpoint");
const replayProgress = Symbol("replay progress driver");
const replayNormalize = Symbol("recorded normalization");
type ReplayCoordinate = { eventCount: number; queueTakes: number; now: number };
type ReplayProgressDriver = { target: () => ReplayCoordinate | undefined; flush: () => void };
const ReplayCoordinateSchema = Schema.Struct({ eventCount: Nat, queueTakes: Nat, now: Nat });
const readReplayCoordinate = decoder(ReplayCoordinateSchema);
const ReplayCheckpointFields = { boundary: Nat, queueTakes: Nat, time: Nat, checkpointSequence: Nat };
const ReplayBoundaryFields = { ...ReplayCheckpointFields, sequence: Nat };
const readNormalization = decoder(Schema.Struct(ReplayCheckpointFields));
const readControlRecord = decoder(Schema.Struct({ ...ReplayBoundaryFields, control: Schema.Unknown }));
const readInputRecord = decoder(Schema.Struct({ ...ReplayBoundaryFields, input: Schema.Unknown }));
type Finish = import("./stop-codec.ts").StopFinish;
const defaults = {
  globalItems: 32,
  globalBytes: 100000,
  partitionItems: 16,
  partitionBytes: 50000,
};
/** Equal-time items follow insertion order; effects appended by a transition follow already queued items. */
export class Run {
  private writerReports: WriterReport[] = [];
  private collectionResponseReports: CollectionResponseReport[] = [];
  private core: SharedCore;
  private nextTool = 1;
  private resourceScenarios?: ResourceScenarios;
  private get candidateOutputBytes(): number | undefined { return this.config.lifecycles?.encodedOutputBytes ?? (this.config.resourceScenarios?.outputBytes ?? (this.resourceScenarios?.config.outputFit ? this.resourceScenarios.config.outputBytes : undefined)); }
  private identityIds = new Map<string, number>();
  private nextIdentity = 1;
  private identity(value: string): number { const known = this.identityIds.get(value); if (known !== undefined) return known; const id = this.nextIdentity++; this.identityIds.set(value, id); return id; }
  private readonly metadata: CapacityMetadata = { preparationWorkers: 8, jevRequests: 8, continuationBudget: 4 };
  get capacityMetadata(): CapacityMetadata {
    const metadata = copy(this.metadata);
    if (metadata.demoAgentCount !== undefined) {
      const limits = demoResourceLimits(metadata.demoAgentCount);
      if (metadata.reuse?.entryLimit !== limits.entryLimit || metadata.reuse.byteLimit !== limits.byteLimit
        || (metadata.notices !== undefined && metadata.notices.maximumKeys !== limits.noticeMaximumKeys))
        delete (metadata as { demoAgentCount?: number }).demoAgentCount;
    }
    return metadata;
  }
  private canonicalAllowed = true;
  private readonly callbackPayloads = new Map<number, { receipt: CallbackReceipt; payload: Scheduled }>();
  private readonly callbackFacts = new WeakMap<CallbackReceipt, object>();
  private readonly callbackSources = new WeakMap<CallbackReceipt, Scheduled>();
  private readonly callbackReports: CallbackReport[] = [];
  private readonly outputReports: OutputAttemptReport[] = [];
  private get outputAttempts(): readonly OutputAttemptObservation[] {
    return this.core.callbackOriginals.flatMap(original => {
      const fact = readRecord(original.fact);
      const completion = readRecord(fact.completion);
      if (completion.$ === "None") return [];
      if (completion.$ !== "Some") throw new TypeError("invalid retained output capture");
      const capture = decodeOutputCapture(completion.value);
      const status = readRecord(original.status).$;
      if (!["Callbacks.Queued", "Callbacks.Held", "Callbacks.Dropped"].includes(String(status))) throw new TypeError("invalid output delivery state");
      return [{ target: decodeCallbackTarget(fact.target), capture, issuedAt: capture.started, dueAt: readNat(fact.at),
        scheduledOrder: readNat(original.scheduled_order), delivery: status === "Callbacks.Queued" ? "scheduled" as const : status === "Callbacks.Held" ? "held" as const : "dropped" as const }];
    });
  }

  private callbackTargetKey(target: CallbackTarget) { return JSON.stringify(target); }
  private get callbackTargets(): readonly CallbackTarget[] {
    const targets = this.core.callbackOriginals.map(original => decodeCallbackTarget(readRecord(original.fact).target));
    for (const frame of this.history) if (frame.callbackReceipt && !targets.some(target => this.callbackTargetKey(target) === this.callbackTargetKey(frame.callbackReceipt!.target))) targets.push(frame.callbackReceipt.target);
    return targets;
  }
  private scheduled = new Map<number, Scheduled>();
  private get queue(): Scheduled[] {
    return this.core.queued.map(entry => {
      const item = this.scheduled.get(entry.order);
      if (!item) throw new Error("shared scheduler lost source facts");
      return item;
    });
  }
  private set queue(items: Scheduled[]) {
    const retained = new Set(items.map(item => item.order));
    for (const order of this.scheduled.keys()) if (!retained.has(order)) {
      this.core.cancel(order);
      this.scheduled.delete(order);
    }
  }
  private queuePush(item: Scheduled) {
    if (item.activityScope === undefined) {
      const scope = this.core.activityScope(this.inputPartition(item));
      if (scope !== undefined) item.activityScope = scope;
    }
    this.core.enqueue(item.at, item.order);
    this.scheduled.set(item.order, item);
  }
  private queueShift(): Scheduled | undefined {
    const target = this.progressDriver?.target();
    if (target && this.takes >= target.queueTakes) return;
    // Check finite progress before the owner consumes anything. None is not a take.
    if (this.queue.length) integer(this.takes + 1, "successful queue take count");
    const entry = this.core.take();
    if (!entry) return;
    const item = this.scheduled.get(entry.order);
    if (!item) throw new Error("shared scheduler lost source facts");
    this.takes++;
    this.scheduled.delete(entry.order);
    // Delivery consumes an authentic issued queue receipt independently of the
    // Canonical result or whether the transition emits any commands.
    if (item.callbackReceipt) {
      const receipt = item.callbackReceipt;
      const physicalBefore = this.structuralBefore();
      const original = physicalBefore ? copy(item) : item;
      const fact = this.callbackFacts.get(item.callbackReceipt);
      if (!fact) throw new Error("issued callback lost trusted fact");
      const delivered = readRecord(this.core.outputDeliver(fact, this.clock));
      if (delivered.$ === "Some" && item.input.kind === "canonical") {
        const action = decodeDriver({ handled: true, actions: { $: "Con", head: delivered.value, tail: { $: "Nil" } } }).actions[0];
        if (!action) throw new Error("shared callback lost completion action");
        item.input = { ...item.input, event: action.event };
      }
      this.core.deliverCallback(entry.order);
      this.structuralRecord(physicalBefore,() => ({ kind: "callbackDelivery", scheduled: original,
        receipt, fact, delivery: delivered }));
    }
    return item;
  }
  private order = 0;
  private count = 0;
  private takes = 0;
  private progressDriver: ReplayProgressDriver | undefined;
  private normalizations: ReplayCheckpoint[] = [];
  private get clock() { return this.core.now; }
  private history: Observation[] = [];
  private listeners = new Set<(o: Observation) => void>();
  private structuralListeners = new Set<(frame: RunStructuralFrame) => void>();
  private controls: ControlRecord[] = [];
  private interventionReports: JevInterventionReport[] = [];
  get interventions(): readonly JevInterventionReport[] { return copy(this.interventionReports); }
  private externalInputs: (ReplayBoundary & { input: RunInput })[] = [];
  private timelineOrder = 0;
  private checkpointOrder = 0;
  private issuedRequests = new Map<
    number,
    Extract<CanonicalCommand, { kind: "jevRequestIssued" }>
  >();
  private jobs = new Map<number, Extract<RunInput, { kind: "edit" }>>();
  private readonly config: RunConfig;
  private readonly generators = new Map<number, ReturnType<SharedCore["session"]>>();
  private readonly scopes: { agent: string; partition: number; seed: number }[] = [];
  get agentScopes(): readonly { readonly agent: string; readonly partition: number; readonly seed: number }[] {
    return copy(this.scopes);
  }
  get editPermitLimits(): PermitLimits { return copy(this.permitLimits); }
  get futurePermitProfile(): PermitProfile { return copy(this.permitProfile); }
  private jevDelay: number;
  private outcome: JevRequestOutcome | undefined;
  private outcomeWeights: OutcomeWeights;
  private environment: EnvironmentProfile;
  private outputProfile: OutputProfile;
  private expiryProfile: ExpiryProfile;
  private fileTrees: FileTreeProfile;
  private graphLimits: GraphLimits;
  private permitLimits: PermitLimits;
  private permitProfile: PermitProfile;
  private permitsEnabled: boolean;
  constructor(config: RunConfig = {}) {
    if (config.lifecycles?.cancellation !== undefined && !["lateCallback", "suppressed"].includes(config.lifecycles.cancellation)) throw new TypeError("invalid cancellation outcome");
    if (config.lifecycles?.reuse) for (const [name, value] of Object.entries(config.lifecycles.reuse)) if (integer(value, name) === 0) throw new RangeError(`${name} must be positive`);
    if (config.lifecycles?.encodedOutputBytes !== undefined) integer(config.lifecycles.encodedOutputBytes, "encoded output bytes");
    if (config.lifecycles?.collectors?.lifetimeMs !== undefined && integer(config.lifecycles.collectors.lifetimeMs, "collector lifetime") === 0) throw new RangeError("collector lifetime must be positive");
    if (config.lifecycles?.collectors && integer(config.lifecycles.collectors.capacity, "collector capacity") === 0) throw new RangeError("collector capacity must be positive");
    if (config.lifecycles?.quietWindowMs !== undefined && integer(config.lifecycles.quietWindowMs, "quiet window") === 0) throw new RangeError("quiet window must be positive");
    if (config.lifecycles?.reuse) Object.assign(this.metadata, { reuse: { entryLimit: config.lifecycles.reuse.entryLimit, byteLimit: config.lifecycles.reuse.byteLimit } });
    const demoLimits = demoResourceLimits(config.sessions?.length ?? 1);
    if (config.demoAgentCount !== undefined) {
      const advertised = demoResourceLimits(config.demoAgentCount);
      if (config.lifecycles?.reuse?.entryLimit === advertised.entryLimit && config.lifecycles.reuse.byteLimit === advertised.byteLimit
        && (config.resourceScenarios?.noticeMaximumKeys ?? demoLimits.noticeMaximumKeys) === advertised.noticeMaximumKeys)
        Object.assign(this.metadata, { demoAgentCount: config.demoAgentCount });
    }
    if (config.resourceScenarios) config = { ...config, resourceScenarios: { noticeMaximumKeys: demoLimits.noticeMaximumKeys, ...config.resourceScenarios } };
    if (config.resourceScenarios?.notices) Object.assign(this.metadata, { notices: { maximumKeys: config.resourceScenarios.noticeMaximumKeys ?? 8 } });
    if (config.lifecycles?.collectors) Object.assign(this.metadata, { collectors: { capacity: config.lifecycles.collectors.capacity } });
    this.permitLimits = validatePermitLimits(config.editPermitLimits ?? {});
    this.permitProfile = validatePermitProfile(config.permitProfile ?? DEFAULT_PERMIT_PROFILE);
    this.permitsEnabled = config.editPermitLimits !== undefined || config.permitProfile !== undefined;
    if (this.permitsEnabled) Object.assign(this.metadata, { permits: { adviceeLimit: this.permitLimits.perAdvicee, residentLimit: this.permitLimits.resident } });
    this.graphLimits = validateGraphLimits(config.graphLimits ?? GRAPH_LIMIT_CEILINGS);
    this.fileTrees = validateFileTreeProfile(config.fileTrees ?? DEFAULT_FILE_TREE_PROFILE);
    this.environment = copy(config.environment ?? { currentWork: true, credentialReady: true });
    this.expiryProfile = validateExpiryProfile(config.expiryProfile ?? { pendingMs: config.adviceLifetime ?? 600000, leaseMs: config.outputProfile?.leaseMs ?? 30000, cooldownMs: config.resourceScenarios?.cooldownMs ?? 60000 });
    this.outputProfile = copy(config.outputProfile ?? { outcome: "certain", delayMs: 0, leaseMs: 30000 });
    validateLiveControl({ kind: "environment", ...this.environment });
    validateLiveControl({ kind: "outputProfile", ...this.outputProfile });
    this.core = new SharedCore(config.limits ?? defaults, config.seed ?? 1);
    this.core.configureCollector(config.lifecycles?.collectors);
    if (config.lifecycles?.reuse) this.core.configureCache(config.lifecycles.reuse.entryLimit, config.lifecycles.reuse.byteLimit);
    this.core.configureCredentials(this.environment.credentialReady, this.environment.credentialGeneration ?? 1);
    if (config.session && config.sessions) throw new TypeError("choose session or sessions");
    const sessions = config.sessions ?? (config.session ? [config.session] : []);
    if (config.sessions && (!sessions.length || sessions.length > 64)) throw new RangeError("sessions requires 1..64 agents");
    sessions.forEach((settings, index) => {
      const agent = settings.agent ?? `agent-${index + 1}`;
      if (this.scopes.some(scope => scope.agent === agent)) throw new TypeError("duplicate session agent");
      const seed = settings.seed ?? ((config.seed ?? 1) + Math.imul(index, 2654435761)) >>> 0;
      const partition = this.core.declareAdvicee(index + 1, seed).partition;
      this.generators.set(partition, this.core.session(partition, { ...settings, agent, seed }));
      this.scopes.push({ agent, partition, seed });
    });
    if (!sessions.length) {
      const seed = config.seed ?? 1;
      const declared = this.core.declareAdvicee(1, seed);
      // Publish the already issued headless advicee; it has no Background generator.
      this.scopes.push({ agent: "agent-1", partition: declared.partition, seed });
    }
    if (config.outcome !== undefined && config.outcomeWeights !== undefined) throw new TypeError("choose explicit outcome or outcome weights");
    this.outcome = config.outcome;
    this.outcomeWeights = validateOutcomeWeights(config.outcomeWeights ?? DEFAULT_OUTCOME_WEIGHTS);
    const { outcome: _outcome, outcomeWeights: _weights, ...baseConfig } = config;
    this.config = copy({
      ...baseConfig,
      ...(this.permitsEnabled ? { editPermitLimits: this.permitLimits, permitProfile: this.permitProfile } : {}),
      seed: config.seed ?? 1,
      fileTrees: this.fileTrees,
      ...(config.outcome === undefined ? { outcomeWeights: this.outcomeWeights } : { outcome: config.outcome }),
      inputs:
        config.inputs ??
        ((config.session || config.sessions)
          ? []
          : [
              {
                at: 0,
                kind: "edit",
                bytes: 10,
                unitBytes: [5],
              },
              { at: 20, kind: "finish" },
            ]),
    });
    const deliveryGroups = this.scopes.map(scope => ({ partition: scope.partition, group: scope.partition }));
    if (!deliveryGroups.length && this.config.inputs!.some(input => input.kind === "edit" || input.kind === "finish")) deliveryGroups.push({ partition: 1, group: 1 });
    if (deliveryGroups.length) Object.assign(this.metadata, { deliveryGroups });
    integer(this.config.seed!, "seed");
    this.jevDelay = integer(config.jevDelay ?? 5, "Jev delay");
    integer(config.preparationDelay ?? 2, "preparation delay");
    integer(config.finishDeadline ?? 200, "finish deadline");
    if (integer(config.adviceLifetime ?? 600_000, "advice lifetime") === 0)
      throw new RangeError("advice lifetime must be positive");
    integer(config.retention ?? 1000, "retention");
    for (const generator of this.generators.values())
      for (const input of generator.next(0)) this.enqueue(input);
    for (const input of this.config.inputs!) this.enqueue(input);
    if (config.resourceScenarios) {
      this.resourceScenarios = new ResourceScenarios(config.resourceScenarios);
      for (const input of this.resourceScenarios.inputs()) this.enqueue(input);
      if (this.resourceScenarios.config.notices) {
        const c = this.resourceScenarios.config;
        const scope = encodeNoticeScope({ partition: c.partition, group: c.group, key: 900000, maximumKeys: c.noticeMaximumKeys,
          reservationBytes: c.noticeReservationBytes, cooldownMs: c.cooldownMs, startAt: c.startAt });
        for (const fact of this.core.noticeExercise(scope)) {
          const at = c.startAt + readNat(fact.offset);
          this.enqueue({ at, kind: "canonical", event: decodeDriverEvent(fact.event) });
          this.scheduled.get(this.order - 1)!.noticeScope = scope;
        }
      }
    }
  }
  get now() {
    return this.clock;
  }
  get projection() {
    return this.core.projection;
  }
  get observations(): readonly Observation[] {
    return this.history;
  }
  get eventCount() {
    return this.count;
  }
  observe(): RunObservation {
    return freezeCanonicalData({ writerReports: [...this.writerReports], collectionResponseReports: [...this.collectionResponseReports], adviceeLifecycles: this.core.adviceeLifecycles, now: this.clock, eventCount: this.count,
      projection: this.projection, observations: [...this.history],
      capacityMetadata: this.capacityMetadata, agentScopes: this.agentScopes, interventions: this.interventions, callbackTargets: this.callbackTargets, callbackReports: [...this.callbackReports], outputReports: [...this.outputReports], outputAttempts: this.outputAttempts });
  }
  subscribe(listener: (o: Observation) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Source observations do not enter history or consume advance's event budget. */
  subscribeStructural(listener: (frame: RunStructuralFrame) => void) {
    this.structuralListeners.add(listener);
    return () => this.structuralListeners.delete(listener);
  }
  runtimeSnapshot(): RunRuntimeSnapshot {
    const retainedCallbacks = [...this.callbackPayloads].map(([order, value]) => {
      const fact = this.callbackFacts.get(value.receipt);
      if (!fact) throw new Error("retained callback lost trusted fact");
      return { order, receipt: value.receipt, payload: value.payload, fact };
    });
    return freezeCanonicalData(copy({ engine: this.core.snapshotState(), queue: this.queue,
      jobs: [...this.jobs] as const, issuedRequests: [...this.issuedRequests] as const,
      retainedCallbacks, order: this.order, eventCount: this.count, jevDelay: this.jevDelay,
      outcome: this.outcome, outcomeWeights: this.outcomeWeights, environment: this.environment,
      outputProfile: this.outputProfile, generatorPartitions: [...this.generators.keys()] }));
  }
  private structuralBefore(): RunRuntimeSnapshot | undefined {
    return this.structuralListeners.size ? this.runtimeSnapshot() : undefined;
  }
  private structuralRecord(before: RunRuntimeSnapshot | undefined, details: () => RunStructuralDetails): void {
    if (!before || !this.structuralListeners.size) return;
    const frame = freezeCanonicalData(copy({ ...details(), time: this.clock, before, after: this.runtimeSnapshot() }));
    for (const listener of this.structuralListeners) listener(frame);
  }
  schedule(input: RunInput) {
    integer(this.checkpointOrder + 1, "replay checkpoint sequence");
    integer(this.timelineOrder + 1, "replay action sequence");
    this.enqueue(copy(input));
    this.externalInputs.push({
      boundary: this.count,
      queueTakes: this.takes,
      time: this.clock,
      sequence: this.timelineOrder++,
      checkpointSequence: this.checkpointOrder++,
      input: copy(input),
    });
  }
  private enqueue(input: RunInput, job?: Extract<RunInput, { kind: "edit" }>, expiryAdvice?: number, activityScope?: number) {
    integer(input.at, "virtual time");
    if (input.at < this.clock)
      throw new RangeError("cannot schedule in the past");
    this.queuePush({
      at: input.at,
      order: this.order++,
      input: copy(input),
      ...(activityScope === undefined ? {} : { activityScope }),
      ...(job ? { job } : {}),
      ...(expiryAdvice !== undefined ? { expiryAdvice } : {}),
    });
  }
  private event(
    partition: number,
    event: CanonicalEvent,
    delay = 0,
    job?: Extract<RunInput, { kind: "edit" }>,
    expiryAdvice?: number,
    provenance: "environment" | "canonicalFeedback" = "environment",
    capture?: OutputCapture,
    sourceAction?: DriverAction,
    sourceContext?: unknown,
  ) {
    const checkedCapture = capture === undefined ? undefined : validateOutputCapture(capture);
    this.enqueue({ at: this.clock + delay, kind: "canonical", event }, job, expiryAdvice);
    const scheduled = this.queue.find(item => item.order === this.order - 1)!;
    scheduled.driverAction = freezeCanonicalData(copy(sourceAction ?? { event, delay, job: !!job, ...(expiryAdvice === undefined ? {} : { expiryAdvice }) }));
    if (sourceContext !== undefined) scheduled.driverContext = freezeCanonicalData(copy(sourceContext));
    scheduled.generated = true;
    scheduled.partition = partition;
    const rawReceipt = provenance === "environment"
      ? this.core.issueCallback(event, scheduled.order, scheduled.at, scheduled.driverAction, checkedCapture) : undefined;
    if (rawReceipt) {
      const receipt = freezeCanonicalData({ target: decodeCallbackTarget(readRecord(decodeSharedValue(rawReceipt)).target),
        issuedAt: this.clock, dueAt: scheduled.at, ...(checkedCapture === undefined ? {} : { outputCapture: checkedCapture }) });
      const payload = { ...scheduled, callbackReceipt: receipt } as Scheduled;
      scheduled.callbackReceipt = receipt;
      this.callbackFacts.set(receipt, rawReceipt);
      this.callbackSources.set(receipt, payload);
      this.callbackPayloads.set(receipt.target.originalOrder, { receipt, payload });
    }
  }
  applyControl(control: Control): ControlRecord {
    integer(this.checkpointOrder + 1, "replay checkpoint sequence");
    integer(this.timelineOrder + 1, "replay action sequence");
    const value: Control = validateLiveControl(control);
    if (value.agent !== undefined && !this.scopes.some(scope => scope.agent === value.agent))
      throw new RangeError("unknown agent control target");
    if (value.agent !== undefined && ["environment", "jevProfile", "outputProfile", "fileTrees", "credentials", "jevRequest", "graphLimits"].includes(value.kind))
      throw new TypeError("resident controls cannot target one agent");
    if (value.kind === "backgroundWriter") {
      const owner = this.scopes.find(scope => scope.agent === value.agent)!;
      const target = value.action === "claim" ? value.capture.target : value.target;
      if (target.partition !== owner.partition) throw new TypeError("writer does not belong to advicee");
      if (value.action === "claim") {
        const changed = this.core.writerPrepare(value.capture);
        this.writerReports.push({ at: this.clock, controlSequence: this.timelineOrder, control: value,
          result: changed.pending ? "queued" : "wrongScope" });
        this.enqueueResponseActions(changed.actions,undefined,target.partition,changed.pending
          ? { pending: changed.pending, control: value, sequence: this.timelineOrder } : undefined);
      } else if (value.action === "attempt") {
        const changed = this.core.writerAttempt(value.target,this.clock,value.currentBlock);
        this.writerReports.push({ at: this.clock, controlSequence: this.timelineOrder, control: value,
          result: changed.result, ...(changed.target ? { target: changed.target } : {}) });
        this.enqueueResponseActions(changed.actions,changed.target
          ? { target: changed.target, control: value, sequence: this.timelineOrder } : undefined,target.partition);
      } else {
        const events = this.core.writerRelease(value.target,value.action === "expire" ? this.clock : undefined);
        this.writerReports.push({ at: this.clock, controlSequence: this.timelineOrder, control: value,
          result: events.length ? "queued" : "missing" });
        for (const fact of events) {
          this.event(target.partition,fact.event);
          this.scheduled.get(this.order-1)!.writerRelease=fact.receipt;
        }
      }
    } else if (value.kind === "collectionResponse") {
      const owner = this.scopes.find(scope => scope.agent === value.agent);
      if (!owner) throw new RangeError("unknown response advicee");
      const target = value.action === "open" ? value.response : value.target;
      if (target.partition !== owner.partition) throw new TypeError("response does not belong to advicee");
      const changed = this.core.responseControl(value,this.clock);
      this.collectionResponseReports.push({ at: this.clock, controlSequence: this.timelineOrder,
        control: value, result: changed.result, ...(changed.issued ? { issued: changed.issued } : {}) });
      this.enqueueResponseActions(changed.actions,value.action === "attempt"
        ? { target: value.target, control: value, sequence: this.timelineOrder } : undefined,target.partition);
    } else if (value.kind === "sharingMember") {
      const owner = this.scopes.find(scope => scope.agent === value.agent)!;
      const partition = value.action === "leave" ? value.target.partition : value.partition;
      if (partition !== owner.partition) throw new TypeError("sharing target does not belong to advicee");
      const departure = value.action === "leave"
        ? this.core.leaveSharing({ $: "FreshnessScenario.Scope", ...value.target })
        : this.core.leaveAllSharing(value.partition, value.lifetime);
      for (const event of readBendList(departure.events, decodeDriverEvent, 2048)) this.event(partition, event);
    } else if (value.kind === "expiryProfile") {
      this.expiryProfile = value.profile;
    } else if (value.kind === "noticeCollect") {
      const c = this.resourceScenarios?.config;
      const scope = encodeNoticeScope({ partition: value.partition, group: value.group, key: 900000,
        maximumKeys: c?.noticeMaximumKeys ?? 8, reservationBytes: c?.noticeReservationBytes ?? 128,
        cooldownMs: this.expiryProfile.cooldownMs, startAt: this.clock });
      for (const raw of this.core.noticePrune(value.partition,value.group,this.clock)) {
        this.event(value.partition,decodeDriverEvent(raw));
        this.scheduled.get(this.order - 1)!.noticeScope = scope;
      }
      this.event(value.partition, { kind: "noticeSelect", partition: value.partition, group: value.group,
        composed: value.composed, authorityBound: value.authorityBound, allowed: [...value.allowed] });
    } else if (value.kind === "noticeFailure" || value.kind === "noticeLease" || value.kind === "noticeAcknowledge") {
      const c = this.resourceScenarios?.config;
      const scope = encodeNoticeScope({ ...value.target, maximumKeys: c?.noticeMaximumKeys ?? 8,
        reservationBytes: c?.noticeReservationBytes ?? 128, cooldownMs: this.expiryProfile.cooldownMs, startAt: this.clock });
      const raw = readRecord(value.kind === "noticeFailure" ? this.core.noticeFailure(scope,this.clock,value.target.key,this.timelineOrder)
        : this.core.noticeOwned(value.target.partition,value.target.group,value.target.key,value.kind === "noticeLease" ? "lease" : "acknowledge"));
      if (raw.$ === "Some") {
        this.event(value.target.partition,decodeDriverEvent(raw.value));
        const item = this.scheduled.get(this.order - 1)!;
        item.noticeScope = scope;
        if (value.kind === "noticeFailure") item.noticeDiagnostic = value.diagnostic;
      }
    } else if (value.kind === "callback") {
      const key = this.callbackTargetKey(value.target);
      const source = [...this.callbackPayloads.values()].find(item => this.callbackTargetKey(item.receipt.target) === key)
        ?? this.history.flatMap(frame => frame.callbackReceipt ? [{ receipt: frame.callbackReceipt, payload: this.callbackSources.get(frame.callbackReceipt) }] : []).find(item => this.callbackTargetKey(item.receipt.target) === key);
      const transition = this.core.callback(encodeCallbackTarget(value.target), encodeCallbackAction(value.action), source ? this.callbackFacts.get(source.receipt) : undefined, this.clock, this.order);
      for (const order of transition.cancel) { this.core.cancel(order); this.scheduled.delete(order); }
      for (const scheduled of transition.schedule) {
        if (!source?.payload) throw new Error("shared callback lost original source payload");
        const at = readNat(scheduled.at), order = readNat(scheduled.order);
        const original = source.payload;
        this.queuePush({ ...original, at, order, input: { ...original.input, at } } as Scheduled);
        this.order = Math.max(this.order, order + 1);
      }
      const result = readRecord(transition.result).$;
      this.callbackReports.push({ at: this.clock, controlSequence: this.timelineOrder, control: value,
        result: result === "Callbacks.Applied" ? "applied" : result === "Callbacks.NotQueued" ? "notQueued" : result === "Callbacks.NotHeld" ? "notHeld" : "missing" });
    } else if (value.kind === "outputAttempt") {
      const key = this.callbackTargetKey(value.target);
      const source = [...this.callbackPayloads.values()].find(item => this.callbackTargetKey(item.receipt.target) === key)
        ?? this.history.flatMap(frame => frame.callbackReceipt ? [{ receipt: frame.callbackReceipt, payload: this.callbackSources.get(frame.callbackReceipt) }] : []).find(item => this.callbackTargetKey(item.receipt.target) === key);
      const transition = this.core.outputIntervene(value.target, value.outcome, source ? this.callbackFacts.get(source.receipt) : undefined);
      for (const order of transition.cancel) { this.core.cancel(order); this.scheduled.delete(order); }
      for (const scheduled of transition.schedule) {
        if (!source?.payload || !transition.receipt || source.payload.input.kind !== "canonical" || source.payload.candidate !== undefined)
          throw new Error("shared output intervention lost original receipt");
        const at = readNat(scheduled.at), order = readNat(scheduled.order);
        const action = decodeDriver({ handled: true, actions: { $: "Con", head: scheduled.action, tail: { $: "Nil" } } }).actions[0];
        if (!action) throw new Error("shared output intervention lost completion action");
        const payload: Scheduled = { ...source.payload, at, order, input: { ...source.payload.input, at, event: action.event } };
        this.callbackFacts.set(source.receipt, transition.receipt);
        this.callbackSources.set(source.receipt, payload);
        this.callbackPayloads.set(source.receipt.target.originalOrder, { receipt: source.receipt, payload });
        this.queuePush(payload);
      }
      const result = readRecord(transition.result).$;
      this.outputReports.push({ at: this.clock, controlSequence: this.timelineOrder, control: value,
        result: result === "Callbacks.Applied" ? "applied" : result === "Callbacks.NotQueued" ? "notQueued" : "missing" });
    } else if (value.kind === "adviceeLifecycle") {
      const scope = this.scopes.find(scope => scope.agent === value.agent);
      if (!scope) throw new RangeError("unknown advicee lifecycle target");
      const transition = this.core.lifecycle(scope.partition, scope.agent, value.action);
      const current = this.core.adviceeLifecycles.find(entry => entry.partition === scope.partition);
      if (current && current.status !== "active") {
        const finish = this.core.stopFind(scope.partition);
        if (finish) {
          this.queue = this.queue.filter(item => item.finishAttempt !== finish.attempt || item.partition !== scope.partition);
          this.core.stopClose(scope.partition);
        }
      }
      for (const operation of readBendList(transition.cleanup.operations, readNat, 2048)) this.jobs.delete(operation);
      for (const action of decodeDriver({ handled: true, actions: transition.cleanup.actions }).actions) this.event(scope.partition, action.event, action.delay);
      for (const input of transition.events) this.enqueue(input);
    } else if (value.kind === "editPermitLimits") {
      this.permitLimits = validatePermitLimits(value.limits);
      this.permitsEnabled = true;
    } else if (value.kind === "permitProfile") {
      this.permitProfile = validatePermitProfile(value.profile);
      this.permitsEnabled = true;
    } else if (value.kind === "jevRequest") {
      const target = value.target;
      const targeted = (item: Scheduled): boolean => {
        if (!item.generated || item.input.kind !== "canonical") return false;
        return this.core.callbackMatches(item.input.event, target);
      };
      const callbacks = this.queue.filter(targeted);
      const due = callbacks.filter(item => item.input.kind === "canonical" && item.input.event.kind === "jevRequestSettled")[0]?.at ?? this.clock;
      const intervention = readRecord(this.core.interveneRequest(target, encodeDriverOutcome(value.outcome), Math.max(0, due - this.clock)));
      const results = { "JevEffects.RefusedMissing": "requestMissing", "JevEffects.RefusedStarted": "requestAlreadyStarted", "JevEffects.RefusedInterrupted": "requestAlreadyInterrupted" } as const;
      let result: JevInterventionReport["result"];
      if (intervention.$ === "JevEffects.Applied") {
        const facts = readBendList(intervention.facts, fact => {
          const checked = readRecord(fact);
          return { event: decodeDriverEvent(checked.event), delay: readNat(checked.delay) };
        }, 1024);
        // The shared owner checks each original's actual queued order once.
        // Copies and held/history receipts do not change original membership.
        this.core.replaceCallbacks(callbacks.map(callback => callback.order));
        this.queue = this.queue.filter(item => !targeted(item));
        for (const fact of facts) this.event(target.partition, fact.event, fact.delay);
        result = "applied";
      } else if (typeof intervention.$ === "string" && intervention.$ in results) {
        result = results[intervention.$ as keyof typeof results];
      } else throw new TypeError("invalid Jev intervention result");
      this.interventionReports.push({ controlSequence: this.timelineOrder, at: this.clock, control: value, result });
    } else if (value.kind === "credentials") {
      const facts = this.core.credentials(value.action);
      this.environment = { ...this.environment, credentialReady: facts.available, credentialGeneration: facts.generation };
      this.interventionReports.push({ controlSequence: this.timelineOrder, at: this.clock, control: value, result: "applied" });
      this.revalidateEnvironment();
    } else if (value.kind === "graphLimits") {
      this.graphLimits = validateGraphLimits(value.limits);
    } else if (value.kind === "fileTrees") {
      this.fileTrees = validateFileTreeProfile(value.profile);
    } else if (value.kind === "environment") {
      this.environment = { currentWork: value.currentWork, credentialReady: value.credentialReady,
        credentialGeneration: value.credentialGeneration ?? this.environment.credentialGeneration ?? 1,
        sourceReadable: value.sourceReadable ?? this.environment.sourceReadable ?? true };
      this.core.configureCredentials(this.environment.credentialReady, this.environment.credentialGeneration ?? 1);
      this.revalidateEnvironment();
    } else if (value.kind === "outputProfile") {
      this.outputProfile = { outcome: value.outcome, delayMs: value.delayMs, leaseMs: value.leaseMs };
    } else if (value.kind === "jevProfile") {
      this.jevDelay = value.delayMs;
      if (value.outcome !== undefined) this.outcome = value.outcome;
      if (value.outcomeWeights !== undefined) { this.outcome = undefined; this.outcomeWeights = validateOutcomeWeights(value.outcomeWeights); }
    } else if (value.kind === "editDuration") {
      if (!this.generators.size) throw new Error("edit duration requires a session generator");
      for (const scope of this.scopes) if (value.agent === undefined || value.agent === scope.agent) this.core.workloadControl(scope.partition, scope.agent, value);
    } else if (this.generators.size) {
      for (const scope of this.scopes) {
        if (value.agent !== undefined && value.agent !== scope.agent) continue;
        for (const input of this.generators.get(scope.partition)!.apply(value, this.clock)) this.enqueue(input);
      }
    } else throw new Error(`unsupported control: ${value.kind}`);
    const record = {
      control: value,
      time: this.clock,
      sequence: this.timelineOrder++,
      checkpointSequence: this.checkpointOrder++,
      boundary: this.count,
      queueTakes: this.takes,
    };
    this.controls.push(record);
    return copy(record);
  }
  private credentialGenerationMatches(operation: number): boolean {
    // Explicit raw review fixtures have no simulated backend issuance. Preserve
    // their documented initial-generation assumption without claiming capture.
    return this.core.capturedCredential(operation) === undefined
      ? (this.environment.credentialGeneration ?? 1) === 1
      : this.core.credentialMatches(operation);
  }
  private revalidateEnvironment() {
      const context = this.driverContext({ kind: "finalCandidateCheck", ownerCurrent: true, credentialGeneration: true,
        credentialAuthorized: this.environment.credentialReady, expired: false, workCurrent: this.environment.currentWork, hasFindings: true },
        { at: this.clock, order: 0, input: { at: this.clock, kind: "finish" } }, "clear");
      context.background = this.generators.size > 0;
      for (const action of decodeDriver({ handled: true, actions: this.core.revalidate(context) }).actions) {
        const partition = action.candidate?.partition ?? this.inputPartition({ at: this.clock, order: 0, input: { at: this.clock, kind: "canonical", event: action.event } });
        this.event(partition, action.event, action.delay, undefined, action.expiryAdvice, "environment", undefined, action);
        if (action.candidate) {
          const scheduled = this.scheduled.get(this.order - 1);
          if (!scheduled) throw new Error("shared driver action lost source facts");
          scheduled.candidate = action.candidate;
        }
      }
  }
  private driverContext(event: CanonicalEvent, item: Scheduled, outcome: JevRequestOutcome, job?: Extract<RunInput, { kind: "edit" }>) {
    const partition = this.inputPartition(item);
    const binding = "round" in event && "partition" in event && "lifetime" in event ? event : { partition: partition, lifetime: 1, round: 0 };
    const automaticReview = !(this.config.lifecycles?.cancellation === "suppressed") && (!!this.config.lifecycles?.reuse || !(job && "revisionSubject" in job && job.revisionSubject !== undefined));
    const automaticCollection = !this.config.lifecycles?.collectors && !this.hasFinish(partition);
    const automaticOutput = this.candidateOutputBytes === undefined && this.outputProfile.outcome !== "failed" && this.outputProfile.delayMs < this.outputProfile.leaseMs;
    const c = item.candidate;
    return { $: "Driver.Context", partition: binding.partition, lifetime: binding.lifetime, round: binding.round,
      bytes: job?.bytes ?? 0, job: !!job, jev_delay: this.jevDelay, outcome: encodeDriverOutcome(outcome),
      current_work: this.environment.currentWork, credential_ready: this.environment.credentialReady,
      credential_generation: this.credentialGenerationMatches(c?.advice ?? ("advice" in event ? event.advice : 0)),
      source_readable: this.environment.sourceReadable ?? true, advice_lifetime: this.config.adviceLifetime ?? 600000,
      candidate: c ? { $: "Some", value: { $: "Driver.Candidate", partition: c.partition, advice: c.advice, round: c.round,
        token: c.token, surface: { $: `Handoff.${c.surface[0]!.toUpperCase()}${c.surface.slice(1)}` }, selection: c.selection ?? false } } : { $: "None" },
      automatic_collection: automaticCollection, automatic_review: automaticReview, automatic_output: automaticOutput,
      output_certain: this.outputProfile.outcome === "certain", output_delay: this.outputProfile.delayMs, output_lease: this.outputProfile.leaseMs, background: this.generators.has(partition), automatic_dispatch: true };
  }
  private drive(event: CanonicalEvent, command: CanonicalCommand, index: number, item: Scheduled) {
    const partition = this.core.commandScope(index, this.inputPartition(item));
    const job = ("operation" in command ? this.jobs.get(command.operation) : undefined)
      ?? (partition === this.inputPartition(item) ? item.job : undefined);
    const sampling = command.kind === "jevRequestIssued" && this.config.lifecycles?.cancellation !== "suppressed" && (!!this.config.lifecycles?.reuse || !(job && "revisionSubject" in job && job.revisionSubject !== undefined));
    const outcome = job?.outcome ?? this.outcome ?? (sampling ? this.core.sample(this.outcomeWeights) : "clear");
    const scoped = { ...item, partition: partition ?? 0 };
    const context = this.driverContext(event, scoped, outcome, job);
    if (partition !== undefined) { context.partition = partition; context.background = this.generators.has(partition); }
    const collector = this.core.collectorHandle(index,context);
    const stop = this.core.stopHandle(index, context, { now: this.clock, profile: this.outputProfile,
      ...(this.candidateOutputBytes === undefined ? {} : { bytes: this.candidateOutputBytes }),
      ...(item.fitFinish === undefined ? {} : { fitAttempt: item.fitFinish }) });
    const ordinary = collector.handled ? { handled: false, actions: [] } : decodeDriver(item.responseOrigin
      ? this.core.responseHandle(event,index,context,item.responseOrigin.target) : this.core.handle(event, index, context));
    const handled = { handled: collector.handled || ordinary.handled || stop.handled,
      actions: [...collector.actions, ...ordinary.actions, ...stop.actions] };
    if (!handled.handled) return { handled: false, outcome: undefined };
    if (stop.ended) this.queue = this.queue.filter(queued =>
      queued.finishAttempt !== stop.ended!.finish.attempt || queued.partition !== stop.ended!.finish.partition);
    for (const action of handled.actions) {
      const owner = action.candidate?.partition ?? this.core.eventScope(action.event, partition);
      const output = stop.output && stop.output.profile.outcome !== "failed" && action.event.kind === "finishTerminal"
        ? stop.output : (command.kind === "submissionAuthorized" || (command.kind === "submissionBegun" && event.kind === "submissionBegin" && event.authorizeNow))
        && (action.event.kind === "submissionTerminal" || action.event.kind === "submissionExpiryCheck")
        ? { attempt: { kind: "individual" as const, advice: action.event.advice, token: action.event.token }, started: this.clock, profile: { ...this.outputProfile } } : undefined;
      const provenance = command.kind === "submissionExpired" ? "canonicalFeedback" : "environment";
      this.event(owner ?? 0, action.event, action.delay, action.job ? job : undefined, action.expiryAdvice, provenance, output, action, context);
      if (job) {
        const scheduled = this.scheduled.get(this.order - 1);
        if (!scheduled) throw new Error("shared driver action lost original source job");
        scheduled.driverSourceJob = freezeCanonicalData(copy({ partition: context.partition, lifetime: context.lifetime,
          bytes: job.bytes, units: job.unitBytes, outcome: context.outcome }));
      }
      if (item.responseOrigin && action.event.kind !== "submissionTerminal" && action.event.kind !== "submissionExpiryCheck"
        && action.event.kind !== "collectionLeaseCheck" && action.event.kind !== "collectionReleaseLease") {
        const scheduled = this.scheduled.get(this.order - 1);
        if (!scheduled) throw new Error("response action lost its original capture");
        scheduled.responseOrigin = item.responseOrigin;
      }
      if (stop.fitAttempt !== undefined && action.event.kind === "collectionFitCheck") {
        const scheduled = this.scheduled.get(this.order - 1);
        if (!scheduled) throw new Error("Stop fit action lost original attempt");
        scheduled.fitFinish = stop.fitAttempt;
      }
      if (stop.ended && action.event.kind === "collectionRetireAdvice") {
        const advice = action.event.advice;
        this.queue = this.queue.filter(queued => queued.expiryAdvice !== advice);
        this.jobs.delete(advice);
      }
      if (action.candidate) {
        const scheduled = this.scheduled.get(this.order - 1);
        if (!scheduled) throw new Error("shared driver action lost source facts");
        scheduled.candidate = action.candidate;
      }
    }
    if (stop.ended?.finish.recurring) {
      const session = this.generators.get(stop.ended.finish.partition);
      if (session) for (const input of session.onFinish(this.clock,stop.ended.continuation)) this.enqueue(input);
    }
    return { handled: true, outcome };
  }
  private expireResponsesAtClock() {
    const changed = this.core.responseExpire(this.clock);
    this.enqueueResponseActions(changed.actions,undefined,0);
  }
  step(untilTime?: number): Observation | undefined {
    const target = this.progressDriver?.target();
    if (target) untilTime = Math.min(untilTime ?? target.now, target.now);
    if (
      untilTime !== undefined &&
      this.queue[0] &&
      this.queue[0].at > untilTime
    )
      return;
    if (!this.canonicalAllowed && ["canonical", "preparationGraph"].includes(this.queue[0]?.input.kind ?? "")) {
      const head = this.queue[0];
      // A refused original writer fact advances physical queue time without
      // a Canonical observation. Replay must consume that same head before
      // its viewing endpoint fence; an eligible event remains blocked.
      if (head?.input.kind === "canonical" && (
        (head.responseOrigin?.control.kind === "backgroundWriter"
          && !this.core.responseValid(head.responseOrigin.target,head.at,head.input.event))
        || (head.writerRelease && !this.core.writerReleaseValid(head.writerRelease,head.at)))) {
        const consumed = this.queueShift();
        if (consumed?.order !== head.order) throw new Error("quiet writer replay lost its queue head");
        this.expireResponsesAtClock();
        if (consumed.writerRelease && this.core.writerReleaseDelivery(consumed.writerRelease,this.clock))
          throw new Error("quiet original writer release became eligible");
        return this.step(untilTime);
      }
      return;
    }
    const head = this.queue[0];
    if (head?.input.kind === "canonical" && head.input.event.kind === "preparationCompleted") {
      if (target && this.count >= target.eventCount) return;
      const owner = this.inputPartition(head);
      const structuralBefore = this.structuralBefore();
      const original = structuralBefore ? copy(head) : head;
      const prepared = this.core.preprocessSharing(head.input.event, owner, head.order, untilTime);
      if (prepared.frame) {
        for (const followup of readBendList(prepared.events, decodeDriverEvent, 2048)) this.event(owner, followup);
        const frame = prepared.frame;
        const observation: Observation = { sequence: this.count++, time: this.clock, event: decodeDriverEvent(frame.event),
          commands: frame.result.commands, commandScopes: frame.commandScopes, before: frame.before, after: frame.after,
          ...(frame.result.rejection ? { rejection: frame.result.rejection } : {}), effects: [], capacityMetadata: this.capacityMetadata,
          ...(owner === 0 ? {} : { partition: owner, agent: this.agentName(owner) }) };
        this.structuralRecord(structuralBefore,() => ({ kind: "sharing", scheduled: original, observation,
          transition: this.core.transitionSnapshot() }));
        return this.record(observation);
      }
    }
    const item = this.queueShift();
    if (!item) return;
    const partition = this.inputPartition(item);
    this.expireResponsesAtClock();
    if (item.writerRelease && item.input.kind === "canonical") {
      const event = this.core.writerReleaseDelivery(item.writerRelease,this.clock);
      if (!event) return this.step(untilTime);
      item.input = { ...item.input,event };
    }
    if (item.writerOrigin && item.input.kind === "canonical") {
      item.input = { ...item.input, event: this.core.writerClaim(item.writerOrigin.pending,this.clock) };
    }
    if (item.responseOrigin && item.input.kind === "canonical" && !this.core.responseValid(item.responseOrigin.target,this.clock,item.input.event)) {
      // Writer controls record original Gating admission and actual grant /
      // release frames. A pre-Canonical quiet drop adds no delayed report.
      if (item.responseOrigin.control.kind === "collectionResponse") this.collectionResponseReports.push({ at: this.clock, controlSequence: item.responseOrigin.sequence,
        control: item.responseOrigin.control, result: "missing" });
      return this.step(untilTime);
    }
    const session = this.generators.get(partition);
    if (item.activityScope !== undefined && (item.input.kind === "canonical" ? item.generated && !this.core.activityEventValid(item.input.event, partition, item.activityScope) : item.input.kind !== "preparationGraph" && !this.core.activityValid(partition, item.activityScope))) {
      return this.step(untilTime);
    }
    const emit = (event: CanonicalEvent, delay = 0, job?: Extract<RunInput, { kind: "edit" }>, expiryAdvice?: number, capture?: OutputCapture) => this.event(partition, event, delay, job, expiryAdvice, "environment", capture);
    const emitDriver = (action: DriverAction, sourceJob?: Extract<RunInput, { kind: "edit" }>) => {
      const outcome = sourceJob?.outcome ?? this.outcome;
      const context = outcome === undefined ? undefined : this.driverContext(action.event, item, outcome, sourceJob);
      this.event(partition, action.event, action.delay, action.job ? sourceJob : undefined,
        action.expiryAdvice, "environment", undefined, action, context);
      if (sourceJob && context) {
        const scheduled = this.scheduled.get(this.order - 1);
        if (!scheduled) throw new Error("shared Driver emission lost original source job");
        scheduled.driverSourceJob = freezeCanonicalData(copy({ partition: context.partition, lifetime: context.lifetime,
          bytes: sourceJob.bytes, units: sourceJob.unitBytes, outcome: context.outcome }));
      }
    };
    const emitInitialOutput = (capture: OutputCapture, terminalOnly = false) => {
      const actions = initialOutputActions(capture, terminalOnly);
      for (const action of actions) {
        const completion = capture.profile.outcome !== "failed" &&
          ["submissionTerminal", "submissionExpiryCheck", "finishTerminal"].includes(action.event.kind) ? capture : undefined;
        emit(action.event, action.delay, undefined, action.expiryAdvice, completion);
      }
    };
    if (item.input.kind === "preparationGraph") {
      const event = item.input.event;
      const before = this.projection;
      if (!this.core.preparationActive(event)) {
        return this.step(untilTime);
      }
      const structuralBefore = this.structuralBefore();
      const preparation = this.core.graphStep(event);
      const observation: Observation = { sequence: this.count++, time: this.clock, event,
        preparation, before, after: before, commands: [], effects: [], capacityMetadata: this.capacityMetadata, ...(partition === 0 ? {} : { partition, agent: this.agentName(partition) }) };
      this.structuralRecord(structuralBefore,() => ({ kind: "preparation", scheduled: item, observation,
        transition: this.core.transitionSnapshot() }));
      return this.record(observation);
    }
    if (session && !session.valid(item.input))
      return this.step(untilTime);
    if (
      item.finishAttempt !== undefined &&
      item.finishAttempt !== this.core.stopFind(partition)?.attempt
    )
      return this.step(untilTime);
    if (item.input.kind !== "canonical") {
      if (
        "recurring" in item.input &&
        item.input.recurring &&
        item.input.kind !== "finish" &&
        session
      )
        for (const input of session.next(this.clock)) this.enqueue(input);
      if (item.input.kind === "task") return this.step(untilTime);
      const scope = this.projection.rounds.find((r) => r.partition === partition);
      const round = scope?.id;
      if (item.input.kind === "finish") {
        if (scope && round && !this.core.stopFind(partition)) {
          const structuralBefore = this.structuralBefore();
          const registered = this.core.stopRegister({ partition, lifetime: scope.lifetime, round,
            started: this.clock, cutoff: this.clock + (this.config.finishDeadline ?? 200),
            recurring: "recurring" in item.input && item.input.recurring });
          if (!registered.created || !registered.finish) throw new Error("original Stop registration refused");
          this.pollFinish(partition);
          this.pollFinish(partition, this.config.finishDeadline ?? 200);
          this.structuralRecord(structuralBefore,() => ({ kind: "finishRegistration", scheduled: item, registration: registered }));
        } else if (
          !round &&
          "recurring" in item.input &&
          item.input.recurring &&
          session
        )
          for (const input of session.next(this.clock))
            this.enqueue(input);
        return this.step(untilTime);
      }
      const permits = this.permitsEnabled;
      if (!round && !permits) {
        const plan = readRecord(this.core.activityEdit(partition, item.activityScope ?? 1));
        for (const action of decodeDriver({ handled: true, actions: plan.actions }).actions) emit(action.event, action.delay);
        if (readBool(plan.retry)) this.enqueue({ ...item.input, at: this.clock, ...("recurring" in item.input ? { recurring: false } : {}) }, item.input, undefined, item.activityScope);
        return this.step(untilTime);
      }
      if (this.config.lifecycles?.reuse && "revision" in item.input && !("evaluationInputs" in item.input)) {
        // Source-free generated prepared fixture: pairs share every evaluation fact;
        // the next pair changes the input, and partitions remain isolated.
        const fixture = Math.floor(Math.max(0, item.input.revision - 1) / 2) % 2;
        item.input = { ...item.input, evaluationInputs: item.input.unitBytes.map((bytes, unit) => JSON.stringify({ fixture, unit, prepared: { bytes, rules: "synthetic-noul", tree: { fixture, seed: this.config.seed, profile: this.fileTrees, limits: this.graphLimits } } })), evaluationTreeIdentity: fixture + 1, evaluationTreeProfile: copy(this.fileTrees), evaluationGraphLimits: copy(this.graphLimits), revisionSubject: "generated-root", revisionInput: JSON.stringify({ fixture, bytes: item.input.bytes, unitBytes: item.input.unitBytes, seed: this.config.seed, profile: this.fileTrees, limits: this.graphLimits }) } as Extract<RunInput, { kind: "edit" }>;
      }
      if ("evaluationInputs" in item.input && item.input.evaluationInputs) {
        if (item.input.evaluationInputs.length !== item.input.unitBytes.length || item.input.evaluationInputs.some(input => typeof input !== "string" || !input.length)) throw new TypeError("evaluationInputs must identify every prepared review unit");
      }
      if ("evaluationIdentityFacts" in item.input && item.input.evaluationIdentityFacts !== undefined) {
        if (item.input.evaluationIdentityFacts.length !== item.input.unitBytes.length) throw new TypeError("evaluationIdentityFacts must capture every prepared review unit");
        item.input = { ...item.input, evaluationIdentityFacts: Object.freeze(item.input.evaluationIdentityFacts.map(captureSharingIdentityFacts)) };
      }
      if (this.config.lifecycles?.reuse && "evaluationInputs" in item.input && item.input.evaluationInputs && !("revisionSubject" in item.input && item.input.revisionSubject !== undefined)) {
        // A source-free standalone input explicitly supplies its complete
        // prepared identities; this is an edge label, never a work-cohort id.
        item.input = { ...item.input, revisionSubject: "standalone-prepared-root", revisionInput: JSON.stringify(item.input.evaluationInputs) };
      }
      if ("revisionSubject" in item.input && item.input.revisionSubject !== undefined && item.input.revisionInput === undefined) throw new TypeError("revisionInput required with revisionSubject");
      if (permits) {
        const timing = this.core.preTiming(partition, item.input.editDurationMs, this.permitProfile.durationMs, this.permitProfile.lifetimeMs);
        item.input = { ...item.input, editDurationMs: timing.duration };
        const tool = "tool" in item.input && item.input.tool !== undefined ? item.input.tool : this.nextTool++;
        const lifetime = this.core.activityLifetime(partition);
        const capture = encodePermitCapture({ partition, lifetime, tool, started: timing.started, deadline: timing.deadline,
          postDelay: timing.duration, outcome: this.permitProfile.outcome, limits: this.permitLimits });
        emit(decodeDriverEvent(this.core.issuePermit(capture, timing.started)), timing.started - this.clock, item.input);
        const issued = this.scheduled.get(this.order - 1);
        if (!issued) throw new Error("PRE capture lost its scheduled source facts");
        issued.permitCapture = { capture, started: timing.started };
      } else {
        const plan = readRecord(this.core.activityEdit(partition, item.activityScope ?? 1));
        for (const action of decodeDriver({ handled: true, actions: plan.actions }).actions) emit(action.event, action.delay, item.input);
      }
      return this.step(untilTime);
    }
    let event = item.input.event;
    if (item.generated && ["jevRequestSettled", "jevRequestReady", "finalCandidateCheck"].includes(event.kind)) {
      const context = this.driverContext(event, item, "clear");
      event = decodeDriverEvent(this.core.fence(event, true, context));
    }
    if (event.kind === "cachePrepare" || event.kind === "cacheCommit") Object.assign(this.metadata, { reuse: { entryLimit: event.entryLimit, byteLimit: event.byteLimit } });
    if (event.kind === "noticeAdvance" || event.kind === "noticeCommit") Object.assign(this.metadata, { notices: { maximumKeys: event.maximumKeys } });
    if (event.kind === "collectionFitCheck") Object.assign(this.metadata, { encodedOutput: { bytes: event.bytes, items: event.items, maximumBytes: 10240, synthetic: true } });
    if (event.kind === "issuePermit") {
      const configured = this.metadata.permits?.adviceeLimit;
      const partition = event.partition;
      const adviceeLimits = [...(this.metadata.permits?.adviceeLimits ?? []).filter(scope => scope.partition !== partition), { partition, limit: event.facts.adviceePermitLimit }].sort((a, b) => a.partition - b.partition);
      Object.assign(this.metadata, { permits: { ...(configured === undefined ? {} : { adviceeLimit: configured }), residentLimit: event.facts.residentPermitLimit, adviceeLimits } });
    }
    if (event.kind === "collectionClaimBackground") Object.assign(this.metadata, { collectors: { capacity: event.capacity } });
    const before = this.projection;
    if (item.generated && event.kind === "quietRoundTick")
      event = this.core.quietEvent(event,this.quietNativeIdle(event.partition),!this.hasFinish(event.partition));
    // Callback identity is checked against issued work, before the product's stale-result fence.
    const completionEvent = event;
    if (
      completionEvent.kind === "jevRequestSettled" &&
      !(item.callbackReceipt && this.callbackFacts.has(item.callbackReceipt)) &&
      ![...this.issuedRequests.values()].some(
        (r) =>
          r.request === completionEvent.request &&
          r.operation === completionEvent.operation &&
          r.partition === completionEvent.partition &&
          r.lifetime === completionEvent.lifetime &&
          r.round === completionEvent.round,
      )
    )
      throw new Error("mismatched completion identity");
    if (event.kind === "preparationCompleted") {
      const completion = readRecord(this.core.completeSharing(event));
      if (!readBool(completion.ready)) throw new Error("unresolved shared preparation route");
      event = decodeDriverEvent(completion.event);
    }
    const structuralBefore = this.structuralBefore();
    const result = this.core.step(event, item.cacheFact);
    for (const release of result.writerReleases) {
      this.event(partition,release.event);
      this.scheduled.get(this.order-1)!.writerRelease=release.receipt;
    }
    const cachePublished = this.config.lifecycles?.reuse && event.kind === "jevRequestSettled"
      ? this.core.beginCache(event) : undefined;
    for (const fact of [...result.cacheFacts, ...(cachePublished?.facts ?? [])]) {
      this.event(fact.partition, fact.event);
      const scheduled = this.scheduled.get(this.order - 1);
      if (!scheduled) throw new Error("cache fact lost its original scheduled context");
      scheduled.cacheFact = fact;
    }
    for (const release of [...result.cacheReleases, ...(cachePublished?.releases ?? [])]) emit(release);
    if (event.kind === "collectionFitCheck") {
      const command = result.commands.find(c => c.kind === "collectionFits" || c.kind === "collectionLimited");
      if (command) Object.assign(this.metadata, { encodedOutput: { ...this.metadata.encodedOutput!, decision: command.kind === "collectionFits" ? "fits" : "limited" } });
    }
    if (item.noticeScope) for (const followup of this.core.noticeAfter(item.noticeScope,event,this.clock,encodeExpiryProfile(this.expiryProfile))) {
      emit(decodeDriverEvent(followup));
      this.scheduled.get(this.order - 1)!.noticeScope = item.noticeScope;
    }
    const effects: EffectObservation[] = [];
    const scope =
      "round" in event && "partition" in event && "lifetime" in event
        ? {
            partition: event.partition,
            lifetime: event.lifetime,
            round: event.round,
          }
        : undefined;
    for (const [commandIndex, command] of result.commands.entries()) {
      const driver = this.drive(event, command, commandIndex, item);
      const driven = driver.handled;
      const finish = this.core.stopFind(partition);
      switch (command.kind) {
        case "permitIssued": {
          if (event.kind !== "issuePermit" || !item.job) break;
          const pending = item.permitCapture;
          if (!pending) throw new Error("issued permit lacks its original PRE capture");
          for (const fact of decodePermitFacts(this.core.issuedPermit(pending.capture, command.token)))
            emit(fact.event, Math.max(0, pending.started + fact.delay - this.clock), fact.job ? item.job : undefined);
          break;
        }
        case "permitConsumed":
          if (event.kind === "consumePermit" && item.job) {
            for (const fact of decodePermitFacts(this.core.consumedPermit(commandIndex, event.partition, event.lifetime)))
              emit(fact.event, fact.delay, fact.job ? item.job : undefined);
          }
          break;
        case "quietRoundExpired":
        case "quietRoundWaiting":
          for (const action of this.core.quietCommand(event,commandIndex,partition,this.clock)) emit(action.event,action.delay);
          break;
        case "observationAdmitted": {
          if (!scope || !item.job)
            throw new Error("unhandled required command: observationAdmitted");
          this.jobs.set(command.id, item.job);
          if (this.config.lifecycles?.quietWindowMs)
            for (const action of this.core.quietCommand(event,commandIndex,partition,this.clock)) emit(action.event,action.delay);
          if ("revisionSubject" in item.job && item.job.revisionSubject !== undefined) {
            const actions = this.core.admitFreshness({ ...scope, operation: command.id }, {
              subject: this.identity(JSON.stringify(["revision-subject-label", item.job.revisionSubject])),
              input: this.identity(JSON.stringify(["revision-input-label", item.job.revisionInput])),
            }, commandIndex, !!this.config.lifecycles?.reuse);
            for (const action of decodeDriver({ handled: true, actions }).actions) emit(action.event, action.delay);
          }
          if (!driven) throw new Error("unhandled shared observation dispatch");
          break;
        }

        case "dispatchStarted": {
          const work = this.projection.work.find(work => work.operation === command.operation);
          const job = this.jobs.get(command.operation);
          if (!work || !job || !["awaitingSourceRead", "reviewing"].includes(work.kind))
            throw new Error("unhandled required command: dispatchStarted lacks synthetic source job");
          if (!driven) throw new Error("unhandled shared source/review dispatch");
          break;
        }
        case "preparationRefused": {
          if (event.kind === "beginObservedPreparation") {
            if (!driven) throw new Error("unhandled shared preparation refusal");
            this.jobs.delete(event.observation);
          }
          break;
        }
        case "prepare": {
          if (!scope || !item.job)
            throw new Error(
              "unhandled required command: prepare lacks synthetic job",
            );
          this.jobs.set(command.operation, item.job);
          effects.push({
            kind: "preparation",
            phase: "started",
            operation: command.operation,
            due: this.clock + (this.config.preparationDelay ?? 2),
          });
          const preparingJob = item.job;
          if (this.config.lifecycles?.reuse && "evaluationInputs" in preparingJob && preparingJob.evaluationInputs) {
            const keys = preparingJob.evaluationInputs.map((preparedIdentity, unit) => {
              const original = "evaluationIdentityFacts" in preparingJob ? preparingJob.evaluationIdentityFacts?.[unit] : undefined;
              // No WorkCohort/dispatch credential property exists on a
              // standalone synthetic input. Authenticated callers supply its
              // immutable original facts explicitly; provider mode is unused.
              const facts = original ?? { partition: this.agentName(scope.partition), workId: null, credentialGeneration: null, preparedIdentity };
              return encodeSharingKey({ partition: scope.partition, prepared: this.identity(sharingIdentityLabel(facts)) });
            });
            const capture = this.core.prepareSharing({ $: "FreshnessScenario.Scope", ...scope, operation: command.operation }, keys, preparingJob.unitBytes);
            if (!readBool(capture.valid)) throw new Error("missing original admitted sharing source");
          }

          const facts = preparingJob.unitBytes.flatMap((_bytes, unit) => {
            const tree = generateFileTree(this.config.seed!, "evaluationTreeIdentity" in preparingJob && preparingJob.evaluationTreeIdentity !== undefined ? preparingJob.evaluationTreeIdentity : command.operation, unit, "evaluationTreeProfile" in preparingJob && preparingJob.evaluationTreeProfile ? preparingJob.evaluationTreeProfile : this.fileTrees,
              "evaluationGraphLimits" in preparingJob && preparingJob.evaluationGraphLimits ? preparingJob.evaluationGraphLimits : this.graphLimits);
            return tree.facts.map((fact, step): PreparationEvent => ({
              kind: "preparationGraph", example: "generated", ...scope, operation: command.operation, unit, step, fact, graphLimits: tree.limits,
              generatedTree: { targetNames: tree.targetNames, files: tree.files.length, depth: tree.depth, rootEligible: tree.rootEligible, closureEligible: tree.closureEligible },
            }));
          });
          facts.forEach((preparation, index) => {
            // Inner facts share the operation's virtual interval, including zero-delay cases.
            const at = this.clock + this.core.preparationFactTime(this.config.preparationDelay ?? 2, index, facts.length);
            this.queuePush({ at, order: this.order++, input: { kind: "preparationGraph", at, event: preparation }, generated: true, partition: scope.partition });
          });
          const completion = decodeDriver({ handled: true, actions: { $: "Con", head: this.core.preparationCompleted({ ...scope, operation: command.operation }, item.job.unitBytes, this.config.preparationDelay ?? 2), tail: { $: "Nil" } } }).actions[0];
          if (!completion) throw new Error("missing preparation completion action");
          emitDriver(completion, item.job);
          break;
        }
        case "unitAdmitted": {
          if (!scope || !item.job)
            throw new Error(
              "unhandled required command: unitAdmitted lacks job",
            );
          this.jobs.set(command.operation, item.job);
          if (!driven) throw new Error("unhandled shared review unit dispatch");
          break;
        }
        case "revisionReused":
        case "revisionReplaced":
          break;
        case "revisionStale":
        case "revisionCurrent":
        case "reuseOwn":
        case "reuseJoinAdvice":
        case "reuseJoinPending":
        case "reuseJoinClaimed":
        case "reuseReleased":
        case "reuseCached":
          break;
        case "cacheDiscarded":
        case "cachePrepared":
        case "cacheRejected":
        case "capacityRefused":
        case "capacityGranted":
        case "cacheCommitted":
          break;
        case "jevRequestIssued": {
          this.issuedRequests.set(command.request, command);
          const { kind: _kind, ...binding } = command;
          const job = this.jobs.get(command.operation);
          const selectedOutcome = driver.outcome ?? job?.outcome ?? this.outcome ?? this.core.sample(this.outcomeWeights);
          if (selectedOutcome !== "neverSent") effects.push({
            kind: "jev",
            phase: "started",
            operation: command.operation,
            request: command.request,
            due: this.clock + this.jevDelay,
          });
          if (driven) break;
          // Synthetic outcomes supply the same lifecycle facts required by native callbacks.
          if (selectedOutcome !== "neverSent") emit({ kind: "jevRequestStarted", ...binding });
          if (selectedOutcome === "interrupted" && this.config.lifecycles?.cancellation === "suppressed") {
            emit({ kind: "jevRequestInterrupted", ...binding }, this.jevDelay);
            emit({ kind: "jevRequestSettled", ...binding, outcome: "interrupted", currentWork: false }, this.jevDelay);
            break;
          }
          if (selectedOutcome === "interrupted") emit({ kind: "jevRequestInterrupted", ...binding }, this.jevDelay);
          for (const check of decodeDriver({ handled: true, actions: this.core.freshnessChecks(binding) }).actions) {
            emit(check.event, this.jevDelay);
          }
          emit(
            {
              kind: "jevRequestSettled",
              ...binding,
              outcome: selectedOutcome,
              currentWork: true,
            },
            this.jevDelay,
          );
          break;
        }
        case "retainFinding": {
          if (!scope || !("operation" in event))
            throw new Error("unhandled required command: retainFinding");
          const advice = event.operation;
          const work = this.projection.work.find((entry) => entry.operation === advice);
          if (!work || work.parent === 0) throw new Error("retained finding lacks its edit observation");
          effects.push({ kind: "advice", phase: "supplied", advice });
          if (!driven) throw new Error("unhandled shared finding retention");
          break;
        }
        case "collectionEligible":
        case "collectionBackgroundClaimed":
        case "collectionBackgroundReleased":
          // The actual accepted command already ran through the shared owner.
          break;
        case "submissionBegun":
          if (event.kind === "submissionBegin" && this.outputProfile.outcome === "failed") {
            emitInitialOutput({ attempt: { kind: "individual", advice: event.advice, token: event.token },
              started: this.clock, profile: { ...this.outputProfile } });
            break;
          }
          if (event.kind !== "submissionBegin" || !event.authorizeNow) break;
        case "submissionAuthorized": {
          if (
            event.kind !== "submissionBegin" &&
            event.kind !== "submissionAuthorize"
          )
            throw new Error("unhandled required command: submissionAuthorized");
          effects.push({
            kind: "output",
            phase: "started",
            advices: [event.advice],
          });
          const profile = this.outputProfile;
          const capture: OutputCapture = { attempt: { kind: "individual", advice: event.advice, token: event.token }, started: this.clock, profile: { ...profile } };
          if (driven) break;
          emitInitialOutput(capture);
          if (profile.outcome === "failed" && finish && event.token === finish.token)
            emitInitialOutput({ attempt: { kind: "finish", group: partition, round: finish.round,
              attempt: finish.attempt, token: event.token, selected: [...finish.selected] },
              started: this.clock, profile: { ...profile } }, true);
          break;
        }
        case "retainCandidate":
        case "continueCandidate": {
          if (driven) break;
          if (item.candidate) {
            this.candidateEvent({ kind: "submissionSuppressCheck", advice: item.candidate.advice,
              fingerprint: item.candidate.advice, round: item.candidate.round, surface: item.candidate.surface }, item.candidate);
          }
          break;
        }
        case "submissionExpired":
          if (!driven) throw new Error("unhandled shared output expiry feedback");
          break;
        case "submissionUnsuppressed":
          if (driven) break;
          if (item.candidate && !item.candidate.selection && this.candidateOutputBytes !== undefined) {
            this.candidateEvent({ kind: "collectionFitCheck", items: 1, bytes: this.candidateOutputBytes! }, item.candidate);
            break;
          }
        case "collectionFits": {
          if (driven) break;
          if (item.candidate) {
            const c = item.candidate;
            {
              emit({ kind: "collectionReserveLease", advice: c.advice, token: c.token });
              emit({ kind: "submissionBegin", advice: c.advice, group: c.partition, round: c.round,
                token: c.token, surface: c.surface, authorizeNow: c.surface !== "stop" && this.outputProfile.outcome !== "failed",
                fingerprints: [c.advice], units: [c.advice] });
            }
          }
          break;
        }
        case "collectionLimited":
          break;
        case "retireCandidate":
          if (driven && item.candidate) {
            this.queue = this.queue.filter(queued => queued.expiryAdvice !== item.candidate!.advice);
            this.jobs.delete(item.candidate.advice);
          } else if (item.candidate) this.retireAdvice(partition, item.candidate.advice);
        case "releaseCandidate":
        case "ignoreCandidate":
        case "submissionSuppresses":
          break;
        case "jevRequestUnavailable":
          if (event.kind === "jevRequestReady" && before.dispatch.running.some(entry => entry.operation === event.operation)) {
            if (!driven) throw new Error("unhandled shared request refusal");
            this.jobs.delete(event.operation);
          }
          break;
        case "collectionExpired": {
          const advice = item.expiryAdvice;
          if (advice === undefined) break;
          this.retireAdvice(partition, advice);
          break;
        }
        case "waitForWork":
        case "waitForOutput":
        case "finishReady":
        case "finishLimit":
        case "roundContinuationAvailable":
        case "roundContinuationExhausted":
        case "finishAllowedNoAdvice":
        case "finishAllowedDeadline":
        case "finishAllowedUnavailable":
        case "finishReserved":
        case "finishRecorded":
        case "finishReleased":
        case "finishEnded":
        case "finishRefused":
          if (finish && !driven) throw new Error("unhandled original Stop command");
          break;
        case "finishAuthorized":
          if (!finish || !driven) throw new Error("unhandled original Finish authorization");
          effects.push({ kind: "output", phase: "started", advices: [...finish.selected] });
          break;
        case "cancelWork":
          effects.push({
            kind: "cancellation",
            phase: "supplied",
            operation: command.operation,
          });
          break;
      }
    }
    for (const action of decodeDriver({ handled: true, actions: result.afterActions }).actions)
      emitDriver(action, item.job);
    if (event.kind === "preparationCompleted" && item.job) {
      const parent = before.work.find(w => w.operation === event.operation)?.parent;
      if (parent) this.jobs.delete(parent);
    }
    if (["preparationCompleted", "jevRequestSettled", "submissionTerminal", "collectionReleaseLease"].includes(event.kind)) {
      for (const finish of this.core.stopEntries())
        if (finish.waiting) this.pollFinish(finish.partition);
    }
    if (!result.rejection && session && (
      event.kind === "submissionTerminal" && result.commands.some((c) => c.kind === "submissionRecorded") ||
      event.kind === "finishTerminal" && event.outcome === "acknowledged" &&
        result.commands.some((c) => c.kind === "finishRecorded")))
      for (const input of session.onAdvice(this.clock))
        this.enqueue(input);
    if (event.kind === "reviewObserved" || event.kind === "reviewCompleted" || event.kind === "retireReview") {
      if (!this.projection.pendingFindings.some(f => f.operation === event.operation)) this.jobs.delete(event.operation);
    }
    if (event.kind === "preparationCompleted") {
      this.jobs.delete(event.operation);
      effects.push({
        kind: "preparation",
        phase: "supplied",
        operation: event.operation,
      });
    }
    if (event.kind === "jevRequestSettled") {
      this.issuedRequests.delete(event.request);
      if (!this.projection.pendingFindings.some(finding => finding.operation === event.operation))
        this.jobs.delete(event.operation);
      if (this.config.lifecycles?.cancellation === "suppressed" && event.outcome === "interrupted") effects.push({ kind: "cancellation", phase: "supplied", operation: event.operation });
      else effects.push({
        kind: "jev",
        phase: "supplied",
        operation: event.operation,
        request: event.request,
      });
    }
    for (const action of this.core.collectorAfter())
      this.event(partition,action.event,action.delay);
    if (this.config.lifecycles?.quietWindowMs) {
      const actions=this.core.quietAfter(event,partition,this.clock,this.config.lifecycles.quietWindowMs,
        this.quietNativeIdle(partition),!this.hasFinish(partition));
      for (const action of actions) emit(action.event,action.delay);
    }
    if (item.writerOrigin) {
      const changed = this.core.writerAfter(item.writerOrigin.pending,this.clock);
      this.writerReports.push({ at: this.clock, controlSequence: item.writerOrigin.sequence,
        control: item.writerOrigin.control, result: changed.result,
        ...(changed.issued ? { issued: changed.issued } : {}) });
      for (const release of changed.writerReleases) {
        this.event(partition,release.event,release.delay);
        this.scheduled.get(this.order-1)!.writerRelease=release.receipt;
      }
    }
    if (item.responseOrigin && !result.rejection) {
      const changed = this.core.responseAfter(item.responseOrigin.target);
      this.enqueueResponseActions(changed.actions,item.responseOrigin,partition);
    }
    const observation: Observation = {
      ...(item.callbackReceipt ? { callbackReceipt: item.callbackReceipt } : {}),
      ...(item.noticeDiagnostic ? { noticeDiagnostic: item.noticeDiagnostic } : {}),
      ...(partition === 0 ? {} : { partition, agent: this.agentName(partition) }),
      sequence: this.count++,
      time: this.clock,
      event: copy(event),
      commands: result.commands,
      commandScopes: result.commands.map((_command, index) => this.core.commandScope(index, partition)),
      before,
      after: this.projection,
      ...(item.job && "revision" in item.job
        ? {
            workload: {
              revision: item.job.revision,
              agent: item.job.agent,
              ...(item.job.repair ? { repair: true } : {}),
            },
          }
        : {}),
      ...(result.rejection ? { rejection: result.rejection } : {}),
      effects,
      capacityMetadata: this.capacityMetadata,
    };
    this.structuralRecord(structuralBefore,() => ({ kind: "canonical", scheduled: item, observation,
      transition: this.core.transitionSnapshot(), source: this.core.transitionSourceSnapshot() }));
    return this.record(observation);
  }
  private enqueueResponseActions(actions: unknown, origin: Scheduled["responseOrigin"], fallback: number, writer: Scheduled["writerOrigin"] = undefined): void {
    for (const action of decodeDriver({ handled: true, actions }).actions) {
      const owner = action.candidate?.partition ?? this.core.eventScope(action.event,fallback) ?? fallback;
      this.event(owner,action.event,action.delay,undefined,action.expiryAdvice);
      const item = this.scheduled.get(this.order - 1);
      if (!item) throw new Error("response action lost its issued queue entry");
      if (origin) item.responseOrigin = origin;
      if (writer) item.writerOrigin = writer;
      if (action.candidate) item.candidate = action.candidate;
    }
  }
  private agentName(partition: number): string {
    return this.scopes.find(scope => scope.partition === partition)?.agent ?? `agent-${partition}`;
  }
  private inputPartition(item: Scheduled): number {
    const input = item.input;
    if ("agent" in input) {
      const scope = this.scopes.find(scope => scope.agent === input.agent);
      if (!scope) throw new RangeError("unknown input agent");
      return scope.partition;
    }
    if (input.kind === "preparationGraph") return input.event.partition;
    if (input.kind === "canonical") return this.core.eventScope(input.event, item.partition ?? 1) ?? 0;
    return item.partition ?? 1;
  }
  private record(observation: Observation): Observation {
    const target = this.progressDriver?.target();
    if (target && this.count > target.eventCount)
      throw new Error("overshot replay observation boundary");
    const live = new Set(this.core.callbackOriginals.map(original => decodeCallbackTarget(readRecord(original.fact).target).originalOrder));
    for (const order of this.callbackPayloads.keys()) if (!live.has(order)) this.callbackPayloads.delete(order);
    freezeCanonicalData(observation);
    this.history.push(observation);
    const retention = this.config.retention ?? 1000;
    if (this.history.length > retention)
      this.history.splice(0, this.history.length - retention);
    for (const listener of this.listeners) listener(observation);
    return observation;
  }
  private hasFinish(partition: number) { return this.core.stopFind(partition) !== undefined; }
  private finishCapture(partition: number, finish: Finish): StopCapture {
    return { partition, lifetime: finish.lifetime, round: finish.round, attempt: finish.attempt,
      token: finish.token, started: finish.started, cutoff: finish.deadline };
  }
  private candidateEvent(event: Extract<CanonicalEvent, { kind: "finalCandidateCheck" | "submissionSuppressCheck" | "collectionFitCheck" }>, candidate: CandidateContext) {
    this.queuePush({ at: this.clock, order: this.order++, generated: true,
      input: { at: this.clock, kind: "canonical", event }, candidate, partition: candidate.partition });
  }
  private retireAdvice(partition: number, advice: number) {
    const retained = this.projection.work.find(work =>
      work.operation === advice && work.kind === "pendingFinding");
    this.queue = this.queue.filter(item => item.expiryAdvice !== advice);
    this.event(partition, { kind: "collectionRetireAdvice", advice });
    this.event(partition, { kind: "submissionForget", advice });
    if (retained) this.event(partition, { kind: "retireReview",
      partition: retained.partition, lifetime: retained.lifetime,
      round: retained.round, operation: advice });
    this.jobs.delete(advice);
  }
  private pollFinish(partition: number, delay = 0) {
    const f = this.core.stopFind(partition);
    if (!f) return;
    const at = this.clock + delay;
    if (this.queue.some(item => item.finishAttempt === f.attempt && item.partition === partition && item.at === at)) return;
    const capture = this.finishCapture(partition,f);
    const facts = wakeStopFacts(capture,at);
    for (const fact of facts) this.queuePush({ at: fact.at, order: this.order++,
      finishAttempt: f.attempt, partition, stopFact: copy(fact), stopCapture: copy(capture),
      input: { at: fact.at, kind: "canonical", event: fact.event } });
  }
  /** Physical job observation only; recorded ownership is measured in Bend. */
  private quietNativeIdle(partition: number) {
    const agent=this.agentName(partition);
    return ![...this.jobs.values()].some(job => (("agent" in job ? job.agent : undefined) ?? this.scopes[0]?.agent ?? "agent-1")===agent);
  }
  /** Original queued facts only; capsule authority remains private. */
  get queuedFacts() {
    return freezeCanonicalData(this.queue.map(item => ({ at: item.at, order: item.order, input: item.input,
      ...(item.responseOrigin ? { response: item.responseOrigin.target } : {}),
      ...(item.writerOrigin ? { writerTrigger: item.writerOrigin.control.capture } : {}),
      ...(item.callbackReceipt ? { callback: item.callbackReceipt.target } : {}) })));
  }
  private normalizeQuietWriterBoundary() {
    if (this.progressDriver?.target()) {
      this.progressDriver.flush();
      return;
    }
    this[replayNormalize]();
  }
  [replayNormalize]() {
    integer(this.checkpointOrder + 1, "replay checkpoint sequence");
    this.normalizations.push({ boundary: this.count, queueTakes: this.takes,
      time: this.clock, checkpointSequence: this.checkpointOrder++ });
    const changed = this.core.responseExpire(this.clock);
    this.enqueueResponseActions(changed.actions,undefined,0);
    // Both live and replay viewing boundaries settle source-owned context
    // closure and consume already-due refused writer facts. Canonical events,
    // physical output and future callback facts retain their original order.
    for (;;) {
      const head = this.queue[0];
      if (!head || head.at > this.clock || head.input.kind !== "canonical"
        || head.responseOrigin?.control.kind !== "backgroundWriter"
        || this.core.responseValid(head.responseOrigin.target,this.clock,head.input.event)) return;
      this.core.cancel(head.order);
      this.scheduled.delete(head.order);
    }
  }
  advance(options: AdvanceOptions = {}) {
    const { untilTime, maxEvents = 1000 } = decodeAdvanceOptions(options);
    integer(maxEvents, "event limit");
    if (untilTime !== undefined) {
      integer(untilTime, "time limit");
      if (untilTime < this.clock)
        throw new RangeError("time limit precedes current time");
    }
    let events = 0;
    while (events < maxEvents && this.queue.length) {
      if (untilTime !== undefined && this.queue[0]!.at > untilTime) {
        this.normalizeQuietWriterBoundary();
        return { reason: "timeLimit" as const, events, now: this.clock };
      }
      if (this.step(untilTime)) events++;
      else if (this.queue.length) {
        this.normalizeQuietWriterBoundary();
        return { reason: "timeLimit" as const, events, now: this.clock };
      }
    }
    this.normalizeQuietWriterBoundary();
    return {
      reason: this.queue.length ? ("eventLimit" as const) : ("idle" as const),
      events,
      now: this.clock,
    };
  }
  [replayProgress](driver?: ReplayProgressDriver) { this.progressDriver = driver; }
  get queueTakeCount() { return this.takes; }
  [restoreEndpoint](endpoint: Replay["endpoint"]) {
    const target = readReplayCoordinate(endpoint);
    for (;;) {
      this.progressDriver?.flush();
      if (this.count === target.eventCount && this.takes === target.queueTakes && this.clock === target.now) return;
      if (this.count > target.eventCount || this.takes > target.queueTakes || this.clock > target.now)
        throw new Error("incompatible replay endpoint");
      const before = [this.count, this.takes, this.clock];
      this.canonicalAllowed = this.count < target.eventCount;
      try { this.step(target.now); }
      finally { this.canonicalAllowed = true; }
      if (before[0] === this.count && before[1] === this.takes && before[2] === this.clock)
        throw new Error("unreconstructable replay endpoint");
    }
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
      normalizations: this.normalizations,
    });
  }
}
export const createRun = (config: RunConfig = {}) => new Run(config);
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
    throw new Error("incompatible replay identity");
  const endpoint = readReplayCoordinate(replay.endpoint);
  const run = createRun(replay.config);
  const timeline = [
    ...replay.controls.map((record) => ({ kind: "control" as const, record: readControlRecord(record) })),
    ...replay.scheduledInputs.map((record) => ({ kind: "input" as const, record: readInputRecord(record) })),
    ...replay.normalizations.map((record) => ({ kind: "normalize" as const, record: readNormalization(record) })),
  ].sort((a, b) => a.record.checkpointSequence - b.record.checkpointSequence);
  let actionSequence = 0;
  for (const [sequence, item] of timeline.entries()) {
    if (item.kind !== "normalize" && item.record.sequence !== actionSequence++)
      throw new Error("incompatible replay action sequence");
    if (item.record.checkpointSequence !== sequence || item.record.boundary > endpoint.eventCount
      || item.record.queueTakes > endpoint.queueTakes || item.record.time > endpoint.now)
      throw new Error("incompatible replay timeline");
  }
  const step = run.step.bind(run);
  let cursor = 0;
  const flush = () => {
    while (cursor < timeline.length) {
      const item = timeline[cursor]!;
      if (item.record.boundary < run.eventCount || item.record.queueTakes < run.queueTakeCount
        || item.record.time < run.now) throw new Error("overshot replay timeline");
      if (item.record.boundary !== run.eventCount || item.record.queueTakes !== run.queueTakeCount
        || item.record.time !== run.now) return;
      cursor++;
      if (item.kind === "control") run.applyControl(item.record.control as Control);
      else if (item.kind === "input") run.schedule(item.record.input as RunInput);
      else run[replayNormalize]();
    }
  };
  run[replayProgress]({ flush, target: () => {
    const record = timeline[cursor]?.record;
    return record ? { eventCount: record.boundary, queueTakes: record.queueTakes, now: record.time }
      : restore ? endpoint : undefined;
  } });
  run.step = (untilTime?: number) => {
    for (;;) {
      flush();
      const before = cursor;
      const observation = step(untilTime);
      flush();
      if (observation || cursor === before) return observation;
      // A finite recorded checkpoint may unblock the next metadata item without
      // emitting a product observation. Continue through the same step owner.
    }
  };
  flush();
  return run;
};
export const replayRun = (replay: Replay) => reconstructReplay(replay, false);

/** Reconstruct the recorded viewing boundary, including metadata and boundary controls, without another canonical transition. */
export const restoreReplay = (replay: Replay, listener?: (frame: Observation) => void): Run => {
  const run = reconstructReplay(replay, true);
  if (listener) run.subscribe(listener);
  run[restoreEndpoint](replay.endpoint);
  run[replayProgress]();
  return run;
};
