import Base
import ./Admission.bend as Admission
import ./Work.bend as Work
import ./Handoff.bend as Handoff
import ./Flow.bend as Flow

type Smoke is Data:
  Smoke{
    admission: Admission.AdmissionResult,
    callback: Bool,
    admitted: Work.WorkStep,
    prepared: Work.WorkStep,
    outcome: Work.WorkStep,
    unfinished: Nat,
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
    closed_lease: Handoff.Lease
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
    Admission.callback_current(Admission.initial(1n, 1n), 1n, 1n, 0n),
    Work.admit(Work.initial()),
    Work.prepare(sample_work(), 1n, 2n),
    Work.outcome(sample_unit_work(), 1n, Work.Clear{}),
    Work.unfinished(sample_unit_work()),
    Work.set_source_capacity(sample_work(), Flow.Capacity{2n, 0n}),
    Work.set_review_capacity(sample_unit_work(), Flow.Capacity{2n, 0n}),
    Handoff.select(Handoff.initial(1n, 1n, 1n, 1n),
      Handoff.Advice{1n, 1n, 1n, 1n, 1n, 1n, 0n, 100n, True{}}, 100n),
    Handoff.fits_batch(1n, 100n),
    Handoff.finish.decide(Handoff.finish.initial(1n), 0n, False{}, 1n),
    Handoff.lease.reserve(Handoff.lease.initial(1n, 1n), 1n, 1n, Handoff.Background{}),
    Handoff.lease.authorize(sample_reserved_lease(), 1n, 1n),
    Handoff.lease.release(sample_reserved_lease(), 1n, 1n),
    Handoff.lease.terminal(sample_authorized_lease(), 1n, 1n, False{}),
    Handoff.lease.reoffer(sample_uncertain_lease(), 1n, 2n, True{}),
    Handoff.lease.close(Handoff.lease.initial(1n, 1n))
  }
