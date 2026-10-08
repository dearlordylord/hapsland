import Base
import ./minimal-scenario.bend as Minimal
import ../Engine.bend as Engine
import ../TreeFacts.bend as TreeFacts
import ../PreparationScenario.bend as Scenario
import ../../agent-flow-bend/ImportGraph.bend as Graph
import ../../agent-flow-bend/RulePolicy.bend as RulePolicy

# Original bounded inputs. Neither lane supplies an expected traversal plan.
def profile(
  missing: Nat,
  denied: Nat,
  unreadable: Nat,
  unsupported: Nat,
  repeated: Nat,
  cyclic: Nat,
  deadline: Nat,
  work: Nat
) -> TreeFacts.Profile:
  TreeFacts.Profile{
    3n,
    3n,
    2n,
    2n,
    denied,
    missing,
    unreadable,
    repeated,
    cyclic,
    unsupported,
    deadline,
    work,
    4n,
    4n,
    3n,
    3n
  }

def limits() -> Graph.Limits:
  Graph.Limits{1n, 4n, 100n, 8n, 32n, 2n, 2n, 128n}

def reason(value: Graph.Reason) -> Nat:
  match value:
    case Graph.Missing{}: 1n
    case Graph.Ambiguous{}: 2n
    case Graph.Unsupported{}: 3n
    case Graph.Omitted{}: 4n
    case Graph.Excluded{}: 5n
    case Graph.CaptureUnavailable{}: 6n
    case Graph.FileLimit{}: 7n
    case Graph.ReadLimit{}: 8n
    case Graph.TreeLimit{}: 9n
    case Graph.WorkLimit{}: 10n
    case Graph.Deadline{}: 11n
    case Graph.DepthLimit{}: 12n
    case Graph.ProtocolViolation{}: 13n

def phase(value: Graph.Phase) -> Nat:
  match value:
    case Graph.Idle{}: 0n
    case Graph.GraphReady{}: 1n
    case Graph.Resolving{_}: 2n
    case Graph.Checking{_, _}: 3n
    case Graph.Capturing{_, _}: 4n
    case Graph.Complete{}: 5n
    case Graph.Incomplete{_}: 6n

def phase_reason(value: Graph.Phase) -> Nat:
  match value:
    case Graph.Incomplete{why}: reason(why)
    case _: 0n

def usage(state: Graph.Bounded) -> List<&2, Nat>:
  match state:
    case Graph.Bounded{Graph.Graph{+p, _, _, files, read, tree, work, _, _, _, _}, _}:
      [phase(p), phase_reason(p), files, read, tree, work]

def command(value: Graph.Command) -> List<&2, Nat>:
  match value:
    case Graph.NoCommand{}: [0n, 0n, 0n]
    case Graph.ResolveEdge{edge}: [1n, edge, 0n]
    case Graph.CheckPath{target}: [2n, target, 0n]
    case Graph.ReadSource{target}: [3n, target, 0n]
    case Graph.UnitComplete{}: [4n, 0n, 0n]
    case Graph.UnitIncomplete{why}: [5n, 0n, reason(why)]
    case Graph.SkipImport{target, why}: [6n, target, reason(why)]

def fact(value: Graph.GraphEvent) -> Nat:
  match value:
    case Graph.Root{_, _, _, _, _}: 0n
    case Graph.Next{}: 1n
    case Graph.Resolved{_, _}: 2n
    case Graph.PathChecked{_}: 3n
    case Graph.Captured{_, _, _, _}: 4n
    case Graph.CaptureFailed{}: 5n
    case Graph.DeadlineReached{}: 6n

def step_row(result: Graph.BoundedStep, position: Nat, event: Nat,
    rest: Graph.Bounded -> List<&2, List<&2, Nat>>) -> List<&2, List<&2, Nat>>:
  match result:
    case Graph.BoundedStep{+state, cmd}: List.append(
      &2,
      Nat,
      [2n, position, event],
      List.append(&2, Nat, command(cmd), usage(state))
    ) <> rest(state)

