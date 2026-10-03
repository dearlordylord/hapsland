import Base
import ../NativeRun.bend as Run
import ../NativeRunTypes.bend as T
import ./native-run-scenario.bend as Trace

# Original control scripts may wait for a public event boundary. This adapter
# only observes frames; it never generates policy facts or canonical events.
def event_reached(frame: T.Frame, wanted: Nat) -> Bool:
  match frame:
    case T.ProductFrame{_, _, event, _, _, _, _}: Nat.is_eq(Trace.event_code(event), wanted)
    case _: False{}

def recorded_hit(hit: Bool, state: T.State, recorded: List<&2, List<&2, Nat>>,
    rest: T.State -> List<&2, List<&2, Nat>> -> Trace.Trace) -> Trace.Trace:
  match hit:
    case True{}: Trace.Trace{[state], List.reverse(&2, List<&2, Nat>, recorded)}
    case False{}: rest(state, recorded)

def reached(hit: Bool, +state: T.State, frame: T.Frame, rows: List<&2, List<&2, Nat>>,
    rest: T.State -> List<&2, List<&2, Nat>> -> Trace.Trace) -> Trace.Trace:
  recorded_hit(hit, state, Trace.frame_row(frame, Trace.observed_canonical(Run.observe(state))) <> rows, rest)

def event_step(result: T.Step, rows: List<&2, List<&2, Nat>>, wanted: Nat,
    rest: T.State -> List<&2, List<&2, Nat>> -> Trace.Trace) -> Trace.Trace:
  match result:
    case T.Step{state, Some{+frame}}: reached(event_reached(frame, wanted), state, frame, rows, rest)
    case T.Step{state, None{}}: Trace.Trace{[state], List.reverse(&2, List<&2, Nat>, rows)}

def until_event(fuel: Nat, state: T.State, +wanted: Nat, rows: List<&2, List<&2, Nat>>) -> Trace.Trace:
  match fuel:
    case 0n: Trace.Trace{[state], List.reverse(&2, List<&2, Nat>, rows)}
    case 1n+rest:
      event_step(Run.step(state), rows, wanted, next => rs => until_event(rest, next, wanted, rs))
