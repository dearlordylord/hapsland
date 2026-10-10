import Base
import ./RuntimeModel.bend as R
import ./RuntimeInvariant.bend as I
import ./RuntimeMachineFenceProof.bend as Fence
import ./RuntimeCancellationPhaseProof.bend as Cancellation
import ./RuntimeLeaseProof.bend as Lease
import ./RuntimeTraceProof.bend as Lists
import ./RuntimeLawObservation.bend as Observation
import ./Types.bend as T
import ./Loop.bend as L
import ./Environment.bend as E
import ./WholeObservation.bend as O

# Proof-only constructor abbreviations; all states are the existing runtime State.
def closed_state(
  -World: Data,
  invocation: Nat,
  execution: R.Execution,
  pending: Maybe<&2, R.RuntimeProvider>,
  next: Nat,
  world: E.WorldState<World>,
  actions: List<&2, R.Action>
) -> R.State<World>:
  R.State{invocation, R.RuntimeClosed{}, execution, pending, next, world, actions}

def closed_cancel(
  ~World: Data,
  matches: Bool,
  +invocation: Nat,
  +execution: R.Execution,
  +pending: Maybe<&2, R.RuntimeProvider>,
  +next: Nat,
  +world: E.WorldState<World>,
  +actions: List<&2, R.Action>
) -> {
   R.cancellation(
     World,
     matches,
     closed_state(World, invocation, execution, pending, next, world, actions)
   )
   == closed_state(World, invocation, execution, pending, next, world, actions)
   : R.State<World>
 }:
  match matches:
    case True{}: {==}
    case False{}: {==}

def cancel_identity(
  ~World: Data,
  +invocation: Nat,
  +execution: R.Execution,
  +pending: Maybe<&2, R.RuntimeProvider>,
  +next: Nat,
  +world: E.WorldState<World>,
  +actions: List<&2, R.Action>,
  actual: Nat
) -> {
 R.cancel(World, closed_state(World, invocation, execution, pending, next, world, actions), actual)
 == closed_state(World, invocation, execution, pending, next, world, actions) : R.State<World>
}:
  closed_cancel(
    ~World,
    Nat.is_eq(invocation, actual),
    invocation,
    execution,
    pending,
    next,
    world,
    actions
  )

def no_pending_event(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +invocation: Nat,
  +execution: R.Execution,
  +next: Nat,
  +world: E.WorldState<World>,
  +actions: List<&2, R.Action>,
  item: R.RuntimeEvent<World>
) -> {
   R.event(
     World,
     closed_state(World, invocation, execution, None{}, next, world, actions),
     item,
     respond,
     observe
   )
   == closed_state(World, invocation, execution, None{}, next, world, actions)
   : R.State<World>
 }:
  match item:
    case R.RuntimeAdvance{}: {==}
    case R.RuntimeCancel{actual}: cancel_identity(
      ~World,
      invocation,
      execution,
      None{},
      next,
      world,
      actions,
      actual
    )
    case R.RuntimeComplete{E.Completion{_, _, _, _}}: {==}

def no_pending_suffix(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +events: List<&2, R.RuntimeEvent<World>>,
  +invocation: Nat,
  +execution: R.Execution,
  +next: Nat,
  +world: E.WorldState<World>,
  +actions: List<&2, R.Action>
) -> {
   R.run_events(
     ~World,
     ~respond,
     ~observe,
     events,
     closed_state(World, invocation, execution, None{}, next, world, actions)
   )
   == closed_state(World, invocation, execution, None{}, next, world, actions)
   : R.State<World>
 }:
  match events:
    case []: {==}
    case +head <> +tail:
      %Equal.sym(
        R.State<World>,
        R.event(
          World,
          closed_state(World, invocation, execution, None{}, next, world, actions),
          head,
          respond,
          observe
        ),
        closed_state(World, invocation, execution, None{}, next, world, actions),
        no_pending_event(
          ~World,
          ~respond,
          ~observe,
          invocation,
          execution,
          next,
          world,
          actions,
          head
        )
      ) : {
          R.run_events(~World, ~respond, ~observe, tail, _)
          == closed_state(World, invocation, execution, None{}, next, world, actions)
          : R.State<World>
        }
      no_pending_suffix(
        ~World,
        ~respond,
        ~observe,
        tail,
        invocation,
        execution,
        next,
        world,
        actions
      )

def pending_state(
  -World: Data,
  invocation: Nat,
  step: L.Continuation,
  request: T.Request,
  lease: O.ProviderLease,
  next: Nat,
  world: E.WorldState<World>,
  actions: List<&2, R.Action>
) -> R.State<World>:
  closed_state(
    World,
    invocation,
    R.RuntimeCancelled{step},
    Some{R.RuntimeProvider{request, lease}},
    next,
    world,
    actions
  )

