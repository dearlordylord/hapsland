import Base
import ./advicee-lifecycle-driver.bend as Edge
import ./callback-native-driver.bend as CallbacksEdge
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../StopScenario.bend as Stop
import ../OutputScenario.bend as Output
import ../Callbacks.bend as Callbacks
import ../Scheduler.bend as Scheduler
import ../../agent-flow-bend/Canonical.bend as C

# Reuse the actual callback issuer and factual Edge. This module allocates no
# callback identities and makes no routing, lifetime or scheduler decisions.
type Captured is Data:
  Captured{runtime: List<&2, Edge.Runtime>, issued: Nat}
type Stepped<-F: Data> is Type:
  Stepped{observed: Edge.Observed<F>, receipt: Maybe<&2, Callbacks.Target>}

def action(input: Edge.Input) -> Maybe<&2, Driver.Action>:
  match input:
    case Edge.Event{action, _, _, issuance}: Some{action}
    case Edge.FitEvent{action, _, _, _, issuance}: Some{action}
    case _: None{}

# Original Finish completion facts come from the same registry populated by
# Stop.command_authorized. Callbacks validates the full target/selected tuple;
# the transport neither rebuilds a capture nor decides output acceptance.
def finish_output_list(values: List<&2, Output.Capture>) -> Maybe<&2, Output.Capture>:
  match values:
    case Output.Capture{_, _, Output.Failed{}, _, _} <> Nil{}: None{}
    case capture <> Nil{}: Some{capture}
    case _: None{}

def finish_output(found: Maybe<&2, Stop.Finish>) -> Maybe<&2, Output.Capture>:
  match found:
    case Some{Stop.Finish{_, _, _, _, _, _, _, _, _, _, _, _, output}}: finish_output_list(output)
    case None{}: None{}

def output_capture(
  captured: Maybe<&2, Output.Capture>,
  event: C.CanonicalEvent,
  state: Types.State
) -> Maybe<&2, Output.Capture>:
  match captured event:
    case Some{capture} _: Some{capture}
    case None{} C.FinishTerminal{partition, _, _, _, _, _}: finish_output(
      Engine.stop_find(state, partition)
    )
    case None{} _: None{}

def issue_output_owned(owner: Maybe<&2, Callbacks.Owner>, state: Types.State, order: Nat, at: Nat,
    action: Driver.Action, capture: Output.Capture) -> Types.State:
  match owner:
    case Some{owner}: CallbacksEdge.issued_state(
      Engine.callback_issue_output(state, owner, order, at, action, capture)
    )
    case None{}: state

def issue_output(capture: Maybe<&2, Output.Capture>, +state: Types.State, order: Nat, at: Nat,
    +action: Driver.Action) -> Types.State:
  match capture:
    case Some{capture}: issue_output_owned(
      Engine.callback_owner(state, Callbacks.event_of(action)),
      state,
      order,
      at,
      action,
      capture
    )
    case None{}: CallbacksEdge.issue_action(Some{action}, state, order, at)

def issue_environmental(
  issuance: Edge.Issuance,
  +action: Driver.Action,
  +state: Types.State,
  order: Nat,
  at: Nat
) -> Types.State:
  match issuance:
    case Edge.Environmental{capture}: issue_output(
      output_capture(capture, Callbacks.event_of(action), state),
      state,
      order,
      at,
      action
    )
    case Edge.CanonicalFeedback{}: state
    case Edge.RawInput{}: state

def issue_input(input: Edge.Input, state: Types.State, order: Nat, at: Nat) -> Types.State:
  match input:
    case Edge.Event{action, _, _, issuance}: issue_environmental(issuance, action, state, order, at)
    case Edge.FitEvent{action, _, _, _, issuance}: issue_environmental(
      issuance,
      action,
      state,
      order,
      at
    )
    case _: state

