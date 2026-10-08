import Base
import ./freshness-originals.bend as Originals
import ./minimal-scenario.bend as Minimal
import ./jev-native-step.bend as Step
import ../FreshnessScenario.bend as Freshness
import ../Engine.bend as Engine
import ../Driver.bend as Driver
import ../Types.bend as Types
import ../Scheduler.bend as Scheduler
import ../Advicees.bend as Advicees
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger

# Original source labels enter through the current accepted-admission owner.
# Engine/Driver own registration, inheritance, fencing and stale-result policy.
# Full immutable before/after frames are retained internally; this fixture's
# existing NativeStep rows establish only their stated milestone projection.
type Frame is Data:
  Frame{time: Nat, input: Minimal.Input, before: Types.State,
    after: Types.State, rows: List<&2, List<&2, Nat>>}
type Trace is Data:
  Trace{state: Types.State, frames: List<&2, Frame>, complete: Bool}

# Queue custody of immutable original labels. Every generated slot inherits
# its producer's original source, never the source of a newer edit at delivery.
type Origin is Data:
  Origin{order: Nat, source: Freshness.Source}

def original_sources(edits: List<&2, Originals.Edit>, +order: Nat) -> List<&2, Origin>:
  match edits:
    case Nil{}: []
    case Originals.Edit{_, source} <> tail: Origin{order, source} <> original_sources(
      tail,
      (order + 1n : Nat)
    )

def source_at(origins: List<&2, Origin>, +order: Nat) -> Maybe<&2, Freshness.Source>:
  match origins:
    case Nil{}: None{}
    case Origin{candidate, source} <> tail:
      Bool.pick(
        Maybe<&2, Freshness.Source>,
        Nat.is_eq(candidate, order),
        Some{source},
        source_at(tail, order)
      )

def retained_origin(drop: Bool, origin: Origin, rest: List<&2, Origin>) -> List<&2, Origin>:
  match drop:
    case True{}: rest
    case False{}: origin <> rest

def consume(origins: List<&2, Origin>, +order: Nat) -> List<&2, Origin>:
  match origins:
    case Nil{}: []
    case Origin{+candidate, source} <> tail:
      retained_origin(Nat.is_eq(candidate, order), Origin{candidate, source}, consume(tail, order))

def appended_entry(
  include: Bool,
  order: Nat,
  source: Freshness.Source,
  rest: List<&2, Origin>
) -> List<&2, Origin>:
  match include:
    case True{}: Origin{order, source} <> rest
    case False{}: rest

def appended(
  items: List<&2, Minimal.Item>,
  +cutoff: Nat,
  +source: Maybe<&2, Freshness.Source>
) -> List<&2, Origin>:
  match items source:
    case Nil{} _: []
    case Minimal.Item{_, +order, _} <> tail Some{+source}:
      appended_entry(Nat.is_ge(order, cutoff), order, source, appended(tail, cutoff, Some{source}))
    case _ None{}: []

def propagated(q: Minimal.Queue, origins: List<&2, Origin>, cutoff: Nat,
    source: Maybe<&2, Freshness.Source>) -> List<&2, Origin>:
  match q:
    case Minimal.Queue{items, _, _}: List.append(
      &2,
      Origin,
      origins,
      appended(items, cutoff, source)
    )

def queue(edits: List<&2, Originals.Edit>, q: Minimal.Queue) -> Minimal.Queue:
  match edits:
    case Nil{}: q
    case Originals.Edit{at, _} <> tail: queue(tail, Minimal.append(q, at, Minimal.Edit{}))

def declared(result: Engine.AdviceeDeclared) -> Types.State:
  match result:
    case Engine.AdviceeDeclared{state, _, _}: state

def edited(result: Engine.EditAttempt, q: Minimal.Queue, now: Nat) -> Step.NativeStep:
  match result:
    case Engine.EditAttempt{state, plan}: Step.edited(plan, state, q, now)

