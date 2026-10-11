import Base
import ./RuntimeModel.bend as R
import ./RuntimeInvariant.bend as I
import ./RuntimeCancellationPhaseProof.bend as Cancellation
import ./RuntimeLawObservation.bend as Observation
import ./Types.bend as T
import ./Loop.bend as L
import ./Environment.bend as E
import ./WholeObservation.bend as O

# Exact original cancellation prefix; arbitrary providers and finite prefixes.
def filter_retired(+actions: List<&2, R.Action>, +lease: O.ProviderLease) -> {
  Observation.machine_actions(R.actions_append(actions, R.ProviderRetired{lease}))
  == Observation.machine_actions(actions)
  : List<&2, R.Action>
}:
  match actions:
    case []: {==}
    case R.ProviderRetired{_} <> tail: filter_retired(tail, lease)
    case R.ServiceInvoked{+x} <> +tail:
      %filter_retired(tail, lease) : {
        R.ServiceInvoked{
          x
        } <> Observation.machine_actions(R.actions_append(tail, R.ProviderRetired{lease}))
        == R.ServiceInvoked{x} <> _
        : List<&2, R.Action>
      }
      {==}
    case R.ServiceResumed{+x} <> +tail:
      %filter_retired(tail, lease) : {
        R.ServiceResumed{
          x
        } <> Observation.machine_actions(R.actions_append(tail, R.ProviderRetired{lease}))
        == R.ServiceResumed{x} <> _
        : List<&2, R.Action>
      }
      {==}
    case R.CancellationObserved{+x} <> +tail:
      %filter_retired(tail, lease) : {
        R.CancellationObserved{
          x
        } <> Observation.machine_actions(R.actions_append(tail, R.ProviderRetired{lease}))
        == R.CancellationObserved{x} <> _
        : List<&2, R.Action>
      }
      {==}
    case R.ExceptionObserved{+x, +y} <> +tail:
      %filter_retired(tail, lease) : {
        R.ExceptionObserved{
          x,
          y
        } <> Observation.machine_actions(R.actions_append(tail, R.ProviderRetired{lease}))
        == R.ExceptionObserved{x, y} <> _
        : List<&2, R.Action>
      }
      {==}
    case R.RegistryClosed{+x} <> +tail:
      %filter_retired(tail, lease) : {
        R.RegistryClosed{
          x
        } <> Observation.machine_actions(R.actions_append(tail, R.ProviderRetired{lease}))
        == R.RegistryClosed{x} <> _
        : List<&2, R.Action>
      }
      {==}

def late_machine(
  ~World: Data,
  +completion: E.Completion<World>,
  +invocation: Nat,
  +next: Nat,
  +execution: R.Execution,
  +world: E.WorldState<World>,
  +actions: List<&2, R.Action>
) -> {
   Observation.machine(
     World,
     R.late_completion(World, completion, invocation, next, execution, world, actions)
   )
   == Observation.MachineObservation{
     invocation,
     R.RuntimeClosed{},
     execution,
     next,
     Observation.machine_actions(actions)
   }
   : Observation.MachineObservation
 }:
  match completion world:
    case E.Completion{+lease, _, _, _} E.WorldState{_, _}:
      %filter_retired(actions, lease) : {
        Observation.machine(
          World,
          R.late_completion(World, completion, invocation, next, execution, world, actions)
        )
        == Observation.MachineObservation{invocation, R.RuntimeClosed{}, execution, next, _}
        : Observation.MachineObservation
      }
      {==}

def cancel_row_machine(
  ~World: Data,
  matches: Bool,
  +state: R.State<World>,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
  Observation.machine(World, R.cancellation(World, matches, state))
  == Observation.machine(World, state)
  : Observation.MachineObservation
}:
  match matches state:
    case False{} _: {==}
    case True{} R.State{_, R.RuntimeClosed{}, _, _, _, _, _}: {==}
    case True{} R.State{_, R.RuntimeOpen{}, _, _, _, _, _}:
      Empty.absurd({Observation.machine(World, R.cancellation(World, True{}, state))
        == Observation.machine(World, state) : Observation.MachineObservation},
        Cancellation.true_ne_false(frozen))

def cancel_machine(
  ~World: Data,
  +state: R.State<World>,
  actual: Nat,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
  Observation.machine(World, R.cancel(World, state, actual))
  == Observation.machine(World, state)
  : Observation.MachineObservation
}:
  match state:
    case R.State{+invocation, _, _, _, _, _, _}: cancel_row_machine(
      ~World,
      Nat.is_eq(invocation, actual),
      state,
      frozen
    )

