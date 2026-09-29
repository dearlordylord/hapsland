import Base

# Source-free import/reference exploration. Native code supplies stable edge IDs,
# resolved declaration IDs, path-gate outcomes, and bounded capture measurements.
# It never supplies source to this state.
type Edge is Data:
  Edge{id: Nat, depth: Nat}

# A review unit captures one versioned, finite profile before its root event.
# Native validates these values against the fixed ceilings before initialization.
type Limits is Data:
  Limits{version: Nat, source_bytes: Nat, tree_bytes: Nat, files: Nat,
    read_bytes: Nat, outgoing_edges: Nat, depth: Nat, work: Nat}


type Reason is Data:
  Missing{}
  Ambiguous{}
  Unsupported{}
  Excluded{}
  CaptureUnavailable{}
  FileLimit{}
  ReadLimit{}
  TreeLimit{}
  WorkLimit{}
  Deadline{}
  DepthLimit{}
  ProtocolViolation{}

type Resolution is Data:
  Found{}
  NotFound{}
  Many{}
  Unhandled{}

type Phase is Data:
  Idle{}
  Ready{}
  Resolving{edge: Edge}
  Checking{edge: Edge, target: Nat}
  Capturing{edge: Edge, target: Nat}
  Complete{}
  Incomplete{reason: Reason}

type Graph is Data:
  Graph{phase: Phase, pending: List<&2, Edge>, visited: List<&2, Nat>,
    files: Nat, read_bytes: Nat, tree_bytes: Nat, work: Nat, skipped_tree: Bool, skipped_excluded: Bool,
    limits: Limits}

type GraphEvent is Data:
  Root{target: Nat, source_bytes: Nat, tree_bytes: Nat, edges: List<&2, Nat>}
  Next{}
  Resolved{target: Nat, result: Resolution}
  PathChecked{allowed: Bool}
  Captured{source_bytes: Nat, node_bytes: Nat, edges: List<&2, Nat>}
  CaptureFailed{}
  DeadlineReached{}

type Command is Data:
  NoCommand{}
  ResolveEdge{edge: Nat}
  CheckPath{target: Nat}
  ReadSource{target: Nat}
  UnitComplete{}
  UnitIncomplete{reason: Reason}
  SkipImport{target: Nat, reason: Reason}

type Step is Data:
  Step{state: Graph, command: Command}

def source_cap(limits: Limits) -> Nat:
  match limits:
    case Limits{_, source_bytes, _, _, _, _, _, _}:
      source_bytes

def tree_cap(limits: Limits) -> Nat:
  match limits:
    case Limits{_, _, tree_bytes, _, _, _, _, _}:
      tree_bytes

def file_cap(limits: Limits) -> Nat:
  match limits:
    case Limits{_, _, _, files, _, _, _, _}:
      files

def read_cap(limits: Limits) -> Nat:
  match limits:
    case Limits{_, _, _, _, read_bytes, _, _, _}:
      read_bytes

def edge_cap(limits: Limits) -> Nat:
  match limits:
    case Limits{_, _, _, _, _, outgoing_edges, _, _}:
      outgoing_edges

def depth_cap(limits: Limits) -> Nat:
  match limits:
    case Limits{_, _, _, _, _, _, depth, _}:
      depth

def work_cap(limits: Limits) -> Nat:
  match limits:
    case Limits{_, _, _, _, _, _, _, work}:
      work

# Native syntax supplies local-reference counts and path depth. This predicate
# is the source-free Bend authority for admitting those facts into a graph.
def local_budget(+limits: Limits, +local_work: Nat, +local_depth: Nat,
    +distinct_targets: Nat, +graph_work: Nat) -> Bool:
  Bool.and(Bool.not(Nat.is_gt(local_depth, depth_cap(limits))),
    Bool.and(Bool.not(Nat.is_gt(distinct_targets, edge_cap(limits))),
      Bool.not(Nat.is_gt((local_work + graph_work : Nat), work_cap(limits)))))

# The same arithmetic gate is used for accepted encoded contributions.
def tree_after(+total: Nat, +contribution: Nat, +cap: Nat) -> Nat:
  Bool.pick(Nat, Nat.is_gt((total + contribution : Nat), cap),
    total, (total + contribution : Nat))

def read_after(total: Nat, contribution: Nat) -> Nat:
  (total + contribution : Nat)