def registered(
  admission: Engine.FreshnessAdmission,
  q: Minimal.Queue,
  now: Nat
) -> Types.State & Minimal.Queue:
  match admission:
    case Engine.FreshnessAdmission{+state, _, actions}:
      Minimal.issued(Engine.issue_actions(state, actions), q, now)

# Publish source registration only for the actual accepted command, exactly
# after the ordinary command handler and before the following command.
def admission(
  command: Canonical.Output,
  event: Canonical.CanonicalEvent,
  +state: Types.State,
  q: Minimal.Queue,
  source: Maybe<&2, Freshness.Source>,
  now: Nat
) -> Types.State & Minimal.Queue:
  match command event source:
    case Canonical.EventEstablished{Canonical.ObservationAdmitted{+id}} Canonical.AdmitObservation{
      p,
      l,
      r
    } Some{source}:
      registered(Engine.freshness_admitted(state, Freshness.Scope{p, l, r, id}, source,
        Canonical.EventEstablished{Canonical.ObservationAdmitted{id}}), q, now)
    case _ _ _: (state, q)

def command_handled(pair: Types.State & Minimal.Queue, command: Canonical.Output,
    event: Canonical.CanonicalEvent, source: Maybe<&2, Freshness.Source>, now: Nat,
    ih: Types.State -> Minimal.Queue -> Types.State & Minimal.Queue) -> Types.State & Minimal.Queue:
  match pair:
    case (state, q): Minimal.commands_next(admission(command, event, state, q, source, now), ih)

def outputs(
  values: List<&2, Canonical.Output>,
  q: Minimal.Queue,
  +now: Nat,
  state: Types.State,
  +event: Canonical.CanonicalEvent,
  +context: Driver.Context,
  +source: Maybe<&2, Freshness.Source>
) -> Types.State & Minimal.Queue:
  match values:
    case Nil{}: (state, q)
    case +command <> tail:
      continuation: Types.State -> Minimal.Queue -> Types.State & Minimal.Queue = next => queue => outputs(
        tail,
        queue,
        now,
        next,
        event,
        context,
        source
      )
      command_handled(
        Minimal.command(q, now, state, event, command, context),
        command,
        event,
        source,
        now,
        continuation
      )

def transition(value: Engine.Transition, before: Types.State, action: Driver.Action,
    q: Minimal.Queue, +now: Nat, source: Maybe<&2, Freshness.Source>) -> Step.NativeStep:
  match value action:
    case Engine.Transition{state, Canonical.Advanced{_, +actual}} Driver.Action{
      +event,
      +delay,
      +candidate,
      +job,
      +expiry
    }:
      Step.advanced(
        outputs(
          actual,
          q,
          now,
          state,
          event,
          Minimal.context(Driver.Action{event, delay, candidate, job, expiry}, Step.config(), now),
          source
        ),
        before,
        event,
        now,
        actual
      )
    case value action: Step.transition(value, before, action, q, now)

def execute(+state: Types.State, action: Driver.Action, q: Minimal.Queue, +now: Nat,
    source: Maybe<&2, Freshness.Source>) -> Step.NativeStep:
  match action:
    case Driver.Action{+event, +delay, +candidate, +job, +expiry}:
      +event=Engine.fence(state, event, True{}, Minimal.execution_context(event,
        Driver.Action{event, delay, candidate, job, expiry}, Step.config(), now))
      transition(
        Engine.step(state, event),
        state,
        Driver.Action{event, delay, candidate, job, expiry},
        q,
        now,
        source
      )

def interpreted(input: Minimal.Input, +state: Types.State, q: Minimal.Queue, +now: Nat,
    source: Maybe<&2, Freshness.Source>) -> Step.NativeStep:
  match input:
    case Minimal.Edit{}:
      edited(Engine.edit_attempt(state, 1n, 1n), q, now)
    case Minimal.Event{action}: execute(state, action, q, now, source)
    case input: Step.interpreted(input, state, q, now)

