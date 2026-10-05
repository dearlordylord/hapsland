import Base
import ./Driver.bend as Driver
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/CollectionState.bend as CollectionState
import ../agent-flow-bend/Dispatch.bend as Dispatch

def preparation_parent(found: Maybe<&2, Canonical.Work>) -> List<&2, Driver.Action>:
  match found:
    case Some{Canonical.Work{+p, +l, +r, _, _, _, 0n}}: Nil{}
    case Some{Canonical.Work{+p, +l, +r, _, _, _, +parent}}:
      [Driver.immediate(Canonical.CompleteObservation{p, l, r, parent}, False{}), Driver.immediate(Canonical.DispatchSettled{p, l, r, parent}, False{})]
    case None{}: Nil{}

def settlement_if(running: Bool, p: Nat, l: Nat, r: Nat, o: Nat) -> List<&2, Driver.Action>:
  match running:
    case True{}: [Driver.immediate(Canonical.DispatchSettled{p, l, r, o}, False{})]
    case False{}: Nil{}

def released(+before: Canonical.State, event: Canonical.CanonicalEvent) -> List<&2, Driver.Action>:
  match event:
    case Canonical.PreparationCompleted{p, l, r, o, _}:
      preparation_parent(Canonical.find_work(p, l, r, o, Driver.work_list(before)))
    case Canonical.JevRequestSettled{+p, +l, +r, +o, _, _, _}:
      settlement_if(Dispatch.contains(Driver.running(before), p, l, r, o), p, l, r, o)
    case _: Nil{}

def ready_ids(state: Canonical.State) -> List<&2, Nat>:
  match state:
    case Canonical.State{_, _, _, _, _, _, _, CollectionState.State{ready, _, _, _, _, _, _}, _}: ready

def readiness_if(ready: Bool, p: Nat, l: Nat, r: Nat, o: Nat, parent: Nat, rest: List<&2, Driver.Action>) -> List<&2, Driver.Action>:
  match ready:
    case True{}: rest
    case False{}: Driver.immediate(Canonical.CollectionReady{o, p, l, r, parent, False{}}, False{}) <> rest

def readiness(work: List<&2, Canonical.Work>, +ready: List<&2, Nat>) -> List<&2, Driver.Action>:
  match work:
    case Nil{}: Nil{}
    case Canonical.Work{p, l, r, +o, _, Canonical.PendingFinding{_}, +parent} <> rest:
      readiness_if(CollectionState.contains(o, ready) || Nat.is_eq(parent, 0n), p, l, r, o, parent, readiness(rest, ready))
    case _ <> rest: readiness(rest, ready)

def refresh(event: Canonical.CanonicalEvent) -> Bool:
  match event:
    case Canonical.CompleteObservation{_, _, _, _}: True{}
    case Canonical.JevRequestSettled{_, _, _, _, _, _, _}: True{}
    case Canonical.ReviewCompleted{_, _, _, _, _}: True{}
    case Canonical.InterruptObservation{_, _, _, _}: True{}
    case Canonical.InterruptPreparation{_, _, _, _}: True{}
    case Canonical.StopPolled{_, _, _, _}: True{}
    case _: False{}

def ready_actions(should: Bool, +after: Canonical.State) -> List<&2, Driver.Action>:
  match should:
    case True{}: readiness(Driver.work_list(after), ready_ids(after))
    case False{}: Nil{}

def actions(before: Canonical.State, after: Canonical.State, +event: Canonical.CanonicalEvent) -> List<&2, Driver.Action>:
  List.append(&2, Driver.Action, released(before, event), ready_actions(refresh(event), after))