def matching_suffix(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  matches: Bool,
  +tail: List<&2, R.RuntimeEvent<World>>,
  +invocation: Nat,
  +step: L.Continuation,
  +request: T.Request,
  +expected: O.ProviderLease,
  +next: Nat,
  +old: E.WorldState<World>,
  +actions: List<&2, R.Action>,
  +actual: O.ProviderLease,
  +value: World,
  +outcome: T.ServiceOutcome,
  +nested: List<&2, O.Effect>,
  equality: {E.same_lease(expected, actual) == matches : Bool},
  later: {
    Observation.actions(
      World,
      R.run_events(
        ~World,
        ~respond,
        ~observe,
        tail,
        pending_state(World, invocation, step, request, expected, next, old, actions)
      )
    )
    == List.append(&2, R.Action, actions, Observation.retirement_for_lease(~World, tail, expected))
    : List<&2, R.Action>
  }
) -> {
   Observation.actions(
     World,
     R.run_events(
       ~World,
       ~respond,
       ~observe,
       tail,
       R.completed_owner(
         World,
         matches,
         pending_state(World, invocation, step, request, expected, next, old, actions),
         E.Completion{actual, value, outcome, nested},
         observe
       )
     )
   )
   == List.append(
     &2,
     R.Action,
     actions,
     Observation.retirement_row(
       ~World,
       matches,
       expected,
       Observation.retirement_for_lease(~World, tail, expected)
     )
   )
   : List<&2, R.Action>
 }:
  match matches old:
    case False{} _: later
    case True{} E.WorldState{_, +effects}:
      %Equal.sym(
        O.ProviderLease,
        expected,
        actual,
        Lease.same_lease_sound(expected, actual, equality)
      ) : {
        Observation.actions(
          World,
          R.run_events(
            ~World,
            ~respond,
            ~observe,
            tail,
            R.completed_owner(
              World,
              True{},
              pending_state(World, invocation, step, request, expected, next, old, actions),
              E.Completion{actual, value, outcome, nested},
              observe
            )
          )
        )
        == List.append(&2, R.Action, actions, R.ProviderRetired{_} <> [])
        : List<&2, R.Action>
      }
      %Equal.sym(
        R.State<World>,
        R.run_events(
          ~World,
          ~respond,
          ~observe,
          tail,
          closed_state(
            World,
            invocation,
            R.RuntimeCancelled{step},
            None{},
            next,
            E.WorldState{value, List.append(&2, O.Effect, effects, nested)},
            R.actions_append(actions, R.ProviderRetired{actual})
          )
        ),
        closed_state(
          World,
          invocation,
          R.RuntimeCancelled{step},
          None{},
          next,
          E.WorldState{value, List.append(&2, O.Effect, effects, nested)},
          R.actions_append(actions, R.ProviderRetired{actual})
        ),
        no_pending_suffix(
          ~World,
          ~respond,
          ~observe,
          tail,
          invocation,
          R.RuntimeCancelled{step},
          next,
          E.WorldState{value, List.append(&2, O.Effect, effects, nested)},
          R.actions_append(actions, R.ProviderRetired{actual})
        )
      ) : {
        Observation.actions(World, _)
        == List.append(&2, R.Action, actions, R.ProviderRetired{actual} <> []) : List<&2, R.Action>
      }
      {==}

def pending_suffix(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +events: List<&2, R.RuntimeEvent<World>>,
  +invocation: Nat,
  +step: L.Continuation,
  +request: T.Request,
  +lease: O.ProviderLease,
  +next: Nat,
  +world: E.WorldState<World>,
  +actions: List<&2, R.Action>
) -> {
   Observation.actions(
     World,
     R.run_events(
       ~World,
       ~respond,
       ~observe,
       events,
       pending_state(World, invocation, step, request, lease, next, world, actions)
     )
   )
   == List.append(&2, R.Action, actions, Observation.retirement_for_lease(~World, events, lease))
   : List<&2, R.Action>
 }:
  match events:
    case []:
      Equal.sym(
        List<&2, R.Action>,
        List.append(&2, R.Action, actions, []),
        actions,
        Lists.append_nil(&2, R.Action, actions)
      )
    case R.RuntimeAdvance{} <> tail:
      pending_suffix(
        ~World,
        ~respond,
        ~observe,
        tail,
        invocation,
        step,
        request,
        lease,
        next,
        world,
        actions
      )
    case R.RuntimeCancel{actual} <> +tail:
      %Equal.sym(
        R.State<World>,
        R.cancel(
          World,
          pending_state(World, invocation, step, request, lease, next, world, actions),
          actual
        ),
        pending_state(World, invocation, step, request, lease, next, world, actions),
        cancel_identity(
          ~World,
          invocation,
          R.RuntimeCancelled{step},
          Some{R.RuntimeProvider{request, lease}},
          next,
          world,
          actions,
          actual
        )
      ) : {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, tail, _))
          == List.append(
            &2,
            R.Action,
            actions,
            Observation.retirement_for_lease(~World, tail, lease)
          )
          : List<&2, R.Action>
        }
      pending_suffix(
        ~World,
        ~respond,
        ~observe,
        tail,
        invocation,
        step,
        request,
        lease,
        next,
        world,
        actions
      )
    case R.RuntimeComplete{E.Completion{+actual, value, outcome, nested}} <> +tail:
      matching_suffix(
        ~World,
        ~respond,
        ~observe,
        E.same_lease(lease, actual),
        tail,
        invocation,
        step,
        request,
        lease,
        next,
        world,
        actions,
        actual,
        value,
        outcome,
        nested,
        {==},
        pending_suffix(
          ~World,
          ~respond,
          ~observe,
          tail,
          invocation,
          step,
          request,
          lease,
          next,
          world,
          actions
        )
      )