def issue_fresh(
  fresh: Bool,
  input: Edge.Input,
  state: Types.State,
  order: Nat,
  at: Nat
) -> Types.State:
  match fresh:
    case False{}: state
    case True{}: issue_input(input, state, order, at)

def issue_items(items: List<&2, Edge.Item>, state: Types.State, +issued: Nat) -> Types.State:
  match items:
    case []: state
    case Edge.Item{at, +order, input} <> tail:
      issue_items(tail, issue_fresh(Nat.is_le(issued, order), input, state, order, at), issued)

# Publish the same original output capture into the queued input before issuing
# its callback fact. Raw inputs and canonical feedback retain their provenance.
def captured_issuance(
  issuance: Edge.Issuance,
  action: Driver.Action,
  state: Types.State
) -> Edge.Issuance:
  match issuance:
    case Edge.Environmental{capture}: Edge.Environmental{
      output_capture(capture, Callbacks.event_of(action), state)
    }
    case other: other

def captured_input(fresh: Bool, input: Edge.Input, state: Types.State) -> Edge.Input:
  match fresh input:
    case True{} Edge.Event{+action, job, source, issuance}:
      Edge.Event{action, job, source, captured_issuance(issuance, action, state)}
    case True{} Edge.FitEvent{+action, job, attempt, source, issuance}:
      Edge.FitEvent{action, job, attempt, source, captured_issuance(issuance, action, state)}
    case _ input: input

def captured_items(
  items: List<&2, Edge.Item>,
  +state: Types.State,
  +issued: Nat
) -> List<&2, Edge.Item>:
  match items:
    case []: []
    case Edge.Item{at, +order, input} <> tail:
      Edge.Item{at, order, captured_input(Nat.is_le(issued, order), input, state)} <> captured_items(
        tail,
        state,
        issued
      )

def captured_runtime(runtime: List<&2, Edge.Runtime>, issued: Nat) -> List<&2, Edge.Runtime>:
  match runtime:
    case Edge.Runtime{+state, Edge.Queue{items, sequence, synced}, jobs, delay} <> Nil{}:
      [
        Edge.Runtime{
          state,
          Edge.Queue{captured_items(items, state, issued), sequence, synced},
          jobs,
          delay
        }
      ]
    case runtime: runtime

def capture_states(runtime: List<&2, Edge.Runtime>, issued: Nat) -> List<&2, Types.State>:
  match runtime:
    case Edge.Runtime{state, Edge.Queue{items, _, _}, _, _} <> Nil{}:
      [issue_items(items, state, issued)]
    case _: []

def capture_ready(
  states: List<&2, Types.State>,
  runtime: List<&2, Edge.Runtime>,
  issued: Nat
) -> Captured:
  match states runtime:
    case state <> Nil{} Edge.Runtime{_, Edge.Queue{items, +sequence, synced}, jobs, delay} <> Nil{}:
      Captured{[Edge.Runtime{state, Edge.Queue{items, sequence, synced}, jobs, delay}], sequence}
    case _ runtime: Captured{runtime, issued}

def capture_prepared(+runtime: List<&2, Edge.Runtime>, +issued: Nat) -> Captured:
  capture_ready(capture_states(runtime, issued), runtime, issued)

def capture(runtime: List<&2, Edge.Runtime>, +issued: Nat) -> Captured:
  capture_prepared(captured_runtime(runtime, issued), issued)

def receipt_target(receipt: Maybe<&2, Callbacks.Fact>) -> Maybe<&2, Callbacks.Target>:
  match receipt:
    case Some{Callbacks.Fact{target, _, _, _}}: Some{target}
    case None{}: None{}

def take_receipted(
  -F: Data,
  +receipt: Maybe<&2, Callbacks.Fact>,
  runtime: List<&2, Edge.Runtime>,
  environment: Edge.Environment,
  factory: List<&2, C.Output> -> Edge.TransitionHook<F>
) -> Stepped<F>:
  Stepped{
    Edge.observe_step_with(F, runtime, receipt, environment, factory),
    receipt_target(receipt)
  }

