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
  type DirectReviewContext,
  type RevalidationResult,
} from "../direct-event/pipeline.ts";
import { verifyObservationRoot } from "../direct-event/adapter.ts";
import type { PreparedUnit } from "../direct-event/model.ts";
import { MAX_TYPE_DECLARATIONS } from "../direct-event/analyzer.ts";
import type { AnalyzerMaterializationPreflight } from "../direct-event/analyzer.ts";
import { MAX_SOURCE_BYTES } from "../direct-event/capture.ts";
import { resolvedDirectFilePolicy, selectedByDirectFilePolicy } from "../direct-event/selection.ts";
import { admitReview } from "../configuration/decision.ts";
import { liveLayer as jevDecisionModelLiveLayer } from "../jev-decision.ts";
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
  type CapacityPurpose,
  type CapacityReservation,
} from "./capacity.ts";
import { DispatchCycles } from "./dispatch.ts";
import { ComposedDelivery } from "./composed-delivery.ts";
import { BendWorkTracker } from "./bend-work.ts";
import type { CanonicalCommand, TicketReason, TicketUnitEvent } from "../canonical/adapter.ts";
import { bendValidationRoute, bendPostValidation, bendFinalCandidate,
  type BendValidationStatus } from "./bend-policy.generated.js";
import {
  ADVICE_COLLECTION_WINDOW_MS,
  PENDING_ADVICE_EXPIRY_MS,
  combinedClaudeOutput,
  combinedReviewOutput,
  selectFittingFindings,
  selectFittingCurrentFindingIndices,
  selectFittingClaudeFindings,
  selectFittingClaudeNotices,
  selectFittingNotices,
  type ClaudeOutputMode,
  type CollectionMode,
  type FindingSelectionFacts,
  type CanonicalFindingOffer,
  type CanonicalNoticeOffer,
  type OperationalNotice,
  type OperationalNoticeKind,
} from "./collection.ts";
import { EvaluationReuse, residentEvaluationIdentity } from "./evaluation-reuse.ts";
import {
  readCredentialState,
  resolveCredential,
  type CredentialResolution,
} from "../credentials/secret-service.ts";
import { recordActivity } from "../activity/status.ts";
import { claimDemoBudget } from "../onboarding/demo-budget.ts";
import { findingFromProbability } from "../rules/decision.ts";
import { recordDemoTrace } from "../onboarding/demo-trace.ts";

const validationStatus = (status: RevalidationResult["status"]): BendValidationStatus =>
  ({ $: status === "current" ? "Current" : status === "stale" ? "Stale" :
    status === "unavailable" ? "Unavailable" : "Unattributed" });
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
  readonly policyWork: BendWorkTracker;
  readonly discarded: { queued: number; running: number };
};

type IngressJob = {
  readonly round?: RoundWork;
  readonly work?: WorkCohort;
  completed?: boolean;
  readonly kind: "ingress";
  readonly workObservationId?: number;
  readonly canonicalObservationId: number;
  readonly observation: DirectObservation;
  readonly partition: string;
  readonly reservation: CapacityReservation;
  readonly dispatch: ResidentDispatchContext;
  readonly ticket?: TicketRecord;
};

type TicketUnitState = { readonly revision?: WorkRevision; readonly adviceId?: string };
type TicketUnit = { readonly id: number; readonly ticketId: number;
  readonly ledger: CapacityLedger; current: TicketUnitState };
const ticketUnitStageOrUndefined = (unit: TicketUnit) => {
  const command = unit.ledger.transition({ kind: "ticketUnitCheck", id: unit.ticketId,
    unit: unit.id }).commands[0];
  if (command?.kind === "ticketUnitSnapshot") return command;
  if (command?.kind === "ticketUnitMissing") return undefined;
  throw new Error("canonical ticket unit check refused");
};
const ticketUnitStage = (unit: TicketUnit) => {
  const stage = ticketUnitStageOrUndefined(unit);
  if (stage === undefined) throw new Error("canonical ticket unit missing");
  return stage;
};
const ticketUnitTransition = (unit: TicketUnit, event: TicketUnitEvent,
  reason: TicketReason = "lost"): boolean => {
  if (ticketUnitStageOrUndefined(unit) === undefined) return false;
  const result = unit.ledger.transition({ kind: "ticketStepUnit", id: unit.ticketId,
    unit: unit.id, event, reason });
  const command = result.commands[0]?.kind;
  if (command === "ticketUnitUpdated") return true;
  if (command === "ticketRefused") return false;
  throw new Error("canonical ticket unit transition refused");
};
const unitUnavailable = (unit: TicketUnit, reason: ResidentUnavailableReason): void => {
  const before = ticketUnitStageOrUndefined(unit);
  if (before === undefined || before.stage === "unavailable") return;
  if (!ticketUnitTransition(unit, "failUnit", reason) || ticketUnitStage(unit).stage !== "unavailable") {
    throw new Error("canonical ticket unit failure refused");
  }
  unit.current = {};
};
const unitRevision = (unit: TicketUnit, revision: WorkRevision): void => {
  if (!ticketUnitTransition(unit, "revise")) return;
  if (ticketUnitStage(unit).stage !== "pending") throw new Error("invalid canonical ticket revision stage");
  unit.current = { revision };
};
const unitClear = (unit: TicketUnit, revision: WorkRevision): void => {
  if (!ticketUnitTransition(unit, "clearResult")) return;
  if (ticketUnitStage(unit).stage !== "clear") throw new Error("invalid canonical ticket clear stage");
  unit.current = { revision };
};
const unitFinding = (unit: TicketUnit, revision: WorkRevision, adviceId: string): void => {
  if (!ticketUnitTransition(unit, "findingResult")) return;
  if (ticketUnitStage(unit).stage !== "finding") throw new Error("invalid canonical ticket finding stage");
  unit.current = { revision, adviceId };
};
type TicketRecord = { readonly ticket: ResidentCollectionTicket; readonly generation: number;
  readonly partition: string; readonly credentialGeneration: number | null;
  readonly root: string; readonly userConfigPath: string | null; readonly claudeFeedbackMode: ClaudeOutputMode;
  readonly credentialStatePath: string | null; readonly credentialRequired: boolean;
  readonly credentialEnvironmentOnly: boolean;
  readonly expiresAt: number; readonly units: Array<TicketUnit>;
  readonly ledger: CapacityLedger };
const ticketFail = (ticket: TicketRecord, reason: ResidentUnavailableReason): void => {
  const command = ticket.ledger.transition({ kind: "ticketFail", id: ticket.generation,
    reason }).commands[0]?.kind;
  if (command !== "ticketFailed" && command !== "ticketRefused") {
    throw new Error("canonical ticket failure refused");
  }
};
const ticketClose = (ticket: TicketRecord): void => {
  const command = ticket.ledger.transition({ kind: "ticketClose", id: ticket.generation }).commands[0]?.kind;
  if (command !== "ticketClosed" && command !== "ticketRefused") {
    throw new Error("canonical ticket close refused");
  }
};
const TICKET_RETENTION_MS = 600_000;
const MAX_TICKETS = 256;

type UnitJob = {
  readonly round?: RoundWork;
  readonly work?: WorkCohort;
  completed?: boolean;
  released?: boolean;
  readonly kind: "unit";
  readonly workUnitId?: number;
  readonly canonicalOperationId: number;
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
  readonly credentialStatePath: string | null;
  readonly credentialRequired: boolean;
  readonly credentialEnvironmentOnly: boolean;
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
  readonly canonicalId: number;
  readonly id: string;
  value: OperationalNotice;
  readonly pendingAt: number;
  readonly sequence: number;
  delivery?: NoticeDelivery;
};

