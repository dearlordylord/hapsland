import Base
import ../../../../agent-flow-bend/ImportGraph.bend as G

# Independent reference policy for both Rust preparation and expansion.
# Share only the public state/event datatypes; never call G transitions/helpers.
# Ordered admission checks express the observable priority of failures.
# No helper laws or proofs are introduced: whole correspondence is the target.
type Check is Data:
  Check{fails: Bool, reason: G.Reason}

def failure_check(fails: Bool, reason: G.Reason, next: Maybe<&2, G.Reason>) -> Maybe<&2, G.Reason>:
  match fails:
    case True{}: Some{reason}
    case False{}: next

def first_failure(checks: List<&2, Check>) -> Maybe<&2, G.Reason>:
  match checks:
    case []: None{}
    case Check{fails, reason} <> tail: failure_check(fails, reason, first_failure(tail))

def initial(limits: G.Limits) -> G.Graph:
  G.Graph{G.Idle{}, [], [], 0n, 0n, 0n, 0n, False{}, False{}, False{}, limits}

def phase(state: G.Graph, phase: G.Phase, command: G.Command) -> G.Step:
  match state:
    case G.Graph{
      _,
      pending,
      visited,
      files,
      read,
      tree,
      work,
      skipped_tree,
      excluded,
      other,
      limits
    }:
      G.Step{G.Graph{phase, pending, visited, files, read, tree, work,
        skipped_tree, excluded, other, limits}, command}

def failed(state: G.Graph, +reason: G.Reason) -> G.Step:
  phase(state, G.Incomplete{reason}, G.UnitIncomplete{reason})

def admission(result: Maybe<&2, G.Reason>, state: G.Graph,
    success: Unit -> G.Step) -> G.Step:
  match result:
    case Some{reason}: failed(state, reason)
    case None{}: success(Unit{})

def edges(ids: List<&2, Nat>, +depth: Nat) -> List<&2, G.Edge>:
  match ids:
    case []: []
    case id <> tail: G.Edge{id, depth} <> edges(tail, depth)

def root_checks(limits: G.Limits, +source: Nat, tree: Nat, work: Nat,
    outgoing: Nat) -> Maybe<&2, G.Reason>:
  match limits:
    case G.Limits{_, source_cap, tree_cap, _, read_cap, edge_cap, _, work_cap}:
      first_failure([
        Check{Bool.or(Nat.is_gt(source, source_cap), Nat.is_gt(source, read_cap)), G.ReadLimit{}},
        Check{Nat.is_gt(tree, tree_cap), G.TreeLimit{}},
        Check{Bool.or(Nat.is_gt(outgoing, edge_cap), Nat.is_gt(work, work_cap)), G.WorkLimit{}}
      ])

def root(+state: G.Graph, target: Nat, +source: Nat, +tree: Nat,
    +work: Nat, +ids: List<&2, Nat>) -> G.Step:
  match state:
    case G.Graph{_, _, _, _, _, _, _, _, _, _, +limits}:
      success : Unit -> G.Step = _ => G.Step{
        G.Graph{G.GraphReady{}, edges(ids, 1n), target <> [], 1n, source, tree, work,
          False{}, False{}, False{}, limits}, G.NoCommand{}}
      # A refused root resets initial counts/queues, including arbitrary idle
      # representations. This matches the root event's initialisation semantics.
      admission(root_checks(limits, source, tree, work, List.length(&2, Nat, ids)),
        initial(limits), success)

def exhausted_reason(tree: Bool, excluded: Bool, other: Bool) -> Maybe<&2, G.Reason>:
  first_failure([
    Check{tree, G.TreeLimit{}}, Check{excluded, G.Excluded{}}, Check{other, G.Omitted{}}
  ])

def complete_queue(reason: Maybe<&2, G.Reason>, state: G.Graph) -> G.Step:
  match reason:
    case Some{reason}: failed(state, reason)
    case None{}: phase(state, G.Complete{}, G.UnitComplete{})

def dequeue(state: G.Graph, +edge: G.Edge, tail: List<&2, G.Edge>) -> G.Step:
  match state edge:
    case G.Graph{_, _, visited, files, read, tree, work, skipped_tree, excluded, other, limits}
      G.Edge{id, _}:
      G.Step{G.Graph{G.Resolving{edge}, tail, visited, files, read, tree,
        (work + 1n : Nat), skipped_tree, excluded, other, limits}, G.ResolveEdge{id}}

