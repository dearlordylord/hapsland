import { ResidentDispatchControls, dispatchControlsLayer } from "./dispatch-controls.ts";
import { ResidentReviewControls, reviewControlsLayer } from "./review-controls.ts";
import { makeSocketFramePort, type SocketFramePort } from "./socket-frame.ts";
import { ResidentPreparationControls, preparationControlsLayer } from "./preparation-controls.ts";
import { captureWorkspaceBytes, analysisWorkspaceBytes } from "./preparation-workspace.ts";
import { makeResidentRuntimeConfiguration } from "./runtime-configuration.ts";
import type { Advice } from "./advice-records.ts";
import type { PendingNoticeSnapshot as PendingNotice } from "./notice-records.ts";
import type { RoundWork, WorkCohort } from "./round-records.ts";
import type { JoinedReview, JoinedReviewOutcome } from "./joined-reviews.ts";
import { workSubject, type WorkRevision } from "./revision.ts";
import { recordAnalytics, type AnalyticsKind } from "../activity/analytics.ts";
import { effectiveSessionAnalytics } from "../configuration/resolve.ts";
import { recordRoundClosure, type RoundCloseReason } from "../activity/status.ts";
import { monotonicNow } from "./hook-clock.ts";
import * as Clock from "effect/Clock";
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
  resolveResidentPaths,
  verifyRemovableSocket,
  type ResidentPaths,
} from "./paths.ts";
import {
  DELIVERY_LEASE_MS,
  EDIT_REQUEST_DEADLINE_MS,
  MAX_IPC_CONNECTIONS,
  MAX_IPC_FRAME_BYTES,
  decodeCurrentResidentRequest,
  encodeCurrentResidentResponse,
  type ResidentDispatchContext,
  type ResidentRequest,
  type ResidentResponse,
  type ResidentUnavailableReason,
} from "./protocol.ts";
import {
  makeResidentState,
  type CapacityLedger,
  type CapacityReservation,
} from "./capacity.ts";
import { makeDispatcher, type Dispatcher } from "./dispatch.ts";
import { Context, Exit, Layer, Ref, Scope } from "effect";
import * as Fiber from "effect/Fiber";
import * as FiberHandle from "effect/FiberHandle";
import * as Schedule from "effect/Schedule";
import type { ComposedDelivery } from "./composed-delivery.ts";
import type { CanonicalCommand, CanonicalEvent } from "../canonical/adapter.ts";
import {
  PENDING_ADVICE_EXPIRY_MS,
  combinedClaudeOutput,
  combinedReviewOutput,
  encodedClaudeStopOutputBytes,
  selectFittingClaudeStopFindings,
  selectFittingFindings,
  selectFittingCurrentFindingIndices,
  selectFittingClaudeFindings,
  type ClaudeOutputMode,
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
  analyticsEnabled?: boolean;
  analyticsDiscardReported?: boolean;
};

type ResponseAuthority = {
  readonly lifetime: string; readonly partition: string;
  readonly root: string; readonly advicee: DirectAdvicee; readonly userConfigPath: string | null; readonly claudeFeedbackMode: ClaudeOutputMode;
  readonly credentialGeneration: number | null; readonly credentialStatePath: string | null;
  readonly credentialRequired: boolean; readonly credentialEnvironmentOnly: boolean;
  readonly expiresAt: number; readonly round: RoundWork | undefined;
};
type EditRequest = Extract<ResidentRequest, { operation: "admit-and-collect" }>;
type EditCollectionRequest = {
  readonly requestRoute: "edit"; readonly operation: "collect"; readonly lifetime: string;
  readonly root: string; readonly advicee: DirectAdvicee; readonly dispatch: ResidentDispatchContext;
  readonly composed: true; readonly mode: "ordinary";
};
type HandoffRequest = ResidentRequest | EditCollectionRequest;
type ResponseContext = { readonly authority?: ResponseAuthority; readonly token?: string };

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
  analyticsEnabled?: boolean;
  analyticsDiscardReported?: boolean;
  readonly prepared: PreparedUnit;
  readonly sourceHash?: string;
  revision: WorkRevision;
  readonly evaluationKey: string;
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
  /** Scoped local review coordination; never supplied by resident IPC. */
  readonly reviewControls?: Layer.Layer<ResidentReviewControls>;
  /** Fixture-only source effect; never supplied by resident IPC. */
  readonly captureSource?: DirectReviewContext["captureSource"];
  /** Scoped local preparation coordination; never supplied by resident IPC. */
  readonly preparationControls?: Layer.Layer<ResidentPreparationControls>;
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
  stats(): Effect.Effect<Extract<ResidentResponse, { status: "stats" }>>;
  cleanup(): Effect.Effect<"busy" | "cleaned">;
  admit(observation: DirectObservation, dispatch: ResidentDispatchContext, composed?: boolean, requirePermit?: boolean): Effect.Effect<ResidentResponse>;
  collect(root: string, advicee: DirectAdvicee, dispatch: ResidentDispatchContext, mode?: CollectionMode): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>;
  collect(root: string, advicee: DirectAdvicee, dispatch: ResidentDispatchContext, mode: CollectionMode, authority: undefined, composed: true): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>;
  collect(root: string, advicee: DirectAdvicee, dispatch: ResidentDispatchContext, mode: CollectionMode, authority: ResponseAuthority, composed?: boolean): Effect.Effect<ResidentResponse, ResidentAdapterError>;
  acknowledge(token: string): Effect.Effect<ResidentResponse>;
  finalize(token: string): Effect.Effect<ResidentResponse>;
  releaseDelivery(token: string): Effect.Effect<void>;
  beginComposedSubmission(token: string, surface: "edit" | "background" | "stop"): Effect.Effect<ResidentResponse>;
  releaseComposedSubmission(token: string): Effect.Effect<ResidentResponse>;
  whenIdle(): Effect.Effect<void>;
  pendingAdviceMetadata(): Effect.Effect<ReadonlyArray<{
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
  }>>;
  accountingMetrics(): Effect.Effect<{
    readonly peakLedgerBytes: number;
    readonly maxMaterializedPreparedUnits: number;
    readonly successfulCacheEntries: number;
    readonly successfulCacheBytes: number;
    readonly pendingEvaluations: number;
    readonly operationalNoticeKeys: number;
    readonly pendingOperationalNotices: number;
    readonly operationalNoticeBytes: number;
  }>;
  sweepQuietRounds(now?: number): Effect.Effect<number>;
  handle(request: ResidentRequest): Effect.Effect<ResidentResponse, ResidentAdapterError>;
  listen(): Effect.Effect<void, ResidentAdapterError>;
  readonly close: Effect.Effect<void, ResidentAdapterError>;
}

export class ResidentRuntimeService extends Context.Service<ResidentRuntimeService, ResidentRuntimeOperations>()("@hapsland/ResidentRuntime") {}