def initial(+limits: Limits) -> Graph:
  Graph{Idle{}, Nil{}, Nil{}, 0n, 0n, 0n, 0n, False{}, False{}, limits}

def edge_count(edges: List<&2, Nat>) -> Nat:
  match edges:
    case Nil{}:
      0n
    case _ <> rest:
      (1n + edge_count(rest) : Nat)

def contains(+target: Nat, visited: List<&2, Nat>) -> Bool:
  match visited:
    case Nil{}:
      False{}
    case head <> rest:
      Bool.or(Nat.is_eq(target, head), contains(target, rest))

def with_depth(edges: List<&2, Nat>, +depth: Nat) -> List<&2, Edge>:
  match edges:
    case Nil{}:
      Nil{}
    case id <> rest:
      Edge{id, depth} <> with_depth(rest, depth)

def pending_after(+pending: List<&2, Edge>, +edges: List<&2, Nat>, +depth: Nat,
    +overflow: Bool) -> List<&2, Edge>:
  Bool.pick(List<&2, Edge>, overflow, pending,
    List.append(&2, Edge, pending, with_depth(edges, (depth + 1n : Nat))))

def fail(+limits: Limits, pending: List<&2, Edge>, visited: List<&2, Nat>, files: Nat,
    read_bytes: Nat, tree_bytes: Nat, work: Nat, skipped_tree: Bool, +skipped_excluded: Bool,
    +reason: Reason) -> Step:
  Step{Graph{Incomplete{reason}, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, limits},
    UnitIncomplete{reason}}

def root(+limits: Limits, +target: Nat, +source_bytes: Nat, +tree_bytes: Nat,
    +edges: List<&2, Nat>) -> Step:
  Bool.pick(Step, Bool.or(Nat.is_gt(source_bytes, source_cap(limits)), Nat.is_gt(source_bytes, read_cap(limits))),
    fail(limits, Nil{}, Nil{}, 0n, 0n, 0n, 0n, False{}, False{}, ReadLimit{}),
    Bool.pick(Step, Nat.is_gt(tree_bytes, tree_cap(limits)),
      fail(limits, Nil{}, Nil{}, 0n, 0n, 0n, 0n, False{}, False{}, TreeLimit{}),
      Bool.pick(Step, Nat.is_gt(edge_count(edges), edge_cap(limits)),
        fail(limits, Nil{}, Nil{}, 0n, 0n, 0n, 0n, False{}, False{}, WorkLimit{}),
        Step{Graph{Ready{}, with_depth(edges, 1n), target <> Nil{},
          1n, source_bytes, tree_bytes, 0n, False{}, False{}, limits}, NoCommand{}})))

def next(+limits: Limits, +pending: List<&2, Edge>, +visited: List<&2, Nat>, +files: Nat,
    +read_bytes: Nat, +tree_bytes: Nat, +work: Nat, +skipped_tree: Bool, +skipped_excluded: Bool) -> Step:
  match pending:
    case Nil{}:
      Bool.pick(Step, skipped_tree,
        Step{Graph{Incomplete{TreeLimit{}}, Nil{}, visited, files, read_bytes,
          tree_bytes, work, True{}, skipped_excluded, limits}, UnitIncomplete{TreeLimit{}}},
        Bool.pick(Step, skipped_excluded,
          Step{Graph{Incomplete{Excluded{}}, Nil{}, visited, files, read_bytes,
            tree_bytes, work, False{}, True{}, limits}, UnitIncomplete{Excluded{}}},
          Step{Graph{Complete{}, Nil{}, visited, files, read_bytes,
            tree_bytes, work, False{}, False{}, limits}, UnitComplete{}}))
    case edge <> rest:
      match edge:
        case Edge{id, depth}:
          Bool.pick(Step, Nat.is_ge(work, work_cap(limits)),
            fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, WorkLimit{}),
            Bool.pick(Step, Nat.is_gt(depth, depth_cap(limits)),
              fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, DepthLimit{}),
              Step{Graph{Resolving{edge}, rest, visited, files, read_bytes, tree_bytes,
                (work + 1n : Nat), skipped_tree, skipped_excluded, limits}, ResolveEdge{id}}))

