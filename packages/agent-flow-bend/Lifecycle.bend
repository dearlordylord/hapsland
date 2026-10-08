import Base
import ./Admission.bend as Admission
import ./Work.bend as Work
import ./Handoff.bend as Handoff
import ./Round.bend as Round

# One advicee partition in one resident lifetime. Native identities are mapped
# bijectively to Nat IDs by the adapter, then checked on every event here.
type Lifecycle is Data:
  Lifecycle{admission: Admission.AdmissionState, work: Work.Work, finish: Handoff.Finish}

type LifecycleEvent is Data:
  Issue{tool: Nat, started: Nat, deadline: Nat, now: Nat}
  Commit{permit: Nat, tool: Nat, now: Nat}
  Prepared{observation: Nat, count: Nat}
  Reviewed{unit: Nat, outcome: Work.Outcome}
  SourceInterrupted{observation: Nat}
  ReviewInterrupted{unit: Nat}
  FinishCheck{original_deadline: Nat, actionable_findings: Nat, at: Nat, collector: Nat}
  WriteTerminal{slot: Nat, token: Nat, collector: Nat}

type Command is Data:
  PermitIssued{token: Nat}
  ObservationAdmitted{ids: List<&2, Nat>}
  UnitsAdmitted{ids: List<&2, Nat>}
  OutcomeRecorded{}
  WorkInterrupted{}
  FinishWaiting{}
  Continue{slot: Nat, token: Nat}
  Allow{cancelled_source: List<&2, Nat>, cancelled_jev: List<&2, Nat>, discarded: List<&2, Nat>}
  WriteSettled{}

type LifecycleResult is Data:
  Advanced{state: Lifecycle, command: Command}
  Denied{state: Lifecycle}

# The resident uses this aggregate transition at the synchronous Stop barrier.
# It publishes the Round decision fence and emits exact unfinished work IDs in
# one pure step before the adapter cancels Effect jobs or selects host output.
type CutoffResult is Data:
  CutoffGranted{round: Round.Round, work: Work.Work,
    cancelled_source: List<&2, Nat>, cancelled_jev: List<&2, Nat>}
  CutoffDenied{round: Round.Round, work: Work.Work}

type FinishGateResult is Data:
  GateWaiting{round: Round.Round, work: Work.Work}
  GateCutoff{round: Round.Round, work: Work.Work,
    cancelled_source: List<&2, Nat>, cancelled_jev: List<&2, Nat>}
  GateDenied{round: Round.Round, work: Work.Work}

def cutoff.granted(round: Round.Round, result: Work.CancelResult) -> CutoffResult:
  match result:
    case Work.Cancelled{work, source, jev}:
      CutoffGranted{round, work, source, jev}

def cutoff.round(work: Work.Work, result: Round.Step) -> CutoffResult:
  match result:
    case Round.Granted{round}:
      cutoff.granted(round, Work.cancel_unfinished(work))
    case Round.Denied{round}:
      CutoffDenied{round, work}

def cutoff(+round: Round.Round, work: Work.Work, token: Nat) -> CutoffResult:
  cutoff.round(work, Round.begin_decision(round, token))

def finish_gate.cutoff(result: CutoffResult) -> FinishGateResult:
  match result:
    case CutoffGranted{round, work, source, jev}:
      GateCutoff{round, work, source, jev}
    case CutoffDenied{round, work}:
      GateDenied{round, work}

# This is the resident's synchronous Stop poll barrier. External leases and
# pre-edit permits contribute to extra_unfinished; Bend already owns Work.
def finish_gate(+round: Round.Round, +work: Work.Work, +token: Nat,
    extra_unfinished: Nat, deadline_reached: Bool) -> FinishGateResult:
  Bool.pick(FinishGateResult, Round.owns_stop(round, token),
    Bool.pick(FinishGateResult,
      Work.finish_wait((Work.unfinished(work) + extra_unfinished : Nat),
        deadline_reached, Round.budget(round)),
      GateWaiting{round, work}, finish_gate.cutoff(cutoff(round, work, token))),
    GateDenied{round, work})

def selected_count(+unit: Nat, selected: List<&2, Nat>) -> Nat:
  match selected:
    case Nil{}:
      0n
    case head <> rest:
      (Bool.pick(Nat, Nat.is_eq(head, unit), 1n, 0n) + selected_count(unit, rest) : Nat)

def selected_valid(+work: Work.Work, +selected: List<&2, Nat>,
    remaining: List<&2, Nat>) -> Bool:
  match remaining:
    case Nil{}:
      True{}
    case +unit <> rest:
      Bool.and(Nat.is_gt(unit, 0n),
        Bool.and(Nat.is_le(selected_count(unit, selected), Work.pending_for(work, unit)),
          selected_valid(work, selected, rest)))

