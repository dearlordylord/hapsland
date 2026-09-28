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
    files: Nat, read_bytes: Nat, tree_bytes: Nat, work: Nat, skipped_tree: Bool, skipped_excluded: Bool}

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

def initial() -> Graph:
  Graph{Idle{}, Nil{}, Nil{}, 0n, 0n, 0n, 0n, False{}, False{}}

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
    read_bytes: Nat, tree_bytes: Nat, work: Nat, skipped_tree: Bool, +skipped_excluded: Bool,
    +reason: Reason) -> Step:
  Step{Graph{Incomplete{reason}, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded},
    UnitIncomplete{reason}}

def root(+target: Nat, +source_bytes: Nat, +tree_bytes: Nat,
    +edges: List<&2, Nat>) -> Step:
  Bool.pick(Step, Nat.is_gt(source_bytes, 262144n),
    fail(Nil{}, Nil{}, 0n, 0n, 0n, 0n, False{}, False{}, ReadLimit{}),
    Bool.pick(Step, Nat.is_gt(tree_bytes, 20480n),
      fail(Nil{}, Nil{}, 0n, 0n, 0n, 0n, False{}, False{}, TreeLimit{}),
      Bool.pick(Step, Nat.is_gt(edge_count(edges), 16n),
        fail(Nil{}, Nil{}, 0n, 0n, 0n, 0n, False{}, False{}, WorkLimit{}),
        Step{Graph{Ready{}, with_depth(edges, 1n), target <> Nil{},
          1n, source_bytes, tree_bytes, 0n, False{}, False{}}, NoCommand{}})))

def next(+pending: List<&2, Edge>, +visited: List<&2, Nat>, +files: Nat,
    +read_bytes: Nat, +tree_bytes: Nat, +work: Nat, +skipped_tree: Bool, +skipped_excluded: Bool) -> Step:
  match pending:
    case Nil{}:
      Bool.pick(Step, skipped_tree,
        Step{Graph{Incomplete{TreeLimit{}}, Nil{}, visited, files, read_bytes,
          tree_bytes, work, True{}, skipped_excluded}, UnitIncomplete{TreeLimit{}}},
        Bool.pick(Step, skipped_excluded,
          Step{Graph{Incomplete{Excluded{}}, Nil{}, visited, files, read_bytes,
            tree_bytes, work, False{}, True{}}, UnitIncomplete{Excluded{}}},
          Step{Graph{Complete{}, Nil{}, visited, files, read_bytes,
            tree_bytes, work, False{}, False{}}, UnitComplete{}}))
    case edge <> rest:
      match edge:
        case Edge{id, depth}:
          Bool.pick(Step, Nat.is_ge(work, 128n),
            fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, WorkLimit{}),
            Bool.pick(Step, Nat.is_gt(depth, 4n),
              fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, DepthLimit{}),
              Step{Graph{Resolving{edge}, rest, visited, files, read_bytes, tree_bytes,
                (work + 1n : Nat), skipped_tree, skipped_excluded}, ResolveEdge{id}}))

def resolved(+edge: Edge, +target: Nat, +result: Resolution,
    +pending: List<&2, Edge>, +visited: List<&2, Nat>, +files: Nat,
    +read_bytes: Nat, +tree_bytes: Nat, +work: Nat, +skipped_tree: Bool, +skipped_excluded: Bool) -> Step:
  match result:
    case NotFound{}:
      fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, Missing{})
    case Many{}:
      fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, Ambiguous{})
    case Unhandled{}:
      fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, Unsupported{})
    case Found{}:
      Bool.pick(Step, contains(target, visited),
        Step{Graph{Ready{}, pending, visited, files, read_bytes, tree_bytes,
          work, skipped_tree, skipped_excluded}, NoCommand{}},
        Step{Graph{Checking{edge, target}, pending, visited, files, read_bytes,
          tree_bytes, work, skipped_tree, skipped_excluded}, CheckPath{target}})

