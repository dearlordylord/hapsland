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
import ./Ticket.bend as Ticket

type Smoke is Data:
  Smoke{
    admission: Admission.AdmissionResult,
    prospective_close: Admission.AdmissionResult,
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
    source_capacity: Work.WorkStep,
    review_capacity: Work.WorkStep,
    selection: Handoff.SelectResult,
    fit: Bool,
    finish: Handoff.FinishResult,
    lease_reserve: Handoff.LeaseResult,
    lease_authorize: Handoff.LeaseResult,
    lease_release: Handoff.LeaseResult,
    lease_terminal: Handoff.LeaseResult,
    lease_reoffer: Handoff.LeaseResult,
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
    round_reopen: Round.Step
    background_claim: Background.Step
    background_release: Background.Step
    background_expire: Background.Waiter
    notice: Notice.Action
    collection_order: Collection.Order
    collection_eligible: Bool
    collection_expired: Bool
    delivery_transition: Delivery.Step
    delivery_expired: Bool
    background_reofferable: Bool
    cache_admission: Cache.Admission
    cache_evict: Bool
    lifecycle_cutoff: Lifecycle.CutoffResult
    lifecycle_finish_gate: Lifecycle.FinishGateResult
    lifecycle_reserve: Round.Step
    lifecycle_release: Round.Step
    ticket_initial: Ticket.Phase
    ticket_fail: Ticket.Phase
    ticket_close: Ticket.Phase
    ticket_terminal: Ticket.Outcome
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
    Admission.close_prospective(Admission.AdmissionState{1n, 1n, 0n, False{}, 0n, 2n,
      Admission.Permit{1n, 1n, 1n, 1n, 2n} <> Nil{}, Nil{}}, 3n),
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
    Work.set_source_capacity(sample_work(), Flow.Capacity{2n, 0n}),
    Work.set_review_capacity(sample_unit_work(), Flow.Capacity{2n, 0n}),
    Handoff.select(Handoff.initial(1n, 1n),
      Handoff.Advice{1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n, 0n, 100n, True{}}, 100n),
    Handoff.fits_batch(1n, 100n),
    Handoff.finish.decide(Handoff.finish.initial(1n), 0n, False{}, 1n),
    Handoff.lease.reserve(Handoff.lease.initial(1n, 1n), 1n, 1n, Handoff.Background{}),
    Handoff.lease.authorize(sample_reserved_lease(), 1n, 1n),
    Handoff.lease.release(sample_reserved_lease(), 1n, 1n),
    Handoff.lease.terminal(sample_authorized_lease(), 1n, 1n, False{}),
    Handoff.lease.reoffer(sample_uncertain_lease(), 1n, 2n, True{}),
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
    Round.reopen(Round.Round{1n, False{}, 2n, 0n, 0n, False{}, False{}, False{}}, 2n),
    Background.claim(Background.initial(), 1n, True{}, 0n, 64n),
    Background.release(Background.Waiter{1n}, 1n),
    Background.expire(Background.Waiter{1n}, 20001n, 20000n),
    Notice.decide(Some{10n}, 1n, 64n),
    Collection.order(1n, 2n, 1n, 3n),
    Collection.eligible(False{}, False{}, False{}, 50n, 50n),
    Collection.expired(600000n, 600000n),
    Delivery.transition(Delivery.Authorized{}, Delivery.Uncertain{}),
    Delivery.expired(Delivery.Authorized{}, 1000n, 1000n),
    Delivery.background_reofferable(Delivery.Uncertain{}, Delivery.Background{}),
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
    Ticket.initial(),
    Ticket.fail(Ticket.initial(), Ticket.Backend{}),
    Ticket.close(Ticket.fail(Ticket.initial(), Ticket.Backend{})),
    Ticket.terminal(Ticket.Closed{}, Ticket.Facts{False{}, True{}, 0n,
      False{}, False{}, None{}, 0n, 0n, 1n})
  }
