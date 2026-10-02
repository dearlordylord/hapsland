import { Schema } from "effect";
import { decoder, readRecord, readTag, readNat, readPositiveNat, readBytes, readBool, readBendList, Probability, ProbabilityWordsSchema } from "./boundary-schema.ts";
import { decodeCanonicalConstructor, decodeCanonicalRejection } from "./constructors.ts";
import { CanonicalEventSchema, CanonicalLimitsSchema, type JevRequestOutcome, type CompletedEditReason, type QuietRoundFacts, type CapacityPurpose, type CollectorReason, type ReuseMemberState, type ProspectiveFacts, type CleanupFacts, type CapacityRefusal, type CapacityCharge, type CapacityView, type DispatchEntry, type CanonicalProjection, type CanonicalCommand, type CanonicalEvent } from "./models.ts";
export type { JevRequestOutcome, CompletedEditReason, QuietRoundFacts, CapacityPurpose, CollectorReason, ReuseMemberState, ProspectiveFacts, CleanupFacts, CapacityRefusal, CapacityCharge, CapacityView, CanonicalProjection, CanonicalCommand, CanonicalEvent } from "./models.ts";
import { freezeCanonicalData } from "./immutable.ts";
import { bendCanonicalInitial, bendCanonicalInventory, bendCanonicalPartitionUsage, bendCanonicalStep, bendCanonicalTotal, bendPreparationLimit, bendJevRequestLimit } from "./canonical.generated.js";

// Keep reserved + requested bytes within Bend's 48-bit immediate Nat range.
export const CANONICAL_MAX_BYTES = 2 ** 47 - 1;
export const CANONICAL_MAX_UNITS = 1024;



const completedEditTags: Record<CompletedEditReason, string> = {
  consumed: "Consumed", released: "Released", expired: "Expired", closed: "Closed",
};
const encodeCompletedEditReason = (reason: CompletedEditReason): unknown =>
  ({ $: `EditHistory.${completedEditTags[reason]}` });