def take_selected(
  -F: Data,
  +runtime: List<&2, Edge.Runtime>,
  input: Edge.Input,
  +order: Nat,
  environment: Edge.Environment,
  factory: List<&2, C.Output> -> Edge.TransitionHook<F>
) -> Stepped<F>:
  take_receipted(F, Edge.frame_receipt(runtime, order), runtime, environment, factory)

# Finish actions and hook construction while complete state stays inside next.
def routed_queue(next: List<&2, Engine.SharingNext>, runtime: List<&2, Edge.Runtime>,
    now: Nat, job: Edge.Job) -> List<&2, Edge.Queue>:
  match next runtime:
    case Engine.SharingNext{_, Some{_}, events} <> Nil{} Edge.Runtime{_, queue, _, _} <> Nil{}:
      [Edge.actions(Engine.sharing_actions(events), queue, now, job)]
    case _ _: []

def routed_scopes(
  next: List<&2, Engine.SharingNext>,
  provided: Maybe<&2, Nat>
) -> List<&2, Maybe<&2, Nat>>:
  match next:
    case Engine.SharingNext{_, Some{Engine.SharingFrame{before, after, event, result}}, _} <> Nil{}:
      Edge.frame_scope_states([before], [after], Edge.actual_commands(result), event, provided)
    case _: []

def routed_following(queue: List<&2, Edge.Queue>, next: List<&2, Engine.SharingNext>,
    runtime: List<&2, Edge.Runtime>) -> List<&2, Edge.Runtime>:
  match queue next runtime:
    case queue <> Nil{} Engine.SharingNext{state, Some{_}, _} <> Nil{} Edge.Runtime{
      _,
      _,
      jobs,
      delay
    } <> Nil{}:
      [Edge.Runtime{state, queue, jobs, delay}]
    case _ _ _: []

def routed_frame(-F: Data, +following: List<&2, Edge.Runtime>, next: List<&2, Engine.SharingNext>,
    runtime: List<&2, Edge.Runtime>, now: Nat, order: Nat, scopes: List<&2, Maybe<&2, Nat>>,
    provided: Maybe<&2, Nat>, hook: Edge.CommandHook<F>) -> Stepped<F>:
  match following next:
    case _ <> Nil{} Engine.SharingNext{
      _,
      Some{Engine.SharingFrame{before, after, event, result}},
      _
    } <> Nil{}:
      Stepped{
        Edge.Observed{
          following,
          Some{
            Edge.CanonicalFrame{
              [before],
              [after],
              now,
              order,
              event,
              [result],
              runtime,
              following,
              provided,
              scopes,
              None{},
              []
            }
          },
          hook
        },
        None{}
      }
    case _ _: Stepped{Edge.Observed{runtime, Some{Edge.UnexpectedInput{}}, hook}, None{}}

def routed_scoped(-F: Data, scopes: List<&2, Maybe<&2, Nat>>, queue: List<&2, Edge.Queue>,
    +next: List<&2, Engine.SharingNext>, +runtime: List<&2, Edge.Runtime>, now: Nat, order: Nat,
    provided: Maybe<&2, Nat>, hook: Edge.CommandHook<F>) -> Stepped<F>:
  routed_frame(
    F,
    routed_following(queue, next, runtime),
    next,
    runtime,
    now,
    order,
    scopes,
    provided,
    hook
  )

def routed_ready(
  -F: Data,
  queue: List<&2, Edge.Queue>,
  +next: List<&2, Engine.SharingNext>,
  runtime: List<&2, Edge.Runtime>,
  now: Nat,
  order: Nat,
  +provided: Maybe<&2, Nat>,
  hook: Edge.CommandHook<F>
) -> Stepped<F>:
  routed_scoped(F, routed_scopes(next, provided), queue, next, runtime, now, order, provided, hook)

