import { bendCanonicalInitial, bendCanonicalInventory, bendCanonicalPartitionUsage, bendCanonicalStep, bendCanonicalTotal } from "./canonical.generated.js";

const MAX_NAT = 2 ** 48 - 1;
// Keep reserved + requested bytes within Bend's 48-bit immediate Nat range.
export const CANONICAL_MAX_BYTES = 2 ** 47 - 1;
const MAX_BYTES = CANONICAL_MAX_BYTES;
export const CANONICAL_MAX_UNITS = 1024;
const MAX_UNITS = CANONICAL_MAX_UNITS;
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid canonical object");
  return value as RecordValue;
};
const tag = (value: unknown): string => {
  const name = object(value).$;
  if (typeof name !== "string") throw new TypeError("missing canonical constructor");
  return name;
};
const nat = (value: unknown, positive = false): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value > MAX_NAT ||
      value < (positive ? 1 : 0)) throw new TypeError("invalid canonical Nat");
  return value;
};
const bytes = (value: unknown): number => {
  const amount = nat(value, true);
  if (amount > MAX_BYTES) throw new TypeError("canonical byte count exceeds safe sum bound");
  return amount;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError("invalid canonical Bool");
  return value;
};
const ruleOrderTag = (value: unknown): string => {
  if (value !== "before" && value !== "equal" && value !== "after") throw new TypeError("invalid rule order fact");
  return `RulePolicy.${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
};
const fields = (value: unknown, expectedTag: string, names: readonly string[]): RecordValue => {
  const item = object(value);
  if (tag(item) !== expectedTag || Object.keys(item).sort().join() !== ["$", ...names].sort().join()) {
    throw new TypeError(`invalid ${expectedTag} constructor`);
  }
  return item;
};
const inputFields = (value: unknown, names: readonly string[]): void => {
  if (Object.keys(object(value)).sort().join() !== names.slice().sort().join()) {
    throw new TypeError("invalid canonical event fields");
  }
};
declare const probabilityWordsBrand: unique symbol;
export type ProbabilityWords = Readonly<{
  high: number; low: number; [probabilityWordsBrand]: true;
}>;
export const probabilityWords = (value: number): ProbabilityWords => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError("probability must be finite in [0, 1]");
  }
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, Object.is(value, -0) ? 0 : value, false);
  return { high: bytes.getUint32(0, false), low: bytes.getUint32(4, false) } as ProbabilityWords;
};
const encodedProbabilityWords = (value: unknown): unknown => {
  inputFields(value, ["high", "low"]);
  const word = object(value);
  const high = nat(word.high);
  const low = nat(word.low);
  if (high > 0xffffffff || low > 0xffffffff) throw new TypeError("invalid probability word");
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setUint32(0, high, false);
  bytes.setUint32(4, low, false);
  const probability = bytes.getFloat64(0, false);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1 || Object.is(probability, -0)) {
    throw new TypeError("invalid probability words");
  }
  return { $: "RulePolicy.Words", high, low };
};
const list = (values: readonly number[]): unknown => {
  if (!Array.isArray(values) || values.length > MAX_UNITS) throw new TypeError("too many units");
  return values.reduceRight<unknown>((tail, value) => ({ $: "Con", head: bytes(value), tail }), { $: "Nil" });
};
const readList = <T>(value: unknown, decode: (item: unknown) => T, limit = 2048): T[] => {
  const result: T[] = [];
  let cursor = value;
  while (tag(cursor) === "Con") {
    if (result.length >= limit) throw new TypeError("canonical list exceeded bound");
    const cell = fields(cursor, "Con", ["head", "tail"]);
    result.push(decode(cell.head));
    cursor = cell.tail;
  }
  fields(cursor, "Nil", []);
  return result;
};

export type CanonicalEvent =
  | { readonly kind: "reserveCapacity"; readonly partition: number; readonly bytes: number; readonly purpose: CapacityPurpose }
  | { readonly kind: "resizeCapacity"; readonly reservation: number; readonly bytes: number; readonly purpose: CapacityPurpose }
  | { readonly kind: "releaseCapacity"; readonly reservation: number }
  | { readonly kind: "replaceCapacity"; readonly reservation: number; readonly unitBytes: readonly number[] }
  | { readonly kind: "issuePermit"; readonly partition: number; readonly lifetime: number; readonly tool: number; readonly started: number; readonly deadline: number; readonly now: number; readonly facts: ProspectiveFacts }
  | { readonly kind: "consumePermit"; readonly partition: number; readonly lifetime: number; readonly token: number; readonly tool: number; readonly now: number }
  | { readonly kind: "releasePermit"; readonly partition: number; readonly lifetime: number; readonly token: number }
  | { readonly kind: "expirePermit"; readonly partition: number; readonly lifetime: number; readonly token: number; readonly deadlineReached: boolean }
  | { readonly kind: "closePermitRound"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly at: number; readonly prospective: boolean }
  | { readonly kind: "openRound"; readonly partition: number; readonly lifetime: number }
  | { readonly kind: "admitObservation"; readonly partition: number; readonly lifetime: number; readonly round: number }
  | { readonly kind: "startObservation" | "completeObservation" | "interruptObservation"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly observation: number }
  | { readonly kind: "beginPreparation"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly bytes: number }
  | { readonly kind: "beginObservedPreparation"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly observation: number; readonly bytes: number }
  | { readonly kind: "interruptPreparation"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number }
  | { readonly kind: "preparationCompleted"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly unitBytes: readonly number[] }
  | { readonly kind: "startReview" | "retireReview"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number }
  | { readonly kind: "reviewCompleted"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly outcome: "finding" | "clear" | "unavailable" | "interrupted" | "discarded" }
  | { readonly kind: "reviewObserved"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly outcome: "finding" | "clear"; readonly currentWork: boolean }
  | { readonly kind: "findingCountUpdated"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly count: number }
  | { readonly kind: "queueDispatch" | "dispatchSettled"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number }
  | { readonly kind: "discardDispatch"; readonly operations: readonly number[] }
  | { readonly kind: "dispatchScopeCheck"; readonly namedCount: number; readonly cancelledCount: number; readonly hasUnnamed: boolean }
  | { readonly kind: "closeDispatch" }
  | { readonly kind: "preparedOfferCheck"; readonly ready: boolean; readonly withinFrame: boolean }
  | { readonly kind: "emptyPreparedCheck"; readonly readyCount: number; readonly hasNonSkipped: boolean; readonly ticketed: boolean }
  | { readonly kind: "reviewFailureCheck"; readonly backendOrTimeout: boolean; readonly credential: boolean; readonly missing: boolean }
  | { readonly kind: "stopPolled"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly deadline: boolean }
  | { readonly kind: "stopGroupPolled"; readonly group: number; readonly lifetime: number; readonly round: number; readonly scopes: readonly { readonly partition: number; readonly round: number }[]; readonly deadline: boolean; readonly extraPending: boolean; readonly continuations: number }
  | { readonly kind: "stopGroupEnded"; readonly group: number; readonly lifetime: number; readonly round: number; readonly scopes: readonly { readonly partition: number; readonly round: number }[] }
  | { readonly kind: "collectionReady"; readonly advice: number; readonly already: boolean; readonly turnEnd: boolean; readonly cycleComplete: boolean; readonly elapsed: number; readonly window: number }
  | { readonly kind: "collectionCredentialCheck"; readonly sameScope: boolean; readonly generationValid: boolean }
  | { readonly kind: "collectionCandidateCheck"; readonly samePartition: boolean; readonly unleased: boolean; readonly hasUnsuppressed: boolean; readonly ticketOwns: boolean }
  | { readonly kind: "collectionOrderCheck"; readonly leftCycle: number; readonly leftSequence: number; readonly rightCycle: number; readonly rightSequence: number }
  | { readonly kind: "collectionExpiryCheck"; readonly elapsed: number; readonly lifetime: number }
  | { readonly kind: "collectionFitCheck"; readonly items: number; readonly bytes: number }
  | { readonly kind: "collectionFindingCheck"; readonly selectionPartition: number; readonly selectionRound: number; readonly unit: number; readonly partition: number; readonly round: number; readonly snapshot: number; readonly currentSnapshot: number; readonly credential: number; readonly currentCredential: number; readonly ageMs: number; readonly soloBytes: number; readonly collectionReady: boolean; readonly selectedCount: number; readonly prospectiveBytes: number }
  | { readonly kind: "collectionNoticeCheck"; readonly items: number; readonly bytes: number; readonly skipUnfitting: boolean }
  | { readonly kind: "collectionReserveLease" | "collectionReleaseLease"; readonly advice: number; readonly token: number }
  | { readonly kind: "collectionLeaseCheck"; readonly advice: number; readonly token: number; readonly expired: boolean; readonly stopCollector: boolean; readonly sameGroup: boolean; readonly reofferable: boolean }
  | { readonly kind: "collectionRetireAdvice"; readonly advice: number }
  | { readonly kind: "collectionClaimBackground"; readonly group: number; readonly token: number; readonly active: boolean; readonly capacity: number }
  | { readonly kind: "collectionReleaseBackground"; readonly group: number; readonly token: number }
  | { readonly kind: "collectionExpireBackground"; readonly group: number; readonly token: number; readonly elapsed: number; readonly lifetime: number }
  | { readonly kind: "finishReserve"; readonly group: number; readonly lifetime: number; readonly round: number; readonly attempt: number; readonly token: number; readonly selected: readonly number[]; readonly hasNotice: boolean; readonly passNotices: boolean; readonly canWrite: boolean; readonly bindingValid: boolean; readonly deadlineReached: boolean }
  | { readonly kind: "finishRelease"; readonly group: number; readonly round: number; readonly attempt: number; readonly token: number }
  | { readonly kind: "finishAuthorize"; readonly group: number; readonly round: number; readonly attempt: number; readonly token: number; readonly selected: readonly number[] }
  | { readonly kind: "finishTerminal"; readonly group: number; readonly round: number; readonly attempt: number; readonly token: number; readonly selected: readonly number[]; readonly outcome: "acknowledged" | "failed" | "unknown" }
  | { readonly kind: "finishEnd"; readonly group: number; readonly round: number; readonly attempt: number; readonly token: number }
  | { readonly kind: "continuationConsume"; readonly group: number; readonly round: number }
  | { readonly kind: "submissionBegin"; readonly advice: number; readonly group: number; readonly round: number; readonly token: number; readonly surface: "edit" | "background" | "stop"; readonly authorizeNow: boolean; readonly fingerprints: readonly number[]; readonly units: readonly number[] }
  | { readonly kind: "submissionAuthorize" | "submissionRelease" | "submissionReofferCheck"; readonly advice: number; readonly token: number }
  | { readonly kind: "submissionTerminal"; readonly advice: number; readonly token: number; readonly certain: boolean }
  | { readonly kind: "submissionForget"; readonly advice: number }
  | { readonly kind: "submissionSuppressCheck"; readonly advice: number; readonly fingerprint: number; readonly round: number; readonly surface: "edit" | "background" | "stop" }
  | { readonly kind: "submissionExpiryCheck"; readonly advice: number; readonly token: number; readonly elapsed: number; readonly lifetime: number }
  | { readonly kind: "revisionRegister"; readonly subject: number; readonly input: number; readonly addMember: boolean }
  | { readonly kind: "revisionRelease"; readonly subject: number; readonly generation: number }
  | { readonly kind: "revisionSupersededCheck"; readonly subject: number; readonly candidateSubject: number; readonly generation: number }
  | { readonly kind: "revisionCurrentCheck"; readonly subject: number; readonly input: number; readonly generation: number }
  | { readonly kind: "revisionGenerationCheck"; readonly subject: number }
  | { readonly kind: "revisionCountCheck" }
  | { readonly kind: "ticketOpen" | "ticketForget" | "ticketClose"; readonly id: number }
  | { readonly kind: "ticketFail"; readonly id: number; readonly reason: TicketReason }
  | { readonly kind: "ticketAddUnit"; readonly id: number; readonly unit: number }
  | { readonly kind: "ticketStepUnit"; readonly id: number; readonly unit: number; readonly event: TicketUnitEvent; readonly reason: TicketReason }
  | { readonly kind: "ticketUnitCheck"; readonly id: number; readonly unit: number }
  | { readonly kind: "ticketTerminal"; readonly id: number; readonly expired: boolean; readonly credentialValid: boolean; readonly liveAdvice: boolean; readonly pendingNotice: boolean }
  | { readonly kind: "ticketCollectGateCheck"; readonly expired: boolean; readonly credentialValid: boolean }
  | { readonly kind: "ticketFinalAuthorityCheck"; readonly admittedBlock: boolean; readonly currentBlock: boolean }
  | { readonly kind: "ticketJoinedCheck"; readonly state: TicketJoinedState; readonly staleUnavailable: boolean; readonly hasRevision: boolean; readonly hasAdviceId: boolean }
  | { readonly kind: "ticketRetentionCheck"; readonly limit: number }
  | { readonly kind: "cleanupCheck"; readonly facts: CleanupFacts }
  | { readonly kind: "cleanupCommit" }
  | { readonly kind: "deliveryReleaseCheck"; readonly acknowledged: boolean }
  | { readonly kind: "deliveryAcknowledgeCheck"; readonly items: number; readonly anyExpired: boolean }
  | { readonly kind: "deliveryFinalizeCheck"; readonly items: number; readonly allAcknowledged: boolean; readonly anyExpired: boolean }
  | { readonly kind: "deliveryFindingDispositionCheck"; readonly composed: boolean; readonly remaining: number }
  | { readonly kind: "deliverySubmissionCandidateCheck"; readonly facts: { readonly roundActive: boolean; readonly hasRound: boolean; readonly hasUnit: boolean; readonly hasDelivery: boolean; readonly pendingCapacity: boolean; readonly submissionAllowed: boolean; readonly currentWork: boolean; readonly credentialAuthorized: boolean } }
  | { readonly kind: "deliverySubmissionBatchCheck"; readonly count: number; readonly allValid: boolean }
  | { readonly kind: "deliveryCredentialObserveCheck"; readonly invalidSeen: boolean; readonly generationValid: boolean; readonly authorized: boolean }
  | { readonly kind: "deliveryFinalCredentialCheck"; readonly legacyCollect: boolean; readonly invalidSeen: boolean }
  | { readonly kind: "validationRouteCheck"; readonly ownerCurrent: boolean; readonly status: "current" | "stale" | "unavailable" | "unattributed" }
  | { readonly kind: "postValidationCheck"; readonly workAccepted: boolean; readonly expired: boolean; readonly hasFitting: boolean }
  | { readonly kind: "finalCandidateCheck"; readonly ownerCurrent: boolean; readonly credentialGeneration: boolean; readonly credentialAuthorized: boolean; readonly expired: boolean; readonly workCurrent: boolean; readonly hasFindings: boolean }
  | { readonly kind: "includeLayerCheck"; readonly supplied: boolean; readonly currentRank: number; readonly candidateRank: number }
  | { readonly kind: "fileSelectionCheck"; readonly protected: boolean; readonly excluded: boolean; readonly includesEmpty: boolean; readonly included: boolean }
  | { readonly kind: "fileProtectionInvalid" }
  | { readonly kind: "fileProtectionCheck"; readonly sensitiveName: boolean; readonly generatedOrVendor: boolean; readonly allowedExtension: boolean }
  | { readonly kind: "candidateFileCheck"; readonly gitAdmin: boolean; readonly physicalSafe: boolean; readonly gitAllowed: boolean }
  | { readonly kind: "reviewAdmissionCheck"; readonly rootValid: boolean; readonly configurationValid: boolean; readonly credentialReady: boolean; readonly selected: boolean }
  | { readonly kind: "ruleEnableCheck"; readonly packEnabled: boolean; readonly ruleEnabled: boolean }
  | { readonly kind: "ruleApplicabilityCheck"; readonly consent: boolean; readonly complete: boolean; readonly target: "directTypeShape" | "legacyFileTypeShape" | "otherTypeShape" | "functionTarget"; readonly globalIncluded: boolean; readonly globalExcluded: boolean; readonly packEnabled: boolean; readonly ruleEnabled: boolean; readonly ruleIncluded: boolean; readonly ruleExcluded: boolean; readonly semanticApplicable: boolean }
  | { readonly kind: "ruleFindingCheck"; readonly probability: ProbabilityWords; readonly threshold: ProbabilityWords }
  | { readonly kind: "ruleRankOrderCheck"; readonly left: ProbabilityWords; readonly right: ProbabilityWords; readonly leftRank: number; readonly rightRank: number }
  | { readonly kind: "adviceOrderCheck"; readonly left: ProbabilityWords; readonly right: ProbabilityWords; readonly pathOrder: "before" | "equal" | "after"; readonly idOrder: "before" | "equal" | "after" }
  | { readonly kind: "ruleBudgetCheck"; readonly position: number; readonly limit: number }
  | { readonly kind: "reuseRoute"; readonly id: number; readonly liveAdvice: boolean }
  | { readonly kind: "reuseClaim" | "reuseAttach" | "reuseRelease" | "reuseTouch"; readonly id: number }
  | { readonly kind: "cachePrepare"; readonly id: number; readonly bytes: number; readonly entryLimit: number; readonly byteLimit: number }
  | { readonly kind: "cacheCommit"; readonly id: number; readonly partition: number; readonly bytes: number; readonly reservation: number; readonly entryLimit: number; readonly byteLimit: number }
  | { readonly kind: "cacheDiscardPartition"; readonly partition: number }
  | { readonly kind: "cacheClear" }
  | { readonly kind: "noticeAdvance"; readonly key: number; readonly remaining?: number; readonly maximumKeys: number; readonly proposed: number; readonly sequence: number; readonly maxCount: number }
  | { readonly kind: "noticeCommit"; readonly key: number; readonly partition: number; readonly group: number; readonly reservation: number; readonly pending: number; readonly sequence: number; readonly maximumKeys: number }
  | { readonly kind: "noticePrune"; readonly key: number; readonly leaseExpired: boolean; readonly pendingExpired: boolean; readonly excepted: boolean; readonly cooldownExpired: boolean }
  | { readonly kind: "noticeDrop" | "noticeClearPending"; readonly key: number }
  | { readonly kind: "noticeLease"; readonly key: number; readonly leased: boolean }
  | { readonly kind: "noticeSelect"; readonly partition: number; readonly group: number; readonly composed: boolean; readonly ticketed: boolean; readonly allowed: readonly number[] }
  | { readonly kind: "outputStarted"; readonly partition: number; readonly lifetime: number; readonly round: number }
  | { readonly kind: "outputTerminal"; readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly outcome: "acknowledged" | "failed" | "unknown" }
  | { readonly kind: "retirePartition"; readonly partition: number; readonly lifetime: number; readonly round: number };

export type CleanupFacts = {
  readonly active: boolean; readonly dispatcherIdle: boolean; readonly noAdvice: boolean;
  readonly noNotices: boolean; readonly noPendingEvaluations: boolean;
  readonly noCurrentWork: boolean; readonly noCooldowns: boolean;
  readonly connectionCountOk: boolean; readonly cacheMatchesLedger: boolean;
};

export type TicketReason = "backend" | "credential" | "capacity" | "stale" | "lost" | "expired";
export type TicketUnitEvent = "revise" | "clearResult" | "findingResult" | "failUnit" | "markDelivered";
export type TicketJoinedState = "pending" | "clear" | "finding" | "unavailable";

export type CanonicalCommand =
  | { readonly kind: "capacityGranted"; readonly id: number; readonly after: CapacityView }
  | { readonly kind: "capacityRefused"; readonly reason: CapacityRefusal; readonly after: CapacityView }
  | { readonly kind: "capacityResized"; readonly id: number; readonly after: CapacityView }
  | { readonly kind: "capacityUnitAdmitted"; readonly reservation: number; readonly position: number; readonly bytes: number; readonly after: CapacityView }
  | { readonly kind: "capacityUnitRefused"; readonly position: number; readonly bytes: number; readonly reason: CapacityRefusal; readonly after: CapacityView }
  | { readonly kind: "permitIssued"; readonly token: number; readonly round: number }
  | { readonly kind: "permitConsumed"; readonly round: number }
  | { readonly kind: "permitReleased" | "permitExpired" | "permitKept" }
  | { readonly kind: "permitRoundClosed"; readonly round: number }
  | { readonly kind: "roundStarted"; readonly id: number }
  | { readonly kind: "observationAdmitted"; readonly id: number }
  | { readonly kind: "observationStarted" | "observationCompleted" | "observationInterrupted" | "reviewStarted" }
  | { readonly kind: "prepare"; readonly operation: number; readonly reservation: number }
  | { readonly kind: "preparationRefused" }
  | { readonly kind: "unitAdmitted"; readonly operation: number; readonly reservation: number; readonly position: number; readonly bytes: number; readonly after: CapacityView }
  | { readonly kind: "unitRefused"; readonly position: number; readonly bytes: number; readonly reason: CapacityRefusal; readonly after: CapacityView }
  | { readonly kind: "preparationReleased"; readonly id: number; readonly after: CapacityView }
  | { readonly kind: "reservationReleased"; readonly id: number }
  | { readonly kind: "reviewRecorded"; readonly outcome: "finding" | "clear" | "unavailable" | "interrupted" | "discarded" }
  | { readonly kind: "retainFinding" | "settleClear" | "settleStaleClear" | "retireStaleFinding" | "findingCountRecorded" }
  | { readonly kind: "preparedSkipped" | "preparedAdmitted" | "preparedCapacityRefused" | "emptyLost" | "emptyAccepted" | "failureBackend" | "failureCredential" | "failureLost" | "failureNone" }
  | { readonly kind: "dispatchStarted"; readonly operation: number; readonly sequence: number; readonly cycle: number }
  | { readonly kind: "dispatchCycleCompleted"; readonly cycle: number }
  | { readonly kind: "dispatchDiscarded"; readonly operation: number; readonly running: boolean }
  | { readonly kind: "discardNamedOnly" | "discardAllUnfinished" }
  | { readonly kind: "waitForWork" }
  | { readonly kind: "cancelWork"; readonly operation: number }
  | { readonly kind: "finishReady" }
  | { readonly kind: "finishLimit" }
  | { readonly kind: "stopEnded" }
  | { readonly kind: "collectionEligible" | "collectionWaiting" | "collectionRetireCredential" | "collectionRetainCredential" | "collectionCandidate" | "collectionSkip" | "collectionBefore" | "collectionEqual" | "collectionAfter" | "collectionExpired" | "collectionCurrent" | "collectionFits" | "collectionLimited" | "collectionFindingSelected" | "collectionFindingRetained" | "collectionFindingLimited" | "collectionFindingExpired" | "collectionNoticeIncluded" | "collectionNoticeSkipped" | "collectionNoticeStopped" | "collectionLeaseReserved" | "collectionLeaseRefused" | "collectionLeaseReleased" | "collectionLeaseKept" | "collectionAdviceRetired" | "collectionBackgroundClaimed" | "collectionBackgroundRefused" | "collectionBackgroundReleased" | "collectionBackgroundKept" }
  | { readonly kind: "finishReserved" | "finishNotices" | "finishAllowedNoAdvice" | "finishAllowedDeadline" | "finishAllowedUnavailable" | "finishRefused" | "finishReleased" | "finishAuthorized" | "finishEnded" | "continuationConsumed" | "continuationRefused" }
  | { readonly kind: "finishRecorded"; readonly outcome: "acknowledged" | "failed" | "unknown" }
  | { readonly kind: "submissionBegun" | "submissionAuthorized" | "submissionRecorded" | "submissionReleased" | "submissionRefused" | "submissionForgotten" | "submissionSuppresses" | "submissionUnsuppressed" | "submissionReofferable" | "submissionNotReofferable" | "submissionExpired" | "submissionCurrent" }
  | { readonly kind: "revisionReused" | "revisionReplaced" | "revisionGeneration"; readonly generation: number }
  | { readonly kind: "revisionCount"; readonly count: number }
  | { readonly kind: "revisionReleased" | "revisionCurrent" | "revisionStale" | "revisionSuperseded" | "revisionNotSuperseded" }
  | { readonly kind: "ticketOpened" | "ticketForgotten" | "ticketFailed" | "ticketClosed" | "ticketUnitAdded" | "ticketUnitUpdated" | "ticketRefused" | "ticketPending" | "ticketDelivered" | "ticketClear" | "ticketNoWork" | "ticketCollectProceed" | "ticketFinalProceed" | "ticketFinalRelease" | "ticketKeepJoined" | "ticketSetJoinedClear" | "ticketSetJoinedFinding" | "ticketSetJoinedUnavailable" | "ticketSetJoinedLost" }
  | { readonly kind: "ticketUnavailable" | "ticketCollectUnavailable"; readonly reason: TicketReason }
  | { readonly kind: "ticketUnitSnapshot"; readonly stage: "pending" | "clear" | "finding" | "unavailable"; readonly delivered?: boolean; readonly reason?: TicketReason }
  | { readonly kind: "ticketUnitMissing" }
  | { readonly kind: "ticketEvicted"; readonly id: number }
  | { readonly kind: "ticketKept" | "cleanupReady" | "cleanupBusy" | "cleanupCommitted" | "deliveryReleaseUnacknowledged" | "deliveryKeepAcknowledged" }
  | { readonly kind: "deliveryAckReady" | "deliveryAckExpired" | "deliveryAckEmpty" | "deliveryFinalReady" | "deliveryFinalExpired" | "deliveryFinalEmpty" | "deliveryRetireAdvice" | "deliveryKeepRemaining" | "deliveryKeepForReoffer" }
  | { readonly kind: "deliverySubmissionCandidate" | "deliverySubmissionRefused" | "deliveryBatchProceed" | "deliveryBatchRelease" | "deliveryCredentialInvalid" | "deliveryCredentialValid" }
  | { readonly kind: "ignoreCandidate" | "releaseCandidate" | "retireCandidate" | "continueCandidate" | "retainCandidate" }
  | { readonly kind: "reuseJoinAdvice" | "reuseJoinPending" | "reuseJoinClaimed" | "reuseCached" | "reuseOwn" | "reuseClaimed" | "reuseAttached" | "reuseReleased" | "reuseRefused" | "cacheAlready" | "cacheRejected" | "cacheCommitted" }
  | { readonly kind: "cachePrepared"; readonly evicted: readonly number[] }
  | { readonly kind: "cacheDiscarded"; readonly ids: readonly number[] }
  | { readonly kind: "noticeSuppressed" | "noticeCreatePending" | "noticeMergePending"; readonly count: number }
  | { readonly kind: "noticePruned"; readonly dropLease: boolean; readonly dropPending: boolean; readonly dropKey: boolean }
  | { readonly kind: "noticeSelected"; readonly ids: readonly number[] }
  | { readonly kind: "includeChoice"; readonly choice: "replaceIncludes" | "keepIncludes" }
  | { readonly kind: "fileSelection"; readonly selection: "protected" | "excluded" | "emptyIncludes" | "notIncluded" | "selected" }
  | { readonly kind: "fileProtection"; readonly protection: "allowedPath" | "repositoryBoundary" | "sensitivePath" | "generatedOrVendor" | "fileExtension" }
  | { readonly kind: "candidateFile"; readonly candidate: "candidateAllowed" | "refuseGitAdmin" | "refuseFileKind" | "refuseGitIgnore" }
  | { readonly kind: "reviewAdmission"; readonly admission: "admitReview" | "refuseRoot" | "refuseConfiguration" | "refuseCredential" | "refuseSelection" }
  | { readonly kind: "ruleGate"; readonly gate: "admit" | "omit" }
  | { readonly kind: "ruleOrder"; readonly order: "before" | "equal" | "after" }
  | { readonly kind: "noticeRejectedFull" | "noticeCreateKey" | "noticeKeepLeased" | "noticeRefused" | "noticeCommitted" | "noticeDropped" | "noticeLeased" | "noticePendingCleared" }
  | { readonly kind: "writeAuthorized"; readonly operation: number }
  | { readonly kind: "writeRecorded"; readonly outcome: "acknowledged" | "failed" | "unknown" }
  | { readonly kind: "waitForOutput" }
  | { readonly kind: "reofferAtStop" }
  | { readonly kind: "partitionRetired"; readonly round: number };

export type ProspectiveFacts = {
  readonly clockValid: boolean; readonly withinHookWindow: boolean;
  readonly startedAfterClosure: boolean; readonly duplicateEvent: boolean;
  readonly permitCount: number; readonly permitLimit: number;
  readonly roundCount: number; readonly roundLimit: number; readonly newRound: boolean;
  readonly eventCount: number; readonly eventLimit: number;
};

const encodeFacts = (facts: ProspectiveFacts): unknown => {
  inputFields(facts, ["clockValid", "withinHookWindow", "startedAfterClosure", "duplicateEvent", "permitCount", "permitLimit", "roundCount", "roundLimit", "newRound", "eventCount", "eventLimit"]);
  return { $: "Admission.ProspectiveFacts", clock_valid: bool(facts.clockValid), within_hook_window: bool(facts.withinHookWindow),
    started_after_closure: bool(facts.startedAfterClosure), duplicate_event: bool(facts.duplicateEvent),
    permit_count: nat(facts.permitCount), permit_limit: nat(facts.permitLimit, true),
    round_count: nat(facts.roundCount), round_limit: nat(facts.roundLimit, true), new_round: bool(facts.newRound),
    event_count: nat(facts.eventCount), event_limit: nat(facts.eventLimit, true) };
};

const encodePurpose = (value: CapacityPurpose): unknown => {
  const names: Record<CapacityPurpose, string> = {
    observationDispatch: "Ledger.ObservationDispatch", preparation: "Ledger.Preparation",
    reviewUnit: "Ledger.ReviewUnit", storedResult: "Ledger.StoredResult",
    operationalNotice: "Ledger.OperationalNotice", adviceRecheck: "Ledger.AdviceRecheck",
  };
  const name = names[value];
  if (!name) throw new TypeError("invalid capacity purpose");
  return { $: name };
};
const identity = (event: Extract<CanonicalEvent, { readonly partition: number; readonly lifetime: number }>) => ({ partition: nat(event.partition, true), lifetime: nat(event.lifetime, true) });
const submissionSurface = (surface: "edit" | "background" | "stop"): unknown => {
  const name = { edit: "Handoff.Edit", background: "Handoff.Background", stop: "Handoff.Stop" }[surface];
  if (name === undefined) throw new TypeError("invalid submission surface");
  return { $: name };
};
const ticketReason = (reason: TicketReason): unknown => {
  const name = { backend: "Backend", credential: "Credential", capacity: "Capacity",
    stale: "Stale", lost: "Lost", expired: "Expired" }[reason];
  if (name === undefined) throw new TypeError("invalid ticket reason");
  return { $: `Ticket.${name}` };
};
const ticketUnitEvent = (event: TicketUnitEvent): unknown => {
  const name = { revise: "Revise", clearResult: "ClearResult", findingResult: "FindingResult",
    failUnit: "FailUnit", markDelivered: "MarkDelivered" }[event];
  if (name === undefined) throw new TypeError("invalid ticket unit event");
  return { $: `Ticket.${name}` };
};
const ticketJoinedState = (state: TicketJoinedState): unknown => {
  const name = { pending: "JoinedPending", clear: "JoinedClear", finding: "JoinedFinding",
    unavailable: "JoinedUnavailable" }[state];
  if (name === undefined) throw new TypeError("invalid joined state");
  return { $: `Ticket.${name}` };
};
const encode = (event: CanonicalEvent): unknown => {
  switch (event.kind) {
    case "reserveCapacity": inputFields(event, ["kind", "partition", "bytes", "purpose"]); return { $: "Canonical.ReserveCapacity", partition: nat(event.partition, true), bytes: bytes(event.bytes), purpose: encodePurpose(event.purpose) };
    case "resizeCapacity": inputFields(event, ["kind", "reservation", "bytes", "purpose"]); return { $: "Canonical.ResizeCapacity", reservation: nat(event.reservation, true), bytes: nat(event.bytes), purpose: encodePurpose(event.purpose) };
    case "releaseCapacity": inputFields(event, ["kind", "reservation"]); return { $: "Canonical.ReleaseCapacity", reservation: nat(event.reservation, true) };
    case "replaceCapacity": inputFields(event, ["kind", "reservation", "unitBytes"]); return { $: "Canonical.ReplaceCapacity", reservation: nat(event.reservation, true), unit_bytes: list(event.unitBytes) };
    case "issuePermit": inputFields(event, ["kind", "partition", "lifetime", "tool", "started", "deadline", "now", "facts"]); return { $: "Canonical.IssuePermit", ...identity(event), tool: nat(event.tool, true), started: nat(event.started), deadline: nat(event.deadline), now: nat(event.now), facts: encodeFacts(event.facts) };
    case "consumePermit": inputFields(event, ["kind", "partition", "lifetime", "token", "tool", "now"]); return { $: "Canonical.ConsumePermit", ...identity(event), token: nat(event.token, true), tool: nat(event.tool, true), now: nat(event.now) };
    case "releasePermit": inputFields(event, ["kind", "partition", "lifetime", "token"]); return { $: "Canonical.ReleasePermit", ...identity(event), token: nat(event.token, true) };
    case "expirePermit": inputFields(event, ["kind", "partition", "lifetime", "token", "deadlineReached"]); return { $: "Canonical.ExpirePermit", ...identity(event), token: nat(event.token, true), deadline_reached: bool(event.deadlineReached) };
    case "closePermitRound": inputFields(event, ["kind", "partition", "lifetime", "round", "at", "prospective"]); return { $: "Canonical.ClosePermitRound", ...identity(event), round: nat(event.round, true), at: nat(event.at), prospective: bool(event.prospective) };
    case "openRound": inputFields(event, ["kind", "partition", "lifetime"]); return { $: "Canonical.OpenRound", ...identity(event) };
    case "admitObservation": inputFields(event, ["kind", "partition", "lifetime", "round"]); return { $: "Canonical.AdmitObservation", ...identity(event), round: nat(event.round, true) };
    case "startObservation": case "completeObservation": case "interruptObservation": {
      inputFields(event, ["kind", "partition", "lifetime", "round", "observation"]);
      const name = { startObservation: "StartObservation", completeObservation: "CompleteObservation", interruptObservation: "InterruptObservation" }[event.kind];
      return { $: `Canonical.${name}`, ...identity(event), round: nat(event.round, true), observation: nat(event.observation, true) };
    }
    case "beginPreparation": inputFields(event, ["kind", "partition", "lifetime", "round", "bytes"]); return { $: "Canonical.BeginPreparation", ...identity(event), round: nat(event.round, true), bytes: bytes(event.bytes) };
    case "beginObservedPreparation": inputFields(event, ["kind", "partition", "lifetime", "round", "observation", "bytes"]); return { $: "Canonical.BeginObservedPreparation", ...identity(event), round: nat(event.round, true), observation: nat(event.observation, true), bytes: bytes(event.bytes) };
    case "interruptPreparation": inputFields(event, ["kind", "partition", "lifetime", "round", "operation"]); return { $: "Canonical.InterruptPreparation", ...identity(event), round: nat(event.round, true), operation: nat(event.operation, true) };
    case "preparationCompleted": inputFields(event, ["kind", "partition", "lifetime", "round", "operation", "unitBytes"]); return { $: "Canonical.PreparationCompleted", ...identity(event), round: nat(event.round, true), operation: nat(event.operation, true), unit_bytes: list(event.unitBytes) };
    case "startReview": case "retireReview": {
      inputFields(event, ["kind", "partition", "lifetime", "round", "operation"]);
      return { $: event.kind === "startReview" ? "Canonical.StartReview" : "Canonical.RetireReview", ...identity(event), round: nat(event.round, true), operation: nat(event.operation, true) };
    }
    case "reviewCompleted": {
      inputFields(event, ["kind", "partition", "lifetime", "round", "operation", "outcome"]);
      const outcome = { finding: "Canonical.Finding", clear: "Canonical.Clear", unavailable: "Canonical.Unavailable", interrupted: "Canonical.Interrupted", discarded: "Canonical.Discarded" }[event.outcome];
      if (!outcome) throw new TypeError("invalid review outcome");
      return { $: "Canonical.ReviewCompleted", ...identity(event), round: nat(event.round, true), operation: nat(event.operation, true), outcome: { $: outcome } };
    }
    case "reviewObserved": {
      inputFields(event, ["kind", "partition", "lifetime", "round", "operation", "outcome", "currentWork"]);
      return { $: "Canonical.ReviewObserved", ...identity(event), round: nat(event.round, true),
        operation: nat(event.operation, true), outcome: { $: event.outcome === "finding" ? "Canonical.Finding" : "Canonical.Clear" },
        current_work: bool(event.currentWork) };
    }
    case "findingCountUpdated": inputFields(event, ["kind", "partition", "lifetime", "round", "operation", "count"]); return { $: "Canonical.FindingCountUpdated", ...identity(event), round: nat(event.round, true), operation: nat(event.operation, true), count: nat(event.count, true) };
    case "queueDispatch": case "dispatchSettled":
      inputFields(event, ["kind", "partition", "lifetime", "round", "operation"]);
      return { $: event.kind === "queueDispatch" ? "Canonical.QueueDispatch" : "Canonical.DispatchSettled",
        ...identity(event), round: nat(event.round, true), operation: nat(event.operation, true) };
    case "discardDispatch": inputFields(event, ["kind", "operations"]); return { $: "Canonical.DiscardDispatch", operations: list(event.operations) };
    case "dispatchScopeCheck": inputFields(event, ["kind", "namedCount", "cancelledCount", "hasUnnamed"]); return { $: "Canonical.DispatchScopeCheck", named_count: nat(event.namedCount), cancelled_count: nat(event.cancelledCount), has_unnamed: bool(event.hasUnnamed) };
    case "closeDispatch": inputFields(event, ["kind"]); return { $: "Canonical.CloseDispatch" };
    case "preparedOfferCheck": inputFields(event, ["kind", "ready", "withinFrame"]); return { $: "Canonical.PreparedOfferCheck", ready: bool(event.ready), within_frame: bool(event.withinFrame) };
    case "emptyPreparedCheck": inputFields(event, ["kind", "readyCount", "hasNonSkipped", "ticketed"]); return { $: "Canonical.EmptyPreparedCheck", ready_count: nat(event.readyCount), has_non_skipped: bool(event.hasNonSkipped), ticketed: bool(event.ticketed) };
    case "reviewFailureCheck": inputFields(event, ["kind", "backendOrTimeout", "credential", "missing"]); return { $: "Canonical.ReviewFailureCheck", backend_or_timeout: bool(event.backendOrTimeout), credential: bool(event.credential), missing: bool(event.missing) };
    case "stopPolled": inputFields(event, ["kind", "partition", "lifetime", "round", "deadline"]); return { $: "Canonical.StopPolled", ...identity(event), round: nat(event.round, true), deadline: bool(event.deadline) };
    case "stopGroupPolled": case "stopGroupEnded": {
      const polled = event.kind === "stopGroupPolled";
      inputFields(event, polled ? ["kind", "group", "lifetime", "round", "scopes", "deadline", "extraPending", "continuations"] : ["kind", "group", "lifetime", "round", "scopes"]);
      if (!Array.isArray(event.scopes) || event.scopes.length > MAX_UNITS) throw new TypeError("invalid stop scopes");
      const scopes = event.scopes.reduceRight<unknown>((tail, scope) => {
        inputFields(scope, ["partition", "round"]);
        return { $: "Con", head: { $: "Canonical.StopScope", partition: nat(scope.partition, true), round: nat(scope.round, true) }, tail };
      }, { $: "Nil" });
      const common = { group: nat(event.group, true), lifetime: nat(event.lifetime, true), round: nat(event.round, true), scopes };
      return polled ? { $: "Canonical.StopGroupPolled", ...common, deadline: bool(event.deadline), extra_pending: bool(event.extraPending), continuations: nat(event.continuations) }
        : { $: "Canonical.StopGroupEnded", ...common };
    }
    case "collectionReady": inputFields(event, ["kind", "advice", "already", "turnEnd", "cycleComplete", "elapsed", "window"]); return { $: "Canonical.CollectionReady", advice: nat(event.advice, true), already: bool(event.already), turn_end: bool(event.turnEnd), cycle_complete: bool(event.cycleComplete), elapsed: nat(event.elapsed), window: nat(event.window, true) };
    case "collectionCredentialCheck": inputFields(event, ["kind", "sameScope", "generationValid"]); return { $: "Canonical.CollectionCredentialCheck", same_scope: bool(event.sameScope), generation_valid: bool(event.generationValid) };
    case "collectionCandidateCheck": inputFields(event, ["kind", "samePartition", "unleased", "hasUnsuppressed", "ticketOwns"]); return { $: "Canonical.CollectionCandidateCheck", same_partition: bool(event.samePartition), unleased: bool(event.unleased), has_unsuppressed: bool(event.hasUnsuppressed), ticket_owns: bool(event.ticketOwns) };
    case "collectionOrderCheck": inputFields(event, ["kind", "leftCycle", "leftSequence", "rightCycle", "rightSequence"]); return { $: "Canonical.CollectionOrderCheck", left_cycle: nat(event.leftCycle), left_sequence: nat(event.leftSequence), right_cycle: nat(event.rightCycle), right_sequence: nat(event.rightSequence) };
    case "collectionExpiryCheck": inputFields(event, ["kind", "elapsed", "lifetime"]); return { $: "Canonical.CollectionExpiryCheck", elapsed: nat(event.elapsed), lifetime: nat(event.lifetime, true) };
    case "collectionFitCheck": inputFields(event, ["kind", "items", "bytes"]); return { $: "Canonical.CollectionFitCheck", items: nat(event.items), bytes: nat(event.bytes) };
    case "collectionFindingCheck": inputFields(event, ["kind", "selectionPartition", "selectionRound", "unit", "partition", "round", "snapshot", "currentSnapshot", "credential", "currentCredential", "ageMs", "soloBytes", "collectionReady", "selectedCount", "prospectiveBytes"]); return { $: "Canonical.CollectionFindingCheck", selection_partition: nat(event.selectionPartition, true), selection_round: nat(event.selectionRound), unit: nat(event.unit), partition: nat(event.partition, true), round: nat(event.round), snapshot: nat(event.snapshot), current_snapshot: nat(event.currentSnapshot), credential: nat(event.credential), current_credential: nat(event.currentCredential), age_ms: nat(event.ageMs), solo_bytes: nat(event.soloBytes), collection_ready: bool(event.collectionReady), selected_count: nat(event.selectedCount), prospective_bytes: nat(event.prospectiveBytes) };
    case "collectionNoticeCheck": inputFields(event, ["kind", "items", "bytes", "skipUnfitting"]); return { $: "Canonical.CollectionNoticeCheck", items: nat(event.items), bytes: nat(event.bytes), skip_unfitting: bool(event.skipUnfitting) };
    case "collectionReserveLease": case "collectionReleaseLease": inputFields(event, ["kind", "advice", "token"]); return { $: event.kind === "collectionReserveLease" ? "Canonical.CollectionReserveLease" : "Canonical.CollectionReleaseLease", advice: nat(event.advice, true), token: nat(event.token, true) };
    case "collectionLeaseCheck": inputFields(event, ["kind", "advice", "token", "expired", "stopCollector", "sameGroup", "reofferable"]); return { $: "Canonical.CollectionLeaseCheck", advice: nat(event.advice, true), token: nat(event.token, true), expired: bool(event.expired), stop_collector: bool(event.stopCollector), same_group: bool(event.sameGroup), reofferable: bool(event.reofferable) };
    case "collectionRetireAdvice": inputFields(event, ["kind", "advice"]); return { $: "Canonical.CollectionRetireAdvice", advice: nat(event.advice, true) };
    case "collectionClaimBackground": inputFields(event, ["kind", "group", "token", "active", "capacity"]); return { $: "Canonical.CollectionClaimBackground", group: nat(event.group, true), token: nat(event.token, true), active: bool(event.active), capacity: nat(event.capacity, true) };
    case "collectionReleaseBackground": inputFields(event, ["kind", "group", "token"]); return { $: "Canonical.CollectionReleaseBackground", group: nat(event.group, true), token: nat(event.token, true) };
    case "collectionExpireBackground": inputFields(event, ["kind", "group", "token", "elapsed", "lifetime"]); return { $: "Canonical.CollectionExpireBackground", group: nat(event.group, true), token: nat(event.token, true), elapsed: nat(event.elapsed), lifetime: nat(event.lifetime, true) };
    case "finishReserve": inputFields(event, ["kind", "group", "lifetime", "round", "attempt", "token", "selected", "hasNotice", "passNotices", "canWrite", "bindingValid", "deadlineReached"]); return { $: "Canonical.FinishReserve", group: nat(event.group, true), lifetime: nat(event.lifetime, true), round: nat(event.round, true), attempt: nat(event.attempt, true), token: nat(event.token, true), selected: list(event.selected), has_notice: bool(event.hasNotice), pass_notices: bool(event.passNotices), can_write: bool(event.canWrite), binding_valid: bool(event.bindingValid), deadline_reached: bool(event.deadlineReached) };
    case "finishRelease": inputFields(event, ["kind", "group", "round", "attempt", "token"]); return { $: "Canonical.FinishRelease", group: nat(event.group, true), round: nat(event.round, true), attempt: nat(event.attempt, true), token: nat(event.token, true) };
    case "finishAuthorize": inputFields(event, ["kind", "group", "round", "attempt", "token", "selected"]); return { $: "Canonical.FinishAuthorize", group: nat(event.group, true), round: nat(event.round, true), attempt: nat(event.attempt, true), token: nat(event.token, true), selected: list(event.selected) };
    case "finishTerminal": {
      inputFields(event, ["kind", "group", "round", "attempt", "token", "selected", "outcome"]);
      const outcome = { acknowledged: "Canonical.Acknowledged", failed: "Canonical.Failed", unknown: "Canonical.Unknown" }[event.outcome];
      if (!outcome) throw new TypeError("invalid write outcome");
      return { $: "Canonical.FinishTerminal", group: nat(event.group, true), round: nat(event.round, true), attempt: nat(event.attempt, true), token: nat(event.token, true), selected: list(event.selected), outcome: { $: outcome } };
    }
    case "finishEnd": inputFields(event, ["kind", "group", "round", "attempt", "token"]); return { $: "Canonical.FinishEnd", group: nat(event.group, true), round: nat(event.round, true), attempt: nat(event.attempt, true), token: nat(event.token, true) };
    case "continuationConsume": inputFields(event, ["kind", "group", "round"]); return { $: "Canonical.ContinuationConsume", group: nat(event.group, true), round: nat(event.round, true) };
    case "submissionBegin": inputFields(event, ["kind", "advice", "group", "round", "token", "surface", "authorizeNow", "fingerprints", "units"]); return { $: "Canonical.SubmissionBegin", advice: nat(event.advice, true), group: nat(event.group, true), round: nat(event.round, true), token: nat(event.token, true), surface: submissionSurface(event.surface), authorize_now: bool(event.authorizeNow), fingerprints: list(event.fingerprints), units: list(event.units) };
    case "submissionAuthorize": case "submissionRelease": case "submissionReofferCheck": inputFields(event, ["kind", "advice", "token"]); return { $: `Canonical.${event.kind.slice(0, 1).toUpperCase()}${event.kind.slice(1)}`, advice: nat(event.advice, true), token: nat(event.token, true) };
    case "submissionTerminal": inputFields(event, ["kind", "advice", "token", "certain"]); return { $: "Canonical.SubmissionTerminal", advice: nat(event.advice, true), token: nat(event.token, true), certain: bool(event.certain) };
    case "submissionForget": inputFields(event, ["kind", "advice"]); return { $: "Canonical.SubmissionForget", advice: nat(event.advice, true) };
    case "submissionSuppressCheck": inputFields(event, ["kind", "advice", "fingerprint", "round", "surface"]); return { $: "Canonical.SubmissionSuppressCheck", advice: nat(event.advice, true), fingerprint: nat(event.fingerprint, true), round: nat(event.round, true), surface: submissionSurface(event.surface) };
    case "submissionExpiryCheck": inputFields(event, ["kind", "advice", "token", "elapsed", "lifetime"]); return { $: "Canonical.SubmissionExpiryCheck", advice: nat(event.advice, true), token: nat(event.token, true), elapsed: nat(event.elapsed), lifetime: nat(event.lifetime, true) };
    case "revisionRegister": inputFields(event, ["kind", "subject", "input", "addMember"]); return { $: "Canonical.RevisionRegister", subject: nat(event.subject, true), input: nat(event.input, true), add_member: bool(event.addMember) };
    case "revisionRelease": inputFields(event, ["kind", "subject", "generation"]); return { $: "Canonical.RevisionRelease", subject: nat(event.subject, true), generation: nat(event.generation, true) };
    case "revisionSupersededCheck": inputFields(event, ["kind", "subject", "candidateSubject", "generation"]); return { $: "Canonical.RevisionSupersededCheck", subject: nat(event.subject, true), candidate_subject: nat(event.candidateSubject, true), generation: nat(event.generation, true) };
    case "revisionCurrentCheck": inputFields(event, ["kind", "subject", "input", "generation"]); return { $: "Canonical.RevisionCurrentCheck", subject: nat(event.subject, true), input: nat(event.input, true), generation: nat(event.generation, true) };
    case "revisionGenerationCheck": inputFields(event, ["kind", "subject"]); return { $: "Canonical.RevisionGenerationCheck", subject: nat(event.subject, true) };
    case "revisionCountCheck": inputFields(event, ["kind"]); return { $: "Canonical.RevisionCountCheck" };
    case "ticketOpen": case "ticketForget": case "ticketClose": inputFields(event, ["kind", "id"]); return { $: `Canonical.${event.kind.slice(0, 1).toUpperCase()}${event.kind.slice(1)}`, id: nat(event.id, true) };
    case "ticketFail": inputFields(event, ["kind", "id", "reason"]); return { $: "Canonical.TicketFail", id: nat(event.id, true), reason: ticketReason(event.reason) };
    case "ticketAddUnit": inputFields(event, ["kind", "id", "unit"]); return { $: "Canonical.TicketAddUnit", id: nat(event.id, true), unit: nat(event.unit, true) };
    case "ticketStepUnit": inputFields(event, ["kind", "id", "unit", "event", "reason"]); return { $: "Canonical.TicketStepUnit", id: nat(event.id, true), unit: nat(event.unit, true), event: ticketUnitEvent(event.event), reason: ticketReason(event.reason) };
    case "ticketUnitCheck": inputFields(event, ["kind", "id", "unit"]); return { $: "Canonical.TicketUnitCheck", id: nat(event.id, true), unit: nat(event.unit, true) };
    case "ticketTerminal": inputFields(event, ["kind", "id", "expired", "credentialValid", "liveAdvice", "pendingNotice"]); return { $: "Canonical.TicketTerminal", id: nat(event.id, true), expired: bool(event.expired), credential_valid: bool(event.credentialValid), live_advice: bool(event.liveAdvice), pending_notice: bool(event.pendingNotice) };
    case "ticketCollectGateCheck": inputFields(event, ["kind", "expired", "credentialValid"]); return { $: "Canonical.TicketCollectGateCheck", expired: bool(event.expired), credential_valid: bool(event.credentialValid) };
    case "ticketFinalAuthorityCheck": inputFields(event, ["kind", "admittedBlock", "currentBlock"]); return { $: "Canonical.TicketFinalAuthorityCheck", admitted_block: bool(event.admittedBlock), current_block: bool(event.currentBlock) };
    case "ticketJoinedCheck": inputFields(event, ["kind", "state", "staleUnavailable", "hasRevision", "hasAdviceId"]); return { $: "Canonical.TicketJoinedCheck", joined_state: ticketJoinedState(event.state), stale_unavailable: bool(event.staleUnavailable), has_revision: bool(event.hasRevision), has_advice_id: bool(event.hasAdviceId) };
    case "ticketRetentionCheck": inputFields(event, ["kind", "limit"]); return { $: "Canonical.TicketRetentionCheck", limit: nat(event.limit) };
    case "cleanupCheck": {
      inputFields(event, ["kind", "facts"]);
      const facts = event.facts;
      inputFields(facts, ["active", "dispatcherIdle", "noAdvice", "noNotices", "noPendingEvaluations", "noCurrentWork", "noCooldowns", "connectionCountOk", "cacheMatchesLedger"]);
      return { $: "Canonical.CleanupCheck", facts: { $: "Retention.CleanupFacts", active: bool(facts.active), dispatcher_idle: bool(facts.dispatcherIdle), no_advice: bool(facts.noAdvice), no_notices: bool(facts.noNotices), no_pending_evaluations: bool(facts.noPendingEvaluations), no_current_work: bool(facts.noCurrentWork), no_cooldowns: bool(facts.noCooldowns), connection_count_ok: bool(facts.connectionCountOk), cache_matches_ledger: bool(facts.cacheMatchesLedger) } };
    }
    case "cleanupCommit": inputFields(event, ["kind"]); return { $: "Canonical.CleanupCommit" };
    case "deliveryReleaseCheck": inputFields(event, ["kind", "acknowledged"]); return { $: "Canonical.DeliveryReleaseCheck", acknowledged: bool(event.acknowledged) };
    case "deliveryAcknowledgeCheck": inputFields(event, ["kind", "items", "anyExpired"]); return { $: "Canonical.DeliveryAcknowledgeCheck", items: nat(event.items), any_expired: bool(event.anyExpired) };
    case "deliveryFinalizeCheck": inputFields(event, ["kind", "items", "allAcknowledged", "anyExpired"]); return { $: "Canonical.DeliveryFinalizeCheck", items: nat(event.items), all_acknowledged: bool(event.allAcknowledged), any_expired: bool(event.anyExpired) };
    case "deliveryFindingDispositionCheck": inputFields(event, ["kind", "composed", "remaining"]); return { $: "Canonical.DeliveryFindingDispositionCheck", composed: bool(event.composed), remaining: nat(event.remaining) };
    case "deliverySubmissionCandidateCheck": {
      inputFields(event, ["kind", "facts"]);
      const facts = event.facts;
      inputFields(facts, ["roundActive", "hasRound", "hasUnit", "hasDelivery", "pendingCapacity", "submissionAllowed", "currentWork", "credentialAuthorized"]);
      return { $: "Canonical.DeliverySubmissionCandidateCheck", facts: { $: "Delivery.SubmissionFacts",
        round_active: bool(facts.roundActive), has_round: bool(facts.hasRound),
        has_unit: bool(facts.hasUnit), has_delivery: bool(facts.hasDelivery),
        pending_capacity: bool(facts.pendingCapacity), submission_allowed: bool(facts.submissionAllowed),
        current_work: bool(facts.currentWork), credential_authorized: bool(facts.credentialAuthorized) } };
    }
    case "deliverySubmissionBatchCheck": inputFields(event, ["kind", "count", "allValid"]); return { $: "Canonical.DeliverySubmissionBatchCheck", count: nat(event.count), all_valid: bool(event.allValid) };
    case "deliveryCredentialObserveCheck": inputFields(event, ["kind", "invalidSeen", "generationValid", "authorized"]); return { $: "Canonical.DeliveryCredentialObserveCheck", invalid_seen: bool(event.invalidSeen), generation_valid: bool(event.generationValid), authorized: bool(event.authorized) };
    case "deliveryFinalCredentialCheck": inputFields(event, ["kind", "legacyCollect", "invalidSeen"]); return { $: "Canonical.DeliveryFinalCredentialCheck", legacy_collect: bool(event.legacyCollect), invalid_seen: bool(event.invalidSeen) };
    case "validationRouteCheck": {
      inputFields(event, ["kind", "ownerCurrent", "status"]);
      if (!["current", "stale", "unavailable", "unattributed"].includes(event.status)) throw new TypeError("invalid validation status");
      return { $: "Canonical.ValidationRouteCheck", owner_current: bool(event.ownerCurrent),
        status: { $: `Handoff.${event.status.slice(0, 1).toUpperCase()}${event.status.slice(1)}` } };
    }
    case "postValidationCheck": inputFields(event, ["kind", "workAccepted", "expired", "hasFitting"]); return { $: "Canonical.PostValidationCheck", work_accepted: bool(event.workAccepted), expired: bool(event.expired), has_fitting: bool(event.hasFitting) };
    case "finalCandidateCheck": inputFields(event, ["kind", "ownerCurrent", "credentialGeneration", "credentialAuthorized", "expired", "workCurrent", "hasFindings"]); return { $: "Canonical.FinalCandidateCheck", owner_current: bool(event.ownerCurrent), credential_generation: bool(event.credentialGeneration), credential_authorized: bool(event.credentialAuthorized), expired: bool(event.expired), work_current: bool(event.workCurrent), has_findings: bool(event.hasFindings) };
    case "includeLayerCheck": inputFields(event, ["kind", "supplied", "currentRank", "candidateRank"]); return { $: "Canonical.IncludeLayerCheck", supplied: bool(event.supplied), current_rank: nat(event.currentRank), candidate_rank: nat(event.candidateRank) };
    case "fileSelectionCheck": inputFields(event, ["kind", "protected", "excluded", "includesEmpty", "included"]); return { $: "Canonical.FileSelectionCheck", protected: bool(event.protected), excluded: bool(event.excluded), includes_empty: bool(event.includesEmpty), included: bool(event.included) };
    case "fileProtectionInvalid": inputFields(event, ["kind"]); return { $: "Canonical.FileProtectionInvalid" };
    case "fileProtectionCheck": inputFields(event, ["kind", "sensitiveName", "generatedOrVendor", "allowedExtension"]); return { $: "Canonical.FileProtectionCheck", sensitive_name: bool(event.sensitiveName), generated_or_vendor: bool(event.generatedOrVendor), allowed_extension: bool(event.allowedExtension) };
    case "candidateFileCheck": inputFields(event, ["kind", "gitAdmin", "physicalSafe", "gitAllowed"]); return { $: "Canonical.CandidateFileCheck", git_admin: bool(event.gitAdmin), physical_safe: bool(event.physicalSafe), git_allowed: bool(event.gitAllowed) };
    case "reviewAdmissionCheck": inputFields(event, ["kind", "rootValid", "configurationValid", "credentialReady", "selected"]); return { $: "Canonical.ReviewAdmissionCheck", root_valid: bool(event.rootValid), configuration_valid: bool(event.configurationValid), credential_ready: bool(event.credentialReady), selected: bool(event.selected) };
    case "ruleEnableCheck": inputFields(event, ["kind", "packEnabled", "ruleEnabled"]); return { $: "Canonical.RuleEnableCheck", pack_enabled: bool(event.packEnabled), rule_enabled: bool(event.ruleEnabled) };
    case "ruleApplicabilityCheck": {
      inputFields(event, ["kind", "consent", "complete", "target", "globalIncluded", "globalExcluded", "packEnabled", "ruleEnabled", "ruleIncluded", "ruleExcluded", "semanticApplicable"]);
      if (!["directTypeShape", "legacyFileTypeShape", "otherTypeShape", "functionTarget"].includes(event.target)) throw new TypeError("invalid rule target fact");
      return { $: "Canonical.RuleApplicabilityCheck", consent: bool(event.consent), complete: bool(event.complete), target: { $: `RulePolicy.${event.target.slice(0, 1).toUpperCase()}${event.target.slice(1)}` }, global_included: bool(event.globalIncluded), global_excluded: bool(event.globalExcluded), pack_enabled: bool(event.packEnabled), rule_enabled: bool(event.ruleEnabled), rule_included: bool(event.ruleIncluded), rule_excluded: bool(event.ruleExcluded), semantic_applicable: bool(event.semanticApplicable) };
    }
    case "ruleFindingCheck": inputFields(event, ["kind", "probability", "threshold"]); return { $: "Canonical.RuleFindingCheck", probability: encodedProbabilityWords(event.probability), threshold: encodedProbabilityWords(event.threshold) };
    case "ruleRankOrderCheck": inputFields(event, ["kind", "left", "right", "leftRank", "rightRank"]); return { $: "Canonical.RuleRankOrderCheck", left: encodedProbabilityWords(event.left), right: encodedProbabilityWords(event.right), left_rank: nat(event.leftRank), right_rank: nat(event.rightRank) };
    case "adviceOrderCheck": inputFields(event, ["kind", "left", "right", "pathOrder", "idOrder"]); return { $: "Canonical.AdviceOrderCheck", left: encodedProbabilityWords(event.left), right: encodedProbabilityWords(event.right), path_order: { $: ruleOrderTag(event.pathOrder) }, id_order: { $: ruleOrderTag(event.idOrder) } };
    case "ruleBudgetCheck": inputFields(event, ["kind", "position", "limit"]); return { $: "Canonical.RuleBudgetCheck", position: nat(event.position), limit: nat(event.limit) };
    case "reuseRoute": inputFields(event, ["kind", "id", "liveAdvice"]); return { $: "Canonical.ReuseRoute", id: nat(event.id, true), live_advice: bool(event.liveAdvice) };
    case "reuseClaim": case "reuseAttach": case "reuseRelease": case "reuseTouch": inputFields(event, ["kind", "id"]); return { $: `Canonical.${event.kind.slice(0, 1).toUpperCase()}${event.kind.slice(1)}`, id: nat(event.id, true) };
    case "cachePrepare": inputFields(event, ["kind", "id", "bytes", "entryLimit", "byteLimit"]); return { $: "Canonical.CachePrepare", id: nat(event.id, true), bytes: nat(event.bytes), entry_limit: nat(event.entryLimit, true), byte_limit: nat(event.byteLimit, true) };
    case "cacheCommit": inputFields(event, ["kind", "id", "partition", "bytes", "reservation", "entryLimit", "byteLimit"]); return { $: "Canonical.CacheCommit", id: nat(event.id, true), partition: nat(event.partition, true), bytes: nat(event.bytes), reservation: nat(event.reservation, true), entry_limit: nat(event.entryLimit, true), byte_limit: nat(event.byteLimit, true) };
    case "cacheDiscardPartition": inputFields(event, ["kind", "partition"]); return { $: "Canonical.CacheDiscardPartition", partition: nat(event.partition, true) };
    case "cacheClear": inputFields(event, ["kind"]); return { $: "Canonical.CacheClear" };
    case "noticeAdvance": {
      inputFields(event, event.remaining === undefined ? ["kind", "key", "maximumKeys", "proposed", "sequence", "maxCount"] : ["kind", "key", "remaining", "maximumKeys", "proposed", "sequence", "maxCount"]);
      return { $: "Canonical.NoticeAdvance", key: nat(event.key, true), remaining: event.remaining === undefined ? { $: "None" } : { $: "Some", value: nat(event.remaining) }, maximum_keys: nat(event.maximumKeys, true), proposed: nat(event.proposed, true), sequence: nat(event.sequence, true), max_count: nat(event.maxCount, true) };
    }
    case "noticeCommit": inputFields(event, ["kind", "key", "partition", "group", "reservation", "pending", "sequence", "maximumKeys"]); return { $: "Canonical.NoticeCommit", key: nat(event.key, true), partition: nat(event.partition, true), group: nat(event.group, true), reservation: nat(event.reservation, true), pending: nat(event.pending, true), sequence: nat(event.sequence, true), maximum_keys: nat(event.maximumKeys, true) };
    case "noticePrune": inputFields(event, ["kind", "key", "leaseExpired", "pendingExpired", "excepted", "cooldownExpired"]); return { $: "Canonical.NoticePrune", key: nat(event.key, true), lease_expired: bool(event.leaseExpired), pending_expired: bool(event.pendingExpired), excepted: bool(event.excepted), cooldown_expired: bool(event.cooldownExpired) };
    case "noticeDrop": case "noticeClearPending": inputFields(event, ["kind", "key"]); return { $: `Canonical.${event.kind.slice(0, 1).toUpperCase()}${event.kind.slice(1)}`, key: nat(event.key, true) };
    case "noticeLease": inputFields(event, ["kind", "key", "leased"]); return { $: "Canonical.NoticeLease", key: nat(event.key, true), leased: bool(event.leased) };
    case "noticeSelect": inputFields(event, ["kind", "partition", "group", "composed", "ticketed", "allowed"]); return { $: "Canonical.NoticeSelect", partition: nat(event.partition, true), group: nat(event.group, true), composed: bool(event.composed), ticketed: bool(event.ticketed), allowed: list(event.allowed) };
    case "outputStarted": inputFields(event, ["kind", "partition", "lifetime", "round"]); return { $: "Canonical.OutputStarted", ...identity(event), round: nat(event.round, true) };
    case "outputTerminal": {
      inputFields(event, ["kind", "partition", "lifetime", "round", "operation", "outcome"]);
      const outcome = { acknowledged: "Canonical.Acknowledged", failed: "Canonical.Failed", unknown: "Canonical.Unknown" }[event.outcome];
      if (!outcome) throw new TypeError("invalid write outcome");
      return { $: "Canonical.OutputTerminal", ...identity(event), round: nat(event.round, true), operation: nat(event.operation, true), outcome: { $: outcome } };
    }
    case "retirePartition": inputFields(event, ["kind", "partition", "lifetime", "round"]); return { $: "Canonical.RetirePartition", ...identity(event), round: nat(event.round, true) };
    default: throw new TypeError("unknown canonical event");
  }
};
const outcome = (value: unknown): "finding" | "clear" | "unavailable" | "interrupted" | "discarded" => {
  const name = tag(value);
  if (name === "Canonical.Finding") return "finding";
  if (name === "Canonical.Clear") return "clear";
  if (name === "Canonical.Unavailable") return "unavailable";
  if (name === "Canonical.Interrupted") return "interrupted";
  if (name === "Canonical.Discarded") return "discarded";
  throw new TypeError("unknown canonical outcome");
};
const writeOutcome = (value: unknown): "acknowledged" | "failed" | "unknown" => {
  const name = tag(value);
  if (name === "Canonical.Acknowledged") return "acknowledged";
  if (name === "Canonical.Failed") return "failed";
  if (name === "Canonical.Unknown") return "unknown";
  throw new TypeError("unknown write outcome");
};
const decodeTicketReason = (value: unknown): TicketReason => {
  const name = tag(value);
  const reasons: Record<string, TicketReason> = { "Ticket.Backend": "backend",
    "Ticket.Credential": "credential", "Ticket.Capacity": "capacity",
    "Ticket.Stale": "stale", "Ticket.Lost": "lost", "Ticket.Expired": "expired" };
  const reason = reasons[name];
  if (reason === undefined) throw new TypeError("unknown ticket reason");
  fields(value, name, []);
  return reason;
};
const maybeTicketReason = (value: unknown): TicketReason | undefined => {
  const name = tag(value);
  if (name === "None") { fields(value, "None", []); return undefined; }
  if (name === "Some") return decodeTicketReason(fields(value, "Some", ["value"]).value);
  throw new TypeError("unknown optional ticket reason");
};
const decodeTicketUnitState = (stageValue: unknown, reasonValue: unknown) => {
  const stageTag = tag(stageValue);
  const stage = { "Ticket.UnitPending": "pending", "Ticket.UnitClear": "clear",
    "Ticket.UnitFinding": "finding", "Ticket.UnitUnavailable": "unavailable" }[stageTag] as "pending" | "clear" | "finding" | "unavailable" | undefined;
  if (stage === undefined) throw new TypeError("unknown ticket unit stage");
  const delivered = stage === "finding" ? bool(fields(stageValue, stageTag, ["delivered"]).delivered) : undefined;
  if (delivered === undefined) fields(stageValue, stageTag, []);
  const reason = maybeTicketReason(reasonValue);
  if ((stage === "unavailable") !== (reason !== undefined)) {
    throw new TypeError("inconsistent canonical ticket unit failure");
  }
  return { stage, ...(delivered === undefined ? {} : { delivered }),
    ...(reason === undefined ? {} : { reason }) };
};
export type CapacityRefusal = "globalItems" | "globalBytes" | "partitionItems" | "partitionBytes";
export type CapacityView = {
  readonly global: { readonly items: number; readonly bytes: number };
  readonly local: { readonly items: number; readonly bytes: number };
  readonly charges: readonly CapacityCharge[];
};
export type CapacityPurpose = "observationDispatch" | "preparation" | "reviewUnit" | "storedResult" | "operationalNotice" | "adviceRecheck";
export type CapacityCharge = { readonly id: number; readonly partition: number; readonly bytes: number; readonly purpose: CapacityPurpose };
const purpose = (value: unknown): CapacityPurpose => {
  const names: Record<string, CapacityPurpose> = {
    "Ledger.ObservationDispatch": "observationDispatch", "Ledger.Preparation": "preparation",
    "Ledger.ReviewUnit": "reviewUnit", "Ledger.StoredResult": "storedResult",
    "Ledger.OperationalNotice": "operationalNotice", "Ledger.AdviceRecheck": "adviceRecheck",
  };
  const name = tag(value);
  const result = names[name];
  if (!result) throw new TypeError("unknown capacity purpose");
  fields(value, name, []);
  return result;
};
const charge = (value: unknown): CapacityCharge => {
  const x = fields(value, "Ledger.Charge", ["id", "partition", "bytes", "purpose"]);
  return { id: nat(x.id, true), partition: nat(x.partition, true), bytes: nat(x.bytes), purpose: purpose(x.purpose) };
};
const usage = (value: unknown): { readonly items: number; readonly bytes: number } => {
  const x = fields(value, "Ledger.Usage", ["items", "bytes"]);
  return { items: nat(x.items), bytes: nat(x.bytes) };
};
const capacityView = (value: unknown): CapacityView => {
  const x = fields(value, "Canonical.CapacityView", ["global", "local", "charges"]);
  const charges = readList(x.charges, charge);
  const global = usage(x.global);
  const local = usage(x.local);
  if (charges.length !== global.items || charges.reduce((sum, charge) => sum + charge.bytes, 0) !== global.bytes ||
      local.items > global.items || local.bytes > global.bytes) throw new TypeError("invalid capacity view");
  return { global, local, charges };
};
const capacityRefusal = (value: unknown): CapacityRefusal => {
  const reasons: Record<string, CapacityRefusal> = {
    "Ledger.GlobalItemLimit": "globalItems", "Ledger.GlobalByteLimit": "globalBytes",
    "Ledger.PartitionItemLimit": "partitionItems", "Ledger.PartitionByteLimit": "partitionBytes",
  };
  const reason = reasons[tag(value)];
  if (!reason) throw new TypeError("unknown capacity refusal");
  fields(value, tag(value), []);
  return reason;
};
const decodeCommand = (value: unknown): CanonicalCommand => {
  switch (tag(value)) {
    case "Canonical.CapacityGranted": { const x = fields(value, "Canonical.CapacityGranted", ["id", "after"]); return { kind: "capacityGranted", id: nat(x.id, true), after: capacityView(x.after) }; }
    case "Canonical.CapacityRefused": { const x = fields(value, "Canonical.CapacityRefused", ["reason", "after"]); return { kind: "capacityRefused", reason: capacityRefusal(x.reason), after: capacityView(x.after) }; }
    case "Canonical.CapacityResized": { const x = fields(value, "Canonical.CapacityResized", ["id", "after"]); return { kind: "capacityResized", id: nat(x.id, true), after: capacityView(x.after) }; }
    case "Canonical.CapacityUnitAdmitted": { const x = fields(value, "Canonical.CapacityUnitAdmitted", ["reservation", "position", "bytes", "after"]); return { kind: "capacityUnitAdmitted", reservation: nat(x.reservation, true), position: nat(x.position, true), bytes: bytes(x.bytes), after: capacityView(x.after) }; }
    case "Canonical.CapacityUnitRefused": { const x = fields(value, "Canonical.CapacityUnitRefused", ["position", "bytes", "reason", "after"]); return { kind: "capacityUnitRefused", position: nat(x.position, true), bytes: bytes(x.bytes), reason: capacityRefusal(x.reason), after: capacityView(x.after) }; }
    case "Canonical.PermitIssued": { const x = fields(value, "Canonical.PermitIssued", ["token", "round"]); return { kind: "permitIssued", token: nat(x.token, true), round: nat(x.round, true) }; }
    case "Canonical.PermitConsumed": return { kind: "permitConsumed", round: nat(fields(value, "Canonical.PermitConsumed", ["round"]).round, true) };
    case "Canonical.PermitReleased": fields(value, "Canonical.PermitReleased", []); return { kind: "permitReleased" };
    case "Canonical.PermitExpired": fields(value, "Canonical.PermitExpired", []); return { kind: "permitExpired" };
    case "Canonical.PermitKept": fields(value, "Canonical.PermitKept", []); return { kind: "permitKept" };
    case "Canonical.PermitRoundClosed": return { kind: "permitRoundClosed", round: nat(fields(value, "Canonical.PermitRoundClosed", ["round"]).round, true) };
    case "Canonical.RoundStarted": return { kind: "roundStarted", id: nat(fields(value, "Canonical.RoundStarted", ["id"]).id, true) };
    case "Canonical.ObservationAdmitted": return { kind: "observationAdmitted", id: nat(fields(value, "Canonical.ObservationAdmitted", ["id"]).id, true) };
    case "Canonical.ObservationStarted": fields(value, "Canonical.ObservationStarted", []); return { kind: "observationStarted" };
    case "Canonical.ObservationCompleted": fields(value, "Canonical.ObservationCompleted", []); return { kind: "observationCompleted" };
    case "Canonical.ObservationInterrupted": fields(value, "Canonical.ObservationInterrupted", []); return { kind: "observationInterrupted" };
    case "Canonical.Prepare": { const x = fields(value, "Canonical.Prepare", ["operation", "reservation"]); return { kind: "prepare", operation: nat(x.operation, true), reservation: nat(x.reservation, true) }; }
    case "Canonical.PreparationRefused": fields(value, "Canonical.PreparationRefused", []); return { kind: "preparationRefused" };
    case "Canonical.UnitAdmitted": { const x = fields(value, "Canonical.UnitAdmitted", ["operation", "reservation", "position", "bytes", "after"]); return { kind: "unitAdmitted", operation: nat(x.operation, true), reservation: nat(x.reservation, true), position: nat(x.position, true), bytes: bytes(x.bytes), after: capacityView(x.after) }; }
    case "Canonical.UnitRefused": { const x = fields(value, "Canonical.UnitRefused", ["position", "bytes", "reason", "after"]); return { kind: "unitRefused", position: nat(x.position, true), bytes: bytes(x.bytes), reason: capacityRefusal(x.reason), after: capacityView(x.after) }; }
    case "Canonical.PreparationReleased": { const x = fields(value, "Canonical.PreparationReleased", ["id", "after"]); return { kind: "preparationReleased", id: nat(x.id, true), after: capacityView(x.after) }; }
    case "Canonical.ReviewStarted": fields(value, "Canonical.ReviewStarted", []); return { kind: "reviewStarted" };
    case "Canonical.ReservationReleased": return { kind: "reservationReleased", id: nat(fields(value, "Canonical.ReservationReleased", ["id"]).id, true) };
    case "Canonical.ReviewRecorded": return { kind: "reviewRecorded", outcome: outcome(fields(value, "Canonical.ReviewRecorded", ["outcome"]).outcome) };
    case "Canonical.RetainFinding": fields(value, "Canonical.RetainFinding", []); return { kind: "retainFinding" };
    case "Canonical.FindingCountRecorded": fields(value, "Canonical.FindingCountRecorded", []); return { kind: "findingCountRecorded" };
    case "Canonical.SettleClear": fields(value, "Canonical.SettleClear", []); return { kind: "settleClear" };
    case "Canonical.SettleStaleClear": fields(value, "Canonical.SettleStaleClear", []); return { kind: "settleStaleClear" };
    case "Canonical.RetireStaleFinding": fields(value, "Canonical.RetireStaleFinding", []); return { kind: "retireStaleFinding" };
    case "Canonical.PreparedSkipped": fields(value, "Canonical.PreparedSkipped", []); return { kind: "preparedSkipped" };
    case "Canonical.PreparedAdmitted": fields(value, "Canonical.PreparedAdmitted", []); return { kind: "preparedAdmitted" };
    case "Canonical.PreparedCapacityRefused": fields(value, "Canonical.PreparedCapacityRefused", []); return { kind: "preparedCapacityRefused" };
    case "Canonical.EmptyLost": fields(value, "Canonical.EmptyLost", []); return { kind: "emptyLost" };
    case "Canonical.EmptyAccepted": fields(value, "Canonical.EmptyAccepted", []); return { kind: "emptyAccepted" };
    case "Canonical.FailureBackend": fields(value, "Canonical.FailureBackend", []); return { kind: "failureBackend" };
    case "Canonical.FailureCredential": fields(value, "Canonical.FailureCredential", []); return { kind: "failureCredential" };
    case "Canonical.FailureLost": fields(value, "Canonical.FailureLost", []); return { kind: "failureLost" };
    case "Canonical.FailureNone": fields(value, "Canonical.FailureNone", []); return { kind: "failureNone" };
    case "Canonical.DispatchStarted": { const x = fields(value, "Canonical.DispatchStarted", ["operation", "sequence", "cycle"]); return { kind: "dispatchStarted", operation: nat(x.operation, true), sequence: nat(x.sequence), cycle: nat(x.cycle, true) }; }
    case "Canonical.DispatchCycleCompleted": return { kind: "dispatchCycleCompleted", cycle: nat(fields(value, "Canonical.DispatchCycleCompleted", ["cycle"]).cycle, true) };
    case "Canonical.DispatchDiscarded": { const x = fields(value, "Canonical.DispatchDiscarded", ["operation", "running"]); return { kind: "dispatchDiscarded", operation: nat(x.operation, true), running: bool(x.running) }; }
    case "Canonical.DiscardNamedOnly": fields(value, "Canonical.DiscardNamedOnly", []); return { kind: "discardNamedOnly" };
    case "Canonical.DiscardAllUnfinished": fields(value, "Canonical.DiscardAllUnfinished", []); return { kind: "discardAllUnfinished" };
    case "Canonical.WaitForWork": fields(value, "Canonical.WaitForWork", []); return { kind: "waitForWork" };
    case "Canonical.CancelWork": return { kind: "cancelWork", operation: nat(fields(value, "Canonical.CancelWork", ["operation"]).operation, true) };
    case "Canonical.FinishReady": fields(value, "Canonical.FinishReady", []); return { kind: "finishReady" };
    case "Canonical.FinishLimit": fields(value, "Canonical.FinishLimit", []); return { kind: "finishLimit" };
    case "Canonical.StopEnded": fields(value, "Canonical.StopEnded", []); return { kind: "stopEnded" };
    case "Canonical.CollectionEligible": case "Canonical.CollectionWaiting":
    case "Canonical.CollectionRetireCredential": case "Canonical.CollectionRetainCredential":
    case "Canonical.CollectionCandidate": case "Canonical.CollectionSkip":
    case "Canonical.CollectionBefore": case "Canonical.CollectionEqual": case "Canonical.CollectionAfter":
    case "Canonical.CollectionExpired": case "Canonical.CollectionCurrent":
    case "Canonical.CollectionFits": case "Canonical.CollectionLimited":
    case "Canonical.CollectionFindingSelected": case "Canonical.CollectionFindingRetained":
    case "Canonical.CollectionFindingLimited": case "Canonical.CollectionFindingExpired":
    case "Canonical.CollectionNoticeIncluded": case "Canonical.CollectionNoticeSkipped": case "Canonical.CollectionNoticeStopped":
    case "Canonical.CollectionLeaseReserved": case "Canonical.CollectionLeaseRefused":
    case "Canonical.CollectionLeaseReleased": case "Canonical.CollectionLeaseKept": case "Canonical.CollectionAdviceRetired":
    case "Canonical.CollectionBackgroundClaimed": case "Canonical.CollectionBackgroundRefused":
    case "Canonical.CollectionBackgroundReleased": case "Canonical.CollectionBackgroundKept": {
      const name = tag(value);
      fields(value, name, []);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Extract<CanonicalCommand, { kind: `collection${string}` }>["kind"] };
    }
    case "Canonical.FinishReserved": case "Canonical.FinishNotices":
    case "Canonical.FinishAllowedNoAdvice": case "Canonical.FinishAllowedDeadline":
    case "Canonical.FinishAllowedUnavailable": case "Canonical.FinishRefused":
    case "Canonical.FinishReleased": case "Canonical.FinishAuthorized":
    case "Canonical.FinishEnded": case "Canonical.ContinuationConsumed":
    case "Canonical.ContinuationRefused": {
      const name = tag(value);
      fields(value, name, []);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as
        "finishReserved" | "finishNotices" | "finishAllowedNoAdvice" | "finishAllowedDeadline" |
        "finishAllowedUnavailable" | "finishRefused" | "finishReleased" | "finishAuthorized" |
        "finishEnded" | "continuationConsumed" | "continuationRefused" };
    }
    case "Canonical.FinishRecorded": return { kind: "finishRecorded", outcome: writeOutcome(fields(value, "Canonical.FinishRecorded", ["outcome"]).outcome) };
    case "Canonical.SubmissionBegun": case "Canonical.SubmissionAuthorized":
    case "Canonical.SubmissionRecorded": case "Canonical.SubmissionReleased":
    case "Canonical.SubmissionRefused": case "Canonical.SubmissionForgotten":
    case "Canonical.SubmissionSuppresses": case "Canonical.SubmissionUnsuppressed":
    case "Canonical.SubmissionReofferable": case "Canonical.SubmissionNotReofferable":
    case "Canonical.SubmissionExpired": case "Canonical.SubmissionCurrent": {
      const name = tag(value);
      fields(value, name, []);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Extract<CanonicalCommand, { kind: `submission${string}` }>["kind"] };
    }
    case "Canonical.RevisionReused": case "Canonical.RevisionReplaced": case "Canonical.RevisionGeneration": {
      const name = tag(value); return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "revisionReused" | "revisionReplaced" | "revisionGeneration", generation: nat(fields(value, name, ["generation"]).generation) };
    }
    case "Canonical.RevisionCount": return { kind: "revisionCount", count: nat(fields(value, "Canonical.RevisionCount", ["count"]).count) };
    case "Canonical.RevisionReleased": case "Canonical.RevisionCurrent": case "Canonical.RevisionStale":
    case "Canonical.RevisionSuperseded": case "Canonical.RevisionNotSuperseded": {
      const name = tag(value); fields(value, name, []);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "revisionReleased" | "revisionCurrent" | "revisionStale" | "revisionSuperseded" | "revisionNotSuperseded" };
    }
    case "Canonical.TicketUnavailable": case "Canonical.TicketCollectUnavailable": {
      const name = tag(value);
      return { kind: name === "Canonical.TicketUnavailable" ? "ticketUnavailable" : "ticketCollectUnavailable",
        reason: decodeTicketReason(fields(value, name, ["reason"]).reason) };
    }
    case "Canonical.TicketUnitSnapshot": {
      const item = fields(value, "Canonical.TicketUnitSnapshot", ["stage", "reason"]);
      return { kind: "ticketUnitSnapshot", ...decodeTicketUnitState(item.stage, item.reason) };
    }
    case "Canonical.TicketUnitMissing": fields(value, "Canonical.TicketUnitMissing", []); return { kind: "ticketUnitMissing" };
    case "Canonical.TicketEvicted": return { kind: "ticketEvicted", id: nat(fields(value, "Canonical.TicketEvicted", ["id"]).id, true) };
    case "Canonical.TicketKept": case "Canonical.CleanupReady": case "Canonical.CleanupBusy": case "Canonical.CleanupCommitted":
    case "Canonical.DeliveryReleaseUnacknowledged": case "Canonical.DeliveryKeepAcknowledged":
    case "Canonical.DeliveryAckReady": case "Canonical.DeliveryAckExpired": case "Canonical.DeliveryAckEmpty":
    case "Canonical.DeliveryFinalReady": case "Canonical.DeliveryFinalExpired": case "Canonical.DeliveryFinalEmpty":
    case "Canonical.DeliveryRetireAdvice": case "Canonical.DeliveryKeepRemaining": case "Canonical.DeliveryKeepForReoffer": {
      const name = tag(value); fields(value, name, []);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "ticketKept" | "cleanupReady" | "cleanupBusy" | "cleanupCommitted" | "deliveryReleaseUnacknowledged" | "deliveryKeepAcknowledged" | "deliveryAckReady" | "deliveryAckExpired" | "deliveryAckEmpty" | "deliveryFinalReady" | "deliveryFinalExpired" | "deliveryFinalEmpty" | "deliveryRetireAdvice" | "deliveryKeepRemaining" | "deliveryKeepForReoffer" };
    }
    case "Canonical.DeliverySubmissionCandidate": case "Canonical.DeliverySubmissionRefused":
    case "Canonical.DeliveryBatchProceed": case "Canonical.DeliveryBatchRelease":
    case "Canonical.DeliveryCredentialInvalid": case "Canonical.DeliveryCredentialValid": {
      const name = tag(value); fields(value, name, []);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "deliverySubmissionCandidate" | "deliverySubmissionRefused" | "deliveryBatchProceed" | "deliveryBatchRelease" | "deliveryCredentialInvalid" | "deliveryCredentialValid" };
    }
    case "Canonical.IgnoreCandidate": case "Canonical.ReleaseCandidate": case "Canonical.RetireCandidate":
    case "Canonical.ContinueCandidate": case "Canonical.RetainCandidate": {
      const name = tag(value); fields(value, name, []);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "ignoreCandidate" | "releaseCandidate" | "retireCandidate" | "continueCandidate" | "retainCandidate" };
    }
    case "Canonical.NoticeSuppressed": case "Canonical.NoticeCreatePending": case "Canonical.NoticeMergePending": {
      const name = tag(value); return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "noticeSuppressed" | "noticeCreatePending" | "noticeMergePending", count: nat(fields(value, name, ["count"]).count) };
    }
    case "Canonical.NoticePruned": {
      const item = fields(value, "Canonical.NoticePruned", ["drop_lease", "drop_pending", "drop_key"]);
      return { kind: "noticePruned", dropLease: bool(item.drop_lease), dropPending: bool(item.drop_pending), dropKey: bool(item.drop_key) };
    }
    case "Canonical.NoticeSelected": return { kind: "noticeSelected", ids: readList(fields(value, "Canonical.NoticeSelected", ["ids"]).ids, (id) => nat(id, true)) };
    case "Canonical.IncludeChoice": {
      const choice = fields(value, "Canonical.IncludeChoice", ["choice"]).choice;
      const name = tag(choice);
      if (name !== "Configuration.ReplaceIncludes" && name !== "Configuration.KeepIncludes") throw new TypeError("invalid include choice");
      fields(choice, name, []);
      return { kind: "includeChoice", choice: name === "Configuration.ReplaceIncludes" ? "replaceIncludes" : "keepIncludes" };
    }
    case "Canonical.FileSelection": {
      const selection = fields(value, "Canonical.FileSelection", ["selection"]).selection;
      const names = ["Protected", "Excluded", "EmptyIncludes", "NotIncluded", "Selected"];
      const name = tag(selection);
      if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid file selection");
      fields(selection, name, []);
      return { kind: "fileSelection", selection: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as "protected" | "excluded" | "emptyIncludes" | "notIncluded" | "selected" };
    }
    case "Canonical.FileProtection": {
      const protection = fields(value, "Canonical.FileProtection", ["protection"]).protection;
      const names = ["AllowedPath", "RepositoryBoundary", "SensitivePath", "GeneratedOrVendor", "FileExtension"];
      const name = tag(protection);
      if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid file protection");
      fields(protection, name, []);
      return { kind: "fileProtection", protection: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as "allowedPath" | "repositoryBoundary" | "sensitivePath" | "generatedOrVendor" | "fileExtension" };
    }
    case "Canonical.CandidateFile": {
      const candidate = fields(value, "Canonical.CandidateFile", ["candidate"]).candidate;
      const names = ["CandidateAllowed", "RefuseGitAdmin", "RefuseFileKind", "RefuseGitIgnore"];
      const name = tag(candidate);
      if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid candidate file");
      fields(candidate, name, []);
      return { kind: "candidateFile", candidate: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as "candidateAllowed" | "refuseGitAdmin" | "refuseFileKind" | "refuseGitIgnore" };
    }
    case "Canonical.ReviewAdmission": {
      const admission = fields(value, "Canonical.ReviewAdmission", ["admission"]).admission;
      const names = ["AdmitReview", "RefuseRoot", "RefuseConfiguration", "RefuseCredential", "RefuseSelection"];
      const name = tag(admission);
      if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid review admission");
      fields(admission, name, []);
      return { kind: "reviewAdmission", admission: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as "admitReview" | "refuseRoot" | "refuseConfiguration" | "refuseCredential" | "refuseSelection" };
    }
    case "Canonical.RuleGate": {
      const gate = fields(value, "Canonical.RuleGate", ["gate"]).gate;
      const name = tag(gate);
      if (name !== "RulePolicy.Admit" && name !== "RulePolicy.Omit") throw new TypeError("invalid rule gate");
      fields(gate, name, []);
      return { kind: "ruleGate", gate: name === "RulePolicy.Admit" ? "admit" : "omit" };
    }
    case "Canonical.RuleOrder": {
      const order = fields(value, "Canonical.RuleOrder", ["order"]).order;
      const name = tag(order);
      if (name !== "RulePolicy.Before" && name !== "RulePolicy.Equal" && name !== "RulePolicy.After") throw new TypeError("invalid rule order");
      fields(order, name, []);
      return { kind: "ruleOrder", order: name === "RulePolicy.Before" ? "before" : name === "RulePolicy.After" ? "after" : "equal" };
    }
    case "Canonical.NoticeRejectedFull": case "Canonical.NoticeCreateKey": case "Canonical.NoticeKeepLeased":
    case "Canonical.NoticeRefused": case "Canonical.NoticeCommitted": case "Canonical.NoticeDropped":
    case "Canonical.NoticeLeased": case "Canonical.NoticePendingCleared": {
      const name = tag(value); fields(value, name, []);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "noticeRejectedFull" | "noticeCreateKey" | "noticeKeepLeased" | "noticeRefused" | "noticeCommitted" | "noticeDropped" | "noticeLeased" | "noticePendingCleared" };
    }
    case "Canonical.CachePrepared": return { kind: "cachePrepared", evicted: readList(fields(value, "Canonical.CachePrepared", ["evicted"]).evicted, (id) => nat(id, true)) };
    case "Canonical.CacheDiscarded": return { kind: "cacheDiscarded", ids: readList(fields(value, "Canonical.CacheDiscarded", ["ids"]).ids, (id) => nat(id, true)) };
    case "Canonical.ReuseJoinAdvice": case "Canonical.ReuseJoinPending":
    case "Canonical.ReuseJoinClaimed": case "Canonical.ReuseCached":
    case "Canonical.ReuseOwn": case "Canonical.ReuseClaimed":
    case "Canonical.ReuseAttached": case "Canonical.ReuseReleased":
    case "Canonical.ReuseRefused": case "Canonical.CacheAlready":
    case "Canonical.CacheRejected": case "Canonical.CacheCommitted": {
      const name = tag(value); fields(value, name, []);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Exclude<Extract<CanonicalCommand, { kind: `reuse${string}` | `cache${string}` }>["kind"], "cachePrepared" | "cacheDiscarded"> };
    }
    case "Canonical.TicketOpened": case "Canonical.TicketForgotten": case "Canonical.TicketFailed":
    case "Canonical.TicketClosed": case "Canonical.TicketUnitAdded": case "Canonical.TicketUnitUpdated":
    case "Canonical.TicketRefused": case "Canonical.TicketPending": case "Canonical.TicketDelivered":
    case "Canonical.TicketClear": case "Canonical.TicketNoWork": case "Canonical.TicketCollectProceed":
    case "Canonical.TicketFinalProceed": case "Canonical.TicketFinalRelease":
    case "Canonical.TicketKeepJoined": case "Canonical.TicketSetJoinedClear":
    case "Canonical.TicketSetJoinedFinding": case "Canonical.TicketSetJoinedUnavailable":
    case "Canonical.TicketSetJoinedLost": {
      const name = tag(value); fields(value, name, []);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Exclude<Extract<CanonicalCommand, { kind: `ticket${string}` }>["kind"], "ticketUnavailable" | "ticketCollectUnavailable" | "ticketUnitSnapshot" | "ticketUnitMissing" | "ticketEvicted"> };
    }
    case "Canonical.WriteAuthorized": return { kind: "writeAuthorized", operation: nat(fields(value, "Canonical.WriteAuthorized", ["operation"]).operation, true) };
    case "Canonical.WriteRecorded": return { kind: "writeRecorded", outcome: writeOutcome(fields(value, "Canonical.WriteRecorded", ["outcome"]).outcome) };
    case "Canonical.WaitForOutput": fields(value, "Canonical.WaitForOutput", []); return { kind: "waitForOutput" };
    case "Canonical.ReofferAtStop": fields(value, "Canonical.ReofferAtStop", []); return { kind: "reofferAtStop" };
    case "Canonical.PartitionRetired": return { kind: "partitionRetired", round: nat(fields(value, "Canonical.PartitionRetired", ["round"]).round, true) };
    default: throw new TypeError("unknown canonical command");
  }
};

export type CanonicalProjection = {
  readonly global: { readonly items: number; readonly bytes: number };
  readonly limits: { readonly globalItems: number; readonly globalBytes: number; readonly partitionItems: number; readonly partitionBytes: number };
  readonly partitions: readonly { readonly partition: number; readonly items: number; readonly bytes: number }[];
  readonly charges: readonly CapacityCharge[];
  readonly inventory: readonly { readonly purpose: CapacityPurpose; readonly limits: CanonicalProjection["limits"] }[];
  readonly rounds: readonly { readonly partition: number; readonly lifetime: number; readonly id: number; readonly waiting: boolean; readonly deciding: boolean; readonly write?: number; readonly uncertain: boolean }[];
  readonly admissions: readonly { readonly partition: number; readonly lifetime: number; readonly round: number; readonly active: boolean; readonly closedAt: number; readonly permits: readonly { readonly token: number; readonly tool: number; readonly round: number; readonly deadline: number }[]; readonly used: readonly { readonly token: number; readonly tool: number }[] }[];
  readonly work: readonly { readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly reservation: number; readonly parent: number; readonly kind: "sourceQueued" | "sourceReading" | "preparing" | "reviewing" | "atJev" | "pendingFinding" }[];
  readonly pendingFindings: readonly { readonly operation: number; readonly count: number }[];
  readonly dispatch: { readonly pending: readonly DispatchEntry[]; readonly active: readonly DispatchEntry[]; readonly running: readonly DispatchEntry[]; readonly nextSequence: number; readonly cycle: number; readonly closed: boolean };
  readonly collection: { readonly ready: readonly number[]; readonly leases: readonly { readonly advice: number; readonly owner: number }[]; readonly claims: readonly { readonly group: number; readonly owner: number }[] };
  readonly tickets: readonly { readonly id: number; readonly phase: "preparing" | "closed" | "failed"; readonly failure?: TicketReason; readonly units: readonly { readonly id: number; readonly stage: "pending" | "clear" | "finding" | "unavailable"; readonly delivered?: boolean; readonly reason?: TicketReason }[] }[];
  readonly notices: readonly { readonly id: number; readonly partition: number; readonly group: number; readonly reservation: number; readonly suppressed: number; readonly pending?: { readonly id: number; readonly count: number; readonly sequence: number; readonly leased: boolean } }[];
  readonly reuse: { readonly claims: readonly { readonly id: number; readonly attached: boolean }[]; readonly cache: readonly { readonly id: number; readonly partition: number; readonly bytes: number; readonly reservation: number }[] };
  readonly revision: { readonly entries: readonly { readonly subject: number; readonly input: number; readonly generation: number; readonly members: number }[]; readonly nextGeneration: number };
  readonly delivery: { readonly slots: readonly { readonly group: number; readonly round: number; readonly attempt: number; readonly token: number; readonly selected: readonly number[]; readonly phase: "reserved" | "authorized" | "submitted" | "failed" | "uncertain" }[]; readonly counters: readonly { readonly group: number; readonly round: number; readonly used: number }[]; readonly submissions: { readonly batches: readonly { readonly advice: number; readonly group: number; readonly round: number; readonly token: number; readonly surface: "edit" | "background" | "stop"; readonly phase: "reserved" | "authorized" | "submitted" | "uncertain"; readonly fingerprints: readonly number[]; readonly units: readonly number[] }[]; readonly leases: readonly { readonly advice: number; readonly fingerprint: number; readonly round: number; readonly phase: "available" | "reserved" | "authorized" | "submitted" | "uncertain"; readonly reoffered: boolean }[] } };
};
type DispatchEntry = { readonly partition: number; readonly lifetime: number; readonly round: number; readonly operation: number; readonly sequence: number; readonly cycle: number; readonly cancelled: boolean };
const known = new WeakSet<object>();
export const projectCanonical = (state: unknown): CanonicalProjection => {
  if (!known.has(object(state))) throw new TypeError("foreign canonical state");
  const s = fields(state, "Canonical.State", ["ledger", "rounds", "work", "next_round", "next_operation", "admissions", "dispatch", "collection"]);
  nat(s.next_round, true); nat(s.next_operation, true);
  const rawDispatch = fields(s.dispatch, "Dispatch.State", ["pending", "active", "running", "next_sequence", "cycle", "closed"]);
  const dispatchEntry = (value: unknown): DispatchEntry => {
    const x = fields(value, "Dispatch.Entry", ["partition", "lifetime", "round", "operation", "sequence", "cycle", "cancelled"]);
    return { partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), round: nat(x.round, true),
      operation: nat(x.operation, true), sequence: nat(x.sequence), cycle: nat(x.cycle), cancelled: bool(x.cancelled) };
  };
  const dispatch = { pending: readList(rawDispatch.pending, dispatchEntry), active: readList(rawDispatch.active, dispatchEntry),
    running: readList(rawDispatch.running, dispatchEntry), nextSequence: nat(rawDispatch.next_sequence),
    cycle: nat(rawDispatch.cycle), closed: bool(rawDispatch.closed) };
  const dispatchEntries = [...dispatch.pending, ...dispatch.active, ...dispatch.running];
  const collectionState = fields(s.collection, "CollectionState.State", ["ready", "leases", "claims", "delivery", "revision", "tickets", "reuse", "notices"]);
  const noticeState = fields(collectionState.notices, "NoticeState.State", ["records"]);
  const notices: CanonicalProjection["notices"] = readList(noticeState.records, (value) => {
    const item = fields(value, "NoticeState.Record", ["id", "partition", "group", "reservation", "suppressed", "pending"]);
    const pending = tag(item.pending) === "Some" ? (() => {
      const p = fields(fields(item.pending, "Some", ["value"]).value, "NoticeState.Pending", ["id", "count", "sequence", "leased"]);
      return { id: nat(p.id, true), count: nat(p.count), sequence: nat(p.sequence, true), leased: bool(p.leased) };
    })() : (fields(item.pending, "None", []), undefined);
    return { id: nat(item.id, true), partition: nat(item.partition, true), group: nat(item.group, true), reservation: nat(item.reservation, true), suppressed: nat(item.suppressed), ...(pending === undefined ? {} : { pending }) };
  });
  if (new Set(notices.map((item) => item.id)).size !== notices.length ||
      new Set(notices.map((item) => item.reservation)).size !== notices.length ||
      new Set(notices.flatMap((item) => item.pending === undefined ? [] : [item.pending.id])).size !== notices.filter((item) => item.pending !== undefined).length ||
      new Set(notices.flatMap((item) => item.pending === undefined ? [] : [item.pending.sequence])).size !== notices.filter((item) => item.pending !== undefined).length) throw new TypeError("duplicate canonical notice identity");
  const reuseState = fields(collectionState.reuse, "ReuseState.State", ["claims", "cache"]);
  const reuse: CanonicalProjection["reuse"] = {
    claims: readList(reuseState.claims, (value) => {
      const item = fields(value, "ReuseState.Claim", ["id", "attached"]);
      return { id: nat(item.id, true), attached: bool(item.attached) };
    }),
    cache: readList(reuseState.cache, (value) => {
      const item = fields(value, "ReuseState.Entry", ["id", "partition", "bytes", "reservation"]);
      return { id: nat(item.id, true), partition: nat(item.partition, true), bytes: nat(item.bytes), reservation: nat(item.reservation, true) };
    }),
  };
  if (new Set(reuse.claims.map((item) => item.id)).size !== reuse.claims.length ||
      new Set(reuse.cache.map((item) => item.id)).size !== reuse.cache.length) {
    throw new TypeError("duplicate canonical evaluation identity");
  }
  const rawRevision = fields(collectionState.revision, "RevisionState.State", ["entries", "next_generation"]);
  const revision = { entries: readList(rawRevision.entries, (value) => {
    const entry = fields(value, "RevisionState.Entry", ["subject", "input", "generation", "members"]);
    return { subject: nat(entry.subject, true), input: nat(entry.input, true), generation: nat(entry.generation, true), members: nat(entry.members, true) };
  }), nextGeneration: nat(rawRevision.next_generation, true) };
  if (new Set(revision.entries.map((entry) => entry.subject)).size !== revision.entries.length) throw new TypeError("duplicate canonical revision subject");
  const ticketState = fields(collectionState.tickets, "TicketState.State", ["records"]);
  const tickets: CanonicalProjection["tickets"] = readList(ticketState.records, (value) => {
    const record = fields(value, "TicketState.Record", ["id", "phase", "units"]);
    const phaseTag = tag(record.phase);
    let phase: "preparing" | "closed" | "failed";
    let failure: TicketReason | undefined;
    if (phaseTag === "Ticket.Preparing") {
      phase = "preparing";
      failure = maybeTicketReason(fields(record.phase, phaseTag, ["failure"]).failure);
    } else if (phaseTag === "Ticket.Closed") {
      fields(record.phase, phaseTag, []); phase = "closed";
    } else if (phaseTag === "Ticket.Failed") {
      phase = "failed";
      failure = decodeTicketReason(fields(record.phase, phaseTag, ["reason"]).reason);
    } else throw new TypeError("unknown ticket phase");
    const units = readList(record.units, (value) => {
      const item = fields(value, "TicketState.TicketUnit", ["id", "stage", "reason"]);
      return { id: nat(item.id, true), ...decodeTicketUnitState(item.stage, item.reason) };
    });
    return { id: nat(record.id, true), phase, ...(failure === undefined ? {} : { failure }), units };
  });
  if (new Set(tickets.map((ticket) => ticket.id)).size !== tickets.length ||
      tickets.some((ticket) => new Set(ticket.units.map((unit) => unit.id)).size !== ticket.units.length)) {
    throw new TypeError("duplicate canonical ticket identity");
  }
  const collection = {
    ready: readList(collectionState.ready, (id) => nat(id, true)),
    leases: readList(collectionState.leases, (value) => {
      const item = fields(value, "CollectionState.Lease", ["advice", "owner"]);
      return { advice: nat(item.advice, true), owner: nat(item.owner, true) };
    }),
    claims: readList(collectionState.claims, (value) => {
      const item = fields(value, "CollectionState.Claim", ["group", "owner"]);
      return { group: nat(item.group, true), owner: nat(item.owner, true) };
    }),
  };
  if (new Set(collection.ready).size !== collection.ready.length ||
      new Set(collection.leases.map((item) => item.advice)).size !== collection.leases.length ||
      collection.leases.some((item) => !collection.ready.includes(item.advice)) ||
      new Set(collection.claims.map((item) => item.group)).size !== collection.claims.length) {
    throw new TypeError("inconsistent canonical collection state");
  }
  const deliveryState = fields(collectionState.delivery, "DeliveryState.State", ["slots", "counters", "submissions"]);
  const rawSubmissions = fields(deliveryState.submissions, "SubmissionState.State", ["leases", "batches"]);
  const surface = (value: unknown): "edit" | "background" | "stop" => {
    const name = tag(value);
    if (name === "Handoff.Edit") return "edit";
    if (name === "Handoff.Background") return "background";
    if (name === "Handoff.Stop") return "stop";
    throw new TypeError("invalid submission surface");
  };
  const delivery = {
    slots: readList(deliveryState.slots, (value) => {
      const item = fields(value, "DeliveryState.Slot", ["group", "round", "attempt", "token", "selected", "phase"]);
      const phase = tag(item.phase).slice("DeliveryState.".length).toLowerCase();
      if (!["reserved", "authorized", "submitted", "failed", "uncertain"].includes(phase)) throw new TypeError("invalid canonical delivery phase");
      return { group: nat(item.group, true), round: nat(item.round, true), attempt: nat(item.attempt, true),
        token: nat(item.token, true), selected: readList(item.selected, (id) => nat(id, true)),
        phase: phase as "reserved" | "authorized" | "submitted" | "failed" | "uncertain" };
    }),
    counters: readList(deliveryState.counters, (value) => {
      const item = fields(value, "DeliveryState.Counter", ["group", "round", "used"]);
      return { group: nat(item.group, true), round: nat(item.round, true), used: nat(item.used) };
    }),
    submissions: {
      batches: readList(rawSubmissions.batches, (value) => {
        const item = fields(value, "SubmissionState.Batch", ["advice", "group", "round", "token", "surface", "phase", "fingerprints", "units"]);
        const phase = tag(item.phase).slice("Delivery.".length).toLowerCase();
        if (!["reserved", "authorized", "submitted", "uncertain"].includes(phase)) throw new TypeError("invalid submission phase");
        return { advice: nat(item.advice, true), group: nat(item.group, true), round: nat(item.round, true),
          token: nat(item.token, true), surface: surface(item.surface), phase: phase as "reserved" | "authorized" | "submitted" | "uncertain",
          fingerprints: readList(item.fingerprints, (id) => nat(id, true), 5),
          units: readList(item.units, (id) => nat(id, true), 5) };
      }),
      leases: readList(rawSubmissions.leases, (value) => {
        const item = fields(value, "SubmissionState.LeaseRecord", ["advice", "fingerprint", "current", "previous"]);
        const lease = fields(item.current, "Handoff.Lease", ["item", "round", "closed", "reoffered", "phase"]);
        const phase = tag(lease.phase).slice("Handoff.".length).toLowerCase();
        if (!["available", "reserved", "authorized", "submitted", "uncertain"].includes(phase)) throw new TypeError("invalid submission lease phase");
        nat(lease.item, true); bool(lease.closed);
        if (tag(item.previous) === "Some") fields(item.previous, "Some", ["value"]);
        else fields(item.previous, "None", []);
        return { advice: nat(item.advice, true), fingerprint: nat(item.fingerprint, true), round: nat(lease.round, true),
          phase: phase as "available" | "reserved" | "authorized" | "submitted" | "uncertain", reoffered: bool(lease.reoffered) };
      }),
    },
  };
  if (new Set(delivery.slots.map((item) => item.group)).size !== delivery.slots.length ||
      new Set(delivery.counters.map((item) => `${item.group}:${item.round}`)).size !== delivery.counters.length ||
      delivery.counters.some((item) => item.used > 4)) throw new TypeError("inconsistent canonical delivery state");
  if (new Set(delivery.submissions.batches.map((item) => `${item.advice}:${item.token}`)).size !== delivery.submissions.batches.length ||
      new Set(delivery.submissions.leases.map((item) => `${item.advice}:${item.fingerprint}`)).size !== delivery.submissions.leases.length) {
    throw new TypeError("inconsistent canonical submission state");
  }
  if (dispatch.running.length > 2 || new Set(dispatchEntries.map((x) => x.operation)).size !== dispatchEntries.length ||
      new Set(dispatchEntries.map((x) => x.sequence)).size !== dispatchEntries.length ||
      dispatchEntries.some((x) => x.sequence >= dispatch.nextSequence || x.cycle > dispatch.cycle) ||
      dispatch.pending.some((x) => x.cycle !== 0) ||
      [...dispatch.active, ...dispatch.running].some((x) => x.cycle !== dispatch.cycle)) {
    throw new TypeError("inconsistent canonical dispatch state");
  }
  const ledger = fields(s.ledger, "Ledger.Ledger", ["limits", "next_id", "charges"]);
  nat(ledger.next_id, true);
  const limits = fields(ledger.limits, "Ledger.Limits", ["global_items", "global_bytes", "partition_items", "partition_bytes"]);
  for (const value of Object.values(limits).slice(1)) nat(value, true);
  const charges = readList(ledger.charges, charge);
  const rounds = readList(s.rounds, (value) => {
    const x = fields(value, "Canonical.Round", ["partition", "lifetime", "id", "waiting", "deciding", "write", "uncertain"]);
    const write = tag(x.write) === "Some" ? nat(fields(x.write, "Some", ["value"]).value, true) : undefined;
    if (write === undefined) fields(x.write, "None", []);
    return { partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), id: nat(x.id, true), waiting: bool(x.waiting), deciding: bool(x.deciding), ...(write === undefined ? {} : { write }), uncertain: bool(x.uncertain) };
  });
  const admissions = readList(s.admissions, (value) => {
    const x = fields(value, "Admission.AdmissionState", ["partition", "lifetime", "round", "active", "closed_at", "next_token", "permits", "used"]);
    const permits = readList(x.permits, (entry) => {
      const permit = fields(entry, "Admission.Permit", ["token", "tool", "round", "started", "deadline"]);
      const started = nat(permit.started); const deadline = nat(permit.deadline);
      if (deadline < started) throw new TypeError("invalid permit deadline");
      return { token: nat(permit.token, true), tool: nat(permit.tool, true), round: nat(permit.round, true), deadline };
    });
    const used = readList(x.used, (entry) => {
      const item = fields(entry, "Admission.Used", ["token", "tool"]);
      return { token: nat(item.token, true), tool: nat(item.tool, true) };
    }, 65_536);
    const next = nat(x.next_token, true);
    if (permits.some((item) => item.token >= next) || used.some((item) => item.token >= next) ||
        new Set([...permits, ...used].map((item) => item.token)).size !== permits.length + used.length ||
        new Set([...permits, ...used].map((item) => item.tool)).size !== permits.length + used.length) throw new TypeError("invalid admission tokens");
    return { partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), round: nat(x.round), active: bool(x.active), closedAt: nat(x.closed_at), permits, used };
  });
  const work = readList(s.work, (value) => {
    const x = fields(value, "Canonical.Work", ["partition", "lifetime", "round", "operation", "charge", "kind", "parent"]);
    const kind = tag(x.kind);
    const names = { "Canonical.SourceQueued": "sourceQueued", "Canonical.SourceReading": "sourceReading",
      "Canonical.Preparing": "preparing", "Canonical.Reviewing": "reviewing",
      "Canonical.AtJev": "atJev", "Canonical.PendingFinding": "pendingFinding" } as const;
    const stage = names[kind as keyof typeof names];
    if (stage === undefined) throw new TypeError("invalid work kind");
    return { partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), round: nat(x.round, true),
      operation: nat(x.operation, true), reservation: nat(x.charge), parent: nat(x.parent), kind: stage };
  });
  const pendingFindings = readList(s.work, (value) => {
    const x = fields(value, "Canonical.Work", ["partition", "lifetime", "round", "operation", "charge", "kind", "parent"]);
    return tag(x.kind) === "Canonical.PendingFinding"
      ? { operation: nat(x.operation, true), count: nat(fields(x.kind, "Canonical.PendingFinding", ["count"]).count, true) }
      : undefined;
  }).filter((item): item is { operation: number; count: number } => item !== undefined);
  const chargeIds = new Set(charges.map((x) => x.id));
  const chargesById = new Map(charges.map((x) => [x.id, x]));
  if (notices.some((item) => {
    const held = chargesById.get(item.reservation);
    return held?.purpose !== "operationalNotice" || held.partition !== item.partition;
  })) throw new TypeError("canonical notice reservation mismatch");
  const usedBytes = charges.reduce((sum, x) => sum + x.bytes, 0);
  if (chargeIds.size !== charges.length || work.filter((x) => x.reservation !== 0).length > charges.length ||
      new Set(work.map((x) => x.operation)).size !== work.length ||
      new Set(work.filter((x) => x.reservation !== 0).map((x) => x.reservation)).size !== work.filter((x) => x.reservation !== 0).length ||
      new Set(rounds.map((x) => x.partition)).size !== rounds.length ||
      new Set(admissions.map((x) => x.partition)).size !== admissions.length ||
      rounds.some((x) => x.id >= (s.next_round as number) || (x.write !== undefined && x.write >= (s.next_operation as number))) ||
      work.some((x) => (x.reservation === 0
          ? x.kind !== "sourceQueued" && x.kind !== "sourceReading"
          : chargesById.get(x.reservation)?.partition !== x.partition ||
            (x.kind === "pendingFinding"
              ? chargesById.get(x.reservation)?.purpose !== "storedResult" &&
                chargesById.get(x.reservation)?.purpose !== "adviceRecheck"
              : chargesById.get(x.reservation)?.purpose !== (x.kind === "preparing" ? "preparation" : "reviewUnit"))) ||
        x.operation >= (s.next_operation as number) ||
        !rounds.some((round) => round.partition === x.partition && round.lifetime === x.lifetime && round.id === x.round)) ||
      reuse.cache.some((entry) => {
        const charge = chargesById.get(entry.reservation);
        return charge?.purpose !== "storedResult" || charge.partition !== entry.partition ||
          charge.bytes !== entry.bytes;
      }) ||
      charges.some((x) => x.id >= (ledger.next_id as number)) ||
      rounds.some((round) => {
        const local = charges.filter((charge) => charge.partition === round.partition);
        return local.length > (limits.partition_items as number) ||
          local.reduce((sum, charge) => sum + charge.bytes, 0) > (limits.partition_bytes as number);
      }) ||
      charges.length > (limits.global_items as number) || usedBytes > (limits.global_bytes as number)) {
    throw new TypeError("inconsistent canonical state");
  }
  const total = fields(bendCanonicalTotal(state), "Ledger.Usage", ["items", "bytes"]);
  const global = { items: nat(total.items), bytes: nat(total.bytes) };
  if (global.items !== charges.length || global.bytes !== usedBytes) throw new TypeError("Bend ledger total mismatch");
  const partitionIds = [...new Set([...rounds.map((round) => round.partition), ...charges.map((item) => item.partition)])];
  const partitions = partitionIds.map((partition) => {
    const usage = fields(bendCanonicalPartitionUsage(state, partition), "Ledger.Usage", ["items", "bytes"]);
    return { partition, items: nat(usage.items), bytes: nat(usage.bytes) };
  });
  const inventory = readList(bendCanonicalInventory(state), (entry) => {
    const x = fields(entry, "Ledger.InventoryEntry", ["purpose", "limits"]);
    const entryLimits = fields(x.limits, "Ledger.Limits", ["global_items", "global_bytes", "partition_items", "partition_bytes"]);
    return { purpose: purpose(x.purpose), limits: {
      globalItems: nat(entryLimits.global_items, true), globalBytes: nat(entryLimits.global_bytes, true),
      partitionItems: nat(entryLimits.partition_items, true), partitionBytes: nat(entryLimits.partition_bytes, true),
    } };
  });
  if (inventory.length !== 6 || new Set(inventory.map((entry) => entry.purpose)).size !== 6 ||
      inventory.some((entry) => entry.limits.globalItems !== limits.global_items ||
        entry.limits.globalBytes !== limits.global_bytes ||
        entry.limits.partitionItems !== limits.partition_items ||
        entry.limits.partitionBytes !== limits.partition_bytes)) throw new TypeError("inconsistent capacity inventory");
  return { global,
    limits: { globalItems: nat(limits.global_items, true), globalBytes: nat(limits.global_bytes, true),
      partitionItems: nat(limits.partition_items, true), partitionBytes: nat(limits.partition_bytes, true) },
    partitions, charges, inventory, rounds, admissions, work, pendingFindings,
    dispatch, collection, revision, tickets, reuse, notices, delivery };
};
export const initialCanonical = (limits: { readonly globalItems: number; readonly globalBytes: number; readonly partitionItems: number; readonly partitionBytes: number }): unknown => {
  const values = Object.values(limits);
  if (values.length !== 4 || values.some((value) => !Number.isSafeInteger(value) || value <= 0 || value > MAX_NAT) ||
      limits.globalItems > 256 || limits.partitionItems > 16 ||
      limits.globalBytes > MAX_BYTES || limits.partitionBytes > MAX_BYTES) throw new TypeError("invalid canonical limits");
  const state = bendCanonicalInitial({ $: "Ledger.Limits", global_items: limits.globalItems, global_bytes: limits.globalBytes, partition_items: limits.partitionItems, partition_bytes: limits.partitionBytes });
  known.add(object(state)); projectCanonical(state);
  return state;
};
/** Callers must supply measured byte counts, authenticated attribution, and correct deadline facts. */
export const stepCanonical = (state: unknown, event: CanonicalEvent): { readonly state: unknown; readonly commands: readonly CanonicalCommand[]; readonly rejection?: string } => {
  projectCanonical(state);
  const raw = bendCanonicalStep(state, encode(event));
  switch (tag(raw)) {
    case "Canonical.Advanced": {
      const x = fields(raw, "Canonical.Advanced", ["state", "commands"]);
      known.add(object(x.state)); projectCanonical(x.state);
      return { state: x.state, commands: readList(x.commands, decodeCommand) };
    }
    case "Canonical.Rejected": {
      const x = fields(raw, "Canonical.Rejected", ["state", "reason"]);
      known.add(object(x.state)); projectCanonical(x.state);
      const reason = tag(x.reason);
      if (reason === "Canonical.PermitDenied") {
        const detail = tag(fields(x.reason, "Canonical.PermitDenied", ["reason"]).reason);
        if (!/^Admission\.(WrongPartition|WrongLifetime|StaleInvocation|Expired|DuplicateTool|NoPermit|UsedPermit|WrongTool|OldRound|InvalidClock|RoundAlreadyClosed|LifetimeNotFresh)$/.test(detail)) throw new TypeError("unknown permit refusal");
        return { state: x.state, commands: [], rejection: detail.slice("Admission.".length) };
      }
      if (!/^Canonical\.(InvalidIdentity|RoundLimit|StaleRound|StaleOperation|WrongStage|InconsistentLedger|ProspectiveDenied)$/.test(reason)) throw new TypeError("unknown rejection");
      return { state: x.state, commands: [], rejection: reason.slice("Canonical.".length) };
    }
    default: throw new TypeError("unknown canonical step");
  }
};
