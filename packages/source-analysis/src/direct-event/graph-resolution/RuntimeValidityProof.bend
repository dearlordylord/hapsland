import Base
import ./RuntimeModel.bend as R
import ./RuntimeInvariant.bend as I
import ./RuntimeLawObservation.bend as Observation
import ./Types.bend as T
import ./Loop.bend as L
import ./Machine.bend as M
import ./Environment.bend as E
import ./WholeObservation.bend as O

# Direct validity preservation over the existing approved phase predicate.
# No provider correctness or graph theorem is assumed.
import ./RuntimeCancellationPhaseProof.bend as Contradiction

def resumed_valid(
  ~World: Data,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +step: L.Continuation,
  +invocation: Nat,
  next: Nat,
  world: E.WorldState<World>,
  actions: List<&2, R.Action>
) -> {
  True{} == I.valid(World, R.resumed(World, step, observe, invocation, next, world, actions)) : Bool
}:
  match step:
    case L.ServiceStep{T.FailedResolver{T.ForeignProviderFailure{exception}}}: {==}
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

def response_valid(
  ~World: Data,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +response: R.ProviderResponse<World>,
  +request: T.Request,
  step: L.Continuation,
  +invocation: Nat,
  next: Nat,
  effects: List<&2, O.Effect>,
  actions: List<&2, R.Action>
) -> {
   True{}
   == I.valid(
     World,
     R.provider_response(
       World,
       response,
       request,
       step,
       observe,
       invocation,
       next,
       effects,
       actions
     )
   )
   : Bool
 }:
  match response:
    case R.ProviderSuspended{_, _}: {==}
    case R.ProviderReturned{world, +outcome, nested}:
      +reply = E.stamp(request, outcome)
      resumed_valid(
        ~World,
        ~observe,
        M.resume(step, T.ServiceReply{reply}),
        invocation,
        next,
        E.WorldState{
          world,
          List.append(
            &2,
            O.Effect,
            List.append(&2, O.Effect, effects, nested),
            O.Responded{reply} <> []
          )
        },
        R.actions_append(actions, R.ServiceResumed{reply})
      )

def issue_valid(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +request: T.Request,
  step: L.Continuation,
  +invocation: Nat,
  next: Nat,
  world: E.WorldState<World>,
  actions: List<&2, R.Action>
) -> {
   True{}
   == I.valid(
     World,
     R.issue(World, respond, request, step, observe, invocation, next, world, actions)
   )
   : Bool
 }:
  match request world:
    case T.Request{_, _, operation} E.WorldState{value, effects}:
      response_valid(
        ~World,
        ~observe,
        respond(operation, value),
        request,
        step,
        invocation,
        next,
        List.append(&2, O.Effect, effects, O.Invoked{request} <> []),
        R.actions_append(actions, R.ServiceInvoked{request})
      )

