import Base

# Source-free import/reference exploration. Native code supplies stable edge IDs,
# resolved declaration IDs, path-gate outcomes, and bounded capture measurements.
# It never supplies source to this state.
type Edge is Data:
  Edge{id: Nat, depth: Nat}

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
    files: Nat, read_bytes: Nat, tree_bytes: Nat, work: Nat}

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

type Step is Data:
  Step{state: Graph, command: Command}

def initial() -> Graph:
  Graph{Idle{}, Nil{}, Nil{}, 0n, 0n, 0n, 0n}

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

def fail(pending: List<&2, Edge>, visited: List<&2, Nat>, files: Nat,
    read_bytes: Nat, tree_bytes: Nat, work: Nat, +reason: Reason) -> Step:
  Step{Graph{Incomplete{reason}, pending, visited, files, read_bytes, tree_bytes, work},
    UnitIncomplete{reason}}

def root(+target: Nat, +source_bytes: Nat, +tree_bytes: Nat,
    +edges: List<&2, Nat>) -> Step:
  Bool.pick(Step, Nat.is_gt(source_bytes, 262144n),
    fail(Nil{}, Nil{}, 0n, 0n, 0n, 0n, ReadLimit{}),
    Bool.pick(Step, Nat.is_gt(tree_bytes, 20480n),
      fail(Nil{}, Nil{}, 0n, 0n, 0n, 0n, TreeLimit{}),
      Bool.pick(Step, Nat.is_gt(edge_count(edges), 16n),
        fail(Nil{}, Nil{}, 0n, 0n, 0n, 0n, WorkLimit{}),
        Step{Graph{Ready{}, with_depth(edges, 1n), target <> Nil{},
          1n, source_bytes, tree_bytes, 0n}, NoCommand{}})))

def next(+pending: List<&2, Edge>, +visited: List<&2, Nat>, +files: Nat,
    +read_bytes: Nat, +tree_bytes: Nat, +work: Nat) -> Step:
  match pending:
    case Nil{}:
      Step{Graph{Complete{}, Nil{}, visited, files, read_bytes, tree_bytes, work}, UnitComplete{}}
    case edge <> rest:
      match edge:
        case Edge{id, depth}:
          Bool.pick(Step, Nat.is_ge(tree_bytes, 20480n),
            fail(pending, visited, files, read_bytes, tree_bytes, work, TreeLimit{}),
            Bool.pick(Step, Nat.is_ge(work, 128n),
              fail(pending, visited, files, read_bytes, tree_bytes, work, WorkLimit{}),
              Bool.pick(Step, Nat.is_gt(depth, 4n),
                fail(pending, visited, files, read_bytes, tree_bytes, work, DepthLimit{}),
                Step{Graph{Resolving{edge}, rest, visited, files, read_bytes, tree_bytes,
                  (work + 1n : Nat)}, ResolveEdge{id}})))

def resolved(+edge: Edge, +target: Nat, +result: Resolution,
    +pending: List<&2, Edge>, +visited: List<&2, Nat>, +files: Nat,
    +read_bytes: Nat, +tree_bytes: Nat, +work: Nat) -> Step:
  match result:
    case NotFound{}:
      fail(pending, visited, files, read_bytes, tree_bytes, work, Missing{})
    case Many{}:
      fail(pending, visited, files, read_bytes, tree_bytes, work, Ambiguous{})
    case Unhandled{}:
      fail(pending, visited, files, read_bytes, tree_bytes, work, Unsupported{})
    case Found{}:
      Bool.pick(Step, contains(target, visited),
        Step{Graph{Ready{}, pending, visited, files, read_bytes, tree_bytes, work}, NoCommand{}},
        Step{Graph{Checking{edge, target}, pending, visited, files, read_bytes,
          tree_bytes, work}, CheckPath{target}})

def checked(+edge: Edge, +target: Nat, +allowed: Bool,
    +pending: List<&2, Edge>, +visited: List<&2, Nat>, +files: Nat,
    +read_bytes: Nat, +tree_bytes: Nat, +work: Nat) -> Step:
  match allowed:
    case False{}:
      fail(pending, visited, files, read_bytes, tree_bytes, work, Excluded{})
    case True{}:
      Bool.pick(Step, Nat.is_ge(files, 8n),
        fail(pending, visited, files, read_bytes, tree_bytes, work, FileLimit{}),
        Bool.pick(Step, Nat.is_gt((read_bytes + 262144n : Nat), 1572864n),
          fail(pending, visited, files, read_bytes, tree_bytes, work, ReadLimit{}),
          Bool.pick(Step, Nat.is_ge(tree_bytes, 20480n),
            fail(pending, visited, files, read_bytes, tree_bytes, work, TreeLimit{}),
            Step{Graph{Capturing{edge, target}, pending, visited, files, read_bytes,
              tree_bytes, work}, ReadSource{target}})))