type NoticeCooldown = {
  readonly canonicalId: number;
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
};

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
  readonly admission: ReturnType<typeof admitReview>;
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
  readonly admission: ReturnType<typeof admitReview>;
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
  prepared.input.rules.flatMap((rule) => findingFromProbability(1, rule.threshold)
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
  readonly #bendPartitions = new Map<string, number>();
  #nextBendPartition = 1;
  readonly #tickets = new Map<string, TicketRecord>();
  readonly #joinedTicketUnits = new Map<string, Array<TicketUnit>>();
  #nextAdmissionGeneration = 1;
  #nextTicketUnitId = 1;
  readonly #ledger = new CapacityLedger();
  readonly #reuse: EvaluationReuse<UnitJob>;
  readonly #dispatcher: DispatchCycles<string, Job>;
  readonly #roundActivity = new Map<string, { root: string; advicee: DirectAdvicee; activityPath: string | undefined }>();
  readonly #stopTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #rounds = new Map<string, RoundWork>();
  readonly #composedDelivery = new ComposedDelivery(this.#ledger);
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
  readonly #revisionIds = new Map<string, number>();
  #nextRevisionId = 1;
  #nextNoticeSequence = 1;
  #nextNoticeKeyId = 1;
  readonly #beforeRevalidate: ((adviceId: string) => Promise<void>) | undefined;
  readonly #afterPrepare: (() => Promise<void>) | undefined;
  readonly #beforeEvaluate: ((prepared: PreparedUnit) => Promise<void>) | undefined;
  readonly #captureSource: DirectReviewContext["captureSource"];
  readonly #afterRevalidationWorkspaceReserved: ((adviceId: string) => Promise<void>) | undefined;
  readonly #afterAdvicePending: ((adviceId: string) => Promise<void> | void) | undefined;
  readonly #afterReuseBoundary: ((phase: "ownerClaimed" | "claimJoined") => Promise<void> | void) | undefined;
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
      /** Fixture-only source effect; never supplied by resident IPC. */
      readonly captureSource?: DirectReviewContext["captureSource"];
      readonly afterRevalidationWorkspaceReserved?: (adviceId: string) => Promise<void>;
      readonly afterAdvicePending?: (adviceId: string) => Promise<void> | void;
      /** Fixture-only callback-order gate for evaluation reuse. */
      readonly afterReuseBoundary?: (phase: "ownerClaimed" | "claimJoined") => Promise<void> | void;
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
    this.#captureSource = options.captureSource;
    this.#afterRevalidationWorkspaceReserved = options.afterRevalidationWorkspaceReserved;
    this.#afterAdvicePending = options.afterAdvicePending;
    this.#afterReuseBoundary = options.afterReuseBoundary;
    this.#beforeFinalRevalidate = options.beforeFinalRevalidate;
    this.#afterAuthorizeBeforeCredential = options.afterAuthorizeBeforeCredential;
    this.#afterCredentialBeforeDispatch = options.afterCredentialBeforeDispatch;
    this.#dispatchAuthorityObserver = options.dispatchAuthorityObserver;
    this.#offlineHttpClient = options.offlineHttpClient;
    this.#beforeResponseHandoff = options.beforeResponseHandoff;
    this.#reuse = new EvaluationReuse({
      ledger: this.#ledger,
      logicalBytes,
    });
    this.#dispatcher = new DispatchCycles(
      this.#ledger,
      (job) => job.kind === "ingress" ? job.canonicalObservationId : job.canonicalOperationId,
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
      currentWork: this.#revisionCount(),
    };
  }

  /**
   * Voluntary idle cleanup is an allowed loss boundary, but only after every
   * accepted outcome, delivery lease, pending evaluation and cooldown has
   * reached a terminal state. Successful cache entries are then discarded as
   * part of ending this lifetime; they never authorize source reconstruction.
   */
  #evictRetainedTickets(limit: number): void {
    while (true) {
      const result = this.#ledger.transition({ kind: "ticketRetentionCheck", limit });
      const command = result.commands[0];
      if (result.rejection !== undefined || command === undefined) throw new Error("canonical ticket retention refused");
      if (command.kind === "ticketKept") return;
      if (command.kind !== "ticketEvicted") throw new Error("invalid canonical ticket retention");
      const retained = [...this.#tickets].find(([, ticket]) => ticket.generation === command.id);
      if (retained === undefined) throw new Error("canonical ticket eviction lost native handle");
      if (retained[0] !== this.#tickets.keys().next().value) {
        throw new Error("canonical ticket admission order differs from native retention");
      }
      this.#tickets.delete(retained[0]);
    }
  }

  cleanup(): "busy" | "cleaned" {
    if (this.#lifecycle !== "active") return "busy";
    const now = this.#now();
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    const dispatch = this.#dispatcher.snapshot();
    const reuse = this.#reuse.snapshot();
    const capacity = this.#ledger.snapshot();
    const check = this.#ledger.transition({ kind: "cleanupCheck", facts: {
      active: this.#lifecycle === "active",
      dispatcherIdle: dispatch.queued === 0 && dispatch.running === 0,
      noAdvice: this.#advice.length === 0,
      noNotices: this.#pendingNoticeCount() === 0,
      noPendingEvaluations: reuse.pending === 0,
      noCurrentWork: this.#revisionCount() === 0,
      noCooldowns: this.#noticeCooldowns.size === 0,
      connectionCountOk: this.#connections <= 1,
      cacheMatchesLedger: capacity.items === reuse.entries && capacity.bytes === reuse.bytes,
    } });
    if (check.rejection !== undefined || check.commands.length !== 1) throw new Error("canonical cleanup check refused");
    if (check.commands[0]?.kind === "cleanupBusy") return "busy";
    if (check.commands[0]?.kind !== "cleanupReady") throw new Error("invalid canonical cleanup check");
    this.#reuse.clear();
    this.#evictRetainedTickets(0);
    const commit = this.#ledger.transition({ kind: "cleanupCommit" });
    if (commit.rejection !== undefined || commit.commands.length !== 1) throw new Error("canonical cleanup commit refused");
    if (commit.commands[0]?.kind === "cleanupBusy") return "busy";
    if (commit.commands[0]?.kind !== "cleanupCommitted") throw new Error("invalid canonical cleanup commit");
    // The canonical closed-dispatch marker and this native phase commit in the
    // same synchronous turn. Subsequent callbacks cannot acquire ownership.
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
      const partitions = new Set<string>();
      round = { group, generation, controller: new AbortController(), partitions,
        work: { id: randomUUID(), controller: new AbortController() },
        policyWork: new BendWorkTracker(this.#ledger, partitions), discarded: { queued: 0, running: 0 } };
      this.#rounds.set(group, round);
    }
    const partition = adviceePartition(observation.root, observation.advicee) +
      (generation === undefined ? "" : `\0round:${generation}`);
    round?.partitions.add(partition);
    if (round !== undefined) this.#roundActivity.set(group, { root: observation.root, advicee: observation.advicee, activityPath: dispatch.activityPath });
    const reservation = this.#reserve(partition, logicalBytes({ observation, dispatch }) + RESERVATION_OVERHEAD_BYTES, "observationDispatch");
    if (reservation === undefined) {
      this.#rejectedCapacity += 1;
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
      return ticketed ? { version: 2, status: "rejected-capacity" } : { status: "rejected-capacity" };
    }
    let canonicalObservationId: number;
    try {
      canonicalObservationId = this.#ledger.admitObservation(partition);
    } catch {
      this.#ledger.release(reservation);
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
      expiresAt: now + TICKET_RETENTION_MS, ledger: this.#ledger, units: [],
    } : undefined;
    if (ticket !== undefined && this.#ledger.transition({ kind: "ticketOpen",
      id: ticket.generation }).commands[0]?.kind !== "ticketOpened") {
      throw new Error("canonical ticket open refused");
    }
    const job = {
      kind: "ingress" as const,
      ...(round === undefined ? {} : { round, work: round.work,
        workObservationId: round.policyWork.admit(canonicalObservationId) }),
      observation,
      canonicalObservationId,
      partition,
      reservation,
      dispatch,
      ...(ticket === undefined ? {} : { ticket }),
    };
    if (!this.#dispatcher.enqueue(partition, job)) {
      if (ticket !== undefined) this.#ledger.transition({ kind: "ticketForget", id: ticket.generation });
      this.#ledger.observation(partition, canonicalObservationId, "interruptObservation");
      this.#ledger.release(reservation);
      this.#rejectedCapacity += 1;
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
      return ticketed ? { version: 2, status: "rejected-capacity" } : { status: "rejected-capacity" };
    }
    if (ticket !== undefined) {
      this.#tickets.set(ticket.ticket.nonce, ticket);
      this.#evictRetainedTickets(this.#maximumTickets);
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

  #collectionElapsed(now: number, started: number, limit: number): number {
    const elapsed = Math.min(limit, Math.max(0, now - started));
    return Number.isNaN(elapsed) ? 0 : Math.floor(elapsed);
  }

  #recordFindingCount(partition: string, operation: number, count: number): void {
    if (count < 1) return;
    const result = this.#ledger.transition({ kind: "findingCountUpdated",
      partition: this.#ledger.partitionId(partition), lifetime: 1,
      round: this.#ledger.roundId(partition), operation, count });
    if (result.rejection !== undefined || result.commands[0]?.kind !== "findingCountRecorded") {
      throw new Error("canonical finding count update refused");
    }
  }

  #pendingCanonicalFindings(operation: number): number {
    return this.#ledger.canonicalProjection().pendingFindings.find((item) =>
      item.operation === operation)?.count ?? 0;
  }

  #adviceExpired(advice: Pick<Advice, "pendingAt">, now: number): boolean {
    const result = this.#ledger.transition({ kind: "collectionExpiryCheck",
      elapsed: this.#collectionElapsed(now, advice.pendingAt, PENDING_ADVICE_EXPIRY_MS),
      lifetime: PENDING_ADVICE_EXPIRY_MS });
    if (result.rejection !== undefined) throw new Error("canonical advice expiry refused");
    const command = result.commands[0]?.kind;
    if (command !== "collectionExpired" && command !== "collectionCurrent") throw new Error("invalid canonical advice expiry");
    return command === "collectionExpired";
  }

  #collectionOrder(left: Pick<Advice, "cycle" | "sequence">,
    right: Pick<Advice, "cycle" | "sequence">): number {
    const result = this.#ledger.transition({ kind: "collectionOrderCheck",
      leftCycle: left.cycle, leftSequence: left.sequence,
      rightCycle: right.cycle, rightSequence: right.sequence });
    if (result.rejection !== undefined) throw new Error("canonical collection order refused");
    switch (result.commands[0]?.kind) {
      case "collectionBefore": return -1;
      case "collectionEqual": return 0;
      case "collectionAfter": return 1;
      default: throw new Error("invalid canonical collection order");
    }
  }

  #collectionReady(advice: Advice, now: number, mode: CollectionMode,
    oldestPendingAt: number): boolean {
    const result = this.#ledger.transition({ kind: "collectionReady",
      advice: advice.canonicalOperationId, already: advice.collectionEligible,
      turnEnd: mode === "turn-end", cycleComplete: advice.cycleComplete,
      elapsed: this.#collectionElapsed(now, oldestPendingAt, ADVICE_COLLECTION_WINDOW_MS),
      window: ADVICE_COLLECTION_WINDOW_MS });
    if (result.rejection !== undefined) throw new Error("canonical collection readiness refused");
    const command = result.commands[0]?.kind;
    if (command !== "collectionEligible" && command !== "collectionWaiting") throw new Error("invalid canonical collection readiness");
    return command === "collectionEligible";
  }

  #collectionFindingOffer: CanonicalFindingOffer = (input) => {
    const facts = input.facts;
    const result = this.#ledger.transition({ kind: "collectionFindingCheck",
      selectionPartition: input.selectionPartition, selectionRound: input.selectionRound,
      unit: facts.unit, partition: facts.partition, round: facts.round,
      snapshot: facts.snapshot, currentSnapshot: facts.currentSnapshot,
      credential: facts.credential, currentCredential: facts.currentCredential,
      ageMs: facts.ageMs, soloBytes: input.soloBytes,
      collectionReady: facts.collectionReady, selectedCount: input.selectedCount,
      prospectiveBytes: input.prospectiveBytes });
    if (result.rejection !== undefined) throw new Error("canonical finding fit refused");
    switch (result.commands[0]?.kind) {
      case "collectionFindingSelected": return "selected";
      case "collectionFindingRetained": return "retained";
      case "collectionFindingLimited": return "limited";
      case "collectionFindingExpired": return "expired";
      default: throw new Error("invalid canonical finding fit");
    }
  };

  #collectionNoticeOffer: CanonicalNoticeOffer = (items, bytes, skipUnfitting) => {
    const result = this.#ledger.transition({ kind: "collectionNoticeCheck",
      items, bytes, skipUnfitting });
    if (result.rejection !== undefined) throw new Error("canonical notice fit refused");
    switch (result.commands[0]?.kind) {
      case "collectionNoticeIncluded": return "include";
      case "collectionNoticeSkipped": return "skip";
      case "collectionNoticeStopped": return "stop";
      default: throw new Error("invalid canonical notice fit");
    }
  };

  #reserveAdviceLease(advice: Advice, token: string): boolean {
    const result = this.#ledger.transition({ kind: "collectionReserveLease",
      advice: advice.canonicalOperationId, token: this.#ledger.collectionTokenId(token) });
    if (result.rejection !== undefined) throw new Error("canonical advice lease refused");
    const command = result.commands[0]?.kind;
    if (command !== "collectionLeaseReserved" && command !== "collectionLeaseRefused") throw new Error("invalid canonical lease reservation");
    return command === "collectionLeaseReserved";
  }

  #releaseAdviceLease(advice: Advice): void {
    const delivery = advice.delivery;
    if (delivery === undefined) return;
    const result = this.#ledger.transition({ kind: "collectionReleaseLease",
      advice: advice.canonicalOperationId, token: this.#ledger.collectionTokenId(delivery.token) });
    if (result.rejection !== undefined || result.commands[0]?.kind !== "collectionLeaseReleased") {
      throw new Error("canonical advice lease release refused");
    }
    delete advice.delivery;
  }

  #checkAdviceLease(advice: Advice, now: number, stopCollector: boolean,
    sameGroup: boolean): void {
    const delivery = advice.delivery;
    if (delivery === undefined) return;
    const result = this.#ledger.transition({ kind: "collectionLeaseCheck",
      advice: advice.canonicalOperationId, token: this.#ledger.collectionTokenId(delivery.token),
      expired: delivery.leaseUntil <= now, stopCollector, sameGroup,
      reofferable: stopCollector && sameGroup &&
        this.#composedDelivery.backgroundReofferable(advice.id, delivery.token) });
    if (result.rejection !== undefined) throw new Error("canonical collection lease check refused");
    if (result.commands[0]?.kind === "collectionLeaseReleased") delete advice.delivery;
    else if (result.commands[0]?.kind !== "collectionLeaseKept") throw new Error("invalid canonical collection lease check");
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
    const stopCollector = composed && mode === "turn-end" && this.#composedDelivery.isDeciding(partition);
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    const credentialGeneration = dispatch.credential?.generation ?? null;
    for (const item of [...this.#advice]) {
      const sameScope = composed ? adviceeGroup(item.observation.root, item.observation.advicee) === partition
        : item.partition === partition;
      const disposition = this.#ledger.transition({ kind: "collectionCredentialCheck",
        sameScope, generationValid: item.credentialGeneration === credentialGeneration });
      if (disposition.rejection !== undefined) throw new Error("canonical credential check refused");
      if (disposition.commands[0]?.kind === "collectionRetireCredential") {
        this.#removeAdvice(item.id);
      } else if (disposition.commands[0]?.kind !== "collectionRetainCredential") {
        throw new Error("invalid canonical credential decision");
      }
    }
    // Stop can reoffer only after the background writer has reached a terminal
    // submitted or uncertain state; a live authorized writer remains exclusive.
    for (const item of this.#advice) {
      const delivery = item.delivery;
      const sameGroup = adviceeGroup(item.observation.root, item.observation.advicee) === partition;
      if (delivery !== undefined) this.#checkAdviceLease(item, now, stopCollector, sameGroup);
    }
    const available = this.#advice.filter((item) => {
      const samePartition = composed
        ? adviceeGroup(item.observation.root, item.observation.advicee) === partition
        : item.partition === partition;
      const unleased = item.delivery === undefined;
      const hasUnsuppressed = samePartition && unleased && item.findings.some((finding) =>
        !this.#composedDelivery.suppresses(item.id,
          adviceeGroup(item.observation.root, item.observation.advicee), finding,
          stopCollector ? "stop" : undefined));
      const ticketOwns = ticket === undefined || ticket.units.some((unit) =>
        ticketUnitStage(unit).stage === "finding" && unit.current.adviceId === item.id);
      const result = this.#ledger.transition({ kind: "collectionCandidateCheck",
        samePartition, unleased, hasUnsuppressed, ticketOwns });
      if (result.rejection !== undefined) throw new Error("canonical advice candidate refused");
      if (result.commands[0]?.kind !== "collectionCandidate" && result.commands[0]?.kind !== "collectionSkip") {
        throw new Error("invalid canonical advice candidate");
      }
      return result.commands[0]?.kind === "collectionCandidate";
    });
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
        if (this.#collectionReady(item, now, mode, oldestPendingAt)) item.collectionEligible = true;
      }
    }
    const eligible = available.filter((item) => item.collectionEligible)
      .sort((left, right) => this.#collectionOrder(left, right))
      .map((item) => item.id);
    const token = randomUUID();
    const fittingFindings = (
      retained: ReadonlyArray<Finding>, candidates: ReadonlyArray<Finding>,
      advice: Advice, reportLimit: boolean,
    ) => {
      const facts = this.#findingSelectionFacts(advice, partition, credentialGeneration, this.#now(), composed);
      const onLimited = reportLimit
        ? () => this.#recordOperationalFailure(advice.observation, "output-limit", advice.ticket)
        : undefined;
      return ticket === undefined
        ? selectFittingFindings(retained, candidates, facts, onLimited, this.#collectionFindingOffer)
        : selectFittingClaudeFindings(retained, candidates, ticket.claudeFeedbackMode,
          facts, onLimited, this.#collectionFindingOffer);
    };
    let handoffFindings: Array<Finding> = [];
    const selected: Array<Advice> = [];
    let selectedFindings: Array<Finding> = [];
    for (const id of eligible) {
      const advice = this.#advice.find((item) => item.id === id && item.delivery === undefined);
      if (advice === undefined) continue;
      if (!this.#reserveAdviceLease(advice, token)) continue;
      advice.delivery = {
        token,
        findings: [],
        leaseUntil: Number.POSITIVE_INFINITY,
        acknowledged: false,
      };
      await this.#beforeRevalidate?.(advice.id);
      const validity = await this.#revalidate(advice, dispatch);
      const retained = this.#advice.find((item) => item.id === advice.id);
      const route = bendValidationRoute(retained === advice && retained.delivery?.token === token,
        validationStatus(validity.status));
      if (route.$ === "IgnoreCandidate") continue;
      if (route.$ === "ReleaseCandidate") {
        this.#releaseAdviceLease(advice);
        continue;
      }
      if (route.$ === "RetireCandidate") {
        this.#removeAdvice(advice.id, token);
        continue;
      }
      if (route.$ !== "ContinueCandidate" || validity.status !== "current") {
        this.#releaseAdviceLease(advice);
        continue;
      }
      const workAccepted = advice.round === undefined || advice.workUnitId === undefined ||
        advice.round.policyWork.reviseFinding(advice.workUnitId,
          validity.findings.length, logicalBytes(validity.findings));
      const workRoute = bendPostValidation(workAccepted, false, true);
      if (workRoute.$ !== "RetainCandidate") {
        if (workRoute.$ === "RetireCandidate") this.#removeAdvice(advice.id, token);
        else this.#releaseAdviceLease(advice);
        continue;
      }
      advice.evaluations = validity.evaluations;
      advice.findings = validity.findings;
      if (advice.round !== undefined) this.#recordFindingCount(advice.partition,
        advice.canonicalOperationId, validity.findings.length);
      const handoffNow = this.#now();
      const expiryRoute = bendPostValidation(true, this.#adviceExpired(advice, handoffNow), true);
      if (expiryRoute.$ !== "RetainCandidate") {
        if (expiryRoute.$ === "RetireCandidate") this.#removeAdvice(advice.id, token);
        else this.#releaseAdviceLease(advice);
        continue;
      }
      const fitting = fittingFindings(selectedFindings, advice.findings.filter((finding) =>
        !this.#composedDelivery.suppresses(advice.id,
          adviceeGroup(advice.observation.root, advice.observation.advicee), finding, stopCollector ? "stop" : undefined)), advice, true);
      const fittingRoute = bendPostValidation(true, false, fitting.length > 0);
      if (fittingRoute.$ !== "RetainCandidate") {
        if (fittingRoute.$ === "RetireCandidate") this.#removeAdvice(advice.id, token);
        else this.#releaseAdviceLease(advice);
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
        const route = bendValidationRoute(retained === advice && retained.delivery?.token === token,
          validationStatus(validity.status));
        if (route.$ === "IgnoreCandidate") continue;
        if (route.$ === "ReleaseCandidate") {
          this.#releaseAdviceLease(advice);
          continue;
        }
        if (route.$ === "RetireCandidate") {
          this.#removeAdvice(advice.id, token);
          continue;
        }
        if (route.$ !== "ContinueCandidate" || validity.status !== "current") {
          this.#releaseAdviceLease(advice);
          continue;
        }
        const workAccepted = advice.round === undefined || advice.workUnitId === undefined ||
          advice.round.policyWork.reviseFinding(advice.workUnitId,
            validity.findings.length, logicalBytes(validity.findings));
        const workRoute = bendPostValidation(workAccepted, false, true);
        if (workRoute.$ !== "RetainCandidate") {
          if (workRoute.$ === "RetireCandidate") this.#removeAdvice(advice.id, token);
          else this.#releaseAdviceLease(advice);
          continue;
        }
        advice.evaluations = validity.evaluations;
        advice.findings = validity.findings;
        if (advice.round !== undefined) this.#recordFindingCount(advice.partition,
          advice.canonicalOperationId, validity.findings.length);
        const handoffNow = this.#now();
        const expiryRoute = bendPostValidation(true, this.#adviceExpired(advice, handoffNow), true);
        if (expiryRoute.$ !== "RetainCandidate") {
          if (expiryRoute.$ === "RetireCandidate") this.#removeAdvice(advice.id, token);
          else this.#releaseAdviceLease(advice);
          continue;
        }
        const fitting = fittingFindings(finalFindings, advice.findings.filter((finding) =>
          !this.#composedDelivery.suppresses(advice.id,
            adviceeGroup(advice.observation.root, advice.observation.advicee), finding, stopCollector ? "stop" : undefined)), advice, true);
        const fittingRoute = bendPostValidation(true, false, fitting.length > 0);
        if (fittingRoute.$ !== "RetainCandidate") {
          if (fittingRoute.$ === "RetireCandidate") this.#removeAdvice(advice.id, token);
          else this.#releaseAdviceLease(advice);
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
          const ownerCurrent = retained === advice && delivery?.token === token;
          const credentialGenerationValid = advice.credentialGeneration === credentialGeneration;
          let credentialAuthorized = true;
          if (ownerCurrent && credentialGenerationValid && dispatch.credential !== null) {
            const credentialState = readCredentialState(dispatch.credential.statePath);
            credentialAuthorized = credentialState !== undefined &&
              credentialState.generation === credentialGeneration &&
              (dispatch.credential.environmentOnly || !credentialState.savedUseSuspended);
          }
          const route = bendFinalCandidate(ownerCurrent, credentialGenerationValid,
            credentialAuthorized,
            ownerCurrent && credentialGenerationValid && credentialAuthorized &&
              this.#adviceExpired(advice, handoffNow),
            ownerCurrent && credentialGenerationValid && credentialAuthorized &&
              this.#isCurrentWork(advice.revision, advice.prepared),
            delivery !== undefined && delivery.findings.length > 0);
          if (route.$ === "IgnoreCandidate") continue;
          if (route.$ === "RetireCandidate") {
            this.#removeAdvice(advice.id, token);
            continue;
          }
          if (route.$ === "ReleaseCandidate") {
            this.#releaseAdviceLease(advice);
            continue;
          }
          if (route.$ !== "RetainCandidate" || delivery === undefined) continue;
          delivery.leaseUntil = handoffNow + DELIVERY_LEASE_MS;
          handoff.push(advice);
        }
        const offers = handoff.flatMap((advice) => (advice.delivery?.findings ?? []).map((finding) => ({
          advice,
          finding,
          facts: this.#findingSelectionFacts(advice, partition, credentialGeneration, handoffNow, composed),
        })));
        const accepted = new Set(selectFittingCurrentFindingIndices(offers,
          ticket === undefined ? "codex" : ticket.claudeFeedbackMode,
          (index) => this.#recordOperationalFailure(offers[index]!.advice.observation,
            "output-limit", offers[index]!.advice.ticket, handoffNow),
          this.#collectionFindingOffer));
        let index = 0;
        for (const advice of handoff) {
          const delivery = advice.delivery;
          if (delivery === undefined) continue;
          delivery.findings = delivery.findings.filter(() => accepted.has(index++));
          if (delivery.findings.length === 0) this.#releaseAdviceLease(advice);
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
    const expired = advice.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now) ||
      notices.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now);
    const decision = this.#ledger.transition({ kind: "deliveryAcknowledgeCheck",
      items: advice.length + notices.length, anyExpired: expired });
    if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error("canonical acknowledgement refused");
    if (decision.commands[0]?.kind === "deliveryAckEmpty") return { status: "empty" };
    if (decision.commands[0]?.kind === "deliveryAckExpired") {
      for (const item of advice) this.#releaseAdviceLease(item);
      for (const item of notices) { this.#setNoticeLeased(item.id, false); delete item.delivery; }
      return { status: "empty" };
    }
    if (decision.commands[0]?.kind !== "deliveryAckReady") throw new Error("invalid canonical acknowledgement");
    if (!this.#composedDelivery.markSubmitted(token,
      advice.flatMap((item) => (item.delivery?.findings ?? []).map(() => item.canonicalOperationId)))) {
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
    const allAcknowledged = advice.every((item) => item.delivery?.acknowledged === true) &&
      notices.every((item) => item.delivery?.acknowledged === true);
    const expired = advice.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now) ||
      notices.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now);
    const decision = this.#ledger.transition({ kind: "deliveryFinalizeCheck",
      items: advice.length + notices.length, allAcknowledged, anyExpired: expired });
    if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error("canonical finalization refused");
    if (decision.commands[0]?.kind === "deliveryFinalEmpty") return { status: "empty" };
    if (decision.commands[0]?.kind === "deliveryFinalExpired") {
      for (const item of advice) this.#releaseAdviceLease(item);
      for (const item of notices) { this.#setNoticeLeased(item.id, false); delete item.delivery; }
      return { status: "empty" };
    }
    if (decision.commands[0]?.kind !== "deliveryFinalReady") throw new Error("invalid canonical finalization");
    const composed = this.#composedDelivery.hasToken(token);
    for (const item of advice) {
      const delivered = item.delivery?.findings ?? [];
      const remaining = composed ? [] : withoutDeliveredFindings(item.findings, delivered);
      const disposition = this.#ledger.transition({ kind: "deliveryFindingDispositionCheck",
        composed, remaining: remaining.length });
      if (disposition.rejection !== undefined || disposition.commands.length !== 1) throw new Error("canonical finding disposition refused");
      if (disposition.commands[0]?.kind === "deliveryKeepForReoffer") {
        this.#releaseAdviceLease(item);
        continue;
      }
      if (disposition.commands[0]?.kind === "deliveryRetireAdvice") {
        for (const ticket of this.#tickets.values()) {
          for (const unit of ticket.units) {
            if (ticketUnitStage(unit).stage === "finding" && unit.current.adviceId === item.id) {
              ticketUnitTransition(unit, "markDelivered");
            }
          }
        }
        this.#removeAdvice(item.id, token);
        continue;
      }
      if (disposition.commands[0]?.kind !== "deliveryKeepRemaining") throw new Error("invalid canonical delivery disposition");
      item.findings = remaining;
      item.evaluations = item.evaluations.map((evaluation) => ({
        ...evaluation,
        findings: withoutDeliveredFindings(evaluation.findings, delivered),
      })).filter((evaluation) => evaluation.findings.length > 0);
      this.#releaseAdviceLease(item);
    }
    for (const item of notices) this.#removePendingNotice(item.id, token);
    return { status: "finalized" };
  }

  #releaseUnacknowledged(acknowledged: boolean): boolean {
    const result = this.#ledger.transition({ kind: "deliveryReleaseCheck", acknowledged });
    if (result.rejection !== undefined || result.commands.length !== 1) throw new Error("canonical delivery release refused");
    if (result.commands[0]?.kind === "deliveryReleaseUnacknowledged") return true;
    if (result.commands[0]?.kind === "deliveryKeepAcknowledged") return false;
    throw new Error("invalid canonical delivery release");
  }

  releaseDelivery(token: string): void {
    for (const advice of this.#advice) {
      if (advice.delivery?.token === token &&
          this.#releaseUnacknowledged(advice.delivery.acknowledged)) this.#releaseAdviceLease(advice);
    }
    for (const notice of this.#noticesForToken(token)) {
      if (notice.delivery?.token === token &&
          this.#releaseUnacknowledged(notice.delivery.acknowledged)) {
        this.#setNoticeLeased(notice.id, false);
        delete notice.delivery;
      }
    }
  }

  beginComposedSubmission(token: string, surface: "edit" | "background" | "stop"): ResidentResponse {
    const now = this.#now();
    this.#expirePending(now);
    const finishPermit = surface === "stop" && this.#composedDelivery.hasFinishPermit(token);
    if (finishPermit && this.#composedDelivery.isFinishAuthorized(token)) return { status: "empty" };
    if (!this.#composedDelivery.canBeginExistingToken(surface, token)) return { status: "empty" };
    const advice = this.#advice.filter((item) =>
      item.delivery?.token === token && item.delivery.leaseUntil > now &&
      item.delivery.findings.length > 0);
    const selectionValid = !finishPermit || this.#composedDelivery.finishSelectionMatches(token,
      advice.map((item) => ({ id: item.id, unit: item.canonicalOperationId,
        findings: item.delivery?.findings ?? [] })));
    const allValid = selectionValid && advice.every((item) => {
      const round = item.round;
      const delivery = item.delivery;
      const unit = item.workUnitId;
      const decision = this.#ledger.transition({ kind: "deliverySubmissionCandidateCheck", facts: {
        roundActive: this.#roundActive(round),
        hasRound: round !== undefined,
        hasUnit: unit !== undefined,
        hasDelivery: delivery !== undefined,
        pendingCapacity: round !== undefined && unit !== undefined && delivery !== undefined &&
          delivery.findings.length <= this.#pendingCanonicalFindings(item.canonicalOperationId),
        submissionAllowed: this.#composedDelivery.canBeginSubmission(
          adviceeGroup(item.observation.root, item.observation.advicee), surface, token),
        currentWork: this.#isCurrentWork(item.revision, item.prepared),
        credentialAuthorized: this.#adviceCredentialAuthority(item),
      } });
      if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error("canonical submission candidate refused");
      return decision.commands[0]?.kind === "deliverySubmissionCandidate";
    });
    const batch = this.#ledger.transition({ kind: "deliverySubmissionBatchCheck",
      count: advice.length, allValid });
    if (batch.rejection !== undefined || batch.commands.length !== 1) throw new Error("canonical submission batch refused");
    if (batch.commands[0]?.kind !== "deliveryBatchProceed") {
      this.releaseComposedSubmission(token);
      return { status: "empty" };
    }
    if (surface === "stop") {
      const group = adviceeGroup(advice[0]!.observation.root, advice[0]!.observation.advicee);
      if (!this.#composedDelivery.authorizeFinishOutput(group, token)) return { status: "empty" };
    }
    for (const item of advice) {
      if (finishPermit) continue;
      if (!this.#composedDelivery.beginSubmission(
        item.id, adviceeGroup(item.observation.root, item.observation.advicee),
        token, item.delivery?.findings ?? [], surface, now, item.canonicalOperationId,
      )) {
        this.releaseComposedSubmission(token);
        return { status: "empty" };
      }
    }
    return { status: "submitting" };
  }

  releaseComposedSubmission(token: string): ResidentResponse {
    this.#composedDelivery.release(token);
    this.releaseDelivery(token);
    return { status: "released" };
  }

  #collectionWorkCount(root: string, advicee: DirectAdvicee, composed = false): number {
    const partition = composed ? adviceeGroup(root, advicee) : adviceePartition(root, advicee);
    const dispatcherWork = composed ? 0 : (() => {
      const jobs = this.#dispatcher.snapshotWhere(({ key }) => key === partition);
      return jobs.queued + jobs.running;
    })();
    const work = composed ? this.#rounds.get(partition)?.policyWork.unfinished() ?? 0 : dispatcherWork;
    return Number(composed && this.#composedDelivery.hasPendingEdits(partition)) +
      work +
      this.#advice.filter((item) =>
        (composed ? adviceeGroup(item.observation.root, item.observation.advicee) === partition
          : item.partition === partition) && item.delivery !== undefined).length +
      [...this.#noticeCooldowns.values()].filter((notice) =>
        (composed ? notice.deliveryGroup === partition : notice.partition === partition) && notice.pending?.delivery !== undefined).length;
  }

  #collectionWorkState(root: string, advicee: DirectAdvicee, composed = false): { readonly status: "pending" | "empty" } {
    return { status: this.#collectionWorkCount(root, advicee, composed) > 0 ? "pending" : "empty" };
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

  #noticeTransition(
    event: Extract<Parameters<CapacityLedger["transition"]>[0], { readonly kind: `notice${string}` }>,
    expected: Extract<CanonicalCommand, { readonly kind: `notice${string}` }>["kind"],
  ) {
    const result = this.#ledger.transition(event);
    const command = result.commands[0];
    if (result.rejection !== undefined || command?.kind !== expected) {
      throw new Error(`canonical notice transition refused: ${event.kind}`);
    }
    return command;
  }

  #noticeKeyForPending(id: string): number | undefined {
    for (const cooldown of this.#noticeCooldowns.values()) {
      if (cooldown.pending?.id === id) return cooldown.canonicalId;
    }
    return undefined;
  }

  #setNoticeLeased(id: string, leased: boolean): void {
    const key = this.#noticeKeyForPending(id);
    if (key === undefined) throw new Error("missing canonical notice owner");
    this.#noticeTransition({ kind: "noticeLease", key, leased }, "noticeLeased");
  }

  #removePendingNotice(id: string, token?: string): boolean {
    for (const cooldown of this.#noticeCooldowns.values()) {
      const pending = cooldown.pending;
      if (pending?.id !== id || (token !== undefined && pending.delivery?.token !== token)) continue;
      this.#noticeTransition({ kind: "noticeClearPending", key: cooldown.canonicalId }, "noticePendingCleared");
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
    const allowed = ticket === undefined ? [] : [...this.#noticeCooldowns.values()]
      .filter((cooldown) => cooldown.pending !== undefined &&
        this.#noticeOwners.get(cooldown.pending.id)?.has(ticket.ticket.nonce) === true)
      .map((cooldown) => cooldown.pending!.canonicalId);
    const partitionId = this.#ledger.partitionId(partition);
    const selection = this.#noticeTransition({ kind: "noticeSelect", partition: partitionId,
      group: partitionId, composed, ticketed: ticket !== undefined, allowed }, "noticeSelected");
    if (selection.kind !== "noticeSelected") throw new Error("invalid canonical notice selection");
    const byId = new Map([...this.#noticeCooldowns.values()]
      .flatMap((cooldown) => cooldown.pending === undefined ? [] : [[cooldown.pending.canonicalId, cooldown.pending] as const]));
    const candidates = selection.ids.map((id) => byId.get(id) ??
      (() => { throw new Error("canonical notice missing native payload"); })());
    const candidateValues = candidates.map(({ value }) => value);
    const selectedValues = ticket === undefined
      ? selectFittingNotices(findings, [], candidateValues, this.#collectionNoticeOffer)
      : selectFittingClaudeNotices(findings, candidateValues,
        ticket.claudeFeedbackMode, this.#collectionNoticeOffer);
    const selected = candidates.filter((candidate) => selectedValues.includes(candidate.value));
    for (const notice of selected) {
      this.#setNoticeLeased(notice.id, true);
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
    this.#noticeTransition({ kind: "noticeDrop", key: cooldown.canonicalId }, "noticeDropped");
    this.#noticeCooldowns.delete(key);
    this.#ledger.release(cooldown.reservation);
  }

  #pruneNoticeCooldowns(now: number, exceptKey?: string): void {
    for (const [key, cooldown] of this.#noticeCooldowns) {
      const pending = cooldown.pending;
      const prune = this.#noticeTransition({ kind: "noticePrune", key: cooldown.canonicalId,
        leaseExpired: pending?.delivery !== undefined && pending.delivery.leaseUntil <= now,
        pendingExpired: pending !== undefined && this.#adviceExpired(pending, now),
        excepted: key === exceptKey, cooldownExpired: cooldown.nextAllowedAt <= now }, "noticePruned");
      if (prune.kind !== "noticePruned") throw new Error("invalid canonical notice pruning");
      if (pending !== undefined) {
        if (prune.dropLease) delete pending.delivery;
        if (prune.dropPending) {
          this.#noticeOwners.delete(pending.id);
          delete cooldown.pending;
        }
      }
      if (prune.dropKey) {
        this.#noticeCooldowns.delete(key);
        this.#ledger.release(cooldown.reservation);
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
    const proposed = this.#nextNoticeSequence;
    const candidateKey = retained?.canonicalId ?? this.#nextNoticeKeyId;
    const remaining = retained === undefined ? undefined : Math.ceil(Math.max(0, retained.nextAllowedAt - now));
    const advance = this.#ledger.transition({ kind: "noticeAdvance", key: candidateKey,
      ...(remaining === undefined ? {} : { remaining }),
      maximumKeys: this.#maximumOperationalNoticeKeys, proposed, sequence: proposed,
      maxCount: 2 ** 48 - 1 });
    if (advance.rejection !== undefined || advance.commands.length !== 1) throw new Error("canonical notice advance refused");
    const action = advance.commands[0]!;
    if (action.kind === "noticeRejectedFull") return;
    if (action.kind === "noticeSuppressed") {
      if (retained === undefined) throw new Error("canonical notice suppression lost native key");
      retained.suppressedCount = action.count;
      return;
    }
    if (action.kind !== "noticeCreateKey" && action.kind !== "noticeCreatePending" &&
        action.kind !== "noticeMergePending" && action.kind !== "noticeKeepLeased") return;
    if (action.kind !== "noticeCreateKey") {
      if (retained === undefined) throw new Error("canonical notice refresh lost native key");
      if (action.kind === "noticeCreatePending" && retained.pending !== undefined) throw new Error("canonical notice pending already exists");
      if (action.kind === "noticeMergePending" &&
          (retained.pending === undefined || retained.pending.delivery !== undefined)) throw new Error("canonical notice merge missing unleased pending payload");
      if (action.kind === "noticeKeepLeased" && retained.pending?.delivery === undefined) throw new Error("canonical notice lease missing native payload");
      retained.nextAllowedAt = now + OPERATIONAL_NOTICE_COOLDOWN_MS;
      retained.suppressedCount = 0;
      if (action.kind === "noticeCreatePending") {
        this.#nextNoticeSequence++;
        retained.pending = {
          canonicalId: proposed,
          id: randomUUID(),
          value: { kind, suppressedCount: action.count },
          pendingAt: now,
          sequence: proposed,
        };
        if (ticket !== undefined) this.#noticeOwners.set(retained.pending.id, new Set([ticket.ticket.nonce]));
      } else if (action.kind === "noticeMergePending") {
        retained.pending!.value = { kind, suppressedCount: action.count };
        if (ticket !== undefined) {
          const owners = this.#noticeOwners.get(retained.pending!.id) ?? new Set<string>();
          owners.add(ticket.ticket.nonce);
          this.#noticeOwners.set(retained.pending!.id, owners);
        }
      }
      return;
    }
    if (retained !== undefined) throw new Error("canonical notice created duplicate native key");
    const reservation = this.#reserve(partition, noticeReservationBytes(key, partition), "operationalNotice");
    // Retention is best effort. In particular, do not recursively turn this
    // failed reservation into another capacity failure.
    if (reservation === undefined) return;
    const pendingId = this.#nextNoticeSequence++;
    const keyId = this.#nextNoticeKeyId++;
    const group = adviceeGroup(observation.root, observation.advicee);
    const committed = this.#ledger.transition({ kind: "noticeCommit", key: keyId,
      partition: this.#ledger.partitionId(partition), group: this.#ledger.partitionId(group),
      reservation: reservation.id, pending: pendingId, sequence: pendingId,
      maximumKeys: this.#maximumOperationalNoticeKeys });
    if (committed.rejection !== undefined || committed.commands[0]?.kind !== "noticeCommitted") {
      this.#ledger.release(reservation);
      throw new Error("canonical notice commit refused");
    }
    this.#noticeCooldowns.set(key, {
      canonicalId: keyId,
      partition,
      deliveryGroup: group,
      reservation,
      nextAllowedAt: now + OPERATIONAL_NOTICE_COOLDOWN_MS,
      suppressedCount: 0,
      pending: {
        canonicalId: pendingId,
        id: randomUUID(),
        value: { kind, suppressedCount: 0 },
        pendingAt: now,
        sequence: pendingId,
      },
    });
    const pending = this.#noticeCooldowns.get(key)?.pending;
    if (ticket !== undefined && pending !== undefined) this.#noticeOwners.set(pending.id, new Set([ticket.ticket.nonce]));
  }

  #reserve(partition: string, bytes: number, purpose: CapacityPurpose): CapacityReservation | undefined {
    const reservation = this.#ledger.reserve(partition, bytes, purpose);
    if (reservation !== undefined) {
      this.#peakLedgerBytes = Math.max(this.#peakLedgerBytes, this.#ledger.snapshot().bytes);
    }
    return reservation;
  }

  #subject(partition: string, prepared: PreparedUnit): string {
    return workSubject(partition, prepared);
  }

  #findingSelectionFacts(
    advice: Advice, partition: string, credentialGeneration: number | null,
    now: number, composed: boolean,
  ): FindingSelectionFacts {
    let partitionId = this.#bendPartitions.get(partition);
    if (partitionId === undefined) {
      partitionId = this.#nextBendPartition++;
      this.#bendPartitions.set(partition, partitionId);
    }
    return {
      partition: partitionId,
      round: composed ? this.#composedDelivery.generation(partition) : 0,
      unit: advice.revision.generation,
      snapshot: advice.revision.generation,
      currentSnapshot: this.#currentRevisionGeneration(advice.revision.subject),
      credential: advice.credentialGeneration ?? 0,
      currentCredential: credentialGeneration ?? 0,
      ageMs: Math.floor(Math.max(0, now - advice.pendingAt)),
      collectionReady: advice.collectionEligible &&
        (composed && advice.round !== undefined
          ? advice.round.generation === this.#composedDelivery.generation(partition) : true),
    };
  }

  #revisionId(key: string, retain = false): number {
    let id = this.#revisionIds.get(key);
    if (id === undefined) {
      id = this.#nextRevisionId++;
      if (retain) this.#revisionIds.set(key, id);
    }
    return id;
  }

  #revisionSubject(subject: string, retain = false): number {
    return this.#revisionId(`subject:${subject}`, retain);
  }

  #revisionInput(prepared: PreparedUnit, retain = false): number {
    return this.#revisionId(`input:${canonicalValue(prepared.input)}`, retain);
  }

  #pruneRevisionIds(): void {
    const active = new Set(this.#ledger.canonicalProjection().revision.entries.flatMap(
      ({ subject, input }) => [subject, input]));
    for (const [key, id] of this.#revisionIds) {
      if (!active.has(id)) this.#revisionIds.delete(key);
    }
  }

  #revisionCount(): number {
    const command = this.#ledger.transition({ kind: "revisionCountCheck" }).commands[0];
    if (command?.kind !== "revisionCount") throw new Error("canonical revision count refused");
    return command.count;
  }

  #currentRevisionGeneration(subject: string): number {
    const command = this.#ledger.transition({ kind: "revisionGenerationCheck",
      subject: this.#revisionSubject(subject) }).commands[0];
    if (command?.kind !== "revisionGeneration") throw new Error("canonical revision generation refused");
    return command.generation;
  }

  #registerRevision(partition: string, prepared: PreparedUnit, addMember: boolean): WorkRevision {
    const subject = this.#subject(partition, prepared);
    const command = this.#ledger.transition({ kind: "revisionRegister",
      subject: this.#revisionSubject(subject, true), input: this.#revisionInput(prepared, true), addMember }).commands[0];
    this.#pruneRevisionIds();
    if (command?.kind === "revisionReused") {
      const retained = this.#currentWork.get(subject);
      if (retained === undefined || retained.generation !== command.generation) {
        throw new Error("canonical revision reuse lost its native payload");
      }
      return { subject, token: retained.token, generation: command.generation };
    }
    if (command?.kind !== "revisionReplaced") throw new Error("canonical revision registration refused");
    const token = randomUUID();
    this.#currentWork.set(subject, { token, generation: command.generation, input: prepared.input });
    this.#retireSuperseded(subject, command.generation, addMember);
    return { subject, token, generation: command.generation };
  }

  #registerCurrentWork(partition: string, prepared: PreparedUnit): WorkRevision {
    return this.#registerRevision(partition, prepared, true);
  }

  #retireSuperseded(subject: string, generation: number, includeTickets: boolean): void {
    const superseded = (revision: WorkRevision): boolean => {
      const command = this.#ledger.transition({ kind: "revisionSupersededCheck",
        subject: this.#revisionSubject(subject),
        candidateSubject: this.#revisionSubject(revision.subject),
        generation: revision.generation }).commands[0];
      if (command?.kind !== "revisionSuperseded" && command?.kind !== "revisionNotSuperseded") {
        throw new Error("canonical supersession check refused");
      }
      return command.kind === "revisionSuperseded";
    };
    if (this.#currentRevisionGeneration(subject) !== generation) throw new Error("canonical revision changed");
    if (includeTickets) {
      for (const ticket of this.#tickets.values()) {
        for (const unit of ticket.units) {
          const revision = unit.current.revision;
          if (revision !== undefined && superseded(revision)) unitUnavailable(unit, "stale");
        }
      }
    }
    for (const advice of [...this.#advice]) {
      if (superseded(advice.revision)) this.#removeAdvice(advice.id);
    }
  }

  #restoreCurrentWork(partition: string, prepared: PreparedUnit): WorkRevision {
    return this.#registerRevision(partition, prepared, false);
  }

  #isCurrentWork(revision: WorkRevision, prepared: PreparedUnit): boolean {
    const command = this.#ledger.transition({ kind: "revisionCurrentCheck",
      subject: this.#revisionSubject(revision.subject), input: this.#revisionInput(prepared),
      generation: revision.generation }).commands[0];
    if (command?.kind !== "revisionCurrent" && command?.kind !== "revisionStale") {
      throw new Error("canonical current revision check refused");
    }
    return command.kind === "revisionCurrent" && this.#currentWork.get(revision.subject)?.token === revision.token;
  }

  #releaseCurrentWork(revision: WorkRevision): void {
    const retained = this.#currentWork.get(revision.subject);
    if (retained === undefined || retained.token !== revision.token) return;
    const command = this.#ledger.transition({ kind: "revisionRelease",
      subject: this.#revisionSubject(revision.subject), generation: revision.generation }).commands[0];
    if (command?.kind !== "revisionReleased") throw new Error("canonical revision release refused");
    if (this.#currentRevisionGeneration(revision.subject) === 0) this.#currentWork.delete(revision.subject);
    this.#pruneRevisionIds();
  }

  #releaseUnit(job: Pick<UnitJob, "reservation" | "revision" | "released">): void {
    if (job.released) return;
    job.released = true;
    this.#ledger.release(job.reservation);
    this.#releaseCurrentWork(job.revision);
  }

  #removeAdvice(id: string, token?: string): boolean {
    const index = this.#advice.findIndex((item) =>
      item.id === id && (token === undefined || item.delivery?.token === token));
    if (index < 0) return false;
    const [removed] = this.#advice.splice(index, 1);
    if (removed !== undefined) {
      const retired = this.#ledger.transition({ kind: "collectionRetireAdvice",
        advice: removed.canonicalOperationId });
      if (retired.rejection !== undefined || retired.commands[0]?.kind !== "collectionAdviceRetired") {
        throw new Error("canonical advice retirement refused");
      }
      if (removed.round !== undefined && removed.workUnitId !== undefined) {
        removed.round.policyWork.retire(removed.workUnitId);
      }
      this.#composedDelivery.forget(id);
      for (const ticket of this.#tickets.values()) {
        for (const unit of ticket.units) {
          const stage = ticketUnitStage(unit);
          if (stage.stage === "finding" && unit.current.adviceId === id && !stage.delivered) {
            unitUnavailable(unit, this.#adviceExpired(removed, this.#now()) ? "expired" : "stale");
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
      if (this.#adviceExpired(advice, now)) this.#removeAdvice(advice.id);
    }
  }

  #roundActive(round: RoundWork | undefined): boolean {
    return round === undefined || (!round.controller.signal.aborted &&
      this.#composedDelivery.isActive(round.group, round.generation));
  }

  #allowFinish(group: string, token: string, reason: RoundCloseReason): void {
    const counts = this.#composedDelivery.closureCounts(group);
    const closed = this.#composedDelivery.finishStop(group, token, true,
      this.#now(), [...(this.#rounds.get(group)?.partitions ?? [])]);
    if (closed !== undefined) this.#closeRound(group, closed, reason, counts);
  }

  #jobActive(job: Job): boolean {
    return !job.work?.controller.signal.aborted && this.#roundActive(job.round);
  }

  /** Cut off the pre-decision work cohort without retiring completed advice. */
  #discardUnfinishedWork(round: RoundWork, cancellation: {
    readonly cancelledSource: ReadonlyArray<number>; readonly cancelledJev: ReadonlyArray<number> }): boolean {
    const work = round.work;
    const sourceIds = new Set(cancellation.cancelledSource);
    const unitIds = new Set(cancellation.cancelledJev);
    const named = (job: Job): boolean => job.kind === "ingress"
      ? sourceIds.has(job.canonicalObservationId)
      : unitIds.has(job.canonicalOperationId);
    const namedCounts = this.#dispatcher.snapshotWhere(({ value }) => value.work === work && !value.completed && named(value));
    const hasUnnamed = this.#dispatcher.hasWorkWhere(({ value }) =>
      value.work === work && !value.completed && !named(value));
    const matched = this.#ledger.dispatchScope(namedCounts.queued + namedCounts.running,
      sourceIds.size + unitIds.size, hasUnnamed);
    const counts = matched ? namedCounts : this.#dispatcher.snapshotWhere(({ value }) => value.work === work && !value.completed);
    round.discarded.queued += counts.queued;
    round.discarded.running += counts.running;
    work.controller.abort();
    round.work = { id: randomUUID(), controller: new AbortController() };
    const discarded = this.#dispatcher.discardWhere(({ value }) => value.work === work && (named(value) || !matched));
    for (const job of discarded) this.#discardJob(job);
    return matched;
  }

  #discardJob(job: Job): void {
    if (job.completed) return;
    if (job.kind === "ingress") {
      this.#ledger.observation(job.partition, job.canonicalObservationId, "interruptObservation");
    }
    if (job.ticket !== undefined) ticketFail(job.ticket, "lost");
    if (job.kind === "unit") {
      if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "lost");
      this.#settleJoined(job.evaluationKey, "unavailable", "lost");
      this.#releaseReuseClaim(job.evaluationKey);
      this.#releaseUnit(job);
    } else this.#ledger.release(job.reservation);
    recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
      advicee: job.observation.advicee, lifetime: this.lifetime, stage: "incomplete" });
  }

  #closeRound(group: string, generation: number, reason: RoundCloseReason,
    counts: ReturnType<ComposedDelivery["closureCounts"]>): void {
    // finishStop can release an unwritten provisional slot after callers took
    // the pre-cleanup snapshot. Report the final Bend reservation count.
    const reservedContinuations = this.#composedDelivery.closureCounts(group).reservedContinuations;
    const round = this.#rounds.get(group);
    const activity = this.#roundActivity.get(group);
    this.#roundActivity.delete(group);
    const work = round === undefined ? { queued: 0, running: 0 }
      : this.#dispatcher.snapshotWhere(({ value }) => value.round === round && !value.completed && !value.work?.controller.signal.aborted);
    if (activity !== undefined) recordRoundClosure({ statePath: activity.activityPath,
      root: activity.root, advicee: activity.advicee, lifetime: this.lifetime,
      roundIdentity: `${group}:${generation}`, reason, reservedContinuations,
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
    for (const job of discarded) this.#discardJob(job);
    for (const advice of [...this.#advice]) if (advice.round === round) this.#removeAdvice(advice.id);
    for (const [key, notice] of this.#noticeCooldowns) {
      if (round.partitions.has(notice.partition) || notice.deliveryGroup === group) this.#releaseNoticeCooldown(key);
    }
    for (const partition of round.partitions) this.#reuse.discardPartition(partition);
    for (const [key, ticket] of this.#tickets) if (round.partitions.has(ticket.partition)) {
      this.#tickets.delete(key);
      this.#ledger.transition({ kind: "ticketForget", id: ticket.generation });
    }
    for (const partition of round.partitions) this.#ledger.retireRound(partition);
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
    const observation: DispatchAuthorityObservation = {
      kind: "dispatchAuthority",
      sequence: this.#nextDispatchAuthoritySequence++,
      evaluationId: createHash("sha256").update(job.evaluationKey, "utf8").digest("hex"),
      path: job.prepared.input.path,
      ...details,
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
    const unassignedClaims = new Set<string>();
    try {
      if (job.round !== undefined && job.workObservationId !== undefined &&
          !job.round.policyWork.startSource(job.workObservationId)) {
        if (job.ticket !== undefined) ticketFail(job.ticket, "lost");
        this.#ledger.release(job.reservation);
        return;
      }
      if (!this.#ledger.observation(job.partition, job.canonicalObservationId, "startObservation")) {
        this.#ledger.release(job.reservation);
        return;
      }
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
        if (!(yield* verifyObservationRoot(job.observation))) return undefined;
        if (
          credentialRequired && job.dispatch.credential !== null &&
          readCredentialState(job.dispatch.credential.statePath).generation !== job.dispatch.credential.generation
        ) return undefined;
        return settings;
      }),
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
        const preparation = this.#ledger.beginObservedPreparation(
          job.partition, job.canonicalObservationId, captureWorkspaceBytes(candidate.path));
        if (preparation === undefined) {
          if (job.ticket !== undefined) ticketFail(job.ticket, "capacity");
          this.#rejectedCapacity += 1;
          recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
          continue;
        }
        const workspace = preparation.reservation;
        const pathObservation: DirectObservation = { ...job.observation, candidates: [candidate] };
        const server = this;
        let prepared: PreparedObservation;
        try {
          prepared = await Effect.runPromise(Effect.gen(function* () {
            return yield* prepareObservation(pathObservation, {
              controlledWriter: true,
              advicee: pathObservation.advicee,
              settings,
              ...(server.#captureSource === undefined ? {} : { captureSource: server.#captureSource }),
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
          }),
        { signal: job.work?.controller.signal });
        } catch (cause) {
          this.#ledger.release(workspace);
          throw cause;
        }
        if (!this.#jobActive(job)) { this.#ledger.release(workspace); return; }
        const ready = prepared.outcomes.flatMap((outcome) => {
          const offer = this.#ledger.preparedOffer(outcome.status === "ready", true);
          return offer === "preparedAdmitted" && outcome.status === "ready" ? [outcome] : [];
        });
        if (ready.length === 0) {
          if (this.#ledger.emptyPrepared(ready.length,
            prepared.outcomes.some((outcome) => outcome.status !== "skipped"),
            job.ticket !== undefined) && job.ticket !== undefined) {
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
          const accepted = this.#ledger.preparedOffer(true,
            residentUnitWorstOutcomeBytes(outcome.prepared) <= MAX_IPC_FRAME_BYTES - 1024) === "preparedAdmitted";
          if (!accepted) {
            this.#rejectedCapacity += 1;
            rejectedDeliverable = true;
          }
          return accepted;
        });
        const planned = deliverable.map((outcome) => {
          const generationPartition = `${job.partition}\0work:${job.work?.id ?? "legacy"}\0credential-generation:${job.dispatch.credential?.generation ?? "controlled"}`;
          const evaluationKey = this.#reuse.key(generationPartition, outcome.prepared);
          const liveAdvice = this.#advice.some((advice) => advice.evaluationKey === evaluationKey);
          switch (this.#reuse.route(evaluationKey, liveAdvice)) {
            case "joinedAdvice":
              return { kind: "joined" as const, join: "advice" as const, outcome, evaluationKey };
            case "joinedClaimed":
              return { kind: "joined" as const, join: "claimed" as const, outcome, evaluationKey };
            case "joinedPending": {
              const pending = this.#reuse.pending(evaluationKey);
              if (pending === undefined) throw new Error("canonical reuse route lacks pending evaluation");
              pending.revision = this.#restoreCurrentWork(job.partition, outcome.prepared);
              return { kind: "joined" as const, join: "pending" as const, outcome, evaluationKey };
            }
            case "cached":
              return { kind: "cached" as const, outcome, evaluationKey,
                cached: this.#reuse.cached(evaluationKey) };
            case "owner":
              unassignedClaims.add(evaluationKey);
              return { kind: "owner" as const, outcome, evaluationKey };
          }
        });
        if (this.#afterReuseBoundary !== undefined && planned.some((item) => item.kind === "owner")) {
          await this.#afterReuseBoundary("ownerClaimed");
        }
        const ticketUnitOffset = job.ticket?.units.length ?? 0;
        const retained = planned.filter((item) =>
          item.kind === "owner" || (item.kind === "cached" && item.cached.evaluation.findings.length > 0));
        const reservations = this.#ledger.completePreparation(
          job.partition, preparation.operation, workspace,
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
          const ticketUnit: TicketUnit | undefined = job.ticket === undefined ? undefined : {
            id: this.#nextTicketUnitId++, ticketId: job.ticket.generation,
            ledger: this.#ledger, current: {},
          };
          if (ticketUnit !== undefined && this.#ledger.transition({ kind: "ticketAddUnit",
            id: ticketUnit.ticketId, unit: ticketUnit.id }).commands[0]?.kind !== "ticketUnitAdded") {
            throw new Error("canonical ticket unit admission refused");
          }
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
                  if (item.join === "claimed") {
                    const joined = this.#joinedTicketUnits.get(item.evaluationKey) ?? [];
                    joined.push(ticketUnit);
                    this.#joinedTicketUnits.set(item.evaluationKey, joined);
                  } else unitUnavailable(ticketUnit, "lost");
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
        if (this.#afterReuseBoundary !== undefined &&
            planned.some((item) => item.kind === "joined" && item.join === "claimed")) {
          await this.#afterReuseBoundary("claimJoined");
        }
        for (const [index, item] of retained.entries()) {
          if (!this.#jobActive(job)) {
            for (let remaining = index; remaining < retained.length; remaining++) {
              const admitted = reservations[remaining];
              if (admitted !== undefined) this.#ledger.release(admitted.reservation);
              const pending = retained[remaining];
              if (pending?.kind === "owner") this.#releaseReuseClaim(pending.evaluationKey);
            }
            return;
          }
          const ticketUnit = job.ticket?.units[ticketUnitOffset + planned.indexOf(item)];
          const admitted = reservations[index];
          if (admitted === undefined) {
            if (ticketUnit !== undefined) unitUnavailable(ticketUnit, "capacity");
            if (item.kind === "owner") this.#releaseReuseClaim(item.evaluationKey, "capacity");
            this.#rejectedCapacity += 1;
            this.#recordOperationalFailure(job.observation, "capacity", job.ticket);
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
            continue;
          }
          const reservation = admitted.reservation;
          const revision = this.#registerCurrentWork(job.partition, item.outcome.prepared);
          if (ticketUnit !== undefined) unitRevision(ticketUnit, revision);
          const workUnitId = job.round === undefined || job.workObservationId === undefined ? undefined
            : item.kind === "cached"
              ? job.round.policyWork.cachedFinding(job.workObservationId,
                item.cached.evaluation.findings.length, logicalBytes(item.cached.evaluation.findings), admitted.operation)
              : job.round.policyWork.spawn(job.workObservationId, admitted.operation);
          if (job.round !== undefined && workUnitId === undefined) {
            if (ticketUnit !== undefined) unitUnavailable(ticketUnit, "lost");
            if (item.kind === "owner") this.#releaseReuseClaim(item.evaluationKey);
            this.#ledger.release(reservation);
            this.#releaseCurrentWork(revision);
            continue;
          }
          expectedActivityUnits.push(item.evaluationKey);
          const sourceHash = prepared.observation.outcomes.flatMap((outcome) => outcome.status === "observed" &&
            outcome.path === item.outcome.path ? [outcome.snapshot.sourceHash] : [])[0];
          const unit: UnitJob = {
            kind: "unit",
            ...(job.round === undefined ? {} : { round: job.round, work: job.work }),
            ...(workUnitId === undefined ? {} : { workUnitId }),
            canonicalOperationId: admitted.operation,
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
            if (!this.#ledger.startReview(job.partition, admitted.operation) ||
                !this.#ledger.completeReview(job.partition, admitted.operation, reservation, "finding")) {
              throw new Error("canonical cached review settlement refused");
            }
            recordActivity({
              statePath: job.dispatch.activityPath,
              root: job.observation.root,
              advicee: job.observation.advicee,
              lifetime: this.lifetime,
              stage: "findings",
              findings: item.cached.evaluation.findings.length,
              unitIdentity: item.evaluationKey,
            });
            try {
              await this.#retainAdvice(unit, {
                prepared: item.outcome.prepared,
                findings: item.cached.evaluation.findings,
              }, cycle, sequence);
            } finally {
              if (!unit.completed && job.round !== undefined && workUnitId !== undefined) {
                job.round.policyWork.retire(workUnitId);
                this.#releaseUnit(unit);
              }
            }
            continue;
          }
          if (!this.#reuse.attachPending(item.evaluationKey, unit)) {
            throw new Error("canonical evaluation attachment refused");
          }
          unassignedClaims.delete(item.evaluationKey);
          this.#attachClaimedJoined(item.evaluationKey, revision);
          if (!this.#dispatcher.enqueue(job.partition, unit)) {
            if (ticketUnit !== undefined) unitUnavailable(ticketUnit, "capacity");
            this.#releaseReuseClaim(item.evaluationKey, "capacity");
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
      if (job.round !== undefined && job.workObservationId !== undefined &&
          !job.round.policyWork.completeSource(job.workObservationId)) {
        throw new Error("Bend denied source completion");
      }
      if (!this.#ledger.observation(job.partition, job.canonicalObservationId, "completeObservation")) {
        throw new Error("canonical observation completion refused");
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
      for (const key of unassignedClaims) this.#releaseReuseClaim(key);
      if (!job.completed) this.#ledger.observation(job.partition, job.canonicalObservationId, "interruptObservation");
      if (job.ticket !== undefined) ticketClose(job.ticket);
    }
  }

  async #evaluateUnit(job: UnitJob, cycle: number, sequence: number): Promise<void> {
    try {
      if (job.round !== undefined && job.workUnitId !== undefined &&
          !job.round.policyWork.startUnit(job.workUnitId)) {
        this.#releaseReuseClaim(job.evaluationKey);
        this.#releaseUnit(job);
        return;
      }
      if (!this.#ledger.startReview(job.partition, job.canonicalOperationId)) {
        this.#releaseReuseClaim(job.evaluationKey);
        this.#releaseUnit(job);
        return;
      }
      await this.#awaitBackendGate();
      if (!this.#jobActive(job) || !this.#isCurrentWork(job.revision, job.prepared)) {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "stale");
        this.#settleJoined(job.evaluationKey, "unavailable", "stale");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "incomplete", unitIdentity: job.evaluationKey });
        this.#releaseReuseClaim(job.evaluationKey);
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
        if (!(yield* verifyObservationRoot(job.observation))) return undefined;
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
        const dispatchRootVerified = yield* verifyObservationRoot(job.observation);
        if (!dispatchRootVerified) {
          observeDispatchAuthority({
            decision: "deny",
            reason: "physical-root-mismatch",
            policyDigest: dispatchConfiguration.policy.digest,
            selected: null,
            admission: "refuseRoot",
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
        const admission = admitReview({ rootValid: dispatchRootVerified,
          configurationValid: true, credentialReady: !credentialRequired || credential?.status === "present",
          selected });
        observeDispatchAuthority({
          decision: admission === "admitReview" ? "allow" : "deny",
          reason: admission === "admitReview" ? "selected-by-file-policy" : "excluded-by-file-policy",
          policyDigest: dispatchConfiguration.policy.digest,
          selected,
          admission,
          physicalRootVerified: true,
          credentialStatus: credential?.status ?? "not-required",
          credentialGeneration: credential?.generation ?? null,
        });
        if (admission !== "admitReview") return undefined;
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
      }),
        { signal: job.work?.controller.signal });
      if (!this.#jobActive(job)) { this.#releaseReuseClaim(job.evaluationKey); this.#releaseUnit(job); return; }
      if (result?.status === "evaluated" && this.#lifecycle === "active") {
        if (job.round !== undefined && job.workUnitId !== undefined &&
            !job.round.policyWork.outcome(job.workUnitId, result.findings.length === 0
              ? { $: "Clear" }
              : { $: "Finding", count: result.findings.length, bytes: logicalBytes(result.findings) })) {
          throw new Error("Bend denied review outcome");
        }
        const disposition = this.#ledger.observeReview(job.partition, job.canonicalOperationId,
          job.reservation, result.findings.length === 0 ? "clear" : "finding",
          this.#isCurrentWork(job.revision, job.prepared));
        recordDemoTrace(job.dispatch.demoBudgetPath, job.observation.root, job.observation.advicee, {
          kind: "terminal", ...(job.sourceHash === undefined ? {} : { sourceHash: job.sourceHash }),
          state: result.findings.length === 0 ? "clear" : "findings",
        });
        const evaluation = { prepared: job.prepared, findings: result.findings };
        this.#reuse.put(job.partition, job.evaluationKey, evaluation);
        this.#releaseReuseClaim(job.evaluationKey);
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
        if (disposition !== "retainFinding") {
          if (disposition === "retireStaleFinding" &&
              job.round !== undefined && job.workUnitId !== undefined) {
            job.round.policyWork.retire(job.workUnitId);
          }
          if (job.ticketUnit !== undefined) {
            if (disposition === "settleClear") {
              unitClear(job.ticketUnit, job.revision);
            } else unitUnavailable(job.ticketUnit, "stale");
          }
          this.#settleJoined(job.evaluationKey,
            disposition === "settleClear" ? "clear" : "unavailable",
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
      const failure = this.#ledger.reviewFailure(result?.status === "backend" || result?.status === "timeout",
        result?.status === "credential", result === undefined);
      if (!this.#ledger.completeReview(job.partition, job.canonicalOperationId,
        job.reservation, "unavailable")) {
        return;
      }
      if (failure === "failureBackend") {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "backend");
        this.#settleJoined(job.evaluationKey, "unavailable", "backend");
        this.#recordOperationalFailure(job.observation, "backend", job.ticket);
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (failure === "failureCredential") {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "credential");
        this.#settleJoined(job.evaluationKey, "unavailable", "credential");
        this.#recordOperationalFailure(job.observation, "credential", job.ticket);
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (failure === "failureLost") {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "lost");
        this.#settleJoined(job.evaluationKey, "unavailable", "lost");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (failure !== "failureNone") {
        throw new Error("Bend denied review failure disposition");
      }
    } catch {
      if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "backend");
      this.#settleJoined(job.evaluationKey, "unavailable", "backend");
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error("resident evaluation unavailable");
      recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
    } finally {
    }
    this.#releaseReuseClaim(job.evaluationKey);
    this.#releaseUnit(job);
  }

  #attachClaimedJoined(key: string, revision: WorkRevision): void {
    for (const unit of this.#joinedTicketUnits.get(key) ?? []) {
      if (unit.current.revision === undefined && ticketUnitStageOrUndefined(unit)?.stage === "pending") {
        unitRevision(unit, revision);
      }
    }
  }

  #releaseReuseClaim(key: string, reason: ResidentUnavailableReason = "lost"): void {
    this.#reuse.releaseClaim(key);
    const joined = this.#joinedTicketUnits.get(key);
    if (joined === undefined) return;
    const attached: TicketUnit[] = [];
    for (const unit of joined) {
      if (unit.current.revision !== undefined) attached.push(unit);
      else unitUnavailable(unit, reason);
    }
    if (attached.length > 0) this.#joinedTicketUnits.set(key, attached);
    else this.#joinedTicketUnits.delete(key);
  }

  #settleJoined(key: string, state: "pending" | "clear" | "finding" | "unavailable", reason?: ResidentUnavailableReason,
    adviceId?: string): void {
    const joined = this.#joinedTicketUnits.get(key);
    if (joined === undefined) return;
    this.#joinedTicketUnits.delete(key);
    for (const unit of joined) {
      if (ticketUnitStageOrUndefined(unit) === undefined) continue;
      const revision = unit.current.revision;
      const stage = ticketUnitStage(unit);
      const disposition = this.#ledger.transition({ kind: "ticketJoinedCheck", state,
        staleUnavailable: stage.stage === "unavailable" && stage.reason === "stale",
        hasRevision: revision !== undefined, hasAdviceId: adviceId !== undefined }).commands[0]?.kind;
      switch (disposition) {
        case "ticketKeepJoined": break;
        case "ticketSetJoinedUnavailable": unitUnavailable(unit, reason ?? "lost"); break;
        case "ticketSetJoinedLost": unitUnavailable(unit, "lost"); break;
        case "ticketSetJoinedClear":
          if (revision === undefined) throw new Error("Bend joined clear lacks revision");
          unitClear(unit, revision);
          break;
        case "ticketSetJoinedFinding":
          if (revision === undefined || adviceId === undefined) throw new Error("Bend joined finding lacks identity");
          unitFinding(unit, revision, adviceId);
          break;
        default: throw new Error("Bend denied joined ticket disposition");
      }
    }
  }

  #retainAdvice(
    job: UnitJob,
    evaluation: EvaluatedUnit,
    cycle: number,
    sequence: number,
  ): Promise<void> | void {
    if (!this.#jobActive(job)) {
      if (job.round !== undefined && job.workUnitId !== undefined) job.round.policyWork.retire(job.workUnitId);
      this.#releaseUnit(job);
      return;
    }
    if (this.#advice.some((item) => item.evaluationKey === job.evaluationKey)) {
      const existing = this.#advice.find((item) => item.evaluationKey === job.evaluationKey);
      if (job.ticketUnit !== undefined && existing !== undefined) {
        unitFinding(job.ticketUnit, job.revision, existing.id);
      }
      if (existing !== undefined) this.#settleJoined(job.evaluationKey, "finding", undefined, existing.id);
      if (job.round !== undefined && job.workUnitId !== undefined) job.round.policyWork.retire(job.workUnitId);
      this.#releaseUnit(job);
      return;
    }
    if (!this.#ledger.resize(job.reservation, job.reservation.bytes, "storedResult")) {
      throw new Error("Bend denied review result retention reservation");
    }
    if (job.round !== undefined) this.#recordFindingCount(job.partition,
      job.canonicalOperationId, evaluation.findings.length);
    const advice: Advice = {
      id: randomUUID(),
      ...(job.round === undefined ? {} : { round: job.round }),
      ...(job.workUnitId === undefined ? {} : { workUnitId: job.workUnitId }),
      canonicalOperationId: job.canonicalOperationId,
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
      credentialStatePath: job.dispatch.credential?.statePath ?? null,
      credentialRequired: job.dispatch.controlled === null || job.dispatch.controlled.requireCredential === true,
      credentialEnvironmentOnly: job.dispatch.credential?.environmentOnly ?? false,
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
      "adviceRecheck",
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
        return yield* revalidateEvaluations(advice.observation, advice.evaluations, {
          controlledWriter: true,
          advicee: advice.observation.advicee,
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
      }),
        { signal: advice.round?.controller.signal });
      return capacityUnavailable ? { status: "unavailable", findings: [] } : current;
    } catch {
      return { status: "unavailable", findings: [] };
    } finally {
      advice.revalidationActive = false;
      if (advice.retired) this.#releaseUnit(advice);
      else this.#ledger.resize(advice.reservation, retainedBytes, "storedResult");
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
      const closed = this.#composedDelivery.finishStop(group, request.token, request.close === true,
        this.#now(), [...(this.#rounds.get(group)?.partitions ?? [])]);
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
      const decision = this.#composedDelivery.registerEditDecision(group, request.advicee.toolUseId, request.startedAt);
      if (!decision.accepted) return { status: "rejected-stale", reason: decision.reason };
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
        const gate = this.#ticketCollectGate(ticket, request.dispatch, this.#now());
        if (gate !== undefined) return gate;
        const collected = await this.collect(request.root, request.advicee, request.dispatch, request.mode ?? "ordinary", ticket);
        return collected.status === "advice" ? { ...collected, version: 2 } : this.#terminalStatus(ticket, this.#now());
      }
      if (request.finish !== undefined) {
        const group = adviceeGroup(request.root, request.advicee);
        if (!this.#composedDelivery.ownsStop(group, request.finish.token)) return { status: "empty" };
        // Expired leases represent uncertain external output, not live writers.
        this.#pruneNoticeCooldowns(this.#now());
        for (const advice of this.#advice) {
          if (adviceeGroup(advice.observation.root, advice.observation.advicee) === group &&
              advice.delivery !== undefined && advice.delivery.leaseUntil <= this.#now()) this.#releaseAdviceLease(advice);
        }
        const round = this.#rounds.get(group);
        const totalUnfinished = this.#collectionWorkCount(request.root, request.advicee, true);
        const ownUnfinished = round?.policyWork.unfinished() ?? 0;
        const extraUnfinished = Math.max(0, totalUnfinished - ownUnfinished);
        const gate = this.#composedDelivery.finishGate(group, request.finish.token,
          extraUnfinished, request.finish.deadlineReached, [...(round?.partitions ?? [])]);
        if (gate === undefined) return { status: "empty" };
        if (gate.status === "waiting") return { status: "pending" };
        if (round !== undefined && !this.#discardUnfinishedWork(round, gate)) {
          this.#allowFinish(group, request.finish.token, "unavailable");
          return { status: "empty" };
        }
        if (gate.limited) {
          this.#allowFinish(group, request.finish.token, "limit");
          return { status: "empty" };
        }
      }
      const collected = request.composed === true
        ? await this.collect(request.root, request.advicee, request.dispatch, request.mode ?? "ordinary", undefined, true)
        : await this.collect(request.root, request.advicee, request.dispatch, request.mode ?? "ordinary");
      if (request.finish !== undefined) {
        const group = adviceeGroup(request.root, request.advicee);
        const round = this.#rounds.get(group);
        const selectedAdvice = collected.status === "advice"
          ? this.#advice.filter((advice) => advice.delivery?.token === collected.token) : [];
        const selected = selectedAdvice.map((advice) => ({ id: advice.id,
          unit: advice.canonicalOperationId, findings: advice.delivery?.findings ?? [] }));
        const selectedCount = selected.reduce((count, item) => count + item.findings.length, 0);
        const bindingValid = collected.status !== "advice" || collected.findingCount === 0 ||
          (round !== undefined && selectedCount === collected.findingCount &&
            selectedAdvice.every((advice) => advice.round === round &&
              advice.workUnitId !== undefined && advice.delivery !== undefined &&
              advice.delivery.findings.length <= this.#pendingCanonicalFindings(advice.canonicalOperationId)));
        const output = this.#composedDelivery.decideFinishOutput(group, request.finish.token,
          collected.status === "advice" ? collected.token : "", selected, this.#now(),
          collected.status === "advice" && collected.findingCount === 0,
          true, true, bindingValid, request.finish.deadlineReached);
        if (output.kind === "failed") {
          if (collected.status === "advice") this.releaseDelivery(collected.token);
          return { status: "empty" };
        }
        if (output.kind === "allowed") {
          if (collected.status === "advice") this.releaseDelivery(collected.token);
          this.#allowFinish(group, request.finish.token, output.reason);
          if (collected.status === "advice") return { status: "empty" };
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

  #ticketCollectGate(ticket: TicketRecord, dispatch: ResidentDispatchContext,
    now: number): ResidentResponse | undefined {
    const command = this.#ledger.transition({ kind: "ticketCollectGateCheck",
      expired: now >= ticket.expiresAt,
      credentialValid: ticket.credentialGeneration === (dispatch.credential?.generation ?? null) &&
        this.#credentialAuthority(ticket) }).commands[0];
    if (command?.kind === "ticketCollectProceed") return undefined;
    if (command?.kind === "ticketCollectUnavailable") {
      return { version: 2, status: "unavailable", reason: command.reason };
    }
    throw new Error("canonical ticket collect gate refused");
  }

  #terminalStatus(ticket: TicketRecord, now: number): ResidentResponse {
    const liveAdvice = this.#advice.some((item) => ticket.units.some((unit) =>
      ticketUnitStage(unit).stage === "finding" && unit.current.adviceId === item.id));
    const pendingNotice = [...this.#noticeCooldowns.values()].some((item) =>
      item.partition === ticket.partition && item.pending !== undefined);
    const command = this.#ledger.transition({ kind: "ticketTerminal", id: ticket.generation,
      expired: now >= ticket.expiresAt, credentialValid: this.#credentialAuthority(ticket),
      liveAdvice, pendingNotice }).commands[0];
    switch (command?.kind) {
      case "ticketPending": return { version: 2, status: "pending" };
      case "ticketUnavailable": return { version: 2, status: "unavailable", reason: command.reason };
      case "ticketDelivered": return { version: 2, status: "delivered" };
      case "ticketClear": return { version: 2, status: "clear" };
      case "ticketNoWork": return { version: 2, status: "no-work" };
      default: throw new Error("canonical ticket terminal status refused");
    }
  }

  #credentialAuthority(ticket: TicketRecord): boolean {
    if (!ticket.credentialRequired) return true;
    const credentialState = ticket.credentialStatePath === null ? undefined : readCredentialState(ticket.credentialStatePath);
    return credentialState !== undefined &&
      credentialState.generation === ticket.credentialGeneration &&
      (ticket.credentialEnvironmentOnly || !credentialState.savedUseSuspended);
  }

  #adviceCredentialAuthority(advice: Advice): boolean {
    if (advice.credentialStatePath === null) return !advice.credentialRequired;
    const state = readCredentialState(advice.credentialStatePath);
    return state !== undefined && state.generation === advice.credentialGeneration &&
      (advice.credentialEnvironmentOnly || !state.savedUseSuspended);
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
      if (request.version === 1 && request.operation === "collect" && request.finish === undefined && request.reportWorkState === true &&
          (response.status === "empty" || response.status === "pending")) {
        return this.#collectionWorkState(request.root, request.advicee, request.composed === true);
      }
      if (request.version !== 2 || request.operation !== "collect") return response;
      const now = this.#now();
      this.#expirePending(now);
      this.#pruneNoticeCooldowns(now);
      const ticket = this.#ticketFor(request.ticket, request.root, request.advicee, request.dispatch);
      if (ticket === undefined) return { version: 2, status: "unavailable", reason: "lost" };
      return this.#ticketCollectGate(ticket, request.dispatch, now) ?? this.#terminalStatus(ticket, now);
    }
    const now = this.#now();
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    const legacyCollect = request.operation === "collect" && request.version !== 2;
    let invalidCredential = false;
    if (legacyCollect) for (const advice of this.#advice) {
      if (advice.delivery?.token !== response.token || invalidCredential) continue;
      const generationValid = advice.credentialGeneration === (request.dispatch.credential?.generation ?? null);
      const observed = this.#ledger.transition({ kind: "deliveryCredentialObserveCheck",
        invalidSeen: invalidCredential, generationValid,
        authorized: generationValid && this.#adviceCredentialAuthority(advice) });
      if (observed.rejection !== undefined || observed.commands.length !== 1) throw new Error("canonical credential observation refused");
      invalidCredential = observed.commands[0]?.kind === "deliveryCredentialInvalid";
    }
    const credentialGate = this.#ledger.transition({ kind: "deliveryFinalCredentialCheck",
      legacyCollect, invalidSeen: invalidCredential });
    if (credentialGate.rejection !== undefined || credentialGate.commands.length !== 1) throw new Error("canonical final credential gate refused");
    if (credentialGate.commands[0]?.kind !== "deliveryBatchProceed") {
      this.releaseComposedSubmission(response.token);
      return { status: "empty" };
    }
    const handoff: Array<Advice> = [];
    for (const advice of [...this.#advice]) {
      if (advice.delivery?.token !== response.token) continue;
      const route = bendFinalCandidate(true, true, true,
        !this.#roundActive(advice.round) || this.#adviceExpired(advice, now),
        this.#isCurrentWork(advice.revision, advice.prepared),
        advice.delivery.findings.length > 0);
      if (route.$ === "RetireCandidate") {
        this.#removeAdvice(advice.id, response.token);
        continue;
      }
      if (route.$ === "ReleaseCandidate") {
        this.#releaseAdviceLease(advice);
        continue;
      }
      if (route.$ !== "RetainCandidate") continue;
      advice.delivery.leaseUntil = now + DELIVERY_LEASE_MS;
      handoff.push(advice);
    }
    const ticket = request.version === 2 && request.operation === "collect"
      ? this.#ticketFor(request.ticket, request.root, request.advicee, request.dispatch)
      : undefined;
    if (request.version === 2 && request.operation === "collect" && ticket === undefined) {
      this.releaseDelivery(response.token);
      return { version: 2, status: "unavailable", reason: "lost" };
    }
    if (request.operation === "collect") {
      const composed = request.version !== 2 && request.composed === true;
      const partition = composed
        ? adviceeGroup(request.root, request.advicee)
        : adviceePartition(request.root, request.advicee);
      const generation = request.dispatch.credential?.generation ?? null;
      if (composed) for (const advice of handoff) {
        if (advice.delivery !== undefined && (advice.round === undefined ||
            advice.workUnitId === undefined ||
            advice.delivery.findings.length > this.#pendingCanonicalFindings(advice.canonicalOperationId))) {
          this.#releaseAdviceLease(advice);
        }
      }
      const offers = handoff.flatMap((advice) => (advice.delivery?.findings ?? []).map((finding) => ({
        finding,
        facts: this.#findingSelectionFacts(advice, partition, generation, now, composed),
      })));
      const accepted = new Set(selectFittingCurrentFindingIndices(offers,
        ticket === undefined ? "codex" : ticket.claudeFeedbackMode,
        undefined, this.#collectionFindingOffer));
      let index = 0;
      for (const advice of handoff) {
        if (advice.delivery === undefined) continue;
        advice.delivery.findings = advice.delivery.findings.filter(() => accepted.has(index++));
        if (advice.delivery.findings.length === 0) this.#releaseAdviceLease(advice);
      }
    }
    const findings = handoff.flatMap((advice) => advice.delivery?.findings ?? []);
    const notices = this.#noticesForToken(response.token);
    for (const notice of notices) {
      if (notice.delivery !== undefined) notice.delivery.leaseUntil = now + DELIVERY_LEASE_MS;
    }
    if (ticket !== undefined && request.operation === "collect") {
      const gate = this.#ticketCollectGate(ticket, request.dispatch, now);
      if (gate !== undefined) {
        this.releaseDelivery(response.token);
        return gate;
      }
    }
    const admittedBlock = ticket?.claudeFeedbackMode === "block-current-findings";
    const currentBlock = admittedBlock && ticket !== undefined &&
      this.#currentClaudeFeedbackMode(ticket.root, ticket.userConfigPath) === "block-current-findings";
    if (ticket !== undefined && this.#ledger.transition({ kind: "ticketFinalAuthorityCheck", admittedBlock,
      currentBlock }).commands[0]?.kind !== "ticketFinalProceed") {
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
    return selected.status === "advice" ? { ...selected, version: 2 }
      : this.#terminalStatus(ticket, now);
  }

  /** Replace a provisional Stop reservation with the exact final IPC batch. */
  #reconcileFinishHandoff(request: ResidentRequest, provisional: ResidentResponse,
    final: ResidentResponse, canWrite: boolean): ResidentResponse {
    if (request.operation !== "collect" || request.version === 2 || request.finish === undefined ||
        provisional.status !== "advice" || provisional.findingCount === 0) return final;
    const group = adviceeGroup(request.root, request.advicee);
    if (!this.#composedDelivery.revokeProvisionalFinishOutput(group, request.finish.token, provisional.token)) {
      this.releaseDelivery(provisional.token);
      this.#allowFinish(group, request.finish.token, "unavailable");
      return { status: "empty" };
    }
    const round = this.#rounds.get(group);
    const selectedAdvice = final.status === "advice"
      ? this.#advice.filter((advice) => advice.delivery?.token === final.token) : [];
    const selectedCount = selectedAdvice.reduce((count, advice) =>
      count + (advice.delivery?.findings.length ?? 0), 0);
    const selected = selectedAdvice.map((advice) => ({ id: advice.id, unit: advice.canonicalOperationId,
      findings: advice.delivery?.findings ?? [] }));
    const bindingValid = final.status !== "advice" || final.findingCount === 0 ||
      (round !== undefined && selectedCount === final.findingCount && selectedAdvice.every((advice) =>
        advice.round === round && advice.workUnitId !== undefined && advice.delivery !== undefined &&
        advice.delivery.findings.length <= this.#pendingCanonicalFindings(advice.canonicalOperationId)));
    const output = this.#composedDelivery.decideFinishOutput(group, request.finish.token,
      final.status === "advice" ? final.token : "", selected, this.#now(),
      final.status === "advice" && final.findingCount === 0,
      false, canWrite && final.status === "advice" && final.token === provisional.token,
      bindingValid, request.finish.deadlineReached);
    if (output.kind === "reserved") return final;
    if (final.status === "advice") this.releaseDelivery(final.token);
    this.#allowFinish(group, request.finish.token,
      output.kind === "allowed" ? output.reason : "unavailable");
    return { status: "empty" };
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
        const selected = this.#responseForHandoff(decoded, response);
        const handoff = this.#reconcileFinishHandoff(decoded, response, selected, !socket.destroyed);
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
        this.#releaseReuseClaim(job.evaluationKey);
        this.#releaseUnit(job);
      }
      else this.#ledger.release(job.reservation);
    }
    for (const advice of this.#advice.splice(0)) {
      advice.retired = true;
      if (!advice.revalidationActive) this.#releaseUnit(advice);
    }
    for (const key of [...this.#noticeCooldowns.keys()]) this.#releaseNoticeCooldown(key);
    this.#noticeOwners.clear();
    // Running work may be interrupted by process exit or finish later. Clear
    // its logical ownership now; its eventual terminal release is idempotent.
    this.#reuse.clear();
    this.#ledger.clear();
    this.#currentWork.clear();
    this.#revisionIds.clear();
    const server = this.#server;
    if (server !== undefined) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(this.paths.socket, { force: true });
    await rm(this.paths.owner, { force: true });
  }
}
