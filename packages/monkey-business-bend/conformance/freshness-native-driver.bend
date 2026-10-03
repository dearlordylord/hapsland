import Base
import ./freshness-originals.bend as Originals
import ./minimal-scenario.bend as Minimal
import ./jev-native-step.bend as Step
import ../FreshnessScenario.bend as Freshness
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Scheduler.bend as Scheduler
import ../Advicees.bend as Advicees
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger

# SOURCE-ONLY TDD gap: Engine.freshness_edit_attempt is the agreed central
# admission seam, not yet wired at this branch's frozen integration baseline.
# No local registry, generation decision or recorded JS trace is substituted.
# Full immutable native before/after owner/graph/scheduler values are retained in Frames;
# current main emits the existing NativeStep row projection only. Exact raw
# frame export awaits the shared adapter metadata/observation ABI.
type Frame is Data:
  Frame{time: Nat, input: Minimal.Input, before: Types.State,
    after: Types.State, rows: List<&2, List<&2, Nat>>}
type Trace is Data:
  Trace{state: Types.State, frames: List<&2, Frame>, complete: Bool}

def source_at(edits: List<&2, Originals.Edit>, +now: Nat) -> Freshness.Source:
  match edits:
    case Nil{}: Freshness.Source{0n, 0n}
    case Originals.Edit{at, source} <> tail:
      Bool.pick(Freshness.Source, Nat.is_eq(at, now), source, source_at(tail, now))

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

def interpreted(input: Minimal.Input, +state: Types.State, q: Minimal.Queue, +now: Nat,
    edits: List<&2, Originals.Edit>) -> Step.NativeStep:
  match input:
    case Minimal.Edit{}:
      edited(Engine.freshness_edit_attempt(state, 1n, 1n, source_at(edits, now)), q, now)
    case input: Step.interpreted(input, state, q, now)

def recorded(result: Step.NativeStep, before: Types.State, input: Minimal.Input, now: Nat,
    frames: List<&2, Frame>, ih: Types.State -> Minimal.Queue -> List<&2, Frame> -> Trace) -> Trace:
  match result:
    case Step.NativeStep{+state, q, rows}:
      ih(state, q, Frame{now, input, before, state, rows} <> frames)

def taken(result: Engine.Taken, +items: List<&2, Minimal.Item>, +sequence: Nat,
    +edits: List<&2, Originals.Edit>, frames: List<&2, Frame>,
    ih: Types.State -> Minimal.Queue -> List<&2, Frame> -> Trace) -> Trace:
  match result:
    case Engine.Taken{+state, Some{Scheduler.Entry{+at, +order}}}:
      +input = Minimal.lookup(items, order)
      recorded(interpreted(input, state, Minimal.Queue{Minimal.remove(items, order), sequence, sequence}, at, edits),
        state, input, at, frames, ih)
    case Engine.Taken{state, None{}}: Trace{state, List.reverse(&2, Frame, frames), True{}}

def selected(entries: List<&2, Scheduler.Entry>, +state: Types.State, items: List<&2, Minimal.Item>,
    sequence: Nat, edits: List<&2, Originals.Edit>, until: Nat, +frames: List<&2, Frame>,
    ih: Types.State -> Minimal.Queue -> List<&2, Frame> -> Trace) -> Trace:
  match entries:
    case Scheduler.Entry{at, _} <> _:
      Bool.pick(Trace, Nat.is_le(at, until), taken(Engine.take(state), items, sequence, edits, frames, ih),
        Trace{state, List.reverse(&2, Frame, frames), True{}})
    case Nil{}: Trace{state, List.reverse(&2, Frame, frames), True{}}

def next(+state: Types.State, q: Minimal.Queue, edits: List<&2, Originals.Edit>, until: Nat,
    frames: List<&2, Frame>, ih: Types.State -> Minimal.Queue -> List<&2, Frame> -> Trace) -> Trace:
  match q:
    case Minimal.Queue{+items, +sequence, synced}:
      +state = Minimal.sync(items, state, synced)
      selected(Engine.queued(state), state, items, sequence, edits, until, frames, ih)

def loop(fuel: Nat, state: Types.State, q: Minimal.Queue, +edits: List<&2, Originals.Edit>, +until: Nat,
    frames: List<&2, Frame>) -> Trace:
  match fuel:
    case 0n: Trace{state, List.reverse(&2, Frame, frames), False{}}
    case 1n+rest: next(state, q, edits, until, frames,
      next => queue => frames => loop(rest, next, queue, edits, until, frames))

def run(script: Originals.Script) -> Trace:
  match script:
    case Originals.Script{+edits, until}:
      loop(120n, declared(Engine.declare_advicee(Engine.configure_seed(
        Engine.initial(Ledger.Limits{32n, 100000n, 16n, 50000n}), 7n), 1n, 7)),
        queue(edits, Minimal.Queue{[], 0n, 0n}), edits, until, [])

def frame_rows(frames: List<&2, Frame>) -> List<&2, List<&2, Nat>>:
  match frames:
    case Nil{}: []
    case Frame{_, _, _, _, rows} <> tail: List.append(&2, List<&2, Nat>, rows, frame_rows(tail))

def rows(result: Trace) -> List<&2, List<&2, Nat>>:
  match result:
    case Trace{+state, frames, True{}}:
      List.append(&2, List<&2, Nat>, frame_rows(frames), [32n <> Engine.clock(state) <> Minimal.state_counts(state)])
    case _: [[98n]]
