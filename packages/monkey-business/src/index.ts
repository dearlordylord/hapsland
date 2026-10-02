import { ResourceScenarios, demoResourceLimits, type ResourceScenarioConfig } from "./resource-scenarios.ts";
export * from "./resource-scenarios.ts";
export { projectAgent } from "./agent-projection.ts";
import { generateFileTree, validateFileTreeProfile, DEFAULT_FILE_TREE_PROFILE, type FileTreeProfile } from "./file-trees.ts";
export * from "./file-trees.ts";
import { PreparationReplay, type PreparationEvent, type PreparationFrame } from "./preparation.ts";
export * from "./preparation.ts";
import { DEFAULT_OUTCOME_WEIGHTS, JEV_OUTCOME_ORDER, OUTCOME_RANDOM_ALGORITHM, OUTCOME_RANDOM_STREAM, SeededOutcomeSampler, validateOutcomeWeights, type OutcomeWeights } from "./outcomes.ts";
export * from "./outcomes.ts";
import { validateLiveControl, type LiveControl, type EnvironmentProfile, type OutputProfile, type OutcomeChoice } from "./controls.ts";
export * from "./controls.ts";
import {
  SessionGenerator,
  type SessionConfig,
  type SessionInput,
  type SessionControl,
} from "./session.ts";
export { SessionGenerator } from "./session.ts";
export type { SessionConfig, SessionInput, SessionControl } from "./session.ts";
export * from "./sizes.ts";
import {
  initialCanonical,
  projectCanonical,
  stepCanonical,
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
export const LOGIC_IDENTITY =
  "canonical-source-sha256:3bf1c60bb920608412b200e91a652b8fdd8f7de6b4b42481de756d34c31b6395";
export const PREPARATION_IDENTITY = "import-preparation-sha256:c85f59d667624daf084d024fab190a3e372bd1d0bdcd669d7241967ad3c497fa";
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
          /** Exact source-free prepared evaluation identities, one per review unit. */
          readonly evaluationInputs?: readonly string[];
          readonly evaluationTreeIdentity?: number;
          readonly evaluationTreeProfile?: FileTreeProfile;
          readonly revisionSubject?: string;
          readonly revisionInput?: string;
        }
      | { readonly kind: "finish" }
    ));
