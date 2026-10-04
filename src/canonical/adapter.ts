import * as Schema from "effect/Schema";
import {
  decoder,
  readRecord,
  readTag,
  readNat,
  readPositiveNat,
  readBytes,
  readBool,
  readBendList,
  Probability,
  ProbabilityWordsSchema,
} from "./boundary-schema.ts";
import { decodeCanonicalConstructor, decodeCanonicalRejection } from "./constructors.ts";
import {
  CanonicalEventSchema,
  CanonicalLimitsSchema,
  type JevRequestOutcome,
  type CompletedEditReason,
  type QuietRoundFacts,
  type CapacityPurpose,
  type CollectorReason,
  type ReuseMemberState,
  type ProspectiveFacts,
  type CleanupFacts,
  type CapacityRefusal,
  type CapacityCharge,
  type CapacityView,
  type DispatchEntry,
  type CanonicalProjection,
  type CanonicalCommand,
  type CanonicalEvent,
} from "./models.ts";
export type {
  JevRequestOutcome,
  CompletedEditReason,
  QuietRoundFacts,
  CapacityPurpose,
  CollectorReason,
  ReuseMemberState,
  ProspectiveFacts,
  CleanupFacts,
  CapacityRefusal,
  CapacityCharge,
  CapacityView,
  CanonicalProjection,
  CanonicalCommand,
  CanonicalEvent,
} from "./models.ts";
import { freezeCanonicalData } from "./immutable.ts";
import {
  bendCanonicalInitial,
  bendCanonicalInventory,
  bendCanonicalPartitionUsage,
  bendCanonicalStep,
  bendCanonicalTotal,
  bendPreparationLimit,
  bendJevRequestLimit,
} from "./canonical.generated.js";

// Keep reserved + requested bytes within Bend's 48-bit immediate Nat range.
export const CANONICAL_MAX_BYTES = 2 ** 47 - 1;
export const CANONICAL_MAX_UNITS = 1024;

