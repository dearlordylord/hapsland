import { recordRoundClosure, type RoundCloseReason } from "../activity/status.ts";
import { monotonicNow } from "./hook-clock.ts";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, statSync, writeFileSync } from "node:fs";
import { access, appendFile, chmod, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { join, resolve } from "node:path";
import { canonicalValue, isCodexHostVersion, type DirectObservation, type DirectAdvicee } from "../direct-event/model.ts";
import {
  evaluatePrepared,
  encodedPreparedProviderInputBytes,
  prepareObservation,
  preparedUnitStillCurrent,
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
import { captureStable, MAX_SOURCE_BYTES } from "../direct-event/capture.ts";
import { resolvedDirectFilePolicy, selectedByDirectFilePolicy } from "../direct-event/selection.ts";
import { admitReview } from "../configuration/decision.ts";
import { liveLayer as jevDecisionModelLiveLayer } from "../jev-decision.ts";
import { loadReviewSettings } from "../runtime/review-config.ts";
import { loadConfiguration } from "../configuration/load.ts";
import { effectiveEditPermitLimits, effectiveVirtualRoundQuietMs } from "../configuration/resolve.ts";
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
  decodeCurrentResidentRequest,
  encodeCurrentResidentResponse,
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
import { DispatchQueue } from "./dispatch.ts";
import { ComposedDelivery } from "./composed-delivery.ts";
import { BendWorkTracker } from "./bend-work.ts";
import type { CanonicalCommand, CanonicalEvent, TicketReason, TicketUnitEvent } from "../canonical/adapter.ts";
import {
  PENDING_ADVICE_EXPIRY_MS,
  combinedClaudeOutput,
  combinedReviewOutput,
  encodedComposedClaudeOutputBytes,
  selectFittingComposedClaudeFindings,
  selectFittingFindings,
  selectFittingCurrentFindingIndices,
  selectFittingClaudeFindings,
  type ClaudeOutputMode,
  type ComposedClaudeSurface,
  type CollectionMode,
  type FindingSelectionFacts,
  type CanonicalFindingOffer,
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

const RESERVATION_OVERHEAD_BYTES = 1024;
const MAX_PROBABILITY_ENCODING_BYTES = 24;
const RESIDENT_IDLE_CHECK_MS = 20_000;
const VIRTUAL_ROUND_QUIET_CHECK_MS = 20_000;
export const OPERATIONAL_NOTICE_COOLDOWN_MS = 60_000;
export const MAX_OPERATIONAL_NOTICE_KEYS = 64;
/** Covers bounded dual capture buffers/text plus declaration-count preflight payload. */
const CAPTURE_WORKSPACE_BYTES = 8 * MAX_SOURCE_BYTES;
/** Includes retained supporting parse facts under the 1.5 MiB graph read ceiling. */
const IMPORT_GRAPH_WORKSPACE_BYTES = 8 * 1024 * 1024;

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
    (preflight?.hasImports ? IMPORT_GRAPH_WORKSPACE_BYTES : 0) +
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
  failureOnSourceIncludes: Schema.optionalKey(Schema.String),
  capturePath: Schema.optionalKey(Schema.String),
  outcomePath: Schema.optionalKey(Schema.String),
  requireCredential: Schema.optionalKey(Schema.Boolean),
  syntheticR6BrandedRepair: Schema.optionalKey(Schema.Literals(["control", "finding"])),
});

type WorkCohort = { readonly id: string; readonly controller: AbortController };
type RoundWork = {
  readonly group: string;
  readonly generation: number;
  readonly canonicalRound: number;
  readonly controller: AbortController;
  work: WorkCohort;
  readonly policyWork: BendWorkTracker;
  readonly discarded: { queued: number; running: number };
};

type IngressJob = {
  readonly canonicalRound: number;
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
type TicketUnit = { readonly id: number;
  /** Admission capability generation, distinct from the canonical observation ID. */
  readonly ticketId: number;
  readonly ledger: CapacityLedger; current: TicketUnitState };
type JoinedReview = {
  readonly admission: number;
  readonly evaluationKey: string;
  readonly observation: DirectObservation;
  readonly activityPath: string | undefined;
  readonly ticketUnit?: TicketUnit;
  revision?: WorkRevision;
};
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
  readonly partition: string; readonly editAuthority: string; readonly credentialGeneration: number | null;
  readonly root: string; readonly userConfigPath: string | null; readonly claudeFeedbackMode: ClaudeOutputMode;
  readonly credentialStatePath: string | null; readonly credentialRequired: boolean;
  readonly credentialEnvironmentOnly: boolean;
  readonly expiresAt: number };
const TICKET_RETENTION_MS = 600_000;
const MAX_TICKETS = 256;

type UnitJob = {
  readonly canonicalRound: number;
  readonly round?: RoundWork;
  readonly work?: WorkCohort;
  completed?: boolean;
  released?: boolean;
  requestId?: number;
  requestStarted?: boolean;
  readonly kind: "unit";
  readonly workUnitId?: number;
  /** The canonical observation admitted before source preparation began. */
  readonly admissionId: number;
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

export type JevRequestObservation = {
  readonly stage: "issued" | "unavailable" | "started" | "interrupted" | "settled";
  readonly partition: string;
  readonly canonicalPartition: number;
  readonly lifetime: string;
  readonly canonicalLifetime: number;
  readonly round: number;
  readonly hapslandRound: number | null;
  readonly operation: number;
  readonly request?: number;
  readonly outcome?: "neverSent" | "finding" | "clear" | "backendFailure" | "timeout" | "interrupted";
};

type Advice = Omit<UnitJob, "dispatch" | "kind" | "work" | "completed"> & {
  readonly id: string;
  evaluations: ReadonlyArray<EvaluatedUnit>;
  findings: ReadonlyArray<Finding>;
  readonly sequence: number;
  readonly credentialGeneration: number | null;
  readonly credentialStatePath: string | null;
  readonly credentialRequired: boolean;
  readonly credentialEnvironmentOnly: boolean;
  readonly pendingAt: number;
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

/** Stable identity of the agent receiving advice, across edits and virtual rounds. */
const adviceePartition = (root: string, advicee: DirectAdvicee) => canonicalValue({
  root,
  host: advicee.host,
  hostVersion: advicee.hostVersion,
  sessionId: advicee.sessionId,
  subagentId: advicee.subagentId,
});

/** Individual edit authority for a tool-bound response or ticket. */
const editAuthority = (root: string, advicee: DirectAdvicee) => canonicalValue({
  partition: adviceePartition(root, advicee),
  toolUseId: advicee.toolUseId,
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
  readonly #currentWork = new Map<string, CurrentWork>();
  readonly #bendPartitions = new Map<string, number>();
  #nextBendPartition = 1;
  readonly #tickets = new Map<string, TicketRecord>();
  readonly #ticketUnits = new Set<TicketUnit>();
  readonly #joinedReviews = new Map<string, Array<JoinedReview>>();
  #nextAdmissionGeneration = 1;
  #nextTicketUnitId = 1;
  readonly #ledger = new CapacityLedger(undefined, this.lifetime);
  readonly #reuse: EvaluationReuse<UnitJob>;
  readonly #dispatcher: DispatchQueue<string, Job>;
  readonly #roundActivity = new Map<string, { root: string; advicee: DirectAdvicee; activityPath: string | undefined }>();
  readonly #stopTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #rounds = new Map<string, RoundWork>();
  readonly #composedDelivery = new ComposedDelivery(this.#ledger, (diagnostic) => {
    // Keep diagnostics source-free and bounded even for an indefinitely running resident.
    const path = join(this.paths.directory, "repeat-edits.log");
    const line = `${JSON.stringify({ at: Date.now(), ...diagnostic })}\n`;
    const limit = 256 * 1024;
    try { writeFileSync(join(this.paths.directory, "repeat-edits-observed"), "1\n", { flag: "wx", mode: 0o600 }); }
    catch { /* The marker is already present or diagnostics are unavailable. */ }
    try {
      const size = statSync(path).size;
      if (size + Buffer.byteLength(line) > limit) writeFileSync(path, line, { mode: 0o600 });
      else appendFileSync(path, line, { mode: 0o600 });
    } catch {
      try { writeFileSync(path, line, { mode: 0o600 }); } catch { /* logging cannot block admission */ }
    }
  });
  readonly #now: () => number;
  readonly #maximumOperationalNoticeKeys: number;
  readonly #maximumTickets: number;
  #server: Server | undefined;
  #connections = 0;
  #lifecycle: "active" | "retiring" | "closed" = "active";
  #retirementScheduled = false;
  #idleTimer: ReturnType<typeof setTimeout> | undefined;
  #quietTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #lifetimeController = new AbortController();
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
  readonly #jevRequestObserver: ((observation: JevRequestObservation) => void) | undefined;
  #nextDispatchAuthoritySequence = 1;
  readonly #offlineHttpClient: HttpClient.HttpClient | undefined;
  readonly #controlledRequestEffect: (() => Promise<void>) | undefined;
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
      /** Fixture-only source-free command/effect witness. */
      readonly jevRequestObserver?: (observation: JevRequestObservation) => void;
      readonly maximumOperationalNoticeKeys?: number;
      /** Fixture-only HTTP transport; never supplied by resident IPC. */
      readonly offlineHttpClient?: HttpClient.HttpClient;
      /** Fixture-only gate entered by the controlled DecisionModel call. */
      readonly controlledRequestEffect?: () => Promise<void>;
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
    this.#jevRequestObserver = options.jevRequestObserver;
    this.#offlineHttpClient = options.offlineHttpClient;
    this.#controlledRequestEffect = options.controlledRequestEffect;
    this.#beforeResponseHandoff = options.beforeResponseHandoff;
    this.#reuse = new EvaluationReuse({
      ledger: this.#ledger,
      logicalBytes,
    });
    this.#dispatcher = new DispatchQueue(
      this.#ledger,
      (job) => ({ operation: job.kind === "ingress" ? job.canonicalObservationId : job.canonicalOperationId,
        round: job.canonicalRound }),
      async (entry) => this.#run(entry.value, entry.sequence),
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
      for (const unit of this.#ticketUnits) {
        if (unit.ticketId === command.id) this.#ticketUnits.delete(unit);
      }
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

  #pruneCollectionTokenIds(): void {
    const live = this.#composedDelivery.liveCollectionTokenKeys();
    for (const advice of this.#advice) if (advice.delivery !== undefined) live.add(advice.delivery.token);
    for (const notice of this.#noticeCooldowns.values()) {
      if (notice.pending?.delivery !== undefined) live.add(notice.pending.delivery.token);
    }
    this.#ledger.pruneCollectionTokenIds(live);
  }

  admit(observation: DirectObservation, dispatch: ResidentDispatchContext, ticketed = false, composed = false, requirePermit = false): ResidentResponse {
    const now = this.#now();
    this.#expirePending(now);
    // Reclaim cooldown state whose active guarantee and pending notice have
    // both ended before it can cause an otherwise-valid admission to fail.
    this.#pruneNoticeCooldowns(now);
    if (this.#lifecycle !== "active") return ticketed ? { requestRoute: "ticketed", status: "rejected-capacity" } : { status: "rejected-capacity" };
    const group = adviceePartition(observation.root, observation.advicee);
    const generation = composed ? this.#composedDelivery.admitEdit(group,
      observation.advicee.toolUseId, monotonicNow(), requirePermit) : undefined;
    if (composed && generation === undefined) {
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee,
        lifetime: this.lifetime, stage: "incomplete" });
      return ticketed ? { requestRoute: "ticketed", status: "rejected-stale" } : { status: "rejected-stale" };
    }
    let round = composed ? this.#rounds.get(group) : undefined;
    if (generation !== undefined && round?.generation !== generation) {
      const canonicalRound = this.#ledger.roundId(group);
      round = { group, generation, canonicalRound, controller: new AbortController(),
        work: { id: randomUUID(), controller: new AbortController() },
        policyWork: new BendWorkTracker(this.#ledger, group, canonicalRound), discarded: { queued: 0, running: 0 } };
      this.#rounds.set(group, round);
    }
    const partition = group;
    const canonicalRound = round?.canonicalRound ?? this.#ledger.roundId(partition);
    if (round !== undefined) this.#roundActivity.set(group, { root: observation.root, advicee: observation.advicee, activityPath: dispatch.activityPath });
    const reservation = this.#reserve(partition, logicalBytes({ observation, dispatch }) + RESERVATION_OVERHEAD_BYTES, "observationDispatch");
    if (reservation === undefined) {
      this.#rejectedCapacity += 1;
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
      return ticketed ? { requestRoute: "ticketed", status: "rejected-capacity" } : { status: "rejected-capacity" };
    }
    let canonicalObservationId: number;
    try {
      canonicalObservationId = this.#ledger.admitObservation(partition, canonicalRound);
    } catch {
      this.#ledger.release(reservation);
      return ticketed ? { requestRoute: "ticketed", status: "rejected-capacity" } : { status: "rejected-capacity" };
    }
    const ticket: TicketRecord | undefined = ticketed ? {
      ticket: { nonce: randomUUID(), lifetime: this.lifetime },
      generation: this.#nextAdmissionGeneration++, partition,
      editAuthority: editAuthority(observation.root, observation.advicee),
      root: observation.root, userConfigPath: dispatch.userConfigPath,
      claudeFeedbackMode: this.#currentClaudeFeedbackMode(observation.root, dispatch.userConfigPath),
      credentialGeneration: dispatch.credential?.generation ?? null,
      credentialStatePath: dispatch.credential?.statePath ?? null,
      credentialRequired: dispatch.controlled === null || dispatch.controlled.requireCredential === true,
      credentialEnvironmentOnly: dispatch.credential?.environmentOnly ?? false,
      expiresAt: now + TICKET_RETENTION_MS,
    } : undefined;
    if (ticket !== undefined && this.#ledger.transition({ kind: "ticketOpen",
      id: ticket.generation }).commands[0]?.kind !== "ticketOpened") {
      throw new Error("canonical ticket open refused");
    }
    const job = {
      kind: "ingress" as const,
      canonicalRound,
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
      this.#ledger.observation(partition, canonicalObservationId, "interruptObservation", canonicalRound);
      this.#ledger.release(reservation);
      this.#rejectedCapacity += 1;
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: this.lifetime, stage: "unavailable" });
      return ticketed ? { requestRoute: "ticketed", status: "rejected-capacity" } : { status: "rejected-capacity" };
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
    return ticket === undefined ? { status: "accepted" } : { requestRoute: "ticketed", status: "accepted", ticket: ticket.ticket };
  }

  #collectionElapsed(now: number, started: number, limit: number): number {
    const elapsed = Math.min(limit, Math.max(0, now - started));
    return Number.isNaN(elapsed) ? 0 : Math.floor(elapsed);
  }

  #recordFindingCount(partition: string, operation: number, count: number, round: number): void {
    if (count < 1) return;
    const result = this.#ledger.transition({ kind: "findingCountUpdated",
      partition: this.#ledger.partitionId(partition), lifetime: 1,
      round, operation, count });
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

  #collectionOrder(left: Pick<Advice, "sequence">,
    right: Pick<Advice, "sequence">): number {
    const result = this.#ledger.transition({ kind: "collectionOrderCheck",
      leftSequence: left.sequence, rightSequence: right.sequence });
    if (result.rejection !== undefined) throw new Error("canonical collection order refused");
    switch (result.commands[0]?.kind) {
      case "collectionBefore": return -1;
      case "collectionEqual": return 0;
      case "collectionAfter": return 1;
      default: throw new Error("invalid canonical collection order");
    }
  }

  #collectionReady(advice: Advice): boolean {
    const joinedPending = [...this.#joinedReviews.values()].some((reviews) =>
      reviews.some((review) => review.admission === advice.admissionId));
    const result = this.#ledger.transition({ kind: "collectionReady",
      advice: advice.canonicalOperationId, partition: this.#ledger.partitionId(advice.partition),
      lifetime: this.#ledger.canonicalLifetime, round: advice.canonicalRound,
      observation: advice.admissionId, joinedPending });
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
  ): Promise<Exclude<ResidentResponse, { readonly requestRoute: "ticketed" }>>;
  collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    ticket: undefined,
    composed: true,
  ): Promise<Exclude<ResidentResponse, { readonly requestRoute: "ticketed" }>>;
  collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    ticket: TicketRecord,
    composed?: boolean,
  ): Promise<ResidentResponse>;
  async collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode = "ordinary",
    ticket?: TicketRecord,
    composed = false,
  ): Promise<ResidentResponse> {
    const partition = adviceePartition(root, advicee);
    const claudeSurface: ComposedClaudeSurface | undefined = composed && ticket === undefined &&
      advicee.host === "claude-code" ? mode === "turn-end" ? "stop" : "background" : undefined;
    const now = this.#now();
    if (composed && mode !== "turn-end" && this.#composedDelivery.isDeciding(partition)) return { status: "empty" };
    const stopCollector = composed && mode === "turn-end" && this.#composedDelivery.isDeciding(partition);
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    const credentialGeneration = dispatch.credential?.generation ?? null;
    for (const item of [...this.#advice]) {
      const sameScope = composed ? adviceePartition(item.observation.root, item.observation.advicee) === partition
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
    // Stop can reoffer only an uncertain background write after its writer has
    // terminated; a submitted write counts as delivery.
    for (const item of this.#advice) {
      const delivery = item.delivery;
      const sameGroup = adviceePartition(item.observation.root, item.observation.advicee) === partition;
      if (delivery !== undefined) this.#checkAdviceLease(item, now, stopCollector, sameGroup);
    }
    const available = this.#advice.filter((item) => {
      const samePartition = composed
        ? adviceePartition(item.observation.root, item.observation.advicee) === partition
        : item.partition === partition;
      const unleased = item.delivery === undefined;
      const hasUnsuppressed = samePartition && unleased && item.findings.some((finding) =>
        !this.#composedDelivery.suppresses(item.id,
          adviceePartition(item.observation.root, item.observation.advicee), finding,
          stopCollector ? "stop" : undefined));
      const ticketOwns = ticket === undefined || ticket.partition === item.partition;
      const result = this.#ledger.transition({ kind: "collectionCandidateCheck",
        samePartition, unleased, hasUnsuppressed, ticketOwns });
      if (result.rejection !== undefined) throw new Error("canonical advice candidate refused");
      if (result.commands[0]?.kind !== "collectionCandidate" && result.commands[0]?.kind !== "collectionSkip") {
        throw new Error("invalid canonical advice candidate");
      }
      return result.commands[0]?.kind === "collectionCandidate";
    });
    for (const item of available) {
      if (this.#collectionReady(item)) item.collectionEligible = true;
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
        ? () => this.#recordOperationalFailure(advice.observation, "output-limit")
        : undefined;
      return ticket === undefined
        ? claudeSurface === undefined
          ? selectFittingFindings(retained, candidates, facts, onLimited, this.#collectionFindingOffer)
          : selectFittingComposedClaudeFindings(retained, candidates, claudeSurface,
              facts, onLimited, this.#collectionFindingOffer)
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
      const route = this.#candidateRoute({ kind: "validationRouteCheck",
        ownerCurrent: retained === advice && retained.delivery?.token === token,
        status: validity.status });
      if (route === "ignoreCandidate") continue;
      if (route === "releaseCandidate") {
        this.#releaseAdviceLease(advice);
        continue;
      }
      if (route === "retireCandidate") {
        this.#removeAdvice(advice.id, token);
        continue;
      }
      if (route !== "continueCandidate" || validity.status !== "current") {
        this.#releaseAdviceLease(advice);
        continue;
      }
      const workAccepted = advice.round === undefined || advice.workUnitId === undefined ||
        advice.round.policyWork.reviseFinding(advice.workUnitId,
          validity.findings.length, logicalBytes(validity.findings));
      const workRoute = this.#candidateRoute({ kind: "postValidationCheck",
        workAccepted, expired: false, hasFitting: true });
      if (workRoute !== "retainCandidate") {
        if (workRoute === "retireCandidate") this.#removeAdvice(advice.id, token);
        else this.#releaseAdviceLease(advice);
        continue;
      }
      advice.evaluations = validity.evaluations;
      advice.findings = validity.findings;
      if (advice.round !== undefined) this.#recordFindingCount(advice.partition,
        advice.canonicalOperationId, validity.findings.length, advice.canonicalRound);
      const handoffNow = this.#now();
      const expiryRoute = this.#candidateRoute({ kind: "postValidationCheck",
        workAccepted: true, expired: this.#adviceExpired(advice, handoffNow), hasFitting: true });
      if (expiryRoute !== "retainCandidate") {
        if (expiryRoute === "retireCandidate") this.#removeAdvice(advice.id, token);
        else this.#releaseAdviceLease(advice);
        continue;
      }
      const fitting = fittingFindings(selectedFindings, advice.findings.filter((finding) =>
        !this.#composedDelivery.suppresses(advice.id,
          adviceePartition(advice.observation.root, advice.observation.advicee), finding, stopCollector ? "stop" : undefined)), advice, true);
      const fittingRoute = this.#candidateRoute({ kind: "postValidationCheck",
        workAccepted: true, expired: false, hasFitting: fitting.length > 0 });
      if (fittingRoute !== "retainCandidate") {
        if (fittingRoute === "retireCandidate") this.#removeAdvice(advice.id, token);
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
        const route = this.#candidateRoute({ kind: "validationRouteCheck",
          ownerCurrent: retained === advice && retained.delivery?.token === token,
          status: validity.status });
        if (route === "ignoreCandidate") continue;
        if (route === "releaseCandidate") {
          this.#releaseAdviceLease(advice);
          continue;
        }
        if (route === "retireCandidate") {
          this.#removeAdvice(advice.id, token);
          continue;
        }
        if (route !== "continueCandidate" || validity.status !== "current") {
          this.#releaseAdviceLease(advice);
          continue;
        }
        const workAccepted = advice.round === undefined || advice.workUnitId === undefined ||
          advice.round.policyWork.reviseFinding(advice.workUnitId,
            validity.findings.length, logicalBytes(validity.findings));
        const workRoute = this.#candidateRoute({ kind: "postValidationCheck",
          workAccepted, expired: false, hasFitting: true });
        if (workRoute !== "retainCandidate") {
          if (workRoute === "retireCandidate") this.#removeAdvice(advice.id, token);
          else this.#releaseAdviceLease(advice);
          continue;
        }
        advice.evaluations = validity.evaluations;
        advice.findings = validity.findings;
        if (advice.round !== undefined) this.#recordFindingCount(advice.partition,
          advice.canonicalOperationId, validity.findings.length, advice.canonicalRound);
        const handoffNow = this.#now();
        const expiryRoute = this.#candidateRoute({ kind: "postValidationCheck",
          workAccepted: true, expired: this.#adviceExpired(advice, handoffNow), hasFitting: true });
        if (expiryRoute !== "retainCandidate") {
          if (expiryRoute === "retireCandidate") this.#removeAdvice(advice.id, token);
          else this.#releaseAdviceLease(advice);
          continue;
        }
        const fitting = fittingFindings(finalFindings, advice.findings.filter((finding) =>
          !this.#composedDelivery.suppresses(advice.id,
            adviceePartition(advice.observation.root, advice.observation.advicee), finding, stopCollector ? "stop" : undefined)), advice, true);
        const fittingRoute = this.#candidateRoute({ kind: "postValidationCheck",
          workAccepted: true, expired: false, hasFitting: fitting.length > 0 });
        if (fittingRoute !== "retainCandidate") {
          if (fittingRoute === "retireCandidate") this.#removeAdvice(advice.id, token);
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
          const route = this.#candidateRoute({ kind: "finalCandidateCheck", ownerCurrent,
            credentialGeneration: credentialGenerationValid, credentialAuthorized,
            expired: ownerCurrent && credentialGenerationValid && credentialAuthorized &&
              this.#adviceExpired(advice, handoffNow),
            workCurrent: ownerCurrent && credentialGenerationValid && credentialAuthorized &&
              this.#isCurrentWork(advice.revision, advice.prepared),
            hasFindings: delivery !== undefined && delivery.findings.length > 0 });
          if (route === "ignoreCandidate") continue;
          if (route === "retireCandidate") {
            this.#removeAdvice(advice.id, token);
            continue;
          }
          if (route === "releaseCandidate") {
            this.#releaseAdviceLease(advice);
            continue;
          }
          if (route !== "retainCandidate" || delivery === undefined) continue;
          delivery.leaseUntil = handoffNow + DELIVERY_LEASE_MS;
          handoff.push(advice);
        }
        const offers = handoff.flatMap((advice) => (advice.delivery?.findings ?? []).map((finding) => ({
          advice,
          finding,
          facts: this.#findingSelectionFacts(advice, partition, credentialGeneration, handoffNow, composed),
        })));
        const accepted = new Set(selectFittingCurrentFindingIndices(offers,
          ticket === undefined ? claudeSurface === undefined ? "codex" :
            claudeSurface === "stop" ? "claude-stop" : "claude-background" : ticket.claudeFeedbackMode,
          (index) => this.#recordOperationalFailure(offers[index]!.advice.observation,
            "output-limit", handoffNow),
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
    // Operational failures stay in resident diagnostics; agent output carries
    // only actionable findings.
    if (handoffFindings.length === 0) return { status: "empty" };
    return ticket === undefined
      ? { status: "advice", token, findingCount: handoffFindings.length,
          output: combinedReviewOutput(handoffFindings, []) }
      : { requestRoute: "ticketed", status: "advice", token, findingCount: handoffFindings.length,
          output: combinedClaudeOutput(handoffFindings, [], ticket.claudeFeedbackMode) };
  }

  #candidateRoute(event: Extract<CanonicalEvent, { readonly kind:
    "validationRouteCheck" | "postValidationCheck" | "finalCandidateCheck" }>):
    "ignoreCandidate" | "releaseCandidate" | "retireCandidate" | "continueCandidate" | "retainCandidate" {
    const result = this.#ledger.transition(event);
    const kind = result.commands[0]?.kind;
    if (result.rejection !== undefined || result.commands.length !== 1 ||
        (kind !== "ignoreCandidate" && kind !== "releaseCandidate" && kind !== "retireCandidate" &&
          kind !== "continueCandidate" && kind !== "retainCandidate")) {
      throw new Error("invalid canonical candidate route");
    }
    return kind;
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
        for (const unit of this.#ticketUnits) {
          if (ticketUnitStage(unit).stage === "finding" && unit.current.adviceId === item.id) {
            ticketUnitTransition(unit, "markDelivered");
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
          adviceePartition(item.observation.root, item.observation.advicee), surface, token),
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
      const group = adviceePartition(advice[0]!.observation.root, advice[0]!.observation.advicee);
      if (!this.#composedDelivery.authorizeFinishOutput(group, token)) return { status: "empty" };
    }
    for (const item of advice) {
      if (finishPermit) continue;
      if (!this.#composedDelivery.beginSubmission(
        item.id, adviceePartition(item.observation.root, item.observation.advicee),
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
    const partition = adviceePartition(root, advicee);
    const dispatcherWork = composed ? 0 : (() => {
      const jobs = this.#dispatcher.snapshotWhere(({ key }) => key === partition);
      return jobs.queued + jobs.running;
    })();
    const work = composed ? this.#rounds.get(partition)?.policyWork.unfinished() ?? 0 : dispatcherWork;
    return Number(composed && this.#composedDelivery.hasPendingEdits(partition)) +
      work +
      this.#advice.filter((item) =>
        (composed ? adviceePartition(item.observation.root, item.observation.advicee) === partition
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
      readonly sequence: number;
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
      sequence: advice.sequence,
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
      return true;
    }
    return false;
  }

  #noticeKey(partition: string, kind: OperationalNoticeKind): string {
    return canonicalValue({ partition, kind });
  }

  #releaseNoticeCooldown(key: string): void {
    const cooldown = this.#noticeCooldowns.get(key);
    if (cooldown === undefined) return;
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
      } else if (action.kind === "noticeMergePending") {
        retained.pending!.value = { kind, suppressedCount: action.count };
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
    const group = adviceePartition(observation.root, observation.advicee);
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
      for (const unit of this.#ticketUnits) {
        const revision = unit.current.revision;
        if (revision !== undefined && superseded(revision)) unitUnavailable(unit, "stale");
      }
      for (const [key, joined] of this.#joinedReviews) {
        const current = joined.filter((review) => {
          if (review.revision === undefined || !superseded(review.revision)) return true;
          if (review.ticketUnit !== undefined) unitUnavailable(review.ticketUnit, "stale");
          recordActivity({ statePath: review.activityPath, root: review.observation.root,
            advicee: review.observation.advicee, lifetime: this.lifetime,
            stage: "unavailable", unitIdentity: review.evaluationKey });
          return false;
        });
        if (current.length > 0) this.#joinedReviews.set(key, current);
        else this.#joinedReviews.delete(key);
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
      for (const unit of this.#ticketUnits) {
        const stage = ticketUnitStage(unit);
        if (stage.stage === "finding" && unit.current.adviceId === id && !stage.delivered) {
          unitUnavailable(unit, this.#adviceExpired(removed, this.#now()) ? "expired" : "stale");
        }
      }
      removed.retired = true;
      if (!removed.revalidationActive) this.#releaseUnit(removed);
      if (!this.#rounds.has(removed.partition) &&
        !this.#advice.some((item) => item.partition === removed.partition)) {
        this.#bendPartitions.delete(removed.partition);
      }
    }
    return removed !== undefined;
  }

  #expirePending(now: number): void {
    this.#composedDelivery.expire(now);
    for (const advice of [...this.#advice]) {
      if (this.#adviceExpired(advice, now)) this.#removeAdvice(advice.id);
    }
  }

  sweepQuietRounds(now = this.#now()): number {
    if (this.#lifecycle !== "active") return 0;
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    let closedCount = 0;
    for (const [group, round] of [...this.#rounds]) {
      const work = this.#dispatcher.snapshotWhere(({ value }) => value.round === round && !value.completed);
      const counts = this.#composedDelivery.closureCounts(group);
      const closed = this.#composedDelivery.tickQuietRound(group, now, {
        nativeWorkIdle: work.queued === 0 && work.running === 0,
        adviceEmpty: !this.#advice.some((advice) => advice.round === round) &&
          ![...this.#noticeCooldowns.values()].some((notice) => notice.partition === group),
      });
      if (closed !== undefined) {
        this.#closeRound(group, closed, "quiescent", counts);
        closedCount += 1;
      }
    }
    return closedCount;
  }

  #roundActive(round: RoundWork | undefined): boolean {
    return round === undefined || (!round.controller.signal.aborted &&
      this.#composedDelivery.isActive(round.group, round.generation));
  }

  #allowFinish(group: string, token: string, reason: RoundCloseReason): void {
    const counts = this.#composedDelivery.closureCounts(group);
    const closed = this.#composedDelivery.finishStop(group, token, true,
      this.#now());
    if (closed !== undefined) this.#closeRound(group, closed, reason, counts);
  }

  #jobActive(job: Job): boolean {
    return this.#lifecycle === "active" && !this.#lifetimeController.signal.aborted &&
      !job.work?.controller.signal.aborted && this.#roundActive(job.round);
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
      this.#ledger.observation(job.partition, job.canonicalObservationId, "interruptObservation", job.canonicalRound);
    }
    if (job.kind === "unit") {
      if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "lost");
      this.#settleJoined(job.evaluationKey, "unavailable", "lost");
      this.#releaseReuseClaim(job.evaluationKey);
      // An issued Jev permit remains reserved until its native Effect settles.
      if (job.requestId === undefined) this.#releaseUnit(job);
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
      roundIdentity: `${group}:${round?.canonicalRound ?? generation}`, reason, reservedContinuations,
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
      if (notice.partition === round.group) this.#releaseNoticeCooldown(key);
    }
    this.#reuse.discardPartition(round.group);
    this.#bendPartitions.delete(round.group);
    for (const [key, ticket] of this.#tickets) if (ticket.partition === round.group) {
      this.#tickets.delete(key);
      this.#ledger.transition({ kind: "ticketForget", id: ticket.generation });
      for (const unit of this.#ticketUnits) {
        if (unit.ticketId === ticket.generation) this.#ticketUnits.delete(unit);
      }
    }
    this.#ledger.retireRound(round.group, round.canonicalRound);
  }

  async #run(job: Job, sequence: number): Promise<void> {
    if (job.kind === "ingress") return this.#prepare(job, sequence);
    return this.#evaluateUnit(job, sequence);
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

  #observeJevRequest(observation: JevRequestObservation): void {
    try { this.#jevRequestObserver?.(observation); } catch {
      // Fixture observation must not change request execution.
    }
  }

  async #prepare(job: IngressJob, sequence: number): Promise<void> {
    const expectedActivityUnits: Array<string> = [];
    const unassignedClaims = new Set<string>();
    try {
      if (job.round !== undefined && job.workObservationId !== undefined &&
          !job.round.policyWork.startSource(job.workObservationId)) {
        this.#ledger.release(job.reservation);
        return;
      }
      if (!this.#ledger.observation(job.partition, job.canonicalObservationId, "startObservation", job.canonicalRound)) {
        this.#ledger.release(job.reservation);
        return;
      }
      await this.#awaitBackendGate();
      if (this.#lifecycle !== "active") {
        this.#ledger.release(job.reservation);
        return;
      }
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
        { signal: job.work?.controller.signal ?? this.#lifetimeController.signal });
      this.#ledger.release(job.reservation);
      if (settings === undefined || this.#lifecycle !== "active" || !this.#jobActive(job)) {
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
          job.partition, job.canonicalObservationId, captureWorkspaceBytes(candidate.path), job.canonicalRound);
        if (preparation === undefined) {
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
        { signal: job.work?.controller.signal ?? this.#lifetimeController.signal });
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
          const generationPartition = `${job.partition}\0work:${job.work?.id ?? "standalone"}\0credential-generation:${job.dispatch.credential?.generation ?? "controlled"}`;
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
        if (!this.#jobActive(job)) { this.#ledger.release(workspace); return; }
        const ticketUnitsByPlan = new Map<(typeof planned)[number], TicketUnit>();
        const retained = planned.filter((item) =>
          item.kind === "owner" || (item.kind === "cached" && item.cached.evaluation.findings.length > 0));
        const reservations = this.#ledger.completePreparation(
          job.partition, preparation.operation, workspace,
          retained.map((item) =>
            residentUnitReservationBytes(pathObservation, job.dispatch, item.outcome.prepared)),
          job.canonicalRound,
        );
        this.#peakLedgerBytes = Math.max(this.#peakLedgerBytes, this.#ledger.snapshot().bytes);
        // Workspace has been released and all accepted unit reservations are
        // fixed, so best-effort notice retention cannot displace fresh work.
        if (rejectedDeliverable) {
          this.#recordOperationalFailure(job.observation, "capacity");
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
          if (ticketUnit !== undefined) {
            this.#ticketUnits.add(ticketUnit);
            ticketUnitsByPlan.set(item, ticketUnit);
          }
          if (item.kind === "cached" && item.cached.evaluation.findings.length === 0) {
            const revision = this.#registerCurrentWork(job.partition, item.outcome.prepared);
            if (ticketUnit !== undefined) unitClear(ticketUnit, revision);
            this.#releaseCurrentWork(revision);
            expectedActivityUnits.push(item.evaluationKey);
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "clear", unitIdentity: item.evaluationKey });
          } else if (item.kind === "joined") {
            const existing = this.#advice.find((advice) => advice.evaluationKey === item.evaluationKey);
            if (existing !== undefined) {
              if (ticketUnit !== undefined) unitFinding(ticketUnit, existing.revision, existing.id);
              recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
                advicee: job.observation.advicee, lifetime: this.lifetime, stage: "findings",
                findings: existing.findings.length, unitIdentity: item.evaluationKey });
            } else {
              const pending = this.#reuse.pending(item.evaluationKey);
              if (pending === undefined && item.join !== "claimed") {
                if (ticketUnit !== undefined) unitUnavailable(ticketUnit, "lost");
                recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
                  advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable",
                  unitIdentity: item.evaluationKey });
              } else {
                const joined: JoinedReview = { admission: job.canonicalObservationId,
                  evaluationKey: item.evaluationKey, observation: pathObservation,
                  activityPath: job.dispatch.activityPath,
                  ...(ticketUnit === undefined ? {} : { ticketUnit }),
                  ...(pending === undefined ? {} : { revision: pending.revision }) };
                if (ticketUnit !== undefined && pending !== undefined) unitRevision(ticketUnit, pending.revision);
                const reviews = this.#joinedReviews.get(item.evaluationKey) ?? [];
                reviews.push(joined);
                this.#joinedReviews.set(item.evaluationKey, reviews);
                expectedActivityUnits.push(item.evaluationKey);
              }
            }
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
          const ticketUnit = ticketUnitsByPlan.get(item);
          const admitted = reservations[index];
          if (admitted === undefined) {
            if (ticketUnit !== undefined) unitUnavailable(ticketUnit, "capacity");
            if (item.kind === "owner") this.#releaseReuseClaim(item.evaluationKey, "capacity");
            this.#rejectedCapacity += 1;
            this.#recordOperationalFailure(job.observation, "capacity");
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
            canonicalRound: job.canonicalRound,
            ...(job.round === undefined ? {} : { round: job.round, work: job.work }),
            ...(workUnitId === undefined ? {} : { workUnitId }),
            admissionId: job.canonicalObservationId,
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
            if (!this.#ledger.startReview(job.partition, admitted.operation, job.canonicalRound) ||
                !this.#ledger.completeReview(job.partition, admitted.operation, reservation, "finding", job.canonicalRound)) {
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
              }, sequence);
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
            this.#recordOperationalFailure(job.observation, "capacity");
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
      if (!this.#ledger.observation(job.partition, job.canonicalObservationId, "completeObservation", job.canonicalRound)) {
        throw new Error("canonical observation completion refused");
      }
      job.completed = true;
      await this.#afterPrepare?.();
      return;
    } catch {
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error("resident preparation unavailable");
      this.#ledger.release(job.reservation);
      if (this.#lifecycle === "active") recordActivity({ statePath: job.dispatch.activityPath,
        root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime,
        stage: "unavailable" });
    } finally {
      for (const key of unassignedClaims) this.#releaseReuseClaim(key);
      if (!job.completed) this.#ledger.observation(job.partition, job.canonicalObservationId, "interruptObservation", job.canonicalRound);
    }
  }

  async #evaluateUnit(job: UnitJob, sequence: number): Promise<void> {
    let issuedRequest: number | undefined;
    let requestStarted = false;
    let requestSettled = false;
    let interruptionReported = false;
    let readyReported = false;
    let requestIdentity: Pick<JevRequestObservation, "partition" | "canonicalPartition" |
      "lifetime" | "canonicalLifetime" | "round" | "hapslandRound" | "operation"> | undefined;
    const observeRequest = (stage: JevRequestObservation["stage"], request?: number,
      outcome?: JevRequestObservation["outcome"]) => {
      if (requestIdentity === undefined) throw new Error("Jev request observation lacks canonical identity");
      this.#observeJevRequest({ ...requestIdentity, stage,
        ...(request === undefined ? {} : { request }),
        ...(outcome === undefined ? {} : { outcome }) });
    };
    const signal = job.work?.controller.signal ?? this.#lifetimeController.signal;
    const requestReady = (facts: { readonly rootValid: boolean; readonly configurationValid: boolean;
      readonly credentialReady: boolean; readonly selected: boolean; readonly currentWork: boolean;
      readonly physicalAvailable: boolean }) => {
      readyReported = true;
      const decision = this.#ledger.readyJevRequest(job.partition,
        job.canonicalOperationId, job.reservation, facts, job.canonicalRound);
      if (decision.status !== "stale") requestIdentity = {
        partition: job.partition,
        canonicalPartition: this.#ledger.partitionId(job.partition),
        lifetime: this.#ledger.residentLifetime,
        canonicalLifetime: this.#ledger.canonicalLifetime,
        round: decision.round,
        hapslandRound: job.round?.generation ?? null,
        operation: job.canonicalOperationId,
      };
      if (decision.status === "issued") {
        issuedRequest = decision.request;
        job.requestId = decision.request;
        observeRequest("issued", decision.request);
        signal?.addEventListener("abort", reportInterruption, { once: true });
      } else if (decision.status === "unavailable") {
        observeRequest("unavailable");
      }
      return decision;
    };
    const denyReady = (reason?: "credential") => {
      const decision = requestReady({ rootValid: false, configurationValid: false,
        credentialReady: false, selected: false, currentWork: false,
        physicalAvailable: false });
      if (decision.status === "issued") throw new Error("canonical Jev request authorized unverified facts");
      return { status: "notAuthorized" as const, reason };
    };
    const reportInterruption = (): void => {
      if (issuedRequest === undefined || !requestStarted || interruptionReported) return;
      interruptionReported = this.#ledger.interruptJevRequest(job.partition,
        job.canonicalOperationId, issuedRequest);
      if (interruptionReported) observeRequest("interrupted", issuedRequest);
    };
    try {
      if (job.round !== undefined && job.workUnitId !== undefined &&
          !job.round.policyWork.startUnit(job.workUnitId)) {
        this.#releaseReuseClaim(job.evaluationKey);
        this.#releaseUnit(job);
        return;
      }
      if (!this.#ledger.startReview(job.partition, job.canonicalOperationId, job.canonicalRound)) {
        this.#releaseReuseClaim(job.evaluationKey);
        this.#releaseUnit(job);
        return;
      }
      await this.#awaitBackendGate();
      if (!this.#jobActive(job) || !this.#isCurrentWork(job.revision, job.prepared)) {
        denyReady();
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
      const controlledRequestEffect = this.#controlledRequestEffect;
      const ledger = this.#ledger;
      const isCurrentWork = () => this.#isCurrentWork(job.revision, job.prepared);
      const isJobActive = () => this.#jobActive(job);
      const observeDispatchAuthority = (details: DispatchAuthorityObservationDetails): void =>
        this.#observeDispatchAuthority(job, details);
      const result = await Effect.runPromise(Effect.gen(function* () {
        const settings = yield* loadReviewSettings(
          job.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        if (job.dispatch.controlled !== null && controlled === undefined) return denyReady();
        const credentialRequired = controlled === undefined || controlled.requireCredential === true;
        if (credentialRequired && job.dispatch.credential?.name !== settings.credentialEnvVar) return denyReady("credential");
        const dispatchCredential = job.dispatch.credential;
        if (credentialRequired && dispatchCredential === null) return denyReady("credential");
        if (!(yield* verifyObservationRoot(job.observation))) return denyReady();
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
          return denyReady("credential");
        }
        if (credential?.status === "present") {
          const current = readCredentialState(dispatchCredential?.statePath);
          if (current.generation !== credential.generation ||
              (credential.source === "saved" && current.savedUseSuspended)) return denyReady("credential");
        }
        if (afterCredentialBeforeDispatch !== undefined) {
          yield* Effect.promise(afterCredentialBeforeDispatch);
        }
        if (credential?.status === "present") {
          const current = readCredentialState(dispatchCredential?.statePath);
          if (current.generation !== credential.generation ||
              (credential.source === "saved" && current.savedUseSuspended)) return denyReady("credential");
        }
        // Prepared source can outlive its admission policy. Read authority again
        // after credential waits, then apply the current file policy before the
        // provider receives the prepared unit.
        const dispatchConfiguration = yield* loadConfiguration(
          job.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        if (credentialRequired && dispatchCredential?.name !== dispatchConfiguration.policy.credentialEnvVar.value) return denyReady("credential");
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
          return denyReady();
        }
        const selected = selectedByDirectFilePolicy(
          job.prepared.input.path,
          resolvedDirectFilePolicy(dispatchConfiguration.policy),
        );
        const admission = admitReview({ rootValid: dispatchRootVerified,
          configurationValid: true, credentialReady: !credentialRequired || credential?.status === "present",
          selected });
        const unitCurrent = admission === "admitReview" && (yield* preparedUnitStillCurrent(
          job.observation,
          job.prepared,
          {
            controlledWriter: true,
            advicee: job.observation.advicee,
            settings: { ...settings, configuration: dispatchConfiguration },
            policy: resolvedDirectFilePolicy(dispatchConfiguration.policy),
          },
        ));
        observeDispatchAuthority({
          decision: admission === "admitReview" && unitCurrent ? "allow" : "deny",
          reason: admission === "admitReview" && unitCurrent ? "selected-by-file-policy" :
            admission === "admitReview" ? "stale-complete-unit" : "excluded-by-file-policy",
          policyDigest: dispatchConfiguration.policy.digest,
          selected,
          admission,
          physicalRootVerified: true,
          credentialStatus: credential?.status ?? "not-required",
          credentialGeneration: credential?.generation ?? null,
        });
        const ready = requestReady({
            rootValid: dispatchRootVerified, configurationValid: true,
            credentialReady: !credentialRequired || credential?.status === "present",
            selected: selected && unitCurrent, currentWork: isCurrentWork(),
            physicalAvailable: isJobActive(),
          });
        if (ready.status !== "issued") return { status: "notAuthorized" as const, reason: undefined };
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
          : controlledDecisionModelLayer({ ...controlled,
              ...(controlledRequestEffect === undefined ? {} : {
                onRequest: Effect.promise(controlledRequestEffect),
              }),
            });
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
        const beforeDispatch = credentialAuthority.pipe(
          Effect.andThen(budgetAuthority),
          Effect.andThen(Effect.sync(() => {
            if (!ledger.startJevRequest(job.partition,
              job.canonicalOperationId, ready.request)) {
              throw new Error("canonical Jev request start refused");
            }
            requestStarted = true;
            job.requestStarted = true;
            observeRequest("started", ready.request);
            if (signal?.aborted) reportInterruption();
          })),
        );
        const evaluation = evaluatePrepared(job.prepared, beforeDispatch).pipe(
          Effect.provide(decisionModel),
        );
        return yield* (credentialProvider === undefined
          ? evaluation
          : evaluation.pipe(Effect.provide(credentialProvider)));
      }),
        { signal: job.work?.controller.signal ?? this.#lifetimeController.signal });
      if (result?.status === "notAuthorized") {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit,
          result.reason === "credential" ? "credential" : "lost");
        this.#settleJoined(job.evaluationKey, "unavailable",
          result.reason === "credential" ? "credential" : "lost");
        if (result.reason === "credential") this.#recordOperationalFailure(job.observation, "credential");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
          advicee: job.observation.advicee, lifetime: this.lifetime,
          stage: "unavailable", unitIdentity: job.evaluationKey });
        this.#releaseReuseClaim(job.evaluationKey);
        this.#releaseUnit(job);
        return;
      }
      if (!this.#jobActive(job) && issuedRequest === undefined) {
        this.#releaseReuseClaim(job.evaluationKey); this.#releaseUnit(job); return;
      }
      if (result?.status === "evaluated") {
        if (this.#jobActive(job) && this.#lifecycle === "active" &&
            job.round !== undefined && job.workUnitId !== undefined &&
            !job.round.policyWork.outcome(job.workUnitId, result.findings.length === 0
              ? { $: "Clear" }
              : { $: "Finding", count: result.findings.length, bytes: logicalBytes(result.findings) })) {
          throw new Error("Bend denied review outcome");
        }
        const currentWork = this.#lifecycle === "active" && this.#jobActive(job) &&
          this.#isCurrentWork(job.revision, job.prepared);
        if (issuedRequest === undefined || !requestStarted) {
          throw new Error("Jev result without a matching canonical request command and start");
        }
        const disposition = this.#ledger.settleJevRequest(job.partition, job.canonicalOperationId,
          issuedRequest, job.reservation,
          result.findings.length === 0 ? "clear" : "finding", currentWork);
        requestSettled = true;
        observeRequest("settled", issuedRequest,
          result.findings.length === 0 ? "clear" : "finding");
        if (disposition === "ignored" || disposition === "stale") {
          this.#releaseReuseClaim(job.evaluationKey);
          this.#releaseUnit(job);
          return;
        }
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
        await this.#retainAdvice(job, evaluation, sequence);
        await recordOutcome();
        return;
      }
      if (signal?.aborted) reportInterruption();
      const observed = issuedRequest === undefined ? undefined
        : signal?.aborted && requestStarted && interruptionReported ? "interrupted"
        : !requestStarted ? "neverSent"
        : result?.status === "timeout" ? "timeout" : "backendFailure";
      const failure = this.#ledger.reviewFailure(
        observed === "backendFailure" || observed === "timeout" ||
          (issuedRequest === undefined && (result?.status === "backend" || result?.status === "timeout")),
        false, observed === "neverSent" || observed === "interrupted" || result === undefined);
      if (issuedRequest === undefined) {
        if (!this.#ledger.completeReview(job.partition, job.canonicalOperationId,
          job.reservation, "unavailable", job.canonicalRound)) return;
      } else {
        this.#ledger.settleJevRequest(job.partition, job.canonicalOperationId,
          issuedRequest, job.reservation, observed ?? "neverSent", false);
        requestSettled = true;
        observeRequest("settled", issuedRequest, observed ?? "neverSent");
      }
      if (failure === "failureBackend") {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "backend");
        this.#settleJoined(job.evaluationKey, "unavailable", "backend");
        this.#recordOperationalFailure(job.observation, "backend");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (failure === "failureCredential") {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "credential");
        this.#settleJoined(job.evaluationKey, "unavailable", "credential");
        this.#recordOperationalFailure(job.observation, "credential");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (failure === "failureLost") {
        if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "lost");
        this.#settleJoined(job.evaluationKey, "unavailable", "lost");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (failure !== "failureNone") {
        throw new Error("Bend denied review failure disposition");
      }
    } catch {
      if (!readyReported && this.#ledger.canonicalProjection().work.some((entry) =>
        entry.operation === job.canonicalOperationId && entry.kind === "reviewing")) {
        denyReady();
      }
      if (issuedRequest !== undefined && !requestSettled) {
        if (signal?.aborted) reportInterruption();
        const observed = signal?.aborted && requestStarted && interruptionReported
          ? "interrupted" : requestStarted ? "backendFailure" : "neverSent";
        this.#ledger.settleJevRequest(job.partition, job.canonicalOperationId,
          issuedRequest, job.reservation, observed, false);
        requestSettled = true;
        observeRequest("settled", issuedRequest, observed);
      }
      if (job.ticketUnit !== undefined) unitUnavailable(job.ticketUnit, "backend");
      this.#settleJoined(job.evaluationKey, "unavailable", "backend");
      if (process.env.REVIEW_RESIDENT_DEBUG === "1") console.error("resident evaluation unavailable");
      if (this.#lifecycle === "active") recordActivity({ statePath: job.dispatch.activityPath,
        root: job.observation.root, advicee: job.observation.advicee, lifetime: this.lifetime,
        stage: "unavailable", unitIdentity: job.evaluationKey });
    } finally {
      signal?.removeEventListener("abort", reportInterruption);
    }
    this.#releaseReuseClaim(job.evaluationKey);
    this.#releaseUnit(job);
  }

  #attachClaimedJoined(key: string, revision: WorkRevision): void {
    for (const joined of this.#joinedReviews.get(key) ?? []) {
      if (joined.revision !== undefined) continue;
      joined.revision = revision;
      if (joined.ticketUnit !== undefined && ticketUnitStageOrUndefined(joined.ticketUnit)?.stage === "pending") {
        unitRevision(joined.ticketUnit, revision);
      }
    }
  }

  #releaseReuseClaim(key: string, reason: ResidentUnavailableReason = "lost"): void {
    this.#reuse.releaseClaim(key);
    const joined = this.#joinedReviews.get(key);
    if (joined === undefined) return;
    const attached: JoinedReview[] = [];
    for (const review of joined) {
      if (review.revision !== undefined) attached.push(review);
      else {
        if (review.ticketUnit !== undefined) unitUnavailable(review.ticketUnit, reason);
        recordActivity({ statePath: review.activityPath, root: review.observation.root,
          advicee: review.observation.advicee, lifetime: this.lifetime,
          stage: "unavailable", unitIdentity: review.evaluationKey });
      }
    }
    if (attached.length > 0) this.#joinedReviews.set(key, attached);
    else this.#joinedReviews.delete(key);
  }

  #settleJoined(key: string, state: "pending" | "clear" | "finding" | "unavailable", reason?: ResidentUnavailableReason,
    adviceId?: string): void {
    const joined = this.#joinedReviews.get(key);
    if (joined === undefined) return;
    this.#joinedReviews.delete(key);
    for (const review of joined) {
      const unit = review.ticketUnit;
      const revision = review.revision;
      let outcome: "clear" | "findings" | "unavailable" | undefined;
      if (unit !== undefined && ticketUnitStageOrUndefined(unit) !== undefined) {
        const stage = ticketUnitStage(unit);
        const disposition = this.#ledger.transition({ kind: "ticketJoinedCheck", state,
          staleUnavailable: stage.stage === "unavailable" && stage.reason === "stale",
          hasRevision: revision !== undefined, hasAdviceId: adviceId !== undefined }).commands[0]?.kind;
        switch (disposition) {
          case "ticketKeepJoined": break;
          case "ticketSetJoinedUnavailable": unitUnavailable(unit, reason ?? "lost"); outcome = "unavailable"; break;
          case "ticketSetJoinedLost": unitUnavailable(unit, "lost"); outcome = "unavailable"; break;
          case "ticketSetJoinedClear":
            if (revision === undefined) throw new Error("Bend joined clear lacks revision");
            unitClear(unit, revision);
            outcome = "clear";
            break;
          case "ticketSetJoinedFinding":
            if (revision === undefined || adviceId === undefined) throw new Error("Bend joined finding lacks identity");
            unitFinding(unit, revision, adviceId);
            outcome = "findings";
            break;
          default: throw new Error("Bend denied joined ticket disposition");
        }
      } else if (state === "clear" || state === "finding") {
        outcome = revision === undefined ? "unavailable" : state === "clear" ? "clear" : "findings";
      } else if (state === "unavailable") outcome = "unavailable";
      if (outcome !== undefined) recordActivity({ statePath: review.activityPath,
        root: review.observation.root, advicee: review.observation.advicee,
        lifetime: this.lifetime, stage: outcome,
        ...(outcome !== "findings" ? {} : {
          findings: this.#advice.find((item) => item.id === adviceId)?.findings.length ?? 0,
        }), unitIdentity: review.evaluationKey });
    }
  }

  #retainAdvice(
    job: UnitJob,
    evaluation: EvaluatedUnit,
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
      job.canonicalOperationId, evaluation.findings.length, job.canonicalRound);
    const advice: Advice = {
      id: randomUUID(),
      ...(job.round === undefined ? {} : { round: job.round }),
      ...(job.workUnitId === undefined ? {} : { workUnitId: job.workUnitId }),
      admissionId: job.admissionId,
      canonicalOperationId: job.canonicalOperationId,
      canonicalRound: job.canonicalRound,
      observation: job.observation,
      partition: job.partition,
      reservation: job.reservation,
      prepared: job.prepared,
      ...(job.sourceHash === undefined ? {} : { sourceHash: job.sourceHash }),
      revision: job.revision,
      evaluationKey: job.evaluationKey,
      evaluations: [evaluation],
      findings: evaluation.findings,
      sequence,
      credentialGeneration: job.dispatch.credential?.generation ?? null,
      credentialStatePath: job.dispatch.credential?.statePath ?? null,
      credentialRequired: job.dispatch.controlled === null || job.dispatch.controlled.requireCredential === true,
      credentialEnvironmentOnly: job.dispatch.credential?.environmentOnly ?? false,
      pendingAt: this.#now(),
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
      if (this.#lifetimeController.signal.aborted) return;
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
        { signal: advice.round?.controller.signal ?? this.#lifetimeController.signal });
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
      return request.requestRoute === "ticketed"
        ? request.operation === "collect" ? { requestRoute: "ticketed", status: "unavailable", reason: "lost" }
          : { requestRoute: "ticketed", status: "obsolete-lifetime" }
        : { status: "obsolete-lifetime" };
    }
    if (request.operation === "register-edit" || request.operation === "admit" ||
        request.operation === "begin-stop") this.sweepQuietRounds();
    if (("advicee" in request && request.advicee.host === "opencode") ||
        (request.operation === "admit" && request.observation.advicee.host === "opencode")) return { status: "unsupported" };
    if (request.operation === "prompt-marker") {
      const group = adviceePartition(request.root, request.advicee);
      return (request.onlyIfMissing === true
        ? this.#composedDelivery.ensureFromHostTurn(group, request.marker, this.#now())
        : this.#composedDelivery.advance(group, request.marker, this.#now(), request.promptDigest))
        ? { status: "advanced" } : { status: "rejected-capacity" };
    }
    if (request.operation === "begin-stop") {
      const group = adviceePartition(request.root, request.advicee);
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
      const group = adviceePartition(request.root, request.advicee);
      const counts = this.#composedDelivery.closureCounts(group);
      const closed = this.#composedDelivery.finishStop(group, request.token, request.close === true,
        this.#now());
      if (closed !== undefined) this.#closeRound(group, closed, request.reason ?? "no-advice", counts);
      return { status: "advanced" };
    }
    if (request.operation === "claim-background") {
      return this.#composedDelivery.claimBackground(
        adviceePartition(request.root, request.advicee), request.token, this.#now(),
      ) ? { status: "background-claimed" } : { status: "busy" };
    }
    if (request.operation === "release-background") {
      this.#composedDelivery.releaseBackground(
        adviceePartition(request.root, request.advicee), request.token,
      );
      return { status: "released" };
    }
    if (request.operation === "begin-submission") {
      return this.beginComposedSubmission(request.token, request.surface);
    }
    if (request.operation === "release") return this.releaseComposedSubmission(request.token);
    if (request.operation === "register-edit") {
      const group = adviceePartition(request.root, request.advicee);
      const capture = await Effect.runPromise(loadConfiguration(request.root,
        request.userConfigPath === undefined ? {} : { userConfigPath: request.userConfigPath }))
        .catch(() => undefined);
      if (capture === undefined) return { status: "rejected-stale", reason: "InvalidConfiguration" };
      const decision = this.#composedDelivery.registerEditDecision(group, request.advicee.toolUseId,
        request.startedAt, monotonicNow(), effectiveEditPermitLimits(capture.policy),
        effectiveVirtualRoundQuietMs(capture.policy));
      if (!decision.accepted) return { status: "rejected-stale", reason: decision.reason };
      return { status: "advanced" };
    }
    if (request.operation === "admit") {
      if (request.composed !== true) return { status: "unsupported" };
      return this.admit(request.observation, request.dispatch, request.requestRoute === "ticketed", true, true);
    }
    if (request.operation === "collect") {
      if (request.composed !== true || (request.mode === "turn-end" &&
          (request.requestRoute === "ticketed" || request.finish === undefined))) return { status: "unsupported" };
      if (request.requestRoute === "ticketed") {
        const ticket = this.#ticketFor(request.ticket, request.root, request.advicee,
          true);
        if (ticket === undefined) return { requestRoute: "ticketed", status: "unavailable", reason: "lost" };
        const gate = this.#ticketCollectGate(ticket, request.dispatch, this.#now());
        if (gate !== undefined) return gate;
        const collected = await this.collect(request.root, request.advicee, request.dispatch,
          request.mode ?? "ordinary", ticket, true);
        return collected.status === "advice" ? { ...collected, requestRoute: "ticketed" }
          : this.#ticketCollectionStatus(ticket, request.root, request.advicee,
              true, this.#now());
      }
      if (request.finish !== undefined) {
        const group = adviceePartition(request.root, request.advicee);
        if (!this.#composedDelivery.ownsStop(group, request.finish.token)) return { status: "empty" };
        // Expired leases represent uncertain external output, not live writers.
        this.#pruneNoticeCooldowns(this.#now());
        for (const advice of this.#advice) {
          if (adviceePartition(advice.observation.root, advice.observation.advicee) === group &&
              advice.delivery !== undefined && advice.delivery.leaseUntil <= this.#now()) this.#releaseAdviceLease(advice);
        }
        const round = this.#rounds.get(group);
        const totalUnfinished = this.#collectionWorkCount(request.root, request.advicee, true);
        const ownUnfinished = round?.policyWork.unfinished() ?? 0;
        const extraUnfinished = Math.max(0, totalUnfinished - ownUnfinished);
        const gate = this.#composedDelivery.finishGate(group, request.finish.token,
          extraUnfinished, request.finish.deadlineReached);
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
      const collected = await this.collect(request.root, request.advicee, request.dispatch, request.mode ?? "ordinary", undefined, true);
      if (request.finish !== undefined) {
        const group = adviceePartition(request.root, request.advicee);
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
        // Only findings can reach the hook. Operational failures remain in
        // resident diagnostics and cannot reserve a continuation.
        return collected;
      }
      return request.reportWorkState === true && collected.status === "empty"
        ? this.#collectionWorkState(request.root, request.advicee, true)
        : collected;
    }
    if ((request.operation === "acknowledge" || request.operation === "finalize") &&
        !this.#composedDelivery.hasToken(request.token)) return { status: "empty" };
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
    composed = false): TicketRecord | undefined {
    const retained = this.#tickets.get(ticket.nonce);
    const basePartition = adviceePartition(root, advicee);
    return retained?.ticket.lifetime === this.lifetime && ticket.lifetime === this.lifetime &&
      retained.ticket.nonce === ticket.nonce && retained.generation > 0 &&
      retained.partition === basePartition &&
      retained.editAuthority === editAuthority(root, advicee)
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
      return { requestRoute: "ticketed", status: "unavailable", reason: command.reason };
    }
    throw new Error("canonical ticket collect gate refused");
  }

  #ticketCollectionStatus(ticket: TicketRecord, root: string, advicee: DirectAdvicee,
    composed: boolean, now: number): ResidentResponse {
    const partition = composed ? adviceePartition(root, advicee) : ticket.partition;
    const hasAdvice = this.#advice.some((item) =>
      (composed ? adviceePartition(item.observation.root, item.observation.advicee) === partition
        : item.partition === partition) && !this.#adviceExpired(item, now));
    return { requestRoute: "ticketed", status: hasAdvice || this.#collectionWorkCount(root, advicee, composed) > 0
      ? "pending" : "empty" };
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

  async #responseGate(operation: ResidentRequest["operation"], response: ResidentResponse): Promise<void> {
    const variable = operation === "collect" && response.status === "advice" &&
        process.env.REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH !== undefined
      ? "REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH"
      : operation === "admit"
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

  /** Recheck source with the same bounded, descriptor-anchored capture used at preparation. */
  async #handoffSourceCurrent(response: ResidentResponse): Promise<ReadonlyMap<string, boolean>> {
    const current = new Map<string, boolean>();
    if (response.status !== "advice") return current;
    for (const advice of this.#advice) {
      if (advice.delivery?.token !== response.token) continue;
      const relativePath = advice.prepared.input.path;
      const captured = await Effect.runPromise(captureStable(advice.observation.root, {
        relativePath,
        absolutePath: resolve(advice.observation.root, relativePath),
      }, {}, advice.observation.rootIdentity));
      current.set(advice.id, advice.sourceHash !== undefined && captured?.contentHash === advice.sourceHash);
    }
    return current;
  }

  /** Final policy barrier after bounded source capture and response gates. */
  #responseForHandoff(request: ResidentRequest, response: ResidentResponse,
    sourceCurrent: ReadonlyMap<string, boolean>): ResidentResponse {
    if (response.status !== "advice") {
      if (request.requestRoute === "shared" && request.operation === "collect" && request.finish === undefined && request.reportWorkState === true &&
          (response.status === "empty" || response.status === "pending")) {
        return this.#collectionWorkState(request.root, request.advicee, request.composed === true);
      }
      if (request.requestRoute !== "ticketed" || request.operation !== "collect") return response;
      const now = this.#now();
      this.#expirePending(now);
      this.#pruneNoticeCooldowns(now);
      const ticket = this.#ticketFor(request.ticket, request.root, request.advicee,
        request.composed === true);
      if (ticket === undefined) return { requestRoute: "ticketed", status: "unavailable", reason: "lost" };
      return this.#ticketCollectGate(ticket, request.dispatch, now) ??
        this.#ticketCollectionStatus(ticket, request.root, request.advicee,
          request.composed === true, now);
    }
    const now = this.#now();
    this.#expirePending(now);
    this.#pruneNoticeCooldowns(now);
    const sharedCollect = request.operation === "collect" && request.requestRoute !== "ticketed";
    let invalidCredential = false;
    if (sharedCollect) for (const advice of this.#advice) {
      if (advice.delivery?.token !== response.token || invalidCredential) continue;
      const generationValid = advice.credentialGeneration === (request.dispatch.credential?.generation ?? null);
      const observed = this.#ledger.transition({ kind: "deliveryCredentialObserveCheck",
        invalidSeen: invalidCredential, generationValid,
        authorized: generationValid && this.#adviceCredentialAuthority(advice) });
      if (observed.rejection !== undefined || observed.commands.length !== 1) throw new Error("canonical credential observation refused");
      invalidCredential = observed.commands[0]?.kind === "deliveryCredentialInvalid";
    }
    const credentialGate = this.#ledger.transition({ kind: "deliveryFinalCredentialCheck",
      sharedCollect, invalidSeen: invalidCredential });
    if (credentialGate.rejection !== undefined || credentialGate.commands.length !== 1) throw new Error("canonical final credential gate refused");
    if (credentialGate.commands[0]?.kind !== "deliveryBatchProceed") {
      this.releaseComposedSubmission(response.token);
      return { status: "empty" };
    }
    const handoff: Array<Advice> = [];
    for (const advice of [...this.#advice]) {
      if (advice.delivery?.token !== response.token) continue;
      const route = this.#candidateRoute({ kind: "finalCandidateCheck",
        ownerCurrent: true, credentialGeneration: true, credentialAuthorized: true,
        expired: !this.#roundActive(advice.round) || this.#adviceExpired(advice, now),
        workCurrent: this.#isCurrentWork(advice.revision, advice.prepared) && sourceCurrent.get(advice.id) === true,
        hasFindings: advice.delivery.findings.length > 0 });
      if (route === "retireCandidate") {
        this.#removeAdvice(advice.id, response.token);
        continue;
      }
      if (route === "releaseCandidate") {
        this.#releaseAdviceLease(advice);
        continue;
      }
      if (route !== "retainCandidate") continue;
      advice.delivery.leaseUntil = now + DELIVERY_LEASE_MS;
      handoff.push(advice);
    }
    const ticket = request.requestRoute === "ticketed" && request.operation === "collect"
      ? this.#ticketFor(request.ticket, request.root, request.advicee,
          request.composed === true)
      : undefined;
    if (request.requestRoute === "ticketed" && request.operation === "collect" && ticket === undefined) {
      this.releaseDelivery(response.token);
      return { requestRoute: "ticketed", status: "unavailable", reason: "lost" };
    }
    if (request.operation === "collect") {
      const composed = request.composed === true;
      const partition = adviceePartition(request.root, request.advicee);
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
      const claudeSurface = composed && ticket === undefined && request.advicee.host === "claude-code"
        ? request.mode === "turn-end" ? "stop" : "background" : undefined;
      const accepted = new Set(selectFittingCurrentFindingIndices(offers,
        ticket === undefined ? claudeSurface === undefined ? "codex" :
          claudeSurface === "stop" ? "claude-stop" : "claude-background" : ticket.claudeFeedbackMode,
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
    if (request.operation === "collect" && request.requestRoute === "shared" && request.composed === true &&
        request.advicee.host === "claude-code") {
      const surface = request.mode === "turn-end" ? "stop" : "background";
      const fit = this.#ledger.transition({ kind: "collectionFitCheck",
        items: findings.length + notices.length,
        bytes: encodedComposedClaudeOutputBytes(findings,
          notices.map((notice) => notice.value), surface) });
      if (fit.rejection !== undefined || fit.commands.length !== 1) {
        throw new Error("canonical final response fit refused");
      }
      if (fit.commands[0]?.kind === "collectionLimited") {
        this.releaseDelivery(response.token);
        return { status: "empty" };
      }
      if (fit.commands[0]?.kind !== "collectionFits") {
        throw new Error("invalid canonical final response fit");
      }
    }
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
    if (ticket !== undefined && request.operation === "collect" && request.requestRoute === "ticketed" &&
        this.#ledger.transition({ kind: "ticketFinalAuthorityCheck", admittedBlock,
      currentBlock }).commands[0]?.kind !== "ticketFinalProceed") {
      // A revoked opt-in cannot turn the old selection into an advisory lease.
      this.releaseDelivery(response.token);
      return this.#ticketCollectionStatus(ticket, request.root, request.advicee,
        request.composed === true, now);
    }
    const selected: ResidentResponse = findings.length === 0 && notices.length === 0
      ? { status: "empty" }
      : ticket === undefined
        ? { status: "advice", token: response.token, findingCount: findings.length,
            output: combinedReviewOutput(findings, notices.map((notice) => notice.value)) }
        : { requestRoute: "ticketed", status: "advice", token: response.token, findingCount: findings.length,
            output: combinedClaudeOutput(findings, notices.map((notice) => notice.value), ticket.claudeFeedbackMode) };
    if (request.requestRoute !== "ticketed" || request.operation !== "collect") return selected;
    if (ticket === undefined) return { requestRoute: "ticketed", status: "unavailable", reason: "lost" };
    return selected.status === "advice" ? { ...selected, requestRoute: "ticketed" }
      : this.#ticketCollectionStatus(ticket, request.root, request.advicee,
          request.composed === true, now);
  }

  /** Replace a provisional Stop reservation with the exact final IPC batch. */
  #reconcileFinishHandoff(request: ResidentRequest, provisional: ResidentResponse,
    final: ResidentResponse, canWrite: boolean): ResidentResponse {
    if (request.operation !== "collect" || request.requestRoute === "ticketed" || request.finish === undefined ||
        provisional.status !== "advice" || provisional.findingCount === 0) return final;
    const group = adviceePartition(request.root, request.advicee);
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
      socket.end(`${encodeCurrentResidentResponse({ status: "rejected-capacity" })}\n`);
      return;
    }
    this.#connections += 1;
    this.#scheduleIdleCheck();
    let bytes = 0;
    let encoded = "";
    let handled = false;
    let request: ResidentRequest | undefined;
    socket.setTimeout(1_500, () => socket.destroy());
    socket.once("close", () => {
      this.#connections -= 1;
      this.#scheduleIdleCheck();
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
        socket.end(`${encodeCurrentResidentResponse({ status: "rejected-capacity" })}\n`);
        return;
      }
      encoded += chunk.toString("utf8");
      const newline = encoded.indexOf("\n");
      if (newline < 0) return;
      handled = true;
      // Stop pulling transport bytes as soon as the single bounded frame is
      // complete. Advicee and observation decoding happens only afterward.
      socket.pause();
      const decoded = decodeCurrentResidentRequest(encoded.slice(0, newline));
      request = decoded;
      if (decoded === undefined) {
        socket.end(`${encodeCurrentResidentResponse({ status: "unsupported" })}\n`);
        return;
      }
      this.#pruneCollectionTokenIds();
      void this.handle(decoded).then(async (response) => {
        await this.#responseGate(decoded.operation, response);
        await this.#beforeResponseHandoff?.();
        const sourceCurrent = await this.#handoffSourceCurrent(response);
        const selected = this.#responseForHandoff(decoded, response, sourceCurrent);
        const handoff = this.#reconcileFinishHandoff(decoded, response, selected, !socket.destroyed);
        this.#pruneCollectionTokenIds();
        if (socket.destroyed) {
          if (handoff.status === "advice") this.releaseDelivery(handoff.token);
          if (handoff.status === "cleaned") this.#scheduleRetirementClose();
          return;
        }
        socket.end(`${encodeCurrentResidentResponse(handoff)}\n`, () => {
          if (socket.errored !== null && handoff.status === "advice") this.releaseDelivery(handoff.token);
        });
        if (handoff.status === "cleaned") this.#scheduleRetirementClose();
      }).catch(() => {
        if (!socket.destroyed) socket.end(`${encodeCurrentResidentResponse({ status: "unsupported" })}\n`);
      });
    });
  }

  #scheduleRetirementClose(): void {
    if (this.#retirementScheduled) return;
    this.#retirementScheduled = true;
    setTimeout(() => void this.close(), 10);
  }

  // Connection activity starts a fresh grace period. Retained review state is
  // checked by cleanup(), so an agent's exit cannot retire another's work.
  #scheduleIdleCheck(): void {
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    if (this.#lifecycle !== "active") return;
    this.#idleTimer = setTimeout(() => {
      this.#idleTimer = undefined;
      if (this.#connections === 0 && this.cleanup() === "cleaned") {
        this.#scheduleRetirementClose();
      } else {
        this.#scheduleIdleCheck();
      }
    }, RESIDENT_IDLE_CHECK_MS);
  }

  #scheduleQuietCheck(): void {
    if (this.#quietTimer !== undefined) clearTimeout(this.#quietTimer);
    if (this.#lifecycle !== "active") return;
    this.#quietTimer = setTimeout(() => {
      this.#quietTimer = undefined;
      this.sweepQuietRounds();
      this.#scheduleQuietCheck();
    }, VIRTUAL_ROUND_QUIET_CHECK_MS);
    this.#quietTimer.unref();
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
    this.#scheduleIdleCheck();
    this.#scheduleQuietCheck();
  }

  async close(): Promise<void> {
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    if (this.#quietTimer !== undefined) clearTimeout(this.#quietTimer);
    this.#quietTimer = undefined;
    this.#lifetimeController.abort();
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
    this.#joinedReviews.clear();
    this.#ticketUnits.clear();
    // Running work may be interrupted by process exit or finish later. Clear
    // its logical ownership after native effects settle. Issued Jev permits
    // remain reserved through an interruption attempt.
    this.#reuse.clear();
    await this.#dispatcher.whenIdle();
    this.#ledger.clear();
    this.#currentWork.clear();
    this.#revisionIds.clear();
    const server = this.#server;
    if (server !== undefined) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(this.paths.socket, { force: true });
    await rm(this.paths.owner, { force: true });
  }
}