export type Control = LiveControl & { readonly agent?: string };
export type ControlRecord = {
  readonly control: Control;
  readonly time: number;
  readonly sequence: number;
  readonly boundary: number;
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
export type Observation = {
  readonly partition?: number;
  readonly agent?: string;
  readonly sequence: number;
  readonly time: number;
  readonly event: CanonicalEvent | PreparationEvent;
  readonly preparation?: PreparationFrame;
  readonly commands: readonly CanonicalCommand[];
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
export type RunConfig = {
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
  readonly endpoint: { readonly eventCount: number; readonly now: number };
  readonly format: typeof REPLAY_FORMAT;
  readonly randomAlgorithm: typeof RANDOM_ALGORITHM;
  readonly logicIdentity: typeof LOGIC_IDENTITY;
  readonly preparationIdentity: typeof PREPARATION_IDENTITY;
  readonly outcomeSampling: { readonly algorithm: typeof OUTCOME_RANDOM_ALGORITHM; readonly stream: typeof OUTCOME_RANDOM_STREAM; readonly order: typeof JEV_OUTCOME_ORDER };
  readonly config: RunConfig;
  readonly controls: readonly ControlRecord[];
  readonly scheduledInputs: readonly {
    boundary: number;
    time: number;
    sequence: number;
    input: RunInput;
  }[];
};
type CandidateContext = { partition: number; advice: number; round: number; token: number; surface: "edit" | "background" | "stop"; selection?: boolean };
type Scheduled = {
  partition?: number;
  at: number;
  order: number;
  finishAttempt?: number;
  fitFinish?: number;
  expiryAdvice?: number;
  generated?: boolean;
  reuseOperation?: number;
  reuseOutcome?: "clear" | "finding";
  cacheId?: number;
  cacheBytes?: number;
  cacheOutcome?: "clear" | "finding";
  job?: Extract<RunInput, { kind: "edit" }>;
} & ({ input: RunInput; candidate?: never } | {
  input: { kind: "canonical"; at: number; event: Extract<CanonicalEvent, { kind: "finalCandidateCheck" | "submissionSuppressCheck" | "collectionFitCheck" }>; generation?: number };
  candidate: CandidateContext;
} | {
  input: { kind: "preparationGraph"; at: number; event: PreparationEvent };
  candidate?: never;
});
const integer = (n: number, name: string) => {
  if (!Number.isSafeInteger(n) || n < 0 || n > 2 ** 48 - 1)
    throw new RangeError(`invalid ${name}`);
  return n;
};
const copy = <T>(x: T): T => structuredClone(x);
const restoreEndpoint = Symbol("restore replay endpoint");
type Finish = {
  round: number;
  attempt: number;
  token: number;
  deadline: number;
  recurring: boolean;
  selected: number[];
  waiting: boolean;
  validating: number;
  fitPending?: boolean;
};
const defaults = {
  globalItems: 32,
  globalBytes: 100000,
  partitionItems: 16,
  partitionBytes: 50000,
};
/** Equal-time items follow insertion order; effects appended by a transition follow already queued items. */
export class Run {
  private state: unknown;
  private nextTool = 1;
  private revisionGenerations = new Map<string, number>();
  private operationRevisions = new Map<number, { subject: number; input: number; generation: number }>();
  private staleOperations = new Set<number>();
  private resourceScenarios?: ResourceScenarios;
  private get candidateOutputBytes(): number | undefined { return this.config.lifecycles?.encodedOutputBytes ?? (this.config.resourceScenarios?.outputBytes ?? (this.resourceScenarios?.config.outputFit ? this.resourceScenarios.config.outputBytes : undefined)); }
  private identityIds = new Map<string, number>();
  private nextIdentity = 1;
  private evaluations = new Map<number, { id: number; bytes: number }>();
  private evaluationWaiters = new Map<number, number[]>();
  /** A fulfilled native promise remains joinable while Bend still retains its pending claim. */
  private fulfilledEvaluations = new Map<number, "clear" | "finding" | "unavailable">();
  private supplyEvaluation(operation: number, outcome: "clear" | "finding" | "unavailable") {
    if (outcome !== "unavailable") { this.supplyReuse(operation, outcome); return; }
    const work = this.projection.work.find(work => work.operation === operation);
    if (work) this.event({ kind: "reviewCompleted", partition: work.partition, lifetime: work.lifetime, round: work.round, operation, outcome });
  }
  private cachedOutcomes = new Map<number, "clear" | "finding">();
  private identity(value: string): number { const known = this.identityIds.get(value); if (known !== undefined) return known; const id = this.nextIdentity++; this.identityIds.set(value, id); return id; }
  private annotate(fields: Partial<Pick<Scheduled, "reuseOperation" | "reuseOutcome" | "cacheId" | "cacheBytes" | "cacheOutcome">>) { Object.assign(this.queue.find(item => item.order === this.order - 1)!, fields); }
  private supplyReuse(operation: number, outcome: "clear" | "finding") {
    const revision = this.operationRevisions.get(operation);
    if (revision) {
      this.event({ kind: "revisionCurrentCheck", ...revision });
      this.annotate({ reuseOperation: operation, reuseOutcome: outcome });
      return;
    }
    this.observeReuse(operation, outcome, this.environment.currentWork);
  }
  private observeReuse(operation: number, outcome: "clear" | "finding", currentWork: boolean) {
    const work = this.projection.work.find(w => w.operation === operation);
    if (!work) return;
    this.event({ kind: "reviewObserved", partition: work.partition, lifetime: work.lifetime, round: work.round, operation, outcome, currentWork });
  }
  private collectorCandidates = new Map<number, { advice: number; round: number; token: number }>();
  private readonly metadata: CapacityMetadata = { preparationWorkers: 8, jevRequests: 8, continuationBudget: 4 };
  get capacityMetadata(): CapacityMetadata {
    const metadata = copy(this.metadata);
    if (metadata.demoAgentCount !== undefined) {
      const limits = demoResourceLimits(metadata.demoAgentCount);
      if (metadata.reuse?.entryLimit !== limits.entryLimit || metadata.reuse.byteLimit !== limits.byteLimit
        || (metadata.tickets !== undefined && metadata.tickets.retention !== limits.ticketRetention)
        || (metadata.notices !== undefined && metadata.notices.maximumKeys !== limits.noticeMaximumKeys))
        delete (metadata as { demoAgentCount?: number }).demoAgentCount;
    }
    return metadata;
  }
  private preparation = new PreparationReplay();
  private canonicalAllowed = true;
  private queue: Scheduled[] = [];
  private order = 0;
  private count = 0;
  private clock = 0;
  private history: Observation[] = [];
  private listeners = new Set<(o: Observation) => void>();
  private controls: ControlRecord[] = [];
  private externalInputs: {
    boundary: number;
    time: number;
    sequence: number;
    input: RunInput;
  }[] = [];
  private timelineOrder = 0;
  private finishes = new Map<number, Finish>();
  private nextFinishIdentity = 100000;
  private partition = 1;
  private get finish() { return this.finishes.get(this.partition); }
  private set finish(value: Finish | undefined) {
    if (value) this.finishes.set(this.partition, value);
    else this.finishes.delete(this.partition);
  }
  private issuedRequests = new Map<
    number,
    Extract<CanonicalCommand, { kind: "jevRequestIssued" }>
  >();
  private jobs = new Map<number, Extract<RunInput, { kind: "edit" }>>();
  private readonly config: RunConfig;
  private readonly generators = new Map<number, SessionGenerator>();
  private readonly scopes: { agent: string; partition: number; seed: number }[] = [];
  private get session() { return this.generators.get(this.partition); }
  get agentScopes(): readonly { readonly agent: string; readonly partition: number; readonly seed: number }[] {
    return copy(this.scopes);
  }
  private jevDelay: number;
  private outcome: JevRequestOutcome | undefined;
  private outcomeWeights: OutcomeWeights;
  private readonly outcomeSampler: SeededOutcomeSampler;
  private environment: EnvironmentProfile;
  private adviceCredentials = new Map<number, number>();
  private requestCredentials = new Map<number, number>();
  private outputProfile: OutputProfile;
  private fileTrees: FileTreeProfile;
  constructor(config: RunConfig = {}) {
    if (config.lifecycles?.permits?.lifetimeMs !== undefined && integer(config.lifecycles.permits.lifetimeMs, "permit lifetime") === 0) throw new RangeError("permit lifetime must be positive");
    if (config.lifecycles?.permits?.terminal !== undefined && !["consume", "release", "expire"].includes(config.lifecycles.permits.terminal)) throw new TypeError("invalid permit terminal");
    if (config.lifecycles?.cancellation !== undefined && !["lateCallback", "suppressed"].includes(config.lifecycles.cancellation)) throw new TypeError("invalid cancellation outcome");
    if (config.lifecycles?.reuse) for (const [name, value] of Object.entries(config.lifecycles.reuse)) if (integer(value, name) === 0) throw new RangeError(`${name} must be positive`);
    if (config.lifecycles?.encodedOutputBytes !== undefined) integer(config.lifecycles.encodedOutputBytes, "encoded output bytes");
    if (config.lifecycles?.collectors?.lifetimeMs !== undefined && integer(config.lifecycles.collectors.lifetimeMs, "collector lifetime") === 0) throw new RangeError("collector lifetime must be positive");
    for (const [name, value] of Object.entries(config.lifecycles?.permits ?? {})) if (typeof value === "number") { integer(value, name); if (name.endsWith("Limit") && value === 0) throw new RangeError(`${name} must be positive`); }
    if (config.lifecycles?.collectors && integer(config.lifecycles.collectors.capacity, "collector capacity") === 0) throw new RangeError("collector capacity must be positive");
    if (config.lifecycles?.quietWindowMs !== undefined && integer(config.lifecycles.quietWindowMs, "quiet window") === 0) throw new RangeError("quiet window must be positive");
    if (config.lifecycles?.permits) Object.assign(this.metadata, { permits: { adviceeLimit: config.lifecycles.permits.adviceeLimit, residentLimit: config.lifecycles.permits.residentLimit } });
    if (config.lifecycles?.reuse) Object.assign(this.metadata, { reuse: { entryLimit: config.lifecycles.reuse.entryLimit, byteLimit: config.lifecycles.reuse.byteLimit } });
    const demoLimits = demoResourceLimits(config.sessions?.length ?? 1);
    if (config.demoAgentCount !== undefined) {
      const advertised = demoResourceLimits(config.demoAgentCount);
      if (config.lifecycles?.reuse?.entryLimit === advertised.entryLimit && config.lifecycles.reuse.byteLimit === advertised.byteLimit
        && (config.resourceScenarios?.ticketRetention ?? demoLimits.ticketRetention) === advertised.ticketRetention
        && (config.resourceScenarios?.noticeMaximumKeys ?? demoLimits.noticeMaximumKeys) === advertised.noticeMaximumKeys)
        Object.assign(this.metadata, { demoAgentCount: config.demoAgentCount });
    }
    if (config.resourceScenarios) config = { ...config, resourceScenarios: { ticketRetention: demoLimits.ticketRetention, noticeMaximumKeys: demoLimits.noticeMaximumKeys, ...config.resourceScenarios } };
    if (config.resourceScenarios?.tickets) Object.assign(this.metadata, { tickets: { retention: config.resourceScenarios.ticketRetention ?? 16 } });
    if (config.resourceScenarios?.notices) Object.assign(this.metadata, { notices: { maximumKeys: config.resourceScenarios.noticeMaximumKeys ?? 8 } });
    if (config.lifecycles?.collectors) Object.assign(this.metadata, { collectors: { capacity: config.lifecycles.collectors.capacity } });
    this.fileTrees = validateFileTreeProfile(config.fileTrees ?? DEFAULT_FILE_TREE_PROFILE);
    this.environment = copy(config.environment ?? { currentWork: true, credentialReady: true });
    this.outputProfile = copy(config.outputProfile ?? { outcome: "certain", delayMs: 0, leaseMs: 30000 });
    validateLiveControl({ kind: "environment", ...this.environment });
    validateLiveControl({ kind: "outputProfile", ...this.outputProfile });
    if (config.session && config.sessions) throw new TypeError("choose session or sessions");
    const sessions = config.sessions ?? (config.session ? [config.session] : []);
    if (config.sessions && (!sessions.length || sessions.length > 64)) throw new RangeError("sessions requires 1..64 agents");
    sessions.forEach((settings, index) => {
      const agent = settings.agent ?? `agent-${index + 1}`;
      if (this.scopes.some(scope => scope.agent === agent)) throw new TypeError("duplicate session agent");
      const seed = settings.seed ?? ((config.seed ?? 1) + Math.imul(index, 2654435761)) >>> 0;
      const partition = index + 1;
      this.generators.set(partition, new SessionGenerator({ ...settings, agent, seed }));
      this.scopes.push({ agent, partition, seed });
    });
    if (config.outcome !== undefined && config.outcomeWeights !== undefined) throw new TypeError("choose explicit outcome or outcome weights");
    this.outcome = config.outcome;
    this.outcomeWeights = validateOutcomeWeights(config.outcomeWeights ?? DEFAULT_OUTCOME_WEIGHTS);
    this.outcomeSampler = new SeededOutcomeSampler(config.seed ?? 1);
    const { outcome: _outcome, outcomeWeights: _weights, ...baseConfig } = config;
    this.config = copy({
      ...baseConfig,
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
    this.state = initialCanonical(config.limits ?? defaults);
    for (const generator of this.generators.values())
      for (const input of generator.next(0)) this.enqueue(input);
    for (const input of this.config.inputs!) this.enqueue(input);
    if (config.resourceScenarios) { this.resourceScenarios = new ResourceScenarios(config.resourceScenarios); for (const input of this.resourceScenarios.inputs()) this.enqueue(input); }
  }
  get now() {
    return this.clock;
  }
  get projection() {
    return projectCanonical(this.state);
  }
  get observations(): readonly Observation[] {
    return this.history;
  }
  get eventCount() {
    return this.count;
  }
  subscribe(listener: (o: Observation) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  schedule(input: RunInput) {
    this.enqueue(copy(input));
    this.externalInputs.push({
      boundary: this.count,
      time: this.clock,
      sequence: this.timelineOrder++,
      input: copy(input),
    });
  }
  private enqueue(input: RunInput, job?: Extract<RunInput, { kind: "edit" }>, expiryAdvice?: number) {
    integer(input.at, "virtual time");
    if (input.at < this.clock)
      throw new RangeError("cannot schedule in the past");
    this.queue.push({
      at: input.at,
      order: this.order++,
      input: copy(input),
      ...(job ? { job } : {}),
      ...(expiryAdvice !== undefined ? { expiryAdvice } : {}),
    });
    this.queue.sort((a, b) => a.at - b.at || a.order - b.order);
  }
  private event(
    event: CanonicalEvent,
    delay = 0,
    job?: Extract<RunInput, { kind: "edit" }>,
    expiryAdvice?: number,
  ) {
    this.enqueue({ at: this.clock + delay, kind: "canonical", event }, job, expiryAdvice);
    const scheduled = this.queue.find(item => item.order === this.order - 1)!;
    scheduled.generated = true;
    scheduled.partition = this.partition;
  }
  applyControl(control: Control): ControlRecord {
    const value: Control = validateLiveControl(control);
    if (value.agent !== undefined && !this.scopes.some(scope => scope.agent === value.agent))
      throw new RangeError("unknown agent control target");
    if (value.agent !== undefined && ["environment", "jevProfile", "outputProfile", "fileTrees"].includes(value.kind))
      throw new TypeError("resident controls cannot target one agent");
    if (value.kind === "fileTrees") {
      this.fileTrees = validateFileTreeProfile(value.profile);
    } else if (value.kind === "environment") {
      this.environment = { currentWork: value.currentWork, credentialReady: value.credentialReady,
        credentialGeneration: value.credentialGeneration ?? this.environment.credentialGeneration ?? 1,
        sourceReadable: value.sourceReadable ?? this.environment.sourceReadable ?? true };
      for (const work of this.projection.work) if (work.kind === "pendingFinding")
        this.validateAdvice(work.operation, work.round, work.operation, this.generators.has(work.partition) ? "background" : "edit");
    } else if (value.kind === "outputProfile") {
      this.outputProfile = { outcome: value.outcome, delayMs: value.delayMs, leaseMs: value.leaseMs };
    } else if (value.kind === "jevProfile") {
      this.jevDelay = value.delayMs;
      if (value.outcome !== undefined) this.outcome = value.outcome;
      if (value.outcomeWeights !== undefined) { this.outcome = undefined; this.outcomeWeights = validateOutcomeWeights(value.outcomeWeights); }
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
      boundary: this.count,
    };
    this.controls.push(record);
    return copy(record);
  }
  step(untilTime?: number): Observation | undefined {
    if (
      untilTime !== undefined &&
      this.queue[0] &&
      this.queue[0].at > untilTime
    )
      return;
    if (!this.canonicalAllowed && ["canonical", "preparationGraph"].includes(this.queue[0]?.input.kind ?? ""))
      return;
    const item = this.queue.shift();
    if (!item) return;
    this.clock = item.at;
    this.partition = this.inputPartition(item);
    if (item.input.kind === "preparationGraph") {
      const event = item.input.event;
      const before = this.projection;
      if (!before.work.some(work => work.operation === event.operation && work.kind === "preparing")) {
        this.preparation.retire(event.operation);
        return this.step(untilTime);
      }
      const preparation = this.preparation.step(event);
      return this.record({ sequence: this.count++, time: this.clock, event,
        preparation, before, after: before, commands: [], effects: [], capacityMetadata: this.capacityMetadata, partition: this.partition, agent: this.agentName(this.partition) });
    }
    if (this.session && !this.session.valid(item.input))
      return this.step(untilTime);
    if (
      item.finishAttempt !== undefined &&
      item.finishAttempt !== this.finish?.attempt
    )
      return this.step(untilTime);
    if (item.input.kind !== "canonical") {
      if (
        "recurring" in item.input &&
        item.input.recurring &&
        item.input.kind !== "finish" &&
        this.session
      )
        for (const input of this.session.next(this.clock)) this.enqueue(input);
      if (item.input.kind === "task") return this.step(untilTime);
      const scope = this.projection.rounds.find((r) => r.partition === this.partition);
      const round = scope?.id;
      if (item.input.kind === "finish") {
        if (round && !this.finish) {
          const identity = this.nextFinishIdentity++;
          this.finish = {
            round,
            attempt: identity,
            token: identity,
            deadline: this.clock + (this.config.finishDeadline ?? 200),
            recurring: "recurring" in item.input && item.input.recurring,
            selected: [],
            waiting: false,
            validating: 0,
          };
          this.pollFinish();
          this.pollFinish(this.config.finishDeadline ?? 200);
        } else if (
          !round &&
          "recurring" in item.input &&
          item.input.recurring &&
          this.session
        )
          for (const input of this.session.next(this.clock))
            this.enqueue(input);
        return this.step(untilTime);
      }
      const permits = this.config.lifecycles?.permits;
      if (!round && !permits) {
        if (!this.queue.some(item => item.input.kind === "canonical" && item.input.event.kind === "openRound" && item.input.event.partition === this.partition))
          this.event({ kind: "openRound", partition: this.partition, lifetime: 1 });
        this.enqueue(
          {
            ...item.input,
            at: this.clock + (this.config.lifecycles?.permits && this.clock === 0 ? 1 : 0),
            ...("recurring" in item.input ? { recurring: false } : {}),
          },
          item.input,
        );
        return this.step(untilTime);
      }
      if (this.config.lifecycles?.reuse && "revision" in item.input && !("evaluationInputs" in item.input)) {
        // Source-free generated prepared fixture: pairs share every evaluation fact;
        // the next pair changes the input, and partitions remain isolated.
        const fixture = Math.floor(Math.max(0, item.input.revision - 1) / 2) % 2;
        item.input = { ...item.input, evaluationInputs: item.input.unitBytes.map((bytes, unit) => JSON.stringify({ fixture, unit, prepared: { bytes, rules: "synthetic-noul", tree: { fixture, seed: this.config.seed, profile: this.fileTrees } } })), evaluationTreeIdentity: fixture + 1, evaluationTreeProfile: copy(this.fileTrees), revisionSubject: "generated-root", revisionInput: JSON.stringify({ fixture, bytes: item.input.bytes, unitBytes: item.input.unitBytes, seed: this.config.seed, profile: this.fileTrees }) } as Extract<RunInput, { kind: "edit" }>;
      }
      if ("evaluationInputs" in item.input && item.input.evaluationInputs) {
        if (item.input.evaluationInputs.length !== item.input.unitBytes.length || item.input.evaluationInputs.some(input => typeof input !== "string" || !input.length)) throw new TypeError("evaluationInputs must identify every prepared review unit");
      }
      if ("revisionSubject" in item.input && item.input.revisionSubject !== undefined && item.input.revisionInput === undefined) throw new TypeError("revisionInput required with revisionSubject");
      if (permits) {
        const tool = "tool" in item.input && item.input.tool !== undefined ? item.input.tool : this.nextTool++;
        const lifetime = permits.lifetimeMs ?? 30000;
        const started = Math.max(1, this.clock);
        this.event({ kind: "issuePermit", partition: this.partition, lifetime: 1, tool,
          started, deadline: started + lifetime, now: started, minimumStarted: 0,
          facts: { clockValid: true, hookWindow: lifetime, startedUpper: started, nowLower: started,
            adviceePermitLimit: permits.adviceeLimit, residentPermitLimit: permits.residentLimit } }, started - this.clock, item.input);
      } else this.event({ kind: "admitObservation", partition: this.partition, lifetime: 1, round: round! }, 0, item.input);
      return this.step(untilTime);
    }
    let event = item.input.event;
    if (item.generated && event.kind === "jevRequestSettled") event = { ...event, currentWork: this.environment.currentWork && !this.staleOperations.has(event.operation) };
    if (item.generated && event.kind === "jevRequestReady") event = { ...event, currentWork: this.environment.currentWork, credentialReady: this.environment.credentialReady };
    if (event.kind === "cachePrepare" || event.kind === "cacheCommit") Object.assign(this.metadata, { reuse: { entryLimit: event.entryLimit, byteLimit: event.byteLimit } });
    if (event.kind === "ticketRetentionCheck") Object.assign(this.metadata, { tickets: { retention: event.limit } });
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
    if (item.generated && event.kind === "quietRoundTick") { const quiet = event; event = { ...quiet, facts: {
      nativeWorkIdle: !before.work.some(w => w.partition === quiet.partition && w.kind !== "pendingFinding"),
      adviceEmpty: !before.work.some(w => w.partition === quiet.partition && w.kind === "pendingFinding"),
      handoffIdle: !before.collection.claims.some(c => c.group === quiet.partition) && !before.collection.leases.some(l => before.work.some(w => w.operation === l.advice && w.partition === quiet.partition)) && !before.delivery.submissions.batches.some(s => s.group === quiet.partition), stopAbsent: !this.finishes.has(quiet.partition) } }; }
    if (item.generated && item.candidate && event.kind === "finalCandidateCheck") event = { ...event,
      ownerCurrent: before.pendingFindings.some(finding => finding.operation === item.candidate!.advice),
      credentialGeneration: (this.adviceCredentials.get(item.candidate.advice) ?? 1) === (this.environment.credentialGeneration ?? 1),
      credentialAuthorized: this.environment.credentialReady,
      workCurrent: this.environment.currentWork && (this.environment.sourceReadable ?? true) };
    // Callback identity is checked against issued work, before the product's stale-result fence.
    if (
      event.kind === "jevRequestSettled" &&
      ![...this.issuedRequests.values()].some(
        (r) =>
          r.request === event.request &&
          r.operation === event.operation &&
          r.partition === event.partition &&
          r.lifetime === event.lifetime &&
          r.round === event.round,
      )
    )
      throw new Error("mismatched completion identity");
    const result = stepCanonical(this.state, event);
    this.state = result.state;
    if (item.generated && event.kind === "cacheCommit" && !result.commands.some(command => command.kind === "cacheCommitted")) {
      this.event({ kind: "releaseCapacity", reservation: event.reservation });
      if (!this.projection.reuse.cache.some(entry => entry.id === event.id)) this.cachedOutcomes.delete(event.id);
    }
    if (event.kind === "collectionFitCheck") {
      const command = result.commands.find(c => c.kind === "collectionFits" || c.kind === "collectionLimited");
      if (command) Object.assign(this.metadata, { encodedOutput: { ...this.metadata.encodedOutput!, decision: command.kind === "collectionFits" ? "fits" : "limited" } });
    }
    for (const followup of this.resourceScenarios?.handle(event, result.commands, before) ?? []) this.event(followup);
    const effects: EffectObservation[] = [];
    const scope =
      "round" in event && "partition" in event && "lifetime" in event
        ? {
            partition: event.partition,
            lifetime: event.lifetime,
            round: event.round,
          }
        : undefined;
    for (const command of result.commands) {
      switch (command.kind) {
        case "permitIssued": {
          if (event.kind !== "issuePermit" || !item.job) break;
          const terminal = this.config.lifecycles?.permits?.terminal ?? "consume";
          const binding = { partition: event.partition, lifetime: event.lifetime, token: command.token };
          if (terminal !== "expire" && (this.config.lifecycles?.permits?.holdMs ?? 0) > event.deadline - this.clock) this.event({ kind: "expirePermit", ...binding, deadlineReached: true }, event.deadline - this.clock);
          if (terminal === "consume") this.event({ kind: "consumePermit", ...binding, tool: event.tool,
            now: this.clock + (this.config.lifecycles?.permits?.holdMs ?? 0) }, this.config.lifecycles?.permits?.holdMs ?? 0, item.job);
          else if (terminal === "release") this.event({ kind: "releasePermit", ...binding }, this.config.lifecycles?.permits?.holdMs ?? 0);
          else this.event({ kind: "expirePermit", ...binding, deadlineReached: true }, event.deadline - this.clock);
          break;
        }
        case "permitConsumed":
          if (event.kind === "consumePermit" && item.job) {
            // Permit round is the advicee's admission generation; canonical round IDs
            // are resident-wide identities and may differ for another partition.
            const accepted = this.projection.rounds.find(round => round.partition === event.partition && round.lifetime === event.lifetime);
            if (!accepted) throw new Error("consumed permit lacks its checked canonical round");
            this.event({ kind: "admitObservation", partition: event.partition, lifetime: event.lifetime, round: accepted.id }, 0, item.job);
          }
          break;
        case "quietRoundExpired":
          if (event.kind === "quietRoundTick") {
            this.event({ kind: "closePermitRound", partition: event.partition, lifetime: event.lifetime, round: event.round, at: this.clock });
            this.event({ kind: "retirePartition", partition: event.partition, lifetime: event.lifetime, round: event.round });
          }
          break;
        case "quietRoundWaiting":
          if (event.kind === "quietRoundTick") this.event({ ...event, now: command.since + event.window }, Math.max(0, command.since + event.window - this.clock));
          break;
        case "observationAdmitted": {
          if (!scope || !item.job)
            throw new Error("unhandled required command: observationAdmitted");
          this.jobs.set(command.id, item.job);
          if (this.config.lifecycles?.quietWindowMs) this.event({ kind: "quietRoundReset", ...scope });
          if ("revisionSubject" in item.job && item.job.revisionSubject !== undefined) this.event({ kind: "revisionRegister", subject: this.identity(JSON.stringify([scope.partition, "subject", item.job.revisionSubject])), input: this.identity(JSON.stringify([scope.partition, "input", item.job.revisionInput])), addMember: false });
          this.event({ kind: "queueDispatch", ...scope, operation: command.id });
          break;
        }

        case "dispatchStarted": {
          const work = this.projection.work.find(work => work.operation === command.operation);
          const job = this.jobs.get(command.operation);
          if (!work || !job || !["awaitingSourceRead", "reviewing"].includes(work.kind))
            throw new Error("unhandled required command: dispatchStarted lacks synthetic source job");
          const scope = { partition: work.partition, lifetime: work.lifetime, round: work.round };
          if (work.kind === "reviewing") {
            this.event({ kind: "startReview", ...scope, operation: work.operation });
            this.event({ kind: "jevRequestReady", ...scope, operation: work.operation,
              rootValid: true, configurationValid: true, credentialReady: this.environment.credentialReady,
              selected: true, currentWork: this.environment.currentWork, physicalAvailable: true });
            break;
          }
          this.event({ kind: "startObservation", ...scope, observation: work.operation });
          this.event({ kind: "beginObservedPreparation", ...scope,
            observation: work.operation, bytes: job.bytes }, 0, job);
          break;
        }
        case "preparationRefused": {
          if (event.kind === "beginObservedPreparation") {
            this.event({ kind: "completeObservation", ...scope!, observation: event.observation });
            this.event({ kind: "dispatchSettled", ...scope!, operation: event.observation });
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
          const facts = preparingJob.unitBytes.flatMap((_bytes, unit) => {
            const tree = generateFileTree(this.config.seed!, "evaluationTreeIdentity" in preparingJob && preparingJob.evaluationTreeIdentity !== undefined ? preparingJob.evaluationTreeIdentity : command.operation, unit, "evaluationTreeProfile" in preparingJob && preparingJob.evaluationTreeProfile ? preparingJob.evaluationTreeProfile : this.fileTrees);
            return tree.facts.map((fact, step): PreparationEvent => ({
              kind: "preparationGraph", example: "generated", ...scope, operation: command.operation, unit, step, fact,
              generatedTree: { targetNames: tree.targetNames, files: tree.files.length, depth: tree.depth },
            }));
          });
          facts.forEach((preparation, index) => {
            // Inner facts share the operation's virtual interval, including zero-delay cases.
            const at = this.clock + Math.floor((this.config.preparationDelay ?? 2) * index / Math.max(1, facts.length));
            this.queue.push({ at, order: this.order++, input: { kind: "preparationGraph", at, event: preparation }, generated: true, partition: scope.partition });
          });
          this.event(
            {
              kind: "preparationCompleted",
              ...scope,
              operation: command.operation,
              unitBytes: item.job.unitBytes,
            },
            this.config.preparationDelay ?? 2,
            item.job,
          );
          break;
        }
        case "unitAdmitted": {
          if (!scope || !item.job)
            throw new Error(
              "unhandled required command: unitAdmitted lacks job",
            );
          this.jobs.set(command.operation, item.job);
          if ("revisionSubject" in item.job && item.job.revisionSubject !== undefined) {
            const subject = this.identity(JSON.stringify([scope.partition, "subject", item.job.revisionSubject]));
            const input = this.identity(JSON.stringify([scope.partition, "input", item.job.revisionInput]));
            const entry = this.projection.revision.entries.find(entry => entry.subject === subject);
            const generation = this.revisionGenerations.get(`${subject}:${input}`) ?? entry?.generation;
            if (generation) this.operationRevisions.set(command.operation, { subject, input, generation });
          }
          const inputs = "evaluationInputs" in item.job ? item.job.evaluationInputs : undefined;
          if (this.config.lifecycles?.reuse && inputs) {
            const id = this.identity(JSON.stringify([scope.partition, "evaluation", inputs[command.position - 1]]));
            this.evaluations.set(command.operation, { id, bytes: command.bytes });
            this.event({ kind: "reuseRoute", id, liveAdvice: false });
            this.annotate({ reuseOperation: command.operation });
          } else this.event({ kind: "queueDispatch", ...scope, operation: command.operation });
          break;
        }
        case "revisionReused":
        case "revisionReplaced":
          if (event.kind === "revisionRegister") this.revisionGenerations.set(`${event.subject}:${event.input}`, command.generation);
          break;
        case "revisionStale":
        case "revisionCurrent":
          if (item.reuseOperation !== undefined) {
            if (item.reuseOutcome) this.observeReuse(item.reuseOperation, item.reuseOutcome, command.kind === "revisionCurrent" && this.environment.currentWork);
            else if (command.kind === "revisionStale") this.staleOperations.add(item.reuseOperation);
          }
          break;
        case "reuseOwn":
          if (item.reuseOperation !== undefined && event.kind === "reuseRoute") {
            this.fulfilledEvaluations.delete(event.id);
            const work = this.projection.work.find(w => w.operation === item.reuseOperation)!;
            this.event({ kind: "reuseAttach", id: event.id });
            this.event({ kind: "queueDispatch", partition: work.partition, lifetime: work.lifetime, round: work.round, operation: work.operation });
          }
          break;
        case "reuseJoinPending":
        case "reuseJoinClaimed":
          if (item.reuseOperation !== undefined && event.kind === "reuseRoute") {
            const fulfilled = this.fulfilledEvaluations.get(event.id);
            if (fulfilled) this.supplyEvaluation(item.reuseOperation, fulfilled);
            else this.evaluationWaiters.set(event.id, [...(this.evaluationWaiters.get(event.id) ?? []), item.reuseOperation]);
          }
          break;
        case "reuseReleased":
          if (event.kind === "reuseRelease") this.fulfilledEvaluations.delete(event.id);
          break;
        case "reuseCached":
          if (item.reuseOperation !== undefined && event.kind === "reuseRoute") {
            const outcome = this.cachedOutcomes.get(event.id);
            if (!outcome) throw new Error("cached evaluation lacks supplied result");
            this.supplyReuse(item.reuseOperation, outcome);
          }
          break;
        case "cacheDiscarded":
          for (const id of command.ids) {
            this.cachedOutcomes.delete(id);
            const discarded = before.reuse.cache.find(entry => entry.id === id);
            if (discarded) this.event({ kind: "releaseCapacity", reservation: discarded.reservation });
          }
          break;
        case "cachePrepared":
          if (event.kind === "cachePrepare") {
            for (const id of command.evicted) {
              this.cachedOutcomes.delete(id);
              const evicted = before.reuse.cache.find(entry => entry.id === id);
              if (evicted) this.event({ kind: "releaseCapacity", reservation: evicted.reservation });
            }
            const owner = this.partition;
            this.event({ kind: "reserveCapacity", partition: owner, bytes: event.bytes, purpose: "storedResult" });
            this.annotate({ cacheId: event.id, cacheBytes: event.bytes, ...(item.cacheOutcome ? { cacheOutcome: item.cacheOutcome } : {}) });
          }
          break;
        case "cacheRejected":
          if (event.kind === "cachePrepare" && !this.projection.reuse.cache.some(entry => entry.id === event.id)) this.cachedOutcomes.delete(event.id);
          break;
        case "capacityRefused":
          if (item.cacheId !== undefined && !this.projection.reuse.cache.some(entry => entry.id === item.cacheId)) this.cachedOutcomes.delete(item.cacheId);
          break;
        case "capacityGranted":
          if (item.cacheId !== undefined && this.config.lifecycles?.reuse) {
            this.event({ kind: "cacheCommit", id: item.cacheId, partition: this.partition, bytes: item.cacheBytes!, reservation: command.id, entryLimit: this.config.lifecycles.reuse.entryLimit, byteLimit: this.config.lifecycles.reuse.byteLimit });
            if (item.cacheOutcome) this.annotate({ cacheOutcome: item.cacheOutcome });
          }
          break;
        case "cacheCommitted":
          if (event.kind === "cacheCommit" && item.cacheOutcome) this.cachedOutcomes.set(event.id, item.cacheOutcome);
          break;
        case "jevRequestIssued": {
          this.issuedRequests.set(command.request, command);
          this.requestCredentials.set(command.operation, this.environment.credentialGeneration ?? 1);
          const { kind: _kind, ...binding } = command;
          const job = this.jobs.get(command.operation);
          const outcome = job?.outcome ?? this.outcome ?? this.outcomeSampler.sample(this.outcomeWeights);
          if (outcome !== "neverSent") effects.push({
            kind: "jev",
            phase: "started",
            operation: command.operation,
            request: command.request,
            due: this.clock + this.jevDelay,
          });
          // Synthetic outcomes supply the same lifecycle facts required by native callbacks.
          if (outcome !== "neverSent") this.event({ kind: "jevRequestStarted", ...binding });
          if (outcome === "interrupted" && this.config.lifecycles?.cancellation === "suppressed") {
            this.event({ kind: "jevRequestInterrupted", ...binding }, this.jevDelay);
            this.event({ kind: "jevRequestSettled", ...binding, outcome: "interrupted", currentWork: false }, this.jevDelay);
            break;
          }
          if (outcome === "interrupted") this.event({ kind: "jevRequestInterrupted", ...binding }, this.jevDelay);
          const revision = this.operationRevisions.get(command.operation);
          if (revision) {
            this.event({ kind: "revisionCurrentCheck", ...revision }, this.jevDelay);
            this.annotate({ reuseOperation: command.operation });
          }
          this.event(
            {
              kind: "jevRequestSettled",
              ...binding,
              outcome,
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
          this.adviceCredentials.set(advice, this.requestCredentials.get(advice) ?? this.environment.credentialGeneration ?? 1);
          effects.push({ kind: "advice", phase: "supplied", advice });
          const lifetime = this.config.adviceLifetime ?? 600_000;
          this.event({ kind: "collectionExpiryCheck", elapsed: lifetime, lifetime },
            lifetime, undefined, advice);
          break;
        }
        case "collectionEligible": {
          if (event.kind === "collectionReady" && !this.finishes.has(event.partition)) {
            if (this.config.lifecycles?.collectors) {
              this.collectorCandidates.set(event.advice, { advice: event.advice, round: event.round, token: event.advice });
              this.event({ kind: "collectionClaimBackground", group: event.partition, token: event.advice, active: true, capacity: this.config.lifecycles.collectors.capacity });
            } else this.validateAdvice(event.advice, event.round, event.advice, this.session ? "background" : "edit");
          }
          break;
        }
        case "collectionBackgroundClaimed":
          if (event.kind === "collectionClaimBackground" && this.config.lifecycles?.collectors) {
            const candidate = this.collectorCandidates.get(event.token);
            if (candidate) this.validateAdvice(candidate.advice, candidate.round, candidate.token, "background");
            const lifetime = this.config.lifecycles?.collectors?.lifetimeMs ?? 30000;
            this.event({ kind: "collectionExpireBackground", group: event.group, token: event.token, elapsed: lifetime, lifetime }, lifetime);
          }
          break;
        case "collectionBackgroundReleased":
          for (const [token, candidate] of this.collectorCandidates) {
            const owner = this.projection.work.find(w => w.operation === candidate.advice);
            if (!owner) { this.collectorCandidates.delete(token); continue; }
            this.event({ kind: "collectionClaimBackground", group: owner.partition, token, active: true, capacity: this.config.lifecycles!.collectors!.capacity });
          }
          break;
        case "submissionBegun":
          if (event.kind === "submissionBegin" && this.outputProfile.outcome === "failed") {
            this.event({ kind: "submissionRelease", advice: event.advice, token: event.token }, this.outputProfile.delayMs);
            this.event({ kind: "collectionReleaseLease", advice: event.advice, token: event.token }, this.outputProfile.delayMs);
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
          if (profile.outcome === "failed") {
            this.event({ kind: "submissionRelease", advice: event.advice, token: event.token }, profile.delayMs);
            this.event({ kind: "collectionReleaseLease", advice: event.advice, token: event.token }, profile.delayMs);
            if (this.finish && event.token === this.finish.token)
              this.event({ kind: "finishTerminal", group: this.partition, round: this.finish.round,
                attempt: this.finish.attempt, token: event.token, selected: this.finish.selected,
                outcome: "failed" }, profile.delayMs);
          } else {
            const due = Math.min(profile.delayMs, profile.leaseMs);
            if (profile.delayMs > profile.leaseMs)
              this.event({ kind: "deliveryAcknowledgeCheck", items: 1, anyExpired: true }, profile.delayMs);
            if (profile.delayMs >= profile.leaseMs)
              this.event({ kind: "submissionExpiryCheck", advice: event.advice, token: event.token,
                elapsed: profile.leaseMs, lifetime: profile.leaseMs }, due);
            else this.event({ kind: "submissionTerminal", advice: event.advice, token: event.token,
              certain: profile.outcome === "certain" }, due);
            this.event({ kind: "collectionLeaseCheck", advice: event.advice, token: event.token,
              expired: profile.delayMs >= profile.leaseMs, stopCollector: false, sameGroup: true,
              reofferable: false }, due);
            this.event({ kind: "collectionReleaseLease", advice: event.advice, token: event.token }, due);
          }
          break;
        }
        case "retainCandidate":
        case "continueCandidate": {
          if (item.candidate) {
            this.candidateEvent({ kind: "submissionSuppressCheck", advice: item.candidate.advice,
              fingerprint: item.candidate.advice, round: item.candidate.round, surface: item.candidate.surface }, item.candidate);
          }
          break;
        }
        case "submissionExpired":
          if (event.kind === "submissionExpiryCheck")
            this.event({ kind: "submissionTerminal", advice: event.advice, token: event.token, certain: false });
          break;
        case "submissionUnsuppressed":
          if (item.candidate && !item.candidate.selection && this.candidateOutputBytes !== undefined) {
            this.candidateEvent({ kind: "collectionFitCheck", items: 1, bytes: this.candidateOutputBytes! }, item.candidate);
            break;
          }
        case "collectionFits": {
          if (!item.candidate && this.finish?.fitPending && item.fitFinish === this.finish.attempt) { this.finish.fitPending = false; this.finishBudget(true); break; }
          if (item.candidate) {
            const c = item.candidate;
            if (c.selection && this.finish) {
              this.finish.selected.push(c.advice);
              this.finish.validating--;
              if (this.finish.validating === 0) this.finishBudget();
              break;
            }
            {
              this.event({ kind: "collectionReserveLease", advice: c.advice, token: c.token });
              this.event({ kind: "submissionBegin", advice: c.advice, group: c.partition, round: c.round,
                token: c.token, surface: c.surface, authorizeNow: c.surface !== "stop" && this.outputProfile.outcome !== "failed",
                fingerprints: [c.advice], units: [c.advice] });
            }
          }
          break;
        }
        case "collectionLimited":
          if (!item.candidate && this.finish?.fitPending && item.fitFinish === this.finish.attempt) { this.finish.fitPending = false; this.finish.selected = []; this.finishBudget(true); break; }
          if (item.candidate) {
            const c = item.candidate;
            this.collectorCandidates.delete(c.token);
            if (this.projection.collection.claims.some(claim => claim.group === c.partition && claim.owner === c.token)) this.event({ kind: "collectionReleaseBackground", group: c.partition, token: c.token });
            if (c.selection && this.finish) { this.finish.validating--; if (!this.finish.validating) this.finishBudget(); }
          }
          break;
        case "retireCandidate":
          if (item.candidate) this.retireAdvice(item.candidate.advice);
        case "releaseCandidate":
        case "ignoreCandidate":
        case "submissionSuppresses":
          if (item.candidate?.selection && this.finish) {
            this.finish.validating--;
            if (this.finish.validating === 0) this.finishBudget();
          }
          break;
        case "jevRequestUnavailable":
          if (event.kind === "jevRequestReady") {
            const evaluation = this.evaluations.get(event.operation);
            if (evaluation) {
              this.fulfilledEvaluations.set(evaluation.id, "unavailable");
              for (const operation of this.evaluationWaiters.get(evaluation.id) ?? []) this.supplyEvaluation(operation, "unavailable");
              this.event({ kind: "reuseRelease", id: evaluation.id });
              this.evaluationWaiters.delete(evaluation.id);
              this.evaluations.delete(event.operation);
              this.operationRevisions.delete(event.operation);
              this.staleOperations.delete(event.operation);
            }
          }
          if (event.kind === "jevRequestReady" && before.dispatch.running.some(entry => entry.operation === event.operation)) {
            this.event({ kind: "dispatchSettled", partition: event.partition, lifetime: event.lifetime,
              round: event.round, operation: event.operation });
            this.jobs.delete(event.operation);
          }
          break;
        case "collectionExpired": {
          const advice = item.expiryAdvice;
          if (advice === undefined) break;
          this.retireAdvice(advice);
          break;
        }
        case "waitForWork":
        case "waitForOutput":
          if (this.finish) this.finish.waiting = true;
          break;
        case "finishReady":
        case "finishLimit": {
          const f = this.finish;
          if (!f) break;
          f.waiting = false;
          f.selected = [];
          const candidates = command.kind === "finishLimit" ? [] : this.projection.work.filter(work =>
            work.partition === this.partition && work.round === f.round && work.kind === "pendingFinding");
          f.validating = candidates.length;
          if (!f.validating) this.finishBudget();
          for (const work of candidates) this.validateAdvice(work.operation, f.round, f.token, "stop", true);
          break;
        }
        case "roundContinuationAvailable":
        case "roundContinuationExhausted": {
          const f = this.finish;
          if (!f) break;
          if (command.kind === "roundContinuationExhausted") f.selected = [];
          this.event({
            kind: "finishReserve",
            group: this.partition,
            lifetime: 1,
            round: f.round,
            attempt: f.attempt,
            token: f.token,
            selected: f.selected,
            hasNotice: false,
            passNotices: true,
            canWrite: true,
            bindingValid: true,
            deadlineReached: this.clock >= f.deadline,
          });
          break;
        }
        case "finishAllowedNoAdvice":
        case "finishAllowedDeadline":
        case "finishAllowedUnavailable":
          this.endFinish(false);
          break;
        case "finishReserved": {
          const f = this.finish;
          if (!f) break;
          for (const advice of f.selected) {
            this.event({
              kind: "collectionReserveLease",
              advice,
              token: f.token,
            });
            this.event({
              kind: "submissionBegin",
              advice,
              group: this.partition,
              round: f.round,
              token: f.token,
              surface: "stop",
              authorizeNow: false,
              fingerprints: [advice],
              units: [advice],
            });
          }
          if (this.outputProfile.outcome === "failed") {
            this.event({ kind: "finishRelease", group: this.partition, round: f.round, attempt: f.attempt, token: f.token }, this.outputProfile.delayMs);
            break;
          }
          this.event({
            kind: "finishAuthorize",
            group: this.partition,
            round: f.round,
            attempt: f.attempt,
            token: f.token,
            selected: f.selected,
          });
          break;
        }
        case "finishAuthorized": {
          const f = this.finish;
          if (!f) break;
          effects.push({ kind: "output", phase: "started", advices: [...f.selected] });
          const profile = this.outputProfile;
          if (profile.outcome === "failed") {
            this.event({ kind: "finishTerminal", group: this.partition, round: f.round,
              attempt: f.attempt, token: f.token, selected: f.selected, outcome: "failed" }, profile.delayMs);
            for (const advice of f.selected) {
              this.event({ kind: "submissionRelease", advice, token: f.token }, profile.delayMs);
              this.event({ kind: "collectionReleaseLease", advice, token: f.token }, profile.delayMs);
            }
          } else {
            const due = Math.min(profile.delayMs, profile.leaseMs);
            if (profile.delayMs > profile.leaseMs)
              this.event({ kind: "deliveryAcknowledgeCheck", items: f.selected.length, anyExpired: true }, profile.delayMs);
            this.event({ kind: "finishTerminal", group: this.partition, round: f.round,
              attempt: f.attempt, token: f.token, selected: f.selected,
              outcome: profile.delayMs >= profile.leaseMs || profile.outcome === "uncertain"
                ? "unknown" : "acknowledged" }, due);
            for (const advice of f.selected) {
              this.event({ kind: "collectionLeaseCheck", advice, token: f.token,
                expired: profile.delayMs >= profile.leaseMs, stopCollector: false, sameGroup: true,
                reofferable: false }, due);
              this.event({ kind: "collectionReleaseLease", advice, token: f.token }, due);
            }
          }
          break;
        }
        case "finishRecorded": {
          const f = this.finish;
          if (f) {
            this.event({
              kind: "continuationConsume",
              group: this.partition,
              round: f.round,
            });
            this.event({
              kind: "finishEnd",
              group: this.partition,
              round: f.round,
              attempt: f.attempt,
              token: f.token,
            });
          }
          break;
        }
        case "finishReleased":
          this.endFinish(true);
          break;
        case "finishEnded":
          this.endFinish(true);
          break;
        case "finishRefused":
          // A product refusal grants no finish or continuation permission.
          if (this.finish) this.finish.waiting = false;
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
    if (event.kind === "preparationCompleted" && item.job) {
      const parent = before.work.find(
        (w) => w.operation === event.operation,
      )?.parent;
      if (parent && scope) {
        this.event({
          kind: "completeObservation",
          ...scope,
          observation: parent,
        });
        this.event({ kind: "dispatchSettled", ...scope, operation: parent });
        this.jobs.delete(parent);
      }
    }
    if (["completeObservation", "jevRequestSettled", "reviewCompleted", "interruptObservation",
      "interruptPreparation", "stopPolled"].includes(event.kind)) this.refreshAdviceReadiness();
    if (["preparationCompleted", "jevRequestSettled", "submissionTerminal", "collectionReleaseLease"].includes(event.kind)) {
      const owner = this.partition;
      for (const [partition, finish] of this.finishes) if (finish.waiting) {
        this.partition = partition;
        this.pollFinish();
      }
      this.partition = owner;
    }
    if (!result.rejection && this.session && (
      event.kind === "submissionTerminal" && result.commands.some((c) => c.kind === "submissionRecorded") ||
      event.kind === "finishTerminal" && event.outcome === "acknowledged" &&
        result.commands.some((c) => c.kind === "finishRecorded")))
      for (const input of this.session.onAdvice(this.clock))
        this.enqueue(input);
    if (event.kind === "reviewObserved" || event.kind === "reviewCompleted" || event.kind === "retireReview") {
      this.evaluations.delete(event.operation);
      this.operationRevisions.delete(event.operation);
      this.staleOperations.delete(event.operation);
      if (!this.projection.pendingFindings.some(f => f.operation === event.operation)) this.jobs.delete(event.operation);
    }
    if (event.kind === "preparationCompleted") {
      this.preparation.retire(event.operation);
      this.jobs.delete(event.operation);
      effects.push({
        kind: "preparation",
        phase: "supplied",
        operation: event.operation,
      });
    }
    if (event.kind === "jevRequestSettled") {
      const evaluation = this.evaluations.get(event.operation);
      if (evaluation) {
        if (["clear", "finding"].includes(event.outcome) && !result.rejection && event.currentWork) {
          const outcome = event.outcome as "clear" | "finding";
          this.fulfilledEvaluations.set(evaluation.id, outcome);
          this.event({ kind: "cachePrepare", id: evaluation.id, bytes: evaluation.bytes, entryLimit: this.config.lifecycles!.reuse!.entryLimit, byteLimit: this.config.lifecycles!.reuse!.byteLimit });
          this.annotate({ cacheOutcome: outcome });
          for (const operation of this.evaluationWaiters.get(evaluation.id) ?? []) this.supplyReuse(operation, outcome);
        } else {
          this.fulfilledEvaluations.set(evaluation.id, "unavailable");
          for (const operation of this.evaluationWaiters.get(evaluation.id) ?? []) this.supplyEvaluation(operation, "unavailable");
        }
        this.event({ kind: "reuseRelease", id: evaluation.id });
        this.evaluationWaiters.delete(evaluation.id);
        this.evaluations.delete(event.operation);
      }
      this.operationRevisions.delete(event.operation);
      this.staleOperations.delete(event.operation);
      if (before.dispatch.running.some(entry => entry.operation === event.operation))
        this.event({ kind: "dispatchSettled", partition: event.partition, lifetime: event.lifetime, round: event.round, operation: event.operation });
      this.issuedRequests.delete(event.request);
      this.requestCredentials.delete(event.operation);
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
    if (this.config.lifecycles?.collectors && (event.kind === "submissionTerminal" || event.kind === "submissionRelease" || event.kind === "collectionRetireAdvice")) {
      const token = event.kind === "collectionRetireAdvice" ? event.advice : event.token;
      const claim = this.projection.collection.claims.find(c => c.owner === token);
      this.collectorCandidates.delete(token);
      if (claim) this.event({ kind: "collectionReleaseBackground", group: claim.group, token });
    }
    if (this.config.lifecycles?.quietWindowMs && ["completeObservation", "jevRequestSettled", "submissionTerminal", "collectionReleaseLease", "releasePermit", "expirePermit", "collectionRetireAdvice", "submissionForget", "retireReview", "collectionReleaseBackground", "collectionExpireBackground"].includes(event.kind)) {
      const round = this.projection.rounds.find(round => round.partition === this.partition);
      if (round) this.event({ kind: "quietRoundTick", partition: round.partition, lifetime: round.lifetime, round: round.id, now: this.clock,
        window: this.config.lifecycles.quietWindowMs, facts: { nativeWorkIdle: !this.jobs.size, adviceEmpty: !this.projection.work.some(f => f.partition === round.partition && f.kind === "pendingFinding"), handoffIdle: !this.projection.collection.claims.some(c => c.group === round.partition), stopAbsent: !this.finishes.has(round.partition) } });
    }
    const observation: Observation = {
      partition: this.partition,
      agent: this.agentName(this.partition),
      sequence: this.count++,
      time: this.clock,
      event: copy(event),
      commands: result.commands,
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
    return this.record(observation);
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
    if (input.kind === "canonical" || input.kind === "preparationGraph") {
      const event = input.event;
      if ("partition" in event) return event.partition;
      if ("group" in event) return event.group;
      if (item.partition !== undefined) return item.partition;
      const operation = "operation" in event ? event.operation : "advice" in event ? event.advice : undefined;
      const owner = operation === undefined ? undefined : this.projection.work.find(work => work.operation === operation);
      if (owner) return owner.partition;
    }
    return item.partition ?? 1;
  }
  private record(observation: Observation): Observation {
    this.history.push(observation);
    const retention = this.config.retention ?? 1000;
    if (this.history.length > retention)
      this.history.splice(0, this.history.length - retention);
    for (const listener of this.listeners) listener(observation);
    return observation;
  }
  private finishBudget(fitted = false) {
    const f = this.finish;
    if (!f) return;
    const bytes = this.candidateOutputBytes;
    if (!fitted && bytes !== undefined && f.selected.length) {
      f.fitPending = true;
      this.event({ kind: "collectionFitCheck", items: f.selected.length, bytes });
      this.queue.find(item => item.order === this.order - 1)!.fitFinish = f.attempt;
      return;
    }
    this.event({ kind: "roundContinuationBudgetCheck", active: true,
      count: this.projection.delivery.counters.find(counter => counter.group === this.partition && counter.round === f.round)?.used ?? 0 });
  }
  private refreshAdviceReadiness() {
    const projection = this.projection;
    for (const finding of projection.pendingFindings) {
      if (projection.collection.ready.includes(finding.operation)) continue;
      const work = projection.work.find((entry) => entry.operation === finding.operation);
      if (!work || work.parent === 0) continue;
      this.event({ kind: "collectionReady", advice: work.operation,
        partition: work.partition, lifetime: work.lifetime, round: work.round,
        observation: work.parent, joinedPending: false });
    }
  }
  private candidateEvent(event: Extract<CanonicalEvent, { kind: "finalCandidateCheck" | "submissionSuppressCheck" | "collectionFitCheck" }>, candidate: CandidateContext) {
    this.queue.push({ at: this.clock, order: this.order++, generated: true,
      input: { at: this.clock, kind: "canonical", event }, candidate, partition: candidate.partition });
    this.queue.sort((a, b) => a.at - b.at || a.order - b.order);
  }
  private validateAdvice(advice: number, round: number, token: number, surface: "edit" | "background" | "stop", selection = false) {
    this.candidateEvent({ kind: "finalCandidateCheck", ownerCurrent: true,
      credentialGeneration: (this.adviceCredentials.get(advice) ?? 1) === (this.environment.credentialGeneration ?? 1),
      credentialAuthorized: this.environment.credentialReady, expired: false,
      workCurrent: this.environment.currentWork && (this.environment.sourceReadable ?? true), hasFindings: true }, { partition: this.projection.work.find(work => work.operation === advice)?.partition ?? this.partition, advice, round, token, surface, selection });
  }
  private retireAdvice(advice: number) {
    const retained = this.projection.work.find(work =>
      work.operation === advice && work.kind === "pendingFinding");
    this.queue = this.queue.filter(item => item.expiryAdvice !== advice);
    this.event({ kind: "collectionRetireAdvice", advice });
    this.event({ kind: "submissionForget", advice });
    if (retained) this.event({ kind: "retireReview",
      partition: retained.partition, lifetime: retained.lifetime,
      round: retained.round, operation: advice });
    this.jobs.delete(advice);
    this.adviceCredentials.delete(advice);
  }
  private pollFinish(delay = 0) {
    const f = this.finish;
    if (!f) return;
    const at = this.clock + delay;
    if (this.queue.some(item => item.finishAttempt === f.attempt && item.partition === this.partition && item.at === at)) return;
    this.queue.push({
      at,
      order: this.order++,
      finishAttempt: f.attempt,
      partition: this.partition,
      input: {
        at: this.clock + delay,
        kind: "canonical",
        event: {
          kind: "stopPolled",
          partition: this.partition,
          lifetime: 1,
          round: f.round,
          deadline: this.clock + delay >= f.deadline,
        },
      },
    });
    this.queue.sort((a, b) => a.at - b.at || a.order - b.order);
  }
  private endFinish(continuation: boolean) {
    const f = this.finish;
    if (!f) return;
    this.event({
      kind: "stopGroupEnded",
      group: this.partition,
      lifetime: 1,
      round: f.round,
      scopes: [{ partition: this.partition, round: f.round }],
    });
    if (!continuation) {
      for (const work of this.projection.work)
        if (work.partition === this.partition && work.round === f.round && work.kind === "pendingFinding")
          this.retireAdvice(work.operation);
      this.event({
        kind: "retirePartition",
        partition: this.partition,
        lifetime: 1,
        round: f.round,
      });
    }
    this.queue = this.queue.filter(item => item.finishAttempt !== f.attempt || item.partition !== this.partition);
    this.finish = undefined;
    if (f.recurring && this.session)
      for (const input of this.session.onFinish(this.clock, continuation))
        this.enqueue(input);
  }
  advance({
    untilTime,
    maxEvents = 1000,
  }: { untilTime?: number; maxEvents?: number } = {}) {
    integer(maxEvents, "event limit");
    if (untilTime !== undefined) {
      integer(untilTime, "time limit");
      if (untilTime < this.clock)
        throw new RangeError("time limit precedes current time");
    }
    let events = 0;
    while (events < maxEvents && this.queue.length) {
      if (untilTime !== undefined && this.queue[0]!.at > untilTime)
        return { reason: "timeLimit" as const, events, now: this.clock };
      if (this.step(untilTime)) events++;
      else if (this.queue.length)
        return { reason: "timeLimit" as const, events, now: this.clock };
    }
    return {
      reason: this.queue.length ? ("eventLimit" as const) : ("idle" as const),
      events,
      now: this.clock,
    };
  }
  [restoreEndpoint](endpoint: Replay["endpoint"]) {
    integer(endpoint.eventCount, "replay event count");
    integer(endpoint.now, "replay endpoint time");
    if (this.count !== endpoint.eventCount || this.clock > endpoint.now)
      throw new Error("incompatible replay endpoint");
    if (this.clock === endpoint.now) return;
    this.canonicalAllowed = false;
    try {
      this.step(endpoint.now);
    } finally {
      this.canonicalAllowed = true;
    }
    if (this.clock !== endpoint.now)
      throw new Error("unreconstructable replay endpoint");
  }
  exportReplay(): Replay {
    return copy({
      endpoint: { eventCount: this.count, now: this.clock },
      format: REPLAY_FORMAT,
      randomAlgorithm: RANDOM_ALGORITHM,
      logicIdentity: LOGIC_IDENTITY,
      preparationIdentity: PREPARATION_IDENTITY,
      outcomeSampling: { algorithm: OUTCOME_RANDOM_ALGORITHM, stream: OUTCOME_RANDOM_STREAM, order: JEV_OUTCOME_ORDER },
      config: this.config,
      controls: this.controls,
      scheduledInputs: this.externalInputs,
    });
  }
}
export const createRun = (config: RunConfig = {}) => new Run(config);
export const replayRun = (replay: Replay) => {
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
  const run = createRun(replay.config);
  const timeline = [
    ...replay.controls.map((record) => ({ kind: "control" as const, record })),
    ...replay.scheduledInputs.map((record) => ({
      kind: "input" as const,
      record,
    })),
  ].sort((a, b) => a.record.sequence - b.record.sequence);
  const step = run.step.bind(run);
  const flush = () => {
    while (
      timeline[0]?.record.boundary === run.eventCount &&
      timeline[0].record.time <= run.now
    ) {
      const item = timeline.shift()!;
      if (item.kind === "control") run.applyControl(item.record.control);
      else run.schedule(item.record.input);
    }
  };
  run.step = (untilTime?: number) => {
    flush();
    const observation = step(untilTime);
    flush();
    return observation;
  };
  flush();
  return run;
};

/** Reconstruct the recorded viewing boundary, including metadata and boundary controls, without another canonical transition. */
export const restoreReplay = (replay: Replay, listener?: (frame: Observation) => void): Run => {
  integer(replay.endpoint.eventCount, "replay event count");
  integer(replay.endpoint.now, "replay endpoint time");
  const run = replayRun(replay);
  if (listener) run.subscribe(listener);
  run.advance({
    maxEvents: replay.endpoint.eventCount,
    untilTime: replay.endpoint.now,
  });
  run[restoreEndpoint](replay.endpoint);
  return run;
};
