import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { randomUUID } from "node:crypto";
import { access, chmod, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { canonicalValue, type DirectObservation, type DirectRecipient } from "../direct-event/model.ts";
import {
  evaluatePrepared,
  prepareObservation,
  revalidateEvaluations,
  toCodexDirectEventOutput,
  type EvaluatedUnit,
  type Finding,
  type PreparedObservation,
  type RevalidationResult,
} from "../direct-event/pipeline.ts";
import { verifyObservationRoot } from "../direct-event/adapter.ts";
import type { PreparedUnit } from "../direct-event/model.ts";
import { MAX_TYPE_DECLARATIONS } from "../direct-event/analyzer.ts";
import type { AnalyzerMaterializationPreflight } from "../direct-event/analyzer.ts";
import { MAX_SOURCE_BYTES } from "../direct-event/capture.ts";
import { liveLayer as jevDecisionModelLiveLayer } from "../jev-decision.ts";
import { Consent } from "../runtime/consent.ts";
import { loadReviewSettings } from "../runtime/review-config.ts";
import {
  controlledDecisionModelLayer,
  type ControlledDecisionModelOptions,
} from "../test-support/controlled-decision-model.ts";
import {
  prepareResidentDirectory,
  residentPaths,
  verifyRemovableSocket,
  type ResidentPaths,
} from "./paths.ts";
import {
  DELIVERY_LEASE_MS,
  MAX_IPC_CONNECTIONS,
  MAX_IPC_FRAME_BYTES,
  decodeResidentRequest,
  type ResidentDispatchContext,
  type ResidentRequest,
  type ResidentResponse,
} from "./protocol.ts";
import {
  CapacityLedger,
  type CapacityReservation,
} from "./capacity.ts";
import { DispatchCycles } from "./dispatch.ts";
import { EvaluationReuse, residentEvaluationIdentity } from "./evaluation-reuse.ts";

const BACKEND_CONCURRENCY = 2;
const RESERVATION_OVERHEAD_BYTES = 1024;
const MAX_PROBABILITY_ENCODING_BYTES = 24;
/** Covers bounded dual capture buffers/text plus declaration-count preflight payload. */
const CAPTURE_WORKSPACE_BYTES = 8 * MAX_SOURCE_BYTES;

const captureWorkspaceBytes = (path: string): number =>
  CAPTURE_WORKSPACE_BYTES + MAX_TYPE_DECLARATIONS * (logicalBytes(path) + 512);

const analysisWorkspaceBytes = (
  path: string,
  sourceBytes: number,
  preflight: AnalyzerMaterializationPreflight | undefined,
  rules: unknown,
): number => {
  const declarations = preflight?.declarations ?? MAX_TYPE_DECLARATIONS;
  return captureWorkspaceBytes(path) +
    (preflight?.expandedUnitBytes ?? MAX_TYPE_DECLARATIONS * MAX_SOURCE_BYTES) +
    declarations * (
      logicalBytes(rules) + sourceBytes + 4 * logicalBytes(path) + 4096
    );
};

const ResidentControlledOptions = Schema.Struct({
  answers: Schema.optionalKey(Schema.Record(
    Schema.String,
    Schema.Union([
      Schema.Struct({ _tag: Schema.Literal("Probability"), probability: Schema.Number }),
      Schema.Struct({
        _tag: Schema.Literal("Classify"),
        label: Schema.String,
        probabilities: Schema.Record(Schema.String, Schema.Number),
        confidence: Schema.optionalKey(Schema.Number),
      }),
      Schema.Struct({
        _tag: Schema.Literal("Rate"),
        rating: Schema.Number,
        probabilities: Schema.Record(Schema.String, Schema.Number),
        confidence: Schema.optionalKey(Schema.Number),
      }),
    ]),
  )),
  delayMs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  failure: Schema.optionalKey(Schema.String),
  capturePath: Schema.optionalKey(Schema.String),
});

type IngressJob = {
  readonly kind: "ingress";
  readonly observation: DirectObservation;
  readonly partition: string;
  readonly reservation: CapacityReservation;
  readonly dispatch: ResidentDispatchContext;
};

type UnitJob = {
  readonly kind: "unit";
  readonly observation: DirectObservation;
  readonly partition: string;
  readonly reservation: CapacityReservation;
  readonly dispatch: ResidentDispatchContext;
  readonly prepared: PreparedUnit;
  revision: WorkRevision;
  readonly evaluationKey: string;
};

type Job = IngressJob | UnitJob;

type Advice = Omit<UnitJob, "dispatch" | "kind"> & {
  readonly id: string;
  evaluations: ReadonlyArray<EvaluatedUnit>;
  findings: ReadonlyArray<Finding>;
  encodedBytes: number;
  readonly cycle: number;
  readonly sequence: number;
  cycleComplete: boolean;
  retired: boolean;
  revalidationActive: boolean;
  delivery?: {
    readonly token: string;
    leaseUntil: number;
    acknowledged: boolean;
  };
};

type WorkRevision = {
  readonly subject: string;
  readonly token: string;
  readonly generation: number;
};

type CurrentWork = {
  readonly token: string;
  readonly generation: number;
  readonly input: PreparedUnit["input"];
  readonly members: number;
};

const recipientPartition = (root: string, recipient: DirectRecipient) => canonicalValue({
  root,
  host: recipient.host,
  hostVersion: recipient.hostVersion,
  sessionId: recipient.sessionId,
  agentId: recipient.agentId,
});

const workSubject = (partition: string, prepared: PreparedUnit): string => canonicalValue({
  partition,
  path: prepared.input.path,
  declaration: prepared.input.declaration.name,
});

const reservedRevision = (partition: string, prepared: PreparedUnit): WorkRevision => ({
  subject: workSubject(partition, prepared),
  token: "00000000-0000-0000-0000-000000000000",
  generation: Number.MAX_SAFE_INTEGER,
});

const worstCaseFindings = (prepared: PreparedUnit): ReadonlyArray<Finding> =>
  prepared.input.rules.flatMap((rule) => rule.threshold < 1
    ? [{
        path: prepared.input.path,
        declaration: prepared.input.declaration.name,
        ruleId: rule.id,
        probability: 1,
        message: rule.message,
        semanticIdentity: prepared.identity,
      }]
    : []);

export const residentUnitWorstOutcomeBytes = (prepared: PreparedUnit): number => {
  const findings = worstCaseFindings(prepared);
  return logicalBytes({ findings, output: toCodexDirectEventOutput(findings) }) +
    findings.length * MAX_PROBABILITY_ENCODING_BYTES;
};

const logicalBytes = (value: unknown): number =>
  Buffer.byteLength(canonicalValue(value), "utf8");

/** Exact retained logical charge, including complete input and promised outcome. */
export const residentUnitReservationBytes = (
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  prepared: PreparedUnit,
): number => {
  const findings = worstCaseFindings(prepared);
  const partition = recipientPartition(observation.root, observation.recipient);
  const evaluationKey = residentEvaluationIdentity(partition, prepared);
  const revision = reservedRevision(partition, prepared);
  const currentWork = {
    subject: revision.subject,
    token: revision.token,
    generation: revision.generation,
    input: prepared.input,
    members: 1,
  };
  const unitBytes = logicalBytes({
    kind: "unit",
    observation,
    partition,
    dispatch,
    prepared,
    revision,
    evaluationKey,
    currentWork,
  });
  const adviceBytes = logicalBytes({
    observation,
    partition,
    prepared,
    revision,
    evaluationKey,
    evaluations: [{ prepared, findings }],
    findings,
    encodedBytes: logicalBytes(toCodexDirectEventOutput(findings)),
    currentWork,
  }) + findings.length * MAX_PROBABILITY_ENCODING_BYTES;
  return Math.max(unitBytes, adviceBytes) +
    RESERVATION_OVERHEAD_BYTES;
};

const decodeControlledOptions = (
  value: ResidentDispatchContext["controlled"],
): ControlledDecisionModelOptions | undefined => {
  if (value === null) return undefined;
  try {
    return Schema.decodeUnknownSync(ResidentControlledOptions, { onExcessProperty: "error" })(value);
  } catch {
    return undefined;
  }
};

export class ResidentServer {
  readonly lifetime = randomUUID();
  readonly #advice: Array<Advice> = [];
  readonly #currentWork = new Map<string, CurrentWork>();
  readonly #ledger = new CapacityLedger();
  readonly #reuse: EvaluationReuse<UnitJob>;
  readonly #dispatcher: DispatchCycles<string, Job>;
  readonly #now: () => number;
  #server: Server | undefined;
  #connections = 0;
  #closed = false;
  #rejectedCapacity = 0;
  #peakLedgerBytes = 0;
  #maxMaterializedPreparedUnits = 0;
  #nextWorkGeneration = 1;
  readonly #beforeRevalidate: ((adviceId: string) => Promise<void>) | undefined;
  readonly #afterPrepare: (() => Promise<void>) | undefined;
  readonly #beforeEvaluate: ((prepared: PreparedUnit) => Promise<void>) | undefined;
  readonly #afterRevalidationWorkspaceReserved: ((adviceId: string) => Promise<void>) | undefined;
  readonly paths: ResidentPaths;

  constructor(
    paths: ResidentPaths = residentPaths(),
    now: () => number = () => performance.now(),
    options: {
      readonly beforeRevalidate?: (adviceId: string) => Promise<void>;
      readonly afterPrepare?: () => Promise<void>;
      readonly beforeEvaluate?: (prepared: PreparedUnit) => Promise<void>;
      readonly afterRevalidationWorkspaceReserved?: (adviceId: string) => Promise<void>;
    } = {},
  ) {
    this.paths = paths;
    this.#now = now;
    this.#beforeRevalidate = options.beforeRevalidate;
    this.#afterPrepare = options.afterPrepare;
    this.#beforeEvaluate = options.beforeEvaluate;
    this.#afterRevalidationWorkspaceReserved = options.afterRevalidationWorkspaceReserved;
    this.#reuse = new EvaluationReuse({
      reserve: (partition, bytes) => this.#reserve(partition, bytes),
      release: (reservation) => { this.#ledger.release(reservation); },
      logicalBytes,
    });
    this.#dispatcher = new DispatchCycles(
      BACKEND_CONCURRENCY,
      async (entry) => this.#run(entry.value, entry.cycle, entry.sequence),
      (cycle) => {
        for (const advice of this.#advice) {
          if (advice.cycle === cycle) advice.cycleComplete = true;
        }
      },
    );
  }

  stats(): Extract<ResidentResponse, { status: "stats" }> {
    const dispatch = this.#dispatcher.snapshot();
    const capacity = this.#ledger.snapshot();
    return {
      status: "stats",
      queued: dispatch.queued,
      running: dispatch.running,
      pendingAdvice: this.#advice.length,
      retainedBytes: capacity.bytes,
      rejectedCapacity: this.#rejectedCapacity,
    };
  }

  admit(observation: DirectObservation, dispatch: ResidentDispatchContext): ResidentResponse {
    if (this.#closed) return { status: "rejected-capacity" };
    const partition = recipientPartition(observation.root, observation.recipient);
    const reservation = this.#reserve(partition, logicalBytes({ observation, dispatch }) + RESERVATION_OVERHEAD_BYTES);
    if (reservation === undefined) {
      this.#rejectedCapacity += 1;
      return { status: "rejected-capacity" };
    }
    const job = {
      kind: "ingress" as const,
      observation,
      partition,
      reservation,
      dispatch,
    };
    if (!this.#dispatcher.enqueue(partition, job)) {
      this.#ledger.release(reservation);
      return { status: "rejected-capacity" };
    }
    const acceptedPath = process.env.REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH;
    if (acceptedPath !== undefined) void writeFile(acceptedPath, "accepted\n").catch(() => undefined);
    return { status: "accepted" };
  }

  async collect(
    root: string,
    recipient: DirectRecipient,
    dispatch: ResidentDispatchContext,
  ): Promise<ResidentResponse> {
    const partition = recipientPartition(root, recipient);
    const now = this.#now();
    for (const item of this.#advice) {
      if (item.delivery !== undefined && item.delivery.leaseUntil <= now) delete item.delivery;
    }
    const eligible = this.#advice.flatMap((item) =>
      item.partition === partition && item.delivery === undefined &&
        item.encodedBytes <= MAX_IPC_FRAME_BYTES - 1024
        ? [item.id]
        : []);
    for (const id of eligible) {
      const advice = this.#advice.find((item) => item.id === id && item.delivery === undefined);
      if (advice === undefined) continue;
      const token = randomUUID();
      advice.delivery = { token, leaseUntil: Number.POSITIVE_INFINITY, acknowledged: false };
      await this.#beforeRevalidate?.(advice.id);
      const validity = await this.#revalidate(advice, dispatch);
      const retained = this.#advice.find((item) => item.id === advice.id);
      if (retained !== advice || retained.delivery?.token !== token) continue;
      if (validity.status === "unavailable" || validity.status === "unattributed") {
        delete advice.delivery;
        continue;
      }
      if (validity.status === "stale") {
        this.#removeAdvice(advice.id, token);
        continue;
      }
      advice.evaluations = validity.evaluations;
      advice.findings = validity.findings;
      advice.encodedBytes = logicalBytes(toCodexDirectEventOutput(validity.findings));
      advice.delivery.leaseUntil = this.#now() + DELIVERY_LEASE_MS;
      return { status: "advice", token, output: toCodexDirectEventOutput(advice.findings) };
    }
    return { status: "empty" };
  }

  acknowledge(token: string): ResidentResponse {
    const advice = this.#advice.find((item) => item.delivery?.token === token);
    if (advice?.delivery === undefined) return { status: "empty" };
    if (advice.delivery.leaseUntil <= this.#now()) {
      delete advice.delivery;
      return { status: "empty" };
    }
    advice.delivery.acknowledged = true;
    return { status: "acknowledged" };
  }

  finalize(token: string): ResidentResponse {
    const advice = this.#advice.find((item) => item.delivery?.token === token);
    if (advice?.delivery === undefined || !advice.delivery.acknowledged) return { status: "empty" };
    if (advice.delivery.leaseUntil <= this.#now()) {
      delete advice.delivery;
      return { status: "empty" };
    }
    return this.#removeAdvice(advice.id, token) ? { status: "finalized" } : { status: "empty" };
  }

  releaseDelivery(token: string): void {
    const advice = this.#advice.find((item) => item.delivery?.token === token);
    if (advice !== undefined && advice.delivery?.acknowledged === false) delete advice.delivery;
  }

  whenIdle(): Promise<void> {
    return this.#dispatcher.whenIdle();
  }

  pendingAdviceMetadata(): ReadonlyArray<{
    readonly id: string;
    readonly partition: string;
    readonly cycle: number;
    readonly sequence: number;
    readonly cycleComplete: boolean;
    readonly retainedBytes: number;
    readonly generation: number;
    readonly evaluationIdentities: ReadonlyArray<string>;
    readonly path: string;
    readonly delivery: "available" | "leased-unacknowledged" | "leased-acknowledged";
  }> {
    return this.#advice.map((advice) => ({
      id: advice.id,
      partition: advice.partition,
      cycle: advice.cycle,
      sequence: advice.sequence,
      cycleComplete: advice.cycleComplete,
      retainedBytes: advice.reservation.bytes,
      generation: advice.revision.generation,
      evaluationIdentities: advice.evaluations.map(({ prepared }) => prepared.identity),
      path: advice.prepared.input.path,
      delivery: advice.delivery === undefined
        ? "available"
        : advice.delivery.acknowledged
          ? "leased-acknowledged"
          : "leased-unacknowledged",
    }));
  }

  accountingMetrics(): {
    readonly peakLedgerBytes: number;
    readonly maxMaterializedPreparedUnits: number;
    readonly successfulCacheEntries: number;
    readonly successfulCacheBytes: number;
    readonly pendingEvaluations: number;
  } {
    const reuse = this.#reuse.snapshot();
    return {
      peakLedgerBytes: this.#peakLedgerBytes,
      maxMaterializedPreparedUnits: this.#maxMaterializedPreparedUnits,
      successfulCacheEntries: reuse.entries,
      successfulCacheBytes: reuse.bytes,
      pendingEvaluations: reuse.pending,
    };
  }

  #reserve(partition: string, bytes: number): CapacityReservation | undefined {
    const reservation = this.#ledger.reserve(partition, bytes);
    if (reservation !== undefined) {
      this.#peakLedgerBytes = Math.max(this.#peakLedgerBytes, this.#ledger.snapshot().bytes);
    }
    return reservation;
  }

  #subject(partition: string, prepared: PreparedUnit): string {
    return workSubject(partition, prepared);
  }

  #registerCurrentWork(partition: string, prepared: PreparedUnit): WorkRevision {
    const subject = this.#subject(partition, prepared);
    const retained = this.#currentWork.get(subject);
    if (retained !== undefined && canonicalValue(retained.input) === canonicalValue(prepared.input)) {
      this.#currentWork.set(subject, { ...retained, members: retained.members + 1 });
      return { subject, token: retained.token, generation: retained.generation };
    }
    const generation = this.#nextWorkGeneration++;
    const token = randomUUID();
    this.#currentWork.set(subject, {
      token,
      generation,
      input: prepared.input,
      members: 1,
    });
    for (const advice of [...this.#advice]) {
      if (advice.revision.subject === subject && advice.revision.token !== token) {
        this.#removeAdvice(advice.id);
      }
    }
    return { subject, token, generation };
  }

  #restoreCurrentWork(partition: string, prepared: PreparedUnit): WorkRevision {
    const subject = this.#subject(partition, prepared);
    const retained = this.#currentWork.get(subject);
    if (retained !== undefined && canonicalValue(retained.input) === canonicalValue(prepared.input)) {
      return { subject, token: retained.token, generation: retained.generation };
    }
    const generation = this.#nextWorkGeneration++;
    const token = randomUUID();
    this.#currentWork.set(subject, { token, generation, input: prepared.input, members: 1 });
    for (const advice of [...this.#advice]) {
      if (advice.revision.subject === subject && advice.revision.token !== token) {
        this.#removeAdvice(advice.id);
      }
    }
    return { subject, token, generation };
  }

  #isCurrentWork(revision: WorkRevision, prepared: PreparedUnit): boolean {
    const retained = this.#currentWork.get(revision.subject);
    return retained !== undefined &&
      retained.token === revision.token &&
      canonicalValue(retained.input) === canonicalValue(prepared.input);
  }

  #releaseCurrentWork(revision: WorkRevision): void {
    const retained = this.#currentWork.get(revision.subject);
    if (retained === undefined || retained.token !== revision.token) return;
    if (retained.members <= 1) this.#currentWork.delete(revision.subject);
    else this.#currentWork.set(revision.subject, { ...retained, members: retained.members - 1 });
  }

  #releaseUnit(job: Pick<UnitJob, "reservation" | "revision">): void {
    if (this.#ledger.release(job.reservation)) this.#releaseCurrentWork(job.revision);
  }

  #removeAdvice(id: string, token?: string): boolean {
    const index = this.#advice.findIndex((item) =>
      item.id === id && (token === undefined || item.delivery?.token === token));
    if (index < 0) return false;
    const [removed] = this.#advice.splice(index, 1);
    if (removed !== undefined) {
      removed.retired = true;
      if (!removed.revalidationActive) this.#releaseUnit(removed);
    }
    return removed !== undefined;
  }

  async #run(job: Job, cycle: number, sequence: number): Promise<void> {
    if (job.kind === "ingress") return this.#prepare(job, cycle, sequence);
    return this.#evaluateUnit(job, cycle, sequence);
  }

  async #prepare(job: IngressJob, cycle: number, sequence: number): Promise<void> {
    try {
      await this.#awaitBackendGate();
      const userConfigPath = job.dispatch.userConfigPath ?? undefined;
      const controlled = decodeControlledOptions(job.dispatch.controlled);
      const settings = await Effect.runPromise(Effect.gen(function* () {
        const settings = yield* loadReviewSettings(
          job.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        if (job.dispatch.controlled !== null && controlled === undefined) return undefined;
        if (controlled === undefined && job.dispatch.credential?.name !== settings.credentialEnvVar) return undefined;
        if (controlled === undefined && job.dispatch.credential === null) return undefined;
        const consent = yield* Consent.Service;
        const authorization = yield* consent.authorize(
          job.observation.root,
          settings.backend,
          settings.destination,
        ).pipe(Effect.catch(() => Effect.succeed({ status: "denied" as const })));
        if (authorization.status !== "approved" || !(yield* verifyObservationRoot(job.observation))) return undefined;
        return settings;
      }).pipe(Effect.provide(Consent.layer({ statePath: job.dispatch.statePath }))));
      this.#ledger.release(job.reservation);
      if (settings === undefined || this.#closed) return;

      // A candidate path is captured and analyzed only while its maximum
      // supported logical workspace is charged. Processing candidates one at
      // a time prevents a 16-path event from materializing 1,024 complete
      // inputs outside the ledger.
      for (const candidate of job.observation.candidates) {
        const workspace = this.#reserve(job.partition, captureWorkspaceBytes(candidate.path));
        if (workspace === undefined) {
          this.#rejectedCapacity += 1;
          continue;
        }
        const pathObservation: DirectObservation = { ...job.observation, candidates: [candidate] };
        const server = this;
        let prepared: PreparedObservation;
        try {
          prepared = await Effect.runPromise(Effect.gen(function* () {
            const consent = yield* Consent.Service;
            return yield* prepareObservation(pathObservation, {
              controlledWriter: true,
              recipient: pathObservation.recipient,
              consent,
              settings,
              beforeAnalyze: (path, sourceBytes, preflight) => Effect.sync(() => {
                const required = analysisWorkspaceBytes(path, sourceBytes, preflight, settings.rules);
                const resized = server.#ledger.resize(workspace, required);
                if (resized) {
                  server.#peakLedgerBytes = Math.max(server.#peakLedgerBytes, server.#ledger.snapshot().bytes);
                } else {
                  server.#rejectedCapacity += 1;
                }
                return resized;
              }),
            });
          }).pipe(Effect.provide(Consent.layer({ statePath: job.dispatch.statePath }))));
        } catch (cause) {
          this.#ledger.release(workspace);
          throw cause;
        }
        const ready = prepared.outcomes.filter((outcome) => outcome.status === "ready");
        this.#maxMaterializedPreparedUnits = Math.max(this.#maxMaterializedPreparedUnits, ready.length);
        const deliverable = ready.filter((outcome) => {
          const accepted = residentUnitWorstOutcomeBytes(outcome.prepared) <= MAX_IPC_FRAME_BYTES - 1024;
          if (!accepted) this.#rejectedCapacity += 1;
          return accepted;
        });
        const planned = deliverable.map((outcome) => {
          const evaluationKey = this.#reuse.key(job.partition, outcome.prepared);
          if (this.#advice.some((advice) => advice.evaluationKey === evaluationKey)) {
            return { kind: "joined" as const, outcome, evaluationKey };
          }
          const pending = this.#reuse.pending(evaluationKey);
          if (pending !== undefined) {
            pending.revision = this.#restoreCurrentWork(job.partition, outcome.prepared);
            return { kind: "joined" as const, outcome, evaluationKey };
          }
          if (this.#reuse.hasPending(evaluationKey)) {
            return { kind: "joined" as const, outcome, evaluationKey };
          }
          const cached = this.#reuse.get(evaluationKey);
          if (cached !== undefined) return { kind: "cached" as const, outcome, evaluationKey, cached };
          this.#reuse.claim(evaluationKey);
          return { kind: "owner" as const, outcome, evaluationKey };
        });
        const retained = planned.filter((item) =>
          item.kind === "owner" || (item.kind === "cached" && item.cached.evaluation.findings.length > 0));
        const reservations = this.#ledger.replace(
          workspace,
          retained.map((item) =>
            residentUnitReservationBytes(pathObservation, job.dispatch, item.outcome.prepared)),
        );
        this.#peakLedgerBytes = Math.max(this.#peakLedgerBytes, this.#ledger.snapshot().bytes);
        for (const item of planned) {
          if (item.kind === "cached" && item.cached.evaluation.findings.length === 0) {
            const revision = this.#registerCurrentWork(job.partition, item.outcome.prepared);
            this.#releaseCurrentWork(revision);
          }
        }
        for (const [index, item] of retained.entries()) {
          const reservation = reservations[index];
          if (reservation === undefined) {
            if (item.kind === "owner") this.#reuse.releaseClaim(item.evaluationKey);
            this.#rejectedCapacity += 1;
            continue;
          }
          const revision = this.#registerCurrentWork(job.partition, item.outcome.prepared);
          const unit: UnitJob = {
            kind: "unit",
            observation: pathObservation,
            partition: job.partition,
            reservation,
            dispatch: job.dispatch,
            prepared: item.outcome.prepared,
            revision,
            evaluationKey: item.evaluationKey,
          };
          if (item.kind === "cached") {
            this.#retainAdvice(unit, {
              prepared: item.outcome.prepared,
              findings: item.cached.evaluation.findings,
            }, cycle, sequence);
            continue;
          }
          this.#reuse.attachPending(item.evaluationKey, unit);
          if (!this.#dispatcher.enqueue(job.partition, unit)) {
            this.#reuse.releaseClaim(item.evaluationKey);
            this.#releaseUnit(unit);
            this.#rejectedCapacity += 1;
          }
        }
      }
      await this.#afterPrepare?.();
      return;
    } catch (cause) {
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error(cause);
      this.#ledger.release(job.reservation);
    }
  }

  async #evaluateUnit(job: UnitJob, cycle: number, sequence: number): Promise<void> {
    try {
      await this.#awaitBackendGate();
      if (!this.#isCurrentWork(job.revision, job.prepared)) {
        this.#reuse.releaseClaim(job.evaluationKey);
        this.#releaseUnit(job);
        return;
      }
      await this.#beforeEvaluate?.(job.prepared);
      const userConfigPath = job.dispatch.userConfigPath ?? undefined;
      const controlled = decodeControlledOptions(job.dispatch.controlled);
      const result = await Effect.runPromise(Effect.gen(function* () {
        const settings = yield* loadReviewSettings(
          job.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        if (job.dispatch.controlled !== null && controlled === undefined) return undefined;
        if (controlled === undefined && job.dispatch.credential?.name !== settings.credentialEnvVar) return undefined;
        const credentialProvider = job.dispatch.credential === null
          ? undefined
          : ConfigProvider.layer(ConfigProvider.fromUnknown({
              [job.dispatch.credential.name]: job.dispatch.credential.value,
            }));
        if (controlled === undefined && credentialProvider === undefined) return undefined;
        const consent = yield* Consent.Service;
        const authorization = yield* consent.authorize(
          job.observation.root,
          settings.backend,
          settings.destination,
        ).pipe(Effect.catch(() => Effect.succeed({ status: "denied" as const })));
        if (authorization.status !== "approved" || !(yield* verifyObservationRoot(job.observation))) return undefined;
        const decisionModel = controlled === undefined
          ? jevDecisionModelLiveLayer({
              apiUrl: settings.apiBase,
              credentialEnvVar: settings.credentialEnvVar,
            })
          : controlledDecisionModelLayer(controlled);
        const evaluation = evaluatePrepared(job.prepared).pipe(Effect.provide(decisionModel));
        return yield* (credentialProvider === undefined
          ? evaluation
          : evaluation.pipe(Effect.provide(credentialProvider)));
      }).pipe(Effect.provide(Consent.layer({ statePath: job.dispatch.statePath }))));
      if (result?.status === "evaluated" && !this.#closed) {
        const evaluation = { prepared: job.prepared, findings: result.findings };
        this.#reuse.put(job.partition, job.evaluationKey, evaluation);
        this.#reuse.releaseClaim(job.evaluationKey);
        if (
          result.findings.length === 0 ||
          !this.#isCurrentWork(job.revision, job.prepared)
        ) {
          this.#releaseUnit(job);
          return;
        }
        this.#retainAdvice(job, evaluation, cycle, sequence);
        return;
      }
    } catch (cause) {
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error(cause);
    }
    this.#reuse.releaseClaim(job.evaluationKey);
    this.#releaseUnit(job);
  }

  #retainAdvice(
    job: UnitJob,
    evaluation: EvaluatedUnit,
    cycle: number,
    sequence: number,
  ): void {
    if (this.#advice.some((item) => item.evaluationKey === job.evaluationKey)) {
      this.#releaseUnit(job);
      return;
    }
    const output = toCodexDirectEventOutput(evaluation.findings);
    const advice: Advice = {
      id: randomUUID(),
      observation: job.observation,
      partition: job.partition,
      reservation: job.reservation,
      prepared: job.prepared,
      revision: job.revision,
      evaluationKey: job.evaluationKey,
      evaluations: [evaluation],
      findings: evaluation.findings,
      encodedBytes: logicalBytes(output),
      cycle,
      sequence,
      cycleComplete: false,
      retired: false,
      revalidationActive: false,
    };
    const insertion = this.#advice.findIndex((item) => item.sequence > sequence);
    if (insertion < 0) this.#advice.push(advice);
    else this.#advice.splice(insertion, 0, advice);
  }

  async #awaitBackendGate(): Promise<void> {
    const backendGatePath = process.env.REVIEW_RESIDENT_BACKEND_GATE_PATH;
    if (backendGatePath === undefined) return;
    while (true) {
      try {
        await access(backendGatePath);
        return;
      } catch {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
    }
  }

  async #revalidate(
    advice: Advice,
    dispatch: ResidentDispatchContext,
  ): Promise<RevalidationResult> {
    const candidate = advice.observation.candidates[0];
    if (candidate === undefined) return { status: "unavailable", findings: [] };
    const retainedBytes = advice.reservation.bytes;
    if (!this.#ledger.resize(
      advice.reservation,
      retainedBytes + captureWorkspaceBytes(candidate.path),
    )) return { status: "unavailable", findings: [] };
    this.#peakLedgerBytes = Math.max(this.#peakLedgerBytes, this.#ledger.snapshot().bytes);
    advice.revalidationActive = true;
    const server = this;
    let capacityUnavailable = false;
    try {
      await this.#afterRevalidationWorkspaceReserved?.(advice.id);
      const userConfigPath = dispatch.userConfigPath ?? undefined;
      const current = await Effect.runPromise(Effect.gen(function* () {
        const settings = yield* loadReviewSettings(
          advice.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        const consent = yield* Consent.Service;
        return yield* revalidateEvaluations(advice.observation, advice.evaluations, {
          controlledWriter: true,
          recipient: advice.observation.recipient,
          consent,
          settings,
          beforeAnalyze: (path, sourceBytes, preflight) => Effect.sync(() => {
            const required = analysisWorkspaceBytes(path, sourceBytes, preflight, settings.rules);
            const resized = server.#ledger.resize(advice.reservation, retainedBytes + required);
            if (resized) {
              server.#peakLedgerBytes = Math.max(server.#peakLedgerBytes, server.#ledger.snapshot().bytes);
            } else capacityUnavailable = true;
            return resized;
          }),
        }, {
          isCurrentWork: (prepared) => Effect.sync(() =>
            server.#isCurrentWork(advice.revision, prepared)),
        });
      }).pipe(Effect.provide(Consent.layer({ statePath: dispatch.statePath }))));
      return capacityUnavailable ? { status: "unavailable", findings: [] } : current;
    } catch {
      return { status: "unavailable", findings: [] };
    } finally {
      advice.revalidationActive = false;
      if (advice.retired) this.#releaseUnit(advice);
      else this.#ledger.resize(advice.reservation, retainedBytes);
    }
  }

  async handle(request: ResidentRequest): Promise<ResidentResponse> {
    if (request.operation === "hello") {
      return { status: "ready", lifetime: this.lifetime, pid: process.pid };
    }
    if (request.lifetime !== this.lifetime) return { status: "obsolete-lifetime" };
    if (request.operation === "admit") {
      return this.admit(request.observation, request.dispatch);
    }
    if (request.operation === "collect") return this.collect(request.root, request.recipient, request.dispatch);
    if (request.operation === "acknowledge") return this.acknowledge(request.token);
    if (request.operation === "finalize") return this.finalize(request.token);
    if (request.operation === "stats") return this.stats();
    if (request.operation === "shutdown") {
      setTimeout(() => void this.close(), 10);
      return { status: "acknowledged" };
    }
    return { status: "unsupported" };
  }

  async #responseGate(operation: ResidentRequest["operation"]): Promise<void> {
    const variable = operation === "collect"
      ? "REVIEW_RESIDENT_COLLECT_RESPONSE_GATE_PATH"
      : operation === "acknowledge"
        ? "REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH"
        : undefined;
    const gate = variable === undefined ? undefined : process.env[variable];
    if (gate === undefined) return;
    try {
      await access(`${gate}.enabled`);
    } catch {
      return;
    }
    await writeFile(`${gate}.entered`, "entered\n");
    while (true) {
      try {
        await access(`${gate}.release`);
        return;
      } catch {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
    }
  }

  #accept(socket: Socket): void {
    if (this.#connections >= MAX_IPC_CONNECTIONS) {
      socket.end(`${JSON.stringify({ status: "rejected-capacity" })}\n`);
      return;
    }
    this.#connections += 1;
    let bytes = 0;
    let encoded = "";
    let handled = false;
    socket.setTimeout(1_500, () => socket.destroy());
    socket.once("close", () => { this.#connections -= 1; });
    socket.on("error", () => undefined);
    socket.on("data", (chunk: Buffer) => {
      if (handled) return;
      bytes += chunk.byteLength;
      if (bytes > MAX_IPC_FRAME_BYTES) {
        handled = true;
        socket.end(`${JSON.stringify({ status: "rejected-capacity" })}\n`);
        return;
      }
      encoded += chunk.toString("utf8");
      const newline = encoded.indexOf("\n");
      if (newline < 0) return;
      handled = true;
      // Stop pulling transport bytes as soon as the single bounded frame is
      // complete. Recipient and observation decoding happens only afterward.
      socket.pause();
      const request = decodeResidentRequest(encoded.slice(0, newline));
      if (request === undefined) {
        socket.end(`${JSON.stringify({ status: "unsupported" })}\n`);
        return;
      }
      void this.handle(request).then(async (response) => {
        await this.#responseGate(request.operation);
        if (socket.destroyed) {
          if (response.status === "advice") this.releaseDelivery(response.token);
          return;
        }
        socket.end(`${JSON.stringify(response)}\n`, () => {
          if (socket.errored !== null && response.status === "advice") this.releaseDelivery(response.token);
        });
      }).catch(() => {
        if (!socket.destroyed) socket.end(`${JSON.stringify({ status: "unsupported" })}\n`);
      });
    });
  }

  async listen(): Promise<void> {
    if (process.platform !== "linux") throw new Error("resident profile supports Linux only");
    await prepareResidentDirectory(this.paths);
    // This process is launched under the live kernel lock. A socket pathname
    // alone is never treated as ownership evidence.
    await verifyRemovableSocket(this.paths);
    await rm(this.paths.socket, { force: true });
    const server = createServer((socket) => this.#accept(socket));
    server.maxConnections = MAX_IPC_CONNECTIONS;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.paths.socket, resolve);
    });
    this.#server = server;
    await chmod(this.paths.socket, 0o600);
    await writeFile(
      this.paths.owner,
      `${JSON.stringify({ pid: process.pid, lifetime: this.lifetime })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }

  async close(): Promise<void> {
    this.#closed = true;
    for (const job of this.#dispatcher.close()) {
      if (job.kind === "unit") {
        this.#reuse.releaseClaim(job.evaluationKey);
        this.#releaseUnit(job);
      }
      else this.#ledger.release(job.reservation);
    }
    for (const advice of this.#advice.splice(0)) {
      advice.retired = true;
      if (!advice.revalidationActive) this.#releaseUnit(advice);
    }
    // Running work may be interrupted by process exit or finish later. Clear
    // its logical ownership now; its eventual terminal release is idempotent.
    this.#reuse.clear();
    this.#ledger.clear();
    this.#currentWork.clear();
    const server = this.#server;
    if (server !== undefined) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(this.paths.socket, { force: true });
    await rm(this.paths.owner, { force: true });
  }
}