const decodeCompletedEditReason = (value: unknown): CompletedEditReason => {
  const entry = (Object.entries(completedEditTags) as [CompletedEditReason, string][])
    .find(([, name]) => tag(value) === `EditHistory.${name}`);
  if (entry === undefined) throw new TypeError("invalid completed edit reason");
  decodeCanonicalConstructor(value, `EditHistory.${entry[1]}`);
  return entry[0];
};
const object = readRecord;
const tag = (value: unknown): string => {
  try { return readTag(value).$; }
  catch (cause) { throw new TypeError("missing canonical constructor", { cause }); }
};
const nat = (value: unknown, positive = false): number => positive ? readPositiveNat(value) : readNat(value);
const bytes = readBytes;
const bool = readBool;
const ruleOrderTag = (value: "before" | "equal" | "after"): string => {
  return `RulePolicy.${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
};
declare const probabilityWordsBrand: unique symbol;
export type ProbabilityWords = Readonly<{
  high: number; low: number; [probabilityWordsBrand]: true;
}>;
export const probabilityWords = (value: number): ProbabilityWords => {
  if (!Schema.is(Probability)(value)) {
    throw new RangeError("probability must be finite in [0, 1]");
  }
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, Object.is(value, -0) ? 0 : value, false);
  return { high: bytes.getUint32(0, false), low: bytes.getUint32(4, false) } as ProbabilityWords;
};
const encodedProbabilityWords = (value: typeof ProbabilityWordsSchema.Type): unknown =>
  ({ $: "RulePolicy.Words", high: value.high, low: value.low });
const list = (values: readonly number[]): unknown =>
  values.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
const readList = <T>(value: unknown, decode: (item: unknown) => T, limit = 2048): T[] =>
  readBendList(value, decode, limit);

const encodeFacts = (facts: ProspectiveFacts): unknown => {

  return { $: "Admission.ProspectiveFacts", clock_valid: facts.clockValid, hook_window: facts.hookWindow,
    started_upper: facts.startedUpper, now_lower: facts.nowLower,
    advicee_permit_limit: facts.adviceePermitLimit, resident_permit_limit: facts.residentPermitLimit };
};

const encodePurpose = (value: CapacityPurpose): unknown => {
  const names: Record<CapacityPurpose, string> = {
    observationDispatch: "Ledger.ObservationDispatch", preparation: "Ledger.Preparation",
    reviewUnit: "Ledger.ReviewUnit", storedResult: "Ledger.StoredResult",
    operationalNotice: "Ledger.OperationalNotice", adviceRecheck: "Ledger.AdviceRecheck",
  };
  const name = names[value];
  return { $: name };
};
const identity = (event: Extract<CanonicalEvent, { readonly partition: number; readonly lifetime: number }>) => ({ partition: event.partition, lifetime: event.lifetime });
const submissionSurface = (surface: "edit" | "background" | "stop"): unknown => {
  const name = { edit: "Handoff.Edit", background: "Handoff.Background", stop: "Handoff.Stop" }[surface];
  return { $: name };
};
const deliverySurface = (surface: "edit" | "background" | "stop"): unknown => {
  const name = { edit: "Delivery.Edit", background: "Delivery.Background", stop: "Delivery.Stop" }[surface];
  return { $: name };
};
const collectorReason = (reason: CollectorReason): unknown => {
  const name = { backend: "Backend", credential: "Credential", capacity: "Capacity",
    stale: "Stale", lost: "Lost", expired: "Expired" }[reason];
  return { $: `CollectorAuthority.${name}` };
};
const reuseMemberState = (state: ReuseMemberState): unknown => {
  const name = { pending: "JoinedPending", clear: "JoinedClear", finding: "JoinedFinding",
    unavailable: "JoinedUnavailable" }[state];
  return { $: `Reuse.${name}` };
};
const jevOutcomeTags: Record<JevRequestOutcome, string> = {
  neverSent: "NeverSent", finding: "RequestFinding", clear: "RequestClear",
  backendFailure: "RequestBackendFailure", timeout: "RequestTimeout",
  interrupted: "RequestInterrupted",
};
const encodeJevRequestOutcome = (outcome: JevRequestOutcome): unknown => {
  const name = jevOutcomeTags[outcome];
  return { $: `Canonical.${name}` };
};
const decodeJevRequestOutcome = (value: unknown): JevRequestOutcome => {
  const name = tag(value);
  const outcome = (Object.entries(jevOutcomeTags) as [JevRequestOutcome, string][])
    .find(([, variant]) => name === `Canonical.${variant}`)?.[0];
  if (outcome === undefined) throw new TypeError("invalid Jev request outcome");
  decodeCanonicalConstructor(value, name);
  return outcome;
};
const decodeEvent = decoder(CanonicalEventSchema);
export const encodeCanonicalEvent = (input: CanonicalEvent): unknown => {
  const event = decodeEvent(input);
  switch (event.kind) {
    case "reserveCapacity": return { $: "Canonical.ReserveCapacity", partition: event.partition, bytes: event.bytes, purpose: encodePurpose(event.purpose) };
    case "resizeCapacity": return { $: "Canonical.ResizeCapacity", reservation: event.reservation, bytes: event.bytes, purpose: encodePurpose(event.purpose) };
    case "releaseCapacity": return { $: "Canonical.ReleaseCapacity", reservation: event.reservation };
    case "replaceCapacity": return { $: "Canonical.ReplaceCapacity", reservation: event.reservation, unit_bytes: list(event.unitBytes) };
    case "issuePermit": return { $: "Canonical.IssuePermit", ...identity(event), tool: event.tool, started: event.started, deadline: event.deadline, now: event.now, minimum_started: event.minimumStarted, facts: encodeFacts(event.facts) };
    case "checkCompletedEdit": return { $: "Canonical.CheckCompletedEdit", tool: event.tool };
    case "rememberCompletedEdit": return { $: "Canonical.RememberCompletedEdit", tool: event.tool, reason: encodeCompletedEditReason(event.reason) };
    case "quietRoundTick":   return { $: "Canonical.QuietRoundTick", ...identity(event), round: event.round, now: event.now, window: event.window, facts: { $: "Quiescence.Facts", native_work_idle: event.facts.nativeWorkIdle, advice_empty: event.facts.adviceEmpty, handoff_idle: event.facts.handoffIdle, stop_absent: event.facts.stopAbsent } };
    case "quietRoundReset": return { $: "Canonical.QuietRoundReset", ...identity(event), round: event.round };
    case "consumePermit": return { $: "Canonical.ConsumePermit", ...identity(event), token: event.token, tool: event.tool, now: event.now };
    case "releasePermit": return { $: "Canonical.ReleasePermit", ...identity(event), token: event.token };
    case "expirePermit": return { $: "Canonical.ExpirePermit", ...identity(event), token: event.token, deadline_reached: event.deadlineReached };
    case "closePermitRound": return { $: "Canonical.ClosePermitRound", ...identity(event), round: event.round, at: event.at };
    case "forgetAdmission": return { $: "Canonical.ForgetAdmission", ...identity(event) };
    case "openRound": return { $: "Canonical.OpenRound", ...identity(event) };
    case "admitObservation": return { $: "Canonical.AdmitObservation", ...identity(event), round: event.round };
    case "startObservation": case "completeObservation": case "interruptObservation": {

      const name = { startObservation: "StartObservation", completeObservation: "CompleteObservation", interruptObservation: "InterruptObservation" }[event.kind];
      return { $: `Canonical.${name}`, ...identity(event), round: event.round, observation: event.observation };
    }
    case "beginPreparation": return { $: "Canonical.BeginPreparation", ...identity(event), round: event.round, bytes: event.bytes };
    case "beginObservedPreparation": return { $: "Canonical.BeginObservedPreparation", ...identity(event), round: event.round, observation: event.observation, bytes: event.bytes };
    case "interruptPreparation": return { $: "Canonical.InterruptPreparation", ...identity(event), round: event.round, operation: event.operation };
    case "preparationCompleted": return { $: "Canonical.PreparationCompleted", ...identity(event), round: event.round, operation: event.operation, unit_bytes: list(event.unitBytes) };
    case "startReview": case "retireReview": {

      return { $: event.kind === "startReview" ? "Canonical.StartReview" : "Canonical.RetireReview", ...identity(event), round: event.round, operation: event.operation };
    }
    case "jevRequestReady":

      return { $: "Canonical.JevRequestReady", ...identity(event), round: event.round, operation: event.operation, root_valid: event.rootValid, configuration_valid: event.configurationValid, credential_ready: event.credentialReady, selected: event.selected, current_work: event.currentWork, physical_available: event.physicalAvailable };
    case "jevRequestStarted": case "jevRequestInterrupted":

      return { $: event.kind === "jevRequestStarted" ? "Canonical.JevRequestStarted" : "Canonical.JevRequestInterrupted", ...identity(event), round: event.round, operation: event.operation, request: event.request };
    case "jevRequestSettled":

      return { $: "Canonical.JevRequestSettled", ...identity(event), round: event.round, operation: event.operation, request: event.request, outcome: encodeJevRequestOutcome(event.outcome), current_work: event.currentWork };
    case "reviewCompleted": {

      const outcome = { finding: "Canonical.Finding", clear: "Canonical.Clear", unavailable: "Canonical.Unavailable", interrupted: "Canonical.Interrupted", discarded: "Canonical.Discarded" }[event.outcome];
      return { $: "Canonical.ReviewCompleted", ...identity(event), round: event.round, operation: event.operation, outcome: { $: outcome } };
    }
    case "reviewObserved": {

      return { $: "Canonical.ReviewObserved", ...identity(event), round: event.round,
        operation: event.operation, outcome: { $: event.outcome === "finding" ? "Canonical.Finding" : "Canonical.Clear" },
        current_work: event.currentWork };
    }
    case "findingCountUpdated": return { $: "Canonical.FindingCountUpdated", ...identity(event), round: event.round, operation: event.operation, count: event.count };
    case "queueDispatch": case "dispatchSettled":

      return { $: event.kind === "queueDispatch" ? "Canonical.QueueDispatch" : "Canonical.DispatchSettled",
        ...identity(event), round: event.round, operation: event.operation };
    case "discardDispatch": return { $: "Canonical.DiscardDispatch", operations: list(event.operations) };
    case "dispatchScopeCheck": return { $: "Canonical.DispatchScopeCheck", named_count: event.namedCount, cancelled_count: event.cancelledCount, has_unnamed: event.hasUnnamed };
    case "closeDispatch": return { $: "Canonical.CloseDispatch" };
    case "preparedOfferCheck": return { $: "Canonical.PreparedOfferCheck", ready: event.ready, within_frame: event.withinFrame };
    case "emptyPreparedCheck": return { $: "Canonical.EmptyPreparedCheck", ready_count: event.readyCount, has_non_skipped: event.hasNonSkipped, authority_bound: event.authorityBound };
    case "reviewFailureCheck": return { $: "Canonical.ReviewFailureCheck", backend_or_timeout: event.backendOrTimeout, credential: event.credential, missing: event.missing };
    case "stopPolled": return { $: "Canonical.StopPolled", ...identity(event), round: event.round, deadline: event.deadline };
    case "stopGroupPolled": case "stopGroupEnded": {
      const polled = event.kind === "stopGroupPolled";

      const scopes = event.scopes.reduceRight<unknown>((tail, scope) => {

        return { $: "Con", head: { $: "Canonical.StopScope", partition: scope.partition, round: scope.round }, tail };
      }, { $: "Nil" });
      const common = { group: event.group, lifetime: event.lifetime, round: event.round, scopes };
      return polled ? { $: "Canonical.StopGroupPolled", ...common, deadline: event.deadline, extra_pending: event.extraPending, continuations: event.continuations }
        : { $: "Canonical.StopGroupEnded", ...common };
    }
    case "collectionReady": return { $: "Canonical.CollectionReady", advice: event.advice, partition: event.partition, lifetime: event.lifetime, round: event.round, observation: event.observation, joined_pending: event.joinedPending };
    case "collectionCredentialCheck": return { $: "Canonical.CollectionCredentialCheck", same_scope: event.sameScope, generation_valid: event.generationValid };
    case "collectionCandidateCheck": return { $: "Canonical.CollectionCandidateCheck", same_partition: event.samePartition, unleased: event.unleased, has_unsuppressed: event.hasUnsuppressed, authority_owns: event.authorityOwns };
    case "collectionOrderCheck": return { $: "Canonical.CollectionOrderCheck", left_sequence: event.leftSequence, right_sequence: event.rightSequence };
    case "collectionExpiryCheck": return { $: "Canonical.CollectionExpiryCheck", elapsed: event.elapsed, lifetime: event.lifetime };
    case "collectionFitCheck": return { $: "Canonical.CollectionFitCheck", items: event.items, bytes: event.bytes };
    case "collectionFindingCheck": return { $: "Canonical.CollectionFindingCheck", selection_partition: event.selectionPartition, selection_round: event.selectionRound, unit: event.unit, partition: event.partition, round: event.round, snapshot: event.snapshot, current_snapshot: event.currentSnapshot, credential: event.credential, current_credential: event.currentCredential, age_ms: event.ageMs, solo_bytes: event.soloBytes, collection_ready: event.collectionReady, selected_count: event.selectedCount, prospective_bytes: event.prospectiveBytes };
    case "collectionNoticeCheck": return { $: "Canonical.CollectionNoticeCheck", items: event.items, bytes: event.bytes, skip_unfitting: event.skipUnfitting };
    case "collectionReserveLease": case "collectionReleaseLease": return { $: event.kind === "collectionReserveLease" ? "Canonical.CollectionReserveLease" : "Canonical.CollectionReleaseLease", advice: event.advice, token: event.token };
    case "collectionLeaseCheck": return { $: "Canonical.CollectionLeaseCheck", advice: event.advice, token: event.token, expired: event.expired, stop_collector: event.stopCollector, same_group: event.sameGroup, reofferable: event.reofferable };
    case "collectionRetireAdvice": return { $: "Canonical.CollectionRetireAdvice", advice: event.advice };
    case "collectionClaimBackground": return { $: "Canonical.CollectionClaimBackground", group: event.group, token: event.token, active: event.active, capacity: event.capacity };
    case "collectionReleaseBackground": return { $: "Canonical.CollectionReleaseBackground", group: event.group, token: event.token };
    case "collectionExpireBackground": return { $: "Canonical.CollectionExpireBackground", group: event.group, token: event.token, elapsed: event.elapsed, lifetime: event.lifetime };
    case "finishReserve": return { $: "Canonical.FinishReserve", group: event.group, lifetime: event.lifetime, round: event.round, attempt: event.attempt, token: event.token, selected: list(event.selected), has_notice: event.hasNotice, pass_notices: event.passNotices, can_write: event.canWrite, binding_valid: event.bindingValid, deadline_reached: event.deadlineReached };
    case "finishRelease": return { $: "Canonical.FinishRelease", group: event.group, round: event.round, attempt: event.attempt, token: event.token };
    case "finishAuthorize": return { $: "Canonical.FinishAuthorize", group: event.group, round: event.round, attempt: event.attempt, token: event.token, selected: list(event.selected) };
    case "finishTerminal": {

      const outcome = { acknowledged: "Canonical.Acknowledged", failed: "Canonical.Failed", unknown: "Canonical.Unknown" }[event.outcome];
      return { $: "Canonical.FinishTerminal", group: event.group, round: event.round, attempt: event.attempt, token: event.token, selected: list(event.selected), outcome: { $: outcome } };
    }
    case "finishEnd": return { $: "Canonical.FinishEnd", group: event.group, round: event.round, attempt: event.attempt, token: event.token };
    case "continuationConsume": return { $: "Canonical.ContinuationConsume", group: event.group, round: event.round };
    case "submissionBegin": return { $: "Canonical.SubmissionBegin", advice: event.advice, group: event.group, round: event.round, token: event.token, surface: submissionSurface(event.surface), authorize_now: event.authorizeNow, fingerprints: list(event.fingerprints), units: list(event.units) };
    case "submissionAuthorize": case "submissionRelease": case "submissionReofferCheck": return { $: `Canonical.${event.kind.slice(0, 1).toUpperCase()}${event.kind.slice(1)}`, advice: event.advice, token: event.token };
    case "submissionTerminal": return { $: "Canonical.SubmissionTerminal", advice: event.advice, token: event.token, certain: event.certain };
    case "submissionForget": return { $: "Canonical.SubmissionForget", advice: event.advice };
    case "submissionSuppressCheck": return { $: "Canonical.SubmissionSuppressCheck", advice: event.advice, fingerprint: event.fingerprint, round: event.round, surface: submissionSurface(event.surface) };
    case "submissionExpiryCheck": return { $: "Canonical.SubmissionExpiryCheck", advice: event.advice, token: event.token, elapsed: event.elapsed, lifetime: event.lifetime };
    case "revisionRegister": return { $: "Canonical.RevisionRegister", subject: event.subject, input: event.input, add_member: event.addMember };
    case "revisionRelease": return { $: "Canonical.RevisionRelease", subject: event.subject, generation: event.generation };
    case "revisionSupersededCheck": return { $: "Canonical.RevisionSupersededCheck", subject: event.subject, candidate_subject: event.candidateSubject, generation: event.generation };
    case "revisionCurrentCheck": return { $: "Canonical.RevisionCurrentCheck", subject: event.subject, input: event.input, generation: event.generation };
    case "revisionGenerationCheck": return { $: "Canonical.RevisionGenerationCheck", subject: event.subject };
    case "revisionCountCheck": return { $: "Canonical.RevisionCountCheck" };
    case "collectorGateCheck": return { $: "Canonical.CollectorGateCheck", expired: event.expired, credential_valid: event.credentialValid };
    case "collectorFinalAuthorityCheck": return { $: "Canonical.CollectorFinalAuthorityCheck", admitted_block: event.admittedBlock, current_block: event.currentBlock };
    case "reuseMemberCheck": return { $: "Canonical.ReuseMemberCheck", joined_state: reuseMemberState(event.state), stale_unavailable: event.staleUnavailable, has_revision: event.hasRevision, has_advice_id: event.hasAdviceId };
    case "cleanupCheck": {

      const facts = event.facts;

      return { $: "Canonical.CleanupCheck", facts: { $: "Retention.CleanupFacts", active: facts.active, dispatcher_idle: facts.dispatcherIdle, no_advice: facts.noAdvice, no_notices: facts.noNotices, no_pending_evaluations: facts.noPendingEvaluations, no_current_work: facts.noCurrentWork, no_cooldowns: facts.noCooldowns, connection_count_ok: facts.connectionCountOk, cache_matches_ledger: facts.cacheMatchesLedger } };
    }
    case "cleanupCommit": return { $: "Canonical.CleanupCommit" };
    case "deliveryReleaseCheck": return { $: "Canonical.DeliveryReleaseCheck", acknowledged: event.acknowledged };
    case "deliveryAcknowledgeCheck": return { $: "Canonical.DeliveryAcknowledgeCheck", items: event.items, any_expired: event.anyExpired };
    case "deliveryFinalizeCheck": return { $: "Canonical.DeliveryFinalizeCheck", items: event.items, all_acknowledged: event.allAcknowledged, any_expired: event.anyExpired };
    case "deliveryFindingDispositionCheck": return { $: "Canonical.DeliveryFindingDispositionCheck", composed: event.composed, remaining: event.remaining };
    case "deliverySubmissionCandidateCheck": {

      const facts = event.facts;

      return { $: "Canonical.DeliverySubmissionCandidateCheck", facts: { $: "Delivery.SubmissionFacts",
        round_active: facts.roundActive, has_round: facts.hasRound,
        has_unit: facts.hasUnit, has_delivery: facts.hasDelivery,
        pending_capacity: facts.pendingCapacity, submission_allowed: facts.submissionAllowed,
        current_work: facts.currentWork, credential_authorized: facts.credentialAuthorized } };
    }
    case "deliverySubmissionBatchCheck": return { $: "Canonical.DeliverySubmissionBatchCheck", count: event.count, all_valid: event.allValid };
    case "deliveryCredentialObserveCheck": return { $: "Canonical.DeliveryCredentialObserveCheck", invalid_seen: event.invalidSeen, generation_valid: event.generationValid, authorized: event.authorized };
    case "deliveryFinalCredentialCheck": return { $: "Canonical.DeliveryFinalCredentialCheck", shared_collect: event.sharedCollect, invalid_seen: event.invalidSeen };
    case "validationRouteCheck": {
      return { $: "Canonical.ValidationRouteCheck", owner_current: event.ownerCurrent,
        status: { $: `Handoff.${event.status.slice(0, 1).toUpperCase()}${event.status.slice(1)}` } };
    }
    case "postValidationCheck": return { $: "Canonical.PostValidationCheck", work_accepted: event.workAccepted, expired: event.expired, has_fitting: event.hasFitting };
    case "finalCandidateCheck": return { $: "Canonical.FinalCandidateCheck", owner_current: event.ownerCurrent, credential_generation: event.credentialGeneration, credential_authorized: event.credentialAuthorized, expired: event.expired, work_current: event.workCurrent, has_findings: event.hasFindings };
    case "roundBeginStopCheck": return { $: "Canonical.RoundBeginStopCheck", active: event.active, has_stop: event.hasStop, token: event.token };
    case "roundActivityCheck": return { $: "Canonical.RoundActivityCheck", bound: event.bound, has_admission: event.hasAdmission, round: event.round, active: event.active, closed_at: event.closedAt, expected_generation: event.expectedGeneration };
    case "roundBarrierCheck": return { $: "Canonical.RoundBarrierCheck", has_stop: event.hasStop, used_at_start: event.usedAtStart, used_now: event.usedNow };
    case "roundOwnsStopCheck": return { $: "Canonical.RoundOwnsStopCheck", active: event.active, token_matches: event.tokenMatches, deciding: event.deciding };
    case "roundStopTerminalCheck": return { $: "Canonical.RoundStopTerminalCheck", has_output: event.hasOutput, authorized: event.authorized, requested_close: event.requestedClose };
    case "roundExpireCloseCheck": return { $: "Canonical.RoundExpireCloseCheck", barrier: event.barrier, authorized_output: event.authorizedOutput };
    case "roundContinuationBudgetCheck": return { $: "Canonical.RoundContinuationBudgetCheck", active: event.active, count: event.count };
    case "deliverySubmissionAllowedCheck": return { $: "Canonical.DeliverySubmissionAllowedCheck", active: event.active, barrier: event.barrier, deciding: event.deciding, surface: deliverySurface(event.surface), existing_token: event.existingToken, finish_permit: event.finishPermit };
    case "deliveryExistingTokenCheck": return { $: "Canonical.DeliveryExistingTokenCheck", surface: deliverySurface(event.surface), existing_token: event.existingToken, finish_permit: event.finishPermit };
    case "deliveryUnreservedStopCheck": return { $: "Canonical.DeliveryUnreservedStopCheck", active: event.active, deciding: event.deciding };
    case "includeLayerCheck": return { $: "Canonical.IncludeLayerCheck", supplied: event.supplied, current_rank: event.currentRank, candidate_rank: event.candidateRank };
    case "fileSelectionCheck": return { $: "Canonical.FileSelectionCheck", protected: event.protected, excluded: event.excluded, includes_empty: event.includesEmpty, included: event.included };
    case "fileProtectionInvalid": return { $: "Canonical.FileProtectionInvalid" };
    case "fileProtectionCheck": return { $: "Canonical.FileProtectionCheck", sensitive_name: event.sensitiveName, generated_or_vendor: event.generatedOrVendor, allowed_extension: event.allowedExtension };
    case "candidateFileCheck": return { $: "Canonical.CandidateFileCheck", git_admin: event.gitAdmin, physical_safe: event.physicalSafe, git_allowed: event.gitAllowed };
    case "reviewAdmissionCheck": return { $: "Canonical.ReviewAdmissionCheck", root_valid: event.rootValid, configuration_valid: event.configurationValid, credential_ready: event.credentialReady, selected: event.selected };
    case "ruleEnableCheck": return { $: "Canonical.RuleEnableCheck", pack_enabled: event.packEnabled, rule_enabled: event.ruleEnabled };
    case "ruleApplicabilityCheck": {
      return { $: "Canonical.RuleApplicabilityCheck", consent: event.consent, complete: event.complete, target: { $: `RulePolicy.${event.target.slice(0, 1).toUpperCase()}${event.target.slice(1)}` }, global_included: event.globalIncluded, global_excluded: event.globalExcluded, pack_enabled: event.packEnabled, rule_enabled: event.ruleEnabled, rule_included: event.ruleIncluded, rule_excluded: event.ruleExcluded, target_declared: event.targetDeclared, capabilities_available: event.capabilitiesAvailable, source_rung: event.sourceRung, minimum_rung: event.minimumRung };
    }
    case "ruleFindingCheck": return { $: "Canonical.RuleFindingCheck", probability: encodedProbabilityWords(event.probability), threshold: encodedProbabilityWords(event.threshold) };
    case "ruleRankOrderCheck": return { $: "Canonical.RuleRankOrderCheck", left: encodedProbabilityWords(event.left), right: encodedProbabilityWords(event.right), left_rank: event.leftRank, right_rank: event.rightRank };
    case "adviceOrderCheck": return { $: "Canonical.AdviceOrderCheck", left: encodedProbabilityWords(event.left), right: encodedProbabilityWords(event.right), path_order: { $: ruleOrderTag(event.pathOrder) }, id_order: { $: ruleOrderTag(event.idOrder) } };
    case "ruleBudgetCheck": return { $: "Canonical.RuleBudgetCheck", position: event.position, limit: event.limit };
    case "reuseRoute": return { $: "Canonical.ReuseRoute", id: event.id, live_advice: event.liveAdvice };
    case "reuseClaim": case "reuseAttach": case "reuseRelease": case "reuseTouch": return { $: `Canonical.${event.kind.slice(0, 1).toUpperCase()}${event.kind.slice(1)}`, id: event.id };
    case "cachePrepare": return { $: "Canonical.CachePrepare", id: event.id, bytes: event.bytes, entry_limit: event.entryLimit, byte_limit: event.byteLimit };
    case "cacheCommit": return { $: "Canonical.CacheCommit", id: event.id, partition: event.partition, bytes: event.bytes, reservation: event.reservation, entry_limit: event.entryLimit, byte_limit: event.byteLimit };
    case "cacheDiscardPartition": return { $: "Canonical.CacheDiscardPartition", partition: event.partition };
    case "cacheClear": return { $: "Canonical.CacheClear" };
    case "noticeAdvance": {

      return { $: "Canonical.NoticeAdvance", key: event.key, remaining: event.remaining === undefined ? { $: "None" } : { $: "Some", value: event.remaining }, maximum_keys: event.maximumKeys, proposed: event.proposed, sequence: event.sequence, max_count: event.maxCount };
    }
    case "noticeCommit": return { $: "Canonical.NoticeCommit", key: event.key, partition: event.partition, group: event.group, reservation: event.reservation, pending: event.pending, sequence: event.sequence, maximum_keys: event.maximumKeys };
    case "noticePrune": return { $: "Canonical.NoticePrune", key: event.key, lease_expired: event.leaseExpired, pending_expired: event.pendingExpired, excepted: event.excepted, cooldown_expired: event.cooldownExpired };
    case "noticeDrop": case "noticeClearPending": return { $: `Canonical.${event.kind.slice(0, 1).toUpperCase()}${event.kind.slice(1)}`, key: event.key };
    case "noticeLease": return { $: "Canonical.NoticeLease", key: event.key, leased: event.leased };
    case "noticeSelect": return { $: "Canonical.NoticeSelect", partition: event.partition, group: event.group, composed: event.composed, authority_bound: event.authorityBound, allowed: list(event.allowed) };
    case "outputStarted": return { $: "Canonical.OutputStarted", ...identity(event), round: event.round };
    case "outputTerminal": {

      const outcome = { acknowledged: "Canonical.Acknowledged", failed: "Canonical.Failed", unknown: "Canonical.Unknown" }[event.outcome];
      return { $: "Canonical.OutputTerminal", ...identity(event), round: event.round, operation: event.operation, outcome: { $: outcome } };
    }
    case "retirePartition": return { $: "Canonical.RetirePartition", ...identity(event), round: event.round };
    default: throw new TypeError("unknown canonical event");
  }
};
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
  const reasons: Record<string, CollectorReason> = { "CollectorAuthority.Backend": "backend",
    "CollectorAuthority.Credential": "credential", "CollectorAuthority.Capacity": "capacity",
    "CollectorAuthority.Stale": "stale", "CollectorAuthority.Lost": "lost", "CollectorAuthority.Expired": "expired" };
  const reason = reasons[name];
  if (reason === undefined) throw new TypeError("unknown collector reason");
  decodeCanonicalConstructor(value, name);
  return reason;
};




const purpose = (value: unknown): CapacityPurpose => {
  const names: Record<string, CapacityPurpose> = {
    "Ledger.ObservationDispatch": "observationDispatch", "Ledger.Preparation": "preparation",
    "Ledger.ReviewUnit": "reviewUnit", "Ledger.StoredResult": "storedResult",
    "Ledger.OperationalNotice": "operationalNotice", "Ledger.AdviceRecheck": "adviceRecheck",
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
  decodeCanonicalConstructor(value, tag(value));
  return reason;
};
const decodeCommand = (value: unknown): CanonicalCommand => {
  switch (tag(value)) {
    case "Canonical.CapacityGranted": { const x = decodeCanonicalConstructor(value, "Canonical.CapacityGranted"); return { kind: "capacityGranted", id: nat(x.id, true), after: capacityView(x.after) }; }
    case "Canonical.CapacityRefused": { const x = decodeCanonicalConstructor(value, "Canonical.CapacityRefused"); return { kind: "capacityRefused", reason: capacityRefusal(x.reason), after: capacityView(x.after) }; }
    case "Canonical.CapacityResized": { const x = decodeCanonicalConstructor(value, "Canonical.CapacityResized"); return { kind: "capacityResized", id: nat(x.id, true), after: capacityView(x.after) }; }
    case "Canonical.CapacityUnitAdmitted": { const x = decodeCanonicalConstructor(value, "Canonical.CapacityUnitAdmitted"); return { kind: "capacityUnitAdmitted", reservation: nat(x.reservation, true), position: nat(x.position, true), bytes: bytes(x.bytes), after: capacityView(x.after) }; }
    case "Canonical.CapacityUnitRefused": { const x = decodeCanonicalConstructor(value, "Canonical.CapacityUnitRefused"); return { kind: "capacityUnitRefused", position: nat(x.position, true), bytes: bytes(x.bytes), reason: capacityRefusal(x.reason), after: capacityView(x.after) }; }
    case "Canonical.PermitIssued": { const x = decodeCanonicalConstructor(value, "Canonical.PermitIssued"); return { kind: "permitIssued", token: nat(x.token, true), round: nat(x.round, true) }; }
    case "Canonical.CompletedEditAbsent": decodeCanonicalConstructor(value, "Canonical.CompletedEditAbsent"); return { kind: "completedEditAbsent" };
    case "Canonical.CompletedEditSeen": { const x = decodeCanonicalConstructor(value, "Canonical.CompletedEditSeen"); return { kind: "completedEditSeen", reason: decodeCompletedEditReason(x.reason), report: bool(x.report) }; }
    case "Canonical.CompletedEditRemembered": { const x = decodeCanonicalConstructor(value, "Canonical.CompletedEditRemembered"); const evicted = tag(x.evicted) === "Some" ? nat(decodeCanonicalConstructor(x.evicted, "Some").value, true) : undefined; if (evicted === undefined) decodeCanonicalConstructor(x.evicted, "None"); return { kind: "completedEditRemembered", ...(evicted === undefined ? {} : { evicted }) }; }
    case "Canonical.QuietRoundBusy": decodeCanonicalConstructor(value, "Canonical.QuietRoundBusy"); return { kind: "quietRoundBusy" };
    case "Canonical.QuietRoundResetRecorded": decodeCanonicalConstructor(value, "Canonical.QuietRoundResetRecorded"); return { kind: "quietRoundResetRecorded" };
    case "Canonical.QuietRoundWaiting": return { kind: "quietRoundWaiting", since: nat(decodeCanonicalConstructor(value, "Canonical.QuietRoundWaiting").since) };
    case "Canonical.QuietRoundExpired": return { kind: "quietRoundExpired", since: nat(decodeCanonicalConstructor(value, "Canonical.QuietRoundExpired").since) };
    case "Canonical.PermitConsumed": return { kind: "permitConsumed", round: nat(decodeCanonicalConstructor(value, "Canonical.PermitConsumed").round, true) };
    case "Canonical.PermitReleased": decodeCanonicalConstructor(value, "Canonical.PermitReleased"); return { kind: "permitReleased" };
    case "Canonical.PermitExpired": decodeCanonicalConstructor(value, "Canonical.PermitExpired"); return { kind: "permitExpired" };
    case "Canonical.PermitKept": decodeCanonicalConstructor(value, "Canonical.PermitKept"); return { kind: "permitKept" };
    case "Canonical.PermitRoundClosed": return { kind: "permitRoundClosed", round: nat(decodeCanonicalConstructor(value, "Canonical.PermitRoundClosed").round, true) };
    case "Canonical.RoundStarted": return { kind: "roundStarted", id: nat(decodeCanonicalConstructor(value, "Canonical.RoundStarted").id, true) };
    case "Canonical.ObservationAdmitted": return { kind: "observationAdmitted", id: nat(decodeCanonicalConstructor(value, "Canonical.ObservationAdmitted").id, true) };
    case "Canonical.ObservationStarted": decodeCanonicalConstructor(value, "Canonical.ObservationStarted"); return { kind: "observationStarted" };
    case "Canonical.ObservationCompleted": decodeCanonicalConstructor(value, "Canonical.ObservationCompleted"); return { kind: "observationCompleted" };
    case "Canonical.ObservationInterrupted": decodeCanonicalConstructor(value, "Canonical.ObservationInterrupted"); return { kind: "observationInterrupted" };
    case "Canonical.Prepare": { const x = decodeCanonicalConstructor(value, "Canonical.Prepare"); return { kind: "prepare", operation: nat(x.operation, true), reservation: nat(x.reservation, true) }; }
    case "Canonical.PreparationRefused": decodeCanonicalConstructor(value, "Canonical.PreparationRefused"); return { kind: "preparationRefused" };
    case "Canonical.UnitAdmitted": { const x = decodeCanonicalConstructor(value, "Canonical.UnitAdmitted"); return { kind: "unitAdmitted", operation: nat(x.operation, true), reservation: nat(x.reservation, true), position: nat(x.position, true), bytes: bytes(x.bytes), after: capacityView(x.after) }; }
    case "Canonical.UnitRefused": { const x = decodeCanonicalConstructor(value, "Canonical.UnitRefused"); return { kind: "unitRefused", position: nat(x.position, true), bytes: bytes(x.bytes), reason: capacityRefusal(x.reason), after: capacityView(x.after) }; }
    case "Canonical.PreparationReleased": { const x = decodeCanonicalConstructor(value, "Canonical.PreparationReleased"); return { kind: "preparationReleased", id: nat(x.id, true), after: capacityView(x.after) }; }
    case "Canonical.ReviewStarted": decodeCanonicalConstructor(value, "Canonical.ReviewStarted"); return { kind: "reviewStarted" };
    case "Canonical.JevRequestIssued": { const x = decodeCanonicalConstructor(value, "Canonical.JevRequestIssued"); return { kind: "jevRequestIssued", partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), round: nat(x.round, true), operation: nat(x.operation, true), request: nat(x.request, true) }; }
    case "Canonical.JevRequestUnavailable": decodeCanonicalConstructor(value, "Canonical.JevRequestUnavailable"); return { kind: "jevRequestUnavailable" };
    case "Canonical.JevRequestStartRecorded": decodeCanonicalConstructor(value, "Canonical.JevRequestStartRecorded"); return { kind: "jevRequestStartRecorded" };
    case "Canonical.JevInterruptionRecorded": decodeCanonicalConstructor(value, "Canonical.JevInterruptionRecorded"); return { kind: "jevInterruptionRecorded" };
    case "Canonical.JevObservationIgnored": decodeCanonicalConstructor(value, "Canonical.JevObservationIgnored"); return { kind: "jevObservationIgnored" };
    case "Canonical.JevRequestOutcomeRecorded": return { kind: "jevRequestOutcomeRecorded", outcome: decodeJevRequestOutcome(decodeCanonicalConstructor(value, "Canonical.JevRequestOutcomeRecorded").outcome) };
    case "Canonical.ReservationReleased": return { kind: "reservationReleased", id: nat(decodeCanonicalConstructor(value, "Canonical.ReservationReleased").id, true) };
    case "Canonical.ReviewRecorded": return { kind: "reviewRecorded", outcome: outcome(decodeCanonicalConstructor(value, "Canonical.ReviewRecorded").outcome) };
    case "Canonical.RetainFinding": decodeCanonicalConstructor(value, "Canonical.RetainFinding"); return { kind: "retainFinding" };
    case "Canonical.FindingCountRecorded": decodeCanonicalConstructor(value, "Canonical.FindingCountRecorded"); return { kind: "findingCountRecorded" };
    case "Canonical.SettleClear": decodeCanonicalConstructor(value, "Canonical.SettleClear"); return { kind: "settleClear" };
    case "Canonical.SettleStaleClear": decodeCanonicalConstructor(value, "Canonical.SettleStaleClear"); return { kind: "settleStaleClear" };
    case "Canonical.RetireStaleFinding": decodeCanonicalConstructor(value, "Canonical.RetireStaleFinding"); return { kind: "retireStaleFinding" };
    case "Canonical.PreparedSkipped": decodeCanonicalConstructor(value, "Canonical.PreparedSkipped"); return { kind: "preparedSkipped" };
    case "Canonical.PreparedAdmitted": decodeCanonicalConstructor(value, "Canonical.PreparedAdmitted"); return { kind: "preparedAdmitted" };
    case "Canonical.PreparedCapacityRefused": decodeCanonicalConstructor(value, "Canonical.PreparedCapacityRefused"); return { kind: "preparedCapacityRefused" };
    case "Canonical.EmptyLost": decodeCanonicalConstructor(value, "Canonical.EmptyLost"); return { kind: "emptyLost" };
    case "Canonical.EmptyAccepted": decodeCanonicalConstructor(value, "Canonical.EmptyAccepted"); return { kind: "emptyAccepted" };
    case "Canonical.FailureBackend": decodeCanonicalConstructor(value, "Canonical.FailureBackend"); return { kind: "failureBackend" };
    case "Canonical.FailureCredential": decodeCanonicalConstructor(value, "Canonical.FailureCredential"); return { kind: "failureCredential" };
    case "Canonical.FailureLost": decodeCanonicalConstructor(value, "Canonical.FailureLost"); return { kind: "failureLost" };
    case "Canonical.FailureNone": decodeCanonicalConstructor(value, "Canonical.FailureNone"); return { kind: "failureNone" };
    case "Canonical.DispatchStarted": { const x = decodeCanonicalConstructor(value, "Canonical.DispatchStarted"); return { kind: "dispatchStarted", operation: nat(x.operation, true), sequence: nat(x.sequence) }; }
    case "Canonical.DispatchDiscarded": { const x = decodeCanonicalConstructor(value, "Canonical.DispatchDiscarded"); return { kind: "dispatchDiscarded", operation: nat(x.operation, true), running: bool(x.running) }; }
    case "Canonical.DiscardNamedOnly": decodeCanonicalConstructor(value, "Canonical.DiscardNamedOnly"); return { kind: "discardNamedOnly" };
    case "Canonical.DiscardAllUnfinished": decodeCanonicalConstructor(value, "Canonical.DiscardAllUnfinished"); return { kind: "discardAllUnfinished" };
    case "Canonical.WaitForWork": decodeCanonicalConstructor(value, "Canonical.WaitForWork"); return { kind: "waitForWork" };
    case "Canonical.CancelWork": return { kind: "cancelWork", operation: nat(decodeCanonicalConstructor(value, "Canonical.CancelWork").operation, true) };
    case "Canonical.FinishReady": decodeCanonicalConstructor(value, "Canonical.FinishReady"); return { kind: "finishReady" };
    case "Canonical.FinishLimit": decodeCanonicalConstructor(value, "Canonical.FinishLimit"); return { kind: "finishLimit" };
    case "Canonical.StopEnded": decodeCanonicalConstructor(value, "Canonical.StopEnded"); return { kind: "stopEnded" };
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
      decodeCanonicalConstructor(value, name);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Extract<CanonicalCommand, { kind: `collection${string}` }>["kind"] };
    }
    case "Canonical.FinishReserved": case "Canonical.FinishNotices":
    case "Canonical.FinishAllowedNoAdvice": case "Canonical.FinishAllowedDeadline":
    case "Canonical.FinishAllowedUnavailable": case "Canonical.FinishRefused":
    case "Canonical.FinishReleased": case "Canonical.FinishAuthorized":
    case "Canonical.FinishEnded": case "Canonical.ContinuationConsumed":
    case "Canonical.ContinuationRefused": {
      const name = tag(value);
      decodeCanonicalConstructor(value, name);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as
        "finishReserved" | "finishNotices" | "finishAllowedNoAdvice" | "finishAllowedDeadline" |
        "finishAllowedUnavailable" | "finishRefused" | "finishReleased" | "finishAuthorized" |
        "finishEnded" | "continuationConsumed" | "continuationRefused" };
    }
    case "Canonical.FinishRecorded": return { kind: "finishRecorded", outcome: writeOutcome(decodeCanonicalConstructor(value, "Canonical.FinishRecorded").outcome) };
    case "Canonical.SubmissionBegun": case "Canonical.SubmissionAuthorized":
    case "Canonical.SubmissionRecorded": case "Canonical.SubmissionReleased":
    case "Canonical.SubmissionRefused": case "Canonical.SubmissionForgotten":
    case "Canonical.SubmissionSuppresses": case "Canonical.SubmissionUnsuppressed":
    case "Canonical.SubmissionReofferable": case "Canonical.SubmissionNotReofferable":
    case "Canonical.SubmissionExpired": case "Canonical.SubmissionCurrent": {
      const name = tag(value);
      decodeCanonicalConstructor(value, name);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Extract<CanonicalCommand, { kind: `submission${string}` }>["kind"] };
    }
    case "Canonical.RevisionReused": case "Canonical.RevisionReplaced": case "Canonical.RevisionGeneration": {
      const name = tag(value); return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "revisionReused" | "revisionReplaced" | "revisionGeneration", generation: nat(decodeCanonicalConstructor(value, name).generation) };
    }
    case "Canonical.RevisionCount": return { kind: "revisionCount", count: nat(decodeCanonicalConstructor(value, "Canonical.RevisionCount").count) };
    case "Canonical.RevisionReleased": case "Canonical.RevisionCurrent": case "Canonical.RevisionStale":
    case "Canonical.RevisionSuperseded": case "Canonical.RevisionNotSuperseded": {
      const name = tag(value); decodeCanonicalConstructor(value, name);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "revisionReleased" | "revisionCurrent" | "revisionStale" | "revisionSuperseded" | "revisionNotSuperseded" };
    }
    case "Canonical.CollectorUnavailable":
      return { kind: "collectorUnavailable", reason: decodeCollectorReason(decodeCanonicalConstructor(value, "Canonical.CollectorUnavailable").reason) };
    case "Canonical.CleanupReady": case "Canonical.CleanupBusy": case "Canonical.CleanupCommitted":
    case "Canonical.DeliveryReleaseUnacknowledged": case "Canonical.DeliveryKeepAcknowledged":
    case "Canonical.DeliveryAckReady": case "Canonical.DeliveryAckExpired": case "Canonical.DeliveryAckEmpty":
    case "Canonical.DeliveryFinalReady": case "Canonical.DeliveryFinalExpired": case "Canonical.DeliveryFinalEmpty":
    case "Canonical.DeliveryRetireAdvice": case "Canonical.DeliveryKeepRemaining": case "Canonical.DeliveryKeepForReoffer": {
      const name = tag(value); decodeCanonicalConstructor(value, name);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "cleanupReady" | "cleanupBusy" | "cleanupCommitted" | "deliveryReleaseUnacknowledged" | "deliveryKeepAcknowledged" | "deliveryAckReady" | "deliveryAckExpired" | "deliveryAckEmpty" | "deliveryFinalReady" | "deliveryFinalExpired" | "deliveryFinalEmpty" | "deliveryRetireAdvice" | "deliveryKeepRemaining" | "deliveryKeepForReoffer" };
    }
    case "Canonical.DeliverySubmissionCandidate": case "Canonical.DeliverySubmissionRefused":
    case "Canonical.DeliveryBatchProceed": case "Canonical.DeliveryBatchRelease":
    case "Canonical.DeliveryCredentialInvalid": case "Canonical.DeliveryCredentialValid": {
      const name = tag(value); decodeCanonicalConstructor(value, name);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "deliverySubmissionCandidate" | "deliverySubmissionRefused" | "deliveryBatchProceed" | "deliveryBatchRelease" | "deliveryCredentialInvalid" | "deliveryCredentialValid" };
    }
    case "Canonical.IgnoreCandidate": case "Canonical.ReleaseCandidate": case "Canonical.RetireCandidate":
    case "Canonical.ContinueCandidate": case "Canonical.RetainCandidate": {
      const name = tag(value); decodeCanonicalConstructor(value, name);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "ignoreCandidate" | "releaseCandidate" | "retireCandidate" | "continueCandidate" | "retainCandidate" };
    }
    case "Canonical.RoundStopBegun": case "Canonical.RoundStopRefused":
    case "Canonical.RoundActive": case "Canonical.RoundInactive":
    case "Canonical.RoundBarrierRaised": case "Canonical.RoundBarrierClear":
    case "Canonical.RoundStopOwned": case "Canonical.RoundStopNotOwned":
    case "Canonical.RoundExpireCloses": case "Canonical.RoundExpireKeeps":
    case "Canonical.RoundContinuationAvailable": case "Canonical.RoundContinuationExhausted":
    case "Canonical.DeliverySubmissionAllowed": case "Canonical.DeliverySubmissionDenied":
    case "Canonical.DeliveryExistingTokenAllowed": case "Canonical.DeliveryExistingTokenDenied":
    case "Canonical.DeliveryUnreservedStopAllowed": case "Canonical.DeliveryUnreservedStopDenied": {
      const name = tag(value); decodeCanonicalConstructor(value, name);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "roundStopBegun" | "roundStopRefused" | "roundActive" | "roundInactive" | "roundBarrierRaised" | "roundBarrierClear" | "roundStopOwned" | "roundStopNotOwned" | "roundExpireCloses" | "roundExpireKeeps" | "roundContinuationAvailable" | "roundContinuationExhausted" | "deliverySubmissionAllowed" | "deliverySubmissionDenied" | "deliveryExistingTokenAllowed" | "deliveryExistingTokenDenied" | "deliveryUnreservedStopAllowed" | "deliveryUnreservedStopDenied" };
    }
    case "Canonical.RoundStopTerminal": {
      const command = decodeCanonicalConstructor(value, "Canonical.RoundStopTerminal");
      return { kind: "roundStopTerminal", revokeProvisional: bool(command.revoke_provisional), close: bool(command.close) };
    }
    case "Canonical.NoticeSuppressed": case "Canonical.NoticeCreatePending": case "Canonical.NoticeMergePending": {
      const name = tag(value); return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "noticeSuppressed" | "noticeCreatePending" | "noticeMergePending", count: nat(decodeCanonicalConstructor(value, name).count) };
    }
    case "Canonical.NoticePruned": {
      const item = decodeCanonicalConstructor(value, "Canonical.NoticePruned");
      return { kind: "noticePruned", dropLease: bool(item.drop_lease), dropPending: bool(item.drop_pending), dropKey: bool(item.drop_key) };
    }
    case "Canonical.NoticeSelected": return { kind: "noticeSelected", ids: readList(decodeCanonicalConstructor(value, "Canonical.NoticeSelected").ids, (id) => nat(id, true)) };
    case "Canonical.IncludeChoice": {
      const choice = decodeCanonicalConstructor(value, "Canonical.IncludeChoice").choice;
      const name = tag(choice);
      if (name !== "Configuration.ReplaceIncludes" && name !== "Configuration.KeepIncludes") throw new TypeError("invalid include choice");
      decodeCanonicalConstructor(choice, name);
      return { kind: "includeChoice", choice: name === "Configuration.ReplaceIncludes" ? "replaceIncludes" : "keepIncludes" };
    }
    case "Canonical.FileSelection": {
      const selection = decodeCanonicalConstructor(value, "Canonical.FileSelection").selection;
      const names = ["Protected", "Excluded", "EmptyIncludes", "NotIncluded", "Selected"];
      const name = tag(selection);
      if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid file selection");
      decodeCanonicalConstructor(selection, name);
      return { kind: "fileSelection", selection: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as "protected" | "excluded" | "emptyIncludes" | "notIncluded" | "selected" };
    }
    case "Canonical.FileProtection": {
      const protection = decodeCanonicalConstructor(value, "Canonical.FileProtection").protection;
      const names = ["AllowedPath", "RepositoryBoundary", "SensitivePath", "GeneratedOrVendor", "FileExtension"];
      const name = tag(protection);
      if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid file protection");
      decodeCanonicalConstructor(protection, name);
      return { kind: "fileProtection", protection: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as "allowedPath" | "repositoryBoundary" | "sensitivePath" | "generatedOrVendor" | "fileExtension" };
    }
    case "Canonical.CandidateFile": {
      const candidate = decodeCanonicalConstructor(value, "Canonical.CandidateFile").candidate;
      const names = ["CandidateAllowed", "RefuseGitAdmin", "RefuseFileKind", "RefuseGitIgnore"];
      const name = tag(candidate);
      if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid candidate file");
      decodeCanonicalConstructor(candidate, name);
      return { kind: "candidateFile", candidate: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as "candidateAllowed" | "refuseGitAdmin" | "refuseFileKind" | "refuseGitIgnore" };
    }
    case "Canonical.ReviewAdmission": {
      const admission = decodeCanonicalConstructor(value, "Canonical.ReviewAdmission").admission;
      const names = ["AdmitReview", "RefuseRoot", "RefuseConfiguration", "RefuseCredential", "RefuseSelection"];
      const name = tag(admission);
      if (!names.some((item) => name === `Configuration.${item}`)) throw new TypeError("invalid review admission");
      decodeCanonicalConstructor(admission, name);
      return { kind: "reviewAdmission", admission: name.slice("Configuration.".length).replace(/^./, (first) => first.toLowerCase()) as "admitReview" | "refuseRoot" | "refuseConfiguration" | "refuseCredential" | "refuseSelection" };
    }
    case "Canonical.RuleGate": {
      const gate = decodeCanonicalConstructor(value, "Canonical.RuleGate").gate;
      const name = tag(gate);
      if (name !== "RulePolicy.Admit" && name !== "RulePolicy.Omit") throw new TypeError("invalid rule gate");
      decodeCanonicalConstructor(gate, name);
      return { kind: "ruleGate", gate: name === "RulePolicy.Admit" ? "admit" : "omit" };
    }
    case "Canonical.RuleOrder": {
      const order = decodeCanonicalConstructor(value, "Canonical.RuleOrder").order;
      const name = tag(order);
      if (name !== "RulePolicy.Before" && name !== "RulePolicy.Equal" && name !== "RulePolicy.After") throw new TypeError("invalid rule order");
      decodeCanonicalConstructor(order, name);
      return { kind: "ruleOrder", order: name === "RulePolicy.Before" ? "before" : name === "RulePolicy.After" ? "after" : "equal" };
    }
    case "Canonical.NoticeRejectedFull": case "Canonical.NoticeCreateKey": case "Canonical.NoticeKeepLeased":
    case "Canonical.NoticeRefused": case "Canonical.NoticeCommitted": case "Canonical.NoticeDropped":
    case "Canonical.NoticeLeased": case "Canonical.NoticePendingCleared": {
      const name = tag(value); decodeCanonicalConstructor(value, name);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as "noticeRejectedFull" | "noticeCreateKey" | "noticeKeepLeased" | "noticeRefused" | "noticeCommitted" | "noticeDropped" | "noticeLeased" | "noticePendingCleared" };
    }
    case "Canonical.CachePrepared": return { kind: "cachePrepared", evicted: readList(decodeCanonicalConstructor(value, "Canonical.CachePrepared").evicted, (id) => nat(id, true)) };
    case "Canonical.CacheDiscarded": return { kind: "cacheDiscarded", ids: readList(decodeCanonicalConstructor(value, "Canonical.CacheDiscarded").ids, (id) => nat(id, true)) };
    case "Canonical.ReuseJoinAdvice": case "Canonical.ReuseJoinPending":
    case "Canonical.ReuseJoinClaimed": case "Canonical.ReuseCached":
    case "Canonical.ReuseOwn": case "Canonical.ReuseClaimed":
    case "Canonical.ReuseAttached": case "Canonical.ReuseReleased":
    case "Canonical.ReuseRefused": case "Canonical.CacheAlready":
    case "Canonical.CacheRejected": case "Canonical.CacheCommitted": {
      const name = tag(value); decodeCanonicalConstructor(value, name);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Exclude<Extract<CanonicalCommand, { kind: `reuse${string}` | `cache${string}` }>["kind"], "cachePrepared" | "cacheDiscarded"> };
    }
    case "Canonical.CollectorProceed":
    case "Canonical.CollectorFinalProceed": case "Canonical.CollectorFinalRelease":
    case "Canonical.ReuseKeepMember": case "Canonical.ReuseSetMemberClear":
    case "Canonical.ReuseSetMemberFinding": case "Canonical.ReuseSetMemberUnavailable":
    case "Canonical.ReuseSetMemberLost": {
      const name = tag(value); decodeCanonicalConstructor(value, name);
      return { kind: name.slice("Canonical.".length).replace(/^./, (first) => first.toLowerCase()) as Exclude<Extract<CanonicalCommand, { kind: `collector${string}` | `reuse${string}` }>["kind"], "collectorUnavailable"> };
    }
    case "Canonical.WriteAuthorized": return { kind: "writeAuthorized", operation: nat(decodeCanonicalConstructor(value, "Canonical.WriteAuthorized").operation, true) };
    case "Canonical.WriteRecorded": return { kind: "writeRecorded", outcome: writeOutcome(decodeCanonicalConstructor(value, "Canonical.WriteRecorded").outcome) };
    case "Canonical.WaitForOutput": decodeCanonicalConstructor(value, "Canonical.WaitForOutput"); return { kind: "waitForOutput" };
    case "Canonical.ReofferAtStop": decodeCanonicalConstructor(value, "Canonical.ReofferAtStop"); return { kind: "reofferAtStop" };
    case "Canonical.PartitionRetired": return { kind: "partitionRetired", round: nat(decodeCanonicalConstructor(value, "Canonical.PartitionRetired").round, true) };
    case "Canonical.AdmissionForgotten": decodeCanonicalConstructor(value, "Canonical.AdmissionForgotten"); return { kind: "admissionForgotten" };
    default: throw new TypeError("unknown canonical command");
  }
};

const known = new WeakSet<object>();
// Projections contain validated numeric facts, not native handles or payloads.
// Weak keys do not extend canonical-state lifetime beyond its actual owner.
const projections = new WeakMap<object, CanonicalProjection>();
const registerCanonical = (state: unknown): void => {
  const identity = freezeCanonicalData(object(state));
  known.add(identity);
  try { projectCanonical(identity); }
  catch (cause) {
    known.delete(identity);
    projections.delete(identity);
    throw cause;
  }
};
export const projectCanonical = (state: unknown): CanonicalProjection => {
  // Only registered, fully frozen Bend states enter this weak-key cache.
  if (typeof state === "object" && state !== null) {
    const cached = projections.get(state);
    if (cached !== undefined) return cached;
  }
  const identity = object(state);
  if (!known.has(identity)) throw new TypeError("foreign canonical state");
  const s = decodeCanonicalConstructor(state, "Canonical.State");
  nat(s.next_round, true); nat(s.next_operation, true);
  const history = decodeCanonicalConstructor(s.history, "EditHistory.State");
  const completedEdits = readList(history.entries, (value) => {
    const entry = decodeCanonicalConstructor(value, "EditHistory.Completed");
    return { tool: nat(entry.tool, true), reason: decodeCompletedEditReason(entry.reason), reported: bool(entry.reported) };
  }, 1000);
  if (new Set(completedEdits.map((entry) => entry.tool)).size !== completedEdits.length) throw new TypeError("duplicate completed edit identity");
  const rawDispatch = decodeCanonicalConstructor(s.dispatch, "Dispatch.State");
  const dispatchEntry = (value: unknown): DispatchEntry => {
    const x = decodeCanonicalConstructor(value, "Dispatch.Entry");
    return { partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), round: nat(x.round, true),
      operation: nat(x.operation, true), sequence: nat(x.sequence), cancelled: bool(x.cancelled), preparation: bool(x.preparation) };
  };
  const requests = readList(rawDispatch.requests, (value) => {
    const x = decodeCanonicalConstructor(value, "Dispatch.Request");
    return { partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), round: nat(x.round, true),
      operation: nat(x.operation, true), request: nat(x.request, true), started: bool(x.started), interrupted: bool(x.interrupted) };
  });
  const dispatch = { queued: readList(rawDispatch.queued, dispatchEntry),
    running: readList(rawDispatch.running, dispatchEntry), nextSequence: nat(rawDispatch.next_sequence),
    closed: bool(rawDispatch.closed), requests };
  const dispatchEntries = [...dispatch.queued, ...dispatch.running];
  const collectionState = decodeCanonicalConstructor(s.collection, "CollectionState.State");
  const noticeState = decodeCanonicalConstructor(collectionState.notices, "NoticeState.State");
  const notices: CanonicalProjection["notices"] = readList(noticeState.records, (value) => {
    const item = decodeCanonicalConstructor(value, "NoticeState.Record");
    const pending = tag(item.pending) === "Some" ? (() => {
      const p = decodeCanonicalConstructor(decodeCanonicalConstructor(item.pending, "Some").value, "NoticeState.Pending");
      return { id: nat(p.id, true), count: nat(p.count), sequence: nat(p.sequence, true), leased: bool(p.leased) };
    })() : (decodeCanonicalConstructor(item.pending, "None"), undefined);
    return { id: nat(item.id, true), partition: nat(item.partition, true), group: nat(item.group, true), reservation: nat(item.reservation, true), suppressed: nat(item.suppressed), ...(pending === undefined ? {} : { pending }) };
  });
  if (new Set(notices.map((item) => item.id)).size !== notices.length ||
      new Set(notices.map((item) => item.reservation)).size !== notices.length ||
      new Set(notices.flatMap((item) => item.pending === undefined ? [] : [item.pending.id])).size !== notices.filter((item) => item.pending !== undefined).length ||
      new Set(notices.flatMap((item) => item.pending === undefined ? [] : [item.pending.sequence])).size !== notices.filter((item) => item.pending !== undefined).length) throw new TypeError("duplicate canonical notice identity");
  const reuseState = decodeCanonicalConstructor(collectionState.reuse, "ReuseState.State");
  const reuse: CanonicalProjection["reuse"] = {
    claims: readList(reuseState.claims, (value) => {
      const item = decodeCanonicalConstructor(value, "ReuseState.Claim");
      return { id: nat(item.id, true), attached: bool(item.attached) };
    }),
    cache: readList(reuseState.cache, (value) => {
      const item = decodeCanonicalConstructor(value, "ReuseState.Entry");
      return { id: nat(item.id, true), partition: nat(item.partition, true), bytes: nat(item.bytes), reservation: nat(item.reservation, true) };
    }),
  };
  if (new Set(reuse.claims.map((item) => item.id)).size !== reuse.claims.length ||
      new Set(reuse.cache.map((item) => item.id)).size !== reuse.cache.length) {
    throw new TypeError("duplicate canonical evaluation identity");
  }
  const rawRevision = decodeCanonicalConstructor(collectionState.revision, "RevisionState.State");
  const revision = { entries: readList(rawRevision.entries, (value) => {
    const entry = decodeCanonicalConstructor(value, "RevisionState.Entry");
    return { subject: nat(entry.subject, true), input: nat(entry.input, true), generation: nat(entry.generation, true), members: nat(entry.members, true) };
  }), nextGeneration: nat(rawRevision.next_generation, true) };
  if (new Set(revision.entries.map((entry) => entry.subject)).size !== revision.entries.length) throw new TypeError("duplicate canonical revision subject");

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
  if (new Set(collection.ready).size !== collection.ready.length ||
      new Set(collection.leases.map((item) => item.advice)).size !== collection.leases.length ||
      collection.leases.some((item) => !collection.ready.includes(item.advice)) ||
      new Set(collection.claims.map((item) => item.group)).size !== collection.claims.length) {
    throw new TypeError("inconsistent canonical collection state");
  }
  const deliveryState = decodeCanonicalConstructor(collectionState.delivery, "DeliveryState.State");
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
    if (!["available", "reserved", "authorized", "submitted", "uncertain"].includes(phase)) throw new TypeError("invalid submission lease phase");
    nat(lease.item, true); bool(lease.closed);
    return { round: nat(lease.round, true), phase: phase as "available" | "reserved" | "authorized" | "submitted" | "uncertain", reoffered: bool(lease.reoffered) };
  };
  const delivery = {
    slots: readList(deliveryState.slots, (value) => {
      const item = decodeCanonicalConstructor(value, "DeliveryState.Slot");
      decodeCanonicalConstructor(item.phase, tag(item.phase));
      const phase = tag(item.phase).slice("DeliveryState.".length).toLowerCase();
      if (!["reserved", "authorized", "submitted", "failed", "uncertain"].includes(phase)) throw new TypeError("invalid canonical delivery phase");
      return { group: nat(item.group, true), round: nat(item.round, true), attempt: nat(item.attempt, true),
        token: nat(item.token, true), selected: readList(item.selected, (id) => nat(id, true)),
        phase: phase as "reserved" | "authorized" | "submitted" | "failed" | "uncertain" };
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
        if (!["reserved", "authorized", "submitted", "uncertain"].includes(phase)) throw new TypeError("invalid submission phase");
        return { advice: nat(item.advice, true), group: nat(item.group, true), round: nat(item.round, true),
          token: nat(item.token, true), surface: surface(item.surface), phase: phase as "reserved" | "authorized" | "submitted" | "uncertain",
          fingerprints: readList(item.fingerprints, (id) => nat(id, true)),
          units: readList(item.units, (id) => nat(id, true)) };
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
  if (new Set(delivery.slots.map((item) => item.group)).size !== delivery.slots.length ||
      new Set(delivery.counters.map((item) => `${item.group}:${item.round}`)).size !== delivery.counters.length ||
      delivery.counters.some((item) => item.used > 4)) throw new TypeError("inconsistent canonical delivery state");
  if (new Set(delivery.submissions.batches.map((item) => `${item.advice}:${item.token}`)).size !== delivery.submissions.batches.length ||
      new Set(delivery.submissions.leases.map((item) => `${item.advice}:${item.fingerprint}`)).size !== delivery.submissions.leases.length) {
    throw new TypeError("inconsistent canonical submission state");
  }
  const executionLimits = { preparation: nat(bendPreparationLimit(), true), jevRequests: nat(bendJevRequestLimit(), true) };
  if (dispatch.running.filter((entry) => entry.preparation).length > executionLimits.preparation || dispatch.requests.length > executionLimits.jevRequests ||
      new Set(dispatch.requests.map((entry) => entry.request)).size !== dispatch.requests.length ||
      new Set(dispatch.requests.map((entry) => entry.operation)).size !== dispatch.requests.length ||
      dispatch.requests.some((entry) => entry.interrupted && !entry.started) ||
      new Set(dispatchEntries.map((x) => x.operation)).size !== dispatchEntries.length ||
      new Set(dispatchEntries.map((x) => x.sequence)).size !== dispatchEntries.length ||
      dispatchEntries.some((x) => x.sequence >= dispatch.nextSequence)) {
    throw new TypeError("inconsistent canonical dispatch state");
  }
  const ledger = decodeCanonicalConstructor(s.ledger, "Ledger.Ledger");
  nat(ledger.next_id, true);
  const limits = decodeCanonicalConstructor(ledger.limits, "Ledger.Limits");
  for (const value of Object.values(limits).slice(1)) nat(value, true);
  const charges = readList(ledger.charges, charge);
  const rounds = readList(s.rounds, (value) => {
    const x = decodeCanonicalConstructor(value, "Canonical.Round");
    const write = tag(x.write) === "Some" ? nat(decodeCanonicalConstructor(x.write, "Some").value, true) : undefined;
    if (write === undefined) decodeCanonicalConstructor(x.write, "None");
    const quietSince = tag(x.quiet_since) === "Some" ? nat(decodeCanonicalConstructor(x.quiet_since, "Some").value) : undefined;
    if (quietSince === undefined) decodeCanonicalConstructor(x.quiet_since, "None");
    return { partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), id: nat(x.id, true), waiting: bool(x.waiting), deciding: bool(x.deciding), ...(write === undefined ? {} : { write }), uncertain: bool(x.uncertain), ...(quietSince === undefined ? {} : { quietSince }) };
  });
  const admissions = readList(s.admissions, (value) => {
    const x = decodeCanonicalConstructor(value, "Admission.AdmissionState");
    const permits = readList(x.permits, (entry) => {
      const permit = decodeCanonicalConstructor(entry, "Admission.Permit");
      const started = nat(permit.started); const deadline = nat(permit.deadline);
      if (deadline < started) throw new TypeError("invalid permit deadline");
      return { token: nat(permit.token, true), tool: nat(permit.tool, true), round: nat(permit.round, true), deadline };
    });
    const next = nat(x.next_token, true);
    if (permits.some((item) => item.token >= next) ||
        new Set(permits.map((item) => item.token)).size !== permits.length ||
        new Set(permits.map((item) => item.tool)).size !== permits.length) throw new TypeError("invalid admission tokens");
    return { partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), round: nat(x.round), active: bool(x.active), closedAt: nat(x.closed_at), permits };
  });
  const work = readList(s.work, (value) => {
    const x = decodeCanonicalConstructor(value, "Canonical.Work");
    const kind = tag(x.kind);
    decodeCanonicalConstructor(x.kind, kind);
    const names = { "Canonical.AwaitingSourceRead": "awaitingSourceRead", "Canonical.SourceReading": "sourceReading",
      "Canonical.Preparing": "preparing", "Canonical.Reviewing": "reviewing",
      "Canonical.AtJev": "atJev", "Canonical.PendingFinding": "pendingFinding" } as const;
    const stage = names[kind as keyof typeof names];
    if (stage === undefined) throw new TypeError("invalid work kind");
    return { partition: nat(x.partition, true), lifetime: nat(x.lifetime, true), round: nat(x.round, true),
      operation: nat(x.operation, true), reservation: nat(x.charge), parent: nat(x.parent), kind: stage };
  });
  const pendingFindings = readList(s.work, (value) => {
    const x = decodeCanonicalConstructor(value, "Canonical.Work");
    return tag(x.kind) === "Canonical.PendingFinding"
      ? { operation: nat(x.operation, true), count: nat(decodeCanonicalConstructor(x.kind, "Canonical.PendingFinding").count, true) }
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
          ? x.kind !== "awaitingSourceRead" && x.kind !== "sourceReading"
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
  const total = decodeCanonicalConstructor(bendCanonicalTotal(state), "Ledger.Usage");
  const global = { items: nat(total.items), bytes: nat(total.bytes) };
  if (global.items !== charges.length || global.bytes !== usedBytes) throw new TypeError("Bend ledger total mismatch");
  const partitionIds = [...new Set([...rounds.map((round) => round.partition), ...charges.map((item) => item.partition)])];
  const partitions = partitionIds.map((partition) => {
    const usage = decodeCanonicalConstructor(bendCanonicalPartitionUsage(state, partition), "Ledger.Usage");
    return { partition, items: nat(usage.items), bytes: nat(usage.bytes) };
  });
  const inventory = readList(bendCanonicalInventory(state), (entry) => {
    const x = decodeCanonicalConstructor(entry, "Ledger.InventoryEntry");
    const entryLimits = decodeCanonicalConstructor(x.limits, "Ledger.Limits");
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
  const projection: CanonicalProjection = freezeCanonicalData({ global, executionLimits,
    limits: { globalItems: nat(limits.global_items, true), globalBytes: nat(limits.global_bytes, true),
      partitionItems: nat(limits.partition_items, true), partitionBytes: nat(limits.partition_bytes, true) },
    partitions, charges, inventory, rounds, admissions, completedEdits, work, pendingFindings,
    dispatch, collection, revision, reuse, notices, delivery });
  projections.set(identity, projection);
  return projection;
};
const decodeLimits = decoder(CanonicalLimitsSchema);
export const initialCanonical = (input: typeof CanonicalLimitsSchema.Type): unknown => {
  const limits = decodeLimits(input);
  const state = bendCanonicalInitial({ $: "Ledger.Limits", global_items: limits.globalItems, global_bytes: limits.globalBytes, partition_items: limits.partitionItems, partition_bytes: limits.partitionBytes });
  registerCanonical(state);
  return state;
};
/** Callers must supply measured byte counts, authenticated attribution, and correct deadline facts. */
export const stepCanonical = (state: unknown, event: CanonicalEvent): { readonly state: unknown; readonly commands: readonly CanonicalCommand[]; readonly rejection?: string } => {
  projectCanonical(state);
  return decodeTrustedCanonicalStep(bendCanonicalStep(state, encodeCanonicalEvent(event)));
};
/** Decode a checked result produced by a core which composes Canonical directly. */
export const decodeTrustedCanonicalStep = (raw: unknown): { readonly state: unknown; readonly commands: readonly CanonicalCommand[]; readonly rejection?: string } => {
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
      const rejection = reason.$ === "Canonical.PermitDenied"
        ? reason.reason.$.slice("Admission.".length)
        : reason.$.slice("Canonical.".length);
      registerCanonical(x.state);
      return { state: x.state, commands: [], rejection };
    }
    default: throw new TypeError("unknown canonical step");
  }
};


/** Private trusted-composer publication; the exact projection decoder runs before return. */
export const projectTrustedCanonical = (state: unknown): CanonicalProjection => {
  registerCanonical(state);
  return projectCanonical(state);
};