def routed_mode(next: List<&2, Engine.SharingNext>) -> Nat:
  match next:
    case Engine.SharingNext{_, Some{_}, _} <> Nil{}: 2n
    case Engine.SharingNext{_, None{}, _} <> Nil{}: 1n
    case _: 0n

type PendingRoute is Data:
  PendingRoute{next: List<&2, Engine.SharingNext>, runtime: List<&2, Edge.Runtime>,
    input: List<&2, Edge.Input>, now: Nat, order: Nat, job: List<&2, Edge.Job>,
    environment: List<&2, Edge.Environment>}

def route_runtime(pending: PendingRoute) -> List<&2, Edge.Runtime>:
  match pending:
    case PendingRoute{_, runtime, _, _, _, _, _}: runtime

def route_mode(pending: PendingRoute) -> Nat:
  match pending:
    case PendingRoute{next, _, _, _, _, _, _}: routed_mode(next)

def route_queue(pending: PendingRoute) -> List<&2, Edge.Queue>:
  match pending:
    case PendingRoute{next, runtime, _, now, _, job <> Nil{}, _}: routed_queue(
      next,
      runtime,
      now,
      job
    )
    case _: []

def route_ready(-F: Data, queue: List<&2, Edge.Queue>, pending: PendingRoute,
    hook: Edge.CommandHook<F>) -> Stepped<F>:
  match pending:
    case PendingRoute{next, runtime, _, now, order, job <> Nil{}, _}:
      routed_ready(F, queue, next, runtime, now, order, Some{Edge.job_partition(job)}, hook)
    case pending: Stepped{
      Edge.Observed{route_runtime(pending), Some{Edge.UnexpectedInput{}}, hook},
      None{}
    }

def route_selected(-F: Data, pending: PendingRoute,
    factory: List<&2, C.Output> -> Edge.TransitionHook<F>) -> Stepped<F>:
  match pending:
    case PendingRoute{_, runtime, input <> Nil{}, _, order, _, environment <> Nil{}}:
      take_selected(F, runtime, input, order, environment, factory)
    case pending: Stepped{
      Edge.Observed{
        route_runtime(pending),
        Some{Edge.UnexpectedInput{}},
        Edge.transition_commands(F, factory([]))
      },
      None{}
    }

def routed_selected(-F: Data, mode: Nat, +pending: PendingRoute,
    factory: List<&2, C.Output> -> Edge.TransitionHook<F>) -> Stepped<F>:
  match mode:
    case 2n: route_ready(F, route_queue(pending), pending, Edge.transition_commands(F, factory([])))
    case 1n: route_selected(F, pending, factory)
    case _: Stepped{
      Edge.Observed{
        route_runtime(pending),
        Some{Edge.UnexpectedInput{}},
        Edge.transition_commands(F, factory([]))
      },
      None{}
    }

def routed_pending(-F: Data, +pending: PendingRoute,
    factory: List<&2, C.Output> -> Edge.TransitionHook<F>) -> Stepped<F>:
  routed_selected(F, route_mode(pending), pending, factory)

def routed(
  -F: Data,
  next: List<&2, Engine.SharingNext>,
  runtime: List<&2, Edge.Runtime>,
  input: Edge.Input,
  now: Nat,
  order: Nat,
  job: Edge.Job,
  environment: Edge.Environment,
  factory: List<&2, C.Output> -> Edge.TransitionHook<F>
) -> Stepped<F>:
  routed_pending(F, PendingRoute{next, runtime, [input], now, order, [job], [environment]}, factory)

def preprocess_next(runtime: List<&2, Edge.Runtime>, event: C.CanonicalEvent,
    order: Nat, endpoint: Nat) -> List<&2, Engine.SharingNext>:
  match runtime:
    case Edge.Runtime{state, _, _, _} <> Nil{}:
      [Engine.sharing_preprocess(state, event, order, Some{endpoint})]
    case _: []