def resolved(+limits: Limits, +edge: Edge, +target: Nat, +result: Resolution,
    +pending: List<&2, Edge>, +visited: List<&2, Nat>, +files: Nat,
    +read_bytes: Nat, +tree_bytes: Nat, +work: Nat, +skipped_tree: Bool, +skipped_excluded: Bool) -> Step:
  match result:
    case NotFound{}:
      fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, Missing{})
    case Many{}:
      fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, Ambiguous{})
    case Unhandled{}:
      fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, Unsupported{})
    case Found{}:
      Bool.pick(Step, contains(target, visited),
        Step{Graph{Ready{}, pending, visited, files, read_bytes, tree_bytes,
          work, skipped_tree, skipped_excluded, limits}, NoCommand{}},
        Step{Graph{Checking{edge, target}, pending, visited, files, read_bytes,
          tree_bytes, work, skipped_tree, skipped_excluded, limits}, CheckPath{target}})

def checked(+limits: Limits, +edge: Edge, +target: Nat, +allowed: Bool,
    +pending: List<&2, Edge>, +visited: List<&2, Nat>, +files: Nat,
    +read_bytes: Nat, +tree_bytes: Nat, +work: Nat, +skipped_tree: Bool, +skipped_excluded: Bool) -> Step:
  match allowed:
    case False{}:
      Step{Graph{Ready{}, pending, target <> visited, files, read_bytes,
        tree_bytes, work, skipped_tree, True{}, limits}, SkipImport{target, Excluded{}}}
    case True{}:
      Bool.pick(Step, Nat.is_ge(files, file_cap(limits)),
        fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, FileLimit{}),
        Bool.pick(Step, Nat.is_gt((read_bytes + source_cap(limits) : Nat), read_cap(limits)),
          fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ReadLimit{}),
          Step{Graph{Capturing{edge, target}, pending, visited, files, read_bytes,
            tree_bytes, work, skipped_tree, skipped_excluded, limits}, ReadSource{target}}))

def captured(+limits: Limits, +edge: Edge, +target: Nat, +source_bytes: Nat, +node_bytes: Nat,
    +edges: List<&2, Nat>, +pending: List<&2, Edge>, +visited: List<&2, Nat>,
    +files: Nat, +read_bytes: Nat, +tree_bytes: Nat, +work: Nat,
    +skipped_tree: Bool, +skipped_excluded: Bool) -> Step:
  match edge:
    case Edge{_, depth}:
      Bool.pick(Step, Bool.or(Nat.is_gt(source_bytes, source_cap(limits)), Nat.is_gt((read_bytes + source_bytes : Nat), read_cap(limits))),
        fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ReadLimit{}),
        Bool.pick(Step, Nat.is_gt(edge_count(edges), edge_cap(limits)),
          fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, WorkLimit{}),
          Bool.pick(Step, Nat.is_gt((tree_bytes + node_bytes : Nat), tree_cap(limits)),
            Step{Graph{Ready{}, pending_after(pending, edges, depth, True{}), target <> visited, (files + 1n : Nat),
              read_after(read_bytes, source_bytes), tree_bytes, work, True{}, skipped_excluded, limits},
              SkipImport{target, TreeLimit{}}},
            Step{Graph{Ready{}, pending_after(pending, edges, depth, False{}),
              target <> visited, (files + 1n : Nat), read_after(read_bytes, source_bytes),
              tree_after(tree_bytes, node_bytes, tree_cap(limits)), work, skipped_tree, skipped_excluded, limits}, NoCommand{}})))

def apply(+state: Graph, +event: GraphEvent) -> Step:
  match state:
    case Graph{phase, +pending, +visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, limits}:
      match phase:
        case Idle{}:
          match event:
            case Root{target, source_bytes, tree_bytes, edges}:
              root(limits, target, source_bytes, tree_bytes, edges)
            case _:
              fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ProtocolViolation{})
        case Ready{}:
          match event:
            case Next{}:
              next(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded)
            case _:
              fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ProtocolViolation{})
        case Resolving{edge}:
          match event:
            case Resolved{target, result}:
              resolved(limits, edge, target, result, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded)
            case _:
              fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ProtocolViolation{})
        case Checking{edge, target}:
          match event:
            case PathChecked{allowed}:
              checked(limits, edge, target, allowed, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded)
            case _:
              fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ProtocolViolation{})
        case Capturing{edge, target}:
          match event:
            case Captured{source_bytes, node_bytes, edges}:
              captured(limits, edge, target, source_bytes, node_bytes, edges,
                pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded)
            case CaptureFailed{}:
              fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, CaptureUnavailable{})
            case _:
              fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ProtocolViolation{})
        case Complete{}:
          Step{Graph{Complete{}, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, limits}, NoCommand{}}
        case Incomplete{reason}:
          Step{Graph{Incomplete{reason}, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, limits}, NoCommand{}}

