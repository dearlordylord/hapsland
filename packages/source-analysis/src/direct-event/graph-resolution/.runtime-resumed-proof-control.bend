import Base
import ./RuntimeModel.bend as R
import ./RuntimeSpecification.bend as Specification
import ./RuntimeLawObservation.bend as Observation
import ./Types.bend as T
import ./Loop.bend as L
import ./Machine.bend as M
import ./Environment.bend as E
import ./WholeObservation.bend as O
import ./RuntimeTraceProof.bend as Lists

# Direct row correspondence. Associativity only reconciles ordered trace
# grouping; it does not introduce a different graph representation.
def resumed_exact(~World: Data, ~observe: T.ExceptionToken -> World -> O.Error,
    +step: L.Continuation, +invocation: Nat, +next: Nat, +world: World,
    +effects: List<&2, O.Effect>, +actions: List<&2, R.Action>) -> {
  R.resumed(World, step, observe, invocation, next, E.WorldState{world, effects}, actions)
  == Specification.publish(World, step, observe, invocation, next, world, effects, actions)
  : R.State<World>
}:
  match step:
    case L.ServiceStep{T.FailedResolver{T.ForeignProviderFailure{+exception}}}:
      Equal.cong(List<&2, R.Action>, R.State<World>,
        out => R.State{invocation, R.RuntimeClosed{},
          R.RuntimeReturned{step, Some{observe(exception, world)}}, None{}, next,
          E.WorldState{world, effects}, out},
        List.append(&2, R.Action,
          List.append(&2, R.Action, actions,
            R.ExceptionObserved{exception, observe(exception, world)} <> []),
          R.RegistryClosed{invocation} <> []),
        List.append(&2, R.Action, actions,
          R.ExceptionObserved{exception, observe(exception, world)} <>
          R.RegistryClosed{invocation} <> []),
        Lists.append_assoc(&2, R.Action, actions,
          R.ExceptionObserved{exception, observe(exception, world)} <> [],
          R.RegistryClosed{invocation} <> []))
    case L.ServiceStep{T.FailedResolver{T.WrongInvocation{_, _}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.WrongCorrelation{_, _}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.WrongReplyKind{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.MalformedReply{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.LocalTraversalFailure{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.NegativeGraphWork{_}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.RuntimeFailure{_}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.InvocationCancelled{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.ReplyAfterTerminal{}}}: {==}
    case L.ServiceStep{T.AwaitService{_, _}}: {==}
    case L.ServiceStep{T.FinishedResolver{_, _}}: {==}
    case L.PrepareRust{_}: {==}
    case L.PreparedRust{_, _, _}: {==}
    case L.RustAdvance{_, _}: {==}
    case L.RustInvalid{_}: {==}
    case L.RustFollowInvalid{_}: {==}
    case L.RustFindCargo{_}: {==}
    case L.RustCargoContinue{_}: {==}
    case L.RustFollow{_, _, _}: {==}
    case L.RustCargo{_, _}: {==}
    case L.RustModules{_, _}: {==}
    case L.RustTasks{_, _}: {==}
    case L.ResolvePending{_, _}: {==}
    case L.CheckTarget{_, _}: {==}
    case L.ReadTarget{_, _}: {==}
    case L.InspectCaptured{_, _}: {==}
    case L.ReadBundled{_, _, _, _}: {==}
    case L.PrepareImportedRust{_}: {==}

def main() -> Unit:
  Unit{}
