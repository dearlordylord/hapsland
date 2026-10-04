import Base
import ../NativeRun.bend as Run
import ../NativeRunTypes.bend as T
import ../Session.bend as Session
import ../Workload.bend as Workload
import ../Numeric.bend as Numeric
import ../TreeFacts.bend as Tree
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/ImportGraph.bend as Graph
import ./native-run-projection.bend as Projection

# Test-only original inputs and read-only trace projection. No recorded public
# events are fed to native execution, and no decision policy is copied here.
type Trace is Data:
  Trace{state: List<&2, T.State>, rows: List<&2, List<&2, Nat>>}

def weights() -> List<&2, Numeric.Words>:
  [Numeric.Words{0n, 0n}, Numeric.Words{1072693248n, 0n}, Numeric.Words{1072693248n, 0n},
   Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}]

def original_config() -> T.Config:
  T.Config{Ledger.Limits{32n, 100000n, 16n, 50000n},
    [T.Advicee{1n,7n,Some{Workload.Profile{Session.Settings{10, 0, 2, 100, 0, 50}, 7, [97], 10n, [5n], None{}}}}],
    T.Environment{5n, Some{Canonical.RequestClear{}}, weights(), 2n,
      Tree.Profile{2n, 2n, 1n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 100n, 100n, 20n, 20n},
      Graph.Limits{1n, 262144n, 20480n, 8n, 1572864n, 16n, 4n, 128n},
      0n, 30000n, True{}, True{}, 1n, True{}, 600000n}, None{}}

def boxed(states: List<&2, T.State>) -> T.State:
  match states:
    case state <> _: state
    case Nil{}: Run.invalid(Run.create(original_config(), 7n))

def event_code(event: Canonical.CanonicalEvent) -> Nat:
  match event:
    case Canonical.StopPolled{_, _, _, _}: 40n
    case Canonical.RoundContinuationBudgetCheck{_, _}: 41n
    case Canonical.FinishReserve{_, _, _, _, _, _, _, _, _, _, _}: 42n
    case Canonical.FinishAuthorize{_, _, _, _, _}: 43n
    case Canonical.FinishTerminal{_, _, _, _, _, _}: 44n
    case Canonical.ContinuationConsume{_, _}: 45n
    case Canonical.FinishEnd{_, _, _, _}: 46n
    case Canonical.StopGroupEnded{_, _, _, _}: 47n
    case Canonical.RetirePartition{_, _, _}: 48n
    case event: Projection.event_code(event)

