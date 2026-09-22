import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { randomUUID } from "node:crypto";
import { access, appendFile, chmod, rm, writeFile } from "node:fs/promises";
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
  combinedReviewOutput,
  isCollectionEligible,
  isPendingAdviceExpired,
  selectFittingFindings,
  selectFittingNotices,
  type CollectionMode,
  type OperationalNotice,
  type OperationalNoticeKind,
} from "./collection.ts";
import { EvaluationReuse, residentEvaluationIdentity } from "./evaluation-reuse.ts";
import { operationalNoticeAdmission } from "./operational-notice-policy.ts";
import { readCredentialState, resolveCredential } from "../credentials/secret-service.ts";
import { recordActivity } from "../activity/status.ts";

const BACKEND_CONCURRENCY = 2;
const RESERVATION_OVERHEAD_BYTES = 1024;
const MAX_PROBABILITY_ENCODING_BYTES = 24;
export const OPERATIONAL_NOTICE_COOLDOWN_MS = 60_000;
export const MAX_OPERATIONAL_NOTICE_KEYS = 64;
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
  outcomePath: Schema.optionalKey(Schema.String),
  requireCredential: Schema.optionalKey(Schema.Boolean),
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
  readonly cycle: number;
  readonly sequence: number;
  readonly credentialGeneration: number | null;
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

type NoticeDelivery = {
  readonly token: string;
  leaseUntil: number;
  acknowledged: boolean;
};

type PendingNotice = {
  readonly id: string;
  value: OperationalNotice;
  readonly pendingAt: number;
  readonly sequence: number;
  delivery?: NoticeDelivery;
};

