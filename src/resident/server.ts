import { ResidentDispatchControls, dispatchControlsLayer } from "./dispatch-controls.ts";
import { makeSocketFramePort, type SocketFramePort } from "./socket-frame.ts";
import { ResidentPreparationControls, preparationControlsLayer } from "./preparation-controls.ts";
import { captureWorkspaceBytes, analysisWorkspaceBytes } from "./preparation-workspace.ts";
import { makeResidentRuntimeConfiguration } from "./runtime-configuration.ts";
import type { Advice } from "./advice-records.ts";
import type { PendingNoticeSnapshot as PendingNotice } from "./notice-records.ts";
import type { RoundWork, WorkCohort } from "./round-records.ts";
import type { JoinedReview, JoinedReviewOutcome } from "./joined-reviews.ts";
import type { TicketRecord } from "./ticket-records.ts";
import type { TicketUnit } from "./ticket-units.ts";
import { workSubject, type WorkRevision } from "./revision.ts";
import { recordRoundClosure, type RoundCloseReason } from "../activity/status.ts";
import { monotonicNow } from "./hook-clock.ts";
import * as Config from "effect/Config";
import * as Option from "effect/Option";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/http/HttpClient";
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
import { captureStable } from "../direct-event/capture.ts";
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
  makeResidentState,
  type CapacityLedger,
  type CapacityReservation,
} from "./capacity.ts";
import { makeDispatcher, type Dispatcher } from "./dispatch.ts";
import { Context, Exit, Layer, Scope } from "effect";
import * as Fiber from "effect/Fiber";
import * as FiberHandle from "effect/FiberHandle";
import * as Schedule from "effect/Schedule";
import type { ComposedDelivery } from "./composed-delivery.ts";
import type { CanonicalCommand, CanonicalEvent } from "../canonical/adapter.ts";
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
  type OperationalNoticeKind,
} from "./collection.ts";
import { type EvaluationReuse, residentEvaluationIdentity } from "./evaluation-reuse.ts";
import {
  readCredentialState,
  resolveCredential,
  type CredentialResolution,
} from "../credentials/secret-service.ts";
import { recordActivity } from "../activity/status.ts";
import { claimDemoBudget } from "../onboarding/demo-budget.ts";
import { findingFromProbability } from "../rules/decision.ts";
import { recordDemoTrace } from "../onboarding/demo-trace.ts";

class ResidentAdapterError extends Schema.TaggedError<ResidentAdapterError>()(
  "ResidentAdapterError", { operation: Schema.String },
) {}
const residentResponse = (response: ResidentResponse): ResidentResponse => response;
const residentAdapter = <A>(operation: string, run: () => Promise<A>) => Effect.tryPromise({
  try: run, catch: () => new ResidentAdapterError({ operation }),
});
// Cancellation requests native abort, then waits for physical completion before
// the caller can settle its canonical request and release the running permit.
const physicalRequest = (operation: string, run: (signal: AbortSignal) => Promise<void>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const controller = new AbortController();
      const completion = Promise.resolve().then(() => run(controller.signal));
      return { controller, completion };
    }),
    ({ completion }) => residentAdapter(operation, () => completion),
    ({ controller, completion }) => Effect.gen(function* () {
      controller.abort();
      yield* residentAdapter(operation, () => completion).pipe(Effect.exit, Effect.asVoid);
    }),
  );
const workInvalidated = (signal: AbortSignal) => Effect.callback<never, ResidentAdapterError>((resume) => {
  const abort = () => resume(Effect.fail(new ResidentAdapterError({ operation: "work invalidated" })));
  if (signal.aborted) { abort(); return; }
  signal.addEventListener("abort", abort, { once: true });
  return Effect.sync(() => signal.removeEventListener("abort", abort));
});
const withinWork = <A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal) =>
  effect.pipe(Effect.raceFirst(workInvalidated(signal)), Effect.interruptible);

const RESERVATION_OVERHEAD_BYTES = 1024;
const MAX_PROBABILITY_ENCODING_BYTES = 24;
const RESIDENT_IDLE_CHECK_MS = 20_000;
const VIRTUAL_ROUND_QUIET_CHECK_MS = 20_000;
export const OPERATIONAL_NOTICE_COOLDOWN_MS = 60_000;
export const MAX_OPERATIONAL_NOTICE_KEYS = 64;

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
  findingOnSourceIncludes: Schema.optionalKey(Schema.String),
  capturePath: Schema.optionalKey(Schema.String),
  requestSummaryPath: Schema.optionalKey(Schema.String),
  outcomePath: Schema.optionalKey(Schema.String),
  requireCredential: Schema.optionalKey(Schema.Boolean),
  syntheticR6BrandedRepair: Schema.optionalKey(Schema.Literals(["control", "finding"])),
});

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

export type ResidentRuntimeOptions = {
  readonly beforeRevalidate?: (adviceId: string) => Promise<void>;
  readonly beforeEvaluate?: (prepared: PreparedUnit) => Promise<void>;
  /** Fixture-only source effect; never supplied by resident IPC. */
  readonly captureSource?: DirectReviewContext["captureSource"];
  readonly afterRevalidationWorkspaceReserved?: (adviceId: string) => Promise<void>;
  readonly afterAdvicePending?: (adviceId: string) => Promise<void> | void;
  /** Scoped local preparation coordination; never supplied by resident IPC. */
  readonly preparationControls?: Layer.Layer<ResidentPreparationControls>;
  readonly beforeFinalRevalidate?: (adviceId: string) => Promise<void>;
  readonly dispatchControls?: Layer.Layer<ResidentDispatchControls>;
  /** Fixture-only authority observation; never supplied by resident IPC. */
  readonly dispatchAuthorityObserver?: (observation: DispatchAuthorityObservation) => void;
  /** Fixture-only source-free command/effect witness. */
  readonly jevRequestObserver?: (observation: JevRequestObservation) => void;
  readonly maximumOperationalNoticeKeys?: number;
  /** Fixture-only HTTP transport; never supplied by resident IPC. */
  readonly offlineHttpClient?: HttpClient.HttpClient;
  /** Fixture-only gate entered by the controlled DecisionModel call. */
  readonly controlledRequestEffect?: (signal: AbortSignal) => Promise<void>;
  readonly beforeResponseHandoff?: () => Promise<void>;
  readonly maximumTickets?: number;
};

/** Effect operations consumed by the process and protocol services. */
export interface ResidentRuntimeOperations {
  readonly lifetime: string;
  readonly paths: ResidentPaths;
  readonly listen: () => Effect.Effect<void, ResidentAdapterError>;
  readonly close: Effect.Effect<void, ResidentAdapterError>;
  readonly handle: (request: ResidentRequest) => Effect.Effect<ResidentResponse, ResidentAdapterError>;
  readonly stats: () => Effect.Effect<Extract<ResidentResponse, { status: "stats" }>>;
  readonly whenIdle: () => Effect.Effect<void>;
}

export interface ResidentRuntime {
  readonly operations: ResidentRuntimeOperations;
  readonly lifetime: string;
  readonly paths: ResidentPaths;
  readonly listenEffect: () => Effect.Effect<void, ResidentAdapterError>;
  readonly closeEffect: Effect.Effect<void, ResidentAdapterError>;
  stats(): Extract<ResidentResponse, { status: "stats" }>;
  cleanup(): "busy" | "cleaned";
  admit(observation: DirectObservation, dispatch: ResidentDispatchContext, ticketed?: boolean, composed?: boolean, requirePermit?: boolean): ResidentResponse;
  collect(root: string, advicee: DirectAdvicee, dispatch: ResidentDispatchContext, mode?: CollectionMode): Promise<Exclude<ResidentResponse, { readonly requestRoute: "ticketed" }>>;
  collect(root: string, advicee: DirectAdvicee, dispatch: ResidentDispatchContext, mode: CollectionMode, ticket: undefined, composed: true): Promise<Exclude<ResidentResponse, { readonly requestRoute: "ticketed" }>>;
  collect(root: string, advicee: DirectAdvicee, dispatch: ResidentDispatchContext, mode: CollectionMode, ticket: TicketRecord, composed?: boolean): Promise<ResidentResponse>;
  acknowledge(token: string): Effect.Effect<ResidentResponse>;
  finalize(token: string): Effect.Effect<ResidentResponse>;
  releaseDelivery(token: string): Effect.Effect<void>;
  beginComposedSubmission(token: string, surface: "edit" | "background" | "stop"): Effect.Effect<ResidentResponse>;
  releaseComposedSubmission(token: string): Effect.Effect<ResidentResponse>;
  whenIdle(): Promise<void>;
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
  }>;
  accountingMetrics(): {
    readonly peakLedgerBytes: number;
    readonly maxMaterializedPreparedUnits: number;
    readonly successfulCacheEntries: number;
    readonly successfulCacheBytes: number;
    readonly pendingEvaluations: number;
    readonly operationalNoticeKeys: number;
    readonly pendingOperationalNotices: number;
    readonly operationalNoticeBytes: number;
  };
  sweepQuietRounds(now?: number): number;
  handle(request: ResidentRequest): Promise<ResidentResponse>;
  listen(): Promise<void>;
  close(): Promise<void>;
}

export class ResidentRuntimeService extends Context.Service<ResidentRuntimeService, ResidentRuntimeOperations>()("@hapsland/ResidentRuntime") {}

