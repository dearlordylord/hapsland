import Base
import ./TreeFacts.bend as TreeFacts
import ../agent-flow-bend/ImportGraph.bend as ImportGraph

# Environment orchestration follows actual ImportGraph commands. No traversal,
# admission, omission, evidence or resource-budget policy is implemented here.
type Generated is Data:
  Generated{tree: TreeFacts.Tree, facts: List<&2, ImportGraph.GraphEvent>, state: ImportGraph.Bounded, terminated: Bool}
type Trace is Data:
  Trace{facts: List<&2, ImportGraph.GraphEvent>, state: ImportGraph.Bounded, terminated: Bool}

def resolution(+file: TreeFacts.TreeFile) -> ImportGraph.Resolution:
  Bool.pick(ImportGraph.Resolution, TreeFacts.file_missing(file), ImportGraph.NotFound{},
    Bool.pick(ImportGraph.Resolution, TreeFacts.file_unsupported(file), ImportGraph.Unhandled{}, ImportGraph.Found{}))

def captured(+file: TreeFacts.TreeFile, work: Nat) -> ImportGraph.GraphEvent:
  Bool.pick(ImportGraph.GraphEvent, TreeFacts.file_unreadable(file), ImportGraph.CaptureFailed{},
    ImportGraph.Captured{TreeFacts.file_source_bytes(file), TreeFacts.file_tree_bytes(file), work, TreeFacts.file_edges(file)})

def next_fact(command: ImportGraph.Command, +files: List<&2, TreeFacts.TreeFile>, work: Nat) -> ImportGraph.GraphEvent:
  match command:
    case ImportGraph.ResolveEdge{+edge}: ImportGraph.Resolved{edge, resolution(TreeFacts.nth((edge - 1n : Nat), files))}
    case ImportGraph.CheckPath{target}: ImportGraph.PathChecked{TreeFacts.file_allowed(TreeFacts.nth((target - 1n : Nat), files))}
    case ImportGraph.ReadSource{target}: captured(TreeFacts.nth((target - 1n : Nat), files), work)
    case _: ImportGraph.Next{}

def progressed(terminal: Bool, +state: ImportGraph.Bounded, command: ImportGraph.Command,
    files: List<&2, TreeFacts.TreeFile>, +profile: TreeFacts.Profile, position: Nat,
    +facts: List<&2, ImportGraph.GraphEvent>,
    rest: ImportGraph.Bounded -> ImportGraph.GraphEvent -> Nat -> List<&2, ImportGraph.GraphEvent> -> Trace) -> Trace:
  match terminal:
    case True{}: Trace{List.reverse(&2, ImportGraph.GraphEvent, facts), state, True{}}
    case False{}: rest(state, next_fact(command, files, TreeFacts.profile_local_work(profile)), position, facts)

def stepped(result: ImportGraph.BoundedStep, files: List<&2, TreeFacts.TreeFile>, profile: TreeFacts.Profile,
    position: Nat, facts: List<&2, ImportGraph.GraphEvent>,
    rest: ImportGraph.Bounded -> ImportGraph.GraphEvent -> Nat -> List<&2, ImportGraph.GraphEvent> -> Trace) -> Trace:
  match result:
    case ImportGraph.BoundedStep{+state, command}:
      progressed(ImportGraph.bounded_terminal(state), state, command, files, profile, position, facts, rest)

def supplied(state: ImportGraph.Bounded, +fact: ImportGraph.GraphEvent, files: List<&2, TreeFacts.TreeFile>, profile: TreeFacts.Profile,
    position: Nat, facts: List<&2, ImportGraph.GraphEvent>,
    rest: ImportGraph.Bounded -> ImportGraph.GraphEvent -> Nat -> List<&2, ImportGraph.GraphEvent> -> Trace) -> Trace:
  stepped(ImportGraph.bounded_step(state, fact), files, profile, (position + 1n : Nat), fact <> facts, rest)

def loop(fuel: Nat, +files: List<&2, TreeFacts.TreeFile>, +profile: TreeFacts.Profile,
    state: ImportGraph.Bounded, fact: ImportGraph.GraphEvent, +position: Nat,
    facts: List<&2, ImportGraph.GraphEvent>) -> Trace:
  match fuel:
    case 0n: Trace{List.reverse(&2, ImportGraph.GraphEvent, facts), state, False{}}
    case 1n+rest:
      supplied(state, Bool.pick(ImportGraph.GraphEvent,
        Nat.is_gt(TreeFacts.profile_deadline_step(profile), 0n) && Nat.is_eq(position, TreeFacts.profile_deadline_step(profile)),
        ImportGraph.DeadlineReached{}, fact), files, profile, position, facts,
        s => f => p => fs => loop(rest, files, profile, s, f, p, fs))

def root(+file: TreeFacts.TreeFile, work: Nat) -> ImportGraph.GraphEvent:
  ImportGraph.Root{TreeFacts.file_target(file), TreeFacts.file_source_bytes(file), TreeFacts.file_tree_bytes(file), work, TreeFacts.file_edges(file)}

def generated(trace: Trace, tree: TreeFacts.Tree) -> Generated:
  match trace:
    case Trace{facts, state, terminated}: Generated{tree, facts, state, terminated}

def run(+tree: TreeFacts.Tree, +profile: TreeFacts.Profile, limits: ImportGraph.Limits) -> Generated:
  match tree:
    case TreeFacts.Tree{+files, depth}:
      generated(loop(512n, files, profile, ImportGraph.bounded_initial(limits), root(TreeFacts.nth(0n, files), TreeFacts.profile_local_work(profile)), 0n, []), TreeFacts.Tree{files, depth})

def generate(seed: Nat, operation: Nat, unit: Nat, +profile: TreeFacts.Profile, limits: ImportGraph.Limits) -> Generated:
  run(TreeFacts.generate(seed, operation, unit, profile), profile, limits)