# The encoded host batch was measured by the adapter and selected by Handoff.
# These exact unit IDs must still exist as pending findings when the resident
# atomically consumes a continuation slot before output authorization.
def reserve_selected(+round: Round.Round, work: Work.Work, token: Nat,
    +selected: List<&2, Nat>) -> Round.Step:
  Bool.pick(Round.Step,
    Bool.and(Nat.is_gt(List.length(&2, Nat, selected), 0n),
      selected_valid(work, selected, selected)),
    Round.reserve_output(round, token), Round.Denied{round})

def release_unwritten(round: Round.Round, token: Nat) -> Round.Step:
  Round.release_output(round, token)

# Retain the exact selected work-unit sequence across the IPC write boundary.
# Work findings remain pending for the one permitted Stop reoffer after an
# uncertain background write; this ledger consumes the output reservation.
type OutputSelection is Data:
  OutputSelection{selected: List<&2, Nat>, authorized: Bool, consumed: Bool}

type OutputSelectionStep is Data:
  SelectionGranted{state: OutputSelection}
  SelectionDenied{state: OutputSelection}

type OutputSelectionReservation is Data:
  SelectionReserved{state: OutputSelection}
  SelectionRejected{}

def selection_reserve(+work: Work.Work, +selected: List<&2, Nat>) -> OutputSelectionReservation:
  Bool.pick(OutputSelectionReservation,
    Bool.and(Nat.is_gt(List.length(&2, Nat, selected), 0n),
      selected_valid(work, selected, selected)),
    SelectionReserved{OutputSelection{selected, False{}, False{}}}, SelectionRejected{})

def selection_authorize(+state: OutputSelection) -> OutputSelectionStep:
  match state:
    case OutputSelection{+selected, +authorized, +consumed}:
      Bool.pick(OutputSelectionStep, Bool.and(Bool.not(authorized), Bool.not(consumed)),
        SelectionGranted{OutputSelection{selected, True{}, False{}}}, SelectionDenied{state})

def selection_same(left: List<&2, Nat>, right: List<&2, Nat>) -> Bool:
  match left:
    case Nil{}:
      match right:
        case Nil{}:
          True{}
        case _:
          False{}
    case head <> tail:
      match right:
        case Nil{}:
          False{}
        case other <> rest:
          Bool.and(Nat.is_eq(head, other), selection_same(tail, rest))

def selection_consume(+state: OutputSelection, +actual: List<&2, Nat>) -> OutputSelectionStep:
  match state:
    case OutputSelection{+selected, +authorized, +consumed}:
      Bool.pick(OutputSelectionStep,
        Bool.and(authorized, Bool.and(Bool.not(consumed), selection_same(selected, actual))),
        SelectionGranted{OutputSelection{selected, True{}, True{}}}, SelectionDenied{state})

type FinishDisposition is Data:
  ReserveFindings{}
  PassNotices{}
  AllowNoAdvice{}
  AllowDeadline{}
  AllowUnavailable{}

def finish_disposition.empty(has_notice: Bool, pass_notices: Bool,
    deadline_reached: Bool) -> FinishDisposition:
  Bool.pick(FinishDisposition, Bool.and(has_notice, pass_notices), PassNotices{},
    Bool.pick(FinishDisposition, deadline_reached, AllowDeadline{}, AllowNoAdvice{}))

def finish_disposition.selected(+work: Work.Work, +selected: List<&2, Nat>,
    binding_valid: Bool) -> FinishDisposition:
  Bool.pick(FinishDisposition,
    Bool.and(binding_valid, selected_valid(work, selected, selected)),
    ReserveFindings{}, AllowUnavailable{})

# The adapter supplies the exact final Handoff selection and native writer
# availability. Bend decides whether those unit IDs reserve output, notices
# pass without a continuation, or Stop closes with a specific reason.
def finish_disposition.valid(work: Work.Work, +selected: List<&2, Nat>,
    has_notice: Bool, pass_notices: Bool,
    deadline_reached: Bool) -> FinishDisposition:
  match selected:
    case Nil{}:
      finish_disposition.empty(has_notice, pass_notices, deadline_reached)
    case _:
      finish_disposition.selected(work, selected, True{})

def finish_disposition.writable(work: Work.Work, selected: List<&2, Nat>,
    has_notice: Bool, pass_notices: Bool, binding_valid: Bool,
    deadline_reached: Bool) -> FinishDisposition:
  match binding_valid:
    case False{}:
      AllowUnavailable{}
    case True{}:
      finish_disposition.valid(work, selected, has_notice, pass_notices, deadline_reached)