def deadline(state: Graph) -> Step:
  match state:
    case Graph{phase, +pending, +visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, limits}:
      match phase:
        case Complete{}:
          Step{Graph{Complete{}, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, limits}, NoCommand{}}
        case Incomplete{reason}:
          Step{Graph{Incomplete{reason}, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, limits}, NoCommand{}}
        case _:
          fail(limits, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, Deadline{})

def step(+state: Graph, +event: GraphEvent) -> Step:
  match event:
    case DeadlineReached{}:
      deadline(state)
    case _:
      apply(state, event)

# Every local Next and every returned external fact spends one event. With a
# responsive host, at most three external facts can follow each edge request;
# the extra two events cover root admission and queue exhaustion. A stalled
# external command is outside this transition system until its result or a
# DeadlineReached event is delivered.
type Bounded is Data:
  Bounded{graph: Graph, remaining: Nat}

type BoundedStep is Data:
  BoundedStep{state: Bounded, command: Command}

def event_budget(limits: Limits) -> Nat:
  (2n + (4n * work_cap(limits) : Nat) : Nat)

def bounded_initial(+limits: Limits) -> Bounded:
  Bounded{initial(limits), event_budget(limits)}

def is_terminal(graph: Graph) -> Bool:
  match graph:
    case Graph{phase, _, _, _, _, _, _, _, _, _}:
      match phase:
        case Complete{}:
          True{}
        case Incomplete{_}:
          True{}
        case _:
          False{}

def exhausted(graph: Graph) -> Step:
  match graph:
    case Graph{phase, +pending, +visited, files, read_bytes, tree_bytes, work,
        skipped_tree, skipped_excluded, limits}:
      match phase:
        case Complete{}:
          Step{Graph{Complete{}, pending, visited, files, read_bytes, tree_bytes,
            work, skipped_tree, skipped_excluded, limits}, NoCommand{}}
        case Incomplete{reason}:
          Step{Graph{Incomplete{reason}, pending, visited, files, read_bytes,
            tree_bytes, work, skipped_tree, skipped_excluded, limits}, NoCommand{}}
        case _:
          fail(limits, pending, visited, files, read_bytes, tree_bytes, work,
            skipped_tree, skipped_excluded, WorkLimit{})

def wrap(result: Step, remaining: Nat) -> BoundedStep:
  match result:
    case Step{graph, command}:
      BoundedStep{Bounded{graph, remaining}, command}

def bounded_step_go(+graph: Graph, +event: GraphEvent, remaining: Nat) -> BoundedStep:
  match remaining:
    case 0n:
      wrap(exhausted(graph), 0n)
    case 1n+rest:
      wrap(step(graph, event), rest)

def bounded_step(+state: Bounded, +event: GraphEvent) -> BoundedStep:
  match state:
    case Bounded{+graph, remaining}:
      bounded_step_go(graph, event, remaining)

def bounded_terminal(state: Bounded) -> Bool:
  match state:
    case Bounded{graph, _}:
      is_terminal(graph)

# The supplied list represents graph events returned by a responsive host.
# The fallback lets the theorem quantify over arbitrarily long event streams
# without constructing an infinite list in Bend. The theorem below holds for
# every value of the list and fallback, and therefore for matching events too.
# A host that never returns an emitted command supplies no next event.
def bounded_state(result: BoundedStep) -> Bounded:
  match result:
    case BoundedStep{next, _}:
      next

def step_graph(result: Step) -> Graph:
  match result:
    case Step{graph, _}:
      graph

def event_value(events: List<&2, GraphEvent>, fallback: GraphEvent) -> GraphEvent:
  match events:
    case Nil{}:
      fallback
    case event <> _:
      event

def event_rest(events: List<&2, GraphEvent>) -> List<&2, GraphEvent>:
  match events:
    case Nil{}:
      Nil{}
    case _ <> rest:
      rest

def responsive_run(steps: Nat, +state: Bounded, +events: List<&2, GraphEvent>, +fallback: GraphEvent) -> Bounded:
  match steps:
    case 0n:
      bounded_state(bounded_step(state, event_value(events, fallback)))
    case 1n+more:
      responsive_run(more, bounded_state(bounded_step(state, event_value(events, fallback))),
        event_rest(events), fallback)
