import { recordRoundClosure, type RoundCloseReason } from "../activity/status.ts";
import { monotonicNow } from "./hook-clock.ts";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import { createHash, randomUUID } from "node:crypto";
import { access, appendFile, chmod, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { canonicalValue, isCodexHostVersion, type DirectObservation, type DirectAdvicee } from "../direct-event/model.ts";
import {
  evaluatePrepared,
  encodedPreparedProviderInputBytes,
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
import { resolvedDirectFilePolicy, selectedByDirectFilePolicy } from "../direct-event/selection.ts";
import { liveLayer as jevDecisionModelLiveLayer } from "../jev-decision.ts";
import { Consent } from "../runtime/consent.ts";
import { loadReviewSettings } from "../runtime/review-config.ts";
import { loadConfiguration } from "../configuration/load.ts";
import { readCurrentClaudeFeedbackAuthority } from "../configuration/current-claude-authority.ts";
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
  type ResidentCollectionTicket,
  type ResidentUnavailableReason,
} from "./protocol.ts";
import {
  CapacityLedger,
  type CapacityReservation,
} from "./capacity.ts";
import { DispatchCycles } from "./dispatch.ts";
import { ComposedDelivery } from "./composed-delivery.ts";
import {
  collectionOrder,
  combinedClaudeOutput,
  combinedReviewOutput,
  isCollectionEligible,
  isPendingAdviceExpired,
  selectFittingFindings,
  selectFittingClaudeFindings,
  selectFittingClaudeNotices,
  selectFittingNotices,
  type ClaudeOutputMode,
  type CollectionMode,
  type OperationalNotice,
  type OperationalNoticeKind,
} from "./collection.ts";
import { EvaluationReuse, residentEvaluationIdentity } from "./evaluation-reuse.ts";
import { operationalNoticeAdmission } from "./operational-notice-policy.ts";
import {
  readCredentialState,
  resolveCredential,
  type CredentialResolution,
} from "../credentials/secret-service.ts";
import { recordActivity } from "../activity/status.ts";
import { claimDemoBudget } from "../onboarding/demo-budget.ts";
import { recordDemoTrace } from "../onboarding/demo-trace.ts";

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
  syntheticR6BrandedRepair: Schema.optionalKey(Schema.Literals(["control", "finding"])),
});

type WorkCohort = { readonly id: string; readonly controller: AbortController };
type RoundWork = {
  readonly group: string;
  readonly generation: number;
  readonly controller: AbortController;
  readonly partitions: Set<string>;
  work: WorkCohort;
  readonly discarded: { queued: number; running: number };
};

type IngressJob = {
  readonly round?: RoundWork;
  readonly work?: WorkCohort;
  completed?: boolean;
  readonly kind: "ingress";
  readonly observation: DirectObservation;
  readonly partition: string;
  readonly reservation: CapacityReservation;
  readonly dispatch: ResidentDispatchContext;
  readonly ticket?: TicketRecord;
};

type TicketUnitState =
  | { readonly state: "pending"; readonly revision?: WorkRevision }
  | { readonly state: "clear"; readonly revision: WorkRevision }
  | { readonly state: "finding"; readonly revision: WorkRevision; readonly adviceId: string; readonly delivered: boolean }
  | { readonly state: "unavailable"; readonly reason: ResidentUnavailableReason };
type TicketUnit = { current: TicketUnitState };
const unitUnavailable = (unit: TicketUnit, reason: ResidentUnavailableReason): void => {
  unit.current = { state: "unavailable", reason };
};
const unitRevision = (unit: TicketUnit, revision: WorkRevision): void => {
  if (unit.current.state === "pending") unit.current = { state: "pending", revision };
};
const unitClear = (unit: TicketUnit, revision: WorkRevision): void => {
  if (unit.current.state !== "unavailable") unit.current = { state: "clear", revision };
};
const unitFinding = (unit: TicketUnit, revision: WorkRevision, adviceId: string): void => {
  if (unit.current.state !== "unavailable") unit.current = { state: "finding", revision, adviceId, delivered: false };
};
type TicketRecord = { readonly ticket: ResidentCollectionTicket; readonly generation: number;
  readonly partition: string; readonly credentialGeneration: number | null;
  readonly root: string; readonly userConfigPath: string | null; readonly claudeFeedbackMode: ClaudeOutputMode;
  readonly credentialStatePath: string | null; readonly credentialRequired: boolean;
  readonly credentialEnvironmentOnly: boolean;
  readonly expiresAt: number; readonly units: Array<TicketUnit>;
  phase: { readonly state: "preparing"; readonly failure?: ResidentUnavailableReason }
    | { readonly state: "closed" }
    | { readonly state: "failed"; readonly reason: ResidentUnavailableReason } };
const ticketFail = (ticket: TicketRecord, reason: ResidentUnavailableReason): void => {
  if (ticket.phase.state === "preparing") ticket.phase = { state: "preparing", failure: ticket.phase.failure ?? reason };
};
const ticketClose = (ticket: TicketRecord): void => {
  if (ticket.phase.state !== "preparing") return;
  ticket.phase = ticket.phase.failure === undefined ? { state: "closed" }
    : { state: "failed", reason: ticket.phase.failure };
};
const TICKET_RETENTION_MS = 600_000;
const MAX_TICKETS = 256;

type UnitJob = {
  readonly round?: RoundWork;
  readonly work?: WorkCohort;
  completed?: boolean;
  readonly kind: "unit";
  readonly observation: DirectObservation;
  readonly partition: string;
  readonly reservation: CapacityReservation;
  readonly dispatch: ResidentDispatchContext;
  readonly prepared: PreparedUnit;
  readonly sourceHash?: string;
  revision: WorkRevision;
  readonly evaluationKey: string;
  readonly ticketUnit?: TicketUnit;
  readonly ticket?: TicketRecord;
};

type Job = IngressJob | UnitJob;