def finish_disposition(work: Work.Work, selected: List<&2, Nat>,
    has_notice: Bool, pass_notices: Bool, can_write: Bool,
    binding_valid: Bool, deadline_reached: Bool) -> FinishDisposition:
  match can_write:
    case False{}:
      finish_disposition.empty(False{}, False{}, deadline_reached)
    case True{}:
      finish_disposition.writable(work, selected, has_notice, pass_notices,
        binding_valid, deadline_reached)

type FinishOutput is Data:
  OutputReserved{round: Round.Round, selection: OutputSelection}
  OutputNotices{}
  OutputAllowed{reason: FinishDisposition}

def finish_output.slot(selection: OutputSelection, step: Round.Step) -> FinishOutput:
  match step:
    case Round.Granted{round}:
      OutputReserved{round, selection}
    case Round.Denied{_}:
      OutputAllowed{AllowUnavailable{}}

def finish_output.reservation(round: Round.Round, work: Work.Work, token: Nat,
    selected: List<&2, Nat>, reservation: OutputSelectionReservation) -> FinishOutput:
  match reservation:
    case SelectionReserved{selection}:
      finish_output.slot(selection, reserve_selected(round, work, token, selected))
    case SelectionRejected{}:
      OutputAllowed{AllowUnavailable{}}

def finish_output.reserve(+round: Round.Round, +work: Work.Work, token: Nat,
    +selected: List<&2, Nat>) -> FinishOutput:
  finish_output.reservation(round, work, token, selected,
    selection_reserve(work, selected))

def finish_output.decide(round: Round.Round, work: Work.Work, token: Nat,
    selected: List<&2, Nat>, disposition: FinishDisposition) -> FinishOutput:
  match disposition:
    case ReserveFindings{}:
      finish_output.reserve(round, work, token, selected)
    case PassNotices{}:
      OutputNotices{}
    case AllowNoAdvice{}:
      OutputAllowed{AllowNoAdvice{}}
    case AllowDeadline{}:
      OutputAllowed{AllowDeadline{}}
    case AllowUnavailable{}:
      OutputAllowed{AllowUnavailable{}}

# One production result joins selected pending work, writer authority, and the
# Round continuation slot. The adapter commits it only after native lease
# staging succeeds; acknowledgement later consumes its OutputSelection.
def finish_output(+round: Round.Round, +work: Work.Work, token: Nat,
    +selected: List<&2, Nat>, has_notice: Bool, pass_notices: Bool,
    can_write: Bool, binding_valid: Bool, deadline_reached: Bool) -> FinishOutput:
  finish_output.decide(round, work, token, selected,
    finish_disposition(work, selected, has_notice, pass_notices,
      can_write, binding_valid, deadline_reached))

def initial(partition: Nat, lifetime: Nat) -> Lifecycle:
  Lifecycle{Admission.initial(partition, lifetime), Work.initial(), Handoff.finish.initial(0n)}

def issue.result(work: Work.Work, finish: Handoff.Finish, result: Admission.AdmissionResult) -> LifecycleResult:
  match result:
    case Admission.Accepted{admission, token, _}:
      match token:
        case Some{value}:
          Advanced{Lifecycle{admission, work, finish}, PermitIssued{value}}
        case None{}:
          Denied{Lifecycle{admission, work, finish}}
    case Admission.Rejected{admission, _}:
      Denied{Lifecycle{admission, work, finish}}

def issue(state: Lifecycle, partition: Nat, lifetime: Nat, tool: Nat, started: Nat, deadline: Nat, now: Nat) -> LifecycleResult:
  match state:
    case Lifecycle{admission, work, finish}:
      issue.result(work, finish, Admission.step(admission, partition, lifetime,
        Admission.Issue{tool, started, deadline, now}))

def finish_for_commit(earlier: Bool, current: Handoff.Finish, round: Nat) -> Handoff.Finish:
  match earlier:
    case True{}:
      current
    case False{}:
      Handoff.finish.initial(round)

def commit.work(admission: Admission.AdmissionState, work_result: Work.WorkStep,
    finish: Handoff.Finish) -> LifecycleResult:
  match work_result:
    case Work.Accepted{work, ids}:
      Advanced{Lifecycle{admission, work, finish}, ObservationAdmitted{ids}}
    case Work.Rejected{work, _}:
      Denied{Lifecycle{admission, work, finish}}