def suffix_actions(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +state: R.State<World>,
  +events: List<&2, R.RuntimeEvent<World>>,
  frozen: {True{} == I.frozen(World, state) : Bool}
) -> {
   Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
   == List.append(
     &2,
     R.Action,
     Observation.actions(World, state),
     Observation.retirement_suffix(~World, events, Observation.provider(World, state))
   )
   : List<&2, R.Action>
 }:
  match state:
    case R.State{invocation, R.RuntimeOpen{}, R.RuntimeReady{step}, None{}, next, +world, +actions}:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReady{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeWaiting{step},
      None{},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeWaiting{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReturned{step, error},
      None{},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReturned{step, error},
      Some{R.RuntimeProvider{request, lease}},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeCancelled{step},
      None{},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeCancelled{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReady{step},
      None{},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReady{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeWaiting{step},
      None{},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeWaiting{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReturned{step, error},
      None{},
      next,
      +world,
      +actions
    }:
      %Equal.sym(
        R.State<World>,
        R.run_events(~World, ~respond, ~observe, events, state),
        state,
        no_pending_suffix(
          ~World,
          ~respond,
          ~observe,
          events,
          invocation,
          R.RuntimeReturned{step, error},
          next,
          world,
          actions
        )
      ) : {
          Observation.actions(World, _)
          == List.append(&2, R.Action, actions, [])
          : List<&2, R.Action>
        }
      Equal.sym(
        List<&2, R.Action>,
        List.append(&2, R.Action, actions, []),
        actions,
        Lists.append_nil(&2, R.Action, actions)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReturned{step, error},
      Some{R.RuntimeProvider{request, lease}},
      next,
      +world,
      +actions
    }:
      Empty.absurd(
        {
          Observation.actions(World, R.run_events(~World, ~respond, ~observe, events, state))
          == List.append(
            &2,
            R.Action,
            Observation.actions(World, state),
            Observation.retirement_suffix(~World, events, Observation.provider(World, state))
          )
          : List<&2, R.Action>
        },
        Cancellation.true_ne_false(frozen)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeCancelled{step},
      None{},
      next,
      +world,
      +actions
    }:
      %Equal.sym(
        R.State<World>,
        R.run_events(~World, ~respond, ~observe, events, state),
        state,
        no_pending_suffix(
          ~World,
          ~respond,
          ~observe,
          events,
          invocation,
          R.RuntimeCancelled{step},
          next,
          world,
          actions
        )
      ) : {
          Observation.actions(World, _)
          == List.append(&2, R.Action, actions, [])
          : List<&2, R.Action>
        }
      Equal.sym(
        List<&2, R.Action>,
        List.append(&2, R.Action, actions, []),
        actions,
        Lists.append_nil(&2, R.Action, actions)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeCancelled{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      +world,
      +actions
    }:
      pending_suffix(
        ~World,
        ~respond,
        ~observe,
        events,
        invocation,
        step,
        request,
        lease,
        next,
        world,
        actions
      )

def cancellation_suffix_actions_exact(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +input: T.ResolverInput,
  +world: World,
  +prefix: List<&2, R.RuntimeEvent<World>>,
  +suffix: List<&2, R.RuntimeEvent<World>>
) -> {
   Observation.actions(
     World,
     Observation.cancelled_suffix(~World, ~respond, ~observe, input, world, prefix, suffix)
   )
   == List.append(
     &2,
     R.Action,
     Observation.actions(
       World,
       Observation.cancelled_prefix(~World, ~respond, ~observe, input, world, prefix)
     ),
     Observation.retirement_suffix(
       ~World,
       suffix,
       Observation.provider(
         World,
         Observation.cancelled_prefix(~World, ~respond, ~observe, input, world, prefix)
       )
     )
   )
   : List<&2, R.Action>
 }:
  suffix_actions(
    ~World,
    ~respond,
    ~observe,
    Observation.cancelled_prefix(~World, ~respond, ~observe, input, world, prefix),
    suffix,
    Fence.prefix_frozen(~World, ~respond, ~observe, input, world, prefix)
  )

def main() -> Unit:
  Unit{}