def next_checks(limits: G.Limits, work: Nat, depth: Nat) -> Maybe<&2, G.Reason>:
  match limits:
    case G.Limits{_, _, _, _, _, _, depth_cap, work_cap}:
      first_failure([Check{Nat.is_ge(work, work_cap), G.WorkLimit{}},
        Check{Nat.is_gt(depth, depth_cap), G.DepthLimit{}}])

def next(+state: G.Graph) -> G.Step:
  match state:
    case G.Graph{_, [], _, _, _, _, _, skipped_tree, excluded, other, _}:
      complete_queue(exhausted_reason(skipped_tree, excluded, other), state)
    case G.Graph{_, +edge <> +tail, _, _, _, _, work, _, _, _, limits}:
      match edge:
        case G.Edge{_, depth}:
          success : Unit -> G.Step = _ => dequeue(state, edge, tail)
          admission(next_checks(limits, work, depth), state, success)

def unresolved(state: G.Graph, target: Nat, reason: G.Reason) -> G.Step:
  match state:
    case G.Graph{_, pending, visited, files, read, tree, work, skipped_tree, excluded, _, limits}:
      G.Step{G.Graph{G.GraphReady{}, pending, visited, files, read, tree, work,
        skipped_tree, excluded, True{}, limits}, G.SkipImport{target, reason}}

def found(seen: Bool, state: G.Graph, edge: G.Edge, +target: Nat) -> G.Step:
  match seen:
    case True{}: phase(state, G.GraphReady{}, G.NoCommand{})
    case False{}: phase(state, G.Checking{edge, target}, G.CheckPath{target})

def resolution(result: G.Resolution, +state: G.Graph, edge: G.Edge, +target: Nat) -> G.Step:
  match result state:
    case G.NotFound{} _: unresolved(state, target, G.Missing{})
    case G.Many{} _: unresolved(state, target, G.Ambiguous{})
    case G.Unhandled{} _: unresolved(state, target, G.Unsupported{})
    case G.Found{} G.Graph{_, _, visited, _, _, _, _, _, _, _, _}:
      found(List.contains(~Nat, ~Nat.is_eq, visited, target), state, edge, target)

def refused_path(state: G.Graph, +target: Nat, reason: G.Reason, +excluded: Bool) -> G.Step:
  match state:
    case G.Graph{
      _,
      pending,
      visited,
      files,
      read,
      tree,
      work,
      skipped_tree,
      old_excluded,
      old_other,
      limits
    }:
      G.Step{
        G.Graph{
          G.GraphReady{},
          pending,
          target <> visited,
          files,
          read,
          tree,
          work,
          skipped_tree,
          Bool.or(old_excluded, excluded),
          Bool.or(old_other, Bool.not(excluded)),
          limits
        },
        G.SkipImport{target, reason}
      }

def path_budget(limits: G.Limits, files: Nat, read: Nat) -> Maybe<&2, G.Reason>:
  match limits:
    case G.Limits{_, source_cap, _, file_cap, read_cap, _, _, _}:
      first_failure([Check{Nat.is_ge(files, file_cap), G.FileLimit{}},
        Check{Nat.is_gt((read + source_cap : Nat), read_cap), G.ReadLimit{}}])

def budget_checked(
  reason: Maybe<&2, G.Reason>,
  state: G.Graph,
  edge: G.Edge,
  +target: Nat
) -> G.Step:
  match reason:
    case Some{reason}: refused_path(state, target, reason, False{})
    case None{}: phase(state, G.Capturing{edge, target}, G.ReadSource{target})

def checked(allowed: Bool, +state: G.Graph, edge: G.Edge, target: Nat) -> G.Step:
  match allowed state:
    case False{} _: refused_path(state, target, G.Excluded{}, True{})
    case True{} G.Graph{_, _, _, files, read, _, _, _, _, _, limits}:
      budget_checked(path_budget(limits, files, read), state, edge, target)

def capture_budget(limits: G.Limits, +source: Nat, local_work: Nat, outgoing: Nat,
    read: Nat, work: Nat) -> Maybe<&2, G.Reason>:
  match limits:
    case G.Limits{_, source_cap, _, _, read_cap, edge_cap, _, work_cap}:
      first_failure(
        [
          Check{
            Bool.or(Nat.is_gt(source, source_cap), Nat.is_gt((read + source : Nat), read_cap)),
            G.ReadLimit{}
          },
          Check{
            Bool.or(Nat.is_gt(outgoing, edge_cap), Nat.is_gt((work + local_work : Nat), work_cap)),
            G.WorkLimit{}
          }
        ]
      )

def captured_queue(
  overflow: Bool,
  pending: List<&2, G.Edge>,
  ids: List<&2, Nat>,
  depth: Nat
) -> List<&2, G.Edge>:
  match overflow:
    case True{}: pending
    case False{}: List.append(&2, G.Edge, pending, edges(ids, (depth + 1n : Nat)))

