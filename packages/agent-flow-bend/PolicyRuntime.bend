import Base
import ./Admission.bend as Admission
import ./Work.bend as Work
import ./Handoff.bend as Handoff
import ./Flow.bend as Flow
import ./Round.bend as Round
import ./Background.bend as Background
import ./Notice.bend as Notice
import ./Collection.bend as Collection
import ./Delivery.bend as Delivery
import ./Cache.bend as Cache
import ./Lifecycle.bend as Lifecycle
import ./CollectorAuthority.bend as CollectorAuthority
import ./Revision.bend as Revision
import ./Reuse.bend as Reuse
import ./Retention.bend as Retention

type Smoke is Data:
  Smoke{
    admission: Admission.AdmissionResult,
    prospective_gate: Admission.ProspectiveDecision,
    expired_permit: Admission.ExpiryResult,
    callback: Bool,
    admitted: Work.WorkStep,
    started_source: Work.WorkStep,
    started_unit: Work.WorkStep,
    spawned: Work.WorkStep,
    prepared: Work.WorkStep,
    source_completed: Work.WorkStep,
    cached_finding: Work.WorkStep,
    revised_finding: Work.WorkStep,
    outcome: Work.WorkStep,
    interrupted_source: Work.WorkStep,
    interrupted_unit: Work.WorkStep,
    retired: Work.WorkStep,
    unfinished: Nat,
    pending_findings: Nat,
    pending_for: Nat,
    closed_work: Work.CloseResult,
    cancelled_work: Work.CancelResult,
    finish_wait: Bool,
    prepared_offer: Work.PreparedOffer,
    empty_prepared: Work.EmptyPrepared,
    evaluated_disposition: Work.EvaluatedDisposition,
    failure_disposition: Work.FailureDisposition,
    source_capacity: Work.WorkStep,
    review_capacity: Work.WorkStep,
    selection: Handoff.SelectResult,
    fit: Bool,
    notice_offer: Handoff.NoticeOffer,
    notice_prune: Notice.Prune,
    validation_route: Handoff.CandidateAction,
    post_validation: Handoff.CandidateAction,
    final_candidate: Handoff.CandidateAction,
    finish: Handoff.FinishResult,
    lease_reserve: Handoff.LeaseResult,
    lease_authorize: Handoff.LeaseResult,
    lease_release: Handoff.LeaseResult,
    lease_terminal: Handoff.LeaseResult,
    lease_reoffer: Handoff.LeaseResult,
    lease_offer: Handoff.LeaseResult,
    closed_lease: Handoff.Lease,
    lease_suppresses: Bool
    round_begin: Round.Step
    round_active: Bool
    round_budget: Bool
    round_max: Nat
    round_owns: Bool
    round_decision: Round.Step
    round_consume: Round.Step
    round_reserve: Round.Step
    round_finish: Round.Step
    round_stop_terminal: Round.StopTerminal
    round_expire_close: Bool
    round_reopen: Round.Step
    background_claim: Background.Step
    background_release: Background.Step
    background_expire: Background.Waiter
    notice: Notice.Action
    notice_advance: Notice.Advance
    collection_order: Collection.Order
    collection_credential: Collection.CredentialDisposition
    collection_eligible: Bool
    collection_expired: Bool
    delivery_transition: Delivery.Step
    delivery_expired: Bool
    background_reofferable: Bool
    submission_allowed: Bool
    existing_token_allowed: Bool
    unreserved_stop_allowed: Bool
    delivery_ack: Delivery.AckDecision
    delivery_final: Delivery.FinalDecision
    delivery_finding: Delivery.FindingDisposition
    delivery_release: Bool
    submission_candidate: Bool
    submission_batch_gate: Delivery.BatchGate
    credential_observe: Bool
    final_credential_gate: Delivery.BatchGate
    collection_lease: Delivery.CollectionLeaseAction
    advice_candidate: Bool
    notice_candidate: Bool
    reserve_candidate: Bool
    reuse_route: Reuse.Route
    reuse_cache_route: Reuse.CacheRoute
    cache_admission: Cache.Admission
    cache_evict: Bool
    lifecycle_cutoff: Lifecycle.CutoffResult
    lifecycle_finish_gate: Lifecycle.FinishGateResult
    lifecycle_reserve: Round.Step
    lifecycle_release: Round.Step
    finish_disposition: Lifecycle.FinishDisposition
    finish_output: Lifecycle.FinishOutput
    selection_reserved: Lifecycle.OutputSelectionReservation
    selection_authorized: Lifecycle.OutputSelectionStep
    selection_consumed: Lifecycle.OutputSelectionStep
    collector_gate: CollectorAuthority.CollectGate
    collector_final_authority: CollectorAuthority.FinalAuthority
    revision_register: Revision.Registration
    revision_superseded: Bool
    cleanup_gate: Retention.CleanupGate
    cleanup_commit: Retention.CleanupGate
    discard_scope: Retention.DiscardScope
  }

