import { validateLiveControl, type LiveControl } from "./controls.ts";
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
  "canonical-source-sha256:e869c377cd6bfb8dcc951defe1b82821fffcf3b98ba5101c8eb7a2c75c552d80";
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
      readonly advice: number;
    }
  | {
      readonly kind: "cancellation";
      readonly phase: "supplied";
      readonly operation: number;
    };
export type Observation = {
  readonly sequence: number;
  readonly time: number;
  readonly event: CanonicalEvent;
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
  readonly finishDeadline?: number;
  /** Synthetic retention clock; defaults to the resident’s ten-minute pending advice lifetime. */
  readonly adviceLifetime?: number;
  readonly jevDelay?: number;
  readonly outcome?: JevRequestOutcome;
  readonly retention?: number;
  readonly session?: SessionConfig;
};
export type Replay = {
  readonly endpoint: { readonly eventCount: number; readonly now: number };
  readonly format: typeof REPLAY_FORMAT;
  readonly randomAlgorithm: typeof RANDOM_ALGORITHM;
  readonly logicIdentity: typeof LOGIC_IDENTITY;
  readonly config: RunConfig;
  readonly controls: readonly ControlRecord[];
  readonly scheduledInputs: readonly {
    boundary: number;
    time: number;
    sequence: number;
    input: RunInput;
  }[];
};
type Scheduled = {
  at: number;
  order: number;
  input: RunInput;
  finishAttempt?: number;
  expiryAdvice?: number;
  job?: Extract<RunInput, { kind: "edit" }>;
};
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
  private outcome: JevRequestOutcome;
  constructor(config: RunConfig = {}) {
    if (config.session)
      this.session = new SessionGenerator({
        ...config.session,
        seed: config.session.seed ?? config.seed ?? 1,
      });
    this.outcome = config.outcome ?? "finding";
    this.config = copy({
      ...config,
      seed: config.seed ?? 1,
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
                outcome: "finding",
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
  }
  applyControl(control: Control): ControlRecord {
    const value = validateLiveControl(control);
    if (value.kind === "jevProfile") {
      this.jevDelay = value.delayMs;
      if (value.outcome !== undefined) this.outcome = value.outcome;
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
    if (!this.canonicalAllowed && this.queue[0]?.input.kind === "canonical")
      return;
    const item = this.queue.shift();
    if (!item) return;
    this.clock = item.at;
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
    const event = item.input.event;
    const before = this.projection;
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
          if (!work || !job || work.kind !== "sourceQueued")
            throw new Error("unhandled required command: dispatchStarted lacks synthetic source job");
          const scope = { partition: work.partition, lifetime: work.lifetime, round: work.round };
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
          this.event({
            kind: "startReview",
            ...scope,
            operation: command.operation,
          });
          this.event({
            kind: "jevRequestReady",
            ...scope,
            operation: command.operation,
            rootValid: true,
            configurationValid: true,
            credentialReady: true,
            selected: true,
            currentWork: true,
            physicalAvailable: true,
          });
          break;
        }
        case "jevRequestIssued": {
          this.issuedRequests.set(command.request, command);
          const { kind: _kind, ...binding } = command;
          const job = this.jobs.get(command.operation);
          effects.push({
            kind: "jev",
            phase: "started",
            operation: command.operation,
            request: command.request,
            due: this.clock + this.jevDelay,
          });
          this.event({ kind: "jevRequestStarted", ...binding });
          this.event(
            {
              kind: "jevRequestSettled",
              ...binding,
              outcome: job?.outcome ?? this.outcome,
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
          effects.push({ kind: "advice", phase: "supplied", advice });
          const lifetime = this.config.adviceLifetime ?? 600_000;
          this.event({ kind: "collectionExpiryCheck", elapsed: lifetime, lifetime },
            lifetime, undefined, advice);
          this.event({
            kind: "collectionReady",
            advice,
            already: false,
            turnEnd: false,
            cycleComplete: true,
            elapsed: 0,
            window: 200,
          });
          if (this.finish) break;
          this.event({ kind: "collectionReserveLease", advice, token: advice });
          this.event({
            kind: "submissionBegin",
            advice,
            group: 1,
            round: scope.round,
            token: advice,
            surface: this.session ? "background" : "edit",
            authorizeNow: true,
            fingerprints: [advice],
            units: [event.operation],
          });
          break;
        }
        case "submissionBegun":
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
            advice: event.advice,
          });
          this.event({
            kind: "submissionTerminal",
            advice: event.advice,
            token: event.token,
            certain: true,
          });
          this.event({
            kind: "collectionReleaseLease",
            advice: event.advice,
            token: event.token,
          });
          break;
        }
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
          f.selected =
            command.kind === "finishLimit"
              ? []
              : this.projection.pendingFindings
                  .filter(
                    (x) =>
                      !this.projection.delivery.submissions.batches.some(
                        (b) =>
                          b.advice === x.operation && b.phase === "submitted",
                      ),
                  )
                  .map((x) => x.operation);
          this.event({
            kind: "roundContinuationBudgetCheck",
            active: true,
            count:
              this.projection.delivery.counters.find(
                (counter) => counter.group === 1 && counter.round === f.round,
              )?.used ?? 0,
          });
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
          for (const advice of f.selected)
            this.event({ kind: "submissionAuthorize", advice, token: f.token });
          break;
        }
        case "submissionRecorded": {
          const f = this.finish;
          if (
            f &&
            event.kind === "submissionTerminal" &&
            event.token === f.token &&
            f.selected.every((advice) =>
              this.projection.delivery.submissions.batches.some(
                (b) =>
                  b.advice === advice &&
                  b.token === f.token &&
                  b.phase === "submitted",
              ),
            )
          )
            this.event({
              kind: "finishTerminal",
              group: 1,
              round: f.round,
              attempt: f.attempt,
              token: f.token,
              selected: f.selected,
              outcome: "acknowledged",
            });
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
    if (
      event.kind === "submissionTerminal" &&
      !result.rejection &&
      result.commands.some((c) => c.kind === "submissionRecorded") &&
      this.session
    )
      for (const input of this.session.onAdvice(this.clock))
        this.enqueue(input);
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
    this.history.push(observation);
    const retention = this.config.retention ?? 1000;
    if (this.history.length > retention)
      this.history.splice(0, this.history.length - retention);
    for (const listener of this.listeners) listener(observation);
    return observation;
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
    replay.logicIdentity !== LOGIC_IDENTITY
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