export const makeResidentRuntime = Effect.fn("ResidentRuntime.make")(function* (
  paths: ResidentPaths | undefined = undefined,
  now: () => number = monotonicNow,
  options: ResidentRuntimeOptions = {},
) {
  paths ??= yield* resolveResidentPaths();
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
  const residentCollectionFindingOffer: CanonicalFindingOffer = Effect.fn("ResidentRuntime.collectionFindingOffer")(function* (input) {
    const facts = input.facts;
    const result = (yield* residentLedger.transition({ kind: "collectionFindingCheck",
      selectionPartition: input.selectionPartition, selectionRound: input.selectionRound,
      unit: facts.unit, partition: facts.partition, round: facts.round,
      snapshot: facts.snapshot, currentSnapshot: facts.currentSnapshot,
      credential: facts.credential, currentCredential: facts.currentCredential,
      ageMs: facts.ageMs, soloBytes: input.soloBytes,
      collectionReady: facts.collectionReady, selectedCount: input.selectedCount,
      prospectiveBytes: input.prospectiveBytes }));
    if (result.rejection !== undefined) throw new Error("canonical finding fit refused");
    switch (result.commands[0]?.kind) {
      case "collectionFindingSelected": return "selected";
      case "collectionFindingRetained": return "retained";
      case "collectionFindingLimited": return "limited";
      case "collectionFindingExpired": return "expired";
      default: throw new Error("invalid canonical finding fit");
    }
  });

  const maximumOperationalNoticeKeys = options.maximumOperationalNoticeKeys ?? MAX_OPERATIONAL_NOTICE_KEYS;
  if (
    !Number.isSafeInteger(maximumOperationalNoticeKeys) ||
    maximumOperationalNoticeKeys < 1 ||
    maximumOperationalNoticeKeys > MAX_OPERATIONAL_NOTICE_KEYS
  ) {
    throw new RangeError(`maximumOperationalNoticeKeys must be an integer from 1 to ${MAX_OPERATIONAL_NOTICE_KEYS}`);
  }

  const residentNow = now;
  const residentNotices = residentLedger.notices(maximumOperationalNoticeKeys, OPERATIONAL_NOTICE_COOLDOWN_MS, PENDING_ADVICE_EXPIRY_MS, logicalBytes);
  const residentCaptureSource = options.captureSource;
  const residentControlScope = yield* Scope.make();
  yield* Effect.addFinalizer(() => Scope.close(residentControlScope, Exit.void));
  const residentPreparationControls = Context.get(
    yield* Layer.buildWithScope(options.preparationControls ?? preparationControlsLayer, residentControlScope), ResidentPreparationControls);
  const residentReviewControls = Context.get(
    yield* Layer.buildWithScope(options.reviewControls ?? reviewControlsLayer, residentControlScope), ResidentReviewControls);
  const residentDispatchControls = Context.get(
    yield* Layer.buildWithScope(options.dispatchControls ?? dispatchControlsLayer, residentControlScope), ResidentDispatchControls);
  const residentDispatchAuthorityObserver = options.dispatchAuthorityObserver;
  const residentJevRequestObserver = options.jevRequestObserver;
  const residentOfflineHttpClient = options.offlineHttpClient;
  const residentControlledRequestEffect = options.controlledRequestEffect;
  const residentReuse = residentLedger.reuse(logicalBytes);

  const residentAdvice = Effect.fn("ResidentRuntime.advice")(() => residentLedger.advice.values());

  const stats = Effect.fn("ResidentRuntime.stats")(function* (): Effect.fn.Return<Extract<ResidentResponse, { status: "stats" }>> {
    const now = residentNow();
    yield* residentExpirePending(now);
    yield* residentPruneNoticeCooldowns(now);
    const dispatch = yield* residentDispatcher.snapshot();
    const capacity = (yield* residentLedger.snapshot());
    const reuse = (yield* residentReuse.snapshot());
    return {
      status: "stats",
      queued: dispatch.queued,
      running: dispatch.running,
      pendingAdvice: (yield* residentAdvice()).length + (yield* residentPendingNoticeCount()),
      pendingFindingBatches: (yield* residentAdvice()).length,
      pendingOperationalNotices: (yield* residentPendingNoticeCount()),
      retainedBytes: capacity.bytes,
      rejectedCapacity: (yield* residentLedger.runtime.snapshot()).rejectedCapacity,
      successfulCacheEntries: reuse.entries,
      pendingEvaluations: reuse.pending,
      noticeCooldowns: (yield* residentNotices.entries()).length,
      currentWork: yield* residentLedger.revision.count(),
    };
  });


  const cleanup = Effect.fn("ResidentRuntime.cleanup")(function* (): Effect.fn.Return<"busy" | "cleaned"> {
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return "busy";
    const now = residentNow();
    yield* residentExpirePending(now);
    yield* residentPruneNoticeCooldowns(now);
    return yield* residentLedger.runtime.cleanup(logicalBytes);
  });

  const residentPruneCollectionTokenIds = Effect.fn("ResidentRuntime.pruneCollectionTokenIds")(function* () {
    const live = (yield* residentComposedDelivery.liveCollectionTokenKeys());
    for (const { content } of (yield* residentLedger.advice.snapshots())) {
      if (content.delivery !== undefined) live.add(content.delivery.token);
    }
    for (const notice of (yield* residentNotices.entries()).map(([, value]) => value)) {
      if (notice.pending?.delivery !== undefined) live.add(notice.pending.delivery.token);
    }
    yield* residentLedger.pruneCollectionTokenIds(live);
  }, Effect.uninterruptible);

  const residentRoundSnapshot = Effect.fn("ResidentRuntime.roundSnapshot")(function* (round: RoundWork) {
    const snapshot = yield* residentLedger.rounds.snapshot(round);
    if (snapshot === undefined) throw new Error("native round snapshot lost its capability");
    return snapshot;
  });

  const admit = Effect.fn("ResidentRuntime.admit")(function* (observation: DirectObservation, dispatch: ResidentDispatchContext, composed = false, requirePermit = false): Effect.fn.Return<ResidentResponse> {
    const now = residentNow();
    yield* residentExpirePending(now);
    // Reclaim cooldown state whose active guarantee and pending notice have
    // both ended before it can cause an otherwise-valid admission to fail.
    yield* residentPruneNoticeCooldowns(now);
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return { status: "rejected-capacity" };
    const group = adviceePartition(observation.root, observation.advicee);
    const generation = composed ? (yield* residentComposedDelivery.admitEdit(group,
      observation.advicee.toolUseId, monotonicNow(), requirePermit)) : undefined;
    if (composed && generation === undefined) {
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee,
        lifetime: runtime.lifetime, stage: "incomplete" });
      return { status: "rejected-stale" };
    }
    const round = generation === undefined ? undefined : yield* residentLedger.rounds.bind(group, generation,
      { root: observation.root, advicee: observation.advicee, activityPath: dispatch.activityPath }, randomUUID());
    const partition = group;
    const canonicalRound = round?.canonicalRound ?? (yield* residentLedger.roundId(partition));
    const reservation = (yield* residentLedger.reserve(partition, logicalBytes({ observation, dispatch }) + RESERVATION_OVERHEAD_BYTES, "observationDispatch"));
    if (reservation === undefined) {
      yield* residentLedger.runtime.rejectCapacity();
      yield* residentRecordAnalytics({ observation, dispatch }, "capacity-rejected");
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: runtime.lifetime, stage: "unavailable" });
      return { status: "rejected-capacity" };
    }
    const admission = yield* Effect.exit(residentLedger.admitObservation(partition, canonicalRound));
    if (Exit.isFailure(admission)) {
      (yield* residentLedger.release(reservation));
      return { status: "rejected-capacity" };
    }
    const canonicalObservationId = admission.value;
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
    };
    if (!(yield* residentDispatcher.enqueue(partition, job))) {
      (yield* residentLedger.observation(partition, canonicalObservationId, "interruptObservation", canonicalRound));
      (yield* residentLedger.release(reservation));
      yield* residentLedger.runtime.rejectCapacity();
      yield* residentRecordAnalytics({ observation, dispatch }, "capacity-rejected");
      recordActivity({ statePath: dispatch.activityPath, root: observation.root, advicee: observation.advicee, lifetime: runtime.lifetime, stage: "unavailable" });
      return { status: "rejected-capacity" };
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
    return { status: "accepted" };
  }, Effect.uninterruptible);

  function residentCollectionElapsed(now: number, started: number, limit: number): number {
    const elapsed = Math.min(limit, Math.max(0, now - started));
    return Number.isNaN(elapsed) ? 0 : Math.floor(elapsed);
  }

  const residentPendingCanonicalFindings = Effect.fn("ResidentRuntime.pendingCanonicalFindings")(function* (operation: number) {
    return (yield* residentLedger.canonicalProjection()).pendingFindings.find((item) =>
      item.operation === operation)?.count ?? 0;
  });

  const residentAdviceExpired = Effect.fn("ResidentRuntime.adviceExpired")(function* (advice: Pick<Advice, "pendingAt">, now: number) {
    const result = (yield* residentLedger.transition({ kind: "collectionExpiryCheck",
      elapsed: residentCollectionElapsed(now, advice.pendingAt, PENDING_ADVICE_EXPIRY_MS),
      lifetime: PENDING_ADVICE_EXPIRY_MS }));
    if (result.rejection !== undefined) throw new Error("canonical advice expiry refused");
    const command = result.commands[0]?.kind;
    if (command !== "collectionExpired" && command !== "collectionCurrent") throw new Error("invalid canonical advice expiry");
    return command === "collectionExpired";
  });

  const residentCollectionOrder = Effect.fn("ResidentRuntime.collectionOrder")(function* (left: Pick<Advice, "sequence">,
    right: Pick<Advice, "sequence">) {
    const result = (yield* residentLedger.transition({ kind: "collectionOrderCheck",
      leftSequence: left.sequence, rightSequence: right.sequence }));
    if (result.rejection !== undefined) throw new Error("canonical collection order refused");
    switch (result.commands[0]?.kind) {
      case "collectionBefore": return -1;
      case "collectionEqual": return 0;
      case "collectionAfter": return 1;
      default: throw new Error("invalid canonical collection order");
    }
  });

  const residentReserveAdviceLease = Effect.fn("ResidentRuntime.reserveAdviceLease")((advice: Advice, token: string) =>
    residentLedger.advice.reserveLease(advice, token));

  const residentReleaseAdviceLease = Effect.fn("ResidentRuntime.releaseAdviceLease")((advice: Advice) => residentLedger.advice.releaseLease(advice));

  const residentCheckAdviceLease = Effect.fn("ResidentRuntime.checkAdviceLease")(function* (advice: Advice, now: number, stopCollector: boolean, sameGroup: boolean) {
    const { delivery } = yield* residentLedger.advice.current(advice);
    yield* residentLedger.advice.checkLease(advice, now, stopCollector, sameGroup,
      delivery !== undefined && stopCollector && sameGroup &&
        (yield* residentComposedDelivery.backgroundReofferable(advice.id, delivery.token)));
  }, Effect.uninterruptible);

  const residentUnsuppressedFindings = Effect.fn("ResidentRuntime.unsuppressedFindings")(function* (
    advice: Advice, findings: ReadonlyArray<Finding>, stopCollector: boolean, firstOnly = false,
  ) {
    const retained: Array<Finding> = [];
    const partition = adviceePartition(advice.observation.root, advice.observation.advicee);
    for (const finding of findings) {
      if (yield* residentComposedDelivery.suppresses(advice.id, partition, finding, stopCollector ? "stop" : undefined)) continue;
      retained.push(finding);
      if (firstOnly) break;
    }
    return retained;
  });

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode?: CollectionMode,
  ): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>;

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    authority: undefined,
    composed: true,
  ): Effect.Effect<Exclude<ResidentResponse, { readonly requestRoute: "edit" }>, ResidentAdapterError>;

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode,
    authority: ResponseAuthority,
    composed?: boolean,
  ): Effect.Effect<ResidentResponse, ResidentAdapterError>;

  function collect(
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode = "ordinary",
    authority?: ResponseAuthority,
    composed = false,
  ): Effect.Effect<ResidentResponse, ResidentAdapterError> {
    return residentCollect(root, advicee, dispatch, mode, authority, composed);
  }

  const residentCollect = Effect.fn("ResidentRuntime.collect")((
    root: string,
    advicee: DirectAdvicee,
    dispatch: ResidentDispatchContext,
    mode: CollectionMode = "ordinary",
    authority?: ResponseAuthority,
    composed = false,
  ) => Effect.suspend(() => {
    const server = runtime;
    let collectionToken: string | undefined;
    return Effect.gen(function* () {
      const partition = adviceePartition(root, advicee);
      const claudeSurface = composed && authority === undefined &&
        advicee.host === "claude-code" && mode === "turn-end" ? "stop" : undefined;
      const now = residentNow();
      if (composed && mode !== "turn-end" && (yield* residentComposedDelivery.isDeciding(partition))) return residentResponse({ status: "empty" });
      const stopCollector = composed && mode === "turn-end" && (yield* residentComposedDelivery.isDeciding(partition));
      yield* residentExpirePending(now);
      yield* residentPruneNoticeCooldowns(now);
      const credentialGeneration = dispatch.credential?.generation ?? null;
      for (const item of [...(yield* residentAdvice())]) {
        const sameScope = composed ? adviceePartition(item.observation.root, item.observation.advicee) === partition
          : item.partition === partition;
        const disposition = (yield* residentLedger.transition({ kind: "collectionCredentialCheck",
          sameScope, generationValid: item.credentialGeneration === credentialGeneration }));
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
      const available: Array<Advice> = [];
      for (const { capability: item, content } of (yield* residentLedger.advice.snapshots())) {
        const samePartition = composed
          ? adviceePartition(item.observation.root, item.observation.advicee) === partition
          : item.partition === partition;
        const unleased = content.delivery === undefined;
        const hasUnsuppressed = samePartition && unleased &&
          (yield* residentUnsuppressedFindings(item, content.findings, stopCollector, true)).length > 0;
        const authorityOwns = authority === undefined || authority.partition === item.partition;
        const result = (yield* residentLedger.transition({ kind: "collectionCandidateCheck",
          samePartition, unleased, hasUnsuppressed, authorityOwns }));
        if (result.rejection !== undefined) throw new Error("canonical advice candidate refused");
        if (result.commands[0]?.kind !== "collectionCandidate" && result.commands[0]?.kind !== "collectionSkip") {
          throw new Error("invalid canonical advice candidate");
        }
        if (result.commands[0]?.kind === "collectionCandidate") available.push(item);
      }
      for (const item of available) {
        yield* residentLedger.advice.eligible(item, yield* residentJoined.hasAdmission(item.admissionId));
      }
      const eligible = (yield* Effect.forEach(available, Effect.fn("ResidentRuntime.eligibleAdvice")(function* (item) {
        return { item, content: yield* residentLedger.advice.current(item) };
      }))).filter(({ content }) => content.collectionEligible).map(({ item }) => item);
      for (let index = 1; index < eligible.length; index++) {
        const item = eligible[index];
        if (item === undefined) throw new Error("eligible advice disappeared during ordering");
        let previous = index - 1;
        while (previous >= 0) {
          const left = eligible[previous];
          if (left === undefined) throw new Error("eligible advice disappeared during ordering");
          if ((yield* residentCollectionOrder(left, item)) <= 0) break;
          eligible[previous + 1] = left;
          previous--;
        }
        eligible[previous + 1] = item;
      }
      const token = collectionToken = randomUUID();
      const fittingFindings = Effect.fn("ResidentRuntime.fittingFindings")(function* (
        retained: ReadonlyArray<Finding>, candidates: ReadonlyArray<Finding>,
        advice: Advice, reportLimit: boolean,
      ) {
        const facts = yield* residentFindingSelectionFacts(advice, partition, credentialGeneration, residentNow(), composed);
        let limited = 0;
        const onLimited = reportLimit ? () => { limited++; } : undefined;
        const fitting = yield* (authority === undefined
          ? claudeSurface === undefined
            ? selectFittingFindings(retained, candidates, facts, onLimited, residentCollectionFindingOffer)
            : selectFittingClaudeStopFindings(retained, candidates,
                facts, onLimited, residentCollectionFindingOffer)
          : selectFittingClaudeFindings(retained, candidates, authority.claudeFeedbackMode,
            facts, onLimited, residentCollectionFindingOffer));
        for (let index = 0; index < limited; index++) yield* residentRecordOperationalFailure(advice.observation, "output-limit");
        return fitting;
      }, Effect.uninterruptible);
      let handoffFindings: Array<Finding> = [];
      const selected: Array<Advice> = [];
      let selectedFindings: Array<Finding> = [];
      for (const { id } of eligible) {
        const advice = (yield* residentLedger.advice.snapshots())
          .find(({ capability, content }) => capability.id === id && content.delivery === undefined)?.capability;
        if (advice === undefined) continue;
        if (!(yield* residentReserveAdviceLease(advice, token))) continue;
        yield* residentReviewControls.beforeRevalidate(advice.id).pipe(
          Effect.mapError(() => new ResidentAdapterError({ operation: "collection revalidation barrier" })));
        const validity = yield* residentRevalidate(advice, dispatch);
        const retained = (yield* residentAdvice()).find((item) => item.id === advice.id);
        const route = (yield* residentCandidateRoute({ kind: "validationRouteCheck",
          ownerCurrent: retained === advice && (yield* residentLedger.advice.current(advice)).delivery?.token === token,
          status: validity.status }));
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
        const workRoute = (yield* residentCandidateRoute({ kind: "postValidationCheck",
          workAccepted, expired: false, hasFitting: true }));
        if (workRoute !== "retainCandidate") {
          if (workRoute === "retireCandidate") yield* residentRemoveAdvice(advice.id, token);
          else yield* residentReleaseAdviceLease(advice);
          continue;
        }
        yield* residentLedger.advice.revise(advice, validity.evaluations, validity.findings);
        const handoffNow = residentNow();
        const expiryRoute = (yield* residentCandidateRoute({ kind: "postValidationCheck",
          workAccepted: true, expired: (yield* residentAdviceExpired(advice, handoffNow)), hasFitting: true }));
        if (expiryRoute !== "retainCandidate") {
          if (expiryRoute === "retireCandidate") yield* residentRemoveAdvice(advice.id, token);
          else yield* residentReleaseAdviceLease(advice);
          continue;
        }
        const fitting = yield* fittingFindings(selectedFindings, (yield* residentUnsuppressedFindings(advice, (yield* residentLedger.advice.current(advice)).findings, stopCollector)), advice, true);
        const fittingRoute = (yield* residentCandidateRoute({ kind: "postValidationCheck",
          workAccepted: true, expired: false, hasFitting: fitting.length > 0 }));
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
          yield* residentReviewControls.beforeFinalRevalidate(advice.id).pipe(
            Effect.mapError(() => new ResidentAdapterError({ operation: "final collection revalidation barrier" })));
          const validity = yield* residentRevalidate(advice, dispatch);
          const retained = (yield* residentAdvice()).find((item) => item.id === advice.id);
          const route = (yield* residentCandidateRoute({ kind: "validationRouteCheck",
            ownerCurrent: retained === advice && (yield* residentLedger.advice.current(advice)).delivery?.token === token,
            status: validity.status }));
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
          const workRoute = (yield* residentCandidateRoute({ kind: "postValidationCheck",
            workAccepted, expired: false, hasFitting: true }));
          if (workRoute !== "retainCandidate") {
            if (workRoute === "retireCandidate") yield* residentRemoveAdvice(advice.id, token);
            else yield* residentReleaseAdviceLease(advice);
            continue;
          }
          yield* residentLedger.advice.revise(advice, validity.evaluations, validity.findings);
          const handoffNow = residentNow();
          const expiryRoute = (yield* residentCandidateRoute({ kind: "postValidationCheck",
            workAccepted: true, expired: (yield* residentAdviceExpired(advice, handoffNow)), hasFitting: true }));
          if (expiryRoute !== "retainCandidate") {
            if (expiryRoute === "retireCandidate") yield* residentRemoveAdvice(advice.id, token);
            else yield* residentReleaseAdviceLease(advice);
            continue;
          }
          const fitting = yield* fittingFindings(finalFindings, (yield* residentUnsuppressedFindings(advice, (yield* residentLedger.advice.current(advice)).findings, stopCollector)), advice, true);
          const fittingRoute = (yield* residentCandidateRoute({ kind: "postValidationCheck",
            workAccepted: true, expired: false, hasFitting: fitting.length > 0 }));
          if (fittingRoute !== "retainCandidate") {
            if (fittingRoute === "retireCandidate") yield* residentRemoveAdvice(advice.id, token);
            else yield* residentReleaseAdviceLease(advice);
            continue;
          }
          if ((yield* residentLedger.advice.current(advice)).delivery?.token !== token) continue;
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
            const retained = (yield* residentAdvice()).find((item) => item.id === advice.id);
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
            const route = (yield* residentCandidateRoute({ kind: "finalCandidateCheck", ownerCurrent,
              credentialGeneration: credentialGenerationValid, credentialAuthorized,
              expired: ownerCurrent && credentialGenerationValid && credentialAuthorized &&
                (yield* residentAdviceExpired(advice, handoffNow)),
              workCurrent: ownerCurrent && credentialGenerationValid && credentialAuthorized &&
                (yield* residentIsCurrentWork(advice.revision, advice.prepared)),
              hasFindings: delivery !== undefined && delivery.findings.length > 0 }));
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
          const limitedIndices: Array<number> = [];
          const accepted = new Set((yield* selectFittingCurrentFindingIndices(offers,
            authority === undefined ? claudeSurface === undefined ? "codex" :
              "claude-stop" : authority.claudeFeedbackMode,
            (index) => { limitedIndices.push(index); },
            residentCollectionFindingOffer)));
          for (const index of limitedIndices) yield* residentRecordOperationalFailure(offers[index]!.advice.observation, "output-limit", handoffNow);
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
      return residentResponse(authority === undefined
        ? { status: "advice", token, findingCount: handoffFindings.length,
            output: combinedReviewOutput(handoffFindings, []) }
        : { requestRoute: "edit", status: "advice", token, findingCount: handoffFindings.length,
            output: combinedClaudeOutput(handoffFindings, [], authority.claudeFeedbackMode) });
    }).pipe(Effect.onError(() => Effect.gen(function* () {
      // A failed or interrupted collector cannot retain a lease indefinitely.
      // Revalidation's own finalizer has settled before runtime handoff is released.
      if (collectionToken !== undefined) yield* server.releaseDelivery(collectionToken);
    })));
  }));

  const residentCandidateRoute = Effect.fn("ResidentRuntime.candidateRoute")(function* (event: Extract<CanonicalEvent, { readonly kind:
    "validationRouteCheck" | "postValidationCheck" | "finalCandidateCheck" }>) {
    const result = (yield* residentLedger.transition(event));
    const kind = result.commands[0]?.kind;
    if (result.rejection !== undefined || result.commands.length !== 1 ||
        (kind !== "ignoreCandidate" && kind !== "releaseCandidate" && kind !== "retireCandidate" &&
          kind !== "continueCandidate" && kind !== "retainCandidate")) {
      throw new Error("invalid canonical candidate route");
    }
    return kind;
  });

  const acknowledge = Effect.fn("ResidentRuntime.acknowledge")(function* (token: string): Effect.fn.Return<ResidentResponse> {
    const now = residentNow();
    yield* residentExpirePending(now);
    yield* residentPruneNoticeCooldowns(now);
    const advice = (yield* residentLedger.advice.snapshots()).filter(({ content }) => content.delivery?.token === token);
    const notices = (yield* residentNoticesForToken(token));
    const expired = advice.some(({ content }) => content.delivery === undefined || content.delivery.leaseUntil <= now) ||
      notices.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now);
    const decision = (yield* residentLedger.transition({ kind: "deliveryAcknowledgeCheck",
      items: advice.length + notices.length, anyExpired: expired }));
    if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error("canonical acknowledgement refused");
    if (decision.commands[0]?.kind === "deliveryAckEmpty") return { status: "empty" };
    if (decision.commands[0]?.kind === "deliveryAckExpired") {
      for (const { capability: item, content } of advice) yield* residentReleaseAdviceLease(item);
      for (const item of notices) { yield* residentNotices.release(item.id); }
      return { status: "empty" };
    }
    if (decision.commands[0]?.kind !== "deliveryAckReady") throw new Error("invalid canonical acknowledgement");
    if (!(yield* residentComposedDelivery.markSubmitted(token,
      advice.flatMap(({ capability, content }) => (content.delivery?.findings ?? []).map(() => capability.canonicalOperationId))))) {
      return { status: "empty" };
    }
    const analyticsGroups = new Map<string, typeof advice>();
    for (const item of advice) {
      if (!item.capability.analyticsEnabled || item.content.delivery === undefined || item.content.delivery.acknowledged) continue;
      const key = JSON.stringify([item.capability.analyticsPath, item.capability.analyticsControlled]);
      analyticsGroups.set(key, [...(analyticsGroups.get(key) ?? []), item]);
    }
    for (const group of analyticsGroups.values()) {
      const first = group[0]?.capability;
      if (first === undefined) continue;
      const findings = group.flatMap(({ content }) => content.delivery?.findings ?? []);
      recordAnalytics({ enabled: true, statePath: first.analyticsPath, root: first.observation.root,
        advicee: first.observation.advicee, lifetime: runtime.lifetime, kind: "submitted",
        controlled: first.analyticsControlled, findings: findings.length, ruleIds: findings.map((finding) => finding.ruleId) });
    }
    for (const { capability: item, content } of advice) {
      yield* residentLedger.advice.updateDelivery(item, token, { acknowledged: true });
    }
    for (const item of notices) yield* residentNotices.acknowledge(item.id);
    return { status: "acknowledged" };
  }, Effect.uninterruptible);

  const finalize = Effect.fn("ResidentRuntime.finalize")(function* (token: string): Effect.fn.Return<ResidentResponse> {
    const now = residentNow();
    yield* residentExpirePending(now);
    yield* residentPruneNoticeCooldowns(now);
    const advice = (yield* residentLedger.advice.snapshots()).filter(({ content }) => content.delivery?.token === token);
    const notices = (yield* residentNoticesForToken(token));
    const allAcknowledged = advice.every(({ content }) => content.delivery?.acknowledged === true) &&
      notices.every((item) => item.delivery?.acknowledged === true);
    const expired = advice.some(({ content }) => content.delivery === undefined || content.delivery.leaseUntil <= now) ||
      notices.some((item) => item.delivery === undefined || item.delivery.leaseUntil <= now);
    const decision = (yield* residentLedger.transition({ kind: "deliveryFinalizeCheck",
      items: advice.length + notices.length, allAcknowledged, anyExpired: expired }));
    if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error("canonical finalization refused");
    if (decision.commands[0]?.kind === "deliveryFinalEmpty") return { status: "empty" };
    if (decision.commands[0]?.kind === "deliveryFinalExpired") {
      for (const { capability: item, content } of advice) yield* residentReleaseAdviceLease(item);
      for (const item of notices) { yield* residentNotices.release(item.id); }
      return { status: "empty" };
    }
    if (decision.commands[0]?.kind !== "deliveryFinalReady") throw new Error("invalid canonical finalization");
    const composed = (yield* residentComposedDelivery.hasToken(token));
    for (const { capability: item, content } of advice) {
      const delivered = content.delivery?.findings ?? [];
      const remaining = composed ? [] : withoutDeliveredFindings(content.findings, delivered);
      const disposition = (yield* residentLedger.transition({ kind: "deliveryFindingDispositionCheck",
        composed, remaining: remaining.length }));
      if (disposition.rejection !== undefined || disposition.commands.length !== 1) throw new Error("canonical finding disposition refused");
      if (disposition.commands[0]?.kind === "deliveryKeepForReoffer") {
        yield* residentReleaseAdviceLease(item);
        continue;
      }
      if (disposition.commands[0]?.kind === "deliveryRetireAdvice") {
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
    for (const item of notices) yield* residentRemovePendingNotice(item.id, token);
    return { status: "finalized" };
  }, Effect.uninterruptible);

  const residentReleaseUnacknowledged = Effect.fn("ResidentRuntime.releaseUnacknowledged")(function* (acknowledged: boolean) {
    const result = (yield* residentLedger.transition({ kind: "deliveryReleaseCheck", acknowledged }));
    if (result.rejection !== undefined || result.commands.length !== 1) throw new Error("canonical delivery release refused");
    if (result.commands[0]?.kind === "deliveryReleaseUnacknowledged") return true;
    if (result.commands[0]?.kind === "deliveryKeepAcknowledged") return false;
    throw new Error("invalid canonical delivery release");
  });

  const releaseDelivery = Effect.fn("ResidentRuntime.releaseDelivery")(function* (token: string) {
    for (const { capability: advice, content } of (yield* residentLedger.advice.snapshots())) {
      if (content.delivery?.token === token &&
          (yield* residentReleaseUnacknowledged(content.delivery.acknowledged))) yield* residentReleaseAdviceLease(advice);
    }
    for (const notice of (yield* residentNoticesForToken(token))) {
      if (notice.delivery?.token === token &&
          (yield* residentReleaseUnacknowledged(notice.delivery.acknowledged))) {
        yield* residentNotices.release(notice.id);
      }
    }
  }, Effect.uninterruptible);

  const beginComposedSubmission = Effect.fn("ResidentRuntime.beginComposedSubmission")(function* (token: string, surface: "edit" | "background" | "stop"): Effect.fn.Return<ResidentResponse> {
    const now = residentNow();
    yield* residentExpirePending(now);
    const finishPermit = surface === "stop" && (yield* residentComposedDelivery.hasFinishPermit(token));
    if (finishPermit && (yield* residentComposedDelivery.isFinishAuthorized(token))) return { status: "empty" };
    if (!(yield* residentComposedDelivery.canBeginExistingToken(surface, token))) return { status: "empty" };
    const advice = (yield* residentLedger.advice.snapshots()).filter(({ content }) =>
      content.delivery?.token === token && content.delivery.leaseUntil > now &&
      content.delivery.findings.length > 0);
    const selectionValid = !finishPermit || (yield* residentComposedDelivery.finishSelectionMatches(token,
      advice.map(({ capability, content }) => ({ id: capability.id, unit: capability.canonicalOperationId,
        findings: content.delivery?.findings ?? [] }))));
    let allValid = selectionValid;
    for (const { capability: item, content } of advice) {
      if (!allValid) break;
      const round = item.round;
      const delivery = content.delivery;
      const unit = item.workUnitId;
      const decision = (yield* residentLedger.transition({ kind: "deliverySubmissionCandidateCheck", facts: {
        roundActive: yield* residentRoundActive(round),
        hasRound: round !== undefined,
        hasUnit: unit !== undefined,
        hasDelivery: delivery !== undefined,
        pendingCapacity: round !== undefined && unit !== undefined && delivery !== undefined &&
          delivery.findings.length <= (yield* residentPendingCanonicalFindings(item.canonicalOperationId)),
        submissionAllowed: (yield* residentComposedDelivery.canBeginSubmission(
          adviceePartition(item.observation.root, item.observation.advicee), surface, token)),
        currentWork: (yield* residentIsCurrentWork(item.revision, item.prepared)),
        credentialAuthorized: residentAdviceCredentialAuthority(item),
      } }));
      if (decision.rejection !== undefined || decision.commands.length !== 1) throw new Error("canonical submission candidate refused");
      allValid = decision.commands[0]?.kind === "deliverySubmissionCandidate";
    }
    const batch = (yield* residentLedger.transition({ kind: "deliverySubmissionBatchCheck",
      count: advice.length, allValid }));
    if (batch.rejection !== undefined || batch.commands.length !== 1) throw new Error("canonical submission batch refused");
    if (batch.commands[0]?.kind !== "deliveryBatchProceed") {
      yield* runtime.releaseComposedSubmission(token);
      return { status: "empty" };
    }
    if (surface === "stop") {
      const group = adviceePartition(advice[0]!.capability.observation.root, advice[0]!.capability.observation.advicee);
      if (!(yield* residentComposedDelivery.authorizeFinishOutput(group, token))) return { status: "empty" };
    }
    for (const { capability: item, content } of advice) {
      if (finishPermit) continue;
      if (!(yield* residentComposedDelivery.beginSubmission(
        item.id, adviceePartition(item.observation.root, item.observation.advicee),
        token, content.delivery?.findings ?? [], surface, now, item.canonicalOperationId,
      ))) {
        yield* runtime.releaseComposedSubmission(token);
        return { status: "empty" };
      }
    }
    return { status: "submitting" };
  }, Effect.uninterruptible);

  const releaseComposedSubmission = Effect.fn("ResidentRuntime.releaseComposedSubmission")(function* (token: string): Effect.fn.Return<ResidentResponse> {
    (yield* residentComposedDelivery.release(token));
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
    return Number(composed && (yield* residentComposedDelivery.hasPendingEdits(partition))) +
      work +
      (yield* residentLedger.advice.snapshots()).filter(({ capability: item, content }) =>
        (composed ? adviceePartition(item.observation.root, item.observation.advicee) === partition
          : item.partition === partition) && content.delivery !== undefined).length +
      [...(yield* residentNotices.entries()).map(([, value]) => value)].filter((notice) =>
        (composed ? notice.deliveryGroup === partition : notice.partition === partition) && notice.pending?.delivery !== undefined).length;
  });

  const residentCollectionWorkState = Effect.fn("ResidentRuntime.collectionWorkState")(function* (root: string, advicee: DirectAdvicee, composed = false): Effect.fn.Return<{ readonly status: "pending" | "empty" }> {
    return { status: (yield* residentCollectionWorkCount(root, advicee, composed)) > 0 ? "pending" : "empty" };
  });

  const whenIdle = Effect.fn("ResidentRuntime.whenIdle")(() => residentDispatcher.whenIdle());

  const pendingAdviceMetadata = Effect.fn("ResidentRuntime.pendingAdviceMetadata")(function* (): Effect.fn.Return<Effect.Success<ReturnType<ResidentRuntime["pendingAdviceMetadata"]>>> {
    return yield* Effect.forEach((yield* residentLedger.advice.snapshots()), Effect.fn("ResidentRuntime.adviceMetadata")(function* ({ capability: advice, content }) {
      const reservation = yield* residentLedger.reservationSnapshot(advice.reservation);
      if (reservation === undefined) throw new Error("advice metadata lost reservation ownership");
      return {
      id: advice.id,
      partition: advice.partition,
      sequence: advice.sequence,
      pendingAt: advice.pendingAt,
      collectionEligible: content.collectionEligible,
      retainedBytes: reservation.bytes,
      generation: advice.revision.generation,
      evaluationIdentities: content.evaluations.map(({ prepared }) => prepared.identity),
      path: advice.prepared.input.path,
      pendingFindings: content.findings.length,
      deliveryFindings: content.delivery?.findings.length ?? 0,
      delivery: content.delivery === undefined
        ? "available"
        : content.delivery.acknowledged
          ? "leased-acknowledged"
          : "leased-unacknowledged",
      } as const;
    }));
  });

  const accountingMetrics = Effect.fn("ResidentRuntime.accountingMetrics")(function* (): Effect.fn.Return<Effect.Success<ReturnType<ResidentRuntime["accountingMetrics"]>>> {
    const reuse = (yield* residentReuse.snapshot());
    const notices = yield* residentNotices.entries();
    const runtimeState = yield* residentLedger.runtime.snapshot();
    let noticeBytes = 0;
    for (const [, cooldown] of notices) {
      const reservation = yield* residentLedger.reservationSnapshot(cooldown.reservation);
      if (reservation === undefined) throw new Error("notice accounting lost reservation ownership");
      noticeBytes += reservation.bytes;
    }
    return {
      peakLedgerBytes: runtimeState.peakLedgerBytes,
      maxMaterializedPreparedUnits: runtimeState.maxMaterializedPreparedUnits,
      successfulCacheEntries: reuse.entries,
      successfulCacheBytes: reuse.bytes,
      pendingEvaluations: reuse.pending,
      operationalNoticeKeys: notices.length,
      pendingOperationalNotices: notices.filter(([, cooldown]) => cooldown.pending !== undefined).length,
      operationalNoticeBytes: noticeBytes,
    };
  });

  const residentPendingNoticeCount = Effect.fn("ResidentRuntime.pendingNoticeCount")(function* (): Effect.fn.Return<number> {
    let count = 0;
    for (const cooldown of (yield* residentNotices.entries()).map(([, value]) => value)) {
      if (cooldown.pending !== undefined) count += 1;
    }
    return count;
  });

  const residentNoticesForToken = Effect.fn("ResidentRuntime.noticesForToken")(function* (token: string): Effect.fn.Return<Array<PendingNotice>> {
    const notices: Array<PendingNotice> = [];
    for (const cooldown of (yield* residentNotices.entries()).map(([, value]) => value)) {
      if (cooldown.pending?.delivery?.token === token) notices.push(cooldown.pending);
    }
    return notices;
  });

  const residentRemovePendingNotice = Effect.fn("ResidentRuntime.removePendingNotice")((id: string, token?: string) => residentNotices.remove(id, token));

  const residentReleaseNoticeCooldown = Effect.fn("ResidentRuntime.releaseNoticeCooldown")((key: string) => residentNotices.drop(key));

  const residentPruneNoticeCooldowns = Effect.fn("ResidentRuntime.pruneNoticeCooldowns")((now: number, exceptKey?: string) => residentNotices.prune(now, exceptKey));

  const residentRecordOperationalFailure = Effect.fn("ResidentRuntime.recordOperationalFailure")(function* (observation: DirectObservation, kind: OperationalNoticeKind, now?: number): Effect.fn.Return<void> {
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active" || !addressableAdvicee(observation.advicee)) return;
    yield* residentNotices.record(adviceePartition(observation.root, observation.advicee), kind, now ?? residentNow());
  });


  const residentFindingSelectionFacts = Effect.fn("ResidentRuntime.findingSelectionFacts")(function* (
    advice: Advice, partition: string, credentialGeneration: number | null,
    now: number, composed: boolean,
  ): Effect.fn.Return<FindingSelectionFacts> {
    const partitionId = (yield* residentLedger.knownPartitionId(partition));
    if (partitionId === undefined) throw new Error("finding selection lost its resident partition identity");
    const content = yield* residentLedger.advice.current(advice);
    const generation = composed ? yield* residentComposedDelivery.generation(partition) : 0;
    return {
      partition: partitionId,
      round: generation,
      unit: advice.revision.generation,
      snapshot: advice.revision.generation,
      currentSnapshot: yield* residentLedger.revision.generation(advice.revision.subject),
      credential: advice.credentialGeneration ?? 0,
      currentCredential: credentialGeneration ?? 0,
      ageMs: Math.floor(Math.max(0, now - advice.pendingAt)),
      collectionReady: content.collectionEligible &&
        (composed && advice.round !== undefined
          ? advice.round.generation === generation : true),
    };
  });

  const residentRegisterRevision = Effect.fn("ResidentRuntime.registerRevision")(function* (partition: string, prepared: PreparedUnit, addMember: boolean): Effect.fn.Return<WorkRevision> {
    const { revision, replaced } = yield* residentLedger.revision.register(partition, prepared, addMember, randomUUID());
    if (replaced) yield* residentRetireSuperseded(revision.subject, revision.generation, addMember);
    return revision;
  }, Effect.uninterruptible);

  const residentRegisterCurrentWork = Effect.fn("ResidentRuntime.registerCurrentWork")((partition: string, prepared: PreparedUnit) =>
    residentRegisterRevision(partition, prepared, true));

  const residentRetireSuperseded = Effect.fn("ResidentRuntime.retireSuperseded")(function* (subject: string, generation: number, includeJoined: boolean) {
    const superseded = (revision: WorkRevision) => residentLedger.revision.superseded(subject, revision);
    if ((yield* residentLedger.revision.generation(subject)) !== generation) throw new Error("canonical revision changed");
    if (includeJoined) {
      for (const review of (yield* residentJoined.retireSuperseded(subject))) {
        recordActivity({ statePath: review.activityPath, root: review.observation.root,
          advicee: review.observation.advicee, lifetime: runtime.lifetime,
          stage: "unavailable", unitIdentity: review.evaluationKey });
      }
    }
    for (const advice of [...(yield* residentAdvice())]) {
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
    (yield* residentLedger.release(job.reservation));
    yield* residentReleaseCurrentWork(job.revision);
  }, Effect.uninterruptible);

  const residentRemoveAdvice = Effect.fn("ResidentRuntime.removeAdvice")(function* (id: string, token?: string) {
    const advice = (yield* residentAdvice()).find((item) => item.id === id);
    return advice !== undefined && (yield* residentLedger.advice.remove(advice,
      (yield* residentAdviceExpired(advice, residentNow())) ? "expired" : "stale", token));
  }, Effect.uninterruptible);

  const residentExpirePending = Effect.fn("ResidentRuntime.expirePending")(function* (now: number) {
    (yield* residentComposedDelivery.expire(now));
    for (const advice of [...(yield* residentAdvice())]) {
      if ((yield* residentAdviceExpired(advice, now))) yield* residentRemoveAdvice(advice.id);
    }
  }, Effect.uninterruptible);

  const sweepQuietRounds = Effect.fn("ResidentRuntime.sweepQuietRounds")((requestedNow?: number) => Effect.gen(function* () {
    const now = requestedNow ?? residentNow();
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return 0;
    yield* residentExpirePending(now);
    yield* residentPruneNoticeCooldowns(now);
    let closedCount = 0;
    for (const [group, round] of (yield* residentLedger.rounds.entries())) {
      const work = (yield* residentDispatcher.snapshotWhere(({ value }) => value.round === round && !value.completed));
      const counts = (yield* residentComposedDelivery.closureCounts(group));
      const closed = (yield* residentComposedDelivery.tickQuietRound(group, now, {
        nativeWorkIdle: work.queued === 0 && work.running === 0,
        adviceEmpty: !(yield* residentAdvice()).some((advice) => advice.round === round) &&
          ![...(yield* residentNotices.entries()).map(([, value]) => value)].some((notice) => notice.partition === group),
      }));
      if (closed !== undefined) {
        yield* residentCloseRound(group, closed, "quiescent", counts);
        closedCount += 1;
      }
    }
    return closedCount;
  }).pipe(Effect.uninterruptible));

  const residentRoundActive = Effect.fn("ResidentRuntime.roundActive")(function* (round: RoundWork | undefined): Effect.fn.Return<boolean> {
    return round === undefined || (!round.controller.signal.aborted &&
      (yield* residentComposedDelivery.isActive(round.group, round.generation)));
  });

  const residentAllowFinish = Effect.fn("ResidentRuntime.allowFinish")(function* (group: string, token: string, reason: RoundCloseReason): Effect.fn.Return<void> {
    const counts = (yield* residentComposedDelivery.closureCounts(group));
    const closed = (yield* residentComposedDelivery.finishStop(group, token, true,
      residentNow()));
    if (closed !== undefined) yield* residentCloseRound(group, closed, reason, counts);
  }, Effect.uninterruptible);

  const residentJobActive = Effect.fn("ResidentRuntime.jobActive")(function* (job: Job): Effect.fn.Return<boolean> {
    return (yield* residentLedger.runtime.snapshot()).lifecycle === "active" && !residentLifetimeController.signal.aborted &&
      !job.work?.controller.signal.aborted && (yield* residentRoundActive(job.round));
  });

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
    if (!job.analyticsDiscardReported) {
      job.analyticsDiscardReported = true;
      yield* residentRecordAnalytics(job, "work-discarded");
    }
    if (job.kind === "ingress") {
      (yield* residentLedger.observation(job.partition, job.canonicalObservationId, "interruptObservation", job.canonicalRound));
    }
    if (job.kind === "unit") {

      yield* residentSettleJoined(job.evaluationKey, "unavailable", "lost");
      yield* residentReleaseReuseClaim(job.evaluationKey);
      // An issued Jev permit remains reserved until its native Effect settles.
      if (job.requestId === undefined) yield* residentReleaseUnit(job);
    } else (yield* residentLedger.release(job.reservation));
    recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
      advicee: job.observation.advicee, lifetime: runtime.lifetime, stage: "incomplete" });
  }, Effect.uninterruptible);

  const residentCloseRound = Effect.fn("ResidentRuntime.closeRound")(function* (group: string, generation: number, reason: RoundCloseReason,
    counts: ReturnType<ComposedDelivery["closureCounts"]>): Effect.fn.Return<void> {
    // finishStop can release an unwritten provisional slot after callers took
    // the pre-cleanup snapshot. Report the final Bend reservation count.
    const reservedContinuations = (yield* residentComposedDelivery.closureCounts(group)).reservedContinuations;
    const round = (yield* residentLedger.rounds.get(group));
    const snapshot = round === undefined ? undefined : yield* residentRoundSnapshot(round);
    const activity = snapshot?.activity;
    const work = round === undefined ? { queued: 0, running: 0 }
      : (yield* residentDispatcher.snapshotWhere(({ value }) => value.round === round && !value.completed && !value.work?.controller.signal.aborted));
    if (activity !== undefined) recordRoundClosure({ statePath: activity.activityPath,
      root: activity.root, advicee: activity.advicee, lifetime: runtime.lifetime,
      roundIdentity: `${group}:${round?.canonicalRound ?? generation}`, reason, reservedContinuations,
      discarded: { queued: work.queued + (snapshot?.discarded.queued ?? 0),
        running: work.running + (snapshot?.discarded.running ?? 0), pendingAdvice: round === undefined ? 0 : (yield* residentAdvice()).filter((advice) => advice.round === round).length,
        submitted: counts.submitted, uncertain: counts.uncertain, editPermits: counts.editPermits } });
    if (round === undefined || round.generation !== generation) return;
    // The admission/output fence is already published. Abort Effect fibers and
    // their provider connections before releasing all retained round resources.
    if (snapshot === undefined) throw new Error("native round closure lost its snapshot");
    round.controller.abort();
    snapshot.work.controller.abort();
    const discarded = (yield* residentDispatcher.discardWhere(({ value }) => value.round === round));
    for (const job of discarded) yield* residentDiscardJob(job);
    for (const advice of [...(yield* residentAdvice())]) if (advice.round === round) yield* residentRemoveAdvice(advice.id);
    for (const [key, notice] of (yield* residentNotices.entries())) {
      if (notice.partition === round.group) yield* residentReleaseNoticeCooldown(key);
    }
    (yield* residentReuse.discardPartition(round.group));
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

  const residentRecordAnalytics = Effect.fn("ResidentRuntime.recordAnalytics")((
    job: Pick<Job, "observation" | "dispatch"> & { readonly analyticsEnabled?: boolean },
    kind: AnalyticsKind, findings: ReadonlyArray<Finding> = [],
  ) => Effect.sync(() => {
    const enabled = job.analyticsEnabled ?? job.dispatch.sessionAnalytics === true;
    if (!enabled || job.dispatch.activityPath === undefined) return;
    recordAnalytics({ enabled, statePath: job.dispatch.activityPath, root: job.observation.root,
      advicee: job.observation.advicee, lifetime: runtime.lifetime, kind,
      controlled: job.dispatch.controlled !== null, findings: findings.length,
      ruleIds: findings.map((finding) => finding.ruleId) });
  }));

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
        (yield* residentLedger.release(job.reservation));
        return;
      }
      if (!(yield* residentLedger.observation(job.partition, job.canonicalObservationId, "startObservation", job.canonicalRound))) {
        (yield* residentLedger.release(job.reservation));
        return;
      }
      yield* residentAwaitBackendGate();
      if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") {
        (yield* residentLedger.release(job.reservation));
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
      (yield* residentLedger.release(job.reservation));
      if (settings === undefined || (yield* residentLedger.runtime.snapshot()).lifecycle !== "active" || !(yield* residentJobActive(job))) {
        yield* residentRecordAnalytics(job, "preparation-failed");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable" });
        return;
      }

      job.analyticsEnabled = effectiveSessionAnalytics(settings.configuration.policy);

      // A candidate path is captured and analyzed only while its maximum
      // supported logical workspace is charged. Processing candidates one at
      // a time prevents a 16-path event from materializing 1,024 complete
      // inputs outside the ledger.
      for (const candidate of job.observation.candidates) {
        if (!(yield* residentJobActive(job))) return;
        const preparation = (yield* residentLedger.beginObservedPreparation(
          job.partition, job.canonicalObservationId, captureWorkspaceBytes(candidate.path), job.canonicalRound));
        if (preparation === undefined) {
          yield* residentLedger.runtime.rejectCapacity();
          yield* residentRecordAnalytics(job, "capacity-rejected");
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
                const resized = (yield* residentLedger.resize(workspace, required));
                if (!resized) {
                  yield* residentLedger.runtime.rejectCapacity();
                  yield* residentRecordAnalytics(job, "capacity-rejected");
                }
                return resized;
              }),
            });
          }),
        job.work?.controller.signal ?? residentLifetimeController.signal).pipe(Effect.onError(() => residentLedger.release(workspace)));
        if (!(yield* residentJobActive(job))) { (yield* residentLedger.release(workspace)); return; }
        const ready: Extract<(typeof prepared.outcomes)[number], { status: "ready" }>[] = [];
        for (const outcome of prepared.outcomes) {
          const offer = yield* residentLedger.preparedOffer(outcome.status === "ready", true);
          if (offer === "preparedAdmitted" && outcome.status === "ready") ready.push(outcome);
        }
        if (ready.length === 0) {
          yield* residentRecordAnalytics(job, prepared.observation.status === "incomplete"
            ? "incomplete-candidate" : "skipped-candidate");
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
          const accepted = (yield* residentLedger.preparedOffer(true,
            residentUnitWorstOutcomeBytes(outcome.prepared) <= MAX_IPC_FRAME_BYTES - 1024)) === "preparedAdmitted";
          if (!accepted) {
            yield* residentLedger.runtime.rejectCapacity();
          yield* residentRecordAnalytics(job, "capacity-rejected");
            rejectedDeliverable = true;
          }
          if (accepted) deliverable.push(outcome);
        }
        const planned = yield* Effect.forEach(deliverable, Effect.fn("ResidentRuntime.planPreparedUnit")(function* (outcome) {
          const generationPartition = `${job.partition}\0work:${job.work?.id ?? "standalone"}\0credential-generation:${job.dispatch.credential?.generation ?? "controlled"}`;
          const evaluationKey = residentReuse.key(generationPartition, outcome.prepared);
          const liveAdvice = (yield* residentAdvice()).some((advice) => advice.evaluationKey === evaluationKey);
          switch ((yield* residentReuse.route(evaluationKey, liveAdvice))) {
            case "joinedAdvice":
              return { kind: "joined" as const, join: "advice" as const, outcome, evaluationKey };
            case "joinedClaimed":
              return { kind: "joined" as const, join: "claimed" as const, outcome, evaluationKey };
            case "joinedPending": {
              const pending = (yield* residentReuse.pending(evaluationKey));
              if (pending === undefined) throw new Error("canonical reuse route lacks pending evaluation");
              pending.revision = yield* residentRestoreCurrentWork(job.partition, outcome.prepared);
              return { kind: "joined" as const, join: "pending" as const, outcome, evaluationKey };
            }
            case "cached":
              return { kind: "cached" as const, outcome, evaluationKey,
                cached: (yield* residentReuse.cached(evaluationKey)) };
            case "owner":
              unassignedClaims.add(evaluationKey);
              return { kind: "owner" as const, outcome, evaluationKey };
          }
        }));
        for (const item of planned) {
          if (item.kind === "cached") yield* residentRecordAnalytics(job, "cache-hit", item.cached.evaluation.findings);
          else if (item.kind === "joined") yield* residentRecordAnalytics(job, "joined-review");
        }
        if (planned.some((item) => item.kind === "owner")) {
          yield* withinWork(residentPreparationControls.afterReuseBoundary("ownerClaimed").pipe(
            Effect.mapError(() => new ResidentAdapterError({ operation: "owner claim barrier" }))),
          job.work?.controller.signal ?? residentLifetimeController.signal);
        }
        if (!(yield* residentJobActive(job))) { (yield* residentLedger.release(workspace)); return; }
        const retained = planned.filter((item) =>
          item.kind === "owner" || (item.kind === "cached" && item.cached.evaluation.findings.length > 0));
        const reservations = (yield* residentLedger.completePreparation(
          job.partition, preparation.operation, workspace,
          retained.map((item) =>
            residentUnitReservationBytes(pathObservation, job.dispatch, item.outcome.prepared)),
          job.canonicalRound,
        ));
        activeWorkspaces.delete(workspace);
        // Workspace has been released and all accepted unit reservations are
        // fixed, so best-effort notice retention cannot displace fresh work.
        if (rejectedDeliverable) {
          yield* residentRecordOperationalFailure(job.observation, "capacity");
          recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable" });
        }
        for (const item of planned) {
          if (item.kind === "cached" && item.cached.evaluation.findings.length === 0) {
            const revision = yield* residentRegisterCurrentWork(job.partition, item.outcome.prepared);

            yield* residentReleaseCurrentWork(revision);
            expectedActivityUnits.push(item.evaluationKey);
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "clear", unitIdentity: item.evaluationKey });
          } else if (item.kind === "joined") {
            const existing = (yield* residentAdvice()).find((advice) => advice.evaluationKey === item.evaluationKey);
            if (existing !== undefined) {
              yield* residentRecordJoinedOutcomes(yield* residentLedger.advice.publish(existing), existing.id);
              recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
                advicee: job.observation.advicee, lifetime: server.lifetime, stage: "findings",
                findings: (yield* residentLedger.advice.current(existing)).findings.length, unitIdentity: item.evaluationKey });
            } else {
              const pending = (yield* residentReuse.pending(item.evaluationKey));
              if (pending === undefined && item.join !== "claimed") {

                recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
                  advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable",
                  unitIdentity: item.evaluationKey });
              } else {
                const joined: JoinedReview = { admission: job.canonicalObservationId,
                  evaluationKey: item.evaluationKey, observation: pathObservation,
                  activityPath: job.dispatch.activityPath,
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
          if (!(yield* residentJobActive(job))) {
            for (let remaining = index; remaining < retained.length; remaining++) {
              const admitted = reservations[remaining];
              if (admitted !== undefined) (yield* residentLedger.release(admitted.reservation));
              const pending = retained[remaining];
              if (pending?.kind === "owner") yield* residentReleaseReuseClaim(pending.evaluationKey);
            }
            return;
          }
          const admitted = reservations[index];
          if (admitted === undefined) {

            if (item.kind === "owner") yield* residentReleaseReuseClaim(item.evaluationKey, "capacity");
            yield* residentLedger.runtime.rejectCapacity();
          yield* residentRecordAnalytics(job, "capacity-rejected");
            yield* residentRecordOperationalFailure(job.observation, "capacity");
            recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable" });
            continue;
          }
          const reservation = admitted.reservation;
          const revision = yield* residentRegisterCurrentWork(job.partition, item.outcome.prepared);

          const workUnitId = job.round === undefined || job.workObservationId === undefined ? undefined
            : item.kind === "cached"
              ? (yield* residentLedger.rounds.policyWork(job.round)).cachedFinding(job.workObservationId,
                item.cached.evaluation.findings.length, logicalBytes(item.cached.evaluation.findings), admitted.operation)
              : (yield* residentLedger.rounds.policyWork(job.round)).spawn(job.workObservationId, admitted.operation);
          if (job.round !== undefined && workUnitId === undefined) {

            if (item.kind === "owner") yield* residentReleaseReuseClaim(item.evaluationKey);
            (yield* residentLedger.release(reservation));
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
            analyticsEnabled: job.analyticsEnabled,
            prepared: item.outcome.prepared,
            ...(sourceHash === undefined ? {} : { sourceHash }),
            revision,
            evaluationKey: item.evaluationKey,
          };
          if (item.kind === "cached") {
            if (!(yield* residentLedger.startReview(job.partition, admitted.operation, job.canonicalRound)) ||
                !(yield* residentLedger.completeReview(job.partition, admitted.operation, reservation, "finding", job.canonicalRound))) {
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

            yield* residentReleaseReuseClaim(item.evaluationKey, "capacity");
            yield* residentReleaseUnit(unit);
            yield* residentLedger.runtime.rejectCapacity();
          yield* residentRecordAnalytics(job, "capacity-rejected");
            yield* residentRecordOperationalFailure(job.observation, "capacity");
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
      if (!(yield* residentLedger.observation(job.partition, job.canonicalObservationId, "completeObservation", job.canonicalRound))) {
        throw new Error("canonical observation completion refused");
      }
      job.completed = true;
      yield* withinWork(residentPreparationControls.afterPrepare.pipe(
        Effect.mapError(() => new ResidentAdapterError({ operation: "preparation barrier" }))),
      job.work?.controller.signal ?? residentLifetimeController.signal);
      return;
    }).pipe(
      Effect.catch(() => Effect.gen(function* () {
        yield* residentRecordAnalytics(job, "preparation-failed");
        if (runtimeConfiguration.debug) console.error("resident preparation unavailable");
        (yield* residentLedger.release(job.reservation));
        if ((yield* residentLedger.runtime.snapshot()).lifecycle === "active") recordActivity({ statePath: job.dispatch.activityPath,
          root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime,
          stage: "unavailable" });
      })),
      Effect.ensuring(Effect.gen(function* () {
        (yield* residentLedger.release(job.reservation));
        for (const workspace of activeWorkspaces) (yield* residentLedger.release(workspace));
        for (const key of unassignedClaims) yield* residentReleaseReuseClaim(key);
        if (!job.completed) (yield* residentLedger.observation(job.partition, job.canonicalObservationId, "interruptObservation", job.canonicalRound));
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
    const observeRequest = Effect.fn("ResidentRuntime.observeRequest")(function* (
      stage: JevRequestObservation["stage"], request?: number,
      outcome?: JevRequestObservation["outcome"], findings: ReadonlyArray<Finding> = [],
    ) {
      if (requestIdentity === undefined) throw new Error("Jev request observation lacks canonical identity");
      if (stage === "started") yield* residentRecordAnalytics(job, "request-started");
      if (stage === "settled" && outcome !== undefined) {
        const kinds = { clear: "request-clear", finding: "request-findings", backendFailure: "request-failed",
          timeout: "request-timeout", interrupted: "request-interrupted", neverSent: "request-never-sent" } as const;
        yield* residentRecordAnalytics(job, kinds[outcome], findings);
      }
      residentObserveJevRequest({ ...requestIdentity, stage,
        ...(request === undefined ? {} : { request }), ...(outcome === undefined ? {} : { outcome }) });
    });
    const signal = job.work?.controller.signal ?? residentLifetimeController.signal;
    const requestReady = Effect.fn("ResidentRuntime.requestReady")(function* (facts: { readonly rootValid: boolean; readonly configurationValid: boolean;
      readonly credentialReady: boolean; readonly selected: boolean; readonly currentWork: boolean;
      readonly physicalAvailable: boolean }) {
      readyReported = true;
      const decision = yield* residentLedger.readyJevRequest(job.partition,
        job.canonicalOperationId, job.reservation, facts, job.canonicalRound);
      if (decision.status !== "stale") {
        const canonicalPartition = (yield* residentLedger.knownPartitionId(job.partition));
        if (canonicalPartition === undefined) throw new Error("issued review lost its partition identity");
        requestIdentity = {
        partition: job.partition,
        canonicalPartition,
        lifetime: residentLedger.residentLifetime,
        canonicalLifetime: residentLedger.canonicalLifetime,
        round: decision.round,
        hapslandRound: job.round?.generation ?? null,
        operation: job.canonicalOperationId,
        };
      }
      if (decision.status === "issued") {
        issuedRequest = decision.request;
        job.requestId = decision.request;
        yield* observeRequest("issued", decision.request);
        yield* workInvalidated(signal).pipe(Effect.catch(() => reportInterruption()), Effect.forkScoped);
      } else if (decision.status === "unavailable") {
        yield* observeRequest("unavailable");
      }
      return decision;
    });
    const denyReady = Effect.fn("ResidentRuntime.denyReady")(function* (reason?: "credential") {
      const decision = yield* requestReady({ rootValid: false, configurationValid: false,
        credentialReady: false, selected: false, currentWork: false,
        physicalAvailable: false });
      if (decision.status === "issued") throw new Error("canonical Jev request authorized unverified facts");
      return { status: "notAuthorized" as const, reason };
    });
    const reportInterruption = Effect.fn("ResidentRuntime.reportInterruption")(function* () {
      if (issuedRequest === undefined || !requestStarted || interruptionReported) return;
      interruptionReported = yield* residentLedger.interruptJevRequest(job.partition,
        job.canonicalOperationId, issuedRequest);
      if (interruptionReported) yield* observeRequest("interrupted", issuedRequest);
    }, Effect.uninterruptible);
    return Effect.gen(function* () {
      if (job.round !== undefined && job.workUnitId !== undefined &&
          !(yield* residentLedger.rounds.policyWork(job.round)).startUnit(job.workUnitId)) {
        yield* residentReleaseReuseClaim(job.evaluationKey);
        yield* residentReleaseUnit(job);
        return;
      }
      if (!(yield* residentLedger.startReview(job.partition, job.canonicalOperationId, job.canonicalRound))) {
        yield* residentReleaseReuseClaim(job.evaluationKey);
        yield* residentReleaseUnit(job);
        return;
      }
      yield* residentAwaitBackendGate();
      if (!(yield* residentJobActive(job)) || !(yield* residentIsCurrentWork(job.revision, job.prepared))) {
        (yield* denyReady());
        yield* residentRecordAnalytics(job, "review-unavailable");
        yield* residentSettleJoined(job.evaluationKey, "unavailable", "stale");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "incomplete", unitIdentity: job.evaluationKey });
        yield* residentReleaseReuseClaim(job.evaluationKey);
        yield* residentReleaseUnit(job);
        return;
      }
      yield* withinWork(residentReviewControls.beforeEvaluate(job.prepared).pipe(
        Effect.mapError(() => new ResidentAdapterError({ operation: "evaluation barrier" }))), signal);
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
        job.analyticsEnabled = effectiveSessionAnalytics(settings.configuration.policy);
        if (job.dispatch.controlled !== null && controlled === undefined) return (yield* denyReady());
        const credentialRequired = controlled === undefined || controlled.requireCredential === true;
        if (credentialRequired && job.dispatch.credential?.name !== settings.credentialEnvVar) return (yield* denyReady("credential"));
        const dispatchCredential = job.dispatch.credential;
        if (credentialRequired && dispatchCredential === null) return (yield* denyReady("credential"));
        if (!(yield* verifyObservationRoot(job.observation))) return (yield* denyReady());
        yield* residentDispatchControls.atBoundary("authorized").pipe(
          Effect.mapError(() => new ResidentAdapterError({ operation: "authorization barrier" })));
        const credential = !credentialRequired || dispatchCredential === null
          ? undefined
          : yield* resolveCredential({
              envVar: dispatchCredential.name,
              environmentOnly: dispatchCredential.environmentOnly,
              environmentValue: dispatchCredential.environmentValue,
              expectedGeneration: dispatchCredential.generation,
              statePath: dispatchCredential.statePath,
            });
        if (credentialRequired && credential?.status !== "present") {
          return (yield* denyReady("credential"));
        }
        if (credential?.status === "present") {
          const current = readCredentialState(dispatchCredential?.statePath);
          if (current.generation !== credential.generation ||
              (credential.source === "saved" && current.savedUseSuspended)) return (yield* denyReady("credential"));
        }
        yield* residentDispatchControls.atBoundary("credentialResolved").pipe(
          Effect.mapError(() => new ResidentAdapterError({ operation: "credential barrier" })));
        if (credential?.status === "present") {
          const current = readCredentialState(dispatchCredential?.statePath);
          if (current.generation !== credential.generation ||
              (credential.source === "saved" && current.savedUseSuspended)) return (yield* denyReady("credential"));
        }
        // Prepared source can outlive its admission policy. Read authority again
        // after credential waits, then apply the current file policy before the
        // provider receives the prepared unit.
        const dispatchConfiguration = yield* loadConfiguration(
          job.observation.root,
          userConfigPath === undefined ? {} : { userConfigPath },
        );
        if (credentialRequired && dispatchCredential?.name !== dispatchConfiguration.policy.credentialEnvVar.value) return (yield* denyReady("credential"));
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
          return (yield* denyReady());
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
        const ready = yield* requestReady({
            rootValid: dispatchRootVerified, configurationValid: true,
            credentialReady: !credentialRequired || credential?.status === "present",
            selected: selected && unitCurrent, currentWork: yield* isCurrentWork(),
            physicalAvailable: yield* isJobActive(),
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
          : Clock.currentTimeMillis.pipe(
              Effect.flatMap((now) => Effect.try(() => claimDemoBudget(
                job.dispatch.demoBudgetPath ?? "",
                job.observation.root,
                encodedPreparedProviderInputBytes(job.prepared),
                now,
              ))),
            );
        const beforeDispatch = credentialAuthority.pipe(
          Effect.andThen(budgetAuthority),
          Effect.andThen(Effect.gen(function* () {
            if (!(yield* residentLedger.startJevRequest(job.partition,
              job.canonicalOperationId, ready.request))) {
              throw new Error("canonical Jev request start refused");
            }
            requestStarted = true;
            job.requestStarted = true;
            yield* observeRequest("started", ready.request);
            if (signal?.aborted) yield* reportInterruption();
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
        yield* residentRecordAnalytics(job, "review-unavailable");

        yield* residentSettleJoined(job.evaluationKey, "unavailable",
          result.reason === "credential" ? "credential" : "lost");
        if (result.reason === "credential") yield* residentRecordOperationalFailure(job.observation, "credential");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root,
          advicee: job.observation.advicee, lifetime: server.lifetime,
          stage: "unavailable", unitIdentity: job.evaluationKey });
        yield* residentReleaseReuseClaim(job.evaluationKey);
        yield* residentReleaseUnit(job);
        return;
      }
      if (!(yield* residentJobActive(job)) && issuedRequest === undefined) {
        yield* residentReleaseReuseClaim(job.evaluationKey); yield* residentReleaseUnit(job); return;
      }
      if (result?.status === "evaluated") {
        if ((yield* residentJobActive(job)) && (yield* residentLedger.runtime.snapshot()).lifecycle === "active" &&
            job.round !== undefined && job.workUnitId !== undefined &&
            !(yield* residentLedger.rounds.policyWork(job.round)).outcome(job.workUnitId, result.findings.length === 0
              ? { $: "Clear" }
              : { $: "Finding", count: result.findings.length, bytes: logicalBytes(result.findings) })) {
          throw new Error("Bend denied review outcome");
        }
        const currentWork = (yield* residentLedger.runtime.snapshot()).lifecycle === "active" && (yield* residentJobActive(job)) &&
          (yield* residentIsCurrentWork(job.revision, job.prepared));
        if (issuedRequest === undefined || !requestStarted) {
          throw new Error("Jev result without a matching canonical request command and start");
        }
        const disposition = (yield* residentLedger.settleJevRequest(job.partition, job.canonicalOperationId,
          issuedRequest, job.reservation,
          result.findings.length === 0 ? "clear" : "finding", currentWork));
        requestSettled = true;
        yield* observeRequest("settled", issuedRequest,
          result.findings.length === 0 ? "clear" : "finding", result.findings);
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
        (yield* residentReuse.put(job.partition, job.evaluationKey, evaluation));
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
      if (signal?.aborted) yield* reportInterruption();
      const observed = issuedRequest === undefined ? undefined
        : signal?.aborted && requestStarted && interruptionReported ? "interrupted"
        : !requestStarted ? "neverSent"
        : result?.status === "timeout" ? "timeout" : "backendFailure";
      const failure = (yield* residentLedger.reviewFailure(
        observed === "backendFailure" || observed === "timeout" ||
          (issuedRequest === undefined && (result?.status === "backend" || result?.status === "timeout")),
        false, observed === "neverSent" || observed === "interrupted" || result === undefined));
      if (issuedRequest === undefined) {
        if (!(yield* residentLedger.completeReview(job.partition, job.canonicalOperationId,
          job.reservation, "unavailable", job.canonicalRound))) return;
      } else {
        (yield* residentLedger.settleJevRequest(job.partition, job.canonicalOperationId,
          issuedRequest, job.reservation, observed ?? "neverSent", false));
        requestSettled = true;
        yield* observeRequest("settled", issuedRequest, observed ?? "neverSent");
      }
      if (failure === "failureBackend") {

        yield* residentSettleJoined(job.evaluationKey, "unavailable", "backend");
        yield* residentRecordOperationalFailure(job.observation, "backend");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (failure === "failureCredential") {

        yield* residentSettleJoined(job.evaluationKey, "unavailable", "credential");
        yield* residentRecordOperationalFailure(job.observation, "credential");
        recordActivity({ statePath: job.dispatch.activityPath, root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime, stage: "unavailable", unitIdentity: job.evaluationKey });
      } else if (failure === "failureLost") {

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
        if (!readyReported && (yield* residentLedger.canonicalProjection()).work.some((entry) =>
          entry.operation === job.canonicalOperationId && entry.kind === "reviewing")) {
          (yield* denyReady());
        }
        if (issuedRequest !== undefined && !requestSettled) {
          if (signal?.aborted) yield* reportInterruption();
          const observed = signal?.aborted && requestStarted && interruptionReported
            ? "interrupted" : requestStarted ? "backendFailure" : "neverSent";
          (yield* residentLedger.settleJevRequest(job.partition, job.canonicalOperationId,
            issuedRequest, job.reservation, observed, false));
          requestSettled = true;
          yield* observeRequest("settled", issuedRequest, observed);
        }

        yield* residentSettleJoined(job.evaluationKey, "unavailable", "backend");
        if (runtimeConfiguration.debug) console.error("resident evaluation unavailable");
        if ((yield* residentLedger.runtime.snapshot()).lifecycle === "active") recordActivity({ statePath: job.dispatch.activityPath,
          root: job.observation.root, advicee: job.observation.advicee, lifetime: server.lifetime,
          stage: "unavailable", unitIdentity: job.evaluationKey });
      })),
      Effect.catch(() => Effect.void),
      Effect.ensuring(Effect.gen(function* () {
        if (!job.completed) {
          yield* residentReleaseReuseClaim(job.evaluationKey);
          yield* residentReleaseUnit(job);
        }
      })),
      Effect.scoped,
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
    yield* residentRecordJoinedOutcomes(yield* residentJoined.settle(key, state, adviceId), adviceId);
  }, Effect.uninterruptible);

  const residentRecordJoinedOutcomes = Effect.fn("ResidentRuntime.recordJoinedOutcomes")(function* (outcomes: ReadonlyArray<JoinedReviewOutcome>, adviceId?: string) {
    for (const { review, stage } of outcomes) {
      recordActivity({ statePath: review.activityPath,
        root: review.observation.root, advicee: review.observation.advicee,
        lifetime: runtime.lifetime, stage,
        ...(stage !== "findings" ? {} : {
          findings: (yield* residentLedger.advice.snapshots()).find(({ capability }) => capability.id === adviceId)?.content.findings.length ?? 0,
        }), unitIdentity: review.evaluationKey });
    }
  });

  const residentRetainAdvice = Effect.fn("ResidentRuntime.retainAdvice")((
    job: UnitJob, evaluation: EvaluatedUnit, sequence: number,
  ) => {
    const server = runtime;
    return Effect.gen(function* () {
      if (!(yield* residentJobActive(job))) {
        if (job.round !== undefined && job.workUnitId !== undefined) (yield* residentLedger.rounds.policyWork(job.round)).retire(job.workUnitId);
        yield* residentReleaseUnit(job);
        return;
      }
      if ((yield* residentAdvice()).some((item) => item.evaluationKey === job.evaluationKey)) {
        const existing = (yield* residentAdvice()).find((item) => item.evaluationKey === job.evaluationKey);
        if (existing !== undefined) yield* residentRecordJoinedOutcomes(
          yield* residentLedger.advice.publish(existing), existing.id);
        if (job.round !== undefined && job.workUnitId !== undefined) (yield* residentLedger.rounds.policyWork(job.round)).retire(job.workUnitId);
        yield* residentReleaseUnit(job);
        return;
      }
      const advice = yield* residentLedger.advice.insert({
        analyticsPath: job.dispatch.activityPath,
        analyticsEnabled: job.analyticsEnabled ?? job.dispatch.sessionAnalytics === true,
        analyticsControlled: job.dispatch.controlled !== null,
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
      yield* Effect.gen(function* () {
        yield* withinWork(residentReviewControls.afterAdvicePending(advice.id).pipe(
          Effect.mapError(() => new ResidentAdapterError({ operation: "pending advice barrier" }))),
          residentLifetimeController.signal);
        // A finding already retained is excluded from unfinished-work cutoff.
        // Replacing that work cohort must not discard the completed finding.
        if (!(yield* residentJobActive(job))) return;
        yield* residentRecordJoinedOutcomes(yield* residentLedger.advice.publish(advice), advice.id);
      }).pipe(Effect.onError(() => residentRemoveAdvice(advice.id).pipe(Effect.asVoid)));
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
      yield* residentReviewControls.afterRevalidationWorkspaceReserved(advice.id).pipe(
        Effect.mapError(() => new ResidentAdapterError({ operation: "revalidation barrier" })));
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
            if (!resized) capacityUnavailable = true;
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

  const residentEditCollectionRequest = (request: EditRequest): EditCollectionRequest => ({
    requestRoute: "edit", operation: "collect", lifetime: request.lifetime,
    root: request.observation.root, advicee: request.observation.advicee,
    dispatch: request.dispatch, composed: true, mode: "ordinary",
  });

  const residentAdmitAndCollect = Effect.fn("ResidentRuntime.admitAndCollect")(function* (
    request: EditRequest, context: Ref.Ref<ResponseContext>,
  ): Effect.fn.Return<ResidentResponse, ResidentAdapterError> {
    const { observation, dispatch } = request;
    const startedAt = residentNow();
    const group = adviceePartition(observation.root, observation.advicee);
    const mode = residentCurrentClaudeFeedbackMode(observation.root, dispatch.userConfigPath);
    const admitted = yield* admit(observation, dispatch, true, true);
    if (admitted.status !== "accepted") return { requestRoute: "edit", status:
      admitted.status === "rejected-stale" ? "rejected-stale" : "rejected-capacity" };
    const authority: ResponseAuthority = Object.freeze({
      lifetime: runtime.lifetime, partition: group,
      root: observation.root, advicee: Object.freeze({ ...observation.advicee }),
      userConfigPath: dispatch.userConfigPath, claudeFeedbackMode: mode,
      credentialGeneration: dispatch.credential?.generation ?? null,
      credentialStatePath: dispatch.credential?.statePath ?? null,
      credentialRequired: dispatch.controlled === null || dispatch.controlled.requireCredential === true,
      credentialEnvironmentOnly: dispatch.credential?.environmentOnly ?? false,
      expiresAt: startedAt + 600_000, round: yield* residentLedger.rounds.get(group),
    });
    yield* Ref.set(context, { authority });
    const pass = Effect.fn("ResidentRuntime.collectEditResponse")(function* () {
      const gate = yield* residentCollectorGate(authority, dispatch, residentNow());
      if (gate !== undefined) return gate;
      const response = yield* Effect.uninterruptibleMask((restore) => restore(
        residentCollect(observation.root, observation.advicee, dispatch, "ordinary", authority, true),
      ).pipe(Effect.flatMap((response): Effect.Effect<ResidentResponse> => response.status === "advice"
        ? Ref.update(context, (state) => ({ ...state, token: response.token })).pipe(Effect.as(response))
        : Effect.succeed(response))));
      return response.status === "advice" ? response : yield* residentEditCollectionStatus(authority, observation.root, observation.advicee, true, residentNow());
    });
    return yield* pass().pipe(
      Effect.repeat({ schedule: Schedule.spaced("50 millis"), while: (response) => response.status === "pending" }),
      Effect.timeoutOrElse({ duration: request.waitMs, orElse: () => Effect.succeed<ResidentResponse>({ requestRoute: "edit", status: "pending" }) }),
      Effect.catch(() => Effect.succeed<ResidentResponse>({ requestRoute: "edit", status: "unavailable", reason: "lost" })),
    );
  });

  const residentHandle = Effect.fn("ResidentRuntime.handle")((request: ResidentRequest, responseContext?: Ref.Ref<ResponseContext>) => {
    const server = runtime;
    return Effect.gen(function* () {
      const context = responseContext ?? (yield* Ref.make<ResponseContext>({}));
      if (request.operation === "hello") {
        return residentResponse((yield* residentLedger.runtime.snapshot()).lifecycle === "active"
          ? { status: "ready", lifetime: server.lifetime, pid: process.pid }
          : { status: "obsolete-lifetime" });
      }
      if (request.lifetime !== server.lifetime || (yield* residentLedger.runtime.snapshot()).lifecycle !== "active") {
        return residentResponse(request.requestRoute === "edit"
          ? { requestRoute: "edit", status: "unavailable", reason: "lost" }
          : { status: "obsolete-lifetime" });
      }
      if (request.operation === "register-edit" || request.operation === "admit" || request.operation === "admit-and-collect" ||
          request.operation === "begin-stop") yield* sweepQuietRounds(residentNow());
      if (("advicee" in request && request.advicee.host === "opencode") ||
          ((request.operation === "admit" || request.operation === "admit-and-collect") && request.observation.advicee.host === "opencode")) return residentResponse({ status: "unsupported" });
      if (request.operation === "prompt-marker") {
        const group = adviceePartition(request.root, request.advicee);
        return residentResponse((request.onlyIfMissing === true
          ? (yield* residentComposedDelivery.ensureFromHostTurn(group, request.marker, residentNow()))
          : (yield* residentComposedDelivery.advance(group, request.marker, residentNow(), request.promptDigest)))
          ? { status: "advanced" } : { status: "rejected-capacity" });
      }
      if (request.operation === "begin-stop") {
        const group = adviceePartition(request.root, request.advicee);
        if (!(yield* residentComposedDelivery.beginStop(group, request.token))) return residentResponse({ status: "busy" });
        const expiry = yield* Effect.forkIn(Effect.sleep("5 seconds").pipe(Effect.andThen(Effect.gen(function* () {
          residentStopExpiries.delete(request.token);
          const counts = (yield* residentComposedDelivery.closureCounts(group));
          const closed = (yield* residentComposedDelivery.expireStop(group, request.token));
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
          const counts = (yield* residentComposedDelivery.closureCounts(group));
          const closed = (yield* residentComposedDelivery.finishStop(group, request.token, request.close === true,
            residentNow()));
          if (closed !== undefined) yield* residentCloseRound(group, closed, request.reason ?? "no-advice", counts);
          return residentResponse({ status: "advanced" });
        }));
      }
      if (request.operation === "claim-background") {
        return residentResponse((yield* residentComposedDelivery.claimBackground(
          adviceePartition(request.root, request.advicee), request.token, residentNow(),
        )) ? { status: "background-claimed" } : { status: "busy" });
      }
      if (request.operation === "release-background") {
        (yield* residentComposedDelivery.releaseBackground(
          adviceePartition(request.root, request.advicee), request.token,
        ));
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
        const decision = (yield* residentComposedDelivery.registerEditDecision(group, request.advicee.toolUseId,
          request.startedAt, monotonicNow(), effectiveEditPermitLimits(capture.policy),
          effectiveVirtualRoundQuietMs(capture.policy)));
        if (!decision.accepted) return residentResponse({ status: "rejected-stale", reason: decision.reason });
        return residentResponse({ status: "advanced" });
      }
      if (request.operation === "admit-and-collect") return yield* residentAdmitAndCollect(request, context);
      if (request.operation === "admit") {
        if (request.composed !== true) return residentResponse({ status: "unsupported" });
        return residentResponse(yield* admit(request.observation, request.dispatch, true, true));
      }
      if (request.operation === "collect") {
        if (request.composed !== true || (request.mode === "turn-end" &&
            (request.finish === undefined))) return residentResponse({ status: "unsupported" });
        if (request.finish !== undefined) {
          const group = adviceePartition(request.root, request.advicee);
          if (!(yield* residentComposedDelivery.ownsStop(group, request.finish.token))) return residentResponse({ status: "empty" });
          // Expired leases represent uncertain external output, not live writers.
          yield* residentPruneNoticeCooldowns(residentNow());
          for (const { capability: advice, content } of (yield* residentLedger.advice.snapshots())) {
            if (adviceePartition(advice.observation.root, advice.observation.advicee) === group &&
                content.delivery !== undefined && content.delivery.leaseUntil <= residentNow()) yield* residentReleaseAdviceLease(advice);
          }
          const round = (yield* residentLedger.rounds.get(group));
          const totalUnfinished = (yield* residentCollectionWorkCount(request.root, request.advicee, true));
          const ownUnfinished = round === undefined ? 0 : (yield* residentLedger.rounds.policyWork(round)).unfinished();
          const extraUnfinished = Math.max(0, totalUnfinished - ownUnfinished);
          const gate = (yield* residentComposedDelivery.finishGate(group, request.finish.token,
            extraUnfinished, request.finish.deadlineReached));
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
            ? (yield* residentLedger.advice.snapshots()).filter(({ content }) => content.delivery?.token === collected.token) : [];
          const selected = selectedAdvice.map(({ capability: advice, content }) => ({ id: advice.id,
            unit: advice.canonicalOperationId, findings: content.delivery?.findings ?? [] }));
          const selectedCount = selected.reduce((count, item) => count + item.findings.length, 0);
          const pendingFindings = (yield* residentLedger.canonicalProjection()).pendingFindings;
          const bindingValid = collected.status !== "advice" || collected.findingCount === 0 ||
            (round !== undefined && selectedCount === collected.findingCount &&
              selectedAdvice.every(({ capability: advice, content }) => advice.round === round &&
                advice.workUnitId !== undefined && content.delivery !== undefined &&
                content.delivery.findings.length <= (pendingFindings.find((item) => item.operation === advice.canonicalOperationId)?.count ?? 0)));
          const output = (yield* residentComposedDelivery.decideFinishOutput(group, request.finish.token,
            collected.status === "advice" ? collected.token : "", selected, residentNow(),
            collected.status === "advice" && collected.findingCount === 0,
            true, true, bindingValid, request.finish.deadlineReached));
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
          !(yield* residentComposedDelivery.hasToken(request.token))) return residentResponse({ status: "empty" });
      if (request.operation === "acknowledge") return residentResponse(yield* server.acknowledge(request.token));
      if (request.operation === "finalize") return residentResponse(yield* server.finalize(request.token));
      if (request.operation === "stats") return residentResponse(yield* server.operations.stats());
      if (request.operation === "cleanup") {
        const status = yield* cleanup();
        return residentResponse({ status });
      }
      return residentResponse({ status: "unsupported" });
    });
  });

  function residentCurrentClaudeFeedbackMode(root: string, userConfigPath: string | null): ClaudeOutputMode {
    const authority = readCurrentClaudeFeedbackAuthority(root, userConfigPath ?? undefined);
    return authority.valid ? authority.mode : "advisory";
  }

  const residentCollectorGate = Effect.fn("ResidentRuntime.collectorGate")(function* (authority: ResponseAuthority, dispatch: ResidentDispatchContext,
    now: number): Effect.fn.Return<ResidentResponse | undefined> {
    if (authority.lifetime !== runtime.lifetime || (yield* residentLedger.runtime.snapshot()).lifecycle !== "active" ||
        !(yield* residentRoundActive(authority.round))) return { requestRoute: "edit", status: "unavailable", reason: "lost" };
    const command = (yield* residentLedger.transition({ kind: "collectorGateCheck",
      expired: now >= authority.expiresAt,
      credentialValid: authority.credentialGeneration === (dispatch.credential?.generation ?? null) &&
        residentCredentialAuthority(authority) })).commands[0];
    if (command?.kind === "collectorProceed") return undefined;
    if (command?.kind === "collectorUnavailable") {
      return { requestRoute: "edit", status: "unavailable", reason: command.reason };
    }
    throw new Error("canonical authority collect gate refused");
  });

  const residentEditCollectionStatus = Effect.fn("ResidentRuntime.editCollectionStatus")(function* (authority: ResponseAuthority, root: string, advicee: DirectAdvicee,
    composed: boolean, now: number): Effect.fn.Return<ResidentResponse> {
    const partition = composed ? adviceePartition(root, advicee) : authority.partition;
    let hasAdvice = false;
    for (const item of (yield* residentAdvice())) {
      if ((composed ? adviceePartition(item.observation.root, item.observation.advicee) === partition
        : item.partition === partition) && !(yield* residentAdviceExpired(item, now))) {
        hasAdvice = true;
        break;
      }
    }
    return { requestRoute: "edit", status: hasAdvice || (yield* residentCollectionWorkCount(root, advicee, composed)) > 0
      ? "pending" : "empty" };
  });

  function residentCredentialAuthority(authority: ResponseAuthority): boolean {
    if (!authority.credentialRequired) return true;
    const credentialState = authority.credentialStatePath === null ? undefined : readCredentialState(authority.credentialStatePath);
    return credentialState !== undefined &&
      credentialState.generation === authority.credentialGeneration &&
      (authority.credentialEnvironmentOnly || !credentialState.savedUseSuspended);
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
      const variable = (operation === "collect" || operation === "admit-and-collect") && response.status === "advice" && Option.isSome(adviceGate)
        ? "REVIEW_RESIDENT_COLLECT_ADVICE_RESPONSE_GATE_PATH"
        : operation === "admit" ? "REVIEW_RESIDENT_ADMIT_RESPONSE_GATE_PATH"
        : operation === "cleanup" ? "REVIEW_RESIDENT_CLEANUP_RESPONSE_GATE_PATH"
        : operation === "collect" || operation === "admit-and-collect" ? "REVIEW_RESIDENT_COLLECT_RESPONSE_GATE_PATH"
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
      for (const advice of (yield* residentAdvice())) {
        if ((yield* residentLedger.advice.current(advice)).delivery?.token !== response.token) continue;
        const relativePath = advice.prepared.input.path;
        const captured = yield* captureStable(advice.observation.root, {
          relativePath, absolutePath: resolve(advice.observation.root, relativePath),
        }, {}, advice.observation.rootIdentity);
        current.set(advice.id, advice.sourceHash !== undefined && captured?.contentHash === advice.sourceHash);
      }
      return current;
    });
  });

  const residentResponseForHandoff = Effect.fn("ResidentRuntime.responseForHandoff")(function* (request: HandoffRequest, response: ResidentResponse,
    sourceCurrent: ReadonlyMap<string, boolean>, authority?: ResponseAuthority): Effect.fn.Return<ResidentResponse> {
    if (response.status !== "advice") {
      if (request.requestRoute === "shared" && request.operation === "collect" && request.requestRoute === "shared" && request.finish === undefined && request.reportWorkState === true &&
          (response.status === "empty" || response.status === "pending")) {
        return (yield* residentCollectionWorkState(request.root, request.advicee, request.composed === true));
      }
      if (request.requestRoute !== "edit" || request.operation !== "collect" ||
          (response.status !== "pending" && response.status !== "empty")) return response;
      const now = residentNow();
      yield* residentExpirePending(now);
      yield* residentPruneNoticeCooldowns(now);
      if (authority === undefined) return { requestRoute: "edit", status: "unavailable", reason: "lost" };
      return (yield* residentCollectorGate(authority, request.dispatch, now)) ??
        (yield* residentEditCollectionStatus(authority, request.root, request.advicee,
          request.composed === true, now));
    }
    const now = residentNow();
    yield* residentExpirePending(now);
    yield* residentPruneNoticeCooldowns(now);
    const sharedCollect = request.operation === "collect";
    let invalidCredential = false;
    if (request.operation === "collect") for (const advice of (yield* residentAdvice())) {
      if (invalidCredential || (yield* residentLedger.advice.current(advice)).delivery?.token !== response.token) continue;
      const generationValid = advice.credentialGeneration === (request.dispatch.credential?.generation ?? null);
      const observed: Effect.Success<ReturnType<typeof residentLedger.transition>> = (yield* residentLedger.transition({ kind: "deliveryCredentialObserveCheck",
        invalidSeen: invalidCredential, generationValid,
        authorized: generationValid && residentAdviceCredentialAuthority(advice) }));
      if (observed.rejection !== undefined || observed.commands.length !== 1) throw new Error("canonical credential observation refused");
      invalidCredential = observed.commands[0]?.kind === "deliveryCredentialInvalid";
    }
    const credentialGate = (yield* residentLedger.transition({ kind: "deliveryFinalCredentialCheck",
      sharedCollect, invalidSeen: invalidCredential }));
    if (credentialGate.rejection !== undefined || credentialGate.commands.length !== 1) throw new Error("canonical final credential gate refused");
    if (credentialGate.commands[0]?.kind !== "deliveryBatchProceed") {
      yield* runtime.releaseComposedSubmission(response.token);
      return request.requestRoute === "edit"
        ? { requestRoute: "edit", status: "unavailable", reason: "credential" } : { status: "empty" };
    }
    const handoff: Array<Advice> = [];
    for (const advice of [...(yield* residentAdvice())]) {
      if ((yield* residentLedger.advice.current(advice)).delivery?.token !== response.token) continue;
      const route = (yield* residentCandidateRoute({ kind: "finalCandidateCheck",
        ownerCurrent: true, credentialGeneration: true, credentialAuthorized: true,
        expired: !(yield* residentRoundActive(advice.round)) || (yield* residentAdviceExpired(advice, now)),
        workCurrent: (yield* residentIsCurrentWork(advice.revision, advice.prepared)) && sourceCurrent.get(advice.id) === true,
        hasFindings: ((yield* residentLedger.advice.current(advice)).delivery?.findings.length ?? 0) > 0 }));
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
    if (request.requestRoute === "edit" && request.operation === "collect" && authority === undefined) {
      yield* runtime.releaseDelivery(response.token);
      return { requestRoute: "edit", status: "unavailable", reason: "lost" };
    }
    if (request.operation === "collect") {
      const composed = request.composed === true;
      const partition = adviceePartition(request.root, request.advicee);
      const generation = request.dispatch.credential?.generation ?? null;
      if (composed) for (const advice of handoff) {
        const { delivery } = yield* residentLedger.advice.current(advice);
        if (delivery !== undefined && (advice.round === undefined ||
            advice.workUnitId === undefined ||
            delivery.findings.length > (yield* residentPendingCanonicalFindings(advice.canonicalOperationId)))) {
          yield* residentReleaseAdviceLease(advice);
        }
      }
      const offers = (yield* Effect.forEach(handoff, Effect.fn("ResidentRuntime.finalOffers")(function* (advice) {
        const facts = yield* residentFindingSelectionFacts(advice, partition, generation, now, composed);
        const { delivery } = yield* residentLedger.advice.current(advice);
        return (delivery?.findings ?? []).map((finding) => ({ finding, facts }));
      }))).flat();
      const claudeSurface = composed && authority === undefined && request.advicee.host === "claude-code" && request.mode === "turn-end" ? "stop" : undefined;
      const accepted = new Set((yield* selectFittingCurrentFindingIndices(offers,
        authority === undefined ? claudeSurface === undefined ? "codex" :
          "claude-stop" : authority.claudeFeedbackMode,
        undefined, residentCollectionFindingOffer)));
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
    const notices = (yield* residentNoticesForToken(response.token));
    if (request.operation === "collect" && request.requestRoute === "shared" && request.composed === true &&
        request.advicee.host === "claude-code" && request.mode === "turn-end") {
      const fit = (yield* residentLedger.transition({ kind: "collectionFitCheck",
        items: findings.length + notices.length,
        bytes: encodedClaudeStopOutputBytes(findings, notices.map((notice) => notice.value)) }));
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
      yield* residentNotices.renew(notice.id, now + DELIVERY_LEASE_MS);
    }
    if (authority !== undefined && request.operation === "collect") {
      const gate = yield* residentCollectorGate(authority, request.dispatch, now);
      if (gate !== undefined) {
        yield* runtime.releaseDelivery(response.token);
        return gate;
      }
    }
    const admittedBlock = authority?.claudeFeedbackMode === "block-current-findings";
    const currentBlock = admittedBlock && authority !== undefined &&
      residentCurrentClaudeFeedbackMode(authority.root, authority.userConfigPath) === "block-current-findings";
    if (authority !== undefined && request.operation === "collect" && request.requestRoute === "edit" &&
        (yield* residentLedger.transition({ kind: "collectorFinalAuthorityCheck", admittedBlock,
      currentBlock })).commands[0]?.kind !== "collectorFinalProceed") {
      // A revoked opt-in cannot turn the old selection into an advisory lease.
      yield* runtime.releaseDelivery(response.token);
      return (yield* residentEditCollectionStatus(authority, request.root, request.advicee,
        request.composed === true, now));
    }
    const selected: ResidentResponse = findings.length === 0 && notices.length === 0
      ? { status: "empty" }
      : authority === undefined
        ? { status: "advice", token: response.token, findingCount: findings.length,
            output: combinedReviewOutput(findings, notices.map((notice) => notice.value)) }
        : { requestRoute: "edit", status: "advice", token: response.token, findingCount: findings.length,
            output: combinedClaudeOutput(findings, notices.map((notice) => notice.value), authority.claudeFeedbackMode) };
    if (request.requestRoute !== "edit" || request.operation !== "collect") return selected;
    if (authority === undefined) return { requestRoute: "edit", status: "unavailable", reason: "lost" };
    return selected.status === "advice" ? { ...selected, requestRoute: "edit" }
      : (yield* residentEditCollectionStatus(authority, request.root, request.advicee,
          request.composed === true, now));
  }, Effect.uninterruptible);

  const residentReconcileFinishHandoff = Effect.fn("ResidentRuntime.reconcileFinishHandoff")(function* (request: ResidentRequest, provisional: ResidentResponse,
    final: ResidentResponse, canWrite: boolean): Effect.fn.Return<ResidentResponse> {
    if (request.operation !== "collect" || request.finish === undefined ||
        provisional.status !== "advice" || provisional.findingCount === 0) return final;
    const group = adviceePartition(request.root, request.advicee);
    if (!(yield* residentComposedDelivery.revokeProvisionalFinishOutput(group, request.finish.token, provisional.token))) {
      yield* runtime.releaseDelivery(provisional.token);
      yield* residentAllowFinish(group, request.finish.token, "unavailable");
      return { status: "empty" };
    }
    const round = (yield* residentLedger.rounds.get(group));
    const selectedAdvice = final.status === "advice"
      ? (yield* residentLedger.advice.snapshots()).filter(({ content }) => content.delivery?.token === final.token) : [];
    const selectedCount = selectedAdvice.reduce((count, { content }) =>
      count + (content.delivery?.findings.length ?? 0), 0);
    const selected = selectedAdvice.map(({ capability: advice, content }) => ({ id: advice.id, unit: advice.canonicalOperationId,
      findings: content.delivery?.findings ?? [] }));
    const pendingFindings = (yield* residentLedger.canonicalProjection()).pendingFindings;
    const bindingValid = final.status !== "advice" || final.findingCount === 0 ||
      (round !== undefined && selectedCount === final.findingCount && selectedAdvice.every(({ capability: advice, content }) =>
        advice.round === round && advice.workUnitId !== undefined && content.delivery !== undefined &&
        content.delivery.findings.length <= (pendingFindings.find((item) => item.operation === advice.canonicalOperationId)?.count ?? 0)));
    const output = (yield* residentComposedDelivery.decideFinishOutput(group, request.finish.token,
      final.status === "advice" ? final.token : "", selected, residentNow(),
      final.status === "advice" && final.findingCount === 0,
      false, canWrite && final.status === "advice" && final.token === provisional.token,
      bindingValid, request.finish.deadlineReached));
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
    if (decoded.operation === "admit-and-collect") yield* port.setIdleTimeout(EDIT_REQUEST_DEADLINE_MS);
    yield* residentPruneCollectionTokenIds();
    const server = runtime;
    const context = yield* Ref.make<ResponseContext>({});
    let responseToken: string | undefined;
    let handedToTransport = false;
    const respond = Effect.gen(function* () {
      const response = yield* residentHandle(decoded, context);
      if (response.status === "advice") responseToken = response.token;
      yield* residentResponseGate(decoded.operation, response);
      yield* residentReviewControls.beforeResponseHandoff().pipe(
        Effect.mapError(() => new ResidentAdapterError({ operation: "response handoff barrier" })));
      const sourceCurrent = yield* residentHandoffSourceCurrent(response);
      // Keep final authorization and socket handoff within one ownership
      // boundary; the response finalizer owns any untransferred lease.
      yield* Effect.uninterruptible(Effect.gen(function* () {
        const authority = (yield* Ref.get(context)).authority;
        const request = decoded.operation === "admit-and-collect" ? residentEditCollectionRequest(decoded) : decoded;
        const selected = yield* residentResponseForHandoff(request, response, sourceCurrent, authority);
        const handoff = yield* residentReconcileFinishHandoff(decoded, response, selected, port.canWrite());
        yield* residentPruneCollectionTokenIds();
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
        const token = (yield* Ref.get(context)).token ?? responseToken;
        if ((!handedToTransport || port.errored()) && token !== undefined) yield* server.releaseDelivery(token);
        yield* Ref.set(context, {});
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
    yield* Effect.forkIn(Effect.sleep("10 millis").pipe(Effect.andThen(runtime.close)), residentRuntimeScope);
  });

  const residentScheduleIdleCheck = Effect.fn("ResidentRuntime.scheduleIdleCheck")(function* () {
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return;
    const pass = Effect.gen(function* () {
      if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return true;
      if ((yield* residentLedger.runtime.snapshot()).connections === 0 && (yield* cleanup()) === "cleaned") {
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
    if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return;
    const pass = Effect.gen(function* () {
      if ((yield* residentLedger.runtime.snapshot()).lifecycle !== "active") return true;
      yield* sweepQuietRounds(residentNow());
      return false;
    });
    yield* FiberHandle.run(residentQuietChecks,
      Effect.sleep(VIRTUAL_ROUND_QUIET_CHECK_MS).pipe(Effect.andThen(pass.pipe(
        Effect.repeat({ schedule: Schedule.spaced(VIRTUAL_ROUND_QUIET_CHECK_MS), until: (retiring) => retiring }),
        Effect.asVoid,
      ))));
  });

  const listen = Effect.fn("ResidentIpc.listen")(() => {
    const owner = runtime;
    // Endpoint publication is a bounded acquisition. Signal interruption must
    // wait for binding to settle so its owning finalizer can remove the socket.
    return Effect.uninterruptible(Effect.gen(function* () {
      if (process.platform !== "linux" && process.platform !== "darwin") {
        return yield* Effect.fail(new ResidentAdapterError({ operation: "resident IPC requires Linux or macOS" }));
      }
      yield* prepareResidentDirectory(owner.paths).pipe(
        Effect.mapError(() => new ResidentAdapterError({ operation: "prepare resident directory" })));
      // The launcher holds the live-owner directory. A socket pathname alone is
      // never treated as ownership evidence.
      yield* verifyRemovableSocket(owner.paths).pipe(
        Effect.mapError(() => new ResidentAdapterError({ operation: "verify removable socket" })));
      yield* residentAdapter("remove stale socket", () => rm(owner.paths.socket, { force: true }));
      const runSocket = Effect.runForkWith(yield* Effect.context());
      const server = createServer((socket) => {
        if (!server.listening) { socket.destroy(); return; }
        // This native callback only starts a fiber in the socket owner scope.
        runSocket(Effect.forkIn(residentAccept(socket), residentIpcScope, { startImmediately: true }));
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
        else (yield* residentLedger.release(job.reservation));
      }
      for (const advice of (yield* residentAdvice())) yield* residentRemoveAdvice(advice.id);
      for (const key of [...(yield* residentNotices.entries()).map(([key]) => key)]) yield* residentReleaseNoticeCooldown(key);
      // Running work may be interrupted by process exit or finish later. Clear
      // its logical ownership after native effects settle. Issued Jev permits
      // remain reserved through an interruption attempt.
      (yield* residentReuse.clear());
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
      yield* residentLedger.clear();
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
  const close = yield* Effect.cached(Effect.suspend(() => residentDispose()));
  const residentDispatcher: Dispatcher<string, Job> = yield* makeDispatcher<string, Job>(
    residentLedger,
    (job) => ({ operation: job.kind === "ingress" ? job.canonicalObservationId : job.canonicalOperationId,
      round: job.canonicalRound }),
    (entry) => residentRun(entry.value, entry.sequence),
  ).pipe(Effect.provideService(Scope.Scope, residentDispatchScope));
  const operations = Object.freeze(ResidentRuntimeService.of({
    lifetime,
    paths,
    listen: listen,
    close: close,
    handle: residentHandle,
    stats: stats,
    whenIdle,
  }));
  const runtime: ResidentRuntime = Object.freeze({ operations, lifetime, paths, stats, cleanup, admit, collect, acknowledge, finalize, releaseDelivery, beginComposedSubmission, releaseComposedSubmission, whenIdle, pendingAdviceMetadata, accountingMetrics, sweepQuietRounds, handle: residentHandle, listen, close });
  yield* Effect.addFinalizer(() => close.pipe(Effect.orDie));
  return runtime;
});

export const residentRuntimeLayer = (paths: ResidentPaths, now: () => number = monotonicNow, options: ResidentRuntimeOptions = {}) =>
  Layer.effect(ResidentRuntimeService, makeResidentRuntime(paths, now, options).pipe(Effect.map((runtime) => runtime.operations)));
