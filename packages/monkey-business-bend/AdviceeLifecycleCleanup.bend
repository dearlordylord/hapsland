import Base
import ./AdviceeLifecycle.bend as Lifecycle
import ./Driver.bend as Driver
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Dispatch.bend as Dispatch
import ../agent-flow-bend/Admission.bend as Admission

# Captured cleanup intentions only. Running effects and original callbacks stay
# live until their factual completion; no terminal result is invented here.
type CleanupPlan is Data:
  CleanupPlan{actions: List<&2, Driver.Action>, operations: List<&2, Nat>}

def select_operation(owned: Bool, id: Nat, tail: List<&2, Nat>) -> List<&2, Nat>:
  match owned:
    case True{}: id <> tail
    case False{}: tail

def work_operations(work: List<&2, Canonical.Work>, +owner: Nat, +generation: Nat) -> List<&2, Nat>:
  match work:
    case Nil{}: []
    case Canonical.Work{p, l, _, id, _, _, _} <> tail:
      select_operation(Nat.is_eq(p, owner) && Nat.is_eq(l, generation), id, work_operations(tail, owner, generation))

def dispatch_operations(entries: List<&2, Dispatch.Entry>, +owner: Nat, +generation: Nat) -> List<&2, Nat>:
  match entries:
    case Nil{}: []
    case Dispatch.Entry{p, l, _, id, _, _, _} <> tail:
      select_operation(Nat.is_eq(p, owner) && Nat.is_eq(l, generation), id, dispatch_operations(tail, owner, generation))

def release_permits(permits: List<&2, Admission.Permit>, +owner: Nat, +generation: Nat) -> List<&2, Driver.Action>:
  match permits:
    case Nil{}: []
    case Admission.Permit{token, _, _, _, _} <> tail:
      Driver.immediate(Canonical.ReleasePermit{owner, generation, token}, False{}) <> release_permits(tail, owner, generation)

def admission_actions(active: Bool, owner: Nat, generation: Nat, round: Nat, now: Nat,
    permits: List<&2, Admission.Permit>) -> List<&2, Driver.Action>:
  match active:
    case True{}: [Driver.immediate(Canonical.ClosePermitRound{owner, generation, round, now}, False{})]
    case False{}: release_permits(permits, owner, generation)

def admission_found(found: Maybe<&2, Admission.AdmissionState>, +generation: Nat, now: Nat) -> List<&2, Driver.Action>:
  match found:
    case None{}: []
    case Some{Admission.AdmissionState{owner, +lifetime, round, active, _, _, permits}}:
      Bool.pick(List<&2, Driver.Action>, Nat.is_eq(lifetime, generation),
        admission_actions(active, owner, lifetime, round, now, permits), [])

def retire_found(found: Maybe<&2, Canonical.Round>, +generation: Nat) -> List<&2, Driver.Action>:
  match found:
    case None{}: []
    case Some{Canonical.Round{owner, +lifetime, round, _, _, _, _, _}}:
      Bool.pick(List<&2, Driver.Action>, Nat.is_eq(lifetime, generation),
        [Driver.immediate(Canonical.RetirePartition{owner, lifetime, round}, False{})], [])

def discard_named(operations: List<&2, Nat>) -> List<&2, Driver.Action>:
  match operations:
    case Nil{}: []
    case head <> tail: [Driver.immediate(Canonical.DiscardDispatch{head <> tail}, False{})]

def forget_found(found: Maybe<&2, Admission.AdmissionState>, +generation: Nat) -> List<&2, Driver.Action>:
  match found:
    case None{}: []
    case Some{Admission.AdmissionState{owner, +lifetime, _, _, _, _, _}}:
      Bool.pick(List<&2, Driver.Action>, Nat.is_eq(lifetime, generation),
        [Driver.immediate(Canonical.ForgetAdmission{owner, lifetime}, False{})], [])

def captured_cleanup(state: Canonical.State, +owner: Nat, +generation: Nat, now: Nat) -> CleanupPlan:
  match state:
    case Canonical.State{_, +rounds, work, _, _, +admissions, Dispatch.State{queued, running, _, _, _}, _, _}:
      +operations = List.append(&2, Nat, dispatch_operations(queued, owner, generation), dispatch_operations(running, owner, generation))
      CleanupPlan{List.append(&2, Driver.Action,
        admission_found(Canonical.find_admission(owner, admissions), generation, now),
        List.append(&2, Driver.Action, retire_found(Canonical.find_round(owner, rounds), generation),
        List.append(&2, Driver.Action, discard_named(operations),
          forget_found(Canonical.find_admission(owner, admissions), generation)))),
        List.append(&2, Nat, work_operations(work, owner, generation), operations)}

def cleanup(state: Canonical.State, entry: Lifecycle.Entry, now: Nat) -> CleanupPlan:
  match entry:
    case Lifecycle.Entry{owner, generation, _}: captured_cleanup(state, owner, generation, now)

def cleanup_if(departed: Bool, state: Canonical.State, entry: Lifecycle.Entry, now: Nat) -> CleanupPlan:
  match departed:
    case True{}: cleanup(state, entry, now)
    case False{}: CleanupPlan{[], []}

def plan(state: Canonical.State, changed: Lifecycle.Changed, now: Nat) -> CleanupPlan:
  match changed:
    case Lifecycle.Changed{_, Some{+before}, Some{after}, True{}}:
      cleanup_if(Lifecycle.entry_active(before) && Bool.not(Lifecycle.entry_active(after)), state, before, now)
    case _: CleanupPlan{[], []}