def sample_work() -> Work.Work:
  Work.Work{2n, 1n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n},
    Work.Observation{1n, Work.SourceReading{}} <> Nil{}, Nil{}}

def sample_unit_work() -> Work.Work:
  Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
    Work.ReviewUnit{1n, 1n, Work.AtJev{}, 0n, 0n} <> Nil{}}

def sample_reserved_lease() -> Handoff.Lease:
  Handoff.Lease{1n, 1n, False{}, False{}, Handoff.Reserved{1n, Handoff.Background{}}}

def sample_authorized_lease() -> Handoff.Lease:
  Handoff.Lease{1n, 1n, False{}, False{}, Handoff.Authorized{1n, Handoff.Background{}}}

def sample_uncertain_lease() -> Handoff.Lease:
  Handoff.Lease{1n, 1n, False{}, False{}, Handoff.Uncertain{Handoff.Background{}}}

def main() -> Smoke:
  Smoke{
    Admission.step(Admission.initial(1n, 1n), 1n, 1n, Admission.Issue{1n, 1n, 2n, 1n}),
    Admission.prospective_gate(Admission.ProspectiveFacts{True{}, 2500n, 100n, 110n,
      32n, 4096n}, 100n, 110n),
    Admission.expire(Admission.initial(1n, 1n), 1n, True{}),
    Admission.callback_current(Admission.initial(1n, 1n), 1n, 1n, 0n),
    Work.admit(Work.initial()),
    Work.start_source(sample_work(), 1n),
    Work.start_unit(sample_unit_work(), 1n),
    Work.spawn(sample_work(), 1n, 1n),
    Work.prepare(sample_work(), 1n, 2n),
    Work.complete_source(sample_work(), 1n),
    Work.cached_finding(sample_work(), 1n, 1n, 20n),
    Work.revise_finding(Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.PendingFinding{}, 1n, 20n} <> Nil{}}, 1n, 1n, 10n),
    Work.outcome(sample_unit_work(), 1n, Work.Clear{}),
    Work.interrupt_observation(sample_work(), 1n),
    Work.interrupt_unit(sample_unit_work(), 1n),
    Work.retire(Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.ClearResult{}, 0n, 0n} <> Nil{}}, 1n),
    Work.unfinished(sample_unit_work()),
    Work.pending_findings(sample_unit_work()),
    Work.pending_for(sample_unit_work(), 1n),
    Work.close(sample_work()),
    Work.cancel_unfinished(sample_work()),
    Work.finish_wait(1n, False{}, True{}),
    Work.prepared_offer(True{}, True{}),
    Work.empty_prepared(0n, True{}, True{}),
    Work.evaluated_disposition(True{}, True{}),
    Work.failure_disposition(False{}, True{}, False{}),
    Work.set_source_capacity(sample_work(), Flow.Capacity{2n, 0n}),
    Work.set_review_capacity(sample_unit_work(), Flow.Capacity{2n, 0n}),
    Handoff.select(Handoff.initial(1n, 1n),
      Handoff.Advice{1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n, 0n, 100n, True{}}, 100n),
    Handoff.fits_batch(1n, 100n),
    Handoff.notice_offer(6n, 100n, True{}),
    Notice.prune(True{}, True{}, True{}, False{}, False{}, False{}),
    Handoff.validation_route(True{}, Handoff.Current{}),
    Handoff.post_validation(True{}, False{}, True{}),
    Handoff.final_candidate(True{}, True{}, True{}, False{}, True{}, True{}),
    Handoff.finish.decide(Handoff.finish.initial(1n), 0n, False{}, 1n),
    Handoff.lease.reserve(Handoff.lease.initial(1n, 1n), 1n, 1n, Handoff.Background{}),
    Handoff.lease.authorize(sample_reserved_lease(), 1n, 1n),
    Handoff.lease.release(sample_reserved_lease(), 1n, 1n),
    Handoff.lease.terminal(sample_authorized_lease(), 1n, 1n, False{}),
    Handoff.lease.reoffer(sample_uncertain_lease(), 1n, 2n, True{}),
    Handoff.lease.offer(sample_uncertain_lease(), 1n, 2n, Handoff.Stop{}, True{}),
    Handoff.lease.close(Handoff.lease.initial(1n, 1n)),
    Handoff.lease.suppresses(sample_uncertain_lease(), 1n, Handoff.Edit{}),
    Round.begin_stop(Round.initial(), 1n),
    Round.active(Round.initial(), 1n),
    Round.budget(Round.initial()),
    Round.max_continuations(),
    Round.owns_stop(Round.Round{1n, True{}, 0n, 0n, 1n, False{}, False{}, False{}}, 1n),
    Round.begin_decision(Round.Round{1n, True{}, 0n, 0n, 1n, False{}, False{}, False{}}, 1n),
    Round.consume(Round.initial()),
    Round.reserve_output(Round.Round{1n, True{}, 0n, 0n, 1n, False{}, True{}, False{}}, 1n),
    Round.finish_stop(Round.Round{1n, True{}, 0n, 0n, 1n, False{}, False{}, False{}}, 1n, True{}, 2n),
    Round.stop_terminal(True{}, False{}, False{}),
    Round.expire_close(False{}),
    Round.reopen(Round.Round{1n, False{}, 2n, 0n, 0n, False{}, False{}, False{}}, 2n),
    Background.claim(Background.initial(), 1n, True{}, 0n, 64n),
    Background.release(Background.Waiter{1n}, 1n),
    Background.expire(Background.Waiter{1n}, 20001n, 20000n),
    Notice.decide(Some{10n}, 1n, 64n),
    Notice.advance(Some{0n}, 1n, 64n, 3n, Some{2n}, False{}, 5n),
    Collection.order(2n, 3n),
    Collection.credential_disposition(True{}, False{}),
    Collection.eligible(False{}, True{}),
    Collection.expired(600000n, 600000n),
    Delivery.transition(Delivery.Authorized{}, Delivery.Uncertain{}),
    Delivery.expired(Delivery.Authorized{}, 1000n, 1000n),
    Delivery.background_reofferable(Delivery.Uncertain{}, Delivery.Background{}),
    Delivery.submission_allowed(Round.initial(), Delivery.Edit{}, False{}, False{}),
    Delivery.existing_token_allowed(Delivery.Edit{}, False{}, False{}),
    Delivery.unreserved_stop_allowed(Round.initial()),
    Delivery.acknowledge(1n, False{}),
    Delivery.finalize(1n, True{}, False{}),
    Delivery.finding_disposition(False{}, 0n),
    Delivery.release_unacknowledged(False{}),
    Delivery.submission_candidate(Delivery.SubmissionFacts{True{}, True{}, True{},
      True{}, True{}, True{}, True{}, True{}}),
    Delivery.submission_batch_gate(1n, True{}),
    Delivery.credential_observe(False{}, True{}, True{}),
    Delivery.final_credential_gate(True{}, False{}),
    Delivery.collection_lease(True{}, False{}, True{}, True{}, True{}),
    Delivery.advice_candidate(True{}, True{}, True{}, True{}),
    Delivery.notice_candidate(True{}, True{}, True{}, True{}),
    Delivery.reserve_candidate(True{}),
    Reuse.route(False{}, False{}, False{}),
    Reuse.cache_route(False{}),
    Cache.admit(False{}, 10n, 100n),
    Cache.evict(8n, 100n, 20n, 8n, 128000n),
    Lifecycle.cutoff(Round.Round{1n, True{}, 0n, 0n, 1n, False{}, False{}, False{}},
      sample_work(), 1n),
    Lifecycle.finish_gate(Round.Round{1n, True{}, 0n, 0n, 1n, False{}, False{}, False{}},
      sample_work(), 1n, 0n, False{}),
    Lifecycle.reserve_selected(Round.Round{1n, True{}, 0n, 0n, 1n, False{}, True{}, False{}},
      Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
        Work.ReviewUnit{1n, 1n, Work.PendingFinding{}, 1n, 20n} <> Nil{}},
      1n, 1n <> Nil{}),
    Lifecycle.release_unwritten(Round.Round{1n, True{}, 0n, 1n, 1n, True{}, True{}, True{}}, 1n),
    Lifecycle.finish_disposition(sample_work(), Nil{}, True{}, True{}, True{}, True{}, False{}),
    Lifecycle.finish_output(Round.Round{1n, True{}, 0n, 0n, 1n, False{}, True{}, False{}},
      sample_work(), 1n, Nil{}, True{}, True{}, True{}, True{}, False{}),
    Lifecycle.selection_reserve(Work.Work{2n, 2n, Flow.Capacity{3n, 0n},
      Flow.Capacity{3n, 0n}, Nil{}, Work.ReviewUnit{1n, 1n,
      Work.PendingFinding{}, 1n, 20n} <> Nil{}}, 1n <> Nil{}),
    Lifecycle.selection_authorize(Lifecycle.OutputSelection{1n <> Nil{}, False{}, False{}}),
    Lifecycle.selection_consume(Lifecycle.OutputSelection{1n <> Nil{}, True{}, False{}},
      1n <> Nil{}),
    CollectorAuthority.collect_gate(False{}, True{}),
    CollectorAuthority.final_authority(True{}, True{}),
    Revision.register(True{}, False{}),
    Revision.superseded(1n, 1n, 1n, 2n),
    Retention.cleanup_gate(Retention.CleanupFacts{True{}, True{}, True{}, True{},
      True{}, True{}, True{}, True{}, True{}}),
    Retention.cleanup_commit(True{}),
    Retention.discard_scope(2n, 2n, False{})
  }