def recorded(
  result: Step.NativeStep,
  before: Types.State,
  input: Minimal.Input,
  now: Nat,
  frames: List<&2, Frame>,
  origins: List<&2, Origin>,
  cutoff: Nat,
  source: Maybe<&2, Freshness.Source>,
  ih: Types.State -> Minimal.Queue -> List<&2, Frame> -> List<&2, Origin> -> Trace
) -> Trace:
  match result:
    case Step.NativeStep{+state, +q, rows}:
      ih(
        state,
        q,
        Frame{now, input, before, state, rows} <> frames,
        propagated(q, origins, cutoff, source)
      )

def taken(result: Engine.Taken, +items: List<&2, Minimal.Item>, +sequence: Nat,
    +origins: List<&2, Origin>, frames: List<&2, Frame>,
    ih: Types.State -> Minimal.Queue -> List<&2, Frame> -> List<&2, Origin> -> Trace) -> Trace:
  match result:
    case Engine.Taken{+state, Some{Scheduler.Entry{+at, +order}}}:
      +input=Minimal.lookup(items, order)
      +source=source_at(origins, order)
      recorded(
        interpreted(
          input,
          state,
          Minimal.Queue{Minimal.remove(items, order), sequence, sequence},
          at,
          source
        ),
        state,
        input,
        at,
        frames,
        consume(origins, order),
        sequence,
        source,
        ih
      )
    case Engine.Taken{state, None{}}: Trace{state, List.reverse(&2, Frame, frames), True{}}

def selected(entries: List<&2, Scheduler.Entry>, +state: Types.State, items: List<&2, Minimal.Item>,
    sequence: Nat, origins: List<&2, Origin>, until: Nat, +frames: List<&2, Frame>,
    ih: Types.State -> Minimal.Queue -> List<&2, Frame> -> List<&2, Origin> -> Trace) -> Trace:
  match entries:
    case Scheduler.Entry{at, _} <> _:
      Bool.pick(
        Trace,
        Nat.is_le(at, until),
        taken(Engine.take(state), items, sequence, origins, frames, ih),
        Trace{state, List.reverse(&2, Frame, frames), True{}}
      )
    case Nil{}: Trace{state, List.reverse(&2, Frame, frames), True{}}

def next(
  +state: Types.State,
  q: Minimal.Queue,
  origins: List<&2, Origin>,
  until: Nat,
  frames: List<&2, Frame>,
  ih: Types.State -> Minimal.Queue -> List<&2, Frame> -> List<&2, Origin> -> Trace
) -> Trace:
  match q:
    case Minimal.Queue{+items, +sequence, synced}:
      +state = Minimal.sync(items, state, synced)
      selected(Engine.queued(state), state, items, sequence, origins, until, frames, ih)

def loop(fuel: Nat, state: Types.State, q: Minimal.Queue, origins: List<&2, Origin>, +until: Nat,
    frames: List<&2, Frame>) -> Trace:
  match fuel:
    case 0n: Trace{state, List.reverse(&2, Frame, frames), False{}}
    case 1n+rest:
      continuation: Types.State -> Minimal.Queue -> List<&2, Frame> -> List<&2, Origin> -> Trace = next => queue => frames => sources => loop(
        rest,
        next,
        queue,
        sources,
        until,
        frames
      )
      next(state, q, origins, until, frames, continuation)

def run(script: Originals.Script) -> Trace:
  match script:
    case Originals.Script{+edits, until}:
      loop(120n, declared(Engine.declare_advicee(Engine.configure_seed(
        Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}), 7n), 1n, 7n)),
        queue(edits, Minimal.Queue{[], 0n, 0n}), original_sources(edits, 0n), until, [])

def frame_rows(frames: List<&2, Frame>) -> List<&2, List<&2, Nat>>:
  match frames:
    case Nil{}: []
    case Frame{_, _, _, _, rows} <> tail: List.append(&2, List<&2, Nat>, rows, frame_rows(tail))

def rows(result: Trace) -> List<&2, List<&2, Nat>>:
  match result:
    case Trace{+state, frames, True{}}:
      List.append(
        &2,
        List<&2, Nat>,
        frame_rows(frames),
        [32n <> Engine.clock(state) <> Minimal.state_counts(state)]
      )
    case _: [[98n]]
