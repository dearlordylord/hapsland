# Exact captured callback transport shared by the public controls and native
# game. Box payloads/receipts at this boundary to retain a finite native ABI.
import Base
import ./NativeRun.bend as Run
import ./NativeRunTypes.bend as T
import ./Engine.bend as Engine
import ./Callbacks.bend as Callbacks
import ./OutputScenario.bend as Output
import ./Driver.bend as Driver
import ./Scheduler.bend as Scheduler
import ../agent-flow-bend/Canonical.bend as C

type Applied is Data:
  Applied{state: T.State, result: Callbacks.Applicability}

def callback_sources(state: T.State) -> List<&2, T.RetainedCallback>:
  match state:
    case T.State{_, _, _, _, _, _, _, _, _, _, T.HostFacts{_, items, _, _, _, _}}: items
def matches_target(items: List<&2, T.RetainedCallback>, target: Callbacks.Target) -> Bool:
  match items:
    case T.RetainedCallback{_, _, _, _, Callbacks.Fact{recorded, _, _, _}} <> _: Callbacks.target_equal(
      recorded,
      target
    )
    case _: False{}
def selected(
  equal: Bool,
  items: List<&2, Maybe<&2, T.RetainedCallback>>,
  rest: List<&2, Maybe<&2, T.RetainedCallback>>
) -> List<&2, Maybe<&2, T.RetainedCallback>>:
  match equal:
    case True{}: items
    case False{}: rest
def callback_source(
  items: List<&2, T.RetainedCallback>,
  +target: Callbacks.Target
) -> List<&2, Maybe<&2, T.RetainedCallback>>:
  match items:
    case Nil{}: [None{}]
    case +head <> tail: selected(
      matches_target([head], target),
      [Some{head}],
      callback_source(tail, target)
    )
def source_value(items: List<&2, Maybe<&2, T.RetainedCallback>>) -> Maybe<&2, T.RetainedCallback>:
  match items:
    case head <> _: head
    case _: None{}
def live_or_history(
  +live: List<&2, Maybe<&2, T.RetainedCallback>>,
  historical: List<&2, Maybe<&2, T.RetainedCallback>>
) -> List<&2, Maybe<&2, T.RetainedCallback>>:
  match live:
    case Some{_} <> _: live
    case _: historical
def callback_fact(source: List<&2, Maybe<&2, T.RetainedCallback>>) -> Maybe<&2, Callbacks.Fact>:
  match source:
    case Some{T.RetainedCallback{_, _, _, _, fact}} <> _: Some{fact}
    case _: None{}
def remaining_items(located: T.Located) -> List<&2, T.Item>:
  match located:
    case T.Located{_, remaining}: remaining
def cancel_orders(orders: List<&2, Nat>, +state: T.State) -> T.State:
  match orders:
    case Nil{}: state
    case +order <> tail:
      cancel_orders(
        tail,
        Run.replaced_items(
          Run.replace_core(state, Engine.cancel(Run.core(state), order)),
          remaining_items(Run.locate(Run.runtime_items(state), order))
        )
      )
def scheduled_payload(source: List<&2, Maybe<&2, T.RetainedCallback>>) -> Maybe<&2, T.Input>:
  match source:
    case Some{T.RetainedCallback{_, _, _, payload, _}} <> _: Some{payload}
    case _: None{}
def queue_exact(
  state: T.State,
  time: Nat,
  +order: Nat,
  payload: List<&2, T.Input>,
  receipt: List<&2, Maybe<&2, Callbacks.Fact>>
) -> T.State:
  match state payload:
    case T.State{core, items, next, count, seed, env, latest, valid, prepared, jobs, host} head <> _:
      T.State{
        [Engine.enqueue(Run.core_value(core), time, order)],
        List.append(&2, T.Item, items, [T.Item{order, head, receipt}]),
        Nat.max(next, (order + 1n : Nat)),
        count,
        seed,
        env,
        latest,
        valid,
        prepared,
        jobs,
        host
      }
    case state _: Run.invalid(state)
def schedule_payload(
  payload: List<&2, Maybe<&2, T.Input>>,
  state: T.State,
  time: Nat,
  order: Nat,
  receipt: List<&2, Maybe<&2, Callbacks.Fact>>
) -> T.State:
  match payload:
    case Some{payload} <> _: queue_exact(state, time, order, [payload], receipt)
    case _: Run.invalid(state)
def callback_schedule(
  items: List<&2, Callbacks.Scheduled>,
  state: T.State,
  +payload: List<&2, Maybe<&2, T.Input>>,
  +receipt: List<&2, Maybe<&2, Callbacks.Fact>>
) -> T.State:
  match items:
    case Nil{}: state
    case Callbacks.Scheduled{time, order, _} <> tail:
      callback_schedule(
        tail,
        schedule_payload(payload, state, time, order, receipt),
        payload,
        receipt
      )