def steps(
  events: List<&2, Graph.GraphEvent>,
  state: Graph.Bounded,
  +position: Nat
) -> List<&2, List<&2, Nat>>:
  match events:
    case Nil{}: []
    case +head <> tail:
      continuation: Graph.Bounded -> List<&2, List<&2, Nat>> = next => steps(
        tail,
        next,
        (position + 1n : Nat)
      )
      step_row(
        Graph.bounded_step(state, head),
        position,
        fact(head),
        continuation
      )

def file_rows(files: List<&2, TreeFacts.TreeFile>) -> List<&2, List<&2, Nat>>:
  match files:
    case Nil{}: []
    case TreeFacts.TreeFile{target, depth, allowed, source, tree, edges, _, _, _} <> tail:
      List.append(
        &2,
        Nat,
        [1n, target, depth, Bool.pick(Nat, allowed, 1n, 0n), source, tree],
        edges
      ) <> file_rows(tail)

def gate(value: RulePolicy.Gate) -> Nat:
  match value:
    case RulePolicy.Admit{}: 1n
    case RulePolicy.Omit{}: 0n

def trace(value: Scenario.Generated, +limits: Graph.Limits) -> List<&2, List<&2, Nat>>:
  match value:
    case Scenario.Generated{TreeFacts.Tree{files, _}, facts, state, _, root, closure}:
      List.append(&2, List<&2, Nat>, file_rows(files),
        List.append(&2, List<&2, Nat>, steps(facts, Graph.bounded_initial(limits), 0n),
          [List.append(&2, Nat, 3n <> usage(state), [gate(root), gate(closure)])]))

def run(profile: TreeFacts.Profile, +limits: Graph.Limits) -> List<&2, List<&2, Nat>>:
  trace(Engine.generate_tree(7n, 3n, 0n, profile, limits), limits)

def pair(deadline: Nat) -> TreeFacts.Profile:
  TreeFacts.Profile{2n, 2n, 1n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, deadline, 0n, 4n, 4n, 3n, 3n}

def chain() -> TreeFacts.Profile:
  TreeFacts.Profile{3n, 3n, 1n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 4n, 4n, 3n, 3n}

def single(+source: Nat, +tree: Nat) -> TreeFacts.Profile:
  TreeFacts.Profile{1n, 1n, 2n, 2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 5n, source, source, tree, tree}

def exact() -> Graph.Limits:
  Graph.Limits{1n, 4n, 3n, 1n, 4n, 1n, 1n, 5n}

def scenarios() -> List<&2, List<&2, List<&2, Nat>>>:
  [
    run(profile(0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n), limits()),
    run(profile(0n, 100n, 0n, 0n, 0n, 0n, 0n, 0n), limits()),
    run(profile(100n, 0n, 0n, 0n, 0n, 0n, 0n, 0n), limits()),
    run(profile(0n, 0n, 100n, 0n, 0n, 0n, 0n, 0n), limits()),
    run(profile(0n, 0n, 0n, 100n, 0n, 0n, 0n, 0n), limits()),
    run(profile(0n, 0n, 0n, 0n, 100n, 100n, 0n, 0n), limits()),
    run(profile(0n, 0n, 0n, 0n, 0n, 0n, 1n, 0n), limits()),
    run(
      profile(0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n),
      Graph.Limits{1n, 4n, 100n, 2n, 32n, 2n, 2n, 128n}
    ),
    run(profile(0n, 0n, 0n, 0n, 0n, 0n, 0n, 129n), limits()),
    run(single(4n, 3n), exact()),
    run(single(5n, 3n), exact()),
    run(single(4n, 4n), exact()),
    run(pair(0n), Graph.Limits{1n, 4n, 100n, 8n, 7n, 2n, 2n, 128n}),
    run(chain(), Graph.Limits{1n, 4n, 100n, 8n, 32n, 2n, 1n, 128n}),
    run(
      profile(0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n),
      Graph.Limits{1n, 4n, 100n, 8n, 32n, 1n, 2n, 128n}
    ),
    run(pair(4n), limits()),
    run(pair(5n), limits()),
    run(pair(6n), limits())
  ]

def main() -> IO(Unit):
  do IO<Unit>:
    IO.print(Minimal.bracket(Minimal.show_traces(scenarios())))