const completedEditTags: Record<CompletedEditReason, string> = {
  consumed: "Consumed",
  released: "Released",
  expired: "Expired",
  closed: "Closed",
};
const encodeCompletedEditReason = (reason: CompletedEditReason): unknown => ({
  $: `EditHistory.${completedEditTags[reason]}`,
});
const decodeCompletedEditReason = (value: unknown): CompletedEditReason => {
  const entry = (Object.entries(completedEditTags) as [CompletedEditReason, string][]).find(
    ([, name]) => tag(value) === `EditHistory.${name}`,
  );
  if (entry === undefined) throw new TypeError("invalid completed edit reason");
  decodeCanonicalConstructor(value, `EditHistory.${entry[1]}`);
  return entry[0];
};
const object = readRecord;
const tag = (value: unknown): string => {
  try {
    return readTag(value).$;
  } catch (cause) {
    throw new TypeError("missing canonical constructor", { cause });
  }
};
const nat = (value: unknown, positive = false): number => (positive ? readPositiveNat(value) : readNat(value));
const bytes = readBytes;
const bool = readBool;
const ruleOrderTag = (value: "before" | "equal" | "after"): string => {
  return `RulePolicy.${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
};
declare const probabilityWordsBrand: unique symbol;
export type ProbabilityWords = Readonly<{
  high: number;
  low: number;
  [probabilityWordsBrand]: true;
}>;
export const probabilityWords = (value: number): ProbabilityWords => {
  if (!Schema.is(Probability)(value)) {
    throw new RangeError("probability must be finite in [0, 1]");
  }
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, Object.is(value, -0) ? 0 : value, false);
  return { high: bytes.getUint32(0, false), low: bytes.getUint32(4, false) } as ProbabilityWords;
};
const encodedProbabilityWords = (value: typeof ProbabilityWordsSchema.Type): unknown => ({
  $: "RulePolicy.Words",
  high: value.high,
  low: value.low,
});
const list = (values: readonly number[]): unknown =>
  values.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
const readList = <T>(value: unknown, decode: (item: unknown) => T, limit = 2048): T[] =>
  readBendList(value, decode, limit);

const encodeFacts = (facts: ProspectiveFacts): unknown => {
  return {
    $: "Admission.ProspectiveFacts",
    clock_valid: facts.clockValid,
    hook_window: facts.hookWindow,
    started_upper: facts.startedUpper,
    now_lower: facts.nowLower,
    advicee_permit_limit: facts.adviceePermitLimit,
    resident_permit_limit: facts.residentPermitLimit,
  };
};

const encodePurpose = (value: CapacityPurpose): unknown => {
  const names: Record<CapacityPurpose, string> = {
    observationDispatch: "Ledger.ObservationDispatch",
    preparation: "Ledger.Preparation",
    reviewUnit: "Ledger.ReviewUnit",
    storedResult: "Ledger.StoredResult",
    operationalNotice: "Ledger.OperationalNotice",
    adviceRecheck: "Ledger.AdviceRecheck",
  };
  const name = names[value];
  return { $: name };
};
const identity = (event: Extract<CanonicalEvent, { readonly partition: number; readonly lifetime: number }>) => ({
  partition: event.partition,
  lifetime: event.lifetime,
});
const submissionSurface = (surface: "edit" | "background" | "stop"): unknown => {
  const name = { edit: "Handoff.Edit", background: "Handoff.Background", stop: "Handoff.Stop" }[surface];
  return { $: name };
};
const deliverySurface = (surface: "edit" | "background" | "stop"): unknown => {
  const name = { edit: "Delivery.Edit", background: "Delivery.Background", stop: "Delivery.Stop" }[surface];
  return { $: name };
};
const collectorReason = (reason: CollectorReason): unknown => {
  const name = {
    backend: "Backend",
    credential: "Credential",
    capacity: "Capacity",
    stale: "Stale",
    lost: "Lost",
    expired: "Expired",
  }[reason];
  return { $: `CollectorAuthority.${name}` };
};
const reuseMemberState = (state: ReuseMemberState): unknown => {
  const name = {
    pending: "JoinedPending",
    clear: "JoinedClear",
    finding: "JoinedFinding",
    unavailable: "JoinedUnavailable",
  }[state];
  return { $: `Reuse.${name}` };
};
const jevOutcomeTags: Record<JevRequestOutcome, string> = {
  neverSent: "NeverSent",
  finding: "RequestFinding",
  clear: "RequestClear",
  backendFailure: "RequestBackendFailure",
  timeout: "RequestTimeout",
  interrupted: "RequestInterrupted",
};
const encodeJevRequestOutcome = (outcome: JevRequestOutcome): unknown => {
  const name = jevOutcomeTags[outcome];
  return { $: `Canonical.${name}` };
};
const decodeJevRequestOutcome = (value: unknown): JevRequestOutcome => {
  const name = tag(value);
  const outcome = (Object.entries(jevOutcomeTags) as [JevRequestOutcome, string][]).find(
    ([, variant]) => name === `Canonical.${variant}`,
  )?.[0];
  if (outcome === undefined) throw new TypeError("invalid Jev request outcome");
  decodeCanonicalConstructor(value, name);
  return outcome;
};
const decodeEvent = decoder(CanonicalEventSchema);
const encodeReserveCapacity = (event: Extract<CanonicalEvent, { kind: "reserveCapacity" }>): unknown => {
  return {
    $: "Canonical.ReserveCapacity",
    partition: event.partition,
    bytes: event.bytes,
    purpose: encodePurpose(event.purpose),
  };
};
const encodeResizeCapacity = (event: Extract<CanonicalEvent, { kind: "resizeCapacity" }>): unknown => {
  return {
    $: "Canonical.ResizeCapacity",
    reservation: event.reservation,
    bytes: event.bytes,
    purpose: encodePurpose(event.purpose),
  };
};
const encodeReleaseCapacity = (event: Extract<CanonicalEvent, { kind: "releaseCapacity" }>): unknown => {
  return { $: "Canonical.ReleaseCapacity", reservation: event.reservation };
};
const encodeReplaceCapacity = (event: Extract<CanonicalEvent, { kind: "replaceCapacity" }>): unknown => {
  return { $: "Canonical.ReplaceCapacity", reservation: event.reservation, unit_bytes: list(event.unitBytes) };
};
const encodeIssuePermit = (event: Extract<CanonicalEvent, { kind: "issuePermit" }>): unknown => {
  return {
    $: "Canonical.IssuePermit",
    ...identity(event),
    tool: event.tool,
    started: event.started,
    deadline: event.deadline,
    now: event.now,
    minimum_started: event.minimumStarted,
    facts: encodeFacts(event.facts),
  };
};
const encodeCheckCompletedEdit = (event: Extract<CanonicalEvent, { kind: "checkCompletedEdit" }>): unknown => {
  return { $: "Canonical.CheckCompletedEdit", tool: event.tool };
};
const encodeRememberCompletedEdit = (event: Extract<CanonicalEvent, { kind: "rememberCompletedEdit" }>): unknown => {
  return { $: "Canonical.RememberCompletedEdit", tool: event.tool, reason: encodeCompletedEditReason(event.reason) };
};
const encodeQuietRoundTick = (event: Extract<CanonicalEvent, { kind: "quietRoundTick" }>): unknown => {
  return {
    $: "Canonical.QuietRoundTick",
    ...identity(event),
    round: event.round,
    now: event.now,
    window: event.window,
    facts: {
      $: "Quiescence.Facts",
      native_work_idle: event.facts.nativeWorkIdle,
      advice_empty: event.facts.adviceEmpty,
      handoff_idle: event.facts.handoffIdle,
      stop_absent: event.facts.stopAbsent,
    },
  };
};
const encodeQuietRoundReset = (event: Extract<CanonicalEvent, { kind: "quietRoundReset" }>): unknown => {
  return { $: "Canonical.QuietRoundReset", ...identity(event), round: event.round };
};
const encodeConsumePermit = (event: Extract<CanonicalEvent, { kind: "consumePermit" }>): unknown => {
  return { $: "Canonical.ConsumePermit", ...identity(event), token: event.token, tool: event.tool, now: event.now };
};
const encodeReleasePermit = (event: Extract<CanonicalEvent, { kind: "releasePermit" }>): unknown => {
  return { $: "Canonical.ReleasePermit", ...identity(event), token: event.token };
};
const encodeExpirePermit = (event: Extract<CanonicalEvent, { kind: "expirePermit" }>): unknown => {
  return {
    $: "Canonical.ExpirePermit",
    ...identity(event),
    token: event.token,
    deadline_reached: event.deadlineReached,
  };
};
const encodeClosePermitRound = (event: Extract<CanonicalEvent, { kind: "closePermitRound" }>): unknown => {
  return { $: "Canonical.ClosePermitRound", ...identity(event), round: event.round, at: event.at };
};
const encodeForgetAdmission = (event: Extract<CanonicalEvent, { kind: "forgetAdmission" }>): unknown => {
  return { $: "Canonical.ForgetAdmission", ...identity(event) };
};
const encodeOpenRound = (event: Extract<CanonicalEvent, { kind: "openRound" }>): unknown => {
  return { $: "Canonical.OpenRound", ...identity(event) };
};
const encodeAdmitObservation = (event: Extract<CanonicalEvent, { kind: "admitObservation" }>): unknown => {
  return { $: "Canonical.AdmitObservation", ...identity(event), round: event.round };
};
const encodeStartObservation = (
  event: Extract<CanonicalEvent, { kind: "startObservation" | "completeObservation" | "interruptObservation" }>,
): unknown => {
  const name = {
    startObservation: "StartObservation",
    completeObservation: "CompleteObservation",
    interruptObservation: "InterruptObservation",
  }[event.kind];
  return { $: `Canonical.${name}`, ...identity(event), round: event.round, observation: event.observation };
};
const encodeBeginPreparation = (event: Extract<CanonicalEvent, { kind: "beginPreparation" }>): unknown => {
  return { $: "Canonical.BeginPreparation", ...identity(event), round: event.round, bytes: event.bytes };
};
const encodeBeginObservedPreparation = (
  event: Extract<CanonicalEvent, { kind: "beginObservedPreparation" }>,
): unknown => {
  return {
    $: "Canonical.BeginObservedPreparation",
    ...identity(event),
    round: event.round,
    observation: event.observation,
    bytes: event.bytes,
  };
};
const encodeInterruptPreparation = (event: Extract<CanonicalEvent, { kind: "interruptPreparation" }>): unknown => {
  return { $: "Canonical.InterruptPreparation", ...identity(event), round: event.round, operation: event.operation };
};
const encodePreparationCompleted = (event: Extract<CanonicalEvent, { kind: "preparationCompleted" }>): unknown => {
  return {
    $: "Canonical.PreparationCompleted",
    ...identity(event),
    round: event.round,
    operation: event.operation,
    unit_bytes: list(event.unitBytes),
  };
};
const encodeStartReview = (event: Extract<CanonicalEvent, { kind: "startReview" | "retireReview" }>): unknown => {
  return {
    $: event.kind === "startReview" ? "Canonical.StartReview" : "Canonical.RetireReview",
    ...identity(event),
    round: event.round,
    operation: event.operation,
  };
};
const encodeJevRequestReady = (event: Extract<CanonicalEvent, { kind: "jevRequestReady" }>): unknown => {
  return {
    $: "Canonical.JevRequestReady",
    ...identity(event),
    round: event.round,
    operation: event.operation,
    root_valid: event.rootValid,
    configuration_valid: event.configurationValid,
    credential_ready: event.credentialReady,
    selected: event.selected,
    current_work: event.currentWork,
    physical_available: event.physicalAvailable,
  };
};
const encodeJevRequestStarted = (
  event: Extract<CanonicalEvent, { kind: "jevRequestStarted" | "jevRequestInterrupted" }>,
): unknown => {
  return {
    $: event.kind === "jevRequestStarted" ? "Canonical.JevRequestStarted" : "Canonical.JevRequestInterrupted",
    ...identity(event),
    round: event.round,
    operation: event.operation,
    request: event.request,
  };
};
const encodeJevRequestSettled = (event: Extract<CanonicalEvent, { kind: "jevRequestSettled" }>): unknown => {
  return {
    $: "Canonical.JevRequestSettled",
    ...identity(event),
    round: event.round,
    operation: event.operation,
    request: event.request,
    outcome: encodeJevRequestOutcome(event.outcome),
    current_work: event.currentWork,
  };
};
const encodeReviewCompleted = (event: Extract<CanonicalEvent, { kind: "reviewCompleted" }>): unknown => {
  const outcome = {
    finding: "Canonical.Finding",
    clear: "Canonical.Clear",
    unavailable: "Canonical.Unavailable",
    interrupted: "Canonical.Interrupted",
    discarded: "Canonical.Discarded",
  }[event.outcome];
  return {
    $: "Canonical.ReviewCompleted",
    ...identity(event),
    round: event.round,
    operation: event.operation,
    outcome: { $: outcome },
  };
};
const encodeReviewObserved = (event: Extract<CanonicalEvent, { kind: "reviewObserved" }>): unknown => {
  return {
    $: "Canonical.ReviewObserved",
    ...identity(event),
    round: event.round,
    operation: event.operation,
    outcome: { $: event.outcome === "finding" ? "Canonical.Finding" : "Canonical.Clear" },
    current_work: event.currentWork,
  };
};
const encodeFindingCountUpdated = (event: Extract<CanonicalEvent, { kind: "findingCountUpdated" }>): unknown => {
  return {
    $: "Canonical.FindingCountUpdated",
    ...identity(event),
    round: event.round,
    operation: event.operation,
    count: event.count,
  };
};
const encodeQueueDispatch = (
  event: Extract<CanonicalEvent, { kind: "queueDispatch" | "dispatchSettled" }>,
): unknown => {
  return {
    $: event.kind === "queueDispatch" ? "Canonical.QueueDispatch" : "Canonical.DispatchSettled",
    ...identity(event),
    round: event.round,
    operation: event.operation,
  };
};
const encodeDiscardDispatch = (event: Extract<CanonicalEvent, { kind: "discardDispatch" }>): unknown => {
  return { $: "Canonical.DiscardDispatch", operations: list(event.operations) };
};
const encodeDispatchScopeCheck = (event: Extract<CanonicalEvent, { kind: "dispatchScopeCheck" }>): unknown => {
  return {
    $: "Canonical.DispatchScopeCheck",
    named_count: event.namedCount,
    cancelled_count: event.cancelledCount,
    has_unnamed: event.hasUnnamed,
  };
};
const encodeCloseDispatch = (event: Extract<CanonicalEvent, { kind: "closeDispatch" }>): unknown => {
  return { $: "Canonical.CloseDispatch" };
};
const encodePreparedOfferCheck = (event: Extract<CanonicalEvent, { kind: "preparedOfferCheck" }>): unknown => {
  return { $: "Canonical.PreparedOfferCheck", ready: event.ready, within_frame: event.withinFrame };
};
const encodeEmptyPreparedCheck = (event: Extract<CanonicalEvent, { kind: "emptyPreparedCheck" }>): unknown => {
  return {
    $: "Canonical.EmptyPreparedCheck",
    ready_count: event.readyCount,
    has_non_skipped: event.hasNonSkipped,
    authority_bound: event.authorityBound,
  };
};
const encodeReviewFailureCheck = (event: Extract<CanonicalEvent, { kind: "reviewFailureCheck" }>): unknown => {
  return {
    $: "Canonical.ReviewFailureCheck",
    backend_or_timeout: event.backendOrTimeout,
    credential: event.credential,
    missing: event.missing,
  };
};
const encodeStopPolled = (event: Extract<CanonicalEvent, { kind: "stopPolled" }>): unknown => {
  return { $: "Canonical.StopPolled", ...identity(event), round: event.round, deadline: event.deadline };
};
const encodeStopGroupPolled = (
  event: Extract<CanonicalEvent, { kind: "stopGroupPolled" | "stopGroupEnded" }>,
): unknown => {
  const polled = event.kind === "stopGroupPolled";

  const scopes = event.scopes.reduceRight<unknown>(
    (tail, scope) => {
      return { $: "Con", head: { $: "Canonical.StopScope", partition: scope.partition, round: scope.round }, tail };
    },
    { $: "Nil" },
  );
  const common = { group: event.group, lifetime: event.lifetime, round: event.round, scopes };
  return polled
    ? {
        $: "Canonical.StopGroupPolled",
        ...common,
        deadline: event.deadline,
        extra_pending: event.extraPending,
        continuations: event.continuations,
      }
    : { $: "Canonical.StopGroupEnded", ...common };
};
const encodeCollectionReady = (event: Extract<CanonicalEvent, { kind: "collectionReady" }>): unknown => {
  return {
    $: "Canonical.CollectionReady",
    advice: event.advice,
    partition: event.partition,
    lifetime: event.lifetime,
    round: event.round,
    observation: event.observation,
    joined_pending: event.joinedPending,
  };
};
const encodeCollectionCredentialCheck = (
  event: Extract<CanonicalEvent, { kind: "collectionCredentialCheck" }>,
): unknown => {
  return {
    $: "Canonical.CollectionCredentialCheck",
    same_scope: event.sameScope,
    generation_valid: event.generationValid,
  };
};
const encodeCollectionCandidateCheck = (
  event: Extract<CanonicalEvent, { kind: "collectionCandidateCheck" }>,
): unknown => {
  return {
    $: "Canonical.CollectionCandidateCheck",
    same_partition: event.samePartition,
    unleased: event.unleased,
    has_unsuppressed: event.hasUnsuppressed,
    authority_owns: event.authorityOwns,
  };
};
const encodeCollectionOrderCheck = (event: Extract<CanonicalEvent, { kind: "collectionOrderCheck" }>): unknown => {
  return {
    $: "Canonical.CollectionOrderCheck",
    left_sequence: event.leftSequence,
    right_sequence: event.rightSequence,
  };
};
const encodeCollectionExpiryCheck = (event: Extract<CanonicalEvent, { kind: "collectionExpiryCheck" }>): unknown => {
  return { $: "Canonical.CollectionExpiryCheck", elapsed: event.elapsed, lifetime: event.lifetime };
};
const encodeCollectionFitCheck = (event: Extract<CanonicalEvent, { kind: "collectionFitCheck" }>): unknown => {
  return { $: "Canonical.CollectionFitCheck", items: event.items, bytes: event.bytes };
};
const encodeCollectionFindingCheck = (event: Extract<CanonicalEvent, { kind: "collectionFindingCheck" }>): unknown => {
  return {
    $: "Canonical.CollectionFindingCheck",
    selection_partition: event.selectionPartition,
    selection_round: event.selectionRound,
    unit: event.unit,
    partition: event.partition,
    round: event.round,
    snapshot: event.snapshot,
    current_snapshot: event.currentSnapshot,
    credential: event.credential,
    current_credential: event.currentCredential,
    age_ms: event.ageMs,
    solo_bytes: event.soloBytes,
    collection_ready: event.collectionReady,
    selected_count: event.selectedCount,
    prospective_bytes: event.prospectiveBytes,
  };
};
const encodeCollectionNoticeCheck = (event: Extract<CanonicalEvent, { kind: "collectionNoticeCheck" }>): unknown => {
  return {
    $: "Canonical.CollectionNoticeCheck",
    items: event.items,
    bytes: event.bytes,
    skip_unfitting: event.skipUnfitting,
  };
};
const encodeCollectionReserveLease = (
  event: Extract<CanonicalEvent, { kind: "collectionReserveLease" | "collectionReleaseLease" }>,
): unknown => {
  return {
    $:
      event.kind === "collectionReserveLease" ? "Canonical.CollectionReserveLease" : "Canonical.CollectionReleaseLease",
    advice: event.advice,
    token: event.token,
  };
};
const encodeCollectionLeaseCheck = (event: Extract<CanonicalEvent, { kind: "collectionLeaseCheck" }>): unknown => {
  return {
    $: "Canonical.CollectionLeaseCheck",
    advice: event.advice,
    token: event.token,
    expired: event.expired,
    stop_collector: event.stopCollector,
    same_group: event.sameGroup,
    reofferable: event.reofferable,
  };
};
const encodeCollectionRetireAdvice = (event: Extract<CanonicalEvent, { kind: "collectionRetireAdvice" }>): unknown => {
  return { $: "Canonical.CollectionRetireAdvice", advice: event.advice };
};
const encodeCollectionClaimBackground = (
  event: Extract<CanonicalEvent, { kind: "collectionClaimBackground" }>,
): unknown => {
  return {
    $: "Canonical.CollectionClaimBackground",
    group: event.group,
    token: event.token,
    active: event.active,
    capacity: event.capacity,
  };
};
const encodeCollectionReleaseBackground = (
  event: Extract<CanonicalEvent, { kind: "collectionReleaseBackground" }>,
): unknown => {
  return { $: "Canonical.CollectionReleaseBackground", group: event.group, token: event.token };
};
const encodeCollectionExpireBackground = (
  event: Extract<CanonicalEvent, { kind: "collectionExpireBackground" }>,
): unknown => {
  return {
    $: "Canonical.CollectionExpireBackground",
    group: event.group,
    token: event.token,
    elapsed: event.elapsed,
    lifetime: event.lifetime,
  };
};
const encodeFinishReserve = (event: Extract<CanonicalEvent, { kind: "finishReserve" }>): unknown => {
  return {
    $: "Canonical.FinishReserve",
    group: event.group,
    lifetime: event.lifetime,
    round: event.round,
    attempt: event.attempt,
    token: event.token,
    selected: list(event.selected),
    has_notice: event.hasNotice,
    pass_notices: event.passNotices,
    can_write: event.canWrite,
    binding_valid: event.bindingValid,
    deadline_reached: event.deadlineReached,
  };
};
const encodeFinishRelease = (event: Extract<CanonicalEvent, { kind: "finishRelease" }>): unknown => {
  return {
    $: "Canonical.FinishRelease",
    group: event.group,
    round: event.round,
    attempt: event.attempt,
    token: event.token,
  };
};
const encodeFinishAuthorize = (event: Extract<CanonicalEvent, { kind: "finishAuthorize" }>): unknown => {
  return {
    $: "Canonical.FinishAuthorize",
    group: event.group,
    round: event.round,
    attempt: event.attempt,
    token: event.token,
    selected: list(event.selected),
  };
};
const encodeFinishTerminal = (event: Extract<CanonicalEvent, { kind: "finishTerminal" }>): unknown => {
  const outcome = { acknowledged: "Canonical.Acknowledged", failed: "Canonical.Failed", unknown: "Canonical.Unknown" }[
    event.outcome
  ];
  return {
    $: "Canonical.FinishTerminal",
    group: event.group,
    round: event.round,
    attempt: event.attempt,
    token: event.token,
    selected: list(event.selected),
    outcome: { $: outcome },
  };
};
const encodeFinishEnd = (event: Extract<CanonicalEvent, { kind: "finishEnd" }>): unknown => {
  return {
    $: "Canonical.FinishEnd",
    group: event.group,
    round: event.round,
    attempt: event.attempt,
    token: event.token,
  };
};
const encodeContinuationConsume = (event: Extract<CanonicalEvent, { kind: "continuationConsume" }>): unknown => {
  return { $: "Canonical.ContinuationConsume", group: event.group, round: event.round };
};
const encodeSubmissionBegin = (event: Extract<CanonicalEvent, { kind: "submissionBegin" }>): unknown => {
  return {
    $: "Canonical.SubmissionBegin",
    advice: event.advice,
    group: event.group,
    round: event.round,
    token: event.token,
    surface: submissionSurface(event.surface),
    authorize_now: event.authorizeNow,
    fingerprints: list(event.fingerprints),
    units: list(event.units),
  };
};
const encodeSubmissionAuthorize = (
  event: Extract<CanonicalEvent, { kind: "submissionAuthorize" | "submissionRelease" | "submissionReofferCheck" }>,
): unknown => {
  return {
    $: `Canonical.${event.kind.slice(0, 1).toUpperCase()}${event.kind.slice(1)}`,
    advice: event.advice,
    token: event.token,
  };
};
const encodeSubmissionTerminal = (event: Extract<CanonicalEvent, { kind: "submissionTerminal" }>): unknown => {
  return { $: "Canonical.SubmissionTerminal", advice: event.advice, token: event.token, certain: event.certain };
};
const encodeSubmissionForget = (event: Extract<CanonicalEvent, { kind: "submissionForget" }>): unknown => {
  return { $: "Canonical.SubmissionForget", advice: event.advice };
};
const encodeSubmissionSuppressCheck = (
  event: Extract<CanonicalEvent, { kind: "submissionSuppressCheck" }>,
): unknown => {
  return {
    $: "Canonical.SubmissionSuppressCheck",
    advice: event.advice,
    fingerprint: event.fingerprint,
    round: event.round,
    surface: submissionSurface(event.surface),
  };
};
const encodeSubmissionExpiryCheck = (event: Extract<CanonicalEvent, { kind: "submissionExpiryCheck" }>): unknown => {
  return {
    $: "Canonical.SubmissionExpiryCheck",
    advice: event.advice,
    token: event.token,
    elapsed: event.elapsed,
    lifetime: event.lifetime,
  };
};
const encodeRevisionRegister = (event: Extract<CanonicalEvent, { kind: "revisionRegister" }>): unknown => {
  return { $: "Canonical.RevisionRegister", subject: event.subject, input: event.input, add_member: event.addMember };
};
const encodeRevisionRelease = (event: Extract<CanonicalEvent, { kind: "revisionRelease" }>): unknown => {
  return { $: "Canonical.RevisionRelease", subject: event.subject, generation: event.generation };
};
const encodeRevisionSupersededCheck = (
  event: Extract<CanonicalEvent, { kind: "revisionSupersededCheck" }>,
): unknown => {
  return {
    $: "Canonical.RevisionSupersededCheck",
    subject: event.subject,
    candidate_subject: event.candidateSubject,
    generation: event.generation,
  };
};
const encodeRevisionCurrentCheck = (event: Extract<CanonicalEvent, { kind: "revisionCurrentCheck" }>): unknown => {
  return {
    $: "Canonical.RevisionCurrentCheck",
    subject: event.subject,
    input: event.input,
    generation: event.generation,
  };
};
const encodeRevisionGenerationCheck = (
  event: Extract<CanonicalEvent, { kind: "revisionGenerationCheck" }>,
): unknown => {
  return { $: "Canonical.RevisionGenerationCheck", subject: event.subject };
};
const encodeRevisionCountCheck = (event: Extract<CanonicalEvent, { kind: "revisionCountCheck" }>): unknown => {
  return { $: "Canonical.RevisionCountCheck" };
};
const encodeCollectorGateCheck = (event: Extract<CanonicalEvent, { kind: "collectorGateCheck" }>): unknown => {
  return { $: "Canonical.CollectorGateCheck", expired: event.expired, credential_valid: event.credentialValid };
};
const encodeCollectorFinalAuthorityCheck = (
  event: Extract<CanonicalEvent, { kind: "collectorFinalAuthorityCheck" }>,
): unknown => {
  return {
    $: "Canonical.CollectorFinalAuthorityCheck",
    admitted_block: event.admittedBlock,
    current_block: event.currentBlock,
  };
};
const encodeReuseMemberCheck = (event: Extract<CanonicalEvent, { kind: "reuseMemberCheck" }>): unknown => {
  return {
    $: "Canonical.ReuseMemberCheck",
    joined_state: reuseMemberState(event.state),
    stale_unavailable: event.staleUnavailable,
    has_revision: event.hasRevision,
    has_advice_id: event.hasAdviceId,
  };
};
const encodeCleanupCheck = (event: Extract<CanonicalEvent, { kind: "cleanupCheck" }>): unknown => {
  const facts = event.facts;

  return {
    $: "Canonical.CleanupCheck",
    facts: {
      $: "Retention.CleanupFacts",
      active: facts.active,
      dispatcher_idle: facts.dispatcherIdle,
      no_advice: facts.noAdvice,
      no_notices: facts.noNotices,
      no_pending_evaluations: facts.noPendingEvaluations,
      no_current_work: facts.noCurrentWork,
      no_cooldowns: facts.noCooldowns,
      connection_count_ok: facts.connectionCountOk,
      cache_matches_ledger: facts.cacheMatchesLedger,
    },
  };
};
const encodeCleanupCommit = (event: Extract<CanonicalEvent, { kind: "cleanupCommit" }>): unknown => {
  return { $: "Canonical.CleanupCommit" };
};
const encodeDeliveryReleaseCheck = (event: Extract<CanonicalEvent, { kind: "deliveryReleaseCheck" }>): unknown => {
  return { $: "Canonical.DeliveryReleaseCheck", acknowledged: event.acknowledged };
};
const encodeDeliveryAcknowledgeCheck = (
  event: Extract<CanonicalEvent, { kind: "deliveryAcknowledgeCheck" }>,
): unknown => {
  return { $: "Canonical.DeliveryAcknowledgeCheck", items: event.items, any_expired: event.anyExpired };
};
const encodeDeliveryFinalizeCheck = (event: Extract<CanonicalEvent, { kind: "deliveryFinalizeCheck" }>): unknown => {
  return {
    $: "Canonical.DeliveryFinalizeCheck",
    items: event.items,
    all_acknowledged: event.allAcknowledged,
    any_expired: event.anyExpired,
  };
};
const encodeDeliveryFindingDispositionCheck = (
  event: Extract<CanonicalEvent, { kind: "deliveryFindingDispositionCheck" }>,
): unknown => {
  return { $: "Canonical.DeliveryFindingDispositionCheck", composed: event.composed, remaining: event.remaining };
};
const encodeDeliverySubmissionCandidateCheck = (
  event: Extract<CanonicalEvent, { kind: "deliverySubmissionCandidateCheck" }>,
): unknown => {
  const facts = event.facts;

  return {
    $: "Canonical.DeliverySubmissionCandidateCheck",
    facts: {
      $: "Delivery.SubmissionFacts",
      round_active: facts.roundActive,
      has_round: facts.hasRound,
      has_unit: facts.hasUnit,
      has_delivery: facts.hasDelivery,
      pending_capacity: facts.pendingCapacity,
      submission_allowed: facts.submissionAllowed,
      current_work: facts.currentWork,
      credential_authorized: facts.credentialAuthorized,
    },
  };
};
const encodeDeliverySubmissionBatchCheck = (
  event: Extract<CanonicalEvent, { kind: "deliverySubmissionBatchCheck" }>,
): unknown => {
  return { $: "Canonical.DeliverySubmissionBatchCheck", count: event.count, all_valid: event.allValid };
};
const encodeDeliveryCredentialObserveCheck = (
  event: Extract<CanonicalEvent, { kind: "deliveryCredentialObserveCheck" }>,
): unknown => {
  return {
    $: "Canonical.DeliveryCredentialObserveCheck",
    invalid_seen: event.invalidSeen,
    generation_valid: event.generationValid,
    authorized: event.authorized,
  };
};
const encodeDeliveryFinalCredentialCheck = (
  event: Extract<CanonicalEvent, { kind: "deliveryFinalCredentialCheck" }>,
): unknown => {
  return {
    $: "Canonical.DeliveryFinalCredentialCheck",
    shared_collect: event.sharedCollect,
    invalid_seen: event.invalidSeen,
  };
};
const encodeValidationRouteCheck = (event: Extract<CanonicalEvent, { kind: "validationRouteCheck" }>): unknown => {
  return {
    $: "Canonical.ValidationRouteCheck",
    owner_current: event.ownerCurrent,
    status: { $: `Handoff.${event.status.slice(0, 1).toUpperCase()}${event.status.slice(1)}` },
  };
};
const encodePostValidationCheck = (event: Extract<CanonicalEvent, { kind: "postValidationCheck" }>): unknown => {
  return {
    $: "Canonical.PostValidationCheck",
    work_accepted: event.workAccepted,
    expired: event.expired,
    has_fitting: event.hasFitting,
  };
};
const encodeFinalCandidateCheck = (event: Extract<CanonicalEvent, { kind: "finalCandidateCheck" }>): unknown => {
  return {
    $: "Canonical.FinalCandidateCheck",
    owner_current: event.ownerCurrent,
    credential_generation: event.credentialGeneration,
    credential_authorized: event.credentialAuthorized,
    expired: event.expired,
    work_current: event.workCurrent,
    has_findings: event.hasFindings,
  };
};
const encodeRoundBeginStopCheck = (event: Extract<CanonicalEvent, { kind: "roundBeginStopCheck" }>): unknown => {
  return { $: "Canonical.RoundBeginStopCheck", active: event.active, has_stop: event.hasStop, token: event.token };
};
const encodeRoundActivityCheck = (event: Extract<CanonicalEvent, { kind: "roundActivityCheck" }>): unknown => {
  return {
    $: "Canonical.RoundActivityCheck",
    bound: event.bound,
    has_admission: event.hasAdmission,
    round: event.round,
    active: event.active,
    closed_at: event.closedAt,
    expected_generation: event.expectedGeneration,
  };
};
const encodeRoundBarrierCheck = (event: Extract<CanonicalEvent, { kind: "roundBarrierCheck" }>): unknown => {
  return {
    $: "Canonical.RoundBarrierCheck",
    has_stop: event.hasStop,
    used_at_start: event.usedAtStart,
    used_now: event.usedNow,
  };
};
const encodeRoundOwnsStopCheck = (event: Extract<CanonicalEvent, { kind: "roundOwnsStopCheck" }>): unknown => {
  return {
    $: "Canonical.RoundOwnsStopCheck",
    active: event.active,
    token_matches: event.tokenMatches,
    deciding: event.deciding,
  };
};
const encodeRoundStopTerminalCheck = (event: Extract<CanonicalEvent, { kind: "roundStopTerminalCheck" }>): unknown => {
  return {
    $: "Canonical.RoundStopTerminalCheck",
    has_output: event.hasOutput,
    authorized: event.authorized,
    requested_close: event.requestedClose,
  };
};
const encodeRoundExpireCloseCheck = (event: Extract<CanonicalEvent, { kind: "roundExpireCloseCheck" }>): unknown => {
  return { $: "Canonical.RoundExpireCloseCheck", barrier: event.barrier, authorized_output: event.authorizedOutput };
};
const encodeRoundContinuationBudgetCheck = (
  event: Extract<CanonicalEvent, { kind: "roundContinuationBudgetCheck" }>,
): unknown => {
  return { $: "Canonical.RoundContinuationBudgetCheck", active: event.active, count: event.count };
};
const encodeDeliverySubmissionAllowedCheck = (
  event: Extract<CanonicalEvent, { kind: "deliverySubmissionAllowedCheck" }>,
): unknown => {
  return {
    $: "Canonical.DeliverySubmissionAllowedCheck",
    active: event.active,
    barrier: event.barrier,
    deciding: event.deciding,
    surface: deliverySurface(event.surface),
    existing_token: event.existingToken,
    finish_permit: event.finishPermit,
  };
};
const encodeDeliveryExistingTokenCheck = (
  event: Extract<CanonicalEvent, { kind: "deliveryExistingTokenCheck" }>,
): unknown => {
  return {
    $: "Canonical.DeliveryExistingTokenCheck",
    surface: deliverySurface(event.surface),
    existing_token: event.existingToken,
    finish_permit: event.finishPermit,
  };
};
const encodeDeliveryUnreservedStopCheck = (
  event: Extract<CanonicalEvent, { kind: "deliveryUnreservedStopCheck" }>,
): unknown => {
  return { $: "Canonical.DeliveryUnreservedStopCheck", active: event.active, deciding: event.deciding };
};
const encodeIncludeLayerCheck = (event: Extract<CanonicalEvent, { kind: "includeLayerCheck" }>): unknown => {
  return {
    $: "Canonical.IncludeLayerCheck",
    supplied: event.supplied,
    current_rank: event.currentRank,
    candidate_rank: event.candidateRank,
  };
};
const encodeFileSelectionCheck = (event: Extract<CanonicalEvent, { kind: "fileSelectionCheck" }>): unknown => {
  return {
    $: "Canonical.FileSelectionCheck",
    protected: event.protected,
    excluded: event.excluded,
    includes_empty: event.includesEmpty,
    included: event.included,
  };
};
const encodeFileProtectionInvalid = (event: Extract<CanonicalEvent, { kind: "fileProtectionInvalid" }>): unknown => {
  return { $: "Canonical.FileProtectionInvalid" };
};
const encodeFileProtectionCheck = (event: Extract<CanonicalEvent, { kind: "fileProtectionCheck" }>): unknown => {
  return {
    $: "Canonical.FileProtectionCheck",
    sensitive_name: event.sensitiveName,
    generated_or_vendor: event.generatedOrVendor,
    allowed_extension: event.allowedExtension,
  };
};
const encodeCandidateFileCheck = (event: Extract<CanonicalEvent, { kind: "candidateFileCheck" }>): unknown => {
  return {
    $: "Canonical.CandidateFileCheck",
    git_admin: event.gitAdmin,
    physical_safe: event.physicalSafe,
    git_allowed: event.gitAllowed,
  };
};
const encodeReviewAdmissionCheck = (event: Extract<CanonicalEvent, { kind: "reviewAdmissionCheck" }>): unknown => {
  return {
    $: "Canonical.ReviewAdmissionCheck",
    root_valid: event.rootValid,
    configuration_valid: event.configurationValid,
    credential_ready: event.credentialReady,
    selected: event.selected,
  };
};
const encodeRuleEnableCheck = (event: Extract<CanonicalEvent, { kind: "ruleEnableCheck" }>): unknown => {
  return { $: "Canonical.RuleEnableCheck", pack_enabled: event.packEnabled, rule_enabled: event.ruleEnabled };
};
const encodeRuleApplicabilityCheck = (event: Extract<CanonicalEvent, { kind: "ruleApplicabilityCheck" }>): unknown => {
  return {
    $: "Canonical.RuleApplicabilityCheck",
    consent: event.consent,
    complete: event.complete,
    target: { $: `RulePolicy.${event.target.slice(0, 1).toUpperCase()}${event.target.slice(1)}` },
    global_included: event.globalIncluded,
    global_excluded: event.globalExcluded,
    pack_enabled: event.packEnabled,
    rule_enabled: event.ruleEnabled,
    rule_included: event.ruleIncluded,
    rule_excluded: event.ruleExcluded,
    target_declared: event.targetDeclared,
    capabilities_available: event.capabilitiesAvailable,
    source_rung: event.sourceRung,
    minimum_rung: event.minimumRung,
  };
};
const encodeRuleFindingCheck = (event: Extract<CanonicalEvent, { kind: "ruleFindingCheck" }>): unknown => {
  return {
    $: "Canonical.RuleFindingCheck",
    probability: encodedProbabilityWords(event.probability),
    threshold: encodedProbabilityWords(event.threshold),
  };
};
const encodeRuleRankOrderCheck = (event: Extract<CanonicalEvent, { kind: "ruleRankOrderCheck" }>): unknown => {
  return {
    $: "Canonical.RuleRankOrderCheck",
    left: encodedProbabilityWords(event.left),
    right: encodedProbabilityWords(event.right),
    left_rank: event.leftRank,
    right_rank: event.rightRank,
  };
};
const encodeAdviceOrderCheck = (event: Extract<CanonicalEvent, { kind: "adviceOrderCheck" }>): unknown => {
  return {
    $: "Canonical.AdviceOrderCheck",
    left: encodedProbabilityWords(event.left),
    right: encodedProbabilityWords(event.right),
    path_order: { $: ruleOrderTag(event.pathOrder) },
    id_order: { $: ruleOrderTag(event.idOrder) },
  };
};
const encodeRuleBudgetCheck = (event: Extract<CanonicalEvent, { kind: "ruleBudgetCheck" }>): unknown => {
  return { $: "Canonical.RuleBudgetCheck", position: event.position, limit: event.limit };
};
const encodeReuseRoute = (event: Extract<CanonicalEvent, { kind: "reuseRoute" }>): unknown => {
  return { $: "Canonical.ReuseRoute", id: event.id, live_advice: event.liveAdvice };
};
const encodeReuseClaim = (
  event: Extract<CanonicalEvent, { kind: "reuseClaim" | "reuseAttach" | "reuseRelease" | "reuseTouch" }>,
): unknown => {
  return { $: `Canonical.${event.kind.slice(0, 1).toUpperCase()}${event.kind.slice(1)}`, id: event.id };
};
const encodeCachePrepare = (event: Extract<CanonicalEvent, { kind: "cachePrepare" }>): unknown => {
  return {
    $: "Canonical.CachePrepare",
    id: event.id,
    bytes: event.bytes,
    entry_limit: event.entryLimit,
    byte_limit: event.byteLimit,
  };
};
const encodeCacheCommit = (event: Extract<CanonicalEvent, { kind: "cacheCommit" }>): unknown => {
  return {
    $: "Canonical.CacheCommit",
    id: event.id,
    partition: event.partition,
    bytes: event.bytes,
    reservation: event.reservation,
    entry_limit: event.entryLimit,
    byte_limit: event.byteLimit,
  };
};
const encodeCacheDiscardPartition = (event: Extract<CanonicalEvent, { kind: "cacheDiscardPartition" }>): unknown => {
  return { $: "Canonical.CacheDiscardPartition", partition: event.partition };
};
const encodeCacheClear = (event: Extract<CanonicalEvent, { kind: "cacheClear" }>): unknown => {
  return { $: "Canonical.CacheClear" };
};
const encodeNoticeAdvance = (event: Extract<CanonicalEvent, { kind: "noticeAdvance" }>): unknown => {
  return {
    $: "Canonical.NoticeAdvance",
    key: event.key,
    remaining: event.remaining === undefined ? { $: "None" } : { $: "Some", value: event.remaining },
    maximum_keys: event.maximumKeys,
    proposed: event.proposed,
    sequence: event.sequence,
    max_count: event.maxCount,
  };
};
const encodeNoticeCommit = (event: Extract<CanonicalEvent, { kind: "noticeCommit" }>): unknown => {
  return {
    $: "Canonical.NoticeCommit",
    key: event.key,
    partition: event.partition,
    group: event.group,
    reservation: event.reservation,
    pending: event.pending,
    sequence: event.sequence,
    maximum_keys: event.maximumKeys,
  };
};
const encodeNoticePrune = (event: Extract<CanonicalEvent, { kind: "noticePrune" }>): unknown => {
  return {
    $: "Canonical.NoticePrune",
    key: event.key,
    lease_expired: event.leaseExpired,
    pending_expired: event.pendingExpired,
    excepted: event.excepted,
    cooldown_expired: event.cooldownExpired,
  };
};
const encodeNoticeDrop = (event: Extract<CanonicalEvent, { kind: "noticeDrop" | "noticeClearPending" }>): unknown => {
  return { $: `Canonical.${event.kind.slice(0, 1).toUpperCase()}${event.kind.slice(1)}`, key: event.key };
};
const encodeNoticeLease = (event: Extract<CanonicalEvent, { kind: "noticeLease" }>): unknown => {
  return { $: "Canonical.NoticeLease", key: event.key, leased: event.leased };
};
const encodeNoticeSelect = (event: Extract<CanonicalEvent, { kind: "noticeSelect" }>): unknown => {
  return {
    $: "Canonical.NoticeSelect",
    partition: event.partition,
    group: event.group,
    composed: event.composed,
    authority_bound: event.authorityBound,
    allowed: list(event.allowed),
  };
};
const encodeOutputStarted = (event: Extract<CanonicalEvent, { kind: "outputStarted" }>): unknown => {
  return { $: "Canonical.OutputStarted", ...identity(event), round: event.round };
};
const encodeOutputTerminal = (event: Extract<CanonicalEvent, { kind: "outputTerminal" }>): unknown => {
  const outcome = { acknowledged: "Canonical.Acknowledged", failed: "Canonical.Failed", unknown: "Canonical.Unknown" }[
    event.outcome
  ];
  return {
    $: "Canonical.OutputTerminal",
    ...identity(event),
    round: event.round,
    operation: event.operation,
    outcome: { $: outcome },
  };
};
const encodeRetirePartition = (event: Extract<CanonicalEvent, { kind: "retirePartition" }>): unknown => {
  return { $: "Canonical.RetirePartition", ...identity(event), round: event.round };
};
type EventForKind<Kind extends CanonicalEvent["kind"], Event = CanonicalEvent> = Event extends {
  readonly kind: infer Names;
}
  ? Kind extends Names
    ? Event
    : never
  : never;
type EventByKind = {
  [Kind in CanonicalEvent["kind"]]: EventForKind<Kind>;
};
const eventEncoders: { [Kind in keyof EventByKind]: (event: EventByKind[Kind]) => unknown } = {
  reserveCapacity: encodeReserveCapacity,
  resizeCapacity: encodeResizeCapacity,
  releaseCapacity: encodeReleaseCapacity,
  replaceCapacity: encodeReplaceCapacity,
  issuePermit: encodeIssuePermit,
  checkCompletedEdit: encodeCheckCompletedEdit,
  rememberCompletedEdit: encodeRememberCompletedEdit,
  quietRoundTick: encodeQuietRoundTick,
  quietRoundReset: encodeQuietRoundReset,
  consumePermit: encodeConsumePermit,
  releasePermit: encodeReleasePermit,
  expirePermit: encodeExpirePermit,
  closePermitRound: encodeClosePermitRound,
  forgetAdmission: encodeForgetAdmission,
  openRound: encodeOpenRound,
  admitObservation: encodeAdmitObservation,
  startObservation: encodeStartObservation,
  completeObservation: encodeStartObservation,
  interruptObservation: encodeStartObservation,
  beginPreparation: encodeBeginPreparation,
  beginObservedPreparation: encodeBeginObservedPreparation,
  interruptPreparation: encodeInterruptPreparation,
  preparationCompleted: encodePreparationCompleted,
  startReview: encodeStartReview,
  retireReview: encodeStartReview,
  jevRequestReady: encodeJevRequestReady,
  jevRequestStarted: encodeJevRequestStarted,
  jevRequestInterrupted: encodeJevRequestStarted,
  jevRequestSettled: encodeJevRequestSettled,
  reviewCompleted: encodeReviewCompleted,
  reviewObserved: encodeReviewObserved,
  findingCountUpdated: encodeFindingCountUpdated,
  queueDispatch: encodeQueueDispatch,
  dispatchSettled: encodeQueueDispatch,
  discardDispatch: encodeDiscardDispatch,
  dispatchScopeCheck: encodeDispatchScopeCheck,
  closeDispatch: encodeCloseDispatch,
  preparedOfferCheck: encodePreparedOfferCheck,
  emptyPreparedCheck: encodeEmptyPreparedCheck,
  reviewFailureCheck: encodeReviewFailureCheck,
  stopPolled: encodeStopPolled,
  stopGroupPolled: encodeStopGroupPolled,
  stopGroupEnded: encodeStopGroupPolled,
  collectionReady: encodeCollectionReady,
  collectionCredentialCheck: encodeCollectionCredentialCheck,
  collectionCandidateCheck: encodeCollectionCandidateCheck,
  collectionOrderCheck: encodeCollectionOrderCheck,
  collectionExpiryCheck: encodeCollectionExpiryCheck,
  collectionFitCheck: encodeCollectionFitCheck,
  collectionFindingCheck: encodeCollectionFindingCheck,
  collectionNoticeCheck: encodeCollectionNoticeCheck,
  collectionReserveLease: encodeCollectionReserveLease,
  collectionReleaseLease: encodeCollectionReserveLease,
  collectionLeaseCheck: encodeCollectionLeaseCheck,
  collectionRetireAdvice: encodeCollectionRetireAdvice,
  collectionClaimBackground: encodeCollectionClaimBackground,
  collectionReleaseBackground: encodeCollectionReleaseBackground,
  collectionExpireBackground: encodeCollectionExpireBackground,
  finishReserve: encodeFinishReserve,
  finishRelease: encodeFinishRelease,
  finishAuthorize: encodeFinishAuthorize,
  finishTerminal: encodeFinishTerminal,
  finishEnd: encodeFinishEnd,
  continuationConsume: encodeContinuationConsume,
  submissionBegin: encodeSubmissionBegin,
  submissionAuthorize: encodeSubmissionAuthorize,
  submissionRelease: encodeSubmissionAuthorize,
  submissionReofferCheck: encodeSubmissionAuthorize,
  submissionTerminal: encodeSubmissionTerminal,
  submissionForget: encodeSubmissionForget,
  submissionSuppressCheck: encodeSubmissionSuppressCheck,
  submissionExpiryCheck: encodeSubmissionExpiryCheck,
  revisionRegister: encodeRevisionRegister,
  revisionRelease: encodeRevisionRelease,
  revisionSupersededCheck: encodeRevisionSupersededCheck,
  revisionCurrentCheck: encodeRevisionCurrentCheck,
  revisionGenerationCheck: encodeRevisionGenerationCheck,
  revisionCountCheck: encodeRevisionCountCheck,
  collectorGateCheck: encodeCollectorGateCheck,
  collectorFinalAuthorityCheck: encodeCollectorFinalAuthorityCheck,
  reuseMemberCheck: encodeReuseMemberCheck,
  cleanupCheck: encodeCleanupCheck,
  cleanupCommit: encodeCleanupCommit,
  deliveryReleaseCheck: encodeDeliveryReleaseCheck,
  deliveryAcknowledgeCheck: encodeDeliveryAcknowledgeCheck,
  deliveryFinalizeCheck: encodeDeliveryFinalizeCheck,
  deliveryFindingDispositionCheck: encodeDeliveryFindingDispositionCheck,
  deliverySubmissionCandidateCheck: encodeDeliverySubmissionCandidateCheck,
  deliverySubmissionBatchCheck: encodeDeliverySubmissionBatchCheck,
  deliveryCredentialObserveCheck: encodeDeliveryCredentialObserveCheck,
  deliveryFinalCredentialCheck: encodeDeliveryFinalCredentialCheck,
  validationRouteCheck: encodeValidationRouteCheck,
  postValidationCheck: encodePostValidationCheck,
  finalCandidateCheck: encodeFinalCandidateCheck,
  roundBeginStopCheck: encodeRoundBeginStopCheck,
  roundActivityCheck: encodeRoundActivityCheck,
  roundBarrierCheck: encodeRoundBarrierCheck,
  roundOwnsStopCheck: encodeRoundOwnsStopCheck,
  roundStopTerminalCheck: encodeRoundStopTerminalCheck,
  roundExpireCloseCheck: encodeRoundExpireCloseCheck,
  roundContinuationBudgetCheck: encodeRoundContinuationBudgetCheck,
  deliverySubmissionAllowedCheck: encodeDeliverySubmissionAllowedCheck,
  deliveryExistingTokenCheck: encodeDeliveryExistingTokenCheck,
  deliveryUnreservedStopCheck: encodeDeliveryUnreservedStopCheck,
  includeLayerCheck: encodeIncludeLayerCheck,
  fileSelectionCheck: encodeFileSelectionCheck,
  fileProtectionInvalid: encodeFileProtectionInvalid,
  fileProtectionCheck: encodeFileProtectionCheck,
  candidateFileCheck: encodeCandidateFileCheck,
  reviewAdmissionCheck: encodeReviewAdmissionCheck,
  ruleEnableCheck: encodeRuleEnableCheck,
  ruleApplicabilityCheck: encodeRuleApplicabilityCheck,
  ruleFindingCheck: encodeRuleFindingCheck,
  ruleRankOrderCheck: encodeRuleRankOrderCheck,
  adviceOrderCheck: encodeAdviceOrderCheck,
  ruleBudgetCheck: encodeRuleBudgetCheck,
  reuseRoute: encodeReuseRoute,
  reuseClaim: encodeReuseClaim,
  reuseAttach: encodeReuseClaim,
  reuseRelease: encodeReuseClaim,
  reuseTouch: encodeReuseClaim,
  cachePrepare: encodeCachePrepare,
  cacheCommit: encodeCacheCommit,
  cacheDiscardPartition: encodeCacheDiscardPartition,
  cacheClear: encodeCacheClear,
  noticeAdvance: encodeNoticeAdvance,
  noticeCommit: encodeNoticeCommit,
  noticePrune: encodeNoticePrune,
  noticeDrop: encodeNoticeDrop,
  noticeClearPending: encodeNoticeDrop,
  noticeLease: encodeNoticeLease,
  noticeSelect: encodeNoticeSelect,
  outputStarted: encodeOutputStarted,
  outputTerminal: encodeOutputTerminal,
  retirePartition: encodeRetirePartition,
};

const encodeVariant = <Kind extends keyof EventByKind>(event: EventByKind[Kind] & { readonly kind: Kind }): unknown =>
  eventEncoders[event.kind](event);
const encode = (input: CanonicalEvent): unknown => encodeVariant(decodeEvent(input));

const outcome = (value: unknown): "finding" | "clear" | "unavailable" | "interrupted" | "discarded" => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  if (name === "Canonical.Finding") return "finding";
  if (name === "Canonical.Clear") return "clear";
  if (name === "Canonical.Unavailable") return "unavailable";
  if (name === "Canonical.Interrupted") return "interrupted";
  if (name === "Canonical.Discarded") return "discarded";
  throw new TypeError("unknown canonical outcome");
};
const writeOutcome = (value: unknown): "acknowledged" | "failed" | "unknown" => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  if (name === "Canonical.Acknowledged") return "acknowledged";
  if (name === "Canonical.Failed") return "failed";
  if (name === "Canonical.Unknown") return "unknown";
  throw new TypeError("unknown write outcome");
};
const decodeCollectorReason = (value: unknown): CollectorReason => {
  const name = tag(value);
  const reasons: Record<string, CollectorReason> = {
    "CollectorAuthority.Backend": "backend",
    "CollectorAuthority.Credential": "credential",
    "CollectorAuthority.Capacity": "capacity",
    "CollectorAuthority.Stale": "stale",
    "CollectorAuthority.Lost": "lost",
    "CollectorAuthority.Expired": "expired",
  };
  const reason = reasons[name];
  if (reason === undefined) throw new TypeError("unknown collector reason");
  decodeCanonicalConstructor(value, name);
  return reason;
};

const purpose = (value: unknown): CapacityPurpose => {
  const names: Record<string, CapacityPurpose> = {
    "Ledger.ObservationDispatch": "observationDispatch",
    "Ledger.Preparation": "preparation",
    "Ledger.ReviewUnit": "reviewUnit",
    "Ledger.StoredResult": "storedResult",
    "Ledger.OperationalNotice": "operationalNotice",
    "Ledger.AdviceRecheck": "adviceRecheck",
  };
  const name = tag(value);
  const result = names[name];
  if (!result) throw new TypeError("unknown capacity purpose");
  decodeCanonicalConstructor(value, name);
  return result;
};
const charge = (value: unknown): CapacityCharge => {
  const x = decodeCanonicalConstructor(value, "Ledger.Charge");
  return { id: nat(x.id, true), partition: nat(x.partition, true), bytes: nat(x.bytes), purpose: purpose(x.purpose) };
};
const usage = (value: unknown): { readonly items: number; readonly bytes: number } => {
  const x = decodeCanonicalConstructor(value, "Ledger.Usage");
  return { items: nat(x.items), bytes: nat(x.bytes) };
};
const capacityView = (value: unknown): CapacityView => {
  const x = decodeCanonicalConstructor(value, "Canonical.CapacityView");
  const charges = readList(x.charges, charge);
  const global = usage(x.global);
  const local = usage(x.local);
  if (
    charges.length !== global.items ||
    charges.reduce((sum, charge) => sum + charge.bytes, 0) !== global.bytes ||
    local.items > global.items ||
    local.bytes > global.bytes
  )
    throw new TypeError("invalid capacity view");
  return { global, local, charges };
};
const capacityRefusal = (value: unknown): CapacityRefusal => {
  const reasons: Record<string, CapacityRefusal> = {
    "Ledger.GlobalItemLimit": "globalItems",
    "Ledger.GlobalByteLimit": "globalBytes",
    "Ledger.PartitionItemLimit": "partitionItems",
    "Ledger.PartitionByteLimit": "partitionBytes",
  };
  const reason = reasons[tag(value)];
  if (!reason) throw new TypeError("unknown capacity refusal");
  decodeCanonicalConstructor(value, tag(value));
  return reason;
};
const decodeCapacityGranted = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.CapacityGranted");
  return { kind: "capacityGranted", id: nat(x.id, true), after: capacityView(x.after) };
};
const decodeCapacityRefused = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.CapacityRefused");
  return { kind: "capacityRefused", reason: capacityRefusal(x.reason), after: capacityView(x.after) };
};
const decodeCapacityResized = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.CapacityResized");
  return { kind: "capacityResized", id: nat(x.id, true), after: capacityView(x.after) };
};
const decodeCapacityUnitAdmitted = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.CapacityUnitAdmitted");
  return {
    kind: "capacityUnitAdmitted",
    reservation: nat(x.reservation, true),
    position: nat(x.position, true),
    bytes: bytes(x.bytes),
    after: capacityView(x.after),
  };
};
const decodeCapacityUnitRefused = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.CapacityUnitRefused");
  return {
    kind: "capacityUnitRefused",
    position: nat(x.position, true),
    bytes: bytes(x.bytes),
    reason: capacityRefusal(x.reason),
    after: capacityView(x.after),
  };
};
const decodePermitIssued = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.PermitIssued");
  return { kind: "permitIssued", token: nat(x.token, true), round: nat(x.round, true) };
};
const decodeCompletedEditAbsent = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.CompletedEditAbsent");
  return { kind: "completedEditAbsent" };
};
const decodeCompletedEditSeen = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.CompletedEditSeen");
  return { kind: "completedEditSeen", reason: decodeCompletedEditReason(x.reason), report: bool(x.report) };
};
const decodeCompletedEditRemembered = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.CompletedEditRemembered");
  const evicted =
    tag(x.evicted) === "Some" ? nat(decodeCanonicalConstructor(x.evicted, "Some").value, true) : undefined;
  if (evicted === undefined) decodeCanonicalConstructor(x.evicted, "None");
  return { kind: "completedEditRemembered", ...(evicted === undefined ? {} : { evicted }) };
};
const decodeQuietRoundBusy = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.QuietRoundBusy");
  return { kind: "quietRoundBusy" };
};
const decodeQuietRoundResetRecorded = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.QuietRoundResetRecorded");
  return { kind: "quietRoundResetRecorded" };
};
const decodeQuietRoundWaiting = (value: unknown): CanonicalCommand => {
  return {
    kind: "quietRoundWaiting",
    since: nat(decodeCanonicalConstructor(value, "Canonical.QuietRoundWaiting").since),
  };
};
const decodeQuietRoundExpired = (value: unknown): CanonicalCommand => {
  return {
    kind: "quietRoundExpired",
    since: nat(decodeCanonicalConstructor(value, "Canonical.QuietRoundExpired").since),
  };
};
const decodePermitConsumed = (value: unknown): CanonicalCommand => {
  return {
    kind: "permitConsumed",
    round: nat(decodeCanonicalConstructor(value, "Canonical.PermitConsumed").round, true),
  };
};
const decodePermitReleased = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.PermitReleased");
  return { kind: "permitReleased" };
};
const decodePermitExpired = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.PermitExpired");
  return { kind: "permitExpired" };
};
const decodePermitKept = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.PermitKept");
  return { kind: "permitKept" };
};
const decodePermitRoundClosed = (value: unknown): CanonicalCommand => {
  return {
    kind: "permitRoundClosed",
    round: nat(decodeCanonicalConstructor(value, "Canonical.PermitRoundClosed").round, true),
  };
};
const decodeRoundStarted = (value: unknown): CanonicalCommand => {
  return { kind: "roundStarted", id: nat(decodeCanonicalConstructor(value, "Canonical.RoundStarted").id, true) };
};
const decodeObservationAdmitted = (value: unknown): CanonicalCommand => {
  return {
    kind: "observationAdmitted",
    id: nat(decodeCanonicalConstructor(value, "Canonical.ObservationAdmitted").id, true),
  };
};
const decodeObservationStarted = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.ObservationStarted");
  return { kind: "observationStarted" };
};
const decodeObservationCompleted = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.ObservationCompleted");
  return { kind: "observationCompleted" };
};
const decodeObservationInterrupted = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.ObservationInterrupted");
  return { kind: "observationInterrupted" };
};
const decodePrepare = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.Prepare");
  return { kind: "prepare", operation: nat(x.operation, true), reservation: nat(x.reservation, true) };
};
const decodePreparationRefused = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.PreparationRefused");
  return { kind: "preparationRefused" };
};
const decodeUnitAdmitted = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.UnitAdmitted");
  return {
    kind: "unitAdmitted",
    operation: nat(x.operation, true),
    reservation: nat(x.reservation, true),
    position: nat(x.position, true),
    bytes: bytes(x.bytes),
    after: capacityView(x.after),
  };
};
const decodeUnitRefused = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.UnitRefused");
  return {
    kind: "unitRefused",
    position: nat(x.position, true),
    bytes: bytes(x.bytes),
    reason: capacityRefusal(x.reason),
    after: capacityView(x.after),
  };
};
const decodePreparationReleased = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.PreparationReleased");
  return { kind: "preparationReleased", id: nat(x.id, true), after: capacityView(x.after) };
};
const decodeReviewStarted = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.ReviewStarted");
  return { kind: "reviewStarted" };
};
const decodeJevRequestIssued = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.JevRequestIssued");
  return {
    kind: "jevRequestIssued",
    partition: nat(x.partition, true),
    lifetime: nat(x.lifetime, true),
    round: nat(x.round, true),
    operation: nat(x.operation, true),
    request: nat(x.request, true),
  };
};
const decodeJevRequestUnavailable = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.JevRequestUnavailable");
  return { kind: "jevRequestUnavailable" };
};
const decodeJevRequestStartRecorded = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.JevRequestStartRecorded");
  return { kind: "jevRequestStartRecorded" };
};
const decodeJevInterruptionRecorded = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.JevInterruptionRecorded");
  return { kind: "jevInterruptionRecorded" };
};
const decodeJevObservationIgnored = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.JevObservationIgnored");
  return { kind: "jevObservationIgnored" };
};
const decodeJevRequestOutcomeRecorded = (value: unknown): CanonicalCommand => {
  return {
    kind: "jevRequestOutcomeRecorded",
    outcome: decodeJevRequestOutcome(decodeCanonicalConstructor(value, "Canonical.JevRequestOutcomeRecorded").outcome),
  };
};
const decodeReservationReleased = (value: unknown): CanonicalCommand => {
  return {
    kind: "reservationReleased",
    id: nat(decodeCanonicalConstructor(value, "Canonical.ReservationReleased").id, true),
  };
};
const decodeReviewRecorded = (value: unknown): CanonicalCommand => {
  return {
    kind: "reviewRecorded",
    outcome: outcome(decodeCanonicalConstructor(value, "Canonical.ReviewRecorded").outcome),
  };
};
const decodeRetainFinding = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.RetainFinding");
  return { kind: "retainFinding" };
};
const decodeFindingCountRecorded = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.FindingCountRecorded");
  return { kind: "findingCountRecorded" };
};
const decodeSettleClear = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.SettleClear");
  return { kind: "settleClear" };
};
const decodeSettleStaleClear = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.SettleStaleClear");
  return { kind: "settleStaleClear" };
};
const decodeRetireStaleFinding = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.RetireStaleFinding");
  return { kind: "retireStaleFinding" };
};
const decodePreparedSkipped = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.PreparedSkipped");
  return { kind: "preparedSkipped" };
};
const decodePreparedAdmitted = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.PreparedAdmitted");
  return { kind: "preparedAdmitted" };
};
const decodePreparedCapacityRefused = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.PreparedCapacityRefused");
  return { kind: "preparedCapacityRefused" };
};
const decodeEmptyLost = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.EmptyLost");
  return { kind: "emptyLost" };
};
const decodeEmptyAccepted = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.EmptyAccepted");
  return { kind: "emptyAccepted" };
};
const decodeFailureBackend = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.FailureBackend");
  return { kind: "failureBackend" };
};
const decodeFailureCredential = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.FailureCredential");
  return { kind: "failureCredential" };
};
const decodeFailureLost = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.FailureLost");
  return { kind: "failureLost" };
};
const decodeFailureNone = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.FailureNone");
  return { kind: "failureNone" };
};
const decodeDispatchStarted = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.DispatchStarted");
  return { kind: "dispatchStarted", operation: nat(x.operation, true), sequence: nat(x.sequence) };
};
const decodeDispatchDiscarded = (value: unknown): CanonicalCommand => {
  const x = decodeCanonicalConstructor(value, "Canonical.DispatchDiscarded");
  return { kind: "dispatchDiscarded", operation: nat(x.operation, true), running: bool(x.running) };
};
const decodeDiscardNamedOnly = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.DiscardNamedOnly");
  return { kind: "discardNamedOnly" };
};
const decodeDiscardAllUnfinished = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.DiscardAllUnfinished");
  return { kind: "discardAllUnfinished" };
};
const decodeWaitForWork = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.WaitForWork");
  return { kind: "waitForWork" };
};
const decodeCancelWork = (value: unknown): CanonicalCommand => {
  return {
    kind: "cancelWork",
    operation: nat(decodeCanonicalConstructor(value, "Canonical.CancelWork").operation, true),
  };
};
const decodeFinishReady = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.FinishReady");
  return { kind: "finishReady" };
};
const decodeFinishLimit = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.FinishLimit");
  return { kind: "finishLimit" };
};
const decodeStopEnded = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.StopEnded");
  return { kind: "stopEnded" };
};
const decodeCollectionEligible = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Extract<
      CanonicalCommand,
      { kind: `collection${string}` }
    >["kind"],
  };
};
const decodeFinishReserved = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "finishReserved"
      | "finishNotices"
      | "finishAllowedNoAdvice"
      | "finishAllowedDeadline"
      | "finishAllowedUnavailable"
      | "finishRefused"
      | "finishReleased"
      | "finishAuthorized"
      | "finishEnded"
      | "continuationConsumed"
      | "continuationRefused",
  };
};
const decodeFinishRecorded = (value: unknown): CanonicalCommand => {
  return {
    kind: "finishRecorded",
    outcome: writeOutcome(decodeCanonicalConstructor(value, "Canonical.FinishRecorded").outcome),
  };
};
const decodeSubmissionBegun = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Extract<
      CanonicalCommand,
      { kind: `submission${string}` }
    >["kind"],
  };
};
const decodeRevisionReused = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "revisionReused"
      | "revisionReplaced"
      | "revisionGeneration",
    generation: nat(decodeCanonicalConstructor(value, name).generation),
  };
};
const decodeRevisionCount = (value: unknown): CanonicalCommand => {
  return { kind: "revisionCount", count: nat(decodeCanonicalConstructor(value, "Canonical.RevisionCount").count) };
};
const decodeRevisionReleased = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "revisionReleased"
      | "revisionCurrent"
      | "revisionStale"
      | "revisionSuperseded"
      | "revisionNotSuperseded",
  };
};
const decodeCollectorUnavailable = (value: unknown): CanonicalCommand => {
  return {
    kind: "collectorUnavailable",
    reason: decodeCollectorReason(decodeCanonicalConstructor(value, "Canonical.CollectorUnavailable").reason),
  };
};
const decodeCleanupReady = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "cleanupReady"
      | "cleanupBusy"
      | "cleanupCommitted"
      | "deliveryReleaseUnacknowledged"
      | "deliveryKeepAcknowledged"
      | "deliveryAckReady"
      | "deliveryAckExpired"
      | "deliveryAckEmpty"
      | "deliveryFinalReady"
      | "deliveryFinalExpired"
      | "deliveryFinalEmpty"
      | "deliveryRetireAdvice"
      | "deliveryKeepRemaining"
      | "deliveryKeepForReoffer",
  };
};
const decodeDeliverySubmissionCandidate = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "deliverySubmissionCandidate"
      | "deliverySubmissionRefused"
      | "deliveryBatchProceed"
      | "deliveryBatchRelease"
      | "deliveryCredentialInvalid"
      | "deliveryCredentialValid",
  };
};
const decodeIgnoreCandidate = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "ignoreCandidate"
      | "releaseCandidate"
      | "retireCandidate"
      | "continueCandidate"
      | "retainCandidate",
  };
};
const decodeRoundStopBegun = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "roundStopBegun"
      | "roundStopRefused"
      | "roundActive"
      | "roundInactive"
      | "roundBarrierRaised"
      | "roundBarrierClear"
      | "roundStopOwned"
      | "roundStopNotOwned"
      | "roundExpireCloses"
      | "roundExpireKeeps"
      | "roundContinuationAvailable"
      | "roundContinuationExhausted"
      | "deliverySubmissionAllowed"
      | "deliverySubmissionDenied"
      | "deliveryExistingTokenAllowed"
      | "deliveryExistingTokenDenied"
      | "deliveryUnreservedStopAllowed"
      | "deliveryUnreservedStopDenied",
  };
};
const decodeRoundStopTerminal = (value: unknown): CanonicalCommand => {
  const command = decodeCanonicalConstructor(value, "Canonical.RoundStopTerminal");
  return { kind: "roundStopTerminal", revokeProvisional: bool(command.revoke_provisional), close: bool(command.close) };
};
const decodeNoticeSuppressed = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "noticeSuppressed"
      | "noticeCreatePending"
      | "noticeMergePending",
    count: nat(decodeCanonicalConstructor(value, name).count),
  };
};
const decodeNoticePruned = (value: unknown): CanonicalCommand => {
  const item = decodeCanonicalConstructor(value, "Canonical.NoticePruned");
  return {
    kind: "noticePruned",
    dropLease: bool(item.drop_lease),
    dropPending: bool(item.drop_pending),
    dropKey: bool(item.drop_key),
  };
};
const decodeNoticeSelected = (value: unknown): CanonicalCommand => {
  return {
    kind: "noticeSelected",
    ids: readList(decodeCanonicalConstructor(value, "Canonical.NoticeSelected").ids, (id) => nat(id, true)),
  };
};
const decodeIncludeChoice = (value: unknown): CanonicalCommand => {
  const choice = decodeCanonicalConstructor(value, "Canonical.IncludeChoice").choice;
  const name = tag(choice);
  if (name !== "Configuration.ReplaceIncludes" && name !== "Configuration.KeepIncludes")
    throw new TypeError("invalid include choice");
  decodeCanonicalConstructor(choice, name);
  return {
    kind: "includeChoice",
    choice: name === "Configuration.ReplaceIncludes" ? "replaceIncludes" : "keepIncludes",
  };
};
const decodeFileSelection = (value: unknown): CanonicalCommand => {
  const selection = decodeCanonicalConstructor(value, "Canonical.FileSelection").selection;
  const names = ["Protected", "Excluded", "EmptyIncludes", "NotIncluded", "Selected"];
  const name = tag(selection);
  if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid file selection");
  decodeCanonicalConstructor(selection, name);
  return {
    kind: "fileSelection",
    selection: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "protected"
      | "excluded"
      | "emptyIncludes"
      | "notIncluded"
      | "selected",
  };
};
const decodeFileProtection = (value: unknown): CanonicalCommand => {
  const protection = decodeCanonicalConstructor(value, "Canonical.FileProtection").protection;
  const names = ["AllowedPath", "RepositoryBoundary", "SensitivePath", "GeneratedOrVendor", "FileExtension"];
  const name = tag(protection);
  if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid file protection");
  decodeCanonicalConstructor(protection, name);
  return {
    kind: "fileProtection",
    protection: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "allowedPath"
      | "repositoryBoundary"
      | "sensitivePath"
      | "generatedOrVendor"
      | "fileExtension",
  };
};
const decodeCandidateFile = (value: unknown): CanonicalCommand => {
  const candidate = decodeCanonicalConstructor(value, "Canonical.CandidateFile").candidate;
  const names = ["CandidateAllowed", "RefuseGitAdmin", "RefuseFileKind", "RefuseGitIgnore"];
  const name = tag(candidate);
  if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid candidate file");
  decodeCanonicalConstructor(candidate, name);
  return {
    kind: "candidateFile",
    candidate: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "candidateAllowed"
      | "refuseGitAdmin"
      | "refuseFileKind"
      | "refuseGitIgnore",
  };
};
const decodeReviewAdmission = (value: unknown): CanonicalCommand => {
  const admission = decodeCanonicalConstructor(value, "Canonical.ReviewAdmission").admission;
  const names = ["AdmitReview", "RefuseRoot", "RefuseConfiguration", "RefuseCredential", "RefuseSelection"];
  const name = tag(admission);
  if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid review admission");
  decodeCanonicalConstructor(admission, name);
  return {
    kind: "reviewAdmission",
    admission: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "admitReview"
      | "refuseRoot"
      | "refuseConfiguration"
      | "refuseCredential"
      | "refuseSelection",
  };
};
const decodeRuleGate = (value: unknown): CanonicalCommand => {
  const gate = decodeCanonicalConstructor(value, "Canonical.RuleGate").gate;
  const name = tag(gate);
  if (name !== "RulePolicy.Admit" && name !== "RulePolicy.Omit") throw new TypeError("invalid rule gate");
  decodeCanonicalConstructor(gate, name);
  return { kind: "ruleGate", gate: name === "RulePolicy.Admit" ? "admit" : "omit" };
};
const decodeRuleOrder = (value: unknown): CanonicalCommand => {
  const order = decodeCanonicalConstructor(value, "Canonical.RuleOrder").order;
  const name = tag(order);
  if (name !== "RulePolicy.Before" && name !== "RulePolicy.Equal" && name !== "RulePolicy.After")
    throw new TypeError("invalid rule order");
  decodeCanonicalConstructor(order, name);
  return {
    kind: "ruleOrder",
    order: name === "RulePolicy.Before" ? "before" : name === "RulePolicy.After" ? "after" : "equal",
  };
};
const decodeNoticeRejectedFull = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as
      | "noticeRejectedFull"
      | "noticeCreateKey"
      | "noticeKeepLeased"
      | "noticeRefused"
      | "noticeCommitted"
      | "noticeDropped"
      | "noticeLeased"
      | "noticePendingCleared",
  };
};
const decodeCachePrepared = (value: unknown): CanonicalCommand => {
  return {
    kind: "cachePrepared",
    evicted: readList(decodeCanonicalConstructor(value, "Canonical.CachePrepared").evicted, (id) => nat(id, true)),
  };
};
const decodeCacheDiscarded = (value: unknown): CanonicalCommand => {
  return {
    kind: "cacheDiscarded",
    ids: readList(decodeCanonicalConstructor(value, "Canonical.CacheDiscarded").ids, (id) => nat(id, true)),
  };
};
const decodeReuseJoinAdvice = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Exclude<
      Extract<CanonicalCommand, { kind: `reuse${string}` | `cache${string}` }>["kind"],
      "cachePrepared" | "cacheDiscarded"
    >,
  };
};
const decodeCollectorProceed = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  decodeCanonicalConstructor(value, name);
  return {
    kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Exclude<
      Extract<CanonicalCommand, { kind: `collector${string}` | `reuse${string}` }>["kind"],
      "collectorUnavailable"
    >,
  };
};
const decodeWriteAuthorized = (value: unknown): CanonicalCommand => {
  return {
    kind: "writeAuthorized",
    operation: nat(decodeCanonicalConstructor(value, "Canonical.WriteAuthorized").operation, true),
  };
};
const decodeWriteRecorded = (value: unknown): CanonicalCommand => {
  return {
    kind: "writeRecorded",
    outcome: writeOutcome(decodeCanonicalConstructor(value, "Canonical.WriteRecorded").outcome),
  };
};
const decodeWaitForOutput = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.WaitForOutput");
  return { kind: "waitForOutput" };
};
const decodeReofferAtStop = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.ReofferAtStop");
  return { kind: "reofferAtStop" };
};
const decodePartitionRetired = (value: unknown): CanonicalCommand => {
  return {
    kind: "partitionRetired",
    round: nat(decodeCanonicalConstructor(value, "Canonical.PartitionRetired").round, true),
  };
};
const decodeAdmissionForgotten = (value: unknown): CanonicalCommand => {
  decodeCanonicalConstructor(value, "Canonical.AdmissionForgotten");
  return { kind: "admissionForgotten" };
};
const commandDecoders: Readonly<Record<string, (value: unknown) => CanonicalCommand>> = {
  "Canonical.CapacityGranted": decodeCapacityGranted,
  "Canonical.CapacityRefused": decodeCapacityRefused,
  "Canonical.CapacityResized": decodeCapacityResized,
  "Canonical.CapacityUnitAdmitted": decodeCapacityUnitAdmitted,
  "Canonical.CapacityUnitRefused": decodeCapacityUnitRefused,
  "Canonical.PermitIssued": decodePermitIssued,
  "Canonical.CompletedEditAbsent": decodeCompletedEditAbsent,
  "Canonical.CompletedEditSeen": decodeCompletedEditSeen,
  "Canonical.CompletedEditRemembered": decodeCompletedEditRemembered,
  "Canonical.QuietRoundBusy": decodeQuietRoundBusy,
  "Canonical.QuietRoundResetRecorded": decodeQuietRoundResetRecorded,
  "Canonical.QuietRoundWaiting": decodeQuietRoundWaiting,
  "Canonical.QuietRoundExpired": decodeQuietRoundExpired,
  "Canonical.PermitConsumed": decodePermitConsumed,
  "Canonical.PermitReleased": decodePermitReleased,
  "Canonical.PermitExpired": decodePermitExpired,
  "Canonical.PermitKept": decodePermitKept,
  "Canonical.PermitRoundClosed": decodePermitRoundClosed,
  "Canonical.RoundStarted": decodeRoundStarted,
  "Canonical.ObservationAdmitted": decodeObservationAdmitted,
  "Canonical.ObservationStarted": decodeObservationStarted,
  "Canonical.ObservationCompleted": decodeObservationCompleted,
  "Canonical.ObservationInterrupted": decodeObservationInterrupted,
  "Canonical.Prepare": decodePrepare,
  "Canonical.PreparationRefused": decodePreparationRefused,
  "Canonical.UnitAdmitted": decodeUnitAdmitted,
  "Canonical.UnitRefused": decodeUnitRefused,
  "Canonical.PreparationReleased": decodePreparationReleased,
  "Canonical.ReviewStarted": decodeReviewStarted,
  "Canonical.JevRequestIssued": decodeJevRequestIssued,
  "Canonical.JevRequestUnavailable": decodeJevRequestUnavailable,
  "Canonical.JevRequestStartRecorded": decodeJevRequestStartRecorded,
  "Canonical.JevInterruptionRecorded": decodeJevInterruptionRecorded,
  "Canonical.JevObservationIgnored": decodeJevObservationIgnored,
  "Canonical.JevRequestOutcomeRecorded": decodeJevRequestOutcomeRecorded,
  "Canonical.ReservationReleased": decodeReservationReleased,
  "Canonical.ReviewRecorded": decodeReviewRecorded,
  "Canonical.RetainFinding": decodeRetainFinding,
  "Canonical.FindingCountRecorded": decodeFindingCountRecorded,
  "Canonical.SettleClear": decodeSettleClear,
  "Canonical.SettleStaleClear": decodeSettleStaleClear,
  "Canonical.RetireStaleFinding": decodeRetireStaleFinding,
  "Canonical.PreparedSkipped": decodePreparedSkipped,
  "Canonical.PreparedAdmitted": decodePreparedAdmitted,
  "Canonical.PreparedCapacityRefused": decodePreparedCapacityRefused,
  "Canonical.EmptyLost": decodeEmptyLost,
  "Canonical.EmptyAccepted": decodeEmptyAccepted,
  "Canonical.FailureBackend": decodeFailureBackend,
  "Canonical.FailureCredential": decodeFailureCredential,
  "Canonical.FailureLost": decodeFailureLost,
  "Canonical.FailureNone": decodeFailureNone,
  "Canonical.DispatchStarted": decodeDispatchStarted,
  "Canonical.DispatchDiscarded": decodeDispatchDiscarded,
  "Canonical.DiscardNamedOnly": decodeDiscardNamedOnly,
  "Canonical.DiscardAllUnfinished": decodeDiscardAllUnfinished,
  "Canonical.WaitForWork": decodeWaitForWork,
  "Canonical.CancelWork": decodeCancelWork,
  "Canonical.FinishReady": decodeFinishReady,
  "Canonical.FinishLimit": decodeFinishLimit,
  "Canonical.StopEnded": decodeStopEnded,
  "Canonical.CollectionEligible": decodeCollectionEligible,
  "Canonical.CollectionWaiting": decodeCollectionEligible,
  "Canonical.CollectionRetireCredential": decodeCollectionEligible,
  "Canonical.CollectionRetainCredential": decodeCollectionEligible,
  "Canonical.CollectionCandidate": decodeCollectionEligible,
  "Canonical.CollectionSkip": decodeCollectionEligible,
  "Canonical.CollectionBefore": decodeCollectionEligible,
  "Canonical.CollectionEqual": decodeCollectionEligible,
  "Canonical.CollectionAfter": decodeCollectionEligible,
  "Canonical.CollectionExpired": decodeCollectionEligible,
  "Canonical.CollectionCurrent": decodeCollectionEligible,
  "Canonical.CollectionFits": decodeCollectionEligible,
  "Canonical.CollectionLimited": decodeCollectionEligible,
  "Canonical.CollectionFindingSelected": decodeCollectionEligible,
  "Canonical.CollectionFindingRetained": decodeCollectionEligible,
  "Canonical.CollectionFindingLimited": decodeCollectionEligible,
  "Canonical.CollectionFindingExpired": decodeCollectionEligible,
  "Canonical.CollectionNoticeIncluded": decodeCollectionEligible,
  "Canonical.CollectionNoticeSkipped": decodeCollectionEligible,
  "Canonical.CollectionNoticeStopped": decodeCollectionEligible,
  "Canonical.CollectionLeaseReserved": decodeCollectionEligible,
  "Canonical.CollectionLeaseRefused": decodeCollectionEligible,
  "Canonical.CollectionLeaseReleased": decodeCollectionEligible,
  "Canonical.CollectionLeaseKept": decodeCollectionEligible,
  "Canonical.CollectionAdviceRetired": decodeCollectionEligible,
  "Canonical.CollectionBackgroundClaimed": decodeCollectionEligible,
  "Canonical.CollectionBackgroundRefused": decodeCollectionEligible,
  "Canonical.CollectionBackgroundReleased": decodeCollectionEligible,
  "Canonical.CollectionBackgroundKept": decodeCollectionEligible,
  "Canonical.FinishReserved": decodeFinishReserved,
  "Canonical.FinishNotices": decodeFinishReserved,
  "Canonical.FinishAllowedNoAdvice": decodeFinishReserved,
  "Canonical.FinishAllowedDeadline": decodeFinishReserved,
  "Canonical.FinishAllowedUnavailable": decodeFinishReserved,
  "Canonical.FinishRefused": decodeFinishReserved,
  "Canonical.FinishReleased": decodeFinishReserved,
  "Canonical.FinishAuthorized": decodeFinishReserved,
  "Canonical.FinishEnded": decodeFinishReserved,
  "Canonical.ContinuationConsumed": decodeFinishReserved,
  "Canonical.ContinuationRefused": decodeFinishReserved,
  "Canonical.FinishRecorded": decodeFinishRecorded,
  "Canonical.SubmissionBegun": decodeSubmissionBegun,
  "Canonical.SubmissionAuthorized": decodeSubmissionBegun,
  "Canonical.SubmissionRecorded": decodeSubmissionBegun,
  "Canonical.SubmissionReleased": decodeSubmissionBegun,
  "Canonical.SubmissionRefused": decodeSubmissionBegun,
  "Canonical.SubmissionForgotten": decodeSubmissionBegun,
  "Canonical.SubmissionSuppresses": decodeSubmissionBegun,
  "Canonical.SubmissionUnsuppressed": decodeSubmissionBegun,
  "Canonical.SubmissionReofferable": decodeSubmissionBegun,
  "Canonical.SubmissionNotReofferable": decodeSubmissionBegun,
  "Canonical.SubmissionExpired": decodeSubmissionBegun,
  "Canonical.SubmissionCurrent": decodeSubmissionBegun,
  "Canonical.RevisionReused": decodeRevisionReused,
  "Canonical.RevisionReplaced": decodeRevisionReused,
  "Canonical.RevisionGeneration": decodeRevisionReused,
  "Canonical.RevisionCount": decodeRevisionCount,
  "Canonical.RevisionReleased": decodeRevisionReleased,
  "Canonical.RevisionCurrent": decodeRevisionReleased,
  "Canonical.RevisionStale": decodeRevisionReleased,
  "Canonical.RevisionSuperseded": decodeRevisionReleased,
  "Canonical.RevisionNotSuperseded": decodeRevisionReleased,
  "Canonical.CollectorUnavailable": decodeCollectorUnavailable,
  "Canonical.CleanupReady": decodeCleanupReady,
  "Canonical.CleanupBusy": decodeCleanupReady,
  "Canonical.CleanupCommitted": decodeCleanupReady,
  "Canonical.DeliveryReleaseUnacknowledged": decodeCleanupReady,
  "Canonical.DeliveryKeepAcknowledged": decodeCleanupReady,
  "Canonical.DeliveryAckReady": decodeCleanupReady,
  "Canonical.DeliveryAckExpired": decodeCleanupReady,
  "Canonical.DeliveryAckEmpty": decodeCleanupReady,
  "Canonical.DeliveryFinalReady": decodeCleanupReady,
  "Canonical.DeliveryFinalExpired": decodeCleanupReady,
  "Canonical.DeliveryFinalEmpty": decodeCleanupReady,
  "Canonical.DeliveryRetireAdvice": decodeCleanupReady,
  "Canonical.DeliveryKeepRemaining": decodeCleanupReady,
  "Canonical.DeliveryKeepForReoffer": decodeCleanupReady,
  "Canonical.DeliverySubmissionCandidate": decodeDeliverySubmissionCandidate,
  "Canonical.DeliverySubmissionRefused": decodeDeliverySubmissionCandidate,
  "Canonical.DeliveryBatchProceed": decodeDeliverySubmissionCandidate,
  "Canonical.DeliveryBatchRelease": decodeDeliverySubmissionCandidate,
  "Canonical.DeliveryCredentialInvalid": decodeDeliverySubmissionCandidate,
  "Canonical.DeliveryCredentialValid": decodeDeliverySubmissionCandidate,
  "Canonical.IgnoreCandidate": decodeIgnoreCandidate,
  "Canonical.ReleaseCandidate": decodeIgnoreCandidate,
  "Canonical.RetireCandidate": decodeIgnoreCandidate,
  "Canonical.ContinueCandidate": decodeIgnoreCandidate,
  "Canonical.RetainCandidate": decodeIgnoreCandidate,
  "Canonical.RoundStopBegun": decodeRoundStopBegun,
  "Canonical.RoundStopRefused": decodeRoundStopBegun,
  "Canonical.RoundActive": decodeRoundStopBegun,
  "Canonical.RoundInactive": decodeRoundStopBegun,
  "Canonical.RoundBarrierRaised": decodeRoundStopBegun,
  "Canonical.RoundBarrierClear": decodeRoundStopBegun,
  "Canonical.RoundStopOwned": decodeRoundStopBegun,
  "Canonical.RoundStopNotOwned": decodeRoundStopBegun,
  "Canonical.RoundExpireCloses": decodeRoundStopBegun,
  "Canonical.RoundExpireKeeps": decodeRoundStopBegun,
  "Canonical.RoundContinuationAvailable": decodeRoundStopBegun,
  "Canonical.RoundContinuationExhausted": decodeRoundStopBegun,
  "Canonical.DeliverySubmissionAllowed": decodeRoundStopBegun,
  "Canonical.DeliverySubmissionDenied": decodeRoundStopBegun,
  "Canonical.DeliveryExistingTokenAllowed": decodeRoundStopBegun,
  "Canonical.DeliveryExistingTokenDenied": decodeRoundStopBegun,
  "Canonical.DeliveryUnreservedStopAllowed": decodeRoundStopBegun,
  "Canonical.DeliveryUnreservedStopDenied": decodeRoundStopBegun,
  "Canonical.RoundStopTerminal": decodeRoundStopTerminal,
  "Canonical.NoticeSuppressed": decodeNoticeSuppressed,
  "Canonical.NoticeCreatePending": decodeNoticeSuppressed,
  "Canonical.NoticeMergePending": decodeNoticeSuppressed,
  "Canonical.NoticePruned": decodeNoticePruned,
  "Canonical.NoticeSelected": decodeNoticeSelected,
  "Canonical.IncludeChoice": decodeIncludeChoice,
  "Canonical.FileSelection": decodeFileSelection,
  "Canonical.FileProtection": decodeFileProtection,
  "Canonical.CandidateFile": decodeCandidateFile,
  "Canonical.ReviewAdmission": decodeReviewAdmission,
  "Canonical.RuleGate": decodeRuleGate,
  "Canonical.RuleOrder": decodeRuleOrder,
  "Canonical.NoticeRejectedFull": decodeNoticeRejectedFull,
  "Canonical.NoticeCreateKey": decodeNoticeRejectedFull,
  "Canonical.NoticeKeepLeased": decodeNoticeRejectedFull,
  "Canonical.NoticeRefused": decodeNoticeRejectedFull,
  "Canonical.NoticeCommitted": decodeNoticeRejectedFull,
  "Canonical.NoticeDropped": decodeNoticeRejectedFull,
  "Canonical.NoticeLeased": decodeNoticeRejectedFull,
  "Canonical.NoticePendingCleared": decodeNoticeRejectedFull,
  "Canonical.CachePrepared": decodeCachePrepared,
  "Canonical.CacheDiscarded": decodeCacheDiscarded,
  "Canonical.ReuseJoinAdvice": decodeReuseJoinAdvice,
  "Canonical.ReuseJoinPending": decodeReuseJoinAdvice,
  "Canonical.ReuseJoinClaimed": decodeReuseJoinAdvice,
  "Canonical.ReuseCached": decodeReuseJoinAdvice,
  "Canonical.ReuseOwn": decodeReuseJoinAdvice,
  "Canonical.ReuseClaimed": decodeReuseJoinAdvice,
  "Canonical.ReuseAttached": decodeReuseJoinAdvice,
  "Canonical.ReuseReleased": decodeReuseJoinAdvice,
  "Canonical.ReuseRefused": decodeReuseJoinAdvice,
  "Canonical.CacheAlready": decodeReuseJoinAdvice,
  "Canonical.CacheRejected": decodeReuseJoinAdvice,
  "Canonical.CacheCommitted": decodeReuseJoinAdvice,
  "Canonical.CollectorProceed": decodeCollectorProceed,
  "Canonical.CollectorFinalProceed": decodeCollectorProceed,
  "Canonical.CollectorFinalRelease": decodeCollectorProceed,
  "Canonical.ReuseKeepMember": decodeCollectorProceed,
  "Canonical.ReuseSetMemberClear": decodeCollectorProceed,
  "Canonical.ReuseSetMemberFinding": decodeCollectorProceed,
  "Canonical.ReuseSetMemberUnavailable": decodeCollectorProceed,
  "Canonical.ReuseSetMemberLost": decodeCollectorProceed,
  "Canonical.WriteAuthorized": decodeWriteAuthorized,
  "Canonical.WriteRecorded": decodeWriteRecorded,
  "Canonical.WaitForOutput": decodeWaitForOutput,
  "Canonical.ReofferAtStop": decodeReofferAtStop,
  "Canonical.PartitionRetired": decodePartitionRetired,
  "Canonical.AdmissionForgotten": decodeAdmissionForgotten,
};

const decodeCommand = (value: unknown): CanonicalCommand => {
  const name = tag(value);
  const decode = Object.hasOwn(commandDecoders, name) ? commandDecoders[name] : undefined;
  if (decode === undefined) throw new TypeError("unknown canonical command");
  return decode(value);
};
const known = new WeakSet<object>();
// Projections contain validated numeric facts, not native handles or payloads.
// Weak keys do not extend canonical-state lifetime beyond its actual owner.
const projections = new WeakMap<object, CanonicalProjection>();
const registerCanonical = (state: unknown): void => {
  const identity = freezeCanonicalData(object(state));
  known.add(identity);
  try {
    projectCanonical(identity);
  } catch (cause) {
    known.delete(identity);
    projections.delete(identity);
    throw cause;
  }
};
const decodeState = (value: unknown) => decodeCanonicalConstructor(value, "Canonical.State");
const decodeLedger = (value: unknown) => decodeCanonicalConstructor(value, "Ledger.Ledger");
const decodeLedgerLimits = (value: unknown) => decodeCanonicalConstructor(value, "Ledger.Limits");

const projectCompletedEdits = (value: unknown) => {
  const history = decodeCanonicalConstructor(value, "EditHistory.State");
  const completedEdits = readList(
    history.entries,
    (value) => {
      const entry = decodeCanonicalConstructor(value, "EditHistory.Completed");
      return {
        tool: nat(entry.tool, true),
        reason: decodeCompletedEditReason(entry.reason),
        reported: bool(entry.reported),
      };
    },
    1000,
  );
  if (new Set(completedEdits.map((entry) => entry.tool)).size !== completedEdits.length)
    throw new TypeError("duplicate completed edit identity");
  return completedEdits;
};

const projectDispatch = (value: unknown) => {
  const rawDispatch = decodeCanonicalConstructor(value, "Dispatch.State");
  const dispatchEntry = (value: unknown): DispatchEntry => {
    const x = decodeCanonicalConstructor(value, "Dispatch.Entry");
    return {
      partition: nat(x.partition, true),
      lifetime: nat(x.lifetime, true),
      round: nat(x.round, true),
      operation: nat(x.operation, true),
      sequence: nat(x.sequence),
      cancelled: bool(x.cancelled),
      preparation: bool(x.preparation),
    };
  };
  const requests = readList(rawDispatch.requests, (value) => {
    const x = decodeCanonicalConstructor(value, "Dispatch.Request");
    return {
      partition: nat(x.partition, true),
      lifetime: nat(x.lifetime, true),
      round: nat(x.round, true),
      operation: nat(x.operation, true),
      request: nat(x.request, true),
      started: bool(x.started),
      interrupted: bool(x.interrupted),
    };
  });
  const dispatch = {
    queued: readList(rawDispatch.queued, dispatchEntry),
    running: readList(rawDispatch.running, dispatchEntry),
    nextSequence: nat(rawDispatch.next_sequence),
    closed: bool(rawDispatch.closed),
    requests,
  };
  return dispatch;
};

const projectNotices = (value: unknown) => {
  const noticeState = decodeCanonicalConstructor(value, "NoticeState.State");
  const notices: CanonicalProjection["notices"] = readList(noticeState.records, (value) => {
    const item = decodeCanonicalConstructor(value, "NoticeState.Record");
    const pending =
      tag(item.pending) === "Some"
        ? (() => {
            const p = decodeCanonicalConstructor(
              decodeCanonicalConstructor(item.pending, "Some").value,
              "NoticeState.Pending",
            );
            return {
              id: nat(p.id, true),
              count: nat(p.count),
              sequence: nat(p.sequence, true),
              leased: bool(p.leased),
            };
          })()
        : (decodeCanonicalConstructor(item.pending, "None"), undefined);
    return {
      id: nat(item.id, true),
      partition: nat(item.partition, true),
      group: nat(item.group, true),
      reservation: nat(item.reservation, true),
      suppressed: nat(item.suppressed),
      ...(pending === undefined ? {} : { pending }),
    };
  });
  if (
    new Set(notices.map((item) => item.id)).size !== notices.length ||
    new Set(notices.map((item) => item.reservation)).size !== notices.length ||
    new Set(notices.flatMap((item) => (item.pending === undefined ? [] : [item.pending.id]))).size !==
      notices.filter((item) => item.pending !== undefined).length ||
    new Set(notices.flatMap((item) => (item.pending === undefined ? [] : [item.pending.sequence]))).size !==
      notices.filter((item) => item.pending !== undefined).length
  )
    throw new TypeError("duplicate canonical notice identity");
  return notices;
};

const projectReuse = (value: unknown) => {
  const reuseState = decodeCanonicalConstructor(value, "ReuseState.State");
  const reuse: CanonicalProjection["reuse"] = {
    claims: readList(reuseState.claims, (value) => {
      const item = decodeCanonicalConstructor(value, "ReuseState.Claim");
      return { id: nat(item.id, true), attached: bool(item.attached) };
    }),
    cache: readList(reuseState.cache, (value) => {
      const item = decodeCanonicalConstructor(value, "ReuseState.Entry");
      return {
        id: nat(item.id, true),
        partition: nat(item.partition, true),
        bytes: nat(item.bytes),
        reservation: nat(item.reservation, true),
      };
    }),
  };
  if (
    new Set(reuse.claims.map((item) => item.id)).size !== reuse.claims.length ||
    new Set(reuse.cache.map((item) => item.id)).size !== reuse.cache.length
  ) {
    throw new TypeError("duplicate canonical evaluation identity");
  }
  return reuse;
};

const projectRevision = (value: unknown) => {
  const rawRevision = decodeCanonicalConstructor(value, "RevisionState.State");
  const revision = {
    entries: readList(rawRevision.entries, (value) => {
      const entry = decodeCanonicalConstructor(value, "RevisionState.Entry");
      return {
        subject: nat(entry.subject, true),
        input: nat(entry.input, true),
        generation: nat(entry.generation, true),
        members: nat(entry.members, true),
      };
    }),
    nextGeneration: nat(rawRevision.next_generation, true),
  };
  if (new Set(revision.entries.map((entry) => entry.subject)).size !== revision.entries.length)
    throw new TypeError("duplicate canonical revision subject");
  return revision;
};

const projectCollection = (value: unknown) => {
  const collectionState = decodeCanonicalConstructor(value, "CollectionState.State");
  const collection = {
    ready: readList(collectionState.ready, (id) => nat(id, true)),
    leases: readList(collectionState.leases, (value) => {
      const item = decodeCanonicalConstructor(value, "CollectionState.Lease");
      return { advice: nat(item.advice, true), owner: nat(item.owner, true) };
    }),
    claims: readList(collectionState.claims, (value) => {
      const item = decodeCanonicalConstructor(value, "CollectionState.Claim");
      return { group: nat(item.group, true), owner: nat(item.owner, true) };
    }),
  };
  if (
    new Set(collection.ready).size !== collection.ready.length ||
    new Set(collection.leases.map((item) => item.advice)).size !== collection.leases.length ||
    collection.leases.some((item) => !collection.ready.includes(item.advice)) ||
    new Set(collection.claims.map((item) => item.group)).size !== collection.claims.length
  ) {
    throw new TypeError("inconsistent canonical collection state");
  }
  return collection;
};

const projectDelivery = (value: unknown) => {
  const deliveryState = decodeCanonicalConstructor(value, "DeliveryState.State");
  const rawSubmissions = decodeCanonicalConstructor(deliveryState.submissions, "SubmissionState.State");
  const surface = (value: unknown): "edit" | "background" | "stop" => {
    const name = tag(value);
    decodeCanonicalConstructor(value, name);
    if (name === "Handoff.Edit") return "edit";
    if (name === "Handoff.Background") return "background";
    if (name === "Handoff.Stop") return "stop";
    throw new TypeError("invalid submission surface");
  };
  const decodeLease = (value: unknown) => {
    const lease = decodeCanonicalConstructor(value, "Handoff.Lease");
    const phaseName = tag(lease.phase);
    const leasePhase = decodeCanonicalConstructor(lease.phase, phaseName);
    if ("surface" in leasePhase) surface(leasePhase.surface);
    const phase = phaseName.slice("Handoff.".length).toLowerCase();
    if (!["available", "reserved", "authorized", "submitted", "uncertain"].includes(phase))
      throw new TypeError("invalid submission lease phase");
    nat(lease.item, true);
    bool(lease.closed);
    return {
      round: nat(lease.round, true),
      phase: phase as "available" | "reserved" | "authorized" | "submitted" | "uncertain",
      reoffered: bool(lease.reoffered),
    };
  };
  const delivery = {
    slots: readList(deliveryState.slots, (value) => {
      const item = decodeCanonicalConstructor(value, "DeliveryState.Slot");
      decodeCanonicalConstructor(item.phase, tag(item.phase));
      const phase = tag(item.phase).slice("DeliveryState.".length).toLowerCase();
      if (!["reserved", "authorized", "submitted", "failed", "uncertain"].includes(phase))
        throw new TypeError("invalid canonical delivery phase");
      return {
        group: nat(item.group, true),
        round: nat(item.round, true),
        attempt: nat(item.attempt, true),
        token: nat(item.token, true),
        selected: readList(item.selected, (id) => nat(id, true)),
        phase: phase as "reserved" | "authorized" | "submitted" | "failed" | "uncertain",
      };
    }),
    counters: readList(deliveryState.counters, (value) => {
      const item = decodeCanonicalConstructor(value, "DeliveryState.Counter");
      return { group: nat(item.group, true), round: nat(item.round, true), used: nat(item.used) };
    }),
    submissions: {
      batches: readList(rawSubmissions.batches, (value) => {
        const item = decodeCanonicalConstructor(value, "SubmissionState.Batch");
        decodeCanonicalConstructor(item.phase, tag(item.phase));
        const phase = tag(item.phase).slice("Delivery.".length).toLowerCase();
        if (!["reserved", "authorized", "submitted", "uncertain"].includes(phase))
          throw new TypeError("invalid submission phase");
        return {
          advice: nat(item.advice, true),
          group: nat(item.group, true),
          round: nat(item.round, true),
          token: nat(item.token, true),
          surface: surface(item.surface),
          phase: phase as "reserved" | "authorized" | "submitted" | "uncertain",
          fingerprints: readList(item.fingerprints, (id) => nat(id, true)),
          units: readList(item.units, (id) => nat(id, true)),
        };
      }),
      leases: readList(rawSubmissions.leases, (value) => {
        const item = decodeCanonicalConstructor(value, "SubmissionState.LeaseRecord");
        const lease = decodeLease(item.current);
        if (tag(item.previous) === "Some") decodeLease(decodeCanonicalConstructor(item.previous, "Some").value);
        else decodeCanonicalConstructor(item.previous, "None");
        return { advice: nat(item.advice, true), fingerprint: nat(item.fingerprint, true), ...lease };
      }),
    },
  };
  if (
    new Set(delivery.slots.map((item) => item.group)).size !== delivery.slots.length ||
    new Set(delivery.counters.map((item) => `${item.group}:${item.round}`)).size !== delivery.counters.length ||
    delivery.counters.some((item) => item.used > 4)
  )
    throw new TypeError("inconsistent canonical delivery state");
  if (
    new Set(delivery.submissions.batches.map((item) => `${item.advice}:${item.token}`)).size !==
      delivery.submissions.batches.length ||
    new Set(delivery.submissions.leases.map((item) => `${item.advice}:${item.fingerprint}`)).size !==
      delivery.submissions.leases.length
  ) {
    throw new TypeError("inconsistent canonical submission state");
  }
  return delivery;
};

const validateDispatch = (
  dispatch: CanonicalProjection["dispatch"],
  executionLimits: CanonicalProjection["executionLimits"],
) => {
  const dispatchEntries = [...dispatch.queued, ...dispatch.running];
  validateDispatchRequests(dispatch, executionLimits);
  if (
    new Set(dispatchEntries.map((x) => x.operation)).size !== dispatchEntries.length ||
    new Set(dispatchEntries.map((x) => x.sequence)).size !== dispatchEntries.length ||
    dispatchEntries.some((x) => x.sequence >= dispatch.nextSequence)
  )
    throw new TypeError("inconsistent canonical dispatch state");
};

const workReservationMismatch = (work: CanonicalProjection["work"][number], charge: CapacityCharge | undefined) => {
  if (work.reservation === 0) return !["awaitingSourceRead", "sourceReading"].includes(work.kind);
  if (charge?.partition !== work.partition) return true;
  if (work.kind === "pendingFinding") return !["storedResult", "adviceRecheck"].includes(charge.purpose);
  return charge.purpose !== (work.kind === "preparing" ? "preparation" : "reviewUnit");
};

const validateStateIdentities = (
  data: Pick<CanonicalProjection, "charges" | "work" | "rounds" | "admissions"> & {
    readonly chargeIds: ReadonlySet<number>;
  },
  s: ReturnType<typeof decodeState>,
) => {
  const { charges, chargeIds, work, rounds, admissions } = data;
  if (
    chargeIds.size !== charges.length ||
    work.filter((x) => x.reservation !== 0).length > charges.length ||
    new Set(work.map((x) => x.operation)).size !== work.length ||
    new Set(work.filter((x) => x.reservation !== 0).map((x) => x.reservation)).size !==
      work.filter((x) => x.reservation !== 0).length
  )
    throw new TypeError("inconsistent canonical state");
  validateRoundIdentities(rounds, admissions, s);
};

const validateWorkReservations = (
  work: CanonicalProjection["work"],
  chargesById: ReadonlyMap<number, CapacityCharge>,
  rounds: CanonicalProjection["rounds"],
  s: ReturnType<typeof decodeState>,
) => {
  if (
    work.some(
      (x) =>
        workReservationMismatch(x, chargesById.get(x.reservation)) ||
        x.operation >= (s.next_operation as number) ||
        !rounds.some(
          (round) => round.partition === x.partition && round.lifetime === x.lifetime && round.id === x.round,
        ),
    )
  )
    throw new TypeError("inconsistent canonical state");
};

const validateCachedReservations = (
  cache: CanonicalProjection["reuse"]["cache"],
  chargesById: ReadonlyMap<number, CapacityCharge>,
) => {
  if (
    cache.some((entry) => {
      const charge = chargesById.get(entry.reservation);
      return charge?.purpose !== "storedResult" || charge.partition !== entry.partition || charge.bytes !== entry.bytes;
    })
  )
    throw new TypeError("inconsistent canonical state");
};

const validateCapacityLimits = (
  charges: CanonicalProjection["charges"],
  rounds: CanonicalProjection["rounds"],
  usedBytes: number,
  ledger: ReturnType<typeof decodeLedger>,
  limits: ReturnType<typeof decodeLedgerLimits>,
) => {
  if (
    charges.some((x) => x.id >= (ledger.next_id as number)) ||
    rounds.some((round) => {
      const local = charges.filter((charge) => charge.partition === round.partition);
      return (
        local.length > (limits.partition_items as number) ||
        local.reduce((sum, charge) => sum + charge.bytes, 0) > (limits.partition_bytes as number)
      );
    }) ||
    charges.length > (limits.global_items as number) ||
    usedBytes > (limits.global_bytes as number)
  )
    throw new TypeError("inconsistent canonical state");
};

const validateDispatchRequests = (
  dispatch: CanonicalProjection["dispatch"],
  executionLimits: CanonicalProjection["executionLimits"],
) => {
  if (
    dispatch.running.filter((entry) => entry.preparation).length > executionLimits.preparation ||
    dispatch.requests.length > executionLimits.jevRequests ||
    new Set(dispatch.requests.map((entry) => entry.request)).size !== dispatch.requests.length ||
    new Set(dispatch.requests.map((entry) => entry.operation)).size !== dispatch.requests.length ||
    dispatch.requests.some((entry) => entry.interrupted && !entry.started)
  )
    throw new TypeError("inconsistent canonical dispatch state");
};

const validateRoundIdentities = (
  rounds: CanonicalProjection["rounds"],
  admissions: CanonicalProjection["admissions"],
  s: ReturnType<typeof decodeState>,
) => {
  if (
    new Set(rounds.map((x) => x.partition)).size !== rounds.length ||
    new Set(admissions.map((x) => x.partition)).size !== admissions.length ||
    rounds.some(
      (x) => x.id >= (s.next_round as number) || (x.write !== undefined && x.write >= (s.next_operation as number)),
    )
  )
    throw new TypeError("inconsistent canonical state");
};

const projectGlobal = (state: unknown, charges: CanonicalProjection["charges"], usedBytes: number) => {
  const total = decodeCanonicalConstructor(bendCanonicalTotal(state), "Ledger.Usage");
  const global = { items: nat(total.items), bytes: nat(total.bytes) };
  if (global.items !== charges.length || global.bytes !== usedBytes) throw new TypeError("Bend ledger total mismatch");
  return global;
};

const projectInventory = (state: unknown, limits: ReturnType<typeof decodeLedgerLimits>) => {
  const inventory = readList(bendCanonicalInventory(state), (entry) => {
    const x = decodeCanonicalConstructor(entry, "Ledger.InventoryEntry");
    const entryLimits = decodeCanonicalConstructor(x.limits, "Ledger.Limits");
    return {
      purpose: purpose(x.purpose),
      limits: {
        globalItems: nat(entryLimits.global_items, true),
        globalBytes: nat(entryLimits.global_bytes, true),
        partitionItems: nat(entryLimits.partition_items, true),
        partitionBytes: nat(entryLimits.partition_bytes, true),
      },
    };
  });
  if (
    inventory.length !== 6 ||
    new Set(inventory.map((entry) => entry.purpose)).size !== 6 ||
    inventory.some(
      (entry) =>
        entry.limits.globalItems !== limits.global_items ||
        entry.limits.globalBytes !== limits.global_bytes ||
        entry.limits.partitionItems !== limits.partition_items ||
        entry.limits.partitionBytes !== limits.partition_bytes,
    )
  )
    throw new TypeError("inconsistent capacity inventory");
  return inventory;
};

export const projectCanonical = (state: unknown): CanonicalProjection => {
  // Only registered, fully frozen Bend states enter this weak-key cache.
  if (typeof state === "object" && state !== null) {
    const cached = projections.get(state);
    if (cached !== undefined) return cached;
  }
  const identity = object(state);
  if (!known.has(identity)) throw new TypeError("foreign canonical state");
  const s = decodeState(state);
  nat(s.next_round, true);
  nat(s.next_operation, true);
  const completedEdits = projectCompletedEdits(s.history);
  const dispatch = projectDispatch(s.dispatch);
  const collectionState = decodeCanonicalConstructor(s.collection, "CollectionState.State");
  const notices = projectNotices(collectionState.notices);
  const reuse = projectReuse(collectionState.reuse);
  const revision = projectRevision(collectionState.revision);

  const collection = projectCollection(s.collection);
  const delivery = projectDelivery(collectionState.delivery);
  const executionLimits = {
    preparation: nat(bendPreparationLimit(), true),
    jevRequests: nat(bendJevRequestLimit(), true),
  };
  validateDispatch(dispatch, executionLimits);
  const ledger = decodeLedger(s.ledger);
  nat(ledger.next_id, true);
  const limits = decodeLedgerLimits(ledger.limits);
  for (const value of Object.values(limits).slice(1)) nat(value, true);
  const charges = readList(ledger.charges, charge);
  const rounds = readList(s.rounds, (value) => {
    const x = decodeCanonicalConstructor(value, "Canonical.Round");
    const write = tag(x.write) === "Some" ? nat(decodeCanonicalConstructor(x.write, "Some").value, true) : undefined;
    if (write === undefined) decodeCanonicalConstructor(x.write, "None");
    const quietSince =
      tag(x.quiet_since) === "Some" ? nat(decodeCanonicalConstructor(x.quiet_since, "Some").value) : undefined;
    if (quietSince === undefined) decodeCanonicalConstructor(x.quiet_since, "None");
    return {
      partition: nat(x.partition, true),
      lifetime: nat(x.lifetime, true),
      id: nat(x.id, true),
      waiting: bool(x.waiting),
      deciding: bool(x.deciding),
      ...(write === undefined ? {} : { write }),
      uncertain: bool(x.uncertain),
      ...(quietSince === undefined ? {} : { quietSince }),
    };
  });
  const admissions = readList(s.admissions, (value) => {
    const x = decodeCanonicalConstructor(value, "Admission.AdmissionState");
    const permits = readList(x.permits, (entry) => {
      const permit = decodeCanonicalConstructor(entry, "Admission.Permit");
      const started = nat(permit.started);
      const deadline = nat(permit.deadline);
      if (deadline < started) throw new TypeError("invalid permit deadline");
      return { token: nat(permit.token, true), tool: nat(permit.tool, true), round: nat(permit.round, true), deadline };
    });
    const next = nat(x.next_token, true);
    if (
      permits.some((item) => item.token >= next) ||
      new Set(permits.map((item) => item.token)).size !== permits.length ||
      new Set(permits.map((item) => item.tool)).size !== permits.length
    )
      throw new TypeError("invalid admission tokens");
    return {
      partition: nat(x.partition, true),
      lifetime: nat(x.lifetime, true),
      round: nat(x.round),
      active: bool(x.active),
      closedAt: nat(x.closed_at),
      permits,
    };
  });
  const work = readList(s.work, (value) => {
    const x = decodeCanonicalConstructor(value, "Canonical.Work");
    const kind = tag(x.kind);
    decodeCanonicalConstructor(x.kind, kind);
    const names = {
      "Canonical.AwaitingSourceRead": "awaitingSourceRead",
      "Canonical.SourceReading": "sourceReading",
      "Canonical.Preparing": "preparing",
      "Canonical.Reviewing": "reviewing",
      "Canonical.AtJev": "atJev",
      "Canonical.PendingFinding": "pendingFinding",
    } as const;
    const stage = names[kind as keyof typeof names];
    if (stage === undefined) throw new TypeError("invalid work kind");
    return {
      partition: nat(x.partition, true),
      lifetime: nat(x.lifetime, true),
      round: nat(x.round, true),
      operation: nat(x.operation, true),
      reservation: nat(x.charge),
      parent: nat(x.parent),
      kind: stage,
    };
  });
  const pendingFindings = readList(s.work, (value) => {
    const x = decodeCanonicalConstructor(value, "Canonical.Work");
    return tag(x.kind) === "Canonical.PendingFinding"
      ? {
          operation: nat(x.operation, true),
          count: nat(decodeCanonicalConstructor(x.kind, "Canonical.PendingFinding").count, true),
        }
      : undefined;
  }).filter((item): item is { operation: number; count: number } => item !== undefined);
  const chargeIds = new Set(charges.map((x) => x.id));
  const chargesById = new Map(charges.map((x) => [x.id, x]));
  if (
    notices.some((item) => {
      const held = chargesById.get(item.reservation);
      return held?.purpose !== "operationalNotice" || held.partition !== item.partition;
    })
  )
    throw new TypeError("canonical notice reservation mismatch");
  const usedBytes = charges.reduce((sum, x) => sum + x.bytes, 0);
  validateStateIdentities({ charges, chargeIds, work, rounds, admissions }, s);
  validateWorkReservations(work, chargesById, rounds, s);
  validateCachedReservations(reuse.cache, chargesById);
  validateCapacityLimits(charges, rounds, usedBytes, ledger, limits);
  const global = projectGlobal(state, charges, usedBytes);
  const partitionIds = [
    ...new Set([...rounds.map((round) => round.partition), ...charges.map((item) => item.partition)]),
  ];
  const partitions = partitionIds.map((partition) => {
    const usage = decodeCanonicalConstructor(bendCanonicalPartitionUsage(state, partition), "Ledger.Usage");
    return { partition, items: nat(usage.items), bytes: nat(usage.bytes) };
  });
  const inventory = projectInventory(state, limits);
  const projection: CanonicalProjection = freezeCanonicalData({
    global,
    executionLimits,
    limits: {
      globalItems: nat(limits.global_items, true),
      globalBytes: nat(limits.global_bytes, true),
      partitionItems: nat(limits.partition_items, true),
      partitionBytes: nat(limits.partition_bytes, true),
    },
    partitions,
    charges,
    inventory,
    rounds,
    admissions,
    completedEdits,
    work,
    pendingFindings,
    dispatch,
    collection,
    revision,
    reuse,
    notices,
    delivery,
  });
  projections.set(identity, projection);
  return projection;
};
const decodeLimits = decoder(CanonicalLimitsSchema);
export const initialCanonical = (input: typeof CanonicalLimitsSchema.Type): unknown => {
  const limits = decodeLimits(input);
  const state = bendCanonicalInitial({
    $: "Ledger.Limits",
    global_items: limits.globalItems,
    global_bytes: limits.globalBytes,
    partition_items: limits.partitionItems,
    partition_bytes: limits.partitionBytes,
  });
  registerCanonical(state);
  return state;
};
/** Callers must supply measured byte counts, authenticated attribution, and correct deadline facts. */
export const stepCanonical = (
  state: unknown,
  event: CanonicalEvent,
): { readonly state: unknown; readonly commands: readonly CanonicalCommand[]; readonly rejection?: string } => {
  projectCanonical(state);
  const raw = bendCanonicalStep(state, encode(event));
  switch (tag(raw)) {
    case "Canonical.Advanced": {
      const x = decodeCanonicalConstructor(raw, "Canonical.Advanced");
      const commands = readList(x.commands, decodeCommand);
      registerCanonical(x.state);
      return { state: x.state, commands };
    }
    case "Canonical.Rejected": {
      const x = decodeCanonicalConstructor(raw, "Canonical.Rejected");
      const reason = decodeCanonicalRejection(x.reason);
      const rejection =
        reason.$ === "Canonical.PermitDenied"
          ? reason.reason.$.slice("Admission.".length)
          : reason.$.slice("Canonical.".length);
      registerCanonical(x.state);
      return { state: x.state, commands: [], rejection };
    }
    default:
      throw new TypeError("unknown canonical step");
  }
};