def advance_step_valid(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +step: L.Continuation,
  +invocation: Nat,
  next: Nat,
  world: E.WorldState<World>,
  actions: List<&2, R.Action>
) -> {
  True{}
  == I.valid(World, R.advance_step(World, step, respond, observe, invocation, next, world, actions))
  : Bool
}:
  match step:
    case L.ServiceStep{T.FailedResolver{T.ForeignProviderFailure{exception}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.WrongInvocation{_, _}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.WrongCorrelation{_, _}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.WrongReplyKind{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.MalformedReply{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.LocalTraversalFailure{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.NegativeGraphWork{_}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.RuntimeFailure{_}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.InvocationCancelled{}}}: {==}
    case L.ServiceStep{T.FailedResolver{T.ReplyAfterTerminal{}}}: {==}
    case L.ServiceStep{T.AwaitService{_, request}}: issue_valid(
      ~World,
      ~respond,
      ~observe,
      request,
      step,
      invocation,
      next,
      world,
      actions
    )
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

def advance_valid(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +state: R.State<World>,
  valid: {True{} == I.valid(World, state) : Bool}
) -> {
 True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool
}:
  match state:
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReady{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      advance_step_valid(
        ~World,
        ~respond,
        ~observe,
        step,
        invocation,
        next,
        E.WorldState{value, effects},
        actions
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReady{step},
      Some{provider},
      next,
      E.WorldState{value, effects},
      actions
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeWaiting{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeWaiting{step},
      Some{provider},
      next,
      E.WorldState{value, effects},
      actions
    }:
      valid
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReturned{_, _},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReturned{_, _},
      Some{provider},
      next,
      E.WorldState{value, effects},
      actions
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeCancelled{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeCancelled{step},
      Some{provider},
      next,
      E.WorldState{value, effects},
      actions
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReady{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReady{step},
      Some{provider},
      next,
      E.WorldState{value, effects},
      actions
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeWaiting{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeWaiting{step},
      Some{provider},
      next,
      E.WorldState{value, effects},
      actions
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReturned{_, _},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      valid
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReturned{_, _},
      Some{provider},
      next,
      E.WorldState{value, effects},
      actions
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.advance(World, state, respond, observe)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeCancelled{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      valid
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeCancelled{step},
      Some{provider},
      next,
      E.WorldState{value, effects},
      actions
    }:
      valid

def cancellation_valid(
  ~World: Data,
  matches: Bool,
  +state: R.State<World>,
  valid: {True{} == I.valid(World, state) : Bool}
) -> {
 True{} == I.valid(World, R.cancellation(World, matches, state)) : Bool
}:
  match matches state:
    case False{} _: valid
    case True{} R.State{_, R.RuntimeOpen{}, R.RuntimeReady{step}, None{}, _, E.WorldState{_, _}, _}:
      {==}
    case True{} R.State{
      _,
      R.RuntimeOpen{},
      R.RuntimeReady{step},
      Some{provider},
      _,
      E.WorldState{_, _},
      _
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.cancellation(World, True{}, state)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      _,
      R.RuntimeOpen{},
      R.RuntimeWaiting{step},
      None{},
      _,
      E.WorldState{_, _},
      _
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.cancellation(World, True{}, state)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      _,
      R.RuntimeOpen{},
      R.RuntimeWaiting{step},
      Some{provider},
      _,
      E.WorldState{_, _},
      _
    }:
      {==}
    case True{} R.State{
      _,
      R.RuntimeOpen{},
      R.RuntimeReturned{_, _},
      None{},
      _,
      E.WorldState{_, _},
      _
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.cancellation(World, True{}, state)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      _,
      R.RuntimeOpen{},
      R.RuntimeReturned{_, _},
      Some{provider},
      _,
      E.WorldState{_, _},
      _
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.cancellation(World, True{}, state)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      _,
      R.RuntimeOpen{},
      R.RuntimeCancelled{step},
      None{},
      _,
      E.WorldState{_, _},
      _
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.cancellation(World, True{}, state)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      _,
      R.RuntimeOpen{},
      R.RuntimeCancelled{step},
      Some{provider},
      _,
      E.WorldState{_, _},
      _
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.cancellation(World, True{}, state)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      _,
      R.RuntimeClosed{},
      R.RuntimeReady{step},
      None{},
      _,
      E.WorldState{_, _},
      _
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.cancellation(World, True{}, state)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      _,
      R.RuntimeClosed{},
      R.RuntimeReady{step},
      Some{provider},
      _,
      E.WorldState{_, _},
      _
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.cancellation(World, True{}, state)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      _,
      R.RuntimeClosed{},
      R.RuntimeWaiting{step},
      None{},
      _,
      E.WorldState{_, _},
      _
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.cancellation(World, True{}, state)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      _,
      R.RuntimeClosed{},
      R.RuntimeWaiting{step},
      Some{provider},
      _,
      E.WorldState{_, _},
      _
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.cancellation(World, True{}, state)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      _,
      R.RuntimeClosed{},
      R.RuntimeReturned{_, _},
      None{},
      _,
      E.WorldState{_, _},
      _
    }:
      {==}
    case True{} R.State{
      _,
      R.RuntimeClosed{},
      R.RuntimeReturned{_, _},
      Some{provider},
      _,
      E.WorldState{_, _},
      _
    }:
      Empty.absurd(
        {True{} == I.valid(World, R.cancellation(World, True{}, state)) : Bool},
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      _,
      R.RuntimeClosed{},
      R.RuntimeCancelled{step},
      None{},
      _,
      E.WorldState{_, _},
      _
    }:
      {==}
    case True{} R.State{
      _,
      R.RuntimeClosed{},
      R.RuntimeCancelled{step},
      Some{provider},
      _,
      E.WorldState{_, _},
      _
    }:
      {==}

def cancel_valid(
  ~World: Data,
  +state: R.State<World>,
  actual: Nat,
  valid: {True{} == I.valid(World, state) : Bool}
) -> {
 True{} == I.valid(World, R.cancel(World, state, actual)) : Bool
}:
  match state:
    case R.State{+invocation, _, _, _, _, _, _}:
      cancellation_valid(~World, Nat.is_eq(invocation, actual), state, valid)

def active_valid(
  ~World: Data,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +completion: E.Completion<World>,
  +request: T.Request,
  step: L.Continuation,
  +invocation: Nat,
  next: Nat,
  old: E.WorldState<World>,
  actions: List<&2, R.Action>
) -> {
   True{}
   == I.valid(
     World,
     R.complete_active(World, completion, request, step, observe, invocation, next, old, actions)
   )
   : Bool
 }:
  match completion old:
    case E.Completion{_, value, +outcome, nested} E.WorldState{_, effects}:
      +reply = E.stamp(request, outcome)
      resumed_valid(
        ~World,
        ~observe,
        M.resume(step, T.ServiceReply{reply}),
        invocation,
        next,
        E.WorldState{
          value,
          List.append(
            &2,
            O.Effect,
            List.append(&2, O.Effect, effects, nested),
            O.Responded{reply} <> []
          )
        },
        R.actions_append(actions, R.ServiceResumed{reply})
      )

def owner_valid(
  ~World: Data,
  ~observe: T.ExceptionToken -> World -> O.Error,
  matches: Bool,
  +state: R.State<World>,
  +completion: E.Completion<World>,
  valid: {True{} == I.valid(World, state) : Bool}
) -> {
 True{} == I.valid(World, R.completed_owner(World, matches, state, completion, observe)) : Bool
}:
  match matches state completion:
    case False{} _ _: valid
    case True{} R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReady{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      valid
    case True{} R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReady{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.valid(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeWaiting{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.valid(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeWaiting{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      active_valid(
        ~World,
        ~observe,
        completion,
        request,
        step,
        invocation,
        next,
        E.WorldState{value, effects},
        R.actions_append(actions, R.ProviderRetired{lease})
      )
    case True{} R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReturned{_, _},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.valid(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReturned{_, _},
      Some{R.RuntimeProvider{request, lease}},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.valid(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeCancelled{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.valid(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeCancelled{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.valid(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReady{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.valid(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReady{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.valid(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeWaiting{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.valid(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeWaiting{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.valid(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReturned{_, _},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      valid
    case True{} R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReturned{_, _},
      Some{R.RuntimeProvider{request, lease}},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      Empty.absurd(
        {
          True{}
          == I.valid(World, R.completed_owner(World, True{}, state, completion, observe))
          : Bool
        },
        Contradiction.true_ne_false(valid)
      )
    case True{} R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeCancelled{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      valid
    case True{} R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeCancelled{step},
      Some{R.RuntimeProvider{request, lease}},
      next,
      E.WorldState{value, effects},
      actions
    } E.Completion{_, _, _, _}:
      {==}

def complete_valid(
  ~World: Data,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +state: R.State<World>,
  +completion: E.Completion<World>,
  valid: {True{} == I.valid(World, state) : Bool}
) -> {
 True{} == I.valid(World, R.complete(World, state, completion, observe)) : Bool
}:
  match state completion:
    case R.State{_, _, _, Some{R.RuntimeProvider{_, expected}}, _, _, _} E.Completion{
      actual,
      _,
      _,
      _
    }:
      owner_valid(~World, ~observe, E.same_lease(expected, actual), state, completion, valid)
    case R.State{_, _, _, None{}, _, _, _} E.Completion{_, _, _, _}: valid

def step_valid(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +state: R.State<World>,
  item: R.RuntimeEvent<World>,
  valid: {True{} == I.valid(World, state) : Bool}
) -> {
 True{} == I.valid(World, R.event(World, state, item, respond, observe)) : Bool
}:
  match item:
    case R.RuntimeAdvance{}: advance_valid(~World, ~respond, ~observe, state, valid)
    case R.RuntimeCancel{actual}: cancel_valid(~World, state, actual, valid)
    case R.RuntimeComplete{completion}: complete_valid(~World, ~observe, state, completion, valid)

def prefix_valid(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  events: List<&2, R.RuntimeEvent<World>>,
  +state: R.State<World>,
  valid: {True{} == I.valid(World, state) : Bool}
) -> {
 True{} == I.valid(World, R.run_events(~World, ~respond, ~observe, events, state)) : Bool
}:
  match events:
    case []: valid
    case +head <> tail:
      prefix_valid(
        ~World,
        ~respond,
        ~observe,
        tail,
        R.event(World, state, head, respond, observe),
        step_valid(~World, ~respond, ~observe, state, head, valid)
      )

def initialized_valid(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  input: T.ResolverInput,
  world: World,
  events: List<&2, R.RuntimeEvent<World>>
) -> {
   True{}
   == I.valid(
     World,
     R.run_events(~World, ~respond, ~observe, events, R.initial(World, input, world))
   )
   : Bool
 }:
  prefix_valid(~World, ~respond, ~observe, events, R.initial(World, input, world), {==})

def main() -> Unit:
  Unit{}