def advance_machine(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +state: R.State<World>,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
   Observation.machine(World, R.advance(World, state, respond, observe))
   == Observation.machine(World, state)
   : Observation.MachineObservation
 }:
  match state:
    case R.State{_, R.RuntimeClosed{}, _, _, _, _, _}: {==}
    case R.State{_, R.RuntimeOpen{}, _, _, _, _, _}:
      Empty.absurd({Observation.machine(World, R.advance(World, state, respond, observe))
        == Observation.machine(World, state) : Observation.MachineObservation},
        Cancellation.true_ne_false(frozen))

def owner_machine(
  ~World: Data,
  ~observe: T.ExceptionToken -> World -> O.Error,
  matches: Bool,
  +state: R.State<World>,
  completion: E.Completion<World>,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
   Observation.machine(World, R.completed_owner(World, matches, state, completion, observe))
   == Observation.machine(World, state)
   : Observation.MachineObservation
 }:
  match matches state:
    case False{} _: {==}
    case True{} R.State{_, R.RuntimeOpen{}, _, _, _, _, _}:
      Empty.absurd(
        {
          Observation.machine(World, R.completed_owner(World, True{}, state, completion, observe))
          == Observation.machine(World, state)
          : Observation.MachineObservation
        },
        Cancellation.true_ne_false(frozen)
      )
    case True{} R.State{_, R.RuntimeClosed{}, R.RuntimeReady{_}, _, _, _, _}:
      Empty.absurd(
        {
          Observation.machine(World, R.completed_owner(World, True{}, state, completion, observe))
          == Observation.machine(World, state)
          : Observation.MachineObservation
        },
        Cancellation.true_ne_false(frozen)
      )
    case True{} R.State{_, R.RuntimeClosed{}, R.RuntimeWaiting{_}, _, _, _, _}:
      Empty.absurd(
        {
          Observation.machine(World, R.completed_owner(World, True{}, state, completion, observe))
          == Observation.machine(World, state)
          : Observation.MachineObservation
        },
        Cancellation.true_ne_false(frozen)
      )
    case True{} R.State{_, R.RuntimeClosed{}, R.RuntimeReturned{_, _}, Some{_}, _, _, _}:
      Empty.absurd(
        {
          Observation.machine(World, R.completed_owner(World, True{}, state, completion, observe))
          == Observation.machine(World, state)
          : Observation.MachineObservation
        },
        Cancellation.true_ne_false(frozen)
      )
    case True{} R.State{_, R.RuntimeClosed{}, R.RuntimeReturned{_, _}, None{}, _, _, _}: {==}
    case True{} R.State{_, R.RuntimeClosed{}, R.RuntimeCancelled{_}, None{}, _, _, _}: {==}
    case True{} R.State{
      +invocation,
      R.RuntimeClosed{},
      R.RuntimeCancelled{+step},
      Some{_},
      +next,
      +world,
      +actions
    }:
      late_machine(~World, completion, invocation, next, R.RuntimeCancelled{step}, world, actions)

def complete_machine(
  ~World: Data,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +state: R.State<World>,
  +completion: E.Completion<World>,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
   Observation.machine(World, R.complete(World, state, completion, observe))
   == Observation.machine(World, state)
   : Observation.MachineObservation
 }:
  match state completion:
    case R.State{_, _, _, Some{R.RuntimeProvider{_, expected}}, _, _, _} E.Completion{
      actual,
      _,
      _,
      _
    }:
      owner_machine(~World, ~observe, E.same_lease(expected, actual), state, completion, frozen)
    case R.State{_, _, _, None{}, _, _, _} E.Completion{_, _, _, _}: {==}

def step_machine(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +state: R.State<World>,
  item: R.RuntimeEvent<World>,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
   Observation.machine(World, R.event(World, state, item, respond, observe))
   == Observation.machine(World, state)
   : Observation.MachineObservation
 }:
  match item:
    case R.RuntimeAdvance{}: advance_machine(~World, ~respond, ~observe, state, frozen)
    case R.RuntimeCancel{actual}: cancel_machine(~World, state, actual, frozen)
    case R.RuntimeComplete{completion}: complete_machine(
      ~World,
      ~observe,
      state,
      completion,
      frozen
    )

def late_frozen(~World: Data, completion: E.Completion<World>, invocation: Nat,
 next: Nat, step: L.Continuation, world: E.WorldState<World>, actions: List<&2, R.Action>) -> {
   True{}
   == I.frozen(
     World,
     R.late_completion(
       World,
       completion,
       invocation,
       next,
       R.RuntimeCancelled{step},
       world,
       actions
     )
   )
   : Bool
 }:
  match completion world:
    case E.Completion{_, _, _, _} E.WorldState{_, _}: {==}