type NoticeCooldown = {
  readonly partition: string;
  readonly reservation: CapacityReservation;
  nextAllowedAt: number;
  suppressedCount: number;
  pending?: PendingNotice;
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

const addressableRecipient = (recipient: DirectRecipient): boolean =>
  recipient.host === "codex-cli" && recipient.hostVersion === "0.155.1" &&
  recipient.sessionId.length > 0 && recipient.turnId.length > 0 && recipient.toolUseId.length > 0;

const noticeReservationBytes = (key: string, partition: string): number => logicalBytes({
  indexKey: key,
  value: {
    partition,
    nextAllowedAt: Number.MAX_SAFE_INTEGER,
    suppressedCount: Number.MAX_SAFE_INTEGER,
    pending: {
      id: "00000000-0000-0000-0000-000000000000",
      value: { kind: "capacity", suppressedCount: Number.MAX_SAFE_INTEGER },
      pendingAt: Number.MAX_SAFE_INTEGER,
      sequence: Number.MAX_SAFE_INTEGER,
      delivery: {
        token: "00000000-0000-0000-0000-000000000000",
        leaseUntil: Number.MAX_SAFE_INTEGER,
        acknowledged: true,
      },
    },
  },
}) + RESERVATION_OVERHEAD_BYTES;

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
  readonly #noticeCooldowns = new Map<string, NoticeCooldown>();
  readonly #currentWork = new Map<string, CurrentWork>();
  readonly #ledger = new CapacityLedger();
  readonly #reuse: EvaluationReuse<UnitJob>;
  readonly #dispatcher: DispatchCycles<string, Job>;
  readonly #now: () => number;
  readonly #maximumOperationalNoticeKeys: number;
  #server: Server | undefined;
  #connections = 0;
  #lifecycle: "active" | "retiring" | "closed" = "active";
  #retirementScheduled = false;
  #rejectedCapacity = 0;
  #peakLedgerBytes = 0;
  #maxMaterializedPreparedUnits = 0;
  #nextWorkGeneration = 1;
  #nextNoticeSequence = 1;
  readonly #beforeRevalidate: ((adviceId: string) => Promise<void>) | undefined;
  readonly #afterPrepare: (() => Promise<void>) | undefined;
  readonly #beforeEvaluate: ((prepared: PreparedUnit) => Promise<void>) | undefined;
  readonly #afterRevalidationWorkspaceReserved: ((adviceId: string) => Promise<void>) | undefined;
  readonly #afterAdvicePending: ((adviceId: string) => Promise<void> | void) | undefined;
  readonly #beforeFinalRevalidate: ((adviceId: string) => Promise<void>) | undefined;
  readonly #afterAuthorizeBeforeCredential: (() => Promise<void>) | undefined;
  readonly #afterCredentialBeforeDispatch: (() => Promise<void>) | undefined;
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
      readonly afterAuthorizeBeforeCredential?: () => Promise<void>;
      readonly afterCredentialBeforeDispatch?: () => Promise<void>;
      readonly maximumOperationalNoticeKeys?: number;
    } = {},
  ) {
    const maximumOperationalNoticeKeys = options.maximumOperationalNoticeKeys ?? MAX_OPERATIONAL_NOTICE_KEYS;
    if (
      !Number.isSafeInteger(maximumOperationalNoticeKeys) ||
      maximumOperationalNoticeKeys < 1 ||
      maximumOperationalNoticeKeys > MAX_OPERATIONAL_NOTICE_KEYS
    ) {
      throw new RangeError(`maximumOperationalNoticeKeys must be an integer from 1 to ${MAX_OPERATIONAL_NOTICE_KEYS}`);
    }
    this.paths = paths;
    this.#now = now;
    this.#maximumOperationalNoticeKeys = maximumOperationalNoticeKeys;
    this.#beforeRevalidate = options.beforeRevalidate;
    this.#afterPrepare = options.afterPrepare;
    this.#beforeEvaluate = options.beforeEvaluate;
    this.#afterRevalidationWorkspaceReserved = options.afterRevalidationWorkspaceReserved;
    this.#afterAdvicePending = options.afterAdvicePending;
    this.#beforeFinalRevalidate = options.beforeFinalRevalidate;
    this.#afterAuthorizeBeforeCredential = options.afterAuthorizeBeforeCredential;
    this.#afterCredentialBeforeDispatch = options.afterCredentialBeforeDispatch;
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
          if (advice.cycle === cycle) {
            advice.cycleComplete = true;
            advice.collectionEligible = true;
          }
        }
      },
    );
  }

  stats(): Extract<ResidentResponse, { status: "stats" }> {
    const now = this.#now();
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    const dispatch = this.#dispatcher.snapshot();
    const capacity = this.#ledger.snapshot();
    const reuse = this.#reuse.snapshot();
    return {
      status: "stats",
      queued: dispatch.queued,
      running: dispatch.running,
      pendingAdvice: this.#advice.length + this.#pendingNoticeCount(),
      pendingFindingBatches: this.#advice.length,
      pendingOperationalNotices: this.#pendingNoticeCount(),
      retainedBytes: capacity.bytes,
      rejectedCapacity: this.#rejectedCapacity,
      successfulCacheEntries: reuse.entries,
      pendingEvaluations: reuse.pending,
      noticeCooldowns: this.#noticeCooldowns.size,
      currentWork: this.#currentWork.size,
    };
  }

  /**
   * Voluntary idle cleanup is an allowed loss boundary, but only after every
   * accepted outcome, delivery lease, pending evaluation and cooldown has
   * reached a terminal state. Successful cache entries are then discarded as
   * part of ending this lifetime; they never authorize source reconstruction.
   */
  cleanup(): "busy" | "cleaned" {
    if (this.#lifecycle !== "active") return "busy";
    const now = this.#now();
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    const dispatch = this.#dispatcher.snapshot();
    const reuse = this.#reuse.snapshot();
    const capacity = this.#ledger.snapshot();
    if (
      dispatch.queued !== 0 || dispatch.running !== 0 ||
      this.#advice.length !== 0 || this.#pendingNoticeCount() !== 0 ||
      reuse.pending !== 0 || this.#currentWork.size !== 0 ||
      this.#noticeCooldowns.size !== 0 || this.#connections > 1 ||
      capacity.items !== reuse.entries || capacity.bytes !== reuse.bytes
    ) return "busy";
    this.#reuse.clear();
    if (this.#ledger.snapshot().items !== 0) return "busy";
    // This synchronous state transition is the cleanup commit point. Node
    // cannot interleave another handler between the idle proof above and this
    // assignment; the response may be delayed, but this lifetime is already
    // obsolete and can acquire no new ownership.
    this.#lifecycle = "retiring";
    return "cleaned";
  }

  admit(observation: DirectObservation, dispatch: ResidentDispatchContext): ResidentResponse {
    const now = this.#now();
    this.#expirePending(now);
    // Reclaim cooldown state whose active guarantee and pending notice have
    // both ended before it can cause an otherwise-valid admission to fail.
    this.#pruneNoticeCooldowns(now);
    if (this.#lifecycle !== "active") return { status: "rejected-capacity" };
    const partition = recipientPartition(observation.root, observation.recipient);
    const reservation = this.#reserve(partition, logicalBytes({ observation, dispatch }) + RESERVATION_OVERHEAD_BYTES);
    if (reservation === undefined) {
      this.#rejectedCapacity += 1;
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, recipient: observation.recipient, lifetime: this.lifetime, stage: "unavailable" });
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
      this.#rejectedCapacity += 1;
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, recipient: observation.recipient, lifetime: this.lifetime, stage: "unavailable" });
      return { status: "rejected-capacity" };
    }
    const acceptedPath = process.env.REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH;
    if (acceptedPath !== undefined) void writeFile(acceptedPath, "accepted\n").catch(() => undefined);
    recordActivity({ statePath: dispatch.activityPath, root: observation.root, recipient: observation.recipient, lifetime: this.lifetime, stage: "pending" });
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
    this.#pruneNoticeCooldowns(now);
    const credentialGeneration = dispatch.credential?.generation ?? null;
    for (const item of [...this.#advice]) {
      if (item.partition === partition && item.credentialGeneration !== credentialGeneration) {
        this.#removeAdvice(item.id);
      }
    }
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
    let handoffFindings: Array<Finding> = [];
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
        handoffFindings = handoff.flatMap((advice) => advice.delivery?.findings ?? []);
      }
    }
    const handoffNow = this.#now();
    const notices = this.#leaseNotices(partition, token, handoffFindings, handoffNow);
    if (handoffFindings.length === 0 && notices.length === 0) return { status: "empty" };
    return {
      status: "advice",
      token,
      findingCount: handoffFindings.length,
      output: combinedReviewOutput(handoffFindings, notices.map((notice) => notice.value)),
    };
  }

  acknowledge(token: string): ResidentResponse {
    const now = this.#now();
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    const advice = this.#advice.filter((item) => item.delivery?.token === token);
    const notices = this.#noticesForToken(token);
    if (advice.length === 0 && notices.length === 0) return { status: "empty" };
    if (
      advice.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now) ||
      notices.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now)
    ) {
      for (const item of advice) delete item.delivery;
      for (const item of notices) delete item.delivery;
      return { status: "empty" };
    }
    for (const item of advice) {
      if (item.delivery !== undefined) item.delivery.acknowledged = true;
    }
    for (const item of notices) {
      if (item.delivery !== undefined) item.delivery.acknowledged = true;
    }
    return { status: "acknowledged" };
  }

  finalize(token: string): ResidentResponse {
    const now = this.#now();
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    const advice = this.#advice.filter((item) => item.delivery?.token === token);
    const notices = this.#noticesForToken(token);
    if (
      (advice.length === 0 && notices.length === 0) ||
      advice.some((item) => item.delivery?.acknowledged !== true) ||
      notices.some((item) => item.delivery?.acknowledged !== true)
    ) {
      return { status: "empty" };
    }
    if (
      advice.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now) ||
      notices.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now)
    ) {
      for (const item of advice) delete item.delivery;
      for (const item of notices) delete item.delivery;
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
    for (const item of notices) this.#removePendingNotice(item.id, token);
    return { status: "finalized" };
  }

  releaseDelivery(token: string): void {
    for (const advice of this.#advice) {
      if (advice.delivery?.token === token && !advice.delivery.acknowledged) delete advice.delivery;
    }
    for (const notice of this.#noticesForToken(token)) {
      if (notice.delivery?.token === token && !notice.delivery.acknowledged) delete notice.delivery;
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
    readonly successfulCacheEntries: number;
    readonly successfulCacheBytes: number;
    readonly pendingEvaluations: number;
    readonly operationalNoticeKeys: number;
    readonly pendingOperationalNotices: number;
    readonly operationalNoticeBytes: number;
  } {
    const reuse = this.#reuse.snapshot();
    return {
      peakLedgerBytes: this.#peakLedgerBytes,
      maxMaterializedPreparedUnits: this.#maxMaterializedPreparedUnits,
      successfulCacheEntries: reuse.entries,
      successfulCacheBytes: reuse.bytes,
      pendingEvaluations: reuse.pending,
      operationalNoticeKeys: this.#noticeCooldowns.size,
      pendingOperationalNotices: this.#pendingNoticeCount(),
      operationalNoticeBytes: [...this.#noticeCooldowns.values()].reduce(
        (total, cooldown) => total + cooldown.reservation.bytes,
        0,
      ),
    };
  }

  #pendingNoticeCount(): number {
    let count = 0;
    for (const cooldown of this.#noticeCooldowns.values()) {
      if (cooldown.pending !== undefined) count += 1;
    }
    return count;
  }

  #noticesForToken(token: string): Array<PendingNotice> {
    const notices: Array<PendingNotice> = [];
    for (const cooldown of this.#noticeCooldowns.values()) {
      if (cooldown.pending?.delivery?.token === token) notices.push(cooldown.pending);
    }
    return notices;
  }

  #removePendingNotice(id: string, token?: string): boolean {
    for (const cooldown of this.#noticeCooldowns.values()) {
      const pending = cooldown.pending;
      if (pending?.id !== id || (token !== undefined && pending.delivery?.token !== token)) continue;
      delete cooldown.pending;
      return true;
    }
    return false;
  }

  #leaseNotices(
    partition: string,
    token: string,
    findings: ReadonlyArray<Finding>,
    now: number,
  ): ReadonlyArray<PendingNotice> {
    const candidates = [...this.#noticeCooldowns.values()]
      .filter((cooldown) =>
        cooldown.partition === partition &&
        cooldown.pending !== undefined &&
        cooldown.pending.delivery === undefined)
      .flatMap((cooldown) => cooldown.pending === undefined ? [] : [cooldown.pending])
      .sort((left, right) => left.sequence - right.sequence);
    const selectedValues = selectFittingNotices(findings, [], candidates.map(({ value }) => value));
    const selected = candidates.slice(0, selectedValues.length);
    for (const notice of selected) {
      notice.delivery = {
        token,
        leaseUntil: now + DELIVERY_LEASE_MS,
        acknowledged: false,
      };
    }
    return selected;
  }

  #noticeKey(partition: string, kind: OperationalNoticeKind): string {
    return canonicalValue({ partition, kind });
  }

  #releaseNoticeCooldown(key: string): void {
    const cooldown = this.#noticeCooldowns.get(key);
    if (cooldown === undefined) return;
    this.#noticeCooldowns.delete(key);
    this.#ledger.release(cooldown.reservation);
  }

  #pruneNoticeCooldowns(now: number, exceptKey?: string): void {
    for (const [key, cooldown] of this.#noticeCooldowns) {
      const pending = cooldown.pending;
      if (pending !== undefined) {
        if (pending.delivery !== undefined && pending.delivery.leaseUntil <= now) delete pending.delivery;
        if (isPendingAdviceExpired(pending, now)) delete cooldown.pending;
      }
      if (key !== exceptKey && cooldown.pending === undefined && cooldown.nextAllowedAt <= now) {
        this.#releaseNoticeCooldown(key);
      }
    }
  }

  #recordOperationalFailure(
    observation: DirectObservation,
    kind: OperationalNoticeKind,
    now = this.#now(),
  ): void {
    if (this.#lifecycle !== "active" || !addressableRecipient(observation.recipient)) return;
    const partition = recipientPartition(observation.root, observation.recipient);
    const key = this.#noticeKey(partition, kind);
    this.#pruneNoticeCooldowns(now, key);
    const retained = this.#noticeCooldowns.get(key);
    const admission = operationalNoticeAdmission({
      now,
      existingNextAllowedAt: retained?.nextAllowedAt,
      keyCount: this.#noticeCooldowns.size,
      maximumKeys: this.#maximumOperationalNoticeKeys,
    });
    if (admission.action === "reject-full") return;
    if (retained !== undefined) {
      if (admission.action === "suppress") {
        retained.suppressedCount = Math.min(Number.MAX_SAFE_INTEGER, retained.suppressedCount + 1);
        return;
      }
      const suppressedCount = retained.suppressedCount;
      retained.nextAllowedAt = now + OPERATIONAL_NOTICE_COOLDOWN_MS;
      retained.suppressedCount = 0;
      if (retained.pending === undefined) {
        retained.pending = {
          id: randomUUID(),
          value: { kind, suppressedCount },
          pendingAt: now,
          sequence: this.#nextNoticeSequence++,
        };
      } else if (retained.pending.delivery === undefined) {
        retained.pending.value = {
          kind,
          suppressedCount: Math.min(
            Number.MAX_SAFE_INTEGER,
            retained.pending.value.suppressedCount + suppressedCount,
          ),
        };
      }
      return;
    }
    const reservation = this.#reserve(partition, noticeReservationBytes(key, partition));
    // Retention is best effort. In particular, do not recursively turn this
    // failed reservation into another capacity failure.
    if (reservation === undefined) return;
    this.#noticeCooldowns.set(key, {
      partition,
      reservation,
      nextAllowedAt: now + OPERATIONAL_NOTICE_COOLDOWN_MS,
      suppressedCount: 0,
      pending: {
        id: randomUUID(),
        value: { kind, suppressedCount: 0 },
        pendingAt: now,
        sequence: this.#nextNoticeSequence++,
      },
    });
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

  #expirePending(now: number): void {
    for (const advice of [...this.#advice]) {
      if (isPendingAdviceExpired(advice, now)) this.#removeAdvice(advice.id);
    }
  }

  async #run(job: Job, cycle: number, sequence: number): Promise<void> {
    if (job.kind === "ingress") return this.#prepare(job, cycle, sequence);
    return this.#evaluateUnit(job, cycle, sequence);
  }

  async #prepare(job: IngressJob, cycle: number, sequence: number): Promise<void> {
    let expectedActivityUnits = 0;
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
        const credentialRequired = controlled === undefined || controlled.requireCredential === true;
        if (credentialRequired && job.dispatch.credential?.name !== settings.credentialEnvVar) return undefined;
        if (credentialRequired && job.dispatch.credential === null) return undefined;
        const consent = yield* Consent.Service;
        const authorization = yield* consent.authorize(
          job.observation.root,
          settings.backend,
          settings.destination,
        ).pipe(Effect.catch(() => Effect.succeed({ status: "denied" as const })));
        if (authorization.status !== "approved" || !(yield* verifyObservationRoot(job.observation))) return undefined;
        if (
          credentialRequired && job.dispatch.credential !== null &&
          readCredentialState(job.dispatch.credential.statePath).generation !== job.dispatch.credential.generation
        ) return undefined;
        return settings;
      }).pipe(Effect.provide(Consent.layer({ statePath: job.dispatch.statePath }))));
      this.#ledger.release(job.reservation);
      if (settings === undefined || this.#lifecycle !== "active") {
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "unavailable" });
        return;
      }

      // A candidate path is captured and analyzed only while its maximum
      // supported logical workspace is charged. Processing candidates one at
      // a time prevents a 16-path event from materializing 1,024 complete
      // inputs outside the ledger.
      for (const candidate of job.observation.candidates) {
        const workspace = this.#reserve(job.partition, captureWorkspaceBytes(candidate.path));
        if (workspace === undefined) {
          this.#rejectedCapacity += 1;
          recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "unavailable" });
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
        if (ready.length === 0) {
          recordActivity({
            statePath: job.dispatch.activityPath,
            root: job.observation.root,
            recipient: job.observation.recipient,
            lifetime: this.lifetime,
            stage: prepared.observation.status === "incomplete" ? "incomplete" : "skipped",
          });
        }
        this.#maxMaterializedPreparedUnits = Math.max(this.#maxMaterializedPreparedUnits, ready.length);
        let rejectedDeliverable = false;
        const deliverable = ready.filter((outcome) => {
          const accepted = residentUnitWorstOutcomeBytes(outcome.prepared) <= MAX_IPC_FRAME_BYTES - 1024;
          if (!accepted) {
            this.#rejectedCapacity += 1;
            rejectedDeliverable = true;
          }
          return accepted;
        });
        const planned = deliverable.map((outcome) => {
          const generationPartition = `${job.partition}\0credential-generation:${job.dispatch.credential?.generation ?? "controlled"}`;
          const evaluationKey = this.#reuse.key(generationPartition, outcome.prepared);
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
        // Workspace has been released and all accepted unit reservations are
        // fixed, so best-effort notice retention cannot displace fresh work.
        if (rejectedDeliverable) {
          this.#recordOperationalFailure(job.observation, "capacity");
          recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "unavailable" });
        }
        for (const item of planned) {
          if (item.kind === "cached" && item.cached.evaluation.findings.length === 0) {
            const revision = this.#registerCurrentWork(job.partition, item.outcome.prepared);
            this.#releaseCurrentWork(revision);
            expectedActivityUnits += 1;
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "clear", completedUnits: 1 });
          } else if (item.kind === "joined") {
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "unavailable" });
          }
        }
        for (const [index, item] of retained.entries()) {
          const reservation = reservations[index];
          if (reservation === undefined) {
            if (item.kind === "owner") this.#reuse.releaseClaim(item.evaluationKey);
            this.#rejectedCapacity += 1;
            this.#recordOperationalFailure(job.observation, "capacity");
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "unavailable" });
            continue;
          }
          expectedActivityUnits += 1;
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
            recordActivity({
              statePath: job.dispatch.activityPath,
              root: job.observation.root,
              recipient: job.observation.recipient,
              lifetime: this.lifetime,
              stage: "findings",
              findings: item.cached.evaluation.findings.length,
              completedUnits: 1,
            });
            await this.#retainAdvice(unit, {
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
            this.#recordOperationalFailure(job.observation, "capacity");
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "unavailable", completedUnits: 1 });
          }
        }
      }
      if (expectedActivityUnits > 0) {
        recordActivity({
          statePath: job.dispatch.activityPath,
          root: job.observation.root,
          recipient: job.observation.recipient,
          lifetime: this.lifetime,
          stage: "pending",
          expectedUnits: expectedActivityUnits,
        });
      }
      await this.#afterPrepare?.();
      return;
    } catch (cause) {
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error(cause);
      this.#ledger.release(job.reservation);
      recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "unavailable" });
    }
  }

  async #evaluateUnit(job: UnitJob, cycle: number, sequence: number): Promise<void> {
    try {
      await this.#awaitBackendGate();
      if (!this.#isCurrentWork(job.revision, job.prepared)) {
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "incomplete", completedUnits: 1 });
        this.#reuse.releaseClaim(job.evaluationKey);
        this.#releaseUnit(job);
        return;
      }
      await this.#beforeEvaluate?.(job.prepared);
      const userConfigPath = job.dispatch.userConfigPath ?? undefined;
      const controlled = decodeControlledOptions(job.dispatch.controlled);
      const afterAuthorizeBeforeCredential = this.#afterAuthorizeBeforeCredential;
      const afterCredentialBeforeDispatch = this.#afterCredentialBeforeDispatch;
      const result = await Effect.runPromise(Effect.gen(function* () {
        const settings = yield* loadReviewSettings(
          job.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        if (job.dispatch.controlled !== null && controlled === undefined) return undefined;
        const credentialRequired = controlled === undefined || controlled.requireCredential === true;
        if (credentialRequired && job.dispatch.credential?.name !== settings.credentialEnvVar) return undefined;
        const dispatchCredential = job.dispatch.credential;
        if (credentialRequired && dispatchCredential === null) return undefined;
        const consent = yield* Consent.Service;
        const authorization = yield* consent.authorize(
          job.observation.root,
          settings.backend,
          settings.destination,
        ).pipe(Effect.catch(() => Effect.succeed({ status: "denied" as const })));
        if (authorization.status !== "approved" || !(yield* verifyObservationRoot(job.observation))) return undefined;
        if (afterAuthorizeBeforeCredential !== undefined) {
          yield* Effect.promise(afterAuthorizeBeforeCredential);
        }
        const credential = !credentialRequired || dispatchCredential === null
          ? undefined
          : yield* Effect.promise(() => resolveCredential({
              envVar: dispatchCredential.name,
              environmentOnly: dispatchCredential.environmentOnly,
              environmentValue: dispatchCredential.environmentValue,
              expectedGeneration: dispatchCredential.generation,
              statePath: dispatchCredential.statePath,
            }));
        if (credentialRequired && credential?.status !== "present") return undefined;
        if (credential?.status === "present") {
          const current = readCredentialState(dispatchCredential?.statePath);
          if (current.generation !== credential.generation ||
              (credential.source === "saved" && current.savedUseSuspended)) return undefined;
        }
        const credentialProvider = credential?.status !== "present"
          ? undefined
          : ConfigProvider.layer(ConfigProvider.fromUnknown({
              [settings.credentialEnvVar]: credential.value,
            }));
        if (controlled === undefined && credentialProvider === undefined) return undefined;
        const decisionModel = controlled === undefined
          ? jevDecisionModelLiveLayer({
              apiUrl: settings.apiBase,
              credentialEnvVar: settings.credentialEnvVar,
            })
          : controlledDecisionModelLayer(controlled);
        if (afterCredentialBeforeDispatch !== undefined) {
          yield* Effect.promise(afterCredentialBeforeDispatch);
        }
        const beforeDispatch = credential?.status !== "present"
          ? Effect.void
          : Effect.suspend(() => {
              const current = readCredentialState(dispatchCredential?.statePath);
              return current.generation === credential.generation &&
                  (credential.source === "environment" || !current.savedUseSuspended)
                ? Effect.void
                : Effect.fail(new Error("credential generation changed before provider dispatch"));
            });
        const evaluation = evaluatePrepared(job.prepared, beforeDispatch).pipe(
          Effect.provide(decisionModel),
        );
        return yield* (credentialProvider === undefined
          ? evaluation
          : evaluation.pipe(Effect.provide(credentialProvider)));
      }).pipe(Effect.provide(Consent.layer({ statePath: job.dispatch.statePath }))));
      if (result?.status === "evaluated" && this.#lifecycle === "active") {
        const evaluation = { prepared: job.prepared, findings: result.findings };
        this.#reuse.put(job.partition, job.evaluationKey, evaluation);
        this.#reuse.releaseClaim(job.evaluationKey);
        recordActivity({
          statePath: job.dispatch.activityPath,
          root: job.observation.root,
          recipient: job.observation.recipient,
          lifetime: this.lifetime,
          stage: result.findings.length === 0 ? "clear" : "findings",
          findings: result.findings.length,
          completedUnits: 1,
        });
        if (controlled?.outcomePath !== undefined) {
          const { sessionId, turnId, toolUseId, agentId } = job.observation.recipient;
          await appendFile(controlled.outcomePath, `${JSON.stringify({
            sessionId,
            turnId,
            toolUseId,
            agentId,
            outcome: result.findings.length === 0 ? "completed-clear" : "completed-findings",
          })}\n`, "utf8");
        }
        if (
          result.findings.length === 0 ||
          !this.#isCurrentWork(job.revision, job.prepared)
        ) {
          this.#releaseUnit(job);
          return;
        }
        await this.#retainAdvice(job, evaluation, cycle, sequence);
        return;
      }
      if (result?.status === "backend" || result?.status === "timeout") {
        this.#recordOperationalFailure(job.observation, "backend");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "unavailable", completedUnits: 1 });
      } else if (result === undefined) {
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "unavailable", completedUnits: 1 });
      }
    } catch (cause) {
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error(cause);
      recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, recipient: job.observation.recipient, lifetime: this.lifetime, stage: "unavailable", completedUnits: 1 });
    }
    this.#reuse.releaseClaim(job.evaluationKey);
    this.#releaseUnit(job);
  }

  #retainAdvice(
    job: UnitJob,
    evaluation: EvaluatedUnit,
    cycle: number,
    sequence: number,
  ): Promise<void> | void {
    if (this.#advice.some((item) => item.evaluationKey === job.evaluationKey)) {
      this.#releaseUnit(job);
      return;
    }
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
      cycle,
      sequence,
      credentialGeneration: job.dispatch.credential?.generation ?? null,
      pendingAt: this.#now(),
      cycleComplete: false,
      collectionEligible: false,
      retired: false,
      revalidationActive: false,
    };
    const insertion = this.#advice.findIndex((item) => item.sequence > sequence);
    if (insertion < 0) this.#advice.push(advice);
    else this.#advice.splice(insertion, 0, advice);
    return this.#afterAdvicePending?.(advice.id);
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
      return this.#lifecycle === "active"
        ? { status: "ready", lifetime: this.lifetime, pid: process.pid }
        : { status: "obsolete-lifetime" };
    }
    if (request.lifetime !== this.lifetime || this.#lifecycle !== "active") {
      return { status: "obsolete-lifetime" };
    }
    if (request.operation === "admit") {
      return this.admit(request.observation, request.dispatch);
    }
    if (request.operation === "collect") {
      return this.collect(request.root, request.recipient, request.dispatch, request.mode ?? "ordinary");
    }
    if (request.operation === "acknowledge") return this.acknowledge(request.token);
    if (request.operation === "finalize") return this.finalize(request.token);
    if (request.operation === "stats") return this.stats();
    if (request.operation === "cleanup") {
      const status = this.cleanup();
      return { status };
    }
    return { status: "unsupported" };
  }

  async #responseGate(operation: ResidentRequest["operation"]): Promise<void> {
    const variable = operation === "admit"
      ? "REVIEW_RESIDENT_ADMIT_RESPONSE_GATE_PATH"
      : operation === "cleanup"
        ? "REVIEW_RESIDENT_CLEANUP_RESPONSE_GATE_PATH"
        : operation === "collect"
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
    this.#pruneNoticeCooldowns(now);
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
    const findings = handoff.flatMap((advice) => advice.delivery?.findings ?? []);
    const notices = this.#noticesForToken(response.token);
    for (const notice of notices) {
      if (notice.delivery !== undefined) notice.delivery.leaseUntil = now + DELIVERY_LEASE_MS;
    }
    return findings.length === 0 && notices.length === 0
      ? { status: "empty" }
      : {
          status: "advice",
          token: response.token,
          findingCount: findings.length,
          output: combinedReviewOutput(findings, notices.map((notice) => notice.value)),
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
    let request: ResidentRequest | undefined;
    socket.setTimeout(1_500, () => socket.destroy());
    socket.once("close", () => {
      this.#connections -= 1;
      const closedPath = process.env.REVIEW_RESIDENT_COLLECT_DISCONNECT_PATH;
      if (
        closedPath !== undefined && request?.operation === "collect" &&
        request.recipient.toolUseId === "disconnect"
      ) void writeFile(closedPath, "closed\n").catch(() => undefined);
    });
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
      const decoded = decodeResidentRequest(encoded.slice(0, newline));
      request = decoded;
      if (decoded === undefined) {
        socket.end(`${JSON.stringify({ status: "unsupported" })}\n`);
        return;
      }
      void this.handle(decoded).then(async (response) => {
        await this.#responseGate(decoded.operation);
        const handoff = this.#responseForHandoff(response);
        if (socket.destroyed) {
          if (handoff.status === "advice") this.releaseDelivery(handoff.token);
          if (handoff.status === "cleaned") this.#scheduleRetirementClose();
          return;
        }
        socket.end(`${JSON.stringify(handoff)}\n`, () => {
          if (socket.errored !== null && handoff.status === "advice") this.releaseDelivery(handoff.token);
        });
        if (handoff.status === "cleaned") this.#scheduleRetirementClose();
      }).catch(() => {
        if (!socket.destroyed) socket.end(`${JSON.stringify({ status: "unsupported" })}\n`);
      });
    });
  }

  #scheduleRetirementClose(): void {
    if (this.#retirementScheduled) return;
    this.#retirementScheduled = true;
    setTimeout(() => void this.close(), 10);
  }

  async listen(): Promise<void> {
    if (process.platform !== "linux" && process.platform !== "darwin") {
      throw new Error(`resident IPC is unsupported on ${process.platform}; use Linux or macOS`);
    }
    await prepareResidentDirectory(this.paths);
    // The launcher holds the live-owner directory. A socket pathname alone is
    // never treated as ownership evidence.
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
    this.#lifecycle = "closed";
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
    this.#noticeCooldowns.clear();
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