def commit.accept(work: Work.Work, finish: Handoff.Finish, earlier: Bool,
    result: Admission.AdmissionResult) -> LifecycleResult:
  match result:
    case Admission.Accepted{admission, _, round}:
      match round:
        case Some{value}:
          commit.work(admission, Work.admit(work), finish_for_commit(earlier, finish, value))
        case None{}:
          Denied{Lifecycle{admission, work, finish}}
    case Admission.Rejected{admission, _}:
      Denied{Lifecycle{admission, work, finish}}

def commit(state: Lifecycle, partition: Nat, lifetime: Nat, permit: Nat, tool: Nat, now: Nat) -> LifecycleResult:
  match state:
    case Lifecycle{+admission, work, finish}:
      match admission:
        case Admission.AdmissionState{_, _, _, active, _, _, _}:
          commit.accept(work, finish, active, Admission.step(admission, partition, lifetime,
            Admission.Consume{permit, tool, now}))

def prepared.result(admission: Admission.AdmissionState, finish: Handoff.Finish,
    result: Work.WorkStep) -> LifecycleResult:
  match result:
    case Work.Accepted{work, ids}:
      Advanced{Lifecycle{admission, work, finish}, UnitsAdmitted{ids}}
    case Work.Rejected{work, _}:
      Denied{Lifecycle{admission, work, finish}}

def prepared.guard(state: Lifecycle, observation: Nat, count: Nat, current: Bool) -> LifecycleResult:
  match state:
    case Lifecycle{admission, work, finish}:
      match current:
        case True{}:
          prepared.result(admission, finish, Work.prepare(work, observation, count))
        case False{}:
          Denied{Lifecycle{admission, work, finish}}

def prepared(+state: Lifecycle, partition: Nat, lifetime: Nat, round: Nat, observation: Nat, count: Nat) -> LifecycleResult:
  match state:
    case Lifecycle{admission, _, _}:
      prepared.guard(state, observation, count,
        Admission.callback_current(admission, partition, lifetime, round))

def reviewed.result(admission: Admission.AdmissionState, finish: Handoff.Finish,
    result: Work.WorkStep) -> LifecycleResult:
  match result:
    case Work.Accepted{work, _}:
      Advanced{Lifecycle{admission, work, finish}, OutcomeRecorded{}}
    case Work.Rejected{work, _}:
      Denied{Lifecycle{admission, work, finish}}

def reviewed.guard(state: Lifecycle, unit: Nat, outcome: Work.Outcome, current: Bool) -> LifecycleResult:
  match state:
    case Lifecycle{admission, work, finish}:
      match current:
        case True{}:
          reviewed.result(admission, finish, Work.outcome(work, unit, outcome))
        case False{}:
          Denied{Lifecycle{admission, work, finish}}

def reviewed(+state: Lifecycle, partition: Nat, lifetime: Nat, round: Nat, unit: Nat, outcome: Work.Outcome) -> LifecycleResult:
  match state:
    case Lifecycle{admission, _, _}:
      reviewed.guard(state, unit, outcome,
        Admission.callback_current(admission, partition, lifetime, round))

def interrupt.result(admission: Admission.AdmissionState, finish: Handoff.Finish,
    result: Work.WorkStep) -> LifecycleResult:
  match result:
    case Work.Accepted{work, _}:
      Advanced{Lifecycle{admission, work, finish}, WorkInterrupted{}}
    case Work.Rejected{work, _}:
      Denied{Lifecycle{admission, work, finish}}

def interrupt.valid(admission: Admission.AdmissionState, work: Work.Work,
    finish: Handoff.Finish, id: Nat, source: Bool) -> LifecycleResult:
  match source:
    case True{}:
      interrupt.result(admission, finish, Work.interrupt_observation(work, id))
    case False{}:
      interrupt.result(admission, finish, Work.interrupt_unit(work, id))

def interrupt.guard(state: Lifecycle, id: Nat, source: Bool, current: Bool) -> LifecycleResult:
  match state:
    case Lifecycle{admission, work, finish}:
      match current:
        case True{}:
          interrupt.valid(admission, work, finish, id, source)
        case False{}:
          Denied{Lifecycle{admission, work, finish}}

def interrupt(+state: Lifecycle, partition: Nat, lifetime: Nat, round: Nat, id: Nat, source: Bool) -> LifecycleResult:
  match state:
    case Lifecycle{admission, _, _}:
      interrupt.guard(state, id, source,
        Admission.callback_current(admission, partition, lifetime, round))

