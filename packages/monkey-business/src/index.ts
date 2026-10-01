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
export const PREPARATION_IDENTITY = "import-preparation-sha256:812ca7a89d0f7b39ea4b4aa68e220b744bc0f6c2a7e1c1dcf2e5374919ca11ae";
export type RunInput =
  | SessionInput
  | ({ readonly at: number; readonly generation?: number } & (
      | { readonly kind: "canonical"; readonly event: CanonicalEvent }
      | {
          readonly kind: "edit";
          readonly bytes: number;
          readonly unitBytes: readonly number[];
          readonly outcome?: JevRequestOutcome;
        }
      | { readonly kind: "finish" }
    ));
export type Control = LiveControl;
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
};
export type RunConfig = {
  readonly seed?: number;
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
type CandidateContext = { advice: number; round: number; token: number; surface: "edit" | "background" | "stop"; selection?: boolean };
type Scheduled = {
  at: number;
  order: number;
  finishAttempt?: number;
  expiryAdvice?: number;
  generated?: boolean;
  job?: Extract<RunInput, { kind: "edit" }>;
} & ({ input: RunInput; candidate?: never } | {
  input: { kind: "canonical"; at: number; event: Extract<CanonicalEvent, { kind: "finalCandidateCheck" | "submissionSuppressCheck" }>; generation?: number };
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
const defaults = {
  globalItems: 32,
  globalBytes: 100000,
  partitionItems: 16,
  partitionBytes: 50000,
};
/** Equal-time items follow insertion order; effects appended by a transition follow already queued items. */
export class Run {
  private state: unknown;
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
  private finish:
    | {
        round: number;
        attempt: number;
        token: number;
        deadline: number;
        recurring: boolean;
        selected: number[];
        waiting: boolean;
        validating: number;
      }
    | undefined;
  private issuedRequests = new Map<
    number,
    Extract<CanonicalCommand, { kind: "jevRequestIssued" }>
  >();
  private jobs = new Map<number, Extract<RunInput, { kind: "edit" }>>();
  private readonly config: RunConfig;
  private readonly session?: SessionGenerator;
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
    this.fileTrees = validateFileTreeProfile(config.fileTrees ?? DEFAULT_FILE_TREE_PROFILE);
    this.environment = copy(config.environment ?? { currentWork: true, credentialReady: true });
    this.outputProfile = copy(config.outputProfile ?? { outcome: "certain", delayMs: 0, leaseMs: 30000 });
    validateLiveControl({ kind: "environment", ...this.environment });
    validateLiveControl({ kind: "outputProfile", ...this.outputProfile });
    if (config.session)
      this.session = new SessionGenerator({
        ...config.session,
        seed: config.session.seed ?? config.seed ?? 1,
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
        (config.session
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
    integer(this.config.seed!, "seed");
    this.jevDelay = integer(config.jevDelay ?? 5, "Jev delay");
    integer(config.preparationDelay ?? 2, "preparation delay");
    integer(config.finishDeadline ?? 200, "finish deadline");
    if (integer(config.adviceLifetime ?? 600_000, "advice lifetime") === 0)
      throw new RangeError("advice lifetime must be positive");
    integer(config.retention ?? 1000, "retention");
    this.state = initialCanonical(config.limits ?? defaults);
    if (this.session)
      for (const input of this.session.next(0)) this.enqueue(input);
    for (const input of this.config.inputs!) this.enqueue(input);
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
    this.queue.find(item => item.order === this.order - 1)!.generated = true;
  }
  applyControl(control: Control): ControlRecord {
    const value = validateLiveControl(control);
    if (value.kind === "fileTrees") {
      this.fileTrees = validateFileTreeProfile(value.profile);
    } else if (value.kind === "environment") {
      this.environment = { currentWork: value.currentWork, credentialReady: value.credentialReady,
        credentialGeneration: value.credentialGeneration ?? this.environment.credentialGeneration ?? 1,
        sourceReadable: value.sourceReadable ?? this.environment.sourceReadable ?? true };
      for (const work of this.projection.work) if (work.kind === "pendingFinding")
        this.validateAdvice(work.operation, work.round, work.operation, this.session ? "background" : "edit");
    } else if (value.kind === "outputProfile") {
      this.outputProfile = { outcome: value.outcome, delayMs: value.delayMs, leaseMs: value.leaseMs };
    } else if (value.kind === "jevProfile") {
      this.jevDelay = value.delayMs;
      if (value.outcome !== undefined) this.outcome = value.outcome;
      if (value.outcomeWeights !== undefined) { this.outcome = undefined; this.outcomeWeights = validateOutcomeWeights(value.outcomeWeights); }
    } else if (this.session) {
      for (const input of this.session.apply(value, this.clock))
        this.enqueue(input);
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
    if (item.input.kind === "preparationGraph") {
      const event = item.input.event;
      const before = this.projection;
      if (!before.work.some(work => work.operation === event.operation && work.kind === "preparing")) {
        this.preparation.retire(event.operation);
        return this.step(untilTime);
      }
      const preparation = this.preparation.step(event);
      return this.record({ sequence: this.count++, time: this.clock, event,
        preparation, before, after: before, commands: [], effects: [] });
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
      const scope = this.projection.rounds.find((r) => r.partition === 1);
      const round = scope?.id;
      if (item.input.kind === "finish") {
        if (round && !this.finish) {
          this.finish = {
            round,
            attempt: 100000 + this.count,
            token: 100000 + this.count,
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
      if (!round) {
        if (!this.queue.some(item => item.input.kind === "canonical" && item.input.event.kind === "openRound"))
          this.event({ kind: "openRound", partition: 1, lifetime: 1 });
        this.enqueue(
          {
            ...item.input,
            at: this.clock,
            ...("recurring" in item.input ? { recurring: false } : {}),
          },
          item.input,
        );
        return this.step(untilTime);
      }
      this.event(
        { kind: "admitObservation", partition: 1, lifetime: 1, round },
        0,
        item.input,
      );
      return this.step(untilTime);
    }
    let event = item.input.event;
    if (item.generated && event.kind === "jevRequestSettled") event = { ...event, currentWork: this.environment.currentWork };
    if (item.generated && event.kind === "jevRequestReady") event = { ...event, currentWork: this.environment.currentWork, credentialReady: this.environment.credentialReady };
    const before = this.projection;
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
        case "observationAdmitted": {
          if (!scope || !item.job)
            throw new Error("unhandled required command: observationAdmitted");
          this.jobs.set(command.id, item.job);
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
          const facts = item.job.unitBytes.flatMap((_bytes, unit) => {
            const tree = generateFileTree(this.config.seed!, command.operation, unit, this.fileTrees);
            return tree.facts.map((fact, step): PreparationEvent => ({
              kind: "preparationGraph", example: "generated", ...scope, operation: command.operation, unit, step, fact,
              generatedTree: { targetNames: tree.targetNames, files: tree.files.length, depth: tree.depth },
            }));
          });
          facts.forEach((preparation, index) => {
            // Inner facts share the operation's virtual interval, including zero-delay cases.
            const at = this.clock + Math.floor((this.config.preparationDelay ?? 2) * index / Math.max(1, facts.length));
            this.queue.push({ at, order: this.order++, input: { kind: "preparationGraph", at, event: preparation }, generated: true });
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
          this.event({ kind: "queueDispatch", ...scope, operation: command.operation });
          break;
        }
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
          if (outcome === "interrupted") this.event({ kind: "jevRequestInterrupted", ...binding }, this.jevDelay);
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
          if (event.kind === "collectionReady" && !this.finish)
            this.validateAdvice(event.advice, event.round, event.advice, this.session ? "background" : "edit");
          break;
        }
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
              this.event({ kind: "finishTerminal", group: 1, round: this.finish.round,
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
        case "submissionUnsuppressed": {
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
              this.event({ kind: "submissionBegin", advice: c.advice, group: 1, round: c.round,
                token: c.token, surface: c.surface, authorizeNow: c.surface !== "stop" && this.outputProfile.outcome !== "failed",
                fingerprints: [c.advice], units: [c.advice] });
            }
          }
          break;
        }
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
            work.partition === 1 && work.round === f.round && work.kind === "pendingFinding");
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
            group: 1,
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
              group: 1,
              round: f.round,
              token: f.token,
              surface: "stop",
              authorizeNow: false,
              fingerprints: [advice],
              units: [advice],
            });
          }
          if (this.outputProfile.outcome === "failed") {
            this.event({ kind: "finishRelease", group: 1, round: f.round, attempt: f.attempt, token: f.token }, this.outputProfile.delayMs);
            break;
          }
          this.event({
            kind: "finishAuthorize",
            group: 1,
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
            this.event({ kind: "finishTerminal", group: 1, round: f.round,
              attempt: f.attempt, token: f.token, selected: f.selected, outcome: "failed" }, profile.delayMs);
            for (const advice of f.selected) {
              this.event({ kind: "submissionRelease", advice, token: f.token }, profile.delayMs);
              this.event({ kind: "collectionReleaseLease", advice, token: f.token }, profile.delayMs);
            }
          } else {
            const due = Math.min(profile.delayMs, profile.leaseMs);
            if (profile.delayMs > profile.leaseMs)
              this.event({ kind: "deliveryAcknowledgeCheck", items: f.selected.length, anyExpired: true }, profile.delayMs);
            this.event({ kind: "finishTerminal", group: 1, round: f.round,
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
              group: 1,
              round: f.round,
            });
            this.event({
              kind: "finishEnd",
              group: 1,
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
    if (
      this.finish?.waiting &&
      [
        "preparationCompleted",
        "jevRequestSettled",
        "submissionTerminal",
        "collectionReleaseLease",
      ].includes(event.kind)
    )
      this.pollFinish();
    if (!result.rejection && this.session && (
      event.kind === "submissionTerminal" && result.commands.some((c) => c.kind === "submissionRecorded") ||
      event.kind === "finishTerminal" && event.outcome === "acknowledged" &&
        result.commands.some((c) => c.kind === "finishRecorded")))
      for (const input of this.session.onAdvice(this.clock))
        this.enqueue(input);
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
      if (before.dispatch.running.some(entry => entry.operation === event.operation))
        this.event({ kind: "dispatchSettled", partition: event.partition, lifetime: event.lifetime, round: event.round, operation: event.operation });
      this.issuedRequests.delete(event.request);
      this.requestCredentials.delete(event.operation);
      if (!this.projection.pendingFindings.some(finding => finding.operation === event.operation))
        this.jobs.delete(event.operation);
      effects.push({
        kind: "jev",
        phase: "supplied",
        operation: event.operation,
        request: event.request,
      });
    }
    const observation: Observation = {
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
    };
    return this.record(observation);
  }
  private record(observation: Observation): Observation {
    this.history.push(observation);
    const retention = this.config.retention ?? 1000;
    if (this.history.length > retention)
      this.history.splice(0, this.history.length - retention);
    for (const listener of this.listeners) listener(observation);
    return observation;
  }
  private finishBudget() {
    const f = this.finish;
    if (!f) return;
    this.event({ kind: "roundContinuationBudgetCheck", active: true,
      count: this.projection.delivery.counters.find(counter => counter.group === 1 && counter.round === f.round)?.used ?? 0 });
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
  private candidateEvent(event: Extract<CanonicalEvent, { kind: "finalCandidateCheck" | "submissionSuppressCheck" }>, candidate: CandidateContext) {
    this.queue.push({ at: this.clock, order: this.order++, generated: true,
      input: { at: this.clock, kind: "canonical", event }, candidate });
    this.queue.sort((a, b) => a.at - b.at || a.order - b.order);
  }
  private validateAdvice(advice: number, round: number, token: number, surface: "edit" | "background" | "stop", selection = false) {
    this.candidateEvent({ kind: "finalCandidateCheck", ownerCurrent: true,
      credentialGeneration: (this.adviceCredentials.get(advice) ?? 1) === (this.environment.credentialGeneration ?? 1),
      credentialAuthorized: this.environment.credentialReady, expired: false,
      workCurrent: this.environment.currentWork && (this.environment.sourceReadable ?? true), hasFindings: true }, { advice, round, token, surface, selection });
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
    this.queue.push({
      at: this.clock + delay,
      order: this.order++,
      finishAttempt: f.attempt,
      input: {
        at: this.clock + delay,
        kind: "canonical",
        event: {
          kind: "stopPolled",
          partition: 1,
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
      group: 1,
      lifetime: 1,
      round: f.round,
      scopes: [{ partition: 1, round: f.round }],
    });
    if (!continuation) {
      for (const work of this.projection.work)
        if (work.partition === 1 && work.round === f.round && work.kind === "pendingFinding")
          this.retireAdvice(work.operation);
      this.event({
        kind: "retirePartition",
        partition: 1,
        lifetime: 1,
        round: f.round,
      });
    }
    this.queue = this.queue.filter((item) => item.finishAttempt !== f.attempt);
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