export const makeResidentRuntime = Effect.fn("ResidentRuntime.make")(function* (
  paths: ResidentPaths = residentPaths(),
  now: () => number = monotonicNow,
  options: ResidentRuntimeOptions = {},
) {
  const runtimeConfiguration = yield* makeResidentRuntimeConfiguration().pipe(
    Effect.mapError(() => new ResidentAdapterError({ operation: "resident runtime configuration" })),
  );
  const residentLedger = yield* makeResidentState<UnitJob, string, Job>();
  const lifetime = residentLedger.residentLifetime;
  const residentJoined = residentLedger.joinedReviews(logicalBytes);
  const residentRuntimeScope = yield* Scope.Scope;
  const residentIpcScope = yield* Scope.make();
  yield* Effect.addFinalizer(() => Scope.close(residentIpcScope, Exit.void));
  const residentDispatchScope = yield* Scope.make();
  yield* Effect.addFinalizer(() => Scope.close(residentDispatchScope, Exit.void));
  const residentStopExpiries = new Map<string, Fiber.Fiber<void>>();
  const residentComposedDelivery = residentLedger.delivery((diagnostic) => {
    // Keep diagnostics source-free and bounded even for an indefinitely running resident.
    const path = join(runtime.paths.directory, "repeat-edits.log");
    const line = `${JSON.stringify({ at: Date.now(), ...diagnostic })}\n`;
    const limit = 256 * 1024;
    try { writeFileSync(join(runtime.paths.directory, "repeat-edits-observed"), "1\n", { flag: "wx", mode: 0o600 }); }
    catch { /* The marker is already present or diagnostics are unavailable. */ }
    try {
      const size = statSync(path).size;
      if (size + Buffer.byteLength(line) > limit) writeFileSync(path, line, { mode: 0o600 });
      else appendFileSync(path, line, { mode: 0o600 });
    } catch {
      try { writeFileSync(path, line, { mode: 0o600 }); } catch { /* logging cannot block admission */ }
    }
  });
  let residentServer: Server | undefined;
  let residentOwnsOwnerRecord = false;
  const residentIdleChecks = yield* FiberHandle.make<void, never>().pipe(Effect.provideService(Scope.Scope, residentDispatchScope));
  const residentQuietChecks = yield* FiberHandle.make<void, never>().pipe(Effect.provideService(Scope.Scope, residentDispatchScope));
  const residentLifetimeController = new AbortController();
  const residentCollectionFindingOffer: CanonicalFindingOffer = (input) => {
    const facts = input.facts;
    const result = residentLedger.transition({ kind: "collectionFindingCheck",
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

  const maximumOperationalNoticeKeys = options.maximumOperationalNoticeKeys ?? MAX_OPERATIONAL_NOTICE_KEYS;
  if (
    !Number.isSafeInteger(maximumOperationalNoticeKeys) ||
    maximumOperationalNoticeKeys < 1 ||
    maximumOperationalNoticeKeys > MAX_OPERATIONAL_NOTICE_KEYS
  ) {
    throw new RangeError(`maximumOperationalNoticeKeys must be an integer from 1 to ${MAX_OPERATIONAL_NOTICE_KEYS}`);
  }
  const maximumTickets = options.maximumTickets ?? MAX_TICKETS;
  if (!Number.isSafeInteger(maximumTickets) || maximumTickets < 1 || maximumTickets > MAX_TICKETS) {
    throw new RangeError(`maximumTickets must be an integer from 1 to ${MAX_TICKETS}`);
  }
  const residentMaximumTickets = maximumTickets;
  const residentNow = now;
  const residentNotices = residentLedger.notices(maximumOperationalNoticeKeys, OPERATIONAL_NOTICE_COOLDOWN_MS, PENDING_ADVICE_EXPIRY_MS, logicalBytes);
  const residentBeforeRevalidate = options.beforeRevalidate;
  const residentBeforeEvaluate = options.beforeEvaluate;
  const residentCaptureSource = options.captureSource;
  const residentAfterRevalidationWorkspaceReserved = options.afterRevalidationWorkspaceReserved;
  const residentAfterAdvicePending = options.afterAdvicePending;
  const residentControlScope = yield* Scope.make();
  yield* Effect.addFinalizer(() => Scope.close(residentControlScope, Exit.void));
  const residentPreparationControls = Context.get(
    yield* Layer.buildWithScope(options.preparationControls ?? preparationControlsLayer, residentControlScope), ResidentPreparationControls);
  const residentBeforeFinalRevalidate = options.beforeFinalRevalidate;
  const residentDispatchControls = Context.get(
    yield* Layer.buildWithScope(options.dispatchControls ?? dispatchControlsLayer, residentControlScope), ResidentDispatchControls);
  const residentDispatchAuthorityObserver = options.dispatchAuthorityObserver;
  const residentJevRequestObserver = options.jevRequestObserver;
  const residentOfflineHttpClient = options.offlineHttpClient;
  const residentControlledRequestEffect = options.controlledRequestEffect;
  const residentBeforeResponseHandoff = options.beforeResponseHandoff;
  const residentReuse = residentLedger.reuse(logicalBytes);

  const residentAdvice = (): ReadonlyArray<Advice> => { return residentLedger.advice.values(); };

  const statsEffect = Effect.fn("ResidentRuntime.stats")(function* (): Effect.fn.Return<Extract<ResidentResponse, { status: "stats" }>> {
    const now = residentNow();
    yield* residentExpirePending(now);
    residentPruneNoticeCooldowns(now);
    const dispatch = yield* residentDispatcher.snapshot();
    const capacity = residentLedger.snapshot();
    const reuse = residentReuse.snapshot();
    return {
      status: "stats",
      queued: dispatch.queued,
      running: dispatch.running,
      pendingAdvice: residentAdvice().length + residentPendingNoticeCount(),
      pendingFindingBatches: residentAdvice().length,
      pendingOperationalNotices: residentPendingNoticeCount(),
      retainedBytes: capacity.bytes,
      rejectedCapacity: residentLedger.runtime.snapshot().rejectedCapacity,
      successfulCacheEntries: reuse.entries,
      pendingEvaluations: reuse.pending,
      noticeCooldowns: residentNotices.entries().length,
      currentWork: yield* residentLedger.revision.count(),
    };
  });

  function stats(): Extract<ResidentResponse, { status: "stats" }> {
    return Effect.runSync(statsEffect());
  }

  const residentEvictRetainedTickets = Effect.fn("ResidentRuntime.evictRetainedTickets")((limit: number) =>
    residentLedger.tickets.retain(limit));

  const cleanupEffect = Effect.fn("ResidentRuntime.cleanup")(function* (): Effect.fn.Return<"busy" | "cleaned"> {
    if (residentLedger.runtime.snapshot().lifecycle !== "active") return "busy";
    const now = residentNow();
    yield* residentExpirePending(now);
    residentPruneNoticeCooldowns(now);
    return yield* residentLedger.runtime.cleanup(logicalBytes);
  });

  function cleanup(): "busy" | "cleaned" {
    return Effect.runSync(cleanupEffect());
  }

  function residentPruneCollectionTokenIds(): void {
    const live = residentComposedDelivery.liveCollectionTokenKeys();
    for (const advice of residentAdvice()) if (advice.delivery !== undefined) live.add(advice.delivery.token);
    for (const notice of residentNotices.entries().map(([, value]) => value)) {
      if (notice.pending?.delivery !== undefined) live.add(notice.pending.delivery.token);
    }
    residentLedger.pruneCollectionTokenIds(live);
  }

  const residentRoundSnapshot = Effect.fn("ResidentRuntime.roundSnapshot")(function* (round: RoundWork) {
    const snapshot = yield* residentLedger.rounds.snapshot(round);
    if (snapshot === undefined) throw new Error("native round snapshot lost its capability");
    return snapshot;
  });

  const admitEffect = Effect.fn("ResidentRuntime.admit")(function* (observation: DirectObservation, dispatch: ResidentDispatchContext, ticketed = false, composed = false, requirePermit = false): Effect.fn.Return<ResidentResponse> {
    const now = residentNow();
    yield* residentExpirePending(now);
    // Reclaim cooldown state whose active guarantee and pending notice have
    // both ended before it can cause an otherwise-valid admission to fail.
    residentPruneNoticeCooldowns(now);
    if (residentLedger.runtime.snapshot().lifecycle !== "active") return ticketed ? { requestRoute: "ticketed", status: "rejected-capacity" } : { status: "rejected-capacity" };
    const group = adviceePartition(observation.root, observation.advicee);
    const generation = composed ? residentComposedDelivery.admitEdit(group,
      observation.advicee.toolUseId, monotonicNow(), requirePermit) : undefined;
    if (composed && generation === undefined) {
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee,
        lifetime: runtime.lifetime, stage: "incomplete" });
      return ticketed ? { requestRoute: "ticketed", status: "rejected-stale" } : { status: "rejected-stale" };
    }
    const round = generation === undefined ? undefined : yield* residentLedger.rounds.bind(group, generation,
      { root: observation.root, advicee: observation.advicee, activityPath: dispatch.activityPath }, randomUUID());
    const partition = group;
    const canonicalRound = round?.canonicalRound ?? residentLedger.roundId(partition);
    const reservation = residentLedger.reserve(partition, logicalBytes({ observation, dispatch }) + RESERVATION_OVERHEAD_BYTES, "observationDispatch");
    if (reservation === undefined) {
      yield* residentLedger.runtime.rejectCapacity();
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: runtime.lifetime, stage: "unavailable" });
      return ticketed ? { requestRoute: "ticketed", status: "rejected-capacity" } : { status: "rejected-capacity" };
    }
    let canonicalObservationId: number;
    try {
      canonicalObservationId = residentLedger.admitObservation(partition, canonicalRound);
    } catch {
      residentLedger.release(reservation);
      return ticketed ? { requestRoute: "ticketed", status: "rejected-capacity" } : { status: "rejected-capacity" };
    }
    const ticket: TicketRecord | undefined = ticketed ? yield* residentLedger.tickets.open({
      ticket: { nonce: randomUUID(), lifetime: runtime.lifetime },
      partition,
      editAuthority: editAuthority(observation.root, observation.advicee),
      root: observation.root, userConfigPath: dispatch.userConfigPath,
      claudeFeedbackMode: residentCurrentClaudeFeedbackMode(observation.root, dispatch.userConfigPath),
      credentialGeneration: dispatch.credential?.generation ?? null,
      credentialStatePath: dispatch.credential?.statePath ?? null,
      credentialRequired: dispatch.controlled === null || dispatch.controlled.requireCredential === true,
      credentialEnvironmentOnly: dispatch.credential?.environmentOnly ?? false,
      expiresAt: now + TICKET_RETENTION_MS,
    }) : undefined;
    const job = {
      kind: "ingress" as const,
      canonicalRound,
      ...(round === undefined ? {} : { round, work: (yield* residentRoundSnapshot(round)).work,
        workObservationId: (yield* residentLedger.rounds.policyWork(round)).admit(canonicalObservationId) }),
      observation,
      canonicalObservationId,
      partition,
      reservation,
      dispatch,
      ...(ticket === undefined ? {} : { ticket }),
    };
    if (!(yield* residentDispatcher.enqueue(partition, job))) {
      if (ticket !== undefined) yield* residentLedger.tickets.forget(ticket);
      residentLedger.observation(partition, canonicalObservationId, "interruptObservation", canonicalRound);
      residentLedger.release(reservation);
      yield* residentLedger.runtime.rejectCapacity();
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: runtime.lifetime, stage: "unavailable" });
      return ticketed ? { requestRoute: "ticketed", status: "rejected-capacity" } : { status: "rejected-capacity" };
    }
    if (ticket !== undefined) {
      yield* residentEvictRetainedTickets(residentMaximumTickets);
    }
    const acceptedPath = runtimeConfiguration.admissionAcceptedPath;
    if (acceptedPath !== undefined) void writeFile(acceptedPath, "accepted\n").catch(() => undefined);
    const admissionTracePath = runtimeConfiguration.admissionTracePath;
    const admissionSalt = runtimeConfiguration.admissionSalt;
    if (admissionTracePath !== undefined && admissionSalt !== undefined) {
      const key = (value: string) => createHash("sha256").update(`${admissionSalt}:${value}`).digest("hex");
      const { sessionId, toolUseId } = observation.advicee;
      if (typeof sessionId === "string" && typeof toolUseId === "string") {
        void appendFile(admissionTracePath, `${JSON.stringify({
          key: key(toolUseId), sessionKey: key(sessionId),
        })}\n`, "utf8").catch(() => undefined);
      }
    }
    recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: runtime.lifetime, stage: "pending" });
    return ticket === undefined ? { status: "accepted" } : { requestRoute: "ticketed", status: "accepted", ticket: ticket.ticket };
  }, Effect.uninterruptible);

  function admit(observation: DirectObservation, dispatch: ResidentDispatchContext, ticketed = false, composed = false, requirePermit = false): ResidentResponse {
    return Effect.runSync(admitEffect(observation, dispatch, ticketed, composed, requirePermit));
  }

  function residentCollectionElapsed(now: number, started: number, limit: number): number {
    const elapsed = Math.min(limit, Math.max(0, now - started));
    return Number.isNaN(elapsed) ? 0 : Math.floor(elapsed);
  }

  function residentPendingCanonicalFindings(operation: number): number {
    return residentLedger.canonicalProjection().pendingFindings.find((item) =>
      item.operation === operation)?.count ?? 0;
  }

  function residentAdviceExpired(advice: Pick<Advice, "pendingAt">, now: number): boolean {
    const result = residentLedger.transition({ kind: "collectionExpiryCheck",
      elapsed: residentCollectionElapsed(now, advice.pendingAt, PENDING_ADVICE_EXPIRY_MS),
      lifetime: PENDING_ADVICE_EXPIRY_MS });
    if (result.rejection !== undefined) throw new Error("canonical advice expiry refused");
    const command = result.commands[0]?.kind;
    if (command !== "collectionExpired" && command !== "collectionCurrent") throw new Error("invalid canonical advice expiry");
    return command === "collectionExpired";
  }

  function residentCollectionOrder(left: Pick<Advice, "sequence">,
    right: Pick<Advice, "sequence">): number {
    const result = residentLedger.transition({ kind: "collectionOrderCheck",
      leftSequence: left.sequence, rightSequence: right.sequence });
    if (result.rejection !== undefined) throw new Error("canonical collection order refused");
    switch (result.commands[0]?.kind) {
      case "collectionBefore": return -1;
      case "collectionEqual": return 0;
      case "collectionAfter": return 1;
      default: throw new Error("invalid canonical collection order");
    }
  }

  const residentReserveAdviceLease = Effect.fn("ResidentRuntime.reserveAdviceLease")((advice: Advice, token: string) =>
    residentLedger.advice.reserveLease(advice, token));

  const residentReleaseAdviceLease = Effect.fn("ResidentRuntime.releaseAdviceLease")((advice: Advice) => residentLedger.advice.releaseLease(advice));

  const residentCheckAdviceLease = Effect.fn("ResidentRuntime.checkAdviceLease")(function* (advice: Advice, now: number, stopCollector: boolean, sameGroup: boolean) {
    const { delivery } = yield* residentLedger.advice.current(advice);
    yield* residentLedger.advice.checkLease(advice, now, stopCollector, sameGroup,
      delivery !== undefined && stopCollector && sameGroup &&
        residentComposedDelivery.backgroundReofferable(advice.id, delivery.token));
  }, Effect.uninterruptible);

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode?: CollectionMode,
  ): Promise<Exclude<ResidentResponse, { readonly requestRoute: "ticketed" }>>;

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    ticket: undefined,
    composed: true,
  ): Promise<Exclude<ResidentResponse, { readonly requestRoute: "ticketed" }>>;

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    ticket: TicketRecord,
    composed?: boolean,
  ): Promise<ResidentResponse>;

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode = "ordinary",
    ticket?: TicketRecord,
    composed = false,
  ): Promise<ResidentResponse> {
    return Effect.runPromise(residentCollect(root, advicee, dispatch, mode, ticket, composed));
  }

  const residentCollect = Effect.fn("ResidentRuntime.collect")((
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode = "ordinary",
    ticket?: TicketRecord,
    composed = false,
  ) => Effect.suspend(() => {
    const server = runtime;
    let collectionToken: string | undefined;
    return Effect.gen(function* () {
      const partition = adviceePartition(root, advicee);
      const claudeSurface: ComposedClaudeSurface | undefined = composed && ticket === undefined &&
        advicee.host === "claude-code" ? mode === "turn-end" ? "stop" : "background" : undefined;
      const now = residentNow();
      if (composed && mode !== "turn-end" && residentComposedDelivery.isDeciding(partition)) return residentResponse({ status: "empty" });
      const stopCollector = composed && mode === "turn-end" && residentComposedDelivery.isDeciding(partition);
      yield* residentExpirePending(now);
      residentPruneNoticeCooldowns(now);
      const credentialGeneration = dispatch.credential?.generation ?? null;
      for (const item of [...residentAdvice()]) {
        const sameScope = composed ? adviceePartition(item.observation.root, item.observation.advicee) === partition
          : item.partition === partition;
        const disposition = residentLedger.transition({ kind: "collectionCredentialCheck",
          sameScope, generationValid: item.credentialGeneration === credentialGeneration });
        if (disposition.rejection !== undefined) throw new Error("canonical credential check refused");
        if (disposition.commands[0]?.kind === "collectionRetireCredential") {
          yield* residentRemoveAdvice(item.id);
        } else if (disposition.commands[0]?.kind !== "collectionRetainCredential") {
          throw new Error("invalid canonical credential decision");
        }
      }
      // Stop can reoffer only an uncertain background write after its writer has
      // terminated; a submitted write counts as delivery.
      for (const { capability: item, content } of (yield* residentLedger.advice.snapshots())) {
        const delivery = content.delivery;
        const sameGroup = adviceePartition(item.observation.root, item.observation.advicee) === partition;
        if (delivery !== undefined) yield* residentCheckAdviceLease(item, now, stopCollector, sameGroup);
      }
      const available = (yield* residentLedger.advice.snapshots()).filter(({ capability: item, content }) => {
        const samePartition = composed
          ? adviceePartition(item.observation.root, item.observation.advicee) === partition
          : item.partition === partition;
        const unleased = content.delivery === undefined;
        const hasUnsuppressed = samePartition && unleased && content.findings.some((finding) =>
          !residentComposedDelivery.suppresses(item.id,
            adviceePartition(item.observation.root, item.observation.advicee), finding,
            stopCollector ? "stop" : undefined));
        const ticketOwns = ticket === undefined || ticket.partition === item.partition;
        const result = residentLedger.transition({ kind: "collectionCandidateCheck",
          samePartition, unleased, hasUnsuppressed, ticketOwns });
        if (result.rejection !== undefined) throw new Error("canonical advice candidate refused");
        if (result.commands[0]?.kind !== "collectionCandidate" && result.commands[0]?.kind !== "collectionSkip") {
          throw new Error("invalid canonical advice candidate");
        }
        return result.commands[0]?.kind === "collectionCandidate";
      }).map(({ capability }) => capability);
      for (const item of available) {
        yield* residentLedger.advice.eligible(item, yield* residentJoined.hasAdmission(item.admissionId));
      }
      const eligible = (yield* Effect.forEach(available, Effect.fn("ResidentRuntime.eligibleAdvice")(function* (item) {
        return { item, content: yield* residentLedger.advice.current(item) };
      }))).filter(({ content }) => content.collectionEligible).map(({ item }) => item)
        .sort((left, right) => residentCollectionOrder(left, right))
        .map((item) => item.id);
      const token = collectionToken = randomUUID();
      const fittingFindings = Effect.fn("ResidentRuntime.fittingFindings")(function* (
        retained: ReadonlyArray<Finding>, candidates: ReadonlyArray<Finding>,
        advice: Advice, reportLimit: boolean,
      ) {
        const facts = yield* residentFindingSelectionFacts(advice, partition, credentialGeneration, residentNow(), composed);
        const onLimited = reportLimit
          ? () => residentRecordOperationalFailure(advice.observation, "output-limit")
          : undefined;
        return ticket === undefined
          ? claudeSurface === undefined
            ? selectFittingFindings(retained, candidates, facts, onLimited, residentCollectionFindingOffer)
            : selectFittingComposedClaudeFindings(retained, candidates, claudeSurface,
                facts, onLimited, residentCollectionFindingOffer)
          : selectFittingClaudeFindings(retained, candidates, ticket.claudeFeedbackMode,
            facts, onLimited, residentCollectionFindingOffer);
      });
      let handoffFindings: Array<Finding> = [];
      const selected: Array<Advice> = [];
      let selectedFindings: Array<Finding> = [];
      for (const id of eligible) {
        const advice = residentAdvice().find((item) => item.id === id && item.delivery === undefined);
        if (advice === undefined) continue;
        if (!(yield* residentReserveAdviceLease(advice, token))) continue;
        yield* residentAdapter("collection revalidation barrier", () => Promise.resolve(residentBeforeRevalidate?.(advice.id)));
        const validity = yield* residentRevalidate(advice, dispatch);
        const retained = residentAdvice().find((item) => item.id === advice.id);
        const route = residentCandidateRoute({ kind: "validationRouteCheck",
          ownerCurrent: retained === advice && retained.delivery?.token === token,
          status: validity.status });
        if (route === "ignoreCandidate") continue;
        if (route === "releaseCandidate") {
          yield* residentReleaseAdviceLease(advice);
          continue;
        }
        if (route === "retireCandidate") {
          yield* residentRemoveAdvice(advice.id, token);
          continue;
        }
        if (route !== "continueCandidate" || validity.status !== "current") {
          yield* residentReleaseAdviceLease(advice);
          continue;
        }
        const workAccepted = advice.round === undefined || advice.workUnitId === undefined ||
          (yield* residentLedger.rounds.policyWork(advice.round)).reviseFinding(advice.workUnitId,
            validity.findings.length, logicalBytes(validity.findings));
        const workRoute = residentCandidateRoute({ kind: "postValidationCheck",
          workAccepted, expired: false, hasFitting: true });
        if (workRoute !== "retainCandidate") {
          if (workRoute === "retireCandidate") yield* residentRemoveAdvice(advice.id, token);
          else yield* residentReleaseAdviceLease(advice);
          continue;
        }
        yield* residentLedger.advice.revise(advice, validity.evaluations, validity.findings);
        const handoffNow = residentNow();
        const expiryRoute = residentCandidateRoute({ kind: "postValidationCheck",
          workAccepted: true, expired: residentAdviceExpired(advice, handoffNow), hasFitting: true });
        if (expiryRoute !== "retainCandidate") {
          if (expiryRoute === "retireCandidate") yield* residentRemoveAdvice(advice.id, token);
          else yield* residentReleaseAdviceLease(advice);
          continue;
        }
        const fitting = yield* fittingFindings(selectedFindings, (yield* residentLedger.advice.current(advice)).findings.filter((finding) =>
          !residentComposedDelivery.suppresses(advice.id,
            adviceePartition(advice.observation.root, advice.observation.advicee), finding, stopCollector ? "stop" : undefined)), advice, true);
        const fittingRoute = residentCandidateRoute({ kind: "postValidationCheck",
          workAccepted: true, expired: false, hasFitting: fitting.length > 0 });
        if (fittingRoute !== "retainCandidate") {
          if (fittingRoute === "retireCandidate") yield* residentRemoveAdvice(advice.id, token);
          else yield* residentReleaseAdviceLease(advice);
          continue;
        }
        yield* residentLedger.advice.updateDelivery(advice, token, { findings: fitting });
        selectedFindings = [...selectedFindings, ...fitting];
        selected.push(advice);
      }
      if (selected.length > 0) {
        const final: Array<Advice> = [];
        let finalFindings: Array<Finding> = [];
        for (const advice of selected) {
          yield* residentAdapter("final collection revalidation barrier", () => Promise.resolve(residentBeforeFinalRevalidate?.(advice.id)));
          const validity = yield* residentRevalidate(advice, dispatch);
          const retained = residentAdvice().find((item) => item.id === advice.id);
          const route = residentCandidateRoute({ kind: "validationRouteCheck",
            ownerCurrent: retained === advice && retained.delivery?.token === token,
            status: validity.status });
          if (route === "ignoreCandidate") continue;
          if (route === "releaseCandidate") {
            yield* residentReleaseAdviceLease(advice);
            continue;
          }
          if (route === "retireCandidate") {
            yield* residentRemoveAdvice(advice.id, token);
            continue;
          }
          if (route !== "continueCandidate" || validity.status !== "current") {
            yield* residentReleaseAdviceLease(advice);
            continue;
          }
          const workAccepted = advice.round === undefined || advice.workUnitId === undefined ||
            (yield* residentLedger.rounds.policyWork(advice.round)).reviseFinding(advice.workUnitId,
              validity.findings.length, logicalBytes(validity.findings));
          const workRoute = residentCandidateRoute({ kind: "postValidationCheck",
            workAccepted, expired: false, hasFitting: true });
          if (workRoute !== "retainCandidate") {
            if (workRoute === "retireCandidate") yield* residentRemoveAdvice(advice.id, token);
            else yield* residentReleaseAdviceLease(advice);
            continue;
          }
          yield* residentLedger.advice.revise(advice, validity.evaluations, validity.findings);
          const handoffNow = residentNow();
          const expiryRoute = residentCandidateRoute({ kind: "postValidationCheck",
            workAccepted: true, expired: residentAdviceExpired(advice, handoffNow), hasFitting: true });
          if (expiryRoute !== "retainCandidate") {
            if (expiryRoute === "retireCandidate") yield* residentRemoveAdvice(advice.id, token);
            else yield* residentReleaseAdviceLease(advice);
            continue;
          }
          const fitting = yield* fittingFindings(finalFindings, (yield* residentLedger.advice.current(advice)).findings.filter((finding) =>
            !residentComposedDelivery.suppresses(advice.id,
              adviceePartition(advice.observation.root, advice.observation.advicee), finding, stopCollector ? "stop" : undefined)), advice, true);
          const fittingRoute = residentCandidateRoute({ kind: "postValidationCheck",
            workAccepted: true, expired: false, hasFitting: fitting.length > 0 });
          if (fittingRoute !== "retainCandidate") {
            if (fittingRoute === "retireCandidate") yield* residentRemoveAdvice(advice.id, token);
            else yield* residentReleaseAdviceLease(advice);
            continue;
          }
          if (advice.delivery?.token !== token) continue;
          yield* residentLedger.advice.updateDelivery(advice, token, { findings: fitting });
          finalFindings = [...finalFindings, ...fitting];
          final.push(advice);
        }
        if (final.length > 0) {
          // No asynchronous work may occur after runtime handoff barrier. Earlier
          // members can expire or be superseded while a later member is doing
          // its final capture, so validate ownership and authority once more
          // using one final clock reading immediately before encoding.
          const handoffNow = residentNow();
          const handoff: Array<Advice> = [];
          for (const advice of final) {
            const retained = residentAdvice().find((item) => item.id === advice.id);
            const delivery = retained === undefined ? undefined : (yield* residentLedger.advice.current(retained)).delivery;
            const ownerCurrent = retained === advice && delivery?.token === token;
            const credentialGenerationValid = advice.credentialGeneration === credentialGeneration;
            let credentialAuthorized = true;
            if (ownerCurrent && credentialGenerationValid && dispatch.credential !== null) {
              const credentialState = readCredentialState(dispatch.credential.statePath);
              credentialAuthorized = credentialState !== undefined &&
                credentialState.generation === credentialGeneration &&
                (dispatch.credential.environmentOnly || !credentialState.savedUseSuspended);
            }
            const route = residentCandidateRoute({ kind: "finalCandidateCheck", ownerCurrent,
              credentialGeneration: credentialGenerationValid, credentialAuthorized,
              expired: ownerCurrent && credentialGenerationValid && credentialAuthorized &&
                residentAdviceExpired(advice, handoffNow),
              workCurrent: ownerCurrent && credentialGenerationValid && credentialAuthorized &&
                (yield* residentIsCurrentWork(advice.revision, advice.prepared)),
              hasFindings: delivery !== undefined && delivery.findings.length > 0 });
            if (route === "ignoreCandidate") continue;
            if (route === "retireCandidate") {
              yield* residentRemoveAdvice(advice.id, token);
              continue;
            }
            if (route === "releaseCandidate") {
              yield* residentReleaseAdviceLease(advice);
              continue;
            }
            if (route !== "retainCandidate" || delivery === undefined) continue;
            yield* residentLedger.advice.updateDelivery(advice, token, { leaseUntil: handoffNow + DELIVERY_LEASE_MS });
            handoff.push(advice);
          }
          const offers = (yield* Effect.forEach(handoff, Effect.fn("ResidentRuntime.handoffOffers")(function* (advice) {
            const facts = yield* residentFindingSelectionFacts(advice, partition, credentialGeneration, handoffNow, composed);
            const { delivery } = yield* residentLedger.advice.current(advice);
            return (delivery?.findings ?? []).map((finding) => ({ advice, finding, facts }));
          }))).flat();
          const accepted = new Set(selectFittingCurrentFindingIndices(offers,
            ticket === undefined ? claudeSurface === undefined ? "codex" :
              claudeSurface === "stop" ? "claude-stop" : "claude-background" : ticket.claudeFeedbackMode,
            (index) => residentRecordOperationalFailure(offers[index]!.advice.observation,
              "output-limit", handoffNow),
            residentCollectionFindingOffer));
          let index = 0;
          for (const advice of handoff) {
            const { delivery } = yield* residentLedger.advice.current(advice);
            if (delivery === undefined) continue;
            yield* residentLedger.advice.updateDelivery(advice, token, { findings: delivery.findings.filter(() => accepted.has(index++)) });
            if ((yield* residentLedger.advice.current(advice)).delivery?.findings.length === 0) yield* residentReleaseAdviceLease(advice);
          }
          handoffFindings = (yield* Effect.forEach(handoff, (advice) => residentLedger.advice.current(advice)))
            .flatMap((content) => content.delivery?.findings ?? []);
        }
      }
      // Operational failures stay in resident diagnostics; agent output carries
      // only actionable findings.
      if (handoffFindings.length === 0) return residentResponse({ status: "empty" });
      return residentResponse(ticket === undefined
        ? { status: "advice", token, findingCount: handoffFindings.length,
            output: combinedReviewOutput(handoffFindings, []) }
        : { requestRoute: "ticketed", status: "advice", token, findingCount: handoffFindings.length,
            output: combinedClaudeOutput(handoffFindings, [], ticket.claudeFeedbackMode) });
    }).pipe(Effect.onError(() => Effect.gen(function* () {
      // A failed or interrupted collector cannot retain a lease indefinitely.
      // Revalidation's own finalizer has settled before runtime handoff is released.
      if (collectionToken !== undefined) yield* server.releaseDelivery(collectionToken);
    })));
  }));

  function residentCandidateRoute(event: Extract<CanonicalEvent, { readonly kind:
    "validationRouteCheck" | "postValidationCheck" | "finalCandidateCheck" }>):
    "ignoreCandidate" | "releaseCandidate" | "retireCandidate" | "continueCandidate" | "retainCandidate" {
    const result = residentLedger.transition(event);
    const kind = result.commands[0]?.kind;
    if (result.rejection !== undefined || result.commands.length !== 1 ||
        (kind !== "ignoreCandidate" && kind !== "releaseCandidate" && kind !== "retireCandidate" &&
          kind !== "continueCandidate" && kind !== "retainCandidate")) {
      throw new Error("invalid canonical candidate route");
    }
    return kind;
  }

  const acknowledge = Effect.fn("ResidentRuntime.acknowledge")(function* (token: string): Effect.fn.Return<ResidentResponse> {
    const now = residentNow();
    yield* residentExpirePending(now);
    residentPruneNoticeCooldowns(now);
    const advice = (yield* residentLedger.advice.snapshots()).filter(({ content }) => content.delivery?.token === token);
    const notices = residentNoticesForToken(token);
    const expired = advice.some(({ content }) => content.delivery === undefined || content.delivery.leaseUntil <= now) ||
      notices.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now);
    const decision = residentLedger.transition({ kind: "deliveryAcknowledgeCheck",
      items: advice.length + notices.length, anyExpired: expired });
    if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error("canonical acknowledgement refused");
    if (decision.commands[0]?.kind === "deliveryAckEmpty") return { status: "empty" };
    if (decision.commands[0]?.kind === "deliveryAckExpired") {
      for (const { capability: item, content } of advice) yield* residentReleaseAdviceLease(item);
      for (const item of notices) { residentNotices.release(item.id); }
      return { status: "empty" };
    }
    if (decision.commands[0]?.kind !== "deliveryAckReady") throw new Error("invalid canonical acknowledgement");
    if (!residentComposedDelivery.markSubmitted(token,
      advice.flatMap(({ capability, content }) => (content.delivery?.findings ?? []).map(() => capability.canonicalOperationId)))) {
      return { status: "empty" };
    }
    for (const { capability: item, content } of advice) {
      yield* residentLedger.advice.updateDelivery(item, token, { acknowledged: true });
    }
    for (const item of notices) residentNotices.acknowledge(item.id);
    return { status: "acknowledged" };
  }, Effect.uninterruptible);

  const finalize = Effect.fn("ResidentRuntime.finalize")(function* (token: string): Effect.fn.Return<ResidentResponse> {
    const now = residentNow();
    yield* residentExpirePending(now);
    residentPruneNoticeCooldowns(now);
    const advice = (yield* residentLedger.advice.snapshots()).filter(({ content }) => content.delivery?.token === token);
    const notices = residentNoticesForToken(token);
    const allAcknowledged = advice.every(({ content }) => content.delivery?.acknowledged === true) &&
      notices.every((item) => item.delivery?.acknowledged === true);
    const expired = advice.some(({ content }) => content.delivery === undefined || content.delivery.leaseUntil <= now) ||
      notices.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now);
    const decision = residentLedger.transition({ kind: "deliveryFinalizeCheck",
      items: advice.length + notices.length, allAcknowledged, anyExpired: expired });
    if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error("canonical finalization refused");
    if (decision.commands[0]?.kind === "deliveryFinalEmpty") return { status: "empty" };
    if (decision.commands[0]?.kind === "deliveryFinalExpired") {
      for (const { capability: item, content } of advice) yield* residentReleaseAdviceLease(item);
      for (const item of notices) { residentNotices.release(item.id); }
      return { status: "empty" };
    }
    if (decision.commands[0]?.kind !== "deliveryFinalReady") throw new Error("invalid canonical finalization");
    const composed = residentComposedDelivery.hasToken(token);
    for (const { capability: item, content } of advice) {
      const delivered = content.delivery?.findings ?? [];
      const remaining = composed ? [] : withoutDeliveredFindings(content.findings, delivered);
      const disposition = residentLedger.transition({ kind: "deliveryFindingDispositionCheck",
        composed, remaining: remaining.length });
      if (disposition.rejection !== undefined || disposition.commands.length !== 1) throw new Error("canonical finding disposition refused");
      if (disposition.commands[0]?.kind === "deliveryKeepForReoffer") {
        yield* residentReleaseAdviceLease(item);
        continue;
      }
      if (disposition.commands[0]?.kind === "deliveryRetireAdvice") {
        yield* residentLedger.ticketUnits.markAdviceDelivered(item.id);
        yield* residentRemoveAdvice(item.id, token);
        continue;
      }
      if (disposition.commands[0]?.kind !== "deliveryKeepRemaining") throw new Error("invalid canonical delivery disposition");
      yield* residentLedger.advice.revise(item, content.evaluations.map((evaluation) => ({
        ...evaluation,
        findings: withoutDeliveredFindings(evaluation.findings, delivered),
      })).filter((evaluation) => evaluation.findings.length > 0), remaining);
      yield* residentReleaseAdviceLease(item);
    }
    for (const item of notices) residentRemovePendingNotice(item.id, token);
    return { status: "finalized" };
  }, Effect.uninterruptible);

  function residentReleaseUnacknowledged(acknowledged: boolean): boolean {
    const result = residentLedger.transition({ kind: "deliveryReleaseCheck", acknowledged });
    if (result.rejection !== undefined || result.commands.length !== 1) throw new Error("canonical delivery release refused");
    if (result.commands[0]?.kind === "deliveryReleaseUnacknowledged") return true;
    if (result.commands[0]?.kind === "deliveryKeepAcknowledged") return false;
    throw new Error("invalid canonical delivery release");
  }

  const releaseDelivery = Effect.fn("ResidentRuntime.releaseDelivery")(function* (token: string) {
    for (const { capability: advice, content } of (yield* residentLedger.advice.snapshots())) {
      if (content.delivery?.token === token &&
          residentReleaseUnacknowledged(content.delivery.acknowledged)) yield* residentReleaseAdviceLease(advice);
    }
    for (const notice of residentNoticesForToken(token)) {
      if (notice.delivery?.token === token &&
          residentReleaseUnacknowledged(notice.delivery.acknowledged)) {
        residentNotices.release(notice.id);
      }
    }
  }, Effect.uninterruptible);

  const beginComposedSubmission = Effect.fn("ResidentRuntime.beginComposedSubmission")(function* (token: string, surface: "edit" | "background" | "stop"): Effect.fn.Return<ResidentResponse> {
    const now = residentNow();
    yield* residentExpirePending(now);
    const finishPermit = surface === "stop" && residentComposedDelivery.hasFinishPermit(token);
    if (finishPermit && residentComposedDelivery.isFinishAuthorized(token)) return { status: "empty" };
    if (!residentComposedDelivery.canBeginExistingToken(surface, token)) return { status: "empty" };
    const advice = (yield* residentLedger.advice.snapshots()).filter(({ content }) =>
      content.delivery?.token === token && content.delivery.leaseUntil > now &&
      content.delivery.findings.length > 0);
    const selectionValid = !finishPermit || residentComposedDelivery.finishSelectionMatches(token,
      advice.map(({ capability, content }) => ({ id: capability.id, unit: capability.canonicalOperationId,
        findings: content.delivery?.findings ?? [] })));
    let allValid = selectionValid;
    for (const { capability: item, content } of advice) {
      if (!allValid) break;
      const round = item.round;
      const delivery = content.delivery;
      const unit = item.workUnitId;
      const decision = residentLedger.transition({ kind: "deliverySubmissionCandidateCheck", facts: {
        roundActive: residentRoundActive(round),
        hasRound: round !== undefined,
        hasUnit: unit !== undefined,
        hasDelivery: delivery !== undefined,
        pendingCapacity: round !== undefined && unit !== undefined && delivery !== undefined &&
          delivery.findings.length <= residentPendingCanonicalFindings(item.canonicalOperationId),
        submissionAllowed: residentComposedDelivery.canBeginSubmission(
          adviceePartition(item.observation.root, item.observation.advicee), surface, token),
        currentWork: (yield* residentIsCurrentWork(item.revision, item.prepared)),
        credentialAuthorized: residentAdviceCredentialAuthority(item),
      } });
      if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error("canonical submission candidate refused");
      allValid = decision.commands[0]?.kind === "deliverySubmissionCandidate";
    }
    const batch = residentLedger.transition({ kind: "deliverySubmissionBatchCheck",
      count: advice.length, allValid });
    if (batch.rejection !== undefined || batch.commands.length !== 1) throw new Error("canonical submission batch refused");
    if (batch.commands[0]?.kind !== "deliveryBatchProceed") {
      yield* runtime.releaseComposedSubmission(token);
      return { status: "empty" };
    }
    if (surface === "stop") {
      const group = adviceePartition(advice[0]!.capability.observation.root, advice[0]!.capability.observation.advicee);
      if (!residentComposedDelivery.authorizeFinishOutput(group, token)) return { status: "empty" };
    }
    for (const { capability: item, content } of advice) {
      if (finishPermit) continue;
      if (!residentComposedDelivery.beginSubmission(
        item.id, adviceePartition(item.observation.root, item.observation.advicee),
        token, content.delivery?.findings ?? [], surface, now, item.canonicalOperationId,
      )) {
        yield* runtime.releaseComposedSubmission(token);
        return { status: "empty" };
      }
    }
    return { status: "submitting" };
  }, Effect.uninterruptible);

  const releaseComposedSubmission = Effect.fn("ResidentRuntime.releaseComposedSubmission")(function* (token: string): Effect.fn.Return<ResidentResponse> {
    residentComposedDelivery.release(token);
    yield* runtime.releaseDelivery(token);
    return { status: "released" };
  }, Effect.uninterruptible);

  const residentCollectionWorkCount = Effect.fn("ResidentRuntime.collectionWorkCount")(function* (root: string, advicee: DirectAdvicee, composed = false): Effect.fn.Return<number> {
    const partition = adviceePartition(root, advicee);
    const jobs = composed ? { queued: 0, running: 0 }
      : yield* residentDispatcher.snapshotWhere(({ key }) => key === partition);
    const dispatcherWork = jobs.queued + jobs.running;
    const round = composed ? yield* residentLedger.rounds.get(partition) : undefined;
    const work = composed ? round === undefined ? 0 : (yield* residentLedger.rounds.policyWork(round)).unfinished() : dispatcherWork;
    return Number(composed && residentComposedDelivery.hasPendingEdits(partition)) +
      work +
      residentAdvice().filter((item) =>
        (composed ? adviceePartition(item.observation.root, item.observation.advicee) === partition
          : item.partition === partition) && item.delivery !== undefined).length +
      [...residentNotices.entries().map(([, value]) => value)].filter((notice) =>
        (composed ? notice.deliveryGroup === partition : notice.partition === partition) && notice.pending?.delivery !== undefined).length;
  });

  const residentCollectionWorkState = Effect.fn("ResidentRuntime.collectionWorkState")(function* (root: string, advicee: DirectAdvicee, composed = false): Effect.fn.Return<{ readonly status: "pending" | "empty" }> {
    return { status: (yield* residentCollectionWorkCount(root, advicee, composed)) > 0 ? "pending" : "empty" };
  });

  function whenIdle(): Promise<void> {
    return Effect.runPromise(residentDispatcher.whenIdle());
  }

  function pendingAdviceMetadata(): ReadonlyArray<{
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
    return residentAdvice().map((advice) => ({
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

  function accountingMetrics(): {
    readonly peakLedgerBytes: number;
    readonly maxMaterializedPreparedUnits: number;
    readonly successfulCacheEntries: number;
    readonly successfulCacheBytes: number;
    readonly pendingEvaluations: number;
    readonly operationalNoticeKeys: number;
    readonly pendingOperationalNotices: number;
    readonly operationalNoticeBytes: number;
  } {
    const reuse = residentReuse.snapshot();
    return {
      peakLedgerBytes: residentLedger.runtime.snapshot().peakLedgerBytes,
      maxMaterializedPreparedUnits: residentLedger.runtime.snapshot().maxMaterializedPreparedUnits,
      successfulCacheEntries: reuse.entries,
      successfulCacheBytes: reuse.bytes,
      pendingEvaluations: reuse.pending,
      operationalNoticeKeys: residentNotices.entries().length,
      pendingOperationalNotices: residentPendingNoticeCount(),
      operationalNoticeBytes: [...residentNotices.entries().map(([, value]) => value)].reduce(
        (total, cooldown) => total + cooldown.reservation.bytes,
        0,
      ),
    };
  }

  function residentPendingNoticeCount(): number {
    let count = 0;
    for (const cooldown of residentNotices.entries().map(([, value]) => value)) {
      if (cooldown.pending !== undefined) count += 1;
    }
    return count;
  }

  function residentNoticesForToken(token: string): Array<PendingNotice> {
    const notices: Array<PendingNotice> = [];
    for (const cooldown of residentNotices.entries().map(([, value]) => value)) {
      if (cooldown.pending?.delivery?.token === token) notices.push(cooldown.pending);
    }
    return notices;
  }

  function residentRemovePendingNotice(id: string, token?: string): boolean { return residentNotices.remove(id, token); }

  function residentReleaseNoticeCooldown(key: string): void { residentNotices.drop(key); }

  function residentPruneNoticeCooldowns(now: number, exceptKey?: string): void { residentNotices.prune(now, exceptKey); }

  function residentRecordOperationalFailure(observation: DirectObservation, kind: OperationalNoticeKind, now = residentNow()): void {
    if (residentLedger.runtime.snapshot().lifecycle !== "active" || !addressableAdvicee(observation.advicee)) return;
    residentNotices.record(adviceePartition(observation.root, observation.advicee), kind, now);
  }


  const residentFindingSelectionFacts = Effect.fn("ResidentRuntime.findingSelectionFacts")(function* (
    advice: Advice, partition: string, credentialGeneration: number | null,
    now: number, composed: boolean,
  ): Effect.fn.Return<FindingSelectionFacts> {
    const partitionId = residentLedger.knownPartitionId(partition);
    if (partitionId === undefined) throw new Error("finding selection lost its resident partition identity");
    const content = yield* residentLedger.advice.current(advice);
    return {
      partition: partitionId,
      round: composed ? residentComposedDelivery.generation(partition) : 0,
      unit: advice.revision.generation,
      snapshot: advice.revision.generation,
      currentSnapshot: yield* residentLedger.revision.generation(advice.revision.subject),
      credential: advice.credentialGeneration ?? 0,
      currentCredential: credentialGeneration ?? 0,
      ageMs: Math.floor(Math.max(0, now - advice.pendingAt)),
      collectionReady: content.collectionEligible &&
        (composed && advice.round !== undefined
          ? advice.round.generation === residentComposedDelivery.generation(partition) : true),
    };
  });

  const residentRegisterRevision = Effect.fn("ResidentRuntime.registerRevision")(function* (partition: string, prepared: PreparedUnit, addMember: boolean): Effect.fn.Return<WorkRevision> {
    const { revision, replaced } = yield* residentLedger.revision.register(partition, prepared, addMember, randomUUID());
    if (replaced) yield* residentRetireSuperseded(revision.subject, revision.generation, addMember);
    return revision;
  }, Effect.uninterruptible);

  const residentRegisterCurrentWork = Effect.fn("ResidentRuntime.registerCurrentWork")((partition: string, prepared: PreparedUnit) =>
    residentRegisterRevision(partition, prepared, true));

  const residentRetireSuperseded = Effect.fn("ResidentRuntime.retireSuperseded")(function* (subject: string, generation: number, includeTickets: boolean) {
    const superseded = (revision: WorkRevision) => residentLedger.revision.superseded(subject, revision);
    if ((yield* residentLedger.revision.generation(subject)) !== generation) throw new Error("canonical revision changed");
    if (includeTickets) {
      for (const unit of (yield* residentLedger.ticketUnits.values())) {
        const revision = (yield* residentLedger.ticketUnits.current(unit)).revision;
        if (revision !== undefined && (yield* superseded(revision))) yield* residentLedger.ticketUnits.fail(unit, "stale");
      }
      for (const review of (yield* residentJoined.retireSuperseded(subject))) {
        recordActivity({ statePath: review.activityPath, root: review.observation.root,
          advicee: review.observation.advicee, lifetime: runtime.lifetime,
          stage: "unavailable", unitIdentity: review.evaluationKey });
      }
    }
    for (const advice of [...residentAdvice()]) {
      if (yield* superseded(advice.revision)) yield* residentRemoveAdvice(advice.id);
    }
  });

  const residentRestoreCurrentWork = Effect.fn("ResidentRuntime.restoreCurrentWork")((partition: string, prepared: PreparedUnit) =>
    residentRegisterRevision(partition, prepared, false));

  const residentIsCurrentWork = Effect.fn("ResidentRuntime.isCurrentWork")((revision: WorkRevision, prepared: PreparedUnit) =>
    residentLedger.revision.current(revision, prepared));

  const residentReleaseCurrentWork = Effect.fn("ResidentRuntime.releaseCurrentWork")((revision: WorkRevision) => residentLedger.revision.release(revision));

  const residentReleaseUnit = Effect.fn("ResidentRuntime.releaseUnit")(function* (job: Pick<UnitJob, "reservation" | "revision" | "released">) {
    if (job.released) return;
    job.released = true;
    residentLedger.release(job.reservation);
    yield* residentReleaseCurrentWork(job.revision);
  }, Effect.uninterruptible);

  const residentRemoveAdvice = Effect.fn("ResidentRuntime.removeAdvice")(function* (id: string, token?: string) {
    const advice = residentAdvice().find((item) => item.id === id);
    return advice !== undefined && (yield* residentLedger.advice.remove(advice,
      residentAdviceExpired(advice, residentNow()) ? "expired" : "stale", token));
  }, Effect.uninterruptible);

  const residentExpirePending = Effect.fn("ResidentRuntime.expirePending")(function* (now: number) {
    residentComposedDelivery.expire(now);
    for (const advice of [...residentAdvice()]) {
      if (residentAdviceExpired(advice, now)) yield* residentRemoveAdvice(advice.id);
    }
  }, Effect.uninterruptible);

  const sweepQuietRoundsEffect = Effect.fn("ResidentRuntime.sweepQuietRounds")(function* (now: number): Effect.fn.Return<number> {
    if (residentLedger.runtime.snapshot().lifecycle !== "active") return 0;
    yield* residentExpirePending(now);
    residentPruneNoticeCooldowns(now);
    let closedCount = 0;
    for (const [group, round] of (yield* residentLedger.rounds.entries())) {
      const work = (yield* residentDispatcher.snapshotWhere(({ value }) => value.round === round && !value.completed));
      const counts = residentComposedDelivery.closureCounts(group);
      const closed = residentComposedDelivery.tickQuietRound(group, now, {
        nativeWorkIdle: work.queued === 0 && work.running === 0,
        adviceEmpty: !residentAdvice().some((advice) => advice.round === round) &&
          ![...residentNotices.entries().map(([, value]) => value)].some((notice) => notice.partition === group),
      });
      if (closed !== undefined) {
        yield* residentCloseRound(group, closed, "quiescent", counts);
        closedCount += 1;
      }
    }
    return closedCount;
  }, Effect.uninterruptible);

  function sweepQuietRounds(now = residentNow()): number {
    return Effect.runSync(sweepQuietRoundsEffect(now));
  }

  function residentRoundActive(round: RoundWork | undefined): boolean {
    return round === undefined || (!round.controller.signal.aborted &&
      residentComposedDelivery.isActive(round.group, round.generation));
  }

  const residentAllowFinish = Effect.fn("ResidentRuntime.allowFinish")(function* (group: string, token: string, reason: RoundCloseReason): Effect.fn.Return<void> {
    const counts = residentComposedDelivery.closureCounts(group);
    const closed = residentComposedDelivery.finishStop(group, token, true,
      residentNow());
    if (closed !== undefined) yield* residentCloseRound(group, closed, reason, counts);
  }, Effect.uninterruptible);

  function residentJobActive(job: Job): boolean {
    return residentLedger.runtime.snapshot().lifecycle === "active" && !residentLifetimeController.signal.aborted &&
      !job.work?.controller.signal.aborted && residentRoundActive(job.round);
  }

  // Cutoff publication, native cancellation and discarded-job release share
  // one uninterruptible workflow; physical Jev permits still await settlement.
  const residentDiscardUnfinishedWork = Effect.fn("ResidentRuntime.discardUnfinishedWork")(function* (round: RoundWork, cancellation: {
    readonly cancelledSource: ReadonlyArray<number>; readonly cancelledJev: ReadonlyArray<number> }): Effect.fn.Return<boolean> {
    const work = (yield* residentRoundSnapshot(round)).work;
    const sourceIds = new Set(cancellation.cancelledSource);
    const unitIds = new Set(cancellation.cancelledJev);
    const named = (job: Job): boolean => job.kind === "ingress"
      ? sourceIds.has(job.canonicalObservationId)
      : unitIds.has(job.canonicalOperationId);
    const namedCounts = (yield* residentDispatcher.snapshotWhere(({ value }) => value.work === work && !value.completed && named(value)));
    const hasUnnamed = (yield* residentDispatcher.hasWorkWhere(({ value }) =>
      value.work === work && !value.completed && !named(value)));
    const replacement = yield* residentLedger.rounds.replaceWork(round,
      { id: randomUUID(), controller: new AbortController() }, {
        named: namedCounts,
        all: (yield* residentDispatcher.snapshotWhere(({ value }) => value.work === work && !value.completed)),
        cancelled: sourceIds.size + unitIds.size, hasUnnamed,
      });
    if (replacement === undefined) throw new Error("native work cutoff lost its round capability");
    const { matched, previousWork } = replacement;
    previousWork.controller.abort();
    const discarded = (yield* residentDispatcher.discardWhere(({ value }) => value.work === work && (named(value) || !matched)));
    for (const job of discarded) yield* residentDiscardJob(job);
    return matched;
  }, Effect.uninterruptible);

  const residentDiscardJob = Effect.fn("ResidentRuntime.discardJob")(function* (job: Job) {
    if (job.completed) return;
    if (job.kind === "ingress") {
      residentLedger.observation(job.partition, job.canonicalObservationId, "interruptObservation", job.canonicalRound);
    }
    if (job.kind === "unit") {
      if (job.ticketUnit !== undefined) yield* residentLedger.ticketUnits.fail(job.ticketUnit, "lost");
      yield* residentSettleJoined(job.evaluationKey, "unavailable", "lost");
      yield* residentReleaseReuseClaim(job.evaluationKey);
      // An issued Jev permit remains reserved until its native Effect settles.
      if (job.requestId === undefined) yield* residentReleaseUnit(job);
    } else residentLedger.release(job.reservation);
    recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
      advicee: job.observation.advicee, lifetime: runtime.lifetime, stage: "incomplete" });
  }, Effect.uninterruptible);

  const residentCloseRound = Effect.fn("ResidentRuntime.closeRound")(function* (group: string, generation: number, reason: RoundCloseReason,
    counts: ReturnType<ComposedDelivery["closureCounts"]>): Effect.fn.Return<void> {
    // finishStop can release an unwritten provisional slot after callers took
    // the pre-cleanup snapshot. Report the final Bend reservation count.
    const reservedContinuations = residentComposedDelivery.closureCounts(group).reservedContinuations;
    const round = (yield* residentLedger.rounds.get(group));
    const snapshot = round === undefined ? undefined : yield* residentRoundSnapshot(round);
    const activity = snapshot?.activity;
    const work = round === undefined ? { queued: 0, running: 0 }
      : (yield* residentDispatcher.snapshotWhere(({ value }) => value.round === round && !value.completed && !value.work?.controller.signal.aborted));
    if (activity !== undefined) recordRoundClosure({ statePath: activity.activityPath,
      root: activity.root, advicee: activity.advicee, lifetime: runtime.lifetime,
      roundIdentity: `${group}:${round?.canonicalRound ?? generation}`, reason, reservedContinuations,
      discarded: { queued: work.queued + (snapshot?.discarded.queued ?? 0),
        running: work.running + (snapshot?.discarded.running ?? 0), pendingAdvice: round === undefined ? 0 : residentAdvice().filter((advice) => advice.round === round).length,
        submitted: counts.submitted, uncertain: counts.uncertain, editPermits: counts.editPermits } });
    if (round === undefined || round.generation !== generation) return;
    // The admission/output fence is already published. Abort Effect fibers and
    // their provider connections before releasing all retained round resources.
    if (snapshot === undefined) throw new Error("native round closure lost its snapshot");
    round.controller.abort();
    snapshot.work.controller.abort();
    const discarded = (yield* residentDispatcher.discardWhere(({ value }) => value.round === round));
    for (const job of discarded) yield* residentDiscardJob(job);
    for (const advice of [...residentAdvice()]) if (advice.round === round) yield* residentRemoveAdvice(advice.id);
    for (const [key, notice] of residentNotices.entries()) {
      if (notice.partition === round.group) residentReleaseNoticeCooldown(key);
    }
    residentReuse.discardPartition(round.group);
    yield* residentLedger.tickets.discardPartition(round.group);
    yield* residentLedger.rounds.retire(round);
  }, Effect.uninterruptible);

  const residentRun = Effect.fn("ResidentRuntime.run")((job: Job, sequence: number) =>
    job.kind === "ingress" ? residentPrepare(job, sequence)
      : residentEvaluateUnit(job, sequence));

  const residentObserveDispatchAuthority = Effect.fn("ResidentRuntime.observeDispatchAuthority")(function* (
    job: UnitJob,
    details: DispatchAuthorityObservationDetails,
  ): Effect.fn.Return<void> {
    const observer = residentDispatchAuthorityObserver;
    if (observer === undefined) return;
    const observation: DispatchAuthorityObservation = {
      kind: "dispatchAuthority",
      sequence: yield* residentLedger.runtime.nextAuthoritySequence(),
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
  });

  function residentObserveJevRequest(observation: JevRequestObservation): void {
    try { residentJevRequestObserver?.(observation); } catch {
      // Fixture observation must not change request execution.
    }
  }

  const residentPrepare = Effect.fn("ResidentRuntime.prepare")((job: IngressJob, sequence: number) => {
    const server = runtime;
    const expectedActivityUnits: Array<string> = [];
    const unassignedClaims = new Set<string>();
    const activeWorkspaces = new Set<CapacityReservation>();
    return Effect.gen(function* () {
      if (job.round !== undefined && job.workObservationId !== undefined &&
          !(yield* residentLedger.rounds.policyWork(job.round)).startSource(job.workObservationId)) {
        residentLedger.release(job.reservation);
        return;
      }
      if (!residentLedger.observation(job.partition, job.canonicalObservationId, "startObservation", job.canonicalRound)) {
        residentLedger.release(job.reservation);
        return;
      }
      yield* residentAwaitBackendGate();
      if (residentLedger.runtime.snapshot().lifecycle !== "active") {
        residentLedger.release(job.reservation);
        return;
      }
      const userConfigPath = job.dispatch.userConfigPath ?? undefined;
      const controlled = decodeControlledOptions(job.dispatch.controlled);
      const settings = yield* withinWork(Effect.gen(function* () {
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
        job.work?.controller.signal ?? residentLifetimeController.signal);
      residentLedger.release(job.reservation);
      if (settings === undefined || residentLedger.runtime.snapshot().lifecycle !== "active" || !residentJobActive(job)) {
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable" });
        return;
      }

      // A candidate path is captured and analyzed only while its maximum
      // supported logical workspace is charged. Processing candidates one at
      // a time prevents a 16-path event from materializing 1,024 complete
      // inputs outside the ledger.
      for (const candidate of job.observation.candidates) {
        if (!residentJobActive(job)) return;
        const preparation = residentLedger.beginObservedPreparation(
          job.partition, job.canonicalObservationId, captureWorkspaceBytes(candidate.path), job.canonicalRound);
        if (preparation === undefined) {
          yield* residentLedger.runtime.rejectCapacity();
          recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable" });
          continue;
        }
        const workspace = preparation.reservation;
        activeWorkspaces.add(workspace);
        const pathObservation: DirectObservation = { ...job.observation, candidates: [candidate] };
        const prepared: PreparedObservation = yield* withinWork(Effect.gen(function* () {
            return yield* prepareObservation(pathObservation, {
              controlledWriter: true,
              advicee: pathObservation.advicee,
              settings,
              ...(residentCaptureSource === undefined ? {} : { captureSource: residentCaptureSource }),
              beforeAnalyze: (path, sourceBytes, preflight) => Effect.gen(function* () {
                const required = analysisWorkspaceBytes(path, sourceBytes, preflight, settings.rules);
                const resized = residentLedger.resize(workspace, required);
                if (!resized) yield* residentLedger.runtime.rejectCapacity();
                return resized;
              }),
            });
          }),
        job.work?.controller.signal ?? residentLifetimeController.signal).pipe(Effect.onError(() => Effect.sync(() => { residentLedger.release(workspace); })));
        if (!residentJobActive(job)) { residentLedger.release(workspace); return; }
        const ready = prepared.outcomes.flatMap((outcome) => {
          const offer = residentLedger.preparedOffer(outcome.status === "ready", true);
          return offer === "preparedAdmitted" && outcome.status === "ready" ? [outcome] : [];
        });
        if (ready.length === 0) {
          recordActivity({
            statePath: job.dispatch.activityPath,
            root: job.observation.root,
            advicee: job.observation.advicee,
            lifetime: server.lifetime,
            stage: prepared.observation.status === "incomplete" ? "incomplete" : "skipped",
          });
        }
        yield* residentLedger.runtime.observePreparedUnits(ready.length);
        let rejectedDeliverable = false;
        const deliverable: typeof ready = [];
        for (const outcome of ready) {
          const accepted = residentLedger.preparedOffer(true,
            residentUnitWorstOutcomeBytes(outcome.prepared) <= MAX_IPC_FRAME_BYTES - 1024) === "preparedAdmitted";
          if (!accepted) {
            yield* residentLedger.runtime.rejectCapacity();
            rejectedDeliverable = true;
          }
          if (accepted) deliverable.push(outcome);
        }
        const planned = yield* Effect.forEach(deliverable, Effect.fn("ResidentRuntime.planPreparedUnit")(function* (outcome) {
          const generationPartition = `${job.partition}\0work:${job.work?.id ?? "standalone"}\0credential-generation:${job.dispatch.credential?.generation ?? "controlled"}`;
          const evaluationKey = residentReuse.key(generationPartition, outcome.prepared);
          const liveAdvice = residentAdvice().some((advice) => advice.evaluationKey === evaluationKey);
          switch (residentReuse.route(evaluationKey, liveAdvice)) {
            case "joinedAdvice":
              return { kind: "joined" as const, join: "advice" as const, outcome, evaluationKey };
            case "joinedClaimed":
              return { kind: "joined" as const, join: "claimed" as const, outcome, evaluationKey };
            case "joinedPending": {
              const pending = residentReuse.pending(evaluationKey);
              if (pending === undefined) throw new Error("canonical reuse route lacks pending evaluation");
              pending.revision = yield* residentRestoreCurrentWork(job.partition, outcome.prepared);
              return { kind: "joined" as const, join: "pending" as const, outcome, evaluationKey };
            }
            case "cached":
              return { kind: "cached" as const, outcome, evaluationKey,
                cached: residentReuse.cached(evaluationKey) };
            case "owner":
              unassignedClaims.add(evaluationKey);
              return { kind: "owner" as const, outcome, evaluationKey };
          }
        }));
        if (planned.some((item) => item.kind === "owner")) {
          yield* withinWork(residentPreparationControls.afterReuseBoundary("ownerClaimed").pipe(
            Effect.mapError(() => new ResidentAdapterError({ operation: "owner claim barrier" }))),
          job.work?.controller.signal ?? residentLifetimeController.signal);
        }
        if (!residentJobActive(job)) { residentLedger.release(workspace); return; }
        const ticketUnitsByPlan = new Map<(typeof planned)[number], TicketUnit>();
        const retained = planned.filter((item) =>
          item.kind === "owner" || (item.kind === "cached" && item.cached.evaluation.findings.length > 0));
        const reservations = residentLedger.completePreparation(
          job.partition, preparation.operation, workspace,
          retained.map((item) =>
            residentUnitReservationBytes(pathObservation, job.dispatch, item.outcome.prepared)),
          job.canonicalRound,
        );
        activeWorkspaces.delete(workspace);
        // Workspace has been released and all accepted unit reservations are
        // fixed, so best-effort notice retention cannot displace fresh work.
        if (rejectedDeliverable) {
          residentRecordOperationalFailure(job.observation, "capacity");
          recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable" });
        }
        for (const item of planned) {
          const ticketUnit = job.ticket === undefined ? undefined : yield* residentLedger.ticketUnits.add(job.ticket);
          if (ticketUnit !== undefined) {
            ticketUnitsByPlan.set(item, ticketUnit);
          }
          if (item.kind === "cached" && item.cached.evaluation.findings.length === 0) {
            const revision = yield* residentRegisterCurrentWork(job.partition, item.outcome.prepared);
            if (ticketUnit !== undefined) yield* residentLedger.ticketUnits.clear(ticketUnit, revision);
            yield* residentReleaseCurrentWork(revision);
            expectedActivityUnits.push(item.evaluationKey);
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "clear", unitIdentity: item.evaluationKey });
          } else if (item.kind === "joined") {
            const existing = residentAdvice().find((advice) => advice.evaluationKey === item.evaluationKey);
            if (existing !== undefined) {
              residentRecordJoinedOutcomes(yield* residentLedger.advice.publish(existing, ticketUnit), existing.id);
              recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
                advicee: job.observation.advicee, lifetime: server.lifetime, stage: "findings",
                findings: existing.findings.length, unitIdentity: item.evaluationKey });
            } else {
              const pending = residentReuse.pending(item.evaluationKey);
              if (pending === undefined && item.join !== "claimed") {
                if (ticketUnit !== undefined) yield* residentLedger.ticketUnits.fail(ticketUnit, "lost");
                recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
                  advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable",
                  unitIdentity: item.evaluationKey });
              } else {
                const joined: JoinedReview = { admission: job.canonicalObservationId,
                  evaluationKey: item.evaluationKey, observation: pathObservation,
                  activityPath: job.dispatch.activityPath,
                  ...(ticketUnit === undefined ? {} : { ticketUnit }),
                  ...(pending === undefined ? {} : { revision: pending.revision }) };
                yield* residentJoined.append(joined);
                expectedActivityUnits.push(item.evaluationKey);
              }
            }
          }
        }
        if (planned.some((item) => item.kind === "joined" && item.join === "claimed")) {
          yield* withinWork(residentPreparationControls.afterReuseBoundary("claimJoined").pipe(
            Effect.mapError(() => new ResidentAdapterError({ operation: "joined claim barrier" }))),
          job.work?.controller.signal ?? residentLifetimeController.signal);
        }
        for (const [index, item] of retained.entries()) {
          if (!residentJobActive(job)) {
            for (let remaining = index; remaining < retained.length; remaining++) {
              const admitted = reservations[remaining];
              if (admitted !== undefined) residentLedger.release(admitted.reservation);
              const pending = retained[remaining];
              if (pending?.kind === "owner") yield* residentReleaseReuseClaim(pending.evaluationKey);
            }
            return;
          }
          const ticketUnit = ticketUnitsByPlan.get(item);
          const admitted = reservations[index];
          if (admitted === undefined) {
            if (ticketUnit !== undefined) yield* residentLedger.ticketUnits.fail(ticketUnit, "capacity");
            if (item.kind === "owner") yield* residentReleaseReuseClaim(item.evaluationKey, "capacity");
            yield* residentLedger.runtime.rejectCapacity();
            residentRecordOperationalFailure(job.observation, "capacity");
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable" });
            continue;
          }
          const reservation = admitted.reservation;
          const revision = yield* residentRegisterCurrentWork(job.partition, item.outcome.prepared);
          if (ticketUnit !== undefined) yield* residentLedger.ticketUnits.revise(ticketUnit, revision);
          const workUnitId = job.round === undefined || job.workObservationId === undefined ? undefined
            : item.kind === "cached"
              ? (yield* residentLedger.rounds.policyWork(job.round)).cachedFinding(job.workObservationId,
                item.cached.evaluation.findings.length, logicalBytes(item.cached.evaluation.findings), admitted.operation)
              : (yield* residentLedger.rounds.policyWork(job.round)).spawn(job.workObservationId, admitted.operation);
          if (job.round !== undefined && workUnitId === undefined) {
            if (ticketUnit !== undefined) yield* residentLedger.ticketUnits.fail(ticketUnit, "lost");
            if (item.kind === "owner") yield* residentReleaseReuseClaim(item.evaluationKey);
            residentLedger.release(reservation);
            yield* residentReleaseCurrentWork(revision);
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
            if (!residentLedger.startReview(job.partition, admitted.operation, job.canonicalRound) ||
                !residentLedger.completeReview(job.partition, admitted.operation, reservation, "finding", job.canonicalRound)) {
              throw new Error("canonical cached review settlement refused");
            }
            recordActivity({
              statePath: job.dispatch.activityPath,
              root: job.observation.root,
              advicee: job.observation.advicee,
              lifetime: server.lifetime,
              stage: "findings",
              findings: item.cached.evaluation.findings.length,
              unitIdentity: item.evaluationKey,
            });
            yield* residentRetainAdvice(unit, {
              prepared: item.outcome.prepared, findings: item.cached.evaluation.findings,
            }, sequence).pipe(Effect.ensuring(Effect.gen(function* () {
              if (!unit.completed && job.round !== undefined && workUnitId !== undefined) {
                (yield* residentLedger.rounds.policyWork(job.round)).retire(workUnitId);
                yield* residentReleaseUnit(unit);
              }
            })));
            continue;
          }
          if (!(yield* residentJoined.attachOwner(item.evaluationKey, unit, revision))) {
            throw new Error("canonical evaluation attachment refused");
          }
          unassignedClaims.delete(item.evaluationKey);
          if (!(yield* residentDispatcher.enqueue(job.partition, unit))) {
            if (ticketUnit !== undefined) yield* residentLedger.ticketUnits.fail(ticketUnit, "capacity");
            yield* residentReleaseReuseClaim(item.evaluationKey, "capacity");
            yield* residentReleaseUnit(unit);
            yield* residentLedger.runtime.rejectCapacity();
            residentRecordOperationalFailure(job.observation, "capacity");
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable", unitIdentity: item.evaluationKey });
          }
        }
      }
      if (expectedActivityUnits.length > 0) {
        recordActivity({
          statePath: job.dispatch.activityPath,
          root: job.observation.root,
          advicee: job.observation.advicee,
          lifetime: server.lifetime,
          stage: "pending",
          expectedUnitIdentities: expectedActivityUnits,
        });
      }
      if (job.round !== undefined && job.workObservationId !== undefined &&
          !(yield* residentLedger.rounds.policyWork(job.round)).completeSource(job.workObservationId)) {
        throw new Error("Bend denied source completion");
      }
      if (!residentLedger.observation(job.partition, job.canonicalObservationId, "completeObservation", job.canonicalRound)) {
        throw new Error("canonical observation completion refused");
      }
      job.completed = true;
      yield* withinWork(residentPreparationControls.afterPrepare.pipe(
        Effect.mapError(() => new ResidentAdapterError({ operation: "preparation barrier" }))),
      job.work?.controller.signal ?? residentLifetimeController.signal);
      return;
    }).pipe(
      Effect.catch(() => Effect.sync(() => {
        if (runtimeConfiguration.debug) console.error("resident preparation unavailable");
        residentLedger.release(job.reservation);
        if (residentLedger.runtime.snapshot().lifecycle === "active") recordActivity({ statePath: job.dispatch.activityPath,
          root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime,
          stage: "unavailable" });
      })),
      Effect.ensuring(Effect.gen(function* () {
        residentLedger.release(job.reservation);
        for (const workspace of activeWorkspaces) residentLedger.release(workspace);
        for (const key of unassignedClaims) yield* residentReleaseReuseClaim(key);
        if (!job.completed) residentLedger.observation(job.partition, job.canonicalObservationId, "interruptObservation", job.canonicalRound);
      })),
    );
  });

  const residentEvaluateUnit = Effect.fn("ResidentRuntime.evaluateUnit")((job: UnitJob, sequence: number) => Effect.suspend(() => {
    const server = runtime;
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
      residentObserveJevRequest({ ...requestIdentity, stage,
        ...(request === undefined ? {} : { request }),
        ...(outcome === undefined ? {} : { outcome }) });
    };
    const signal = job.work?.controller.signal ?? residentLifetimeController.signal;
    const requestReady = (facts: { readonly rootValid: boolean; readonly configurationValid: boolean;
      readonly credentialReady: boolean; readonly selected: boolean; readonly currentWork: boolean;
      readonly physicalAvailable: boolean }) => {
      readyReported = true;
      const decision = residentLedger.readyJevRequest(job.partition,
        job.canonicalOperationId, job.reservation, facts, job.canonicalRound);
      if (decision.status !== "stale") requestIdentity = {
        partition: job.partition,
        canonicalPartition: residentLedger.partitionId(job.partition),
        lifetime: residentLedger.residentLifetime,
        canonicalLifetime: residentLedger.canonicalLifetime,
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
      interruptionReported = residentLedger.interruptJevRequest(job.partition,
        job.canonicalOperationId, issuedRequest);
      if (interruptionReported) observeRequest("interrupted", issuedRequest);
    };
    return Effect.gen(function* () {
      if (job.round !== undefined && job.workUnitId !== undefined &&
          !(yield* residentLedger.rounds.policyWork(job.round)).startUnit(job.workUnitId)) {
        yield* residentReleaseReuseClaim(job.evaluationKey);
        yield* residentReleaseUnit(job);
        return;
      }
      if (!residentLedger.startReview(job.partition, job.canonicalOperationId, job.canonicalRound)) {
        yield* residentReleaseReuseClaim(job.evaluationKey);
        yield* residentReleaseUnit(job);
        return;
      }
      yield* residentAwaitBackendGate();
      if (!residentJobActive(job) || !(yield* residentIsCurrentWork(job.revision, job.prepared))) {
        denyReady();
        if (job.ticketUnit !== undefined) yield* residentLedger.ticketUnits.fail(job.ticketUnit, "stale");
        yield* residentSettleJoined(job.evaluationKey, "unavailable", "stale");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "incomplete", unitIdentity: job.evaluationKey });
        yield* residentReleaseReuseClaim(job.evaluationKey);
        yield* residentReleaseUnit(job);
        return;
      }
      yield* residentAdapter("evaluation barrier", () => Promise.resolve(residentBeforeEvaluate?.(job.prepared)));
      const userConfigPath = job.dispatch.userConfigPath ?? undefined;
      const controlled = decodeControlledOptions(job.dispatch.controlled);
      const offlineHttpClient = residentOfflineHttpClient;
      const controlledRequestEffect = residentControlledRequestEffect;
      const isCurrentWork = () => residentIsCurrentWork(job.revision, job.prepared);
      const isJobActive = () => residentJobActive(job);
      const observeDispatchAuthority = (details: DispatchAuthorityObservationDetails) =>
        residentObserveDispatchAuthority(job, details);
      const result = yield* withinWork(Effect.gen(function* () {
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
        yield* residentDispatchControls.atBoundary("authorized").pipe(
          Effect.mapError(() => new ResidentAdapterError({ operation: "authorization barrier" })));
        const credential = !credentialRequired || dispatchCredential === null
          ? undefined
          : yield* residentAdapter("resolve dispatch credential", () => resolveCredential({
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
        yield* residentDispatchControls.atBoundary("credentialResolved").pipe(
          Effect.mapError(() => new ResidentAdapterError({ operation: "credential barrier" })));
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
          yield* observeDispatchAuthority({
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
        yield* observeDispatchAuthority({
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
            selected: selected && unitCurrent, currentWork: yield* isCurrentWork(),
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
                onRequest: physicalRequest("controlled provider request", controlledRequestEffect).pipe(Effect.orDie),
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
            if (!residentLedger.startJevRequest(job.partition,
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
        signal);
      if (result?.status === "notAuthorized") {
        if (job.ticketUnit !== undefined) yield* residentLedger.ticketUnits.fail(job.ticketUnit,
          result.reason === "credential" ? "credential" : "lost");
        yield* residentSettleJoined(job.evaluationKey, "unavailable",
          result.reason === "credential" ? "credential" : "lost");
        if (result.reason === "credential") residentRecordOperationalFailure(job.observation, "credential");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
          advicee: job.observation.advicee, lifetime: server.lifetime,
          stage: "unavailable", unitIdentity: job.evaluationKey });
        yield* residentReleaseReuseClaim(job.evaluationKey);
        yield* residentReleaseUnit(job);
        return;
      }
      if (!residentJobActive(job) && issuedRequest === undefined) {
        yield* residentReleaseReuseClaim(job.evaluationKey); yield* residentReleaseUnit(job); return;
      }
      if (result?.status === "evaluated") {
        if (residentJobActive(job) && residentLedger.runtime.snapshot().lifecycle === "active" &&
            job.round !== undefined && job.workUnitId !== undefined &&
            !(yield* residentLedger.rounds.policyWork(job.round)).outcome(job.workUnitId, result.findings.length === 0
              ? { $: "Clear" }
              : { $: "Finding", count: result.findings.length, bytes: logicalBytes(result.findings) })) {
          throw new Error("Bend denied review outcome");
        }
        const currentWork = residentLedger.runtime.snapshot().lifecycle === "active" && residentJobActive(job) &&
          (yield* residentIsCurrentWork(job.revision, job.prepared));
        if (issuedRequest === undefined || !requestStarted) {
          throw new Error("Jev result without a matching canonical request command and start");
        }
        const disposition = residentLedger.settleJevRequest(job.partition, job.canonicalOperationId,
          issuedRequest, job.reservation,
          result.findings.length === 0 ? "clear" : "finding", currentWork);
        requestSettled = true;
        observeRequest("settled", issuedRequest,
          result.findings.length === 0 ? "clear" : "finding");
        if (disposition === "ignored" || disposition === "stale") {
          yield* residentReleaseReuseClaim(job.evaluationKey);
          yield* residentReleaseUnit(job);
          return;
        }
        recordDemoTrace(job.dispatch.demoBudgetPath, job.observation.root, job.observation.advicee, {
          kind: "terminal", ...(job.sourceHash === undefined ? {} : { sourceHash: job.sourceHash }),
          state: result.findings.length === 0 ? "clear" : "findings",
        });
        const evaluation = { prepared: job.prepared, findings: result.findings };
        residentReuse.put(job.partition, job.evaluationKey, evaluation);
        yield* residentReleaseReuseClaim(job.evaluationKey);
        recordActivity({
          statePath: job.dispatch.activityPath,
          root: job.observation.root,
          advicee: job.observation.advicee,
          lifetime: server.lifetime,
          stage: result.findings.length === 0 ? "clear" : "findings",
          findings: result.findings.length,
          unitIdentity: job.evaluationKey,
        });
        const recordOutcome = Effect.fn("ResidentRuntime.recordControlledOutcome")(function* () {
          if (controlled?.outcomePath === undefined) return;
          const { sessionId, turnId, toolUseId, subagentId } = job.observation.advicee;
          yield* residentAdapter("record controlled outcome", () => appendFile(controlled.outcomePath ?? "", `${JSON.stringify({
            sessionId, turnId, toolUseId, subagentId,
            outcome: result.findings.length === 0 ? "completed-clear" : "completed-findings",
          })}\n`, "utf8"));
        });
        if (disposition !== "retainFinding") {
          if (disposition === "retireStaleFinding" &&
              job.round !== undefined && job.workUnitId !== undefined) {
            (yield* residentLedger.rounds.policyWork(job.round)).retire(job.workUnitId);
          }
          if (job.ticketUnit !== undefined) {
            if (disposition === "settleClear") {
              yield* residentLedger.ticketUnits.clear(job.ticketUnit, job.revision);
            } else yield* residentLedger.ticketUnits.fail(job.ticketUnit, "stale");
          }
          yield* residentSettleJoined(job.evaluationKey,
            disposition === "settleClear" ? "clear" : "unavailable",
            "stale");
          job.completed = true;
          yield* residentReleaseUnit(job);
          yield* recordOutcome();
          return;
        }
        yield* residentRetainAdvice(job, evaluation, sequence);
        yield* recordOutcome();
        return;
      }
      if (signal?.aborted) reportInterruption();
      const observed = issuedRequest === undefined ? undefined
        : signal?.aborted && requestStarted && interruptionReported ? "interrupted"
        : !requestStarted ? "neverSent"
        : result?.status === "timeout" ? "timeout" : "backendFailure";
      const failure = residentLedger.reviewFailure(
        observed === "backendFailure" || observed === "timeout" ||
          (issuedRequest === undefined && (result?.status === "backend" || result?.status === "timeout")),
        false, observed === "neverSent" || observed === "interrupted" || result === undefined);
      if (issuedRequest === undefined) {
        if (!residentLedger.completeReview(job.partition, job.canonicalOperationId,
          job.reservation, "unavailable", job.canonicalRound)) return;
      } else {
        residentLedger.settleJevRequest(job.partition, job.canonicalOperationId,
          issuedRequest, job.reservation, observed ?? "neverSent", false);
        requestSettled = true;
        observeRequest("settled", issuedRequest, observed ?? "neverSent");
      }
      if (failure === "failureBackend") {
        if (job.ticketUnit !== undefined) yield* residentLedger.ticketUnits.fail(job.ticketUnit, "backend");
        yield* residentSettleJoined(job.evaluationKey, "unavailable", "backend");
        residentRecordOperationalFailure(job.observation, "backend");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (failure === "failureCredential") {
        if (job.ticketUnit !== undefined) yield* residentLedger.ticketUnits.fail(job.ticketUnit, "credential");
        yield* residentSettleJoined(job.evaluationKey, "unavailable", "credential");
        residentRecordOperationalFailure(job.observation, "credential");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (failure === "failureLost") {
        if (job.ticketUnit !== undefined) yield* residentLedger.ticketUnits.fail(job.ticketUnit, "lost");
        yield* residentSettleJoined(job.evaluationKey, "unavailable", "lost");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (failure !== "failureNone") {
        throw new Error("Bend denied review failure disposition");
      }
    }).pipe(
      // Observe every failed exit, including interruption, before releasing the
      // native job. Typed adapter failures have a truthful unavailable outcome;
      // invariant defects and scope interruption remain visible in the fiber.
      Effect.onError(() => Effect.gen(function* () {
        if (!readyReported && residentLedger.canonicalProjection().work.some((entry) =>
          entry.operation === job.canonicalOperationId && entry.kind === "reviewing")) {
          denyReady();
        }
        if (issuedRequest !== undefined && !requestSettled) {
          if (signal?.aborted) reportInterruption();
          const observed = signal?.aborted && requestStarted && interruptionReported
            ? "interrupted" : requestStarted ? "backendFailure" : "neverSent";
          residentLedger.settleJevRequest(job.partition, job.canonicalOperationId,
            issuedRequest, job.reservation, observed, false);
          requestSettled = true;
          observeRequest("settled", issuedRequest, observed);
        }
        if (job.ticketUnit !== undefined) yield* residentLedger.ticketUnits.fail(job.ticketUnit, "backend");
        yield* residentSettleJoined(job.evaluationKey, "unavailable", "backend");
        if (runtimeConfiguration.debug) console.error("resident evaluation unavailable");
        if (residentLedger.runtime.snapshot().lifecycle === "active") recordActivity({ statePath: job.dispatch.activityPath,
          root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime,
          stage: "unavailable", unitIdentity: job.evaluationKey });
      })),
      Effect.catch(() => Effect.void),
      Effect.ensuring(Effect.gen(function* () {
        signal.removeEventListener("abort", reportInterruption);
        if (!job.completed) {
          yield* residentReleaseReuseClaim(job.evaluationKey);
          yield* residentReleaseUnit(job);
        }
      })),
    );
  }));

  const residentReleaseReuseClaim = Effect.fn("ResidentRuntime.releaseReuseClaim")(function* (key: string, reason: ResidentUnavailableReason = "lost") {
    for (const review of (yield* residentJoined.releaseOwner(key, reason))) {
      recordActivity({ statePath: review.activityPath, root: review.observation.root,
        advicee: review.observation.advicee, lifetime: runtime.lifetime,
        stage: "unavailable", unitIdentity: review.evaluationKey });
    }
  }, Effect.uninterruptible);

  const residentSettleJoined = Effect.fn("ResidentRuntime.settleJoined")(function* (key: string, state: "pending" | "clear" | "unavailable", reason?: ResidentUnavailableReason,
    adviceId?: string) {
    residentRecordJoinedOutcomes(yield* residentJoined.settle(key, state, reason, adviceId), adviceId);
  }, Effect.uninterruptible);

  function residentRecordJoinedOutcomes(outcomes: ReadonlyArray<JoinedReviewOutcome>, adviceId?: string): void {
    for (const { review, stage } of outcomes) {
      recordActivity({ statePath: review.activityPath,
        root: review.observation.root, advicee: review.observation.advicee,
        lifetime: runtime.lifetime, stage,
        ...(stage !== "findings" ? {} : {
          findings: residentAdvice().find((item) => item.id === adviceId)?.findings.length ?? 0,
        }), unitIdentity: review.evaluationKey });
    }
  }

  const residentRetainAdvice = Effect.fn("ResidentRuntime.retainAdvice")((
    job: UnitJob, evaluation: EvaluatedUnit, sequence: number,
  ) => {
    const server = runtime;
    return Effect.gen(function* () {
      if (!residentJobActive(job)) {
        if (job.round !== undefined && job.workUnitId !== undefined) (yield* residentLedger.rounds.policyWork(job.round)).retire(job.workUnitId);
        yield* residentReleaseUnit(job);
        return;
      }
      if (residentAdvice().some((item) => item.evaluationKey === job.evaluationKey)) {
        const existing = residentAdvice().find((item) => item.evaluationKey === job.evaluationKey);
        if (existing !== undefined) residentRecordJoinedOutcomes(
          yield* residentLedger.advice.publish(existing, job.ticketUnit, job.revision), existing.id);
        if (job.round !== undefined && job.workUnitId !== undefined) (yield* residentLedger.rounds.policyWork(job.round)).retire(job.workUnitId);
        yield* residentReleaseUnit(job);
        return;
      }
      const advice = yield* residentLedger.advice.insert({
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
        pendingAt: residentNow(),
      });
      job.completed = true;
      if (residentAfterAdvicePending !== undefined) {
        yield* residentAdapter("pending advice barrier", () => Promise.resolve(residentAfterAdvicePending?.(advice.id)));
        if (!residentJobActive(job)) return;
      }
      residentRecordJoinedOutcomes(yield* residentLedger.advice.publish(advice, job.ticketUnit, job.revision), advice.id);
    });
  });

  const residentAwaitBackendGate = Effect.fn("ResidentRuntime.awaitBackendGate")(() => {
    const server = runtime;
    return Effect.gen(function* () {
      const configured = yield* Config.option(Config.String("REVIEW_RESIDENT_BACKEND_GATE_PATH"));
      if (Option.isNone(configured)) return;
      yield* residentAdapter("observe backend gate", () => access(configured.value)).pipe(
        Effect.as(true), Effect.catch(() => Effect.succeed(residentLifetimeController.signal.aborted)),
        Effect.repeat({ schedule: Schedule.spaced("10 millis"), until: (ready) => ready }),
      );
    }).pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "configure backend gate" })));
  });

  const residentRevalidate = Effect.fn("ResidentRuntime.revalidate")((advice: Advice, dispatch: ResidentDispatchContext) => Effect.gen(function* () {
    const server = runtime;
    const candidate = advice.observation.candidates[0];
    if (candidate === undefined) return { status: "unavailable" as const, findings: [] };
    const capture = yield* residentLedger.adviceCaptures.start(
      advice.reservation, advice.revision, captureWorkspaceBytes(candidate.path),
    );
    if (capture === undefined) return { status: "unavailable" as const, findings: [] };
    let capacityUnavailable = false;
    return yield* Effect.gen(function* () {
      const content = yield* residentLedger.advice.current(advice);
      yield* residentAdapter("revalidation barrier", () => Promise.resolve(residentAfterRevalidationWorkspaceReserved?.(advice.id)));
      const userConfigPath = dispatch.userConfigPath ?? undefined;
      const current = yield* withinWork(Effect.gen(function* () {
        const settings = yield* loadReviewSettings(
          advice.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        return yield* revalidateEvaluations(advice.observation, content.evaluations, {
          controlledWriter: true,
          advicee: advice.observation.advicee,
          settings,
          beforeAnalyze: (path, sourceBytes, preflight) => Effect.gen(function* () {
            const required = analysisWorkspaceBytes(path, sourceBytes, preflight, settings.rules);
            const resized = yield* residentLedger.adviceCaptures.resize(capture, required);
            if (resized) {
            } else capacityUnavailable = true;
            return resized;
          }),
        }, {
          isCurrentWork: (prepared) => residentIsCurrentWork(advice.revision, prepared),
        });
      }),
        advice.round?.controller.signal ?? residentLifetimeController.signal);
      return capacityUnavailable ? { status: "unavailable" as const, findings: [] } : current;
    }).pipe(
      Effect.catch(() => Effect.succeed<RevalidationResult>({ status: "unavailable", findings: [] })),
      Effect.ensuring(residentLedger.adviceCaptures.finish(capture)),
    );
  }));

  function handle(request: ResidentRequest): Promise<ResidentResponse> {
    return Effect.runPromise(residentHandle(request));
  }

  const residentHandle = Effect.fn("ResidentRuntime.handle")((request: ResidentRequest) => {
    const server = runtime;
    return Effect.gen(function* () {
      if (request.operation === "hello") {
        return residentResponse(residentLedger.runtime.snapshot().lifecycle === "active"
          ? { status: "ready", lifetime: server.lifetime, pid: process.pid }
          : { status: "obsolete-lifetime" });
      }
      if (request.lifetime !== server.lifetime || residentLedger.runtime.snapshot().lifecycle !== "active") {
        return residentResponse(request.requestRoute === "ticketed"
          ? request.operation === "collect" ? { requestRoute: "ticketed", status: "unavailable", reason: "lost" }
            : { requestRoute: "ticketed", status: "obsolete-lifetime" }
          : { status: "obsolete-lifetime" });
      }
      if (request.operation === "register-edit" || request.operation === "admit" ||
          request.operation === "begin-stop") yield* sweepQuietRoundsEffect(residentNow());
      if (("advicee" in request && request.advicee.host === "opencode") ||
          (request.operation === "admit" && request.observation.advicee.host === "opencode")) return residentResponse({ status: "unsupported" });
      if (request.operation === "prompt-marker") {
        const group = adviceePartition(request.root, request.advicee);
        return residentResponse((request.onlyIfMissing === true
          ? residentComposedDelivery.ensureFromHostTurn(group, request.marker, residentNow())
          : residentComposedDelivery.advance(group, request.marker, residentNow(), request.promptDigest))
          ? { status: "advanced" } : { status: "rejected-capacity" });
      }
      if (request.operation === "begin-stop") {
        const group = adviceePartition(request.root, request.advicee);
        if (!residentComposedDelivery.beginStop(group, request.token)) return residentResponse({ status: "busy" });
        const expiry = yield* Effect.forkIn(Effect.sleep("5 seconds").pipe(Effect.andThen(Effect.gen(function* () {
          residentStopExpiries.delete(request.token);
          const counts = residentComposedDelivery.closureCounts(group);
          const closed = residentComposedDelivery.expireStop(group, request.token);
          if (closed !== undefined) yield* residentCloseRound(group, closed, "abandoned-stop", counts);
        }))), residentDispatchScope);
        residentStopExpiries.set(request.token, expiry);
        return residentResponse({ status: "advanced" });
      }
      if (request.operation === "finish-stop") {
        return yield* Effect.uninterruptible(Effect.gen(function* () {
          const expiry = residentStopExpiries.get(request.token);
          if (expiry !== undefined) yield* Fiber.interrupt(expiry);
          residentStopExpiries.delete(request.token);
          const group = adviceePartition(request.root, request.advicee);
          const counts = residentComposedDelivery.closureCounts(group);
          const closed = residentComposedDelivery.finishStop(group, request.token, request.close === true,
            residentNow());
          if (closed !== undefined) yield* residentCloseRound(group, closed, request.reason ?? "no-advice", counts);
          return residentResponse({ status: "advanced" });
        }));
      }
      if (request.operation === "claim-background") {
        return residentResponse(residentComposedDelivery.claimBackground(
          adviceePartition(request.root, request.advicee), request.token, residentNow(),
        ) ? { status: "background-claimed" } : { status: "busy" });
      }
      if (request.operation === "release-background") {
        residentComposedDelivery.releaseBackground(
          adviceePartition(request.root, request.advicee), request.token,
        );
        return residentResponse({ status: "released" });
      }
      if (request.operation === "begin-submission") {
        return residentResponse(yield* server.beginComposedSubmission(request.token, request.surface));
      }
      if (request.operation === "release") return residentResponse(yield* server.releaseComposedSubmission(request.token));
      if (request.operation === "register-edit") {
        const group = adviceePartition(request.root, request.advicee);
        const capture = yield* loadConfiguration(request.root,
          request.userConfigPath === undefined ? {} : { userConfigPath: request.userConfigPath }).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          );
        if (capture === undefined) return residentResponse({ status: "rejected-stale", reason: "InvalidConfiguration" });
        const decision = residentComposedDelivery.registerEditDecision(group, request.advicee.toolUseId,
          request.startedAt, monotonicNow(), effectiveEditPermitLimits(capture.policy),
          effectiveVirtualRoundQuietMs(capture.policy));
        if (!decision.accepted) return residentResponse({ status: "rejected-stale", reason: decision.reason });
        return residentResponse({ status: "advanced" });
      }
      if (request.operation === "admit") {
        if (request.composed !== true) return residentResponse({ status: "unsupported" });
        return residentResponse(yield* admitEffect(request.observation, request.dispatch, request.requestRoute === "ticketed", true, true));
      }
      if (request.operation === "collect") {
        if (request.composed !== true || (request.mode === "turn-end" &&
            (request.requestRoute === "ticketed" || request.finish === undefined))) return residentResponse({ status: "unsupported" });
        if (request.requestRoute === "ticketed") {
          const ticket = yield* residentTicketFor(request.ticket, request.root, request.advicee,
            true);
          if (ticket === undefined) return residentResponse({ requestRoute: "ticketed", status: "unavailable", reason: "lost" });
          const gate = residentTicketCollectGate(ticket, request.dispatch, residentNow());
          if (gate !== undefined) return residentResponse(gate);
          const collected = yield* residentCollect(request.root, request.advicee, request.dispatch,
            request.mode ?? "ordinary", ticket, true);
          return residentResponse(collected.status === "advice" ? { ...collected, requestRoute: "ticketed" }
            : (yield* residentTicketCollectionStatus(ticket, request.root, request.advicee,
                true, residentNow())));
        }
        if (request.finish !== undefined) {
          const group = adviceePartition(request.root, request.advicee);
          if (!residentComposedDelivery.ownsStop(group, request.finish.token)) return residentResponse({ status: "empty" });
          // Expired leases represent uncertain external output, not live writers.
          residentPruneNoticeCooldowns(residentNow());
          for (const advice of residentAdvice()) {
            if (adviceePartition(advice.observation.root, advice.observation.advicee) === group &&
                advice.delivery !== undefined && advice.delivery.leaseUntil <= residentNow()) yield* residentReleaseAdviceLease(advice);
          }
          const round = (yield* residentLedger.rounds.get(group));
          const totalUnfinished = (yield* residentCollectionWorkCount(request.root, request.advicee, true));
          const ownUnfinished = round === undefined ? 0 : (yield* residentLedger.rounds.policyWork(round)).unfinished();
          const extraUnfinished = Math.max(0, totalUnfinished - ownUnfinished);
          const gate = residentComposedDelivery.finishGate(group, request.finish.token,
            extraUnfinished, request.finish.deadlineReached);
          if (gate === undefined) return residentResponse({ status: "empty" });
          if (gate.status === "waiting") return residentResponse({ status: "pending" });
          if (round !== undefined && !(yield* residentDiscardUnfinishedWork(round, gate))) {
            yield* residentAllowFinish(group, request.finish.token, "unavailable");
            return residentResponse({ status: "empty" });
          }
          if (gate.limited) {
            yield* residentAllowFinish(group, request.finish.token, "limit");
            return residentResponse({ status: "empty" });
          }
        }
        const collected = yield* residentCollect(request.root, request.advicee, request.dispatch, request.mode ?? "ordinary", undefined, true);
        if (request.finish !== undefined) {
          const group = adviceePartition(request.root, request.advicee);
          const round = (yield* residentLedger.rounds.get(group));
          const selectedAdvice = collected.status === "advice"
            ? residentAdvice().filter((advice) => advice.delivery?.token === collected.token) : [];
          const selected = selectedAdvice.map((advice) => ({ id: advice.id,
            unit: advice.canonicalOperationId, findings: advice.delivery?.findings ?? [] }));
          const selectedCount = selected.reduce((count, item) => count + item.findings.length, 0);
          const bindingValid = collected.status !== "advice" || collected.findingCount === 0 ||
            (round !== undefined && selectedCount === collected.findingCount &&
              selectedAdvice.every((advice) => advice.round === round &&
                advice.workUnitId !== undefined && advice.delivery !== undefined &&
                advice.delivery.findings.length <= residentPendingCanonicalFindings(advice.canonicalOperationId)));
          const output = residentComposedDelivery.decideFinishOutput(group, request.finish.token,
            collected.status === "advice" ? collected.token : "", selected, residentNow(),
            collected.status === "advice" && collected.findingCount === 0,
            true, true, bindingValid, request.finish.deadlineReached);
          if (output.kind === "failed") {
            if (collected.status === "advice") yield* server.releaseDelivery(collected.token);
            return residentResponse({ status: "empty" });
          }
          if (output.kind === "allowed") {
            if (collected.status === "advice") yield* server.releaseDelivery(collected.token);
            yield* residentAllowFinish(group, request.finish.token, output.reason);
            if (collected.status === "advice") return residentResponse({ status: "empty" });
          }
          // Only findings can reach the hook. Operational failures remain in
          // resident diagnostics and cannot reserve a continuation.
          return residentResponse(collected);
        }
        return residentResponse(request.reportWorkState === true && collected.status === "empty"
          ? (yield* residentCollectionWorkState(request.root, request.advicee, true))
          : collected);
      }
      if ((request.operation === "acknowledge" || request.operation === "finalize") &&
          !residentComposedDelivery.hasToken(request.token)) return residentResponse({ status: "empty" });
      if (request.operation === "acknowledge") return residentResponse(yield* server.acknowledge(request.token));
      if (request.operation === "finalize") return residentResponse(yield* server.finalize(request.token));
      if (request.operation === "stats") return residentResponse(yield* server.operations.stats());
      if (request.operation === "cleanup") {
        const status = yield* cleanupEffect();
        return residentResponse({ status });
      }
      return residentResponse({ status: "unsupported" });
    });
  });

  const residentTicketFor = Effect.fn("ResidentRuntime.ticketFor")(function* (ticket: ResidentCollectionTicket, root: string, advicee: DirectAdvicee,
    composed = false): Effect.fn.Return<TicketRecord | undefined> {
    const retained = yield* residentLedger.tickets.get(ticket.nonce);
    const basePartition = adviceePartition(root, advicee);
    return retained?.ticket.lifetime === runtime.lifetime && ticket.lifetime === runtime.lifetime &&
      retained.ticket.nonce === ticket.nonce && retained.generation > 0 &&
      retained.partition === basePartition &&
      retained.editAuthority === editAuthority(root, advicee)
      ? retained : undefined;
  });

  function residentCurrentClaudeFeedbackMode(root: string, userConfigPath: string | null): ClaudeOutputMode {
    const authority = readCurrentClaudeFeedbackAuthority(root, userConfigPath ?? undefined);
    return authority.valid ? authority.mode : "advisory";
  }

  function residentTicketCollectGate(ticket: TicketRecord, dispatch: ResidentDispatchContext,
    now: number): ResidentResponse | undefined {
    const command = residentLedger.transition({ kind: "ticketCollectGateCheck",
      expired: now >= ticket.expiresAt,
      credentialValid: ticket.credentialGeneration === (dispatch.credential?.generation ?? null) &&
        residentCredentialAuthority(ticket) }).commands[0];
    if (command?.kind === "ticketCollectProceed") return undefined;
    if (command?.kind === "ticketCollectUnavailable") {
      return { requestRoute: "ticketed", status: "unavailable", reason: command.reason };
    }
    throw new Error("canonical ticket collect gate refused");
  }

  const residentTicketCollectionStatus = Effect.fn("ResidentRuntime.ticketCollectionStatus")(function* (ticket: TicketRecord, root: string, advicee: DirectAdvicee,
    composed: boolean, now: number): Effect.fn.Return<ResidentResponse> {
    const partition = composed ? adviceePartition(root, advicee) : ticket.partition;
    const hasAdvice = residentAdvice().some((item) =>
      (composed ? adviceePartition(item.observation.root, item.observation.advicee) === partition
        : item.partition === partition) && !residentAdviceExpired(item, now));
    return { requestRoute: "ticketed", status: hasAdvice || (yield* residentCollectionWorkCount(root, advicee, composed)) > 0
      ? "pending" : "empty" };
  });

  function residentCredentialAuthority(ticket: TicketRecord): boolean {
    if (!ticket.credentialRequired) return true;
    const credentialState = ticket.credentialStatePath === null ? undefined : readCredentialState(ticket.credentialStatePath);
    return credentialState !== undefined &&
      credentialState.generation === ticket.credentialGeneration &&
      (ticket.credentialEnvironmentOnly || !credentialState.savedUseSuspended);
  }

  function residentAdviceCredentialAuthority(advice: Advice): boolean {
    if (advice.credentialStatePath === null) return !advice.credentialRequired;
    const state = readCredentialState(advice.credentialStatePath);
    return state !== undefined && state.generation === advice.credentialGeneration &&
      (advice.credentialEnvironmentOnly || !state.savedUseSuspended);
  }

  const residentResponseGate = Effect.fn("ResidentIpc.responseGate")((operation: ResidentRequest["operation"], response: ResidentResponse) =>
    Effect.gen(function* () {
      const adviceGate = yield* Config.option(Config.String("REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH"));
      const variable = operation === "collect" && response.status === "advice" && Option.isSome(adviceGate)
        ? "REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH"
        : operation === "admit" ? "REVIEW_RESIDENT_ADMIT_RESPONSE_GATE_PATH"
        : operation === "cleanup" ? "REVIEW_RESIDENT_CLEANUP_RESPONSE_GATE_PATH"
        : operation === "collect" ? "REVIEW_RESIDENT_COLLECT_RESPONSE_GATE_PATH"
        : operation === "acknowledge" ? "REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH" : undefined;
      if (variable === undefined) return;
      const configured = yield* Config.option(Config.String(variable));
      if (Option.isNone(configured)) return;
      const gate = configured.value;
      const enabled = yield* residentAdapter("observe response gate", () => access(`${gate}.enabled`)).pipe(
        Effect.as(true), Effect.catch(() => Effect.succeed(false)),
      );
      if (!enabled) return;
      yield* residentAdapter("enter response gate", () => writeFile(`${gate}.entered`, "entered\n"));
      yield* residentAdapter("observe response release", () => access(`${gate}.release`)).pipe(
        Effect.as(true), Effect.catch(() => Effect.succeed(false)),
        Effect.repeat({ schedule: Schedule.spaced("10 millis"), until: (released) => released }),
      );
    }).pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "response gate" }))));

  const residentHandoffSourceCurrent = Effect.fn("ResidentIpc.handoffSourceCurrent")((response: ResidentResponse) => {
    const server = runtime;
    return Effect.gen(function* () {
      const current = new Map<string, boolean>();
      if (response.status !== "advice") return current;
      for (const advice of residentAdvice()) {
        if (advice.delivery?.token !== response.token) continue;
        const relativePath = advice.prepared.input.path;
        const captured = yield* captureStable(advice.observation.root, {
          relativePath, absolutePath: resolve(advice.observation.root, relativePath),
        }, {}, advice.observation.rootIdentity);
        current.set(advice.id, advice.sourceHash !== undefined && captured?.contentHash === advice.sourceHash);
      }
      return current;
    });
  });

  const residentResponseForHandoff = Effect.fn("ResidentRuntime.responseForHandoff")(function* (request: ResidentRequest, response: ResidentResponse,
    sourceCurrent: ReadonlyMap<string, boolean>): Effect.fn.Return<ResidentResponse> {
    if (response.status !== "advice") {
      if (request.requestRoute === "shared" && request.operation === "collect" && request.finish === undefined && request.reportWorkState === true &&
          (response.status === "empty" || response.status === "pending")) {
        return (yield* residentCollectionWorkState(request.root, request.advicee, request.composed === true));
      }
      if (request.requestRoute !== "ticketed" || request.operation !== "collect") return response;
      const now = residentNow();
      yield* residentExpirePending(now);
      residentPruneNoticeCooldowns(now);
      const ticket = yield* residentTicketFor(request.ticket, request.root, request.advicee,
        request.composed === true);
      if (ticket === undefined) return { requestRoute: "ticketed", status: "unavailable", reason: "lost" };
      return residentTicketCollectGate(ticket, request.dispatch, now) ??
        (yield* residentTicketCollectionStatus(ticket, request.root, request.advicee,
          request.composed === true, now));
    }
    const now = residentNow();
    yield* residentExpirePending(now);
    residentPruneNoticeCooldowns(now);
    const sharedCollect = request.operation === "collect" && request.requestRoute !== "ticketed";
    let invalidCredential = false;
    if (sharedCollect) for (const advice of residentAdvice()) {
      if (advice.delivery?.token !== response.token || invalidCredential) continue;
      const generationValid = advice.credentialGeneration === (request.dispatch.credential?.generation ?? null);
      const observed = residentLedger.transition({ kind: "deliveryCredentialObserveCheck",
        invalidSeen: invalidCredential, generationValid,
        authorized: generationValid && residentAdviceCredentialAuthority(advice) });
      if (observed.rejection !== undefined || observed.commands.length !== 1) throw new Error("canonical credential observation refused");
      invalidCredential = observed.commands[0]?.kind === "deliveryCredentialInvalid";
    }
    const credentialGate = residentLedger.transition({ kind: "deliveryFinalCredentialCheck",
      sharedCollect, invalidSeen: invalidCredential });
    if (credentialGate.rejection !== undefined || credentialGate.commands.length !== 1) throw new Error("canonical final credential gate refused");
    if (credentialGate.commands[0]?.kind !== "deliveryBatchProceed") {
      yield* runtime.releaseComposedSubmission(response.token);
      return { status: "empty" };
    }
    const handoff: Array<Advice> = [];
    for (const advice of [...residentAdvice()]) {
      if (advice.delivery?.token !== response.token) continue;
      const route = residentCandidateRoute({ kind: "finalCandidateCheck",
        ownerCurrent: true, credentialGeneration: true, credentialAuthorized: true,
        expired: !residentRoundActive(advice.round) || residentAdviceExpired(advice, now),
        workCurrent: (yield* residentIsCurrentWork(advice.revision, advice.prepared)) && sourceCurrent.get(advice.id) === true,
        hasFindings: advice.delivery.findings.length > 0 });
      if (route === "retireCandidate") {
        yield* residentRemoveAdvice(advice.id, response.token);
        continue;
      }
      if (route === "releaseCandidate") {
        yield* residentReleaseAdviceLease(advice);
        continue;
      }
      if (route !== "retainCandidate") continue;
      yield* residentLedger.advice.updateDelivery(advice, response.token, { leaseUntil: now + DELIVERY_LEASE_MS });
      handoff.push(advice);
    }
    const ticket = request.requestRoute === "ticketed" && request.operation === "collect"
      ? yield* residentTicketFor(request.ticket, request.root, request.advicee,
          request.composed === true)
      : undefined;
    if (request.requestRoute === "ticketed" && request.operation === "collect" && ticket === undefined) {
      yield* runtime.releaseDelivery(response.token);
      return { requestRoute: "ticketed", status: "unavailable", reason: "lost" };
    }
    if (request.operation === "collect") {
      const composed = request.composed === true;
      const partition = adviceePartition(request.root, request.advicee);
      const generation = request.dispatch.credential?.generation ?? null;
      if (composed) for (const advice of handoff) {
        const { delivery } = yield* residentLedger.advice.current(advice);
        if (delivery !== undefined && (advice.round === undefined ||
            advice.workUnitId === undefined ||
            delivery.findings.length > residentPendingCanonicalFindings(advice.canonicalOperationId))) {
          yield* residentReleaseAdviceLease(advice);
        }
      }
      const offers = (yield* Effect.forEach(handoff, Effect.fn("ResidentRuntime.finalOffers")(function* (advice) {
        const facts = yield* residentFindingSelectionFacts(advice, partition, generation, now, composed);
        const { delivery } = yield* residentLedger.advice.current(advice);
        return (delivery?.findings ?? []).map((finding) => ({ finding, facts }));
      }))).flat();
      const claudeSurface = composed && ticket === undefined && request.advicee.host === "claude-code"
        ? request.mode === "turn-end" ? "stop" : "background" : undefined;
      const accepted = new Set(selectFittingCurrentFindingIndices(offers,
        ticket === undefined ? claudeSurface === undefined ? "codex" :
          claudeSurface === "stop" ? "claude-stop" : "claude-background" : ticket.claudeFeedbackMode,
        undefined, residentCollectionFindingOffer));
      let index = 0;
      for (const advice of handoff) {
        const { delivery } = yield* residentLedger.advice.current(advice);
        if (delivery === undefined) continue;
        const fitting = delivery.findings.filter(() => accepted.has(index++));
        yield* residentLedger.advice.updateDelivery(advice, response.token, { findings: fitting });
        if (fitting.length === 0) yield* residentReleaseAdviceLease(advice);
      }
    }
    const findings = (yield* Effect.forEach(handoff, (advice) => residentLedger.advice.current(advice)))
      .flatMap((content) => content.delivery?.findings ?? []);
    const notices = residentNoticesForToken(response.token);
    if (request.operation === "collect" && request.requestRoute === "shared" && request.composed === true &&
        request.advicee.host === "claude-code") {
      const surface = request.mode === "turn-end" ? "stop" : "background";
      const fit = residentLedger.transition({ kind: "collectionFitCheck",
        items: findings.length + notices.length,
        bytes: encodedComposedClaudeOutputBytes(findings,
          notices.map((notice) => notice.value), surface) });
      if (fit.rejection !== undefined || fit.commands.length !== 1) {
        throw new Error("canonical final response fit refused");
      }
      if (fit.commands[0]?.kind === "collectionLimited") {
        yield* runtime.releaseDelivery(response.token);
        return { status: "empty" };
      }
      if (fit.commands[0]?.kind !== "collectionFits") {
        throw new Error("invalid canonical final response fit");
      }
    }
    for (const notice of notices) {
      residentNotices.renew(notice.id, now + DELIVERY_LEASE_MS);
    }
    if (ticket !== undefined && request.operation === "collect") {
      const gate = residentTicketCollectGate(ticket, request.dispatch, now);
      if (gate !== undefined) {
        yield* runtime.releaseDelivery(response.token);
        return gate;
      }
    }
    const admittedBlock = ticket?.claudeFeedbackMode === "block-current-findings";
    const currentBlock = admittedBlock && ticket !== undefined &&
      residentCurrentClaudeFeedbackMode(ticket.root, ticket.userConfigPath) === "block-current-findings";
    if (ticket !== undefined && request.operation === "collect" && request.requestRoute === "ticketed" &&
        residentLedger.transition({ kind: "ticketFinalAuthorityCheck", admittedBlock,
      currentBlock }).commands[0]?.kind !== "ticketFinalProceed") {
      // A revoked opt-in cannot turn the old selection into an advisory lease.
      yield* runtime.releaseDelivery(response.token);
      return (yield* residentTicketCollectionStatus(ticket, request.root, request.advicee,
        request.composed === true, now));
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
      : (yield* residentTicketCollectionStatus(ticket, request.root, request.advicee,
          request.composed === true, now));
  }, Effect.uninterruptible);

  const residentReconcileFinishHandoff = Effect.fn("ResidentRuntime.reconcileFinishHandoff")(function* (request: ResidentRequest, provisional: ResidentResponse,
    final: ResidentResponse, canWrite: boolean): Effect.fn.Return<ResidentResponse> {
    if (request.operation !== "collect" || request.requestRoute === "ticketed" || request.finish === undefined ||
        provisional.status !== "advice" || provisional.findingCount === 0) return final;
    const group = adviceePartition(request.root, request.advicee);
    if (!residentComposedDelivery.revokeProvisionalFinishOutput(group, request.finish.token, provisional.token)) {
      yield* runtime.releaseDelivery(provisional.token);
      yield* residentAllowFinish(group, request.finish.token, "unavailable");
      return { status: "empty" };
    }
    const round = (yield* residentLedger.rounds.get(group));
    const selectedAdvice = final.status === "advice"
      ? residentAdvice().filter((advice) => advice.delivery?.token === final.token) : [];
    const selectedCount = selectedAdvice.reduce((count, advice) =>
      count + (advice.delivery?.findings.length ?? 0), 0);
    const selected = selectedAdvice.map((advice) => ({ id: advice.id, unit: advice.canonicalOperationId,
      findings: advice.delivery?.findings ?? [] }));
    const bindingValid = final.status !== "advice" || final.findingCount === 0 ||
      (round !== undefined && selectedCount === final.findingCount && selectedAdvice.every((advice) =>
        advice.round === round && advice.workUnitId !== undefined && advice.delivery !== undefined &&
        advice.delivery.findings.length <= residentPendingCanonicalFindings(advice.canonicalOperationId)));
    const output = residentComposedDelivery.decideFinishOutput(group, request.finish.token,
      final.status === "advice" ? final.token : "", selected, residentNow(),
      final.status === "advice" && final.findingCount === 0,
      false, canWrite && final.status === "advice" && final.token === provisional.token,
      bindingValid, request.finish.deadlineReached);
    if (output.kind === "reserved") return final;
    if (final.status === "advice") yield* runtime.releaseDelivery(final.token);
    yield* residentAllowFinish(group, request.finish.token,
      output.kind === "allowed" ? output.reason : "unavailable");
    return { status: "empty" };
  }, Effect.uninterruptible);

  const residentServe = Effect.fn("ResidentIpc.serve")(function* (port: SocketFramePort) {
    const frame = yield* port.read;
    if (frame._tag === "Closed") return;
    const decoded = frame._tag === "Frame" ? decodeCurrentResidentRequest(frame.encoded) : undefined;
    if (decoded === undefined) {
      yield* port.write(encodeCurrentResidentResponse({ status: frame._tag === "Oversized" ? "rejected-capacity" : "unsupported" }));
      yield* port.closed;
      return;
    }
    residentPruneCollectionTokenIds();
    const server = runtime;
    let responseToken: string | undefined;
    let handedToTransport = false;
    const respond = Effect.gen(function* () {
      const response = yield* residentHandle(decoded);
      if (response.status === "advice") responseToken = response.token;
      yield* residentResponseGate(decoded.operation, response);
      yield* residentAdapter("response handoff barrier", () => Promise.resolve(residentBeforeResponseHandoff?.()));
      const sourceCurrent = yield* residentHandoffSourceCurrent(response);
      // Keep final authorization and socket handoff within one ownership
      // boundary; the response finalizer owns any untransferred lease.
      yield* Effect.uninterruptible(Effect.gen(function* () {
        const selected = yield* residentResponseForHandoff(decoded, response, sourceCurrent);
        const handoff = yield* residentReconcileFinishHandoff(decoded, response, selected, port.canWrite());
        residentPruneCollectionTokenIds();
        if (!port.canWrite()) {
          if (handoff.status === "advice") yield* server.releaseDelivery(handoff.token);
          if (handoff.status === "cleaned") yield* residentScheduleRetirementClose();
          return;
        }
        handedToTransport = yield* port.write(encodeCurrentResidentResponse(handoff));
        if (handoff.status === "cleaned") yield* residentScheduleRetirementClose();
      }));
      yield* port.closed;
    }).pipe(
      Effect.catch(() => port.write(encodeCurrentResidentResponse({ status: "unsupported" })).pipe(Effect.andThen(port.closed))),
      Effect.ensuring(Effect.gen(function* () {
        if ((!handedToTransport || port.errored()) && responseToken !== undefined) yield* server.releaseDelivery(responseToken);
      })),
    );
    yield* respond.pipe(Effect.raceFirst(port.closed), Effect.ensuring(Effect.gen(function* () {
      yield* port.close;
      const closedPath = runtimeConfiguration.collectDisconnectPath;
      if (closedPath !== undefined && decoded.operation === "collect" && decoded.advicee.toolUseId === "disconnect") {
        yield* residentAdapter("collect disconnect diagnostic", () => writeFile(closedPath, "closed\n")).pipe(Effect.ignore);
      }
    })));
  });

  const residentAccept = Effect.fn("ResidentIpc.accept")((socket: Socket) => Effect.acquireUseRelease(
    makeSocketFramePort(socket),
    (port) => Effect.acquireUseRelease(
      residentLedger.runtime.openConnection(MAX_IPC_CONNECTIONS),
      (connection) => Effect.gen(function* () {
        if (connection === undefined) {
          yield* port.write(encodeCurrentResidentResponse({ status: "rejected-capacity" }));
          yield* port.closed;
          return;
        }
        yield* residentScheduleIdleCheck();
        yield* residentServe(port);
      }),
      (connection) => port.close.pipe(Effect.andThen(Effect.gen(function* () {
        if (connection !== undefined) yield* residentLedger.runtime.releaseConnection(connection);
        yield* residentScheduleIdleCheck();
      }))),
    ),
    (port) => port.close,
  ));

  const residentScheduleRetirementClose = Effect.fn("ResidentRuntime.scheduleRetirementClose")(function* () {
    if (!(yield* residentLedger.runtime.scheduleRetirement())) return;
    // Retirement runs at the process boundary, outside the scope it closes.
    // Keeping the closing fiber in that scope would make it await itself.
    yield* Effect.forkIn(Effect.sleep("10 millis").pipe(Effect.andThen(runtime.closeEffect)), residentRuntimeScope);
  });

  const residentScheduleIdleCheck = Effect.fn("ResidentRuntime.scheduleIdleCheck")(function* () {
    if (residentLedger.runtime.snapshot().lifecycle !== "active") return;
    const pass = Effect.gen(function* () {
      if (residentLedger.runtime.snapshot().lifecycle !== "active") return true;
      if (residentLedger.runtime.snapshot().connections === 0 && (yield* cleanupEffect()) === "cleaned") {
        yield* residentScheduleRetirementClose();
        return true;
      }
      return false;
    });
    yield* FiberHandle.run(residentIdleChecks,
      Effect.sleep(RESIDENT_IDLE_CHECK_MS).pipe(Effect.andThen(pass.pipe(
        Effect.repeat({ schedule: Schedule.spaced(RESIDENT_IDLE_CHECK_MS), until: (retiring) => retiring }),
        Effect.asVoid,
      ))));
  });

  const residentScheduleQuietCheck = Effect.fn("ResidentRuntime.scheduleQuietCheck")(function* () {
    if (residentLedger.runtime.snapshot().lifecycle !== "active") return;
    const pass = Effect.gen(function* () {
      if (residentLedger.runtime.snapshot().lifecycle !== "active") return true;
      yield* sweepQuietRoundsEffect(residentNow());
      return false;
    });
    yield* FiberHandle.run(residentQuietChecks,
      Effect.sleep(VIRTUAL_ROUND_QUIET_CHECK_MS).pipe(Effect.andThen(pass.pipe(
        Effect.repeat({ schedule: Schedule.spaced(VIRTUAL_ROUND_QUIET_CHECK_MS), until: (retiring) => retiring }),
        Effect.asVoid,
      ))));
  });

  function listen(): Promise<void> {
    return Effect.runPromise(runtime.listenEffect());
  }

  const listenEffect = Effect.fn("ResidentIpc.listen")(() => {
    const owner = runtime;
    // Endpoint publication is a bounded acquisition. Signal interruption must
    // wait for binding to settle so its owning finalizer can remove the socket.
    return Effect.uninterruptible(Effect.gen(function* () {
      if (process.platform !== "linux" && process.platform !== "darwin") {
        return yield* Effect.fail(new ResidentAdapterError({ operation: "resident IPC requires Linux or macOS" }));
      }
      yield* residentAdapter("prepare resident directory", () => prepareResidentDirectory(owner.paths));
      // The launcher holds the live-owner directory. A socket pathname alone is
      // never treated as ownership evidence.
      yield* residentAdapter("verify removable socket", () => verifyRemovableSocket(owner.paths));
      yield* residentAdapter("remove stale socket", () => rm(owner.paths.socket, { force: true }));
      const server = createServer((socket) => {
        if (!server.listening) { socket.destroy(); return; }
        // This native callback only starts a fiber in the socket owner scope.
        Effect.runFork(Effect.forkIn(residentAccept(socket), residentIpcScope, { startImmediately: true }));
      });
      server.maxConnections = MAX_IPC_CONNECTIONS;
      yield* Effect.callback<void, ResidentAdapterError>((resume) => {
        server.once("error", () => resume(Effect.fail(new ResidentAdapterError({ operation: "bind resident socket" }))));
        server.listen(owner.paths.socket, () => resume(Effect.void));
      });
      residentServer = server;
      yield* residentAdapter("secure resident socket", () => chmod(owner.paths.socket, 0o600));
      residentOwnsOwnerRecord = true;
      yield* residentAdapter("publish resident endpoint", () => writeFile(
        owner.paths.owner,
        `${JSON.stringify({ pid: process.pid, lifetime: owner.lifetime })}\n`,
        { encoding: "utf8", mode: 0o600 },
      ));
      yield* residentScheduleIdleCheck();
      yield* residentScheduleQuietCheck();
    }));
  });

  function close(): Promise<void> {
    return Effect.runPromise(runtime.closeEffect);
  }

  const residentDispose = Effect.fn("ResidentRuntime.close")(() => {
    const owner = runtime;
    return Effect.uninterruptible(Effect.gen(function* () {
      yield* residentLedger.runtime.close();
      residentLifetimeController.abort();
      yield* FiberHandle.clear(residentIdleChecks);
      yield* FiberHandle.clear(residentQuietChecks);
      yield* Fiber.interruptAll(residentStopExpiries.values());
      residentStopExpiries.clear();
      for (const [, round] of (yield* residentLedger.rounds.entries())) {
        round.controller.abort();
        (yield* residentRoundSnapshot(round)).work.controller.abort();
      }
      for (const job of (yield* residentDispatcher.close())) {
        if (job.kind === "unit") {
          yield* residentReleaseReuseClaim(job.evaluationKey);
          yield* residentReleaseUnit(job);
        }
        else residentLedger.release(job.reservation);
      }
      for (const advice of residentAdvice()) yield* residentRemoveAdvice(advice.id);
      for (const key of [...residentNotices.entries().map(([key]) => key)]) residentReleaseNoticeCooldown(key);
      // Running work may be interrupted by process exit or finish later. Clear
      // its logical ownership after native effects settle. Issued Jev permits
      // remain reserved through an interruption attempt.
      residentReuse.clear();
      yield* residentDispatcher.whenIdle();
      yield* Scope.close(residentDispatchScope, Exit.void);
      yield* Scope.close(residentControlScope, Exit.void);
      const server = residentServer;
      const endpointClosed = server === undefined ? undefined : yield* Effect.forkChild(
        Effect.callback<void>((resume) => { server.close(() => resume(Effect.void)); }),
        { startImmediately: true },
      );
      yield* Scope.close(residentIpcScope, Exit.void);
      if (endpointClosed !== undefined) yield* Fiber.join(endpointClosed);
      residentLedger.clear();
      if (server !== undefined) {
        residentServer = undefined;
        yield* residentAdapter("remove owned socket", () => rm(owner.paths.socket, { force: true }));
      }
      if (residentOwnsOwnerRecord) {
        residentOwnsOwnerRecord = false;
        yield* residentAdapter("remove owned endpoint record", () => rm(owner.paths.owner, { force: true }));
      }
    }));
  });
  const closeEffect = yield* Effect.cached(Effect.suspend(() => residentDispose()));
  const residentDispatcher: Dispatcher<string, Job> = yield* makeDispatcher<string, Job>(
    residentLedger,
    (job) => ({ operation: job.kind === "ingress" ? job.canonicalObservationId : job.canonicalOperationId,
      round: job.canonicalRound }),
    (entry) => residentRun(entry.value, entry.sequence),
  ).pipe(Effect.provideService(Scope.Scope, residentDispatchScope));
  const operations = Object.freeze(ResidentRuntimeService.of({
    lifetime,
    paths,
    listen: listenEffect,
    close: closeEffect,
    handle: residentHandle,
    stats: statsEffect,
    whenIdle: Effect.fn("ResidentRuntime.whenIdle")(() => residentDispatcher.whenIdle()),
  }));
  const runtime: ResidentRuntime = Object.freeze({ operations, lifetime, paths, listenEffect, closeEffect, stats, cleanup, admit, collect, acknowledge, finalize, releaseDelivery, beginComposedSubmission, releaseComposedSubmission, whenIdle, pendingAdviceMetadata, accountingMetrics, sweepQuietRounds, handle, listen, close });
  yield* Effect.addFinalizer(() => closeEffect.pipe(Effect.orDie));
  return runtime;
});

export const residentRuntimeLayer = (paths: ResidentPaths, now: () => number = monotonicNow, options: ResidentRuntimeOptions = {}) =>
  Layer.effect(ResidentRuntimeService, makeResidentRuntime(paths, now, options).pipe(Effect.map((runtime) => runtime.operations)));
