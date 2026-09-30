import { validateLiveControl } from "./controls.ts";
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
  "canonical-source-sha256:215e651c3ec3c961eb1d781e5e52276164cd62d53ab903794f85802eabb7c45f";
export type RunInput =
  | SessionInput
  | ({ readonly at: number; readonly generation?: number } & (
      | { readonly event: CanonicalEvent }
      | {
          readonly kind: "edit";
          readonly bytes: number;
          readonly unitBytes: readonly number[];
          readonly outcome?: JevRequestOutcome;
        }
      | { readonly kind: "finish" }
    ));
export type Control = Readonly<{ kind: string; [key: string]: unknown }>;
export type ControlRecord = {
  readonly control: Control;
  readonly time: number;
  readonly sequence: number;
  readonly boundary: number;
};
export type EffectObservation = {
  readonly kind: "preparation" | "jev" | "advice" | "output" | "cancellation";
  readonly phase: "started" | "supplied";
  readonly operation?: number;
  readonly request?: number;
  readonly advice?: number;
  readonly due?: number;
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
  readonly scheduledInputs: readonly { boundary: number; input: RunInput }[];
};
type Scheduled = {
  at: number;
  order: number;
  input: RunInput;
  job?: Extract<RunInput, { kind: "edit" }>;
};
const integer = (n: number, name: string) => {
  if (!Number.isSafeInteger(n) || n < 0 || n > 2 ** 48 - 1)
    throw new RangeError(`invalid ${name}`);
  return n;
};
const copy = <T>(x: T): T => structuredClone(x);
const defaults = {
  globalItems: 32,
  globalBytes: 100000,
  partitionItems: 16,
  partitionBytes: 50000,
};
/** Equal-time items follow insertion order; effects appended by a transition follow already queued items. */
export class Run {
  private state: unknown;
  private queue: Scheduled[] = [];
  private order = 0;
  private count = 0;
  private clock = 0;
  private history: Observation[] = [];
  private listeners = new Set<(o: Observation) => void>();
  private controls: ControlRecord[] = [];
  private externalInputs: { boundary: number; input: RunInput }[] = [];
  private issuedRequests = new Map<number, Extract<CanonicalCommand,{kind:"jevRequestIssued"}>>();
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
    this.externalInputs.push({ boundary: this.count, input: copy(input) });
  }
  private enqueue(input: RunInput, job?: Extract<RunInput, { kind: "edit" }>) {
    integer(input.at, "virtual time");
    if (input.at < this.clock)
      throw new RangeError("cannot schedule in the past");
    this.queue.push({
      at: input.at,
      order: this.order++,
      input: copy(input),
      ...(job ? { job } : {}),
    });
    this.queue.sort((a, b) => a.at - b.at || a.order - b.order);
  }
  private event(
    event: CanonicalEvent,
    delay = 0,
    job?: Extract<RunInput, { kind: "edit" }>,
  ) {
    this.enqueue({ at: this.clock + delay, event }, job);
  }
  applyControl(control: Control): ControlRecord {
    const value = copy(control);
    if (
      [
        "editPace",
        "burst",
        "suspendArrivals",
        "sizes",
        "sizes",
        "jevProfile",
      ].includes(value.kind)
    )
      validateLiveControl(value as never);
    if (value.kind === "jevDelay") {
      integer(value.delay as number, "Jev delay");
      this.jevDelay = value.delay as number;
    } else if (value.kind === "jevProfile") {
      integer(value.delayMs as number, "Jev delay");
      if (
        value.outcome !== undefined &&
        ![
          "neverSent",
          "finding",
          "clear",
          "backendFailure",
          "timeout",
          "interrupted",
        ].includes(value.outcome as string)
      )
        throw new RangeError("invalid outcome");
      this.jevDelay = value.delayMs as number;
      if (value.outcome !== undefined)
        this.outcome = value.outcome as JevRequestOutcome;
    } else if (
      ["editPace", "burst", "suspendArrivals", "sizes"].includes(value.kind) &&
      this.session
    ) {
      for (const input of this.session.apply(
        value as SessionControl,
        this.clock,
      ))
        this.enqueue(input);
    } else throw new Error(`unsupported control: ${value.kind}`);
    const record = {
      control: value,
      time: this.clock,
      sequence: this.controls.length,
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
    const item = this.queue.shift();
    if (!item) return;
    this.clock = item.at;
    if (this.session && !this.session.valid(item.input))
      return this.step(untilTime);
    if (!("event" in item.input)) {
      if ("recurring" in item.input && item.input.recurring && this.session)
        for (const input of this.session.next(this.clock)) this.enqueue(input);
      if (item.input.kind === "task") return this.step(untilTime);
      const scope = this.projection.rounds.find((r) => r.partition === 1);
      const round = scope?.id;
      if (item.input.kind === "finish") {
        if (round)
          this.event({
            kind: "stopPolled",
            partition: 1,
            lifetime: 1,
            round,
            deadline: false,
          });
        return this.step(untilTime);
      }
      if (!round) {
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
        {
          kind: "beginPreparation",
          partition: 1,
          lifetime: 1,
          round,
          bytes: item.input.bytes,
        },
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
          this.event({
            kind: "collectionReady",
            advice,
            already: false,
            turnEnd: false,
            cycleComplete: true,
            elapsed: 0,
            window: 200,
          });
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
        case "cancelWork":
          effects.push({
            kind: "cancellation",
            phase: "supplied",
            operation: command.operation,
          });
          break;
      }
    }
    if (
      event.kind === "submissionTerminal" &&
      !result.rejection &&
      result.commands.some((c) => c.kind === "submissionRecorded") &&
      this.session
    )
      for (const input of this.session.onAdvice(this.clock))
        this.enqueue(input);
    if (event.kind === "preparationCompleted")
      effects.push({
        kind: "preparation",
        phase: "supplied",
        operation: event.operation,
      });
    if (event.kind === "jevRequestSettled")
      effects.push({
        kind: "jev",
        phase: "supplied",
        operation: event.operation,
        request: event.request,
      });
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
  const controls = [...replay.controls];
  const inputs = [...replay.scheduledInputs];
  const step = run.step.bind(run);
  const flush = () => {
    while (inputs[0]?.boundary === run.eventCount)
      run.schedule(inputs.shift()!.input);
    while (controls[0]?.boundary === run.eventCount && controls[0].time <= run.now)
      run.applyControl(controls.shift()!.control);
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