def event_identity(event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.StopPolled{p, l, r, _}: [p, l, r, 0n, 0n, 0n, 0n]
    case Canonical.FinishReserve{p, l, r, attempt, token, _, _, _, _, _, _}: [p, l, r, attempt, 0n, 0n, token]
    case Canonical.FinishAuthorize{p, r, attempt, token, _}: [p, 1n, r, attempt, 0n, 0n, token]
    case Canonical.FinishTerminal{p, r, attempt, token, _, _}: [p, 1n, r, attempt, 0n, 0n, token]
    case Canonical.FinishEnd{p, r, attempt, token}: [p, 1n, r, attempt, 0n, 0n, token]
    case Canonical.ContinuationConsume{p, r}: [p, 1n, r, 0n, 0n, 0n, 0n]
    case Canonical.StopGroupEnded{p, l, r, _}: [p, l, r, 0n, 0n, 0n, 0n]
    case Canonical.RetirePartition{p, l, r}: [p, l, r, 0n, 0n, 0n, 0n]
    case event: Projection.event_identity(event)

def command_code(command: Canonical.Command) -> Nat:
  match command:
    case Canonical.WaitForWork{}: 40n
    case Canonical.WaitForOutput{}: 41n
    case Canonical.FinishReady{}: 42n
    case Canonical.FinishLimit{}: 43n
    case Canonical.RoundContinuationAvailable{}: 44n
    case Canonical.RoundContinuationExhausted{}: 45n
    case Canonical.FinishAllowedNoAdvice{}: 46n
    case Canonical.FinishAllowedDeadline{}: 47n
    case Canonical.FinishAllowedUnavailable{}: 48n
    case Canonical.FinishReserved{}: 49n
    case Canonical.FinishAuthorized{}: 50n
    case Canonical.FinishRecorded{_}: 51n
    case Canonical.FinishEnded{}: 52n
    case Canonical.FinishReleased{}: 53n
    case Canonical.ContinuationConsumed{}: 54n
    case Canonical.StopEnded{}: 55n
    case Canonical.PartitionRetired{_}: 56n
    case command: Projection.command_code(command)

def command_codes(commands: List<&2, Canonical.Command>) -> List<&2, Nat>:
  match commands:
    case Nil{}: []
    case command <> tail: command_code(command) <> command_codes(tail)

def rejected(reason: Maybe<&2, Canonical.Reason>) -> Nat:
  match reason:
    case None{}: 0n
    case Some{_}: 1n

def terminal_code(outcome: Canonical.WriteOutcome) -> Nat:
  match outcome:
    case Canonical.Acknowledged{}: 1n
    case Canonical.Failed{}: 2n
    case Canonical.Unknown{}: 3n

def event_facts(event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.StopPolled{_, _, _, deadline}: [Projection.boolean(deadline), 0n, 0n, 0n, 0n, 0n]
    case Canonical.FinishReserve{_, _, _, _, _, +selected, notice, pass, write, _, deadline}:
      [List.length(&2, Nat, selected), Projection.first(selected), Projection.boolean(notice),
       Projection.boolean(pass), Projection.boolean(write), Projection.boolean(deadline)]
    case Canonical.FinishAuthorize{_, _, _, _, +selected}:
      [List.length(&2, Nat, selected), Projection.first(selected), 0n, 0n, 0n, 0n]
    case Canonical.FinishTerminal{_, _, _, _, +selected, outcome}:
      [List.length(&2, Nat, selected), Projection.first(selected), terminal_code(outcome), 0n, 0n, 0n]
    case event: Projection.event_facts(event)

def canonical_counts(states: List<&2, Canonical.State>) -> List<&2, Nat>:
  match states:
    case state <> _: Projection.canonical_counts(state)
    case Nil{}: []

def graph_row(states: List<&2, Graph.Bounded>, command: Graph.Command, time: Nat) -> List<&2, Nat>:
  match states:
    case state <> _: Projection.graph_row(state, command, time)
    case Nil{}: []

def graph_before(states: List<&2, Graph.Bounded>) -> List<&2, Nat>:
  match states:
    case Graph.Bounded{graph, _} <> _: Projection.graph_counts(graph)
    case Nil{}: []

def product_row(time: Nat, +event: Canonical.CanonicalEvent, before: List<&2, Canonical.State>,
    after: List<&2, Canonical.State>, commands: List<&2, Canonical.Command>, reason: Maybe<&2, Canonical.Reason>) -> List<&2, Nat>:
  event_code(event) <> time <> List.append(&2, Nat, event_identity(event),
    List.append(&2, Nat, event_facts(event),
      List.append(&2, Nat, canonical_counts(after), rejected(reason) <>
        List.append(&2, Nat, command_codes(commands), 100n <> canonical_counts(before)))))

def frame_row(frame: T.Frame, canonical: Canonical.State) -> List<&2, Nat>:
  match frame:
    case T.ProductFrame{_, time, event, before, after, commands, reason, _}:
      product_row(time, event, before, after, commands, reason)
    case T.GraphFrame{_, time, _, _, _, before, after, command, _}:
      List.append(&2, Nat, graph_row(after, command, time),
        List.append(&2, Nat, Projection.canonical_counts(canonical), 100n <> graph_before(before)))

def observed_canonical(observation: T.Observation) -> Canonical.State:
  match observation:
    case T.Observation{_, _, canonical, _, _, _, _}: canonical

def advanced(transition: T.Advanced, rows: List<&2, List<&2, Nat>>,
    rest: T.State -> List<&2, List<&2, Nat>> -> Trace) -> Trace:
  match transition:
    case T.Advanced{+state, frame <> Nil{}}:
      rest(state, frame_row(frame, observed_canonical(Run.observe(state))) <> rows)
    case T.Advanced{state, _}: Trace{[state], List.reverse(&2, List<&2, Nat>, rows)}

def until(fuel: Nat, state: T.State, +endpoint: Nat, rows: List<&2, List<&2, Nat>>) -> Trace:
  match fuel:
    case 0n: Trace{[state], List.reverse(&2, List<&2, Nat>, rows)}
    case 1n+rest:
      advanced(Run.advance(state, 1n, endpoint), rows, next => rs => until(rest, next, endpoint, rs))

def trace_rows(result: Trace) -> List<&2, List<&2, Nat>>:
  match result:
    case Trace{_, rows}: rows

def trace() -> List<&2, List<&2, Nat>>:
  trace_rows(until(1000n, Run.create(original_config(), 7n), 150n, []))

def main() -> IO(Unit):
  IO.print(Projection.bracket(Projection.show_rows(trace())))