def cancel_row_frozen(
  ~World: Data,
  matches: Bool,
  +state: R.State<World>,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {True{} == I.frozen(World, R.cancellation(World, matches, state)) : Bool}:
  match matches state:
    case False{} _: frozen
    case True{} R.State{_, R.RuntimeClosed{}, _, _, _, _, _}: frozen
    case True{} R.State{_, R.RuntimeOpen{}, _, _, _, _, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        Cancellation.true_ne_false(frozen)
      )

def advance_frozen(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +state: R.State<World>,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {True{} == I.frozen(World, R.advance(World, state, respond, observe)) : Bool}:
  match state:
    case R.State{_, R.RuntimeClosed{}, _, _, _, _, _}: frozen
    case R.State{_, R.RuntimeOpen{}, _, _, _, _, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.advance(World, state, respond, observe)) : Bool},
        Cancellation.true_ne_false(frozen)
      )

def owner_frozen(
  ~World: Data,
  ~observe: T.ExceptionToken -> World -> O.Error,
  matches: Bool,
  +state: R.State<World>,
  completion: E.Completion<World>,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
  True{}
  == I.frozen(World, R.completed_owner(World, matches, state, completion, observe))
  : Bool
}:
  match matches state:
    case False{} _: frozen
    case True{} R.State{_, R.RuntimeOpen{}, _, _, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.frozen(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Cancellation.true_ne_false(frozen)
      )
    case True{} R.State{_, R.RuntimeClosed{}, R.RuntimeReady{_}, _, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.frozen(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Cancellation.true_ne_false(frozen)
      )
    case True{} R.State{_, R.RuntimeClosed{}, R.RuntimeWaiting{_}, _, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.frozen(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Cancellation.true_ne_false(frozen)
      )
    case True{} R.State{_, R.RuntimeClosed{}, R.RuntimeReturned{_, _}, Some{_}, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.frozen(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Cancellation.true_ne_false(frozen)
      )
    case True{} R.State{_, R.RuntimeClosed{}, R.RuntimeReturned{_, _}, None{}, _, _, _}: frozen
    case True{} R.State{_, R.RuntimeClosed{}, R.RuntimeCancelled{_}, None{}, _, _, _}: frozen
    case True{} R.State{
      +invocation,
      R.RuntimeClosed{},
      R.RuntimeCancelled{+step},
      Some{_},
      +next,
      +world,
      +actions
    }:
      late_frozen(~World, completion, invocation, next, step, world, actions)

def cancel_frozen(
  ~World: Data,
  +state: R.State<World>,
  actual: Nat,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
 True{} == I.frozen(World, R.cancel(World, state, actual)) : Bool
}:
  match state:
    case R.State{+invocation, _, _, _, _, _, _}: cancel_row_frozen(
      ~World,
      Nat.is_eq(invocation, actual),
      state,
      frozen
    )

def complete_frozen(
  ~World: Data,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +state: R.State<World>,
  +completion: E.Completion<World>,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
 True{} == I.frozen(World, R.complete(World, state, completion, observe)) : Bool
}:
  match state completion:
    case R.State{_, _, _, Some{R.RuntimeProvider{_, expected}}, _, _, _} E.Completion{
      actual,
      _,
      _,
      _
    }:
      owner_frozen(~World, ~observe, E.same_lease(expected, actual), state, completion, frozen)
    case R.State{_, _, _, None{}, _, _, _} E.Completion{_, _, _, _}: frozen

def step_frozen(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +state: R.State<World>,
  item: R.RuntimeEvent<World>,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
 True{} == I.frozen(World, R.event(World, state, item, respond, observe)) : Bool
}:
  match item:
    case R.RuntimeAdvance{}: advance_frozen(~World, ~respond, ~observe, state, frozen)
    case R.RuntimeCancel{actual}: cancel_frozen(~World, state, actual, frozen)
    case R.RuntimeComplete{completion}: complete_frozen(~World, ~observe, state, completion, frozen)

def suffix_machine(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  events: List<&2, R.RuntimeEvent<World>>,
  +state: R.State<World>,
  +frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
   Observation.machine(World, R.run_events(~World, ~respond, ~observe, events, state))
   == Observation.machine(World, state)
   : Observation.MachineObservation
 }:
  match events:
    case []: {==}
    case +head <> tail:
      %step_machine(~World, ~respond, ~observe, state, head, frozen) : {
        Observation.machine(
          World,
          R.run_events(
            ~World,
            ~respond,
            ~observe,
            tail,
            R.event(World, state, head, respond, observe)
          )
        )
        == _
        : Observation.MachineObservation
      }
      suffix_machine(
        ~World,
        ~respond,
        ~observe,
        tail,
        R.event(World, state, head, respond, observe),
        step_frozen(~World, ~respond, ~observe, state, head, frozen)
      )

def main() -> Unit:
  Unit{}