def callback_changed(
  state: T.State,
  +source: List<&2, Maybe<&2, T.RetainedCallback>>,
  changed: List<&2, Engine.CallbackTransition>
) -> Applied:
  match changed:
    case Engine.CallbackTransition{core, result, cancel, schedule} <> _:
      Applied{callback_schedule(schedule, cancel_orders(cancel, Run.replace_core(state, core)),
        [scheduled_payload(source)], [callback_fact(source)]), result}
    case _: Applied{Run.invalid(state), Callbacks.Missing{}}
# Completion housekeeping is identified by the captured producer's action
# positions AND exact token/event payload. Unrelated expiry/cancellation inputs
# are never moved, and already consumed items are never recreated.
def cleanup_equal(expected: C.CanonicalEvent, actual: C.CanonicalEvent) -> Bool:
  match expected actual:
    case C.CollectionLeaseCheck{+a, +t, +e, +b, +c, +d} C.CollectionLeaseCheck{x, y, f, g, h, i}:
      Nat.is_eq(a, x) && Nat.is_eq(t, y) && U32.is_eq(Bool.to_u32(e), Bool.to_u32(f)) && U32.is_eq(
        Bool.to_u32(b),
        Bool.to_u32(g)
      ) && U32.is_eq(Bool.to_u32(c), Bool.to_u32(h)) && U32.is_eq(Bool.to_u32(d), Bool.to_u32(i))
    case C.CollectionReleaseLease{a, t} C.CollectionReleaseLease{x, y}: Nat.is_eq(a, x) && Nat.is_eq(
      t,
      y
    )
    case C.SubmissionRelease{a, t} C.SubmissionRelease{x, y}: Nat.is_eq(a, x) && Nat.is_eq(t, y)
    case _ _: False{}
def input_matches(input: T.Input, event: C.CanonicalEvent) -> Bool:
  match input:
    case T.Event{Driver.Action{actual, _, _, _, _}, _, _, _}: cleanup_equal(event, actual)
    case T.FinishInput{Driver.Action{actual, _, _, _, _}, _, _, _}: cleanup_equal(event, actual)
    case _: False{}
def cleanup_item(items: List<&2, T.Item>, +order: Nat, +event: C.CanonicalEvent) -> Bool:
  match items:
    case Nil{}: False{}
    case T.Item{id, input, _} <> tail:
      (Nat.is_eq(id, order) && input_matches(input, event)) || cleanup_item(tail, order, event)
def queued(items: List<&2, Scheduler.Entry>, +order: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case Scheduler.Entry{_, id} <> tail: Nat.is_eq(id, order) || queued(tail, order)
def move_cleanup(on: Bool, +state: T.State, +order: Nat, at: Nat) -> T.State:
  match on:
    case False{}: state
    case True{}: Run.replace_core(
      state,
      Engine.enqueue(Engine.cancel(Run.core(state), order), at, order)
    )
def cleanup_steps(
  items: List<&2, Output.Scheduled>,
  +state: T.State,
  +order: Nat,
  +at: Nat
) -> T.State:
  match items:
    case Nil{}: state
    case Output.Scheduled{event, _} <> tail:
      cleanup_steps(
        tail,
        move_cleanup(
          queued(
            Engine.queued(Run.core(state)),
            order
          ) && cleanup_item(Run.runtime_items(state), order, event),
          state,
          order,
          at
        ),
        (order+1n : Nat),
        at
      )
def after_terminal(items: List<&2, Output.Scheduled>) -> List<&2, Output.Scheduled>:
  match items:
    case _ <> tail: tail
    case _: []
def completion_cleanup(found: Maybe<&2, Callbacks.Fact>, state: T.State, at: Nat) -> T.State:
  match found:
    case Some{
      Callbacks.Fact{+target, _, _, Some{Output.Capture{attempt, _, +outcome, +delay, +lease}}}
    }:
      cleanup_steps(
        after_terminal(
          Output.terminal(
            attempt,
            outcome,
            Output.expired(outcome, delay, lease),
            Output.due(outcome, delay, lease),
            lease
          )
        ),
        state,
        (Callbacks.order_of(target)+1n : Nat),
        at
      )
    case _: state
def transported(
  result: Applied,
  action: Callbacks.Control,
  source: List<&2, Maybe<&2, T.RetainedCallback>>
) -> Applied:
  match result action:
    case Applied{state, Callbacks.Applied{}} Callbacks.Transport{at}:
      Applied{completion_cleanup(callback_fact(source), state, at), Callbacks.Applied{}}
    case value _: value
def apply(
  +state: T.State,
  target: Callbacks.Target,
  +action: Callbacks.Control,
  +source: List<&2, Maybe<&2, T.RetainedCallback>>
) -> Applied:
  transported(
    callback_changed(
      state,
      source,
      [
        Engine.callback_action(
          Run.core(state),
          target,
          action,
          callback_fact(source),
          Run.clock(state),
          Run.next_order(state)
        )
      ]
    ),
    action,
    source
  )