def captured(+edge: Edge, +target: Nat, +source_bytes: Nat, +node_bytes: Nat,
    +edges: List<&2, Nat>, +pending: List<&2, Edge>, +visited: List<&2, Nat>,
    +files: Nat, +read_bytes: Nat, +tree_bytes: Nat, +work: Nat) -> Step:
  match edge:
    case Edge{_, depth}:
      Bool.pick(Step, Nat.is_gt(source_bytes, 262144n),
        fail(pending, visited, files, read_bytes, tree_bytes, work, ReadLimit{}),
        Bool.pick(Step, Nat.is_gt((tree_bytes + node_bytes : Nat), 20480n),
          fail(pending, visited, files, read_bytes, tree_bytes, work, TreeLimit{}),
          Bool.pick(Step, Nat.is_gt(edge_count(edges), 16n),
            fail(pending, visited, files, read_bytes, tree_bytes, work, WorkLimit{}),
            Step{Graph{Ready{}, List.append(&2, Edge, pending,
              with_depth(edges, (depth + 1n : Nat))),
              target <> visited, (files + 1n : Nat), (read_bytes + source_bytes : Nat),
              (tree_bytes + node_bytes : Nat), work}, NoCommand{}})))

def apply(+state: Graph, +event: GraphEvent) -> Step:
  match state:
    case Graph{phase, +pending, +visited, files, read_bytes, tree_bytes, work}:
      match phase:
        case Idle{}:
          match event:
            case Root{target, source_bytes, tree_bytes, edges}:
              root(target, source_bytes, tree_bytes, edges)
            case _:
              fail(pending, visited, files, read_bytes, tree_bytes, work, ProtocolViolation{})
        case Ready{}:
          match event:
            case Next{}:
              next(pending, visited, files, read_bytes, tree_bytes, work)
            case _:
              fail(pending, visited, files, read_bytes, tree_bytes, work, ProtocolViolation{})
        case Resolving{edge}:
          match event:
            case Resolved{target, result}:
              resolved(edge, target, result, pending, visited, files, read_bytes, tree_bytes, work)
            case _:
              fail(pending, visited, files, read_bytes, tree_bytes, work, ProtocolViolation{})
        case Checking{edge, target}:
          match event:
            case PathChecked{allowed}:
              checked(edge, target, allowed, pending, visited, files, read_bytes, tree_bytes, work)
            case _:
              fail(pending, visited, files, read_bytes, tree_bytes, work, ProtocolViolation{})
        case Capturing{edge, target}:
          match event:
            case Captured{source_bytes, node_bytes, edges}:
              captured(edge, target, source_bytes, node_bytes, edges,
                pending, visited, files, read_bytes, tree_bytes, work)
            case CaptureFailed{}:
              fail(pending, visited, files, read_bytes, tree_bytes, work, CaptureUnavailable{})
            case _:
              fail(pending, visited, files, read_bytes, tree_bytes, work, ProtocolViolation{})
        case Complete{}:
          Step{Graph{Complete{}, pending, visited, files, read_bytes, tree_bytes, work}, NoCommand{}}
        case Incomplete{reason}:
          Step{Graph{Incomplete{reason}, pending, visited, files, read_bytes, tree_bytes, work}, NoCommand{}}

def deadline(state: Graph) -> Step:
  match state:
    case Graph{phase, +pending, +visited, files, read_bytes, tree_bytes, work}:
      match phase:
        case Complete{}:
          Step{Graph{Complete{}, pending, visited, files, read_bytes, tree_bytes, work}, NoCommand{}}
        case Incomplete{reason}:
          Step{Graph{Incomplete{reason}, pending, visited, files, read_bytes, tree_bytes, work}, NoCommand{}}
        case _:
          fail(pending, visited, files, read_bytes, tree_bytes, work, Deadline{})

def step(+state: Graph, +event: GraphEvent) -> Step:
  match event:
    case DeadlineReached{}:
      deadline(state)
    case _:
      apply(state, event)
