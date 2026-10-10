import Base
import ./RuntimeModel.bend as R
import ./RuntimeInvariant.bend as I
import ./RuntimeLawObservation.bend as Observation
import ./Types.bend as T
import ./Loop.bend as L
import ./Machine.bend as M
import ./Environment.bend as E
import ./WholeObservation.bend as O

# Direct preservation of the existing invocation field, for all raw states.
# No phase validity, provider correctness or graph theorem is assumed.
def resumed_inv(
  ~World: Data,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +step: L.Continuation,
  +invocation: Nat,
  next: Nat,
  world: E.WorldState<World>,
  actions: List<&2, R.Action>
) -> {
  I.invocation(World, R.resumed(World, step, observe, invocation, next, world, actions))
  == invocation
  : Nat
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

def response_inv(~World: Data, ~observe: T.ExceptionToken -> World -> O.Error,
 +response: R.ProviderResponse<World>, +request: T.Request, step: L.Continuation,
 +invocation: Nat, next: Nat, effects: List<&2, O.Effect>, actions: List<&2, R.Action>) -> {
   I.invocation(
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
   == invocation
   : Nat
 }:
  match response:
    case R.ProviderSuspended{_, _}: {==}
    case R.ProviderReturned{world, +outcome, nested}:
      +reply = E.stamp(request, outcome)
      resumed_inv(
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

def issue_inv(~World: Data, ~respond: T.Operation -> World -> R.ProviderResponse<World>,
 ~observe: T.ExceptionToken -> World -> O.Error, +request: T.Request, step: L.Continuation,
 +invocation: Nat, next: Nat, world: E.WorldState<World>, actions: List<&2, R.Action>) -> {
   I.invocation(
     World,
     R.issue(World, respond, request, step, observe, invocation, next, world, actions)
   )
   == invocation
   : Nat
 }:
  match request world:
    case T.Request{_, _, operation} E.WorldState{value, effects}:
      response_inv(
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

def advance_step_inv(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +step: L.Continuation,
  +invocation: Nat,
  next: Nat,
  world: E.WorldState<World>,
  actions: List<&2, R.Action>
) -> {
  I.invocation(
    World,
    R.advance_step(World, step, respond, observe, invocation, next, world, actions)
  )
  == invocation
  : Nat
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
    case L.ServiceStep{T.AwaitService{_, request}}: issue_inv(
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

def advance_inv(~World: Data, ~respond: T.Operation -> World -> R.ProviderResponse<World>,
 ~observe: T.ExceptionToken -> World -> O.Error, +state: R.State<World>) -> {
 I.invocation(World, R.advance(World, state, respond, observe)) == I.invocation(World, state) : Nat
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
      advance_step_inv(
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
      Some{_},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeWaiting{_},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeWaiting{_},
      Some{_},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReturned{_, _},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeReturned{_, _},
      Some{_},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeCancelled{_},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeOpen{},
      R.RuntimeCancelled{_},
      Some{_},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReady{step},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReady{step},
      Some{_},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeWaiting{_},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeWaiting{_},
      Some{_},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReturned{_, _},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeReturned{_, _},
      Some{_},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeCancelled{_},
      None{},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}
    case R.State{
      invocation,
      R.RuntimeClosed{},
      R.RuntimeCancelled{_},
      Some{_},
      next,
      E.WorldState{value, effects},
      actions
    }:
      {==}

def cancellation_inv(~World: Data, matches: Bool, +state: R.State<World>) -> {
 I.invocation(World, R.cancellation(World, matches, state)) == I.invocation(World, state) : Nat
}:
  match matches state:
    case True{} R.State{_, R.RuntimeOpen{}, _, _, _, E.WorldState{_, _}, _}: {==}
    case True{} R.State{_, R.RuntimeClosed{}, _, _, _, _, _}: {==}
    case False{} _: {==}

def cancel_inv(~World: Data, +state: R.State<World>, actual: Nat) -> {
 I.invocation(World, R.cancel(World, state, actual)) == I.invocation(World, state) : Nat
}:
  match state:
    case R.State{+invocation, _, _, _, _, _, _}:
      cancellation_inv(~World, Nat.is_eq(invocation, actual), state)

def active_inv(~World: Data, ~observe: T.ExceptionToken -> World -> O.Error,
 +completion: E.Completion<World>, +request: T.Request, step: L.Continuation,
 +invocation: Nat, next: Nat, old: E.WorldState<World>, actions: List<&2, R.Action>) -> {
   I.invocation(
     World,
     R.complete_active(World, completion, request, step, observe, invocation, next, old, actions)
   )
   == invocation
   : Nat
 }:
  match completion old:
    case E.Completion{_, value, +outcome, nested} E.WorldState{_, effects}:
      +reply = E.stamp(request, outcome)
      resumed_inv(
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

def execution_inv(~World: Data, ~observe: T.ExceptionToken -> World -> O.Error,
 execution: R.Execution, completion: E.Completion<World>, provider: R.RuntimeProvider,
 +invocation: Nat, next: Nat, world: E.WorldState<World>, actions: List<&2, R.Action>) -> {
   I.invocation(
     World,
     R.completed_execution(
       World,
       execution,
       completion,
       provider,
       invocation,
       next,
       observe,
       world,
       actions
     )
   )
   == invocation
   : Nat
 }:
  match execution completion provider world:
    case R.RuntimeWaiting{step} _ R.RuntimeProvider{request, lease} _:
      active_inv(
        ~World,
        ~observe,
        completion,
        request,
        step,
        invocation,
        next,
        world,
        R.actions_append(actions, R.ProviderRetired{lease})
      )
    case R.RuntimeCancelled{_} E.Completion{_, _, _, _} _ E.WorldState{_, _}: {==}
    case R.RuntimeReady{_} _ _ _: {==}
    case R.RuntimeReturned{_, _} _ _ _: {==}

def owner_inv(~World: Data, ~observe: T.ExceptionToken -> World -> O.Error,
 matches: Bool, +state: R.State<World>, completion: E.Completion<World>) -> {
   I.invocation(World, R.completed_owner(World, matches, state, completion, observe))
   == I.invocation(World, state)
   : Nat
 }:
  match matches state:
    case True{} R.State{invocation, _, execution, Some{provider}, next, world, actions}:
      execution_inv(
        ~World,
        ~observe,
        execution,
        completion,
        provider,
        invocation,
        next,
        world,
        actions
      )
    case True{} R.State{_, _, _, None{}, _, _, _}: {==}
    case False{} _: {==}

def complete_inv(~World: Data, ~observe: T.ExceptionToken -> World -> O.Error,
 +state: R.State<World>, +completion: E.Completion<World>) -> {
   I.invocation(World, R.complete(World, state, completion, observe))
   == I.invocation(World, state)
   : Nat
 }:
  match state completion:
    case R.State{_, _, _, Some{R.RuntimeProvider{_, expected}}, _, _, _} E.Completion{
      actual,
      _,
      _,
      _
    }:
      owner_inv(~World, ~observe, E.same_lease(expected, actual), state, completion)
    case R.State{_, _, _, None{}, _, _, _} E.Completion{_, _, _, _}: {==}

def step_inv(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +state: R.State<World>,
  item: R.RuntimeEvent<World>
) -> {
   I.invocation(World, R.event(World, state, item, respond, observe))
   == I.invocation(World, state)
   : Nat
 }:
  match item:
    case R.RuntimeAdvance{}: advance_inv(~World, ~respond, ~observe, state)
    case R.RuntimeCancel{actual}: cancel_inv(~World, state, actual)
    case R.RuntimeComplete{completion}: complete_inv(~World, ~observe, state, completion)

def prefix_inv(
  ~World: Data,
  ~respond: T.Operation -> World -> R.ProviderResponse<World>,
  ~observe: T.ExceptionToken -> World -> O.Error,
  +events: List<&2, R.RuntimeEvent<World>>,
  +state: R.State<World>
) -> {
   I.invocation(World, R.run_events(~World, ~respond, ~observe, events, state))
   == I.invocation(World, state)
   : Nat
 }:
  match events:
    case []: {==}
    case +head <> +tail:
      %step_inv(~World, ~respond, ~observe, state, head) : {
        I.invocation(
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
        : Nat
      }
      prefix_inv(~World, ~respond, ~observe, tail, R.event(World, state, head, respond, observe))

def initial_inv(~World: Data, +input: T.ResolverInput, world: World) -> {
 I.invocation(World, R.initial(World, input, world)) == Observation.input_invocation(input) : Nat
}:
  match input:
    case T.ResolverInput{_, _, _, _, _, _, _, _, _}: {==}

def initialized_inv(~World: Data, ~respond: T.Operation -> World -> R.ProviderResponse<World>,
 ~observe: T.ExceptionToken -> World -> O.Error, +input: T.ResolverInput, +world: World,
 +events: List<&2, R.RuntimeEvent<World>>) -> {
   I.invocation(
     World,
     R.run_events(~World, ~respond, ~observe, events, R.initial(World, input, world))
   )
   == Observation.input_invocation(input)
   : Nat
 }:
  %initial_inv(~World, input, world) : {
    I.invocation(
      World,
      R.run_events(~World, ~respond, ~observe, events, R.initial(World, input, world))
    )
    == _
    : Nat
  }
  prefix_inv(~World, ~respond, ~observe, events, R.initial(World, input, world))

def main() -> Unit:
  Unit{}