def checked(+edge: Edge, +target: Nat, +allowed: Bool,
    +pending: List<&2, Edge>, +visited: List<&2, Nat>, +files: Nat,
    +read_bytes: Nat, +tree_bytes: Nat, +work: Nat, +skipped_tree: Bool, +skipped_excluded: Bool) -> Step:
  match allowed:
    case False{}:
      Step{Graph{Ready{}, pending, target <> visited, files, read_bytes,
        tree_bytes, work, skipped_tree, True{}}, SkipImport{target, Excluded{}}}
    case True{}:
      Bool.pick(Step, Nat.is_ge(files, 8n),
        fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, FileLimit{}),
        Bool.pick(Step, Nat.is_gt((read_bytes + 262144n : Nat), 1572864n),
          fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ReadLimit{}),
          Step{Graph{Capturing{edge, target}, pending, visited, files, read_bytes,
            tree_bytes, work, skipped_tree, skipped_excluded}, ReadSource{target}}))

def captured(+edge: Edge, +target: Nat, +source_bytes: Nat, +node_bytes: Nat,
    +edges: List<&2, Nat>, +pending: List<&2, Edge>, +visited: List<&2, Nat>,
    +files: Nat, +read_bytes: Nat, +tree_bytes: Nat, +work: Nat,
    +skipped_tree: Bool, +skipped_excluded: Bool) -> Step:
  match edge:
    case Edge{_, depth}:
      Bool.pick(Step, Nat.is_gt(source_bytes, 262144n),
        fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ReadLimit{}),
        Bool.pick(Step, Nat.is_gt(edge_count(edges), 16n),
          fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, WorkLimit{}),
          Bool.pick(Step, Nat.is_gt((tree_bytes + node_bytes : Nat), 20480n),
            Step{Graph{Ready{}, pending, target <> visited, (files + 1n : Nat),
              (read_bytes + source_bytes : Nat), tree_bytes, work, True{}, skipped_excluded},
              SkipImport{target, TreeLimit{}}},
            Step{Graph{Ready{}, List.append(&2, Edge, pending,
              with_depth(edges, (depth + 1n : Nat))),
              target <> visited, (files + 1n : Nat), (read_bytes + source_bytes : Nat),
              (tree_bytes + node_bytes : Nat), work, skipped_tree, skipped_excluded}, NoCommand{}})))

def apply(+state: Graph, +event: GraphEvent) -> Step:
  match state:
    case Graph{phase, +pending, +visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded}:
      match phase:
        case Idle{}:
          match event:
            case Root{target, source_bytes, tree_bytes, edges}:
              root(target, source_bytes, tree_bytes, edges)
            case _:
              fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ProtocolViolation{})
        case Ready{}:
          match event:
            case Next{}:
              next(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded)
            case _:
              fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ProtocolViolation{})
        case Resolving{edge}:
          match event:
            case Resolved{target, result}:
              resolved(edge, target, result, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded)
            case _:
              fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ProtocolViolation{})
        case Checking{edge, target}:
          match event:
            case PathChecked{allowed}:
              checked(edge, target, allowed, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded)
            case _:
              fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ProtocolViolation{})
        case Capturing{edge, target}:
          match event:
            case Captured{source_bytes, node_bytes, edges}:
              captured(edge, target, source_bytes, node_bytes, edges,
                pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded)
            case CaptureFailed{}:
              fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, CaptureUnavailable{})
            case _:
              fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, ProtocolViolation{})
        case Complete{}:
          Step{Graph{Complete{}, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded}, NoCommand{}}
        case Incomplete{reason}:
          Step{Graph{Incomplete{reason}, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded}, NoCommand{}}

def deadline(state: Graph) -> Step:
  match state:
    case Graph{phase, +pending, +visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded}:
      match phase:
        case Complete{}:
          Step{Graph{Complete{}, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded}, NoCommand{}}
        case Incomplete{reason}:
          Step{Graph{Incomplete{reason}, pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded}, NoCommand{}}
        case _:
          fail(pending, visited, files, read_bytes, tree_bytes, work, skipped_tree, skipped_excluded, Deadline{})

def step(+state: Graph, +event: GraphEvent) -> Step:
  match event:
    case DeadlineReached{}:
      deadline(state)
    case _:
      apply(state, event)
