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
import {
  collectionOrder,
  combinedFindingOutput,
  isCollectionEligible,
  isPendingAdviceExpired,
  selectFittingFindings,
  type CollectionMode,
} from "./collection.ts";

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
  readonly revision: WorkRevision;
};

type Job = IngressJob | UnitJob;

type Advice = Omit<UnitJob, "dispatch" | "kind"> & {
  readonly id: string;
  evaluations: ReadonlyArray<EvaluatedUnit>;
  findings: ReadonlyArray<Finding>;
  readonly cycle: number;
  readonly sequence: number;
  readonly pendingAt: number;
  cycleComplete: boolean;
  collectionEligible: boolean;
  retired: boolean;
  revalidationActive: boolean;
  delivery?: {
    readonly token: string;
    findings: ReadonlyArray<Finding>;
    leaseUntil: number;
    acknowledged: boolean;
  };
};

type WorkRevision = {
  readonly subject: string;
  readonly generation: number;
};

type CurrentWork = {
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

const withoutDeliveredFindings = (
  findings: ReadonlyArray<Finding>,
  delivered: ReadonlyArray<Finding>,
): ReadonlyArray<Finding> => {
  const counts = new Map<string, number>();
  for (const finding of delivered) {
    const key = canonicalValue(finding);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return findings.filter((finding) => {
    const key = canonicalValue(finding);
    const count = counts.get(key) ?? 0;
    if (count === 0) return true;
    if (count === 1) counts.delete(key);
    else counts.set(key, count - 1);
    return false;
  });
};

/** Exact retained logical charge, including complete input and promised outcome. */
export const residentUnitReservationBytes = (
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  prepared: PreparedUnit,
): number => {
  const findings = worstCaseFindings(prepared);
  return logicalBytes({
    observation,
    dispatch,
    evaluation: { prepared, findings },
    output: toCodexDirectEventOutput(findings),
  }) + findings.length * MAX_PROBABILITY_ENCODING_BYTES +
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
  readonly #dispatcher: DispatchCycles<string, Job>;
  readonly #now: () => number;
  #server: Server | undefined;
  #connections = 0;
  #closed = false;
  #rejectedCapacity = 0;
  #peakLedgerBytes = 0;
  #maxMaterializedPreparedUnits = 0;
  readonly #beforeRevalidate: ((adviceId: string) => Promise<void>) | undefined;
  readonly #afterPrepare: (() => Promise<void>) | undefined;
  readonly #beforeEvaluate: ((prepared: PreparedUnit) => Promise<void>) | undefined;
  readonly #afterRevalidationWorkspaceReserved: ((adviceId: string) => Promise<void>) | undefined;
  readonly #afterAdvicePending: ((adviceId: string) => Promise<void> | void) | undefined;
  readonly #beforeFinalRevalidate: ((adviceId: string) => Promise<void>) | undefined;
  readonly paths: ResidentPaths;

  constructor(
    paths: ResidentPaths = residentPaths(),
    now: () => number = () => performance.now(),
    options: {
      readonly beforeRevalidate?: (adviceId: string) => Promise<void>;
      readonly afterPrepare?: () => Promise<void>;
      readonly beforeEvaluate?: (prepared: PreparedUnit) => Promise<void>;
      readonly afterRevalidationWorkspaceReserved?: (adviceId: string) => Promise<void>;
      readonly afterAdvicePending?: (adviceId: string) => Promise<void> | void;
      readonly beforeFinalRevalidate?: (adviceId: string) => Promise<void>;
    } = {},
  ) {
    this.paths = paths;
    this.#now = now;
    this.#beforeRevalidate = options.beforeRevalidate;
    this.#afterPrepare = options.afterPrepare;
    this.#beforeEvaluate = options.beforeEvaluate;
    this.#afterRevalidationWorkspaceReserved = options.afterRevalidationWorkspaceReserved;
    this.#afterAdvicePending = options.afterAdvicePending;
    this.#beforeFinalRevalidate = options.beforeFinalRevalidate;
    this.#dispatcher = new DispatchCycles(
      BACKEND_CONCURRENCY,
      async (entry) => this.#run(entry.value, entry.cycle, entry.sequence),
      (cycle) => {
        for (const advice of this.#advice) {
          if (advice.cycle === cycle) {
            advice.cycleComplete = true;
            advice.collectionEligible = true;
          }
        }
      },
    );
  }

  stats(): Extract<ResidentResponse, { status: "stats" }> {
    this.#expirePending(this.#now());
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
    this.#expirePending(this.#now());
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
    mode: CollectionMode = "ordinary",
  ): Promise<ResidentResponse> {
    const partition = recipientPartition(root, recipient);
    const now = this.#now();
    this.#expirePending(now);
    for (const item of this.#advice) {
      if (item.delivery !== undefined && item.delivery.leaseUntil <= now) delete item.delivery;
    }
    const available = this.#advice.filter((item) =>
      item.partition === partition && item.delivery === undefined);
    const cycles = new Map<number, Array<Advice>>();
    for (const item of available) {
      const cohort = cycles.get(item.cycle) ?? [];
      cohort.push(item);
      cycles.set(item.cycle, cohort);
    }
    for (const cohort of cycles.values()) {
      const oldestPendingAt = cohort.reduce(
        (oldest, item) => Math.min(oldest, item.pendingAt),
        Number.POSITIVE_INFINITY,
      );
      for (const item of cohort) {
        if (isCollectionEligible(item, now, mode, oldestPendingAt)) item.collectionEligible = true;
      }
    }
    const eligible = available.filter((item) => item.collectionEligible)
      .sort(collectionOrder)
      .map((item) => item.id);
    const token = randomUUID();
    const selected: Array<Advice> = [];
    let selectedFindings: Array<Finding> = [];
    for (const id of eligible) {
      const advice = this.#advice.find((item) => item.id === id && item.delivery === undefined);
      if (advice === undefined) continue;
      // Scan past individual over-budget findings so one large item cannot
      // starve later bounded advice from the same or a later unit.
      if (selectFittingFindings(selectedFindings, advice.findings).length === 0) continue;
      advice.delivery = {
        token,
        findings: [],
        leaseUntil: Number.POSITIVE_INFINITY,
        acknowledged: false,
      };
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
      const handoffNow = this.#now();
      if (isPendingAdviceExpired(advice, handoffNow)) {
        this.#removeAdvice(advice.id, token);
        continue;
      }
      const fitting = selectFittingFindings(selectedFindings, advice.findings);
      if (fitting.length === 0) {
        delete advice.delivery;
        continue;
      }
      advice.delivery.findings = fitting;
      selectedFindings = [...selectedFindings, ...fitting];
      selected.push(advice);
    }
    if (selected.length > 0) {
      const final: Array<Advice> = [];
      let finalFindings: Array<Finding> = [];
      for (const advice of selected) {
        await this.#beforeFinalRevalidate?.(advice.id);
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
        const handoffNow = this.#now();
        if (isPendingAdviceExpired(advice, handoffNow)) {
          this.#removeAdvice(advice.id, token);
          continue;
        }
        const fitting = selectFittingFindings(finalFindings, advice.findings);
        if (fitting.length === 0) {
          delete advice.delivery;
          continue;
        }
        if (advice.delivery?.token !== token) continue;
        advice.delivery.findings = fitting;
        finalFindings = [...finalFindings, ...fitting];
        final.push(advice);
      }
      if (final.length > 0) {
        // No asynchronous work may occur after this handoff barrier. Earlier
        // members can expire or be superseded while a later member is doing
        // its final capture, so validate ownership and authority once more
        // using one final clock reading immediately before encoding.
        const handoffNow = this.#now();
        const handoff: Array<Advice> = [];
        for (const advice of final) {
          const retained = this.#advice.find((item) => item.id === advice.id);
          const delivery = retained?.delivery;
          if (retained !== advice || delivery?.token !== token) continue;
          if (isPendingAdviceExpired(advice, handoffNow)) {
            this.#removeAdvice(advice.id, token);
            continue;
          }
          if (!this.#isCurrentWork(advice.revision, advice.prepared)) {
            this.#removeAdvice(advice.id, token);
            continue;
          }
          if (delivery.findings.length === 0) {
            delete advice.delivery;
            continue;
          }
          delivery.leaseUntil = handoffNow + DELIVERY_LEASE_MS;
          handoff.push(advice);
        }
        if (handoff.length === 0) return { status: "empty" };
        return {
          status: "advice",
          token,
          output: combinedFindingOutput(handoff.map((advice) => advice.delivery?.findings ?? [])),
        };
      }
    }
    return { status: "empty" };
  }

  acknowledge(token: string): ResidentResponse {
    const now = this.#now();
    this.#expirePending(now);
    const advice = this.#advice.filter((item) => item.delivery?.token === token);
    if (advice.length === 0) return { status: "empty" };
    if (advice.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now)) {
      for (const item of advice) delete item.delivery;
      return { status: "empty" };
    }
    for (const item of advice) {
      if (item.delivery !== undefined) item.delivery.acknowledged = true;
    }
    return { status: "acknowledged" };
  }

  finalize(token: string): ResidentResponse {
    const now = this.#now();
    this.#expirePending(now);
    const advice = this.#advice.filter((item) => item.delivery?.token === token);
    if (advice.length === 0 || advice.some((item) => item.delivery?.acknowledged !== true)) {
      return { status: "empty" };
    }
    if (advice.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now)) {
      for (const item of advice) delete item.delivery;
      return { status: "empty" };
    }
    for (const item of advice) {
      const delivered = item.delivery?.findings ?? [];
      const remaining = withoutDeliveredFindings(item.findings, delivered);
      if (remaining.length === 0) {
        this.#removeAdvice(item.id, token);
        continue;
      }
      item.findings = remaining;
      item.evaluations = item.evaluations.map((evaluation) => ({
        ...evaluation,
        findings: withoutDeliveredFindings(evaluation.findings, delivered),
      })).filter((evaluation) => evaluation.findings.length > 0);
      delete item.delivery;
    }
    return { status: "finalized" };
  }

  releaseDelivery(token: string): void {
    for (const advice of this.#advice) {
      if (advice.delivery?.token === token && !advice.delivery.acknowledged) delete advice.delivery;
    }
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
    readonly pendingAt: number;
    readonly collectionEligible: boolean;
    readonly retainedBytes: number;
    readonly generation: number;
    readonly evaluationIdentities: ReadonlyArray<string>;
    readonly path: string;
    readonly pendingFindings: number;
    readonly deliveryFindings: number;
    readonly delivery: "available" | "leased-unacknowledged" | "leased-acknowledged";
  }> {
    return this.#advice.map((advice) => ({
      id: advice.id,
      partition: advice.partition,
      cycle: advice.cycle,
      sequence: advice.sequence,
      cycleComplete: advice.cycleComplete,
      pendingAt: advice.pendingAt,
      collectionEligible: advice.collectionEligible,
      retainedBytes: advice.reservation.bytes,
      generation: advice.revision.generation,
      evaluationIdentities: advice.evaluations.map(({ prepared }) => prepared.identity),
      path: advice.prepared.input.path,
      pendingFindings: advice.findings.length,
      deliveryFindings: advice.delivery?.findings.length ?? 0,
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
  } {
    return {
      peakLedgerBytes: this.#peakLedgerBytes,
      maxMaterializedPreparedUnits: this.#maxMaterializedPreparedUnits,
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
    return canonicalValue({
      partition,
      path: prepared.input.path,
      declaration: prepared.input.declaration.name,
    });
  }

  #registerCurrentWork(partition: string, prepared: PreparedUnit): WorkRevision {
    const subject = this.#subject(partition, prepared);
    const retained = this.#currentWork.get(subject);
    if (retained !== undefined && canonicalValue(retained.input) === canonicalValue(prepared.input)) {
      this.#currentWork.set(subject, { ...retained, members: retained.members + 1 });
      return { subject, generation: retained.generation };
    }
    const generation = (retained?.generation ?? 0) + 1;
    this.#currentWork.set(subject, {
      generation,
      input: prepared.input,
      members: (retained?.members ?? 0) + 1,
    });
    for (const advice of [...this.#advice]) {
      if (advice.revision.subject === subject && advice.revision.generation !== generation) {
        this.#removeAdvice(advice.id);
      }
    }
    return { subject, generation };
  }

  #isCurrentWork(revision: WorkRevision, prepared: PreparedUnit): boolean {
    const retained = this.#currentWork.get(revision.subject);
    return retained !== undefined &&
      retained.generation === revision.generation &&
      canonicalValue(retained.input) === canonicalValue(prepared.input);
  }

  #releaseCurrentWork(revision: WorkRevision): void {
    const retained = this.#currentWork.get(revision.subject);
    if (retained === undefined) return;
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

  #expirePending(now: number): void {
    for (const advice of [...this.#advice]) {
      if (isPendingAdviceExpired(advice, now)) this.#removeAdvice(advice.id);
    }
  }

  async #run(job: Job, cycle: number, sequence: number): Promise<void> {
    if (job.kind === "ingress") return this.#prepare(job);
    return this.#evaluateUnit(job, cycle, sequence);
  }

  async #prepare(job: IngressJob): Promise<void> {
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
        const reservations = this.#ledger.replace(
          workspace,
          deliverable.map((outcome) =>
            residentUnitReservationBytes(pathObservation, job.dispatch, outcome.prepared)),
        );
        this.#peakLedgerBytes = Math.max(this.#peakLedgerBytes, this.#ledger.snapshot().bytes);
        for (const [index, outcome] of deliverable.entries()) {
          const reservation = reservations[index];
          if (reservation === undefined) {
            this.#rejectedCapacity += 1;
            continue;
          }
          const revision = this.#registerCurrentWork(job.partition, outcome.prepared);
          const unit: UnitJob = {
            kind: "unit",
            observation: pathObservation,
            partition: job.partition,
            reservation,
            dispatch: job.dispatch,
            prepared: outcome.prepared,
            revision,
          };
          if (!this.#dispatcher.enqueue(job.partition, unit)) {
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
      if (
        result?.status === "evaluated" &&
        result.findings.length > 0 &&
        !this.#closed &&
        this.#isCurrentWork(job.revision, job.prepared)
      ) {
        const evaluations = [{ prepared: job.prepared, findings: result.findings }];
        const advice: Advice = {
          id: randomUUID(),
          observation: job.observation,
          partition: job.partition,
          reservation: job.reservation,
          prepared: job.prepared,
          revision: job.revision,
          evaluations,
          findings: result.findings,
          cycle,
          sequence,
          pendingAt: this.#now(),
          cycleComplete: false,
          collectionEligible: false,
          retired: false,
          revalidationActive: false,
        };
        const insertion = this.#advice.findIndex((item) => item.sequence > sequence);
        if (insertion < 0) this.#advice.push(advice);
        else this.#advice.splice(insertion, 0, advice);
        await this.#afterAdvicePending?.(advice.id);
        return;
      }
    } catch (cause) {
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error(cause);
    }
    this.#releaseUnit(job);
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
    if (request.operation === "collect") {
      return this.collect(request.root, request.recipient, request.dispatch, request.mode ?? "ordinary");
    }
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

  /** Synchronous last barrier after response gates and immediately before encoding. */
  #responseForHandoff(response: ResidentResponse): ResidentResponse {
    if (response.status !== "advice") return response;
    const now = this.#now();
    const handoff: Array<Advice> = [];
    for (const advice of [...this.#advice]) {
      if (advice.delivery?.token !== response.token) continue;
      if (isPendingAdviceExpired(advice, now) || !this.#isCurrentWork(advice.revision, advice.prepared)) {
        this.#removeAdvice(advice.id, response.token);
        continue;
      }
      if (advice.delivery.findings.length === 0) {
        delete advice.delivery;
        continue;
      }
      advice.delivery.leaseUntil = now + DELIVERY_LEASE_MS;
      handoff.push(advice);
    }
    return handoff.length === 0
      ? { status: "empty" }
      : {
          status: "advice",
          token: response.token,
          output: combinedFindingOutput(handoff.map((advice) => advice.delivery?.findings ?? [])),
        };
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
        const handoff = this.#responseForHandoff(response);
        if (socket.destroyed) {
          if (handoff.status === "advice") this.releaseDelivery(handoff.token);
          return;
        }
        socket.end(`${JSON.stringify(handoff)}\n`, () => {
          if (socket.errored !== null && handoff.status === "advice") this.releaseDelivery(handoff.token);
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
      if (job.kind === "unit") this.#releaseUnit(job);
      else this.#ledger.release(job.reservation);
    }
    for (const advice of this.#advice.splice(0)) {
      advice.retired = true;
      if (!advice.revalidationActive) this.#releaseUnit(advice);
    }
    // Running work may be interrupted by process exit or finish later. Clear
    // its logical ownership now; its eventual terminal release is idempotent.
    this.#ledger.clear();
    this.#currentWork.clear();
    const server = this.#server;
    if (server !== undefined) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(this.paths.socket, { force: true });
    await rm(this.paths.owner, { force: true });
  }
}