type Advice = Omit<UnitJob, "dispatch" | "kind" | "work" | "completed"> & {
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
  readonly deliveryGroup: string;
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

type DispatchAuthorityConsentStatus =
  | "not-checked"
  | "unavailable"
  | "approved"
  | "missing-consent"
  | "unsupported";

type DispatchAuthorityCredentialStatus = CredentialResolution["status"] | "not-checked" | "not-required";

type DispatchAuthorityObservation = {
  readonly kind: "dispatchAuthority";
  readonly sequence: number;
  readonly evaluationId: string;
  readonly path: string;
  readonly decision: "allow" | "deny";
  readonly reason: string;
  readonly policyDigest: string;
  readonly selected: boolean | null;
  readonly consentStatus: DispatchAuthorityConsentStatus;
  readonly consentIdentitySha256: string | null;
  readonly physicalRootVerified: boolean | null;
  readonly expectedRootIdentitySha256: string;
  readonly credentialStatus: DispatchAuthorityCredentialStatus;
  readonly credentialGeneration: number | null;
};

type DispatchAuthorityObservationDetails = {
  readonly decision: DispatchAuthorityObservation["decision"];
  readonly reason: string;
  readonly policyDigest: string;
  readonly selected: boolean | null;
  readonly consentStatus: DispatchAuthorityConsentStatus;
  readonly consentIdentity: { readonly root: string; readonly backend: string; readonly destination: string } | null;
  readonly physicalRootVerified: boolean | null;
  readonly credentialStatus: DispatchAuthorityCredentialStatus;
  readonly credentialGeneration: number | null;
};

const adviceePartition = (root: string, advicee: DirectAdvicee) => canonicalValue({
  root,
  host: advicee.host,
  hostVersion: advicee.hostVersion,
  sessionId: advicee.sessionId,
  subagentId: advicee.subagentId,
  ...(advicee.host !== "codex-cli" ? { toolUseId: advicee.toolUseId } : {}),
});

/** Delivery opportunities span a host session's attributed edits, not tool calls. */
const adviceeGroup = (root: string, advicee: DirectAdvicee) => canonicalValue({
  root,
  host: advicee.host,
  hostVersion: advicee.hostVersion,
  sessionId: advicee.sessionId,
  subagentId: advicee.subagentId,
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

const addressableAdvicee = (advicee: DirectAdvicee): boolean =>
  advicee.host !== "codex-cli"
    ? advicee.hostVersion === (advicee.host === "claude-code" ? "2.1.218" : "1.14.44") &&
      advicee.sessionId.length > 0 && advicee.toolUseId.length > 0
    : isCodexHostVersion(advicee.hostVersion) &&
      advicee.sessionId.length > 0 && advicee.turnId.length > 0 && advicee.toolUseId.length > 0;

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
  const partition = adviceePartition(observation.root, observation.advicee);
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
  readonly #noticeOwners = new Map<string, Set<string>>();
  readonly #currentWork = new Map<string, CurrentWork>();
  readonly #tickets = new Map<string, TicketRecord>();
  readonly #joinedTicketUnits = new Map<string, Array<TicketUnit>>();
  #nextAdmissionGeneration = 1;
  readonly #ledger = new CapacityLedger();
  readonly #reuse: EvaluationReuse<UnitJob>;
  readonly #dispatcher: DispatchCycles<string, Job>;
  readonly #roundActivity = new Map<string, { root: string; advicee: DirectAdvicee; activityPath: string | undefined }>();
  readonly #stopTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #rounds = new Map<string, RoundWork>();
  readonly #composedDelivery = new ComposedDelivery();
  readonly #now: () => number;
  readonly #maximumOperationalNoticeKeys: number;
  readonly #maximumTickets: number;
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
  readonly #dispatchAuthorityObserver: ((observation: DispatchAuthorityObservation) => void) | undefined;
  #nextDispatchAuthoritySequence = 1;
  readonly #offlineHttpClient: HttpClient.HttpClient | undefined;
  readonly #beforeResponseHandoff: (() => Promise<void>) | undefined;
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
      /** Fixture-only authority observation; never supplied by resident IPC. */
      readonly dispatchAuthorityObserver?: (observation: DispatchAuthorityObservation) => void;
      readonly maximumOperationalNoticeKeys?: number;
      /** Fixture-only HTTP transport; never supplied by resident IPC. */
      readonly offlineHttpClient?: HttpClient.HttpClient;
      readonly beforeResponseHandoff?: () => Promise<void>;
      readonly maximumTickets?: number;
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
    const maximumTickets = options.maximumTickets ?? MAX_TICKETS;
    if (!Number.isSafeInteger(maximumTickets) || maximumTickets < 1 || maximumTickets > MAX_TICKETS) {
      throw new RangeError(`maximumTickets must be an integer from 1 to ${MAX_TICKETS}`);
    }
    this.#maximumTickets = maximumTickets;
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
    this.#dispatchAuthorityObserver = options.dispatchAuthorityObserver;
    this.#offlineHttpClient = options.offlineHttpClient;
    this.#beforeResponseHandoff = options.beforeResponseHandoff;
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

  admit(observation: DirectObservation, dispatch: ResidentDispatchContext, ticketed = false, composed = false, requirePermit = false): ResidentResponse {
    const now = this.#now();
    this.#expirePending(now);
    // Reclaim cooldown state whose active guarantee and pending notice have
    // both ended before it can cause an otherwise-valid admission to fail.
    this.#pruneNoticeCooldowns(now);
    if (this.#lifecycle !== "active") return ticketed ? { version: 2, status: "rejected-capacity" } : { status: "rejected-capacity" };
    const group = adviceeGroup(observation.root, observation.advicee);
    const generation = composed ? this.#composedDelivery.admitEdit(group,
      observation.advicee.toolUseId, monotonicNow(), requirePermit) : undefined;
    if (composed && generation === undefined) {
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee,
        lifetime: this.lifetime, stage: "incomplete" });
      return ticketed ? { version: 2, status: "rejected-stale" } : { status: "rejected-stale" };
    }
    let round = composed ? this.#rounds.get(group) : undefined;
    if (generation !== undefined && round?.generation !== generation) {
      round = { group, generation, controller: new AbortController(), partitions: new Set(), work: { id: randomUUID(), controller: new AbortController() }, discarded: { queued: 0, running: 0 } };
      this.#rounds.set(group, round);
    }
    const partition = adviceePartition(observation.root, observation.advicee) +
      (generation === undefined ? "" : `\0round:${generation}`);
    round?.partitions.add(partition);
    if (round !== undefined) this.#roundActivity.set(group, { root: observation.root, advicee: observation.advicee, activityPath: dispatch.activityPath });
    const reservation = this.#reserve(partition, logicalBytes({ observation, dispatch }) + RESERVATION_OVERHEAD_BYTES);
    if (reservation === undefined) {
      this.#rejectedCapacity += 1;
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
      return ticketed ? { version: 2, status: "rejected-capacity" } : { status: "rejected-capacity" };
    }
    const ticket: TicketRecord | undefined = ticketed ? {
      ticket: { nonce: randomUUID(), lifetime: this.lifetime },
      generation: this.#nextAdmissionGeneration++, partition,
      root: observation.root, userConfigPath: dispatch.userConfigPath,
      claudeFeedbackMode: this.#currentClaudeFeedbackMode(observation.root, dispatch.userConfigPath),
      credentialGeneration: dispatch.credential?.generation ?? null,
      credentialStatePath: dispatch.credential?.statePath ?? null,
      credentialRequired: dispatch.controlled === null || dispatch.controlled.requireCredential === true,
      credentialEnvironmentOnly: dispatch.credential?.environmentOnly ?? false,
      expiresAt: now + TICKET_RETENTION_MS, phase: { state: "preparing" }, units: [],
    } : undefined;
    const job = {
      kind: "ingress" as const,
      ...(round === undefined ? {} : { round, work: round.work }),
      observation,
      partition,
      reservation,
      dispatch,
      ...(ticket === undefined ? {} : { ticket }),
    };
    if (!this.#dispatcher.enqueue(partition, job)) {
      this.#ledger.release(reservation);
      this.#rejectedCapacity += 1;
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
      return ticketed ? { version: 2, status: "rejected-capacity" } : { status: "rejected-capacity" };
    }
    if (ticket !== undefined) {
      this.#tickets.set(ticket.ticket.nonce, ticket);
      while (this.#tickets.size > this.#maximumTickets) {
        const oldest = this.#tickets.keys().next().value;
        if (oldest === undefined) break;
        this.#tickets.delete(oldest);
      }
    }
    const acceptedPath = process.env.REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH;
    if (acceptedPath !== undefined) void writeFile(acceptedPath, "accepted\n").catch(() => undefined);
    const admissionTracePath = process.env.REVIEW_RESIDENT_ADMISSION_TRACE_PATH;
    const admissionSalt = process.env.HAPSLAND_94_SALT;
    if (admissionTracePath !== undefined && admissionSalt !== undefined) {
      const key = (value: string) => createHash("sha256").update(`${admissionSalt}:${value}`).digest("hex");
      const { sessionId, toolUseId } = observation.advicee;
      if (typeof sessionId === "string" && typeof toolUseId === "string") {
        void appendFile(admissionTracePath, `${JSON.stringify({
          key: key(toolUseId), sessionKey: key(sessionId),
        })}\n`, "utf8").catch(() => undefined);
      }
    }
    recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: this.lifetime, stage: "pending" });
    return ticket === undefined ? { status: "accepted" } : { version: 2, status: "accepted", ticket: ticket.ticket };
  }

  collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode?: CollectionMode,
  ): Promise<Exclude<ResidentResponse, { readonly version: 2 }>>;
  collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    ticket: undefined,
    composed: true,
  ): Promise<Exclude<ResidentResponse, { readonly version: 2 }>>;
  collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    ticket: TicketRecord,
  ): Promise<ResidentResponse>;
  async collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode = "ordinary",
    ticket?: TicketRecord,
    composed = false,
  ): Promise<ResidentResponse> {
    const partition = composed ? adviceeGroup(root, advicee) : adviceePartition(root, advicee);
    const now = this.#now();
    if (composed && mode !== "turn-end" && this.#composedDelivery.isDeciding(partition)) return { status: "empty" };
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    const credentialGeneration = dispatch.credential?.generation ?? null;
    for (const item of [...this.#advice]) {
      if ((composed ? adviceeGroup(item.observation.root, item.observation.advicee) === partition
        : item.partition === partition) && item.credentialGeneration !== credentialGeneration) {
        this.#removeAdvice(item.id);
      }
    }
    // A background writer that already received authorization may still finish.
    // Stop reoffers that uncertain submission; old tokens cannot mutate its lease.
    // An unreserved collection lease remains exclusive.
    for (const item of this.#advice) {
      if (item.delivery !== undefined && (item.delivery.leaseUntil <= now ||
          (composed && mode === "turn-end" &&
            adviceeGroup(item.observation.root, item.observation.advicee) === partition &&
            this.#composedDelivery.backgroundOwns(item.id, item.delivery.token)))) delete item.delivery;
    }
    const available = this.#advice.filter((item) =>
      (composed ? adviceeGroup(item.observation.root, item.observation.advicee) === partition
        : item.partition === partition) && item.delivery === undefined &&
      item.findings.some((finding) => !this.#composedDelivery.suppresses(
        item.id, adviceeGroup(item.observation.root, item.observation.advicee), finding, composed && mode === "turn-end" ? "stop" : undefined)) &&
      (ticket === undefined || ticket.units.some((unit) => unit.current.state === "finding" && unit.current.adviceId === item.id)));
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
    const fittingFindings = (retained: ReadonlyArray<Finding>, candidates: ReadonlyArray<Finding>) =>
      ticket === undefined ? selectFittingFindings(retained, candidates)
        : selectFittingClaudeFindings(retained, candidates, ticket.claudeFeedbackMode);
    let handoffFindings: Array<Finding> = [];
    const selected: Array<Advice> = [];
    let selectedFindings: Array<Finding> = [];
    for (const id of eligible) {
      const advice = this.#advice.find((item) => item.id === id && item.delivery === undefined);
      if (advice === undefined) continue;
      // Scan past individual over-budget findings so one large item cannot
      // starve later bounded advice from the same or a later unit.
      if (fittingFindings(selectedFindings, advice.findings.filter((finding) =>
          !this.#composedDelivery.suppresses(advice.id,
            adviceeGroup(advice.observation.root, advice.observation.advicee), finding, composed && mode === "turn-end" ? "stop" : undefined))).length === 0) continue;
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
      const fitting = fittingFindings(selectedFindings, advice.findings.filter((finding) =>
        !this.#composedDelivery.suppresses(advice.id,
          adviceeGroup(advice.observation.root, advice.observation.advicee), finding, composed && mode === "turn-end" ? "stop" : undefined)));
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
        const fitting = fittingFindings(finalFindings, advice.findings.filter((finding) =>
          !this.#composedDelivery.suppresses(advice.id,
            adviceeGroup(advice.observation.root, advice.observation.advicee), finding, composed && mode === "turn-end" ? "stop" : undefined)));
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
          if (advice.credentialGeneration !== credentialGeneration) {
            this.#removeAdvice(advice.id, token);
            continue;
          }
          if (dispatch.credential !== null) {
            const credentialState = readCredentialState(dispatch.credential.statePath);
            if (credentialState === undefined || credentialState.generation !== credentialGeneration ||
                (!dispatch.credential.environmentOnly && credentialState.savedUseSuspended)) {
              delete advice.delivery;
              continue;
            }
          }
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
    const notices = this.#leaseNotices(partition, token, handoffFindings, handoffNow, ticket, composed);
    if (handoffFindings.length === 0 && notices.length === 0) return { status: "empty" };
    return ticket === undefined
      ? { status: "advice", token, findingCount: handoffFindings.length,
          output: combinedReviewOutput(handoffFindings, notices.map((notice) => notice.value)) }
      : { version: 2, status: "advice", token, findingCount: handoffFindings.length,
          output: combinedClaudeOutput(handoffFindings, notices.map((notice) => notice.value), ticket.claudeFeedbackMode) };
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
    this.#composedDelivery.markSubmitted(token);
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
    const composed = this.#composedDelivery.hasToken(token);
    for (const item of advice) {
      if (composed) {
        delete item.delivery;
        continue;
      }
      const delivered = item.delivery?.findings ?? [];
      const remaining = withoutDeliveredFindings(item.findings, delivered);
      if (remaining.length === 0) {
        for (const ticket of this.#tickets.values()) {
          for (const unit of ticket.units) {
            if (unit.current.state === "finding" && unit.current.adviceId === item.id) {
              unit.current = { ...unit.current, delivered: true };
            }
          }
        }
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

  beginComposedSubmission(token: string, surface: "edit" | "background" | "stop"): ResidentResponse {
    const now = this.#now();
    this.#expirePending(now);
    if (this.#composedDelivery.hasToken(token)) return { status: "empty" };
    const advice = this.#advice.filter((item) =>
      item.delivery?.token === token && item.delivery.leaseUntil > now &&
      item.delivery.findings.length > 0);
    if (advice.length === 0 || advice.some((item) => !this.#roundActive(item.round) ||
        !this.#composedDelivery.canSubmit(adviceeGroup(item.observation.root, item.observation.advicee), surface))) return { status: "empty" };
    if (surface === "stop") {
      const group = adviceeGroup(advice[0]!.observation.root, advice[0]!.observation.advicee);
      if (!this.#composedDelivery.authorizeFinishOutput(group, token)) return { status: "empty" };
    }
    for (const item of advice) {
      this.#composedDelivery.beginSubmission(
        item.id, adviceeGroup(item.observation.root, item.observation.advicee),
        token, item.delivery?.findings ?? [], surface, now,
      );
    }
    return { status: "submitting" };
  }

  releaseComposedSubmission(token: string): ResidentResponse {
    this.#composedDelivery.release(token);
    this.releaseDelivery(token);
    return { status: "released" };
  }

  #collectionWorkState(root: string, advicee: DirectAdvicee, composed = false): { readonly status: "pending" | "empty" } {
    const partition = composed ? adviceeGroup(root, advicee) : adviceePartition(root, advicee);
    return (composed && this.#composedDelivery.hasPendingEdits(partition)) || (composed
      ? this.#dispatcher.hasWorkWhere(({ value }) =>
          adviceeGroup(value.observation.root, value.observation.advicee) === partition && !value.completed && this.#jobActive(value))
      : this.#dispatcher.hasWork(partition)) ||
      this.#advice.some((item) =>
        (composed ? adviceeGroup(item.observation.root, item.observation.advicee) === partition
          : item.partition === partition) && item.delivery !== undefined) ||
      [...this.#noticeCooldowns.values()].some((notice) =>
        (composed ? notice.deliveryGroup === partition : notice.partition === partition) && notice.pending?.delivery !== undefined)
      ? { status: "pending" }
      : { status: "empty" };
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
      this.#noticeOwners.delete(id);
      return true;
    }
    return false;
  }

  #leaseNotices(
    partition: string,
    token: string,
    findings: ReadonlyArray<Finding>,
    now: number,
    ticket?: TicketRecord,
    composed = false,
  ): ReadonlyArray<PendingNotice> {
    const candidates = [...this.#noticeCooldowns.values()]
      .filter((cooldown) =>
        (composed ? cooldown.deliveryGroup === partition : cooldown.partition === partition) &&
        cooldown.pending !== undefined &&
        cooldown.pending.delivery === undefined &&
        (ticket === undefined || this.#noticeOwners.get(cooldown.pending.id)?.has(ticket.ticket.nonce) === true))
      .flatMap((cooldown) => cooldown.pending === undefined ? [] : [cooldown.pending])
      .sort((left, right) => left.sequence - right.sequence);
    const candidateValues = candidates.map(({ value }) => value);
    const selectedValues = ticket === undefined
      ? selectFittingNotices(findings, [], candidateValues)
      : selectFittingClaudeNotices(findings, candidateValues, ticket.claudeFeedbackMode);
    const selected = candidates.filter((candidate) => selectedValues.includes(candidate.value));
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
    if (cooldown.pending !== undefined) this.#noticeOwners.delete(cooldown.pending.id);
    this.#noticeCooldowns.delete(key);
    this.#ledger.release(cooldown.reservation);
  }

  #pruneNoticeCooldowns(now: number, exceptKey?: string): void {
    for (const [key, cooldown] of this.#noticeCooldowns) {
      const pending = cooldown.pending;
      if (pending !== undefined) {
        if (pending.delivery !== undefined && pending.delivery.leaseUntil <= now) delete pending.delivery;
        if (isPendingAdviceExpired(pending, now)) {
          this.#noticeOwners.delete(pending.id);
          delete cooldown.pending;
        }
      }
      if (key !== exceptKey && cooldown.pending === undefined && cooldown.nextAllowedAt <= now) {
        this.#releaseNoticeCooldown(key);
      }
    }
  }

  #recordOperationalFailure(
    observation: DirectObservation,
    kind: OperationalNoticeKind,
    ticket?: TicketRecord,
    now = this.#now(),
  ): void {
    if (this.#lifecycle !== "active" || !addressableAdvicee(observation.advicee)) return;
    const partition = adviceePartition(observation.root, observation.advicee);
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
        if (ticket !== undefined) this.#noticeOwners.set(retained.pending.id, new Set([ticket.ticket.nonce]));
      } else if (retained.pending.delivery === undefined) {
        retained.pending.value = {
          kind,
          suppressedCount: Math.min(
            Number.MAX_SAFE_INTEGER,
            retained.pending.value.suppressedCount + suppressedCount,
          ),
        };
        if (ticket !== undefined) {
          const owners = this.#noticeOwners.get(retained.pending.id) ?? new Set<string>();
          owners.add(ticket.ticket.nonce);
          this.#noticeOwners.set(retained.pending.id, owners);
        }
      }
      return;
    }
    const reservation = this.#reserve(partition, noticeReservationBytes(key, partition));
    // Retention is best effort. In particular, do not recursively turn this
    // failed reservation into another capacity failure.
    if (reservation === undefined) return;
    this.#noticeCooldowns.set(key, {
      partition,
      deliveryGroup: adviceeGroup(observation.root, observation.advicee),
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
    const pending = this.#noticeCooldowns.get(key)?.pending;
    if (ticket !== undefined && pending !== undefined) this.#noticeOwners.set(pending.id, new Set([ticket.ticket.nonce]));
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
    for (const ticket of this.#tickets.values()) {
      for (const unit of ticket.units) {
        const revision = "revision" in unit.current ? unit.current.revision : undefined;
        if (revision?.subject === subject && revision.token !== token) {
          unitUnavailable(unit, "stale");
        }
      }
    }
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
      this.#composedDelivery.forget(id);
      for (const ticket of this.#tickets.values()) {
        for (const unit of ticket.units) {
          if (unit.current.state === "finding" && unit.current.adviceId === id && !unit.current.delivered) {
            unitUnavailable(unit, isPendingAdviceExpired(removed, this.#now()) ? "expired" : "stale");
          }
        }
      }
      removed.retired = true;
      if (!removed.revalidationActive) this.#releaseUnit(removed);
    }
    return removed !== undefined;
  }

  #expirePending(now: number): void {
    this.#composedDelivery.expire(now);
    for (const advice of [...this.#advice]) {
      if (isPendingAdviceExpired(advice, now)) this.#removeAdvice(advice.id);
    }
  }

  #roundActive(round: RoundWork | undefined): boolean {
    return round === undefined || (!round.controller.signal.aborted &&
      this.#composedDelivery.isActive(round.group, round.generation));
  }

  #allowFinish(group: string, token: string, reason: RoundCloseReason): void {
    const counts = this.#composedDelivery.closureCounts(group);
    const closed = this.#composedDelivery.finishStop(group, token, true);
    if (closed !== undefined) this.#closeRound(group, closed, reason, counts);
  }

  #jobActive(job: Job): boolean {
    return !job.work?.controller.signal.aborted && this.#roundActive(job.round);
  }

  /** Cut off the pre-decision work cohort without retiring completed advice. */
  #discardUnfinishedWork(round: RoundWork): void {
    const work = round.work;
    const counts = this.#dispatcher.snapshotWhere(({ value }) => value.work === work && !value.completed);
    round.discarded.queued += counts.queued;
    round.discarded.running += counts.running;
    work.controller.abort();
    round.work = { id: randomUUID(), controller: new AbortController() };
    const discarded = this.#dispatcher.discardWhere(({ value }) => value.work === work);
    for (const job of discarded) {
      // A completed item can still be unwinding its instrumentation callback.
      if (job.completed) continue;
      if (job.ticket !== undefined) ticketFail(job.ticket, "lost");
      if (job.kind === "unit") {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "lost");
        this.#settleJoined(job.evaluationKey, "unavailable", "lost");
        this.#reuse.releaseClaim(job.evaluationKey);
        this.#releaseUnit(job);
      } else this.#ledger.release(job.reservation);
      recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
        advicee: job.observation.advicee, lifetime: this.lifetime, stage: "incomplete" });
    }
  }

  #closeRound(group: string, generation: number, reason: RoundCloseReason,
    counts: ReturnType<ComposedDelivery["closureCounts"]>): void {
    const round = this.#rounds.get(group);
    const activity = this.#roundActivity.get(group);
    this.#roundActivity.delete(group);
    const work = round === undefined ? { queued: 0, running: 0 }
      : this.#dispatcher.snapshotWhere(({ value }) => value.round === round && !value.completed && !value.work?.controller.signal.aborted);
    if (activity !== undefined) recordRoundClosure({ statePath: activity.activityPath,
      root: activity.root, advicee: activity.advicee, lifetime: this.lifetime,
      roundIdentity: `${group}:${generation}`, reason, reservedContinuations: counts.reservedContinuations,
      discarded: { queued: work.queued + (round?.discarded.queued ?? 0),
        running: work.running + (round?.discarded.running ?? 0), pendingAdvice: round === undefined ? 0 : this.#advice.filter((advice) => advice.round === round).length,
        submitted: counts.submitted, uncertain: counts.uncertain, editPermits: counts.editPermits } });
    if (round === undefined || round.generation !== generation) return;
    // The admission/output fence is already published. Abort Effect fibers and
    // their provider connections before releasing all retained round resources.
    round.controller.abort();
    round.work.controller.abort();
    this.#rounds.delete(group);
    const discarded = this.#dispatcher.discardWhere(({ value }) => value.round === round);
    for (const job of discarded) {
      if (job.completed) continue;
      if (job.ticket !== undefined) ticketFail(job.ticket, "lost");
      if (job.kind === "unit") {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "lost");
        this.#settleJoined(job.evaluationKey, "unavailable", "lost");
        this.#reuse.releaseClaim(job.evaluationKey);
        this.#releaseUnit(job);
      } else this.#ledger.release(job.reservation);
      recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
        advicee: job.observation.advicee, lifetime: this.lifetime, stage: "incomplete" });
    }
    for (const advice of [...this.#advice]) if (advice.round === round) this.#removeAdvice(advice.id);
    for (const [key, notice] of this.#noticeCooldowns) {
      if (round.partitions.has(notice.partition) || notice.deliveryGroup === group) this.#releaseNoticeCooldown(key);
    }
    for (const partition of round.partitions) this.#reuse.discardPartition(partition);
    for (const [key, ticket] of this.#tickets) if (round.partitions.has(ticket.partition)) this.#tickets.delete(key);
  }

  async #run(job: Job, cycle: number, sequence: number): Promise<void> {
    if (job.kind === "ingress") return this.#prepare(job, cycle, sequence);
    return this.#evaluateUnit(job, cycle, sequence);
  }

  #observeDispatchAuthority(
    job: UnitJob,
    details: DispatchAuthorityObservationDetails,
  ): void {
    const observer = this.#dispatchAuthorityObserver;
    if (observer === undefined) return;
    const identity = details.consentIdentity === null
      ? null
      : createHash("sha256").update(canonicalValue(details.consentIdentity), "utf8").digest("hex");
    const { consentIdentity: _consentIdentity, ...recordDetails } = details;
    const observation: DispatchAuthorityObservation = {
      kind: "dispatchAuthority",
      sequence: this.#nextDispatchAuthoritySequence++,
      evaluationId: createHash("sha256").update(job.evaluationKey, "utf8").digest("hex"),
      path: job.prepared.input.path,
      ...recordDetails,
      consentIdentitySha256: identity,
      expectedRootIdentitySha256: createHash("sha256")
        .update(canonicalValue(job.observation.rootIdentity), "utf8")
        .digest("hex"),
    };
    try {
      observer(observation);
    } catch {
      // Fixture observation must not change resident dispatch behavior.
    }
  }

  async #prepare(job: IngressJob, cycle: number, sequence: number): Promise<void> {
    const expectedActivityUnits: Array<string> = [];
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
      }).pipe(Effect.provide(Consent.layer({ statePath: job.dispatch.statePath }))),
        { signal: job.work?.controller.signal });
      this.#ledger.release(job.reservation);
      if (settings === undefined || this.#lifecycle !== "active" || !this.#jobActive(job)) {
        if (job.ticket !== undefined) ticketFail(job.ticket, "lost");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
        return;
      }

      // A candidate path is captured and analyzed only while its maximum
      // supported logical workspace is charged. Processing candidates one at
      // a time prevents a 16-path event from materializing 1,024 complete
      // inputs outside the ledger.
      for (const candidate of job.observation.candidates) {
        if (!this.#jobActive(job)) return;
        const workspace = this.#reserve(job.partition, captureWorkspaceBytes(candidate.path));
        if (workspace === undefined) {
          if (job.ticket !== undefined) ticketFail(job.ticket, "capacity");
          this.#rejectedCapacity += 1;
          recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
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
              advicee: pathObservation.advicee,
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
          }).pipe(Effect.provide(Consent.layer({ statePath: job.dispatch.statePath }))),
        { signal: job.work?.controller.signal });
        } catch (cause) {
          this.#ledger.release(workspace);
          throw cause;
        }
        if (!this.#jobActive(job)) { this.#ledger.release(workspace); return; }
        const ready = prepared.outcomes.filter((outcome) => outcome.status === "ready");
        if (ready.length === 0) {
          if (prepared.outcomes.some((outcome) => outcome.status !== "skipped") && job.ticket !== undefined) {
            ticketFail(job.ticket, "lost");
          }
          recordActivity({
            statePath: job.dispatch.activityPath,
            root: job.observation.root,
            advicee: job.observation.advicee,
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
          const generationPartition = `${job.partition}\0work:${job.work?.id ?? "legacy"}\0credential-generation:${job.dispatch.credential?.generation ?? "controlled"}`;
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
        const ticketUnitOffset = job.ticket?.units.length ?? 0;
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
          if (job.ticket !== undefined) ticketFail(job.ticket, "capacity");
          this.#recordOperationalFailure(job.observation, "capacity", job.ticket);
          recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
        }
        for (const item of planned) {
          const ticketUnit: TicketUnit | undefined = job.ticket === undefined ? undefined : { current: { state: "pending" } };
          if (ticketUnit !== undefined) job.ticket?.units.push(ticketUnit);
          if (item.kind === "cached" && item.cached.evaluation.findings.length === 0) {
            const revision = this.#registerCurrentWork(job.partition, item.outcome.prepared);
            if (ticketUnit !== undefined) unitClear(ticketUnit, revision);
            this.#releaseCurrentWork(revision);
            expectedActivityUnits.push(item.evaluationKey);
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "clear", unitIdentity: item.evaluationKey });
          } else if (item.kind === "joined") {
            if (ticketUnit !== undefined) {
              const existing = this.#advice.find((advice) => advice.evaluationKey === item.evaluationKey);
              if (existing !== undefined) {
                unitFinding(ticketUnit, existing.revision, existing.id);
              } else {
                const pending = this.#reuse.pending(item.evaluationKey);
                if (pending === undefined) {
                  unitUnavailable(ticketUnit, "lost");
                } else {
                  unitRevision(ticketUnit, pending.revision);
                  const joined = this.#joinedTicketUnits.get(item.evaluationKey) ?? [];
                  joined.push(ticketUnit);
                  this.#joinedTicketUnits.set(item.evaluationKey, joined);
                }
              }
            }
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
          }
        }
        for (const [index, item] of retained.entries()) {
          if (!this.#jobActive(job)) {
            for (let remaining = index; remaining < retained.length; remaining++) {
              const reservation = reservations[remaining];
              if (reservation !== undefined) this.#ledger.release(reservation);
              const pending = retained[remaining];
              if (pending?.kind === "owner") this.#reuse.releaseClaim(pending.evaluationKey);
            }
            return;
          }
          const ticketUnit = job.ticket?.units[ticketUnitOffset + planned.indexOf(item)];
          const reservation = reservations[index];
          if (reservation === undefined) {
            if (ticketUnit !== undefined) unitUnavailable(ticketUnit, "capacity");
            if (item.kind === "owner") this.#reuse.releaseClaim(item.evaluationKey);
            this.#rejectedCapacity += 1;
            this.#recordOperationalFailure(job.observation, "capacity", job.ticket);
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
            continue;
          }
          expectedActivityUnits.push(item.evaluationKey);
          const revision = this.#registerCurrentWork(job.partition, item.outcome.prepared);
          if (ticketUnit !== undefined) unitRevision(ticketUnit, revision);
          const sourceHash = prepared.observation.outcomes.flatMap((outcome) => outcome.status === "observed" &&
            outcome.path === item.outcome.path ? [outcome.snapshot.sourceHash] : [])[0];
          const unit: UnitJob = {
            kind: "unit",
            ...(job.round === undefined ? {} : { round: job.round, work: job.work }),
            observation: pathObservation,
            partition: job.partition,
            reservation,
            dispatch: job.dispatch,
            prepared: item.outcome.prepared,
            ...(sourceHash === undefined ? {} : { sourceHash }),
            revision,
            evaluationKey: item.evaluationKey,
            ...(ticketUnit === undefined ? {} : { ticketUnit }),
            ...(job.ticket === undefined ? {} : { ticket: job.ticket }),
          };
          if (item.kind === "cached") {
            recordActivity({
              statePath: job.dispatch.activityPath,
              root: job.observation.root,
              advicee: job.observation.advicee,
              lifetime: this.lifetime,
              stage: "findings",
              findings: item.cached.evaluation.findings.length,
              unitIdentity: item.evaluationKey,
            });
            await this.#retainAdvice(unit, {
              prepared: item.outcome.prepared,
              findings: item.cached.evaluation.findings,
            }, cycle, sequence);
            continue;
          }
          this.#reuse.attachPending(item.evaluationKey, unit);
          if (!this.#dispatcher.enqueue(job.partition, unit)) {
            if (ticketUnit !== undefined) unitUnavailable(ticketUnit, "capacity");
            this.#reuse.releaseClaim(item.evaluationKey);
            this.#releaseUnit(unit);
            this.#rejectedCapacity += 1;
            this.#recordOperationalFailure(job.observation, "capacity", job.ticket);
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: item.evaluationKey });
          }
        }
      }
      if (expectedActivityUnits.length > 0) {
        recordActivity({
          statePath: job.dispatch.activityPath,
          root: job.observation.root,
          advicee: job.observation.advicee,
          lifetime: this.lifetime,
          stage: "pending",
          expectedUnitIdentities: expectedActivityUnits,
        });
      }
      job.completed = true;
      await this.#afterPrepare?.();
      return;
    } catch {
      if (job.ticket !== undefined) ticketFail(job.ticket, "lost");
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error("resident preparation unavailable");
      this.#ledger.release(job.reservation);
      recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
    } finally {
      if (job.ticket !== undefined) ticketClose(job.ticket);
    }
  }

  async #evaluateUnit(job: UnitJob, cycle: number, sequence: number): Promise<void> {
    try {
      await this.#awaitBackendGate();
      if (!this.#jobActive(job) || !this.#isCurrentWork(job.revision, job.prepared)) {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "stale");
        this.#settleJoined(job.evaluationKey, "unavailable", "stale");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "incomplete", unitIdentity: job.evaluationKey });
        this.#reuse.releaseClaim(job.evaluationKey);
        this.#releaseUnit(job);
        return;
      }
      await this.#beforeEvaluate?.(job.prepared);
      const userConfigPath = job.dispatch.userConfigPath ?? undefined;
      const controlled = decodeControlledOptions(job.dispatch.controlled);
      const afterAuthorizeBeforeCredential = this.#afterAuthorizeBeforeCredential;
      const afterCredentialBeforeDispatch = this.#afterCredentialBeforeDispatch;
      const offlineHttpClient = this.#offlineHttpClient;
      const observeDispatchAuthority = (details: DispatchAuthorityObservationDetails): void =>
        this.#observeDispatchAuthority(job, details);
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
        if (credentialRequired && credential?.status !== "present") {
          return { status: "credential" as const };
        }
        if (credential?.status === "present") {
          const current = readCredentialState(dispatchCredential?.statePath);
          if (current.generation !== credential.generation ||
              (credential.source === "saved" && current.savedUseSuspended)) return undefined;
        }
        if (afterCredentialBeforeDispatch !== undefined) {
          yield* Effect.promise(afterCredentialBeforeDispatch);
        }
        if (credential?.status === "present") {
          const current = readCredentialState(dispatchCredential?.statePath);
          if (current.generation !== credential.generation ||
              (credential.source === "saved" && current.savedUseSuspended)) return undefined;
        }
        // Prepared source can outlive its admission policy. Read authority again
        // after credential waits, then apply the current file policy before the
        // provider receives the prepared unit.
        const dispatchConfiguration = yield* loadConfiguration(
          job.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        if (credentialRequired && dispatchCredential?.name !== dispatchConfiguration.policy.credentialEnvVar.value) return undefined;
        const dispatchAuthorization = yield* consent.authorize(
          job.observation.root,
          settings.backend,
          settings.destination,
        ).pipe(Effect.catch(() => Effect.succeed({ status: "unavailable" as const })));
        if (dispatchAuthorization.status !== "approved") {
          observeDispatchAuthority({
            decision: "deny",
            reason: "consent-not-approved",
            policyDigest: dispatchConfiguration.policy.digest,
            selected: null,
            consentStatus: dispatchAuthorization.status,
            consentIdentity: "identity" in dispatchAuthorization ? dispatchAuthorization.identity : null,
            physicalRootVerified: null,
            credentialStatus: credential?.status ?? "not-required",
            credentialGeneration: credential?.generation ?? null,
          });
          return undefined;
        }
        const dispatchRootVerified = yield* verifyObservationRoot(job.observation);
        if (!dispatchRootVerified) {
          observeDispatchAuthority({
            decision: "deny",
            reason: "physical-root-mismatch",
            policyDigest: dispatchConfiguration.policy.digest,
            selected: null,
            consentStatus: dispatchAuthorization.status,
            consentIdentity: "identity" in dispatchAuthorization ? dispatchAuthorization.identity : null,
            physicalRootVerified: false,
            credentialStatus: credential?.status ?? "not-required",
            credentialGeneration: credential?.generation ?? null,
          });
          return undefined;
        }
        const selected = selectedByDirectFilePolicy(
          job.prepared.input.path,
          resolvedDirectFilePolicy(dispatchConfiguration.policy),
        );
        observeDispatchAuthority({
          decision: selected ? "allow" : "deny",
          reason: selected ? "approved-and-selected" : "excluded-by-file-policy",
          policyDigest: dispatchConfiguration.policy.digest,
          selected,
          consentStatus: dispatchAuthorization.status,
          consentIdentity: "identity" in dispatchAuthorization ? dispatchAuthorization.identity : null,
          physicalRootVerified: true,
          credentialStatus: credential?.status ?? "not-required",
          credentialGeneration: credential?.generation ?? null,
        });
        if (!selected) return undefined;
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
              ...(offlineHttpClient === undefined ? {} : { httpClient: offlineHttpClient }),
            })
          : controlledDecisionModelLayer(controlled);
        const credentialAuthority = credential?.status !== "present"
          ? Effect.void
          : Effect.suspend(() => {
              const current = readCredentialState(dispatchCredential?.statePath);
              return current.generation === credential.generation &&
                  (credential.source === "environment" || !current.savedUseSuspended)
                ? Effect.void
                : Effect.fail(new Error("credential generation changed before provider dispatch"));
            });
        const budgetAuthority = job.dispatch.demoBudgetPath == null
          ? Effect.void
          : Effect.try(() => claimDemoBudget(
              job.dispatch.demoBudgetPath ?? "",
              job.observation.root,
              encodedPreparedProviderInputBytes(job.prepared),
            ));
        const beforeDispatch = credentialAuthority.pipe(Effect.andThen(budgetAuthority));
        const evaluation = evaluatePrepared(job.prepared, beforeDispatch).pipe(
          Effect.provide(decisionModel),
        );
        return yield* (credentialProvider === undefined
          ? evaluation
          : evaluation.pipe(Effect.provide(credentialProvider)));
      }).pipe(Effect.provide(Consent.layer({ statePath: job.dispatch.statePath }))),
        { signal: job.work?.controller.signal });
      if (!this.#jobActive(job)) { this.#reuse.releaseClaim(job.evaluationKey); this.#releaseUnit(job); return; }
      if (result?.status === "evaluated" && this.#lifecycle === "active") {
        recordDemoTrace(job.dispatch.demoBudgetPath, job.observation.root, job.observation.advicee, {
          kind: "terminal", ...(job.sourceHash === undefined ? {} : { sourceHash: job.sourceHash }),
          state: result.findings.length === 0 ? "clear" : "findings",
        });
        const evaluation = { prepared: job.prepared, findings: result.findings };
        this.#reuse.put(job.partition, job.evaluationKey, evaluation);
        this.#reuse.releaseClaim(job.evaluationKey);
        recordActivity({
          statePath: job.dispatch.activityPath,
          root: job.observation.root,
          advicee: job.observation.advicee,
          lifetime: this.lifetime,
          stage: result.findings.length === 0 ? "clear" : "findings",
          findings: result.findings.length,
          unitIdentity: job.evaluationKey,
        });
        const recordOutcome = async (): Promise<void> => {
          if (controlled?.outcomePath === undefined) return;
          const { sessionId, turnId, toolUseId, subagentId } = job.observation.advicee;
          await appendFile(controlled.outcomePath, `${JSON.stringify({
            sessionId, turnId, toolUseId, subagentId,
            outcome: result.findings.length === 0 ? "completed-clear" : "completed-findings",
          })}\n`, "utf8");
        };
        if (
          result.findings.length === 0 ||
          !this.#isCurrentWork(job.revision, job.prepared)
        ) {
          if (job.ticketUnit !== undefined) {
            if (result.findings.length === 0 && this.#isCurrentWork(job.revision, job.prepared)) {
              unitClear(job.ticketUnit, job.revision);
            } else unitUnavailable(job.ticketUnit, "stale");
          }
          this.#settleJoined(job.evaluationKey,
            result.findings.length === 0 && this.#isCurrentWork(job.revision, job.prepared) ? "clear" : "unavailable",
            "stale");
          job.completed = true;
          this.#releaseUnit(job);
          await recordOutcome();
          return;
        }
        await this.#retainAdvice(job, evaluation, cycle, sequence);
        await recordOutcome();
        return;
      }
      if (result?.status === "backend" || result?.status === "timeout") {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "backend");
        this.#settleJoined(job.evaluationKey, "unavailable", "backend");
        this.#recordOperationalFailure(job.observation, "backend", job.ticket);
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (result?.status === "credential") {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "credential");
        this.#settleJoined(job.evaluationKey, "unavailable", "credential");
        this.#recordOperationalFailure(job.observation, "credential", job.ticket);
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (result === undefined) {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "lost");
        this.#settleJoined(job.evaluationKey, "unavailable", "lost");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      }
    } catch {
      if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "backend");
      this.#settleJoined(job.evaluationKey, "unavailable", "backend");
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error("resident evaluation unavailable");
      recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
    }
    this.#reuse.releaseClaim(job.evaluationKey);
    this.#releaseUnit(job);
  }

  #settleJoined(key: string, state: TicketUnitState["state"], reason?: ResidentUnavailableReason,
    adviceId?: string): void {
    const joined = this.#joinedTicketUnits.get(key);
    if (joined === undefined) return;
    this.#joinedTicketUnits.delete(key);
    for (const unit of joined) {
      if (unit.current.state === "unavailable" && unit.current.reason === "stale") continue;
      if (state === "unavailable") unitUnavailable(unit, reason ?? "lost");
      else {
        const revision = "revision" in unit.current ? unit.current.revision : undefined;
        if (revision === undefined) unitUnavailable(unit, "lost");
        else if (state === "clear") unitClear(unit, revision);
        else if (state === "finding") {
          if (adviceId === undefined) unitUnavailable(unit, "lost");
          else unitFinding(unit, revision, adviceId);
        }
      }
    }
  }

  #retainAdvice(
    job: UnitJob,
    evaluation: EvaluatedUnit,
    cycle: number,
    sequence: number,
  ): Promise<void> | void {
    if (!this.#jobActive(job)) { this.#releaseUnit(job); return; }
    if (this.#advice.some((item) => item.evaluationKey === job.evaluationKey)) {
      const existing = this.#advice.find((item) => item.evaluationKey === job.evaluationKey);
      if (job.ticketUnit !== undefined && existing !== undefined) {
        unitFinding(job.ticketUnit, job.revision, existing.id);
      }
      if (existing !== undefined) this.#settleJoined(job.evaluationKey, "finding", undefined, existing.id);
      this.#releaseUnit(job);
      return;
    }
    const advice: Advice = {
      id: randomUUID(),
      ...(job.round === undefined ? {} : { round: job.round }),
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
    job.completed = true;
    const afterPending = this.#afterAdvicePending?.(advice.id);
    if (afterPending === undefined) {
      if (job.ticketUnit !== undefined) unitFinding(job.ticketUnit, job.revision, advice.id);
      this.#settleJoined(job.evaluationKey, "finding", undefined, advice.id);
      return;
    }
    return Promise.resolve(afterPending).then(() => {
      if (!this.#jobActive(job)) return;
      if (job.ticketUnit !== undefined) unitFinding(job.ticketUnit, job.revision, advice.id);
      this.#settleJoined(job.evaluationKey, "finding", undefined, advice.id);
    });
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
          advicee: advice.observation.advicee,
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
      }).pipe(Effect.provide(Consent.layer({ statePath: dispatch.statePath }))),
        { signal: advice.round?.controller.signal });
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
      return request.version === 2
        ? request.operation === "collect" ? { version: 2, status: "unavailable", reason: "lost" }
          : { version: 2, status: "obsolete-lifetime" }
        : { status: "obsolete-lifetime" };
    }
    if (request.operation === "prompt-marker") {
      const group = adviceeGroup(request.root, request.advicee);
      return (request.onlyIfMissing === true
        ? this.#composedDelivery.ensureFromHostTurn(group, request.marker, this.#now())
        : this.#composedDelivery.advance(group, request.marker, this.#now(), request.promptDigest))
        ? { status: "advanced" } : { status: "rejected-capacity" };
    }
    if (request.operation === "begin-stop") {
      const group = adviceeGroup(request.root, request.advicee);
      if (!this.#composedDelivery.beginStop(group, request.token)) return { status: "busy" };
      const timer = setTimeout(() => {
        this.#stopTimers.delete(request.token);
        const counts = this.#composedDelivery.closureCounts(group);
        const closed = this.#composedDelivery.expireStop(group, request.token);
        if (closed !== undefined) this.#closeRound(group, closed, "abandoned-stop", counts);
      }, 5_000);
      timer.unref();
      this.#stopTimers.set(request.token, timer);
      return { status: "advanced" };
    }
    if (request.operation === "finish-stop") {
      const timer = this.#stopTimers.get(request.token);
      if (timer !== undefined) clearTimeout(timer);
      this.#stopTimers.delete(request.token);
      const group = adviceeGroup(request.root, request.advicee);
      const counts = this.#composedDelivery.closureCounts(group);
      const closed = this.#composedDelivery.finishStop(group, request.token, request.close === true);
      if (closed !== undefined) this.#closeRound(group, closed, request.reason ?? "no-advice", counts);
      return { status: "advanced" };
    }
    if (request.operation === "consume-stop") {
      return this.#composedDelivery.consumeStop(
        adviceeGroup(request.root, request.advicee), request.continuationDigest,
      )
        ? { status: "continuation-allowed" }
        : { status: "continuation-denied" };
    }
    if (request.operation === "claim-background") {
      return this.#composedDelivery.claimBackground(
        adviceeGroup(request.root, request.advicee), request.token, this.#now(),
      ) ? { status: "background-claimed" } : { status: "busy" };
    }
    if (request.operation === "release-background") {
      this.#composedDelivery.releaseBackground(
        adviceeGroup(request.root, request.advicee), request.token,
      );
      return { status: "released" };
    }
    if (request.operation === "begin-submission") {
      return this.beginComposedSubmission(request.token, request.surface);
    }
    if (request.operation === "release") return this.releaseComposedSubmission(request.token);
    if (request.operation === "register-edit") {
      const group = adviceeGroup(request.root, request.advicee);
      if (!this.#composedDelivery.registerEdit(group, request.advicee.toolUseId, request.startedAt)) return { status: "rejected-stale" };
      this.#roundActivity.set(group, { root: request.root, advicee: request.advicee, activityPath: request.activityPath });
      return { status: "advanced" };
    }
    if (request.operation === "admit") {
      return this.admit(request.observation, request.dispatch, request.version === 2,
        request.composed === true, request.composed === true);
    }
    if (request.operation === "collect") {
      if (request.version === 2) {
        const ticket = this.#ticketFor(request.ticket, request.root, request.advicee, request.dispatch);
        if (ticket === undefined) return { version: 2, status: "unavailable", reason: "lost" };
        if (ticket.credentialGeneration !== (request.dispatch.credential?.generation ?? null)) {
          return { version: 2, status: "unavailable", reason: "credential" };
        }
        if (this.#now() >= ticket.expiresAt) return { version: 2, status: "unavailable", reason: "expired" };
        const collected = await this.collect(request.root, request.advicee, request.dispatch, request.mode ?? "ordinary", ticket);
        return collected.status === "advice" ? { ...collected, version: 2 } : this.#terminalStatus(ticket, this.#now());
      }
      if (request.finish !== undefined) {
        const group = adviceeGroup(request.root, request.advicee);
        if (!this.#composedDelivery.ownsStop(group, request.finish.token)) return { status: "empty" };
        // Expired leases represent uncertain external output, not live writers.
        for (const advice of this.#advice) {
          if (adviceeGroup(advice.observation.root, advice.observation.advicee) === group &&
              advice.delivery !== undefined && advice.delivery.leaseUntil <= this.#now()) delete advice.delivery;
        }
        if (this.#composedDelivery.hasVirtualRoundContinuationBudget(group) && !request.finish.deadlineReached &&
            this.#collectionWorkState(request.root, request.advicee, true).status === "pending") {
          return { status: "pending" };
        }
        if (!this.#composedDelivery.beginFinishDecision(group, request.finish.token)) return { status: "empty" };
        const round = this.#rounds.get(group);
        if (round !== undefined) this.#discardUnfinishedWork(round);
        if (!this.#composedDelivery.hasVirtualRoundContinuationBudget(group)) {
          this.#allowFinish(group, request.finish.token, "limit");
          return { status: "empty" };
        }
      }
      const collected = request.composed === true
        ? await this.collect(request.root, request.advicee, request.dispatch, request.mode ?? "ordinary", undefined, true)
        : await this.collect(request.root, request.advicee, request.dispatch, request.mode ?? "ordinary");
      if (request.finish !== undefined) {
        const group = adviceeGroup(request.root, request.advicee);
        if (collected.status === "advice" && collected.findingCount > 0) {
          if (!this.#composedDelivery.reserveFinishOutput(group, request.finish.token, collected.token)) {
            this.releaseDelivery(collected.token);
            return { status: "empty" };
          }
        } else if (collected.status !== "advice") {
          this.#allowFinish(group, request.finish.token, request.finish.deadlineReached ? "deadline" : "no-advice");
        }
        // Operational notices must pass the IPC handoff barrier before the hook
        // closes the round; unlike findings they cannot reserve a continuation.
        return collected;
      }
      return request.reportWorkState === true && collected.status === "empty"
        ? this.#collectionWorkState(request.root, request.advicee, request.composed === true)
        : collected;
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

  #ticketFor(ticket: ResidentCollectionTicket, root: string, advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext): TicketRecord | undefined {
    const retained = this.#tickets.get(ticket.nonce);
    return retained?.ticket.lifetime === this.lifetime && ticket.lifetime === this.lifetime &&
      retained.ticket.nonce === ticket.nonce && retained.generation > 0 &&
      retained.partition === adviceePartition(root, advicee)
      ? retained : undefined;
  }

  #currentClaudeFeedbackMode(root: string, userConfigPath: string | null): ClaudeOutputMode {
    const authority = readCurrentClaudeFeedbackAuthority(root, userConfigPath ?? undefined);
    return authority.valid ? authority.mode : "advisory";
  }

  #terminalStatus(ticket: TicketRecord, now: number): ResidentResponse {
    if (now >= ticket.expiresAt) return { version: 2, status: "unavailable", reason: "expired" };
    if (!this.#credentialAuthority(ticket)) return { version: 2, status: "unavailable", reason: "credential" };
    if (ticket.phase.state === "preparing" || ticket.units.some((unit) => unit.current.state === "pending")) return { version: 2, status: "pending" };
    if (this.#advice.some((item) => ticket.units.some((unit) =>
        unit.current.state === "finding" && unit.current.adviceId === item.id)) ||
        [...this.#noticeCooldowns.values()].some((item) => item.partition === ticket.partition && item.pending !== undefined)) {
      return { version: 2, status: "pending" };
    }
    const failedUnit = ticket.units.map((unit) => unit.current)
      .find((state): state is Extract<TicketUnitState, { state: "unavailable" }> => state.state === "unavailable");
    const unavailable = ticket.phase.state === "failed" ? ticket.phase.reason : failedUnit?.reason;
    if (unavailable !== undefined) return { version: 2, status: "unavailable", reason: unavailable };
    if (ticket.units.some((unit) => unit.current.state === "finding")) {
      return ticket.units.every((unit) => unit.current.state !== "finding" || unit.current.delivered)
        ? { version: 2, status: "delivered" }
        : { version: 2, status: "unavailable", reason: "lost" };
    }
    return ticket.units.length > 0 ? { version: 2, status: "clear" } : { version: 2, status: "no-work" };
  }

  #credentialAuthority(ticket: TicketRecord): boolean {
    if (!ticket.credentialRequired) return true;
    const credentialState = ticket.credentialStatePath === null ? undefined : readCredentialState(ticket.credentialStatePath);
    return credentialState !== undefined &&
      credentialState.generation === ticket.credentialGeneration &&
      (ticket.credentialEnvironmentOnly || !credentialState.savedUseSuspended);
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
  #responseForHandoff(request: ResidentRequest, response: ResidentResponse): ResidentResponse {
    if (response.status !== "advice") {
      if (request.version === 1 && request.operation === "collect" && request.reportWorkState === true &&
          (response.status === "empty" || response.status === "pending")) {
        return this.#collectionWorkState(request.root, request.advicee, request.composed === true);
      }
      if (request.version !== 2 || request.operation !== "collect") return response;
      const now = this.#now();
      this.#expirePending(now);
      this.#pruneNoticeCooldowns(now);
      const ticket = this.#ticketFor(request.ticket, request.root, request.advicee, request.dispatch);
      return ticket === undefined ? { version: 2, status: "unavailable", reason: "lost" }
        : ticket.credentialGeneration !== (request.dispatch.credential?.generation ?? null)
          ? { version: 2, status: "unavailable", reason: "credential" }
        : this.#terminalStatus(ticket, now);
    }
    const now = this.#now();
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    const handoff: Array<Advice> = [];
    for (const advice of [...this.#advice]) {
      if (advice.delivery?.token !== response.token) continue;
      if (!this.#roundActive(advice.round) || isPendingAdviceExpired(advice, now) || !this.#isCurrentWork(advice.revision, advice.prepared)) {
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
    const ticket = request.version === 2 && request.operation === "collect"
      ? this.#ticketFor(request.ticket, request.root, request.advicee, request.dispatch)
      : undefined;
    if (request.version === 2 && request.operation === "collect" && ticket === undefined) {
      this.releaseDelivery(response.token);
      return { version: 2, status: "unavailable", reason: "lost" };
    }
    if (ticket !== undefined && ticket.claudeFeedbackMode === "block-current-findings" &&
        this.#currentClaudeFeedbackMode(ticket.root, ticket.userConfigPath) !== "block-current-findings") {
      // A revoked opt-in cannot turn the old selection into an advisory lease.
      this.releaseDelivery(response.token);
      return this.#terminalStatus(ticket, now);
    }
    const selected: ResidentResponse = findings.length === 0 && notices.length === 0
      ? { status: "empty" }
      : ticket === undefined
        ? { status: "advice", token: response.token, findingCount: findings.length,
            output: combinedReviewOutput(findings, notices.map((notice) => notice.value)) }
        : { version: 2, status: "advice", token: response.token, findingCount: findings.length,
            output: combinedClaudeOutput(findings, notices.map((notice) => notice.value), ticket.claudeFeedbackMode) };
    if (request.version !== 2 || request.operation !== "collect") return selected;
    if (ticket === undefined) return { version: 2, status: "unavailable", reason: "lost" };
    if (ticket.credentialGeneration !== (request.dispatch.credential?.generation ?? null)) {
      if (selected.status === "advice") this.releaseDelivery(selected.token);
      return { version: 2, status: "unavailable", reason: "credential" };
    }
    if (!this.#credentialAuthority(ticket)) {
      if (selected.status === "advice") this.releaseDelivery(selected.token);
      return { version: 2, status: "unavailable", reason: "credential" };
    }
    if (now >= ticket.expiresAt) return { version: 2, status: "unavailable", reason: "expired" };
    return selected.status === "advice" ? { ...selected, version: 2 }
      : this.#terminalStatus(ticket, now);
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
        request.advicee.toolUseId === "disconnect"
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
      // complete. Advicee and observation decoding happens only afterward.
      socket.pause();
      const decoded = decodeResidentRequest(encoded.slice(0, newline));
      request = decoded;
      if (decoded === undefined) {
        socket.end(`${JSON.stringify({ status: "unsupported" })}\n`);
        return;
      }
      void this.handle(decoded).then(async (response) => {
        await this.#responseGate(decoded.operation);
        await this.#beforeResponseHandoff?.();
        const handoff = this.#responseForHandoff(decoded, response);
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
    for (const timer of this.#stopTimers.values()) clearTimeout(timer);
    this.#stopTimers.clear();
    for (const round of this.#rounds.values()) { round.controller.abort(); round.work.controller.abort(); }
    this.#rounds.clear();
    this.#roundActivity.clear();
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
    this.#noticeOwners.clear();
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
