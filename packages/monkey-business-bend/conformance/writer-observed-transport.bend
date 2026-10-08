import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../WriterScenario.bend as Writer
import ../CollectionScenario.bend as Response
import ../../agent-flow-bend/Canonical.bend as C
import ./advicee-lifecycle-driver.bend as Edge
import ./writer-observed-context.bend as Context

# Queue-owned immutable facts. A delivered binding is consumed, not archived.
# These are original capabilities from Engine, never reconstructed from the
# current scope, a matching token, or the latest response for a participant.
type Capsule is Data:
  Pending{original: Writer.Pending}
  Response{original: Response.Identity}
  Release{original: Writer.Capture}
  UnissuedRelease{original: Writer.Pending}
type Binding is Data:
  Binding{order: Nat, capsule: Capsule}
  ContextBinding{order: Nat, payload: Context.Payload, capsule: Maybe<&2, Capsule>}
type Publication is Data:
  Publication{state: List<&2, Types.State>, report: Engine.ResponseResult,
    actions: List<&2, Driver.Action>}

def select(equal: Bool, capsule: Capsule, rest: Maybe<&2, Capsule>) -> Maybe<&2, Capsule>:
  match equal:
    case True{}: Some{capsule}
    case False{}: rest

def selected_original(
  equal: Bool,
  found: Maybe<&2, Capsule>,
  rest: Maybe<&2, Capsule>
) -> Maybe<&2, Capsule>:
  match equal:
    case True{}: found
    case False{}: rest

def lookup(list: List<&2, Binding>, +order: Nat) -> Maybe<&2, Capsule>:
  match list:
    case Nil{}: None{}
    case Binding{candidate, capsule} <> tail:
      select(Nat.is_eq(candidate, order), capsule, lookup(tail, order))
    case ContextBinding{candidate, _, capsule} <> tail:
      selected_original(Nat.is_eq(candidate, order), capsule, lookup(tail, order))

def retained(equal: Bool, value: Binding, rest: List<&2, Binding>) -> List<&2, Binding>:
  match equal:
    case True{}: rest
    case False{}: value <> rest

def consume(list: List<&2, Binding>, +order: Nat) -> List<&2, Binding>:
  match list:
    case Nil{}: []
    case Binding{+candidate, +capsule} <> tail:
      retained(Nat.is_eq(candidate, order), Binding{candidate, capsule}, consume(tail, order))
    case ContextBinding{+candidate, +payload, +capsule} <> tail:
      retained(
        Nat.is_eq(candidate, order),
        ContextBinding{candidate, payload, capsule},
        consume(tail, order)
      )

def selected_context(
  equal: Bool,
  payload: Context.Payload,
  rest: Maybe<&2, Context.Payload>
) -> Maybe<&2, Context.Payload>:
  match equal:
    case True{}: Some{payload}
    case False{}: rest

def lookup_context(list: List<&2, Binding>, +order: Nat) -> Maybe<&2, Context.Payload>:
  match list:
    case Nil{}: None{}
    case ContextBinding{candidate, payload, _} <> tail:
      selected_context(Nat.is_eq(candidate, order), payload, lookup_context(tail, order))
    case Binding{_, _} <> tail: lookup_context(tail, order)

# One record per actual queued order. Context is a separate payload field;
# the exact immutable capability is carried through unchanged, never rebuilt.
def bind_context(
  +list: List<&2, Binding>,
  +order: Nat,
  payload: Context.Payload
) -> List<&2, Binding>:
  List.append(
    &2,
    Binding,
    consume(list, order),
    [ContextBinding{order, payload, lookup(list, order)}]
  )

# This handler runs BEFORE Edge interprets the returned Driver.Handled. Engine
# owns every decision. The default path remains the ordinary Engine handler.
def handle(original: Maybe<&2, Capsule>, state: Types.State, event: C.CanonicalEvent,
    command: C.Output, context: Driver.Context) -> Driver.Handled:
  match original:
    case Some{Response{target}}: Engine.collection_response_handle(
      state,
      event,
      command,
      context,
      target
    )
    case _: Engine.handle(state, event, command, context)

# Gate before any Canonical mutation. Rebuilding a Pending claim changes only
# its active bit, through the existing actual owner; identity/time stay frozen.
def event(original: Maybe<&2, Capsule>, +state: Types.State, +input: C.CanonicalEvent,
    +now: Nat) -> Maybe<&2, C.CanonicalEvent>:
  match original:
    case Some{Pending{pending}}: Some{Engine.writer_claim_event(state, pending, now)}
    case Some{Response{target}}:
      Bool.pick(
        Maybe<&2, C.CanonicalEvent>,
        Engine.collection_response_delivery_valid(state, target, now, input),
        Some{input},
        None{}
      )
    case Some{Release{capture}}: Engine.writer_release_delivery(state, capture, input, now)
    case Some{UnissuedRelease{pending}}: Engine.writer_unissued_release_delivery(
      state,
      pending,
      now
    )
    case None{}: Some{input}

def publication(value: Engine.ResponseTransition) -> Publication:
  match value:
    case Engine.ResponseTransition{state, report, actions}: Publication{[state], report, actions}

# The private caller supplies the very event/result produced by this selected
# original queue entry. No independently supplied command list is accepted.
def after(original: Maybe<&2, Capsule>, state: Types.State, input: C.CanonicalEvent,
    result: C.Step, now: Nat) -> Publication:
  match original result:
    case Some{Pending{pending}} C.Advanced{_, outputs}:
      publication(Engine.writer_feedback(state, pending, input, outputs, now))
    case Some{Pending{pending}} C.Rejected{_, _}:
      publication(Engine.writer_feedback(state, pending, input, [], now))
    case Some{Response{target}} C.Advanced{_, outputs}:
      publication(Engine.collection_response_after(state, target, input, outputs))
    case _ _: Publication{[state], Engine.ResponseResult{Response.Missing{}, None{}}, []}

# Once submission is authorized its physical terminal/expiry does not inherit
# a writer response fence. The exact original receipt/order remains Edge-owned.
def physical(input: C.CanonicalEvent) -> Bool:
  match input:
    case C.SubmissionTerminal{_, _, _}: True{}
    case C.SubmissionExpiryCheck{_, _, _, _}: True{}
    case C.FinishTerminal{_, _, _, _, _, _}: True{}
    case C.CollectionLeaseCheck{_, _, _, _, _, _}: True{}
    case C.CollectionReleaseLease{_, _}: True{}
    case _: False{}

def response_binding(is_physical: Bool, order: Nat, original: Response.Identity,
    rest: List<&2, Binding>) -> List<&2, Binding>:
  match is_physical:
    case True{}: rest
    case False{}: Binding{order, Response{original}} <> rest

# Called with the exact new action and sequence at enqueue, not by replaying
# policy against current state. Driver order and source identity are preserved.
def bind_response(action: Driver.Action, order: Nat, original: Response.Identity,
    rest: List<&2, Binding>) -> List<&2, Binding>:
  match action:
    case Driver.Action{input, _, _, _, _}: response_binding(physical(input), order, original, rest)