def tree_bytes(overflow: Bool, current: Nat, contribution: Nat) -> Nat:
  match overflow:
    case True{}: current
    case False{}: (current + contribution : Nat)

def captured_command(overflow: Bool, target: Nat) -> G.Command:
  match overflow:
    case True{}: G.SkipImport{target, G.TreeLimit{}}
    case False{}: G.NoCommand{}

def accept_capture(+overflow: Bool, state: G.Graph, edge: G.Edge, +target: Nat,
    source: Nat, contribution: Nat, local_work: Nat, ids: List<&2, Nat>) -> G.Step:
  match state edge:
    case G.Graph{
      _,
      pending,
      visited,
      files,
      read,
      tree,
      work,
      skipped_tree,
      excluded,
      other,
      limits
    }
      G.Edge{_, depth}:
      G.Step{
        G.Graph{
          G.GraphReady{},
          captured_queue(overflow, pending, ids, depth),
          target <> visited,
          (files + 1n : Nat),
          (read + source : Nat),
          tree_bytes(overflow, tree, contribution),
          (work + local_work : Nat),
          Bool.or(skipped_tree, overflow),
          excluded,
          other,
          limits
        },
        captured_command(overflow, target)
      }

def captured(+state: G.Graph, +edge: G.Edge, +target: Nat, +source: Nat,
    +contribution: Nat, +local_work: Nat, +ids: List<&2, Nat>) -> G.Step:
  match state:
    case G.Graph{_, _, _, _, read, +tree, work, _, _, _, +limits}:
      match limits:
        case G.Limits{_, _, tree_cap, _, _, _, _, _}:
          success : Unit -> G.Step = _ => accept_capture(
            Nat.is_gt((tree + contribution : Nat), tree_cap), state, edge, target,
            source, contribution, local_work, ids)
          admission(
            capture_budget(limits, source, local_work, List.length(&2, Nat, ids), read, work),
            state,
            success
          )

# Dispatch by state/event pairing rather than delegating to the production
# state's dispatcher. Terminal states ignore all later events, including clocks.
def transition(+state: G.Graph, event: G.GraphEvent) -> G.Step:
  match state:
    case G.Graph{+current, _, _, _, _, _, _, _, _, _, _}:
      match current event:
        case G.Complete{} _: phase(state, current, G.NoCommand{})
        case G.Incomplete{_} _: phase(state, current, G.NoCommand{})
        case _ G.DeadlineReached{}: failed(state, G.Deadline{})
        case G.Idle{} G.Root{target, source, tree, work, ids}: root(
          state,
          target,
          source,
          tree,
          work,
          ids
        )
        case G.GraphReady{} G.Next{}: next(state)
        case G.Resolving{edge} G.Resolved{target, result}: resolution(result, state, edge, target)
        case G.Checking{edge, target} G.PathChecked{allowed}: checked(allowed, state, edge, target)
        case G.Capturing{edge, target} G.Captured{source, contribution, work, ids}:
          captured(state, edge, target, source, contribution, work, ids)
        case G.Capturing{_, target} G.CaptureFailed{}:
          refused_path(state, target, G.CaptureUnavailable{}, False{})
        case _ _: failed(state, G.ProtocolViolation{})

def main() -> Unit:
  Unit{}

# Public native adapter state includes an event allowance as well as Graph.
# Keep it in whole observations; erasing it would weaken state correspondence.
def bounded_initial(+limits: G.Limits) -> G.Bounded:
  match limits:
    case G.Limits{_, _, _, _, _, _, _, work}: G.Bounded{initial(limits), (2n + 4n * work : Nat)}

def bounded_result(step: G.Step, remaining: Nat) -> G.BoundedStep:
  match step:
    case G.Step{state, command}: G.BoundedStep{G.Bounded{state, remaining}, command}

def exhausted_allowance(+state: G.Graph) -> G.Step:
  match state:
    case G.Graph{G.Complete{}, _, _, _, _, _, _, _, _, _, _}: G.Step{state, G.NoCommand{}}
    case G.Graph{G.Incomplete{_}, _, _, _, _, _, _, _, _, _, _}: G.Step{state, G.NoCommand{}}
    case _: failed(state, G.WorkLimit{})

def bounded_transition(state: G.Bounded, event: G.GraphEvent) -> G.BoundedStep:
  match state:
    case G.Bounded{graph, 0n}: bounded_result(exhausted_allowance(graph), 0n)
    case G.Bounded{graph, 1n+remaining}: bounded_result(transition(graph, event), remaining)