def allow.closed(admission_result: Admission.AdmissionResult, closed_work: Work.CloseResult,
    finish: Handoff.Finish) -> LifecycleResult:
  match admission_result:
    case Admission.Accepted{admission, _, _}:
      match closed_work:
        case Work.Closed{work, source, jev, discarded}:
          Advanced{Lifecycle{admission, work, finish}, Allow{source, jev, discarded}}
    case Admission.Rejected{admission, _}:
      match closed_work:
        case Work.Closed{work, _, _, _}:
          Denied{Lifecycle{admission, work, finish}}

def finish.continue.bound(admission: Admission.AdmissionState, work: Work.Work,
    +finish: Handoff.Finish) -> LifecycleResult:
  match finish:
    case Handoff.Finish{_, _, _, slot, _, token, _, _}:
      Advanced{Lifecycle{admission, work, finish}, Continue{slot, token}}

def finish.continue(admission: Admission.AdmissionState, work: Work.Work,
    finish: Handoff.Finish, collector: Nat) -> LifecycleResult:
  finish.continue.bound(admission, work, Handoff.finish.bind_writer(finish, collector))

def finish.result(admission: Admission.AdmissionState, work: Work.Work, at: Nat, collector: Nat,
    result: Handoff.FinishResult) -> LifecycleResult:
  match result:
    case Handoff.FinishWait{finish}:
      Advanced{Lifecycle{admission, work, finish}, FinishWaiting{}}
    case Handoff.Continue{finish}:
      finish.continue(admission, work, finish, collector)
    case Handoff.Allow{finish}:
      allow.closed(Admission.close_round(admission, at), Work.close(work), finish)

def finish.guard(state: Lifecycle, original_deadline: Nat, actionable: Nat, +at: Nat,
    collector: Nat, current: Bool) -> LifecycleResult:
  match state:
    case Lifecycle{admission, +work, finish}:
      match current:
        case True{}:
          finish.result(admission, work, at, collector,
            Handoff.finish.decide_at(finish, Work.unfinished(work), at, original_deadline, actionable))
        case False{}:
          Denied{Lifecycle{admission, work, finish}}

def finish_check(+state: Lifecycle, partition: Nat, lifetime: Nat, round: Nat,
    +original_deadline: Nat, +actionable: Nat, at: Nat, +collector: Nat) -> LifecycleResult:
  match state:
    case Lifecycle{admission, work, _}:
      finish.guard(state, original_deadline, actionable, at, collector,
        Bool.and(Admission.callback_current(admission, partition, lifetime, round),
          Bool.and(Nat.is_gt(original_deadline, 0n),
            Bool.and(Nat.is_gt(collector, 0n),
              Nat.is_le(actionable, Work.pending_findings(work))))))

def write.guard(state: Lifecycle, round: Nat, slot: Nat, token: Nat, collector: Nat, current: Bool) -> LifecycleResult:
  match state:
    case Lifecycle{admission, work, finish}:
      match current:
        case True{}:
          Advanced{Lifecycle{admission, work, Handoff.finish.complete(finish, round, slot, token, collector)}, WriteSettled{}}
        case False{}:
          Denied{Lifecycle{admission, work, finish}}

def write_terminal(+state: Lifecycle, partition: Nat, lifetime: Nat, +round: Nat, +slot: Nat,
    +token: Nat, +collector: Nat) -> LifecycleResult:
  match state:
    case Lifecycle{admission, _, finish}:
      write.guard(state, round, slot, token, collector,
        Bool.and(Admission.callback_current(admission, partition, lifetime, round),
          Handoff.finish.can_complete(finish, round, slot, token, collector)))

def apply(state: Lifecycle, partition: Nat, lifetime: Nat, round: Nat,
    event: LifecycleEvent) -> LifecycleResult:
  match event:
    case Issue{tool, started, deadline, now}:
      issue(state, partition, lifetime, tool, started, deadline, now)
    case Commit{permit, tool, now}:
      commit(state, partition, lifetime, permit, tool, now)
    case Prepared{observation, count}:
      prepared(state, partition, lifetime, round, observation, count)
    case Reviewed{unit, outcome}:
      reviewed(state, partition, lifetime, round, unit, outcome)
    case SourceInterrupted{observation}:
      interrupt(state, partition, lifetime, round, observation, True{})
    case ReviewInterrupted{unit}:
      interrupt(state, partition, lifetime, round, unit, False{})
    case FinishCheck{original_deadline, actionable, at, collector}:
      finish_check(state, partition, lifetime, round, original_deadline, actionable, at, collector)
    case WriteTerminal{slot, token, collector}:
      write_terminal(state, partition, lifetime, round, slot, token, collector)

def main() -> LifecycleResult:
  apply(initial(1n, 1n), 1n, 1n, 0n, Issue{2n, 1n, 5n, 1n})