def preprocess(
  -F: Data,
  input: Edge.Input,
  +runtime: List<&2, Edge.Runtime>,
  now: Nat,
  +order: Nat,
  endpoint: Nat,
  environment: Edge.Environment,
  factory: List<&2, C.Output> -> Edge.TransitionHook<F>
) -> Stepped<F>:
  match input:
    case Edge.Event{
      Driver.Action{+event, delay, candidate, binding, expiry},
      +job,
      source,
      issuance
    }:
      routed(
        F,
        preprocess_next(runtime, event, order, endpoint),
        runtime,
        Edge.Event{Driver.Action{event, delay, candidate, binding, expiry}, job, source, issuance},
        now,
        order,
        job,
        environment,
        factory
      )
    case Edge.FitEvent{
      Driver.Action{+event, delay, candidate, binding, expiry},
      +job,
      attempt,
      source,
      issuance
    }:
      routed(
        F,
        preprocess_next(runtime, event, order, endpoint),
        runtime,
        Edge.FitEvent{
          Driver.Action{event, delay, candidate, binding, expiry},
          job,
          attempt,
          source,
          issuance
        },
        now,
        order,
        job,
        environment,
        factory
      )
    case input: take_selected(F, runtime, input, order, environment, factory)

def within(
  -F: Data,
  allowed: Bool,
  input: Edge.Input,
  runtime: List<&2, Edge.Runtime>,
  at: Nat,
  order: Nat,
  endpoint: Nat,
  environment: Edge.Environment,
  factory: List<&2, C.Output> -> Edge.TransitionHook<F>
) -> Stepped<F>:
  match allowed:
    case True{}: preprocess(F, input, runtime, at, order, endpoint, environment, factory)
    case False{}: Stepped{
      Edge.Observed{runtime, None{}, Edge.transition_commands(F, factory([]))},
      None{}
    }

def selected(
  -F: Data,
  head: List<&2, Scheduler.Entry>,
  +runtime: List<&2, Edge.Runtime>,
  +endpoint: Nat,
  environment: Edge.Environment,
  factory: List<&2, C.Output> -> Edge.TransitionHook<F>
) -> Stepped<F>:
  match head:
    case Scheduler.Entry{+at, +order} <> _:
      within(
        F,
        Nat.is_le(at, endpoint),
        Edge.lookup(Edge.runtime_items(runtime), order),
        runtime,
        at,
        order,
        endpoint,
        environment,
        factory
      )
    case Nil{}: Stepped{
      Edge.Observed{runtime, None{}, Edge.transition_commands(F, factory([]))},
      None{}
    }

def step_valid(
  -F: Data,
  valid: Bool,
  +runtime: List<&2, Edge.Runtime>,
  endpoint: Nat,
  environment: Edge.Environment,
  factory: List<&2, C.Output> -> Edge.TransitionHook<F>
) -> Stepped<F>:
  match valid:
    case True{}: selected(F, Edge.runtime_entries(runtime), runtime, endpoint, environment, factory)
    case False{}: Stepped{
      Edge.Observed{
        runtime,
        Some{Edge.UnexpectedInput{}},
        Edge.transition_commands(F, factory([]))
      },
      None{}
    }

def step_synced(
  -F: Data,
  +runtime: List<&2, Edge.Runtime>,
  endpoint: Nat,
  environment: Edge.Environment,
  factory: List<&2, C.Output> -> Edge.TransitionHook<F>
) -> Stepped<F>:
  step_valid(F, Edge.runtime_valid(runtime), runtime, endpoint, environment, factory)

def step(
  -F: Data,
  runtime: List<&2, Edge.Runtime>,
  endpoint: Nat,
  environment: Edge.Environment,
  factory: List<&2, C.Output> -> Edge.TransitionHook<F>
) -> Stepped<F>:
  step_synced(F, Edge.runtime_sync(runtime), endpoint, environment, factory)
