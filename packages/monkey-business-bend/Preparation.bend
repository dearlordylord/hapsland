import Base
import ./Types.bend as Types
import ../agent-flow-bend/ImportGraph.bend as ImportGraph

def same(+key: Types.GraphKey, entry: Types.GraphEntry) -> Bool:
  match key entry:
    case Types.GraphKey{partition, lifetime, round, operation, unit} Types.GraphEntry{p, l, r, o, u, _, _}:
      Nat.is_eq(partition, p) && Nat.is_eq(lifetime, l) && Nat.is_eq(round, r) && Nat.is_eq(operation, o) && Nat.is_eq(unit, u)

def find_hit(hit: Bool, entry: Types.GraphEntry, rest: Maybe<&2, Types.GraphEntry>) -> Maybe<&2, Types.GraphEntry>:
  match hit:
    case True{}: Some{entry}
    case False{}: rest

def find(entries: List<&2, Types.GraphEntry>, +key: Types.GraphKey) -> Maybe<&2, Types.GraphEntry>:
  match entries:
    case Nil{}: None{}
    case +head <> tail: find_hit(same(key, head), head, find(tail, key))

def graph(found: Maybe<&2, Types.GraphEntry>, limits: ImportGraph.Limits) -> ImportGraph.Bounded:
  match found:
    case None{}: ImportGraph.bounded_initial(limits)
    case Some{Types.GraphEntry{_, _, _, _, _, _, graph}}: graph

def retain_hit(hit: Bool, entry: Types.GraphEntry, rest: List<&2, Types.GraphEntry>) -> List<&2, Types.GraphEntry>:
  match hit:
    case True{}: rest
    case False{}: entry <> rest

def remove(entries: List<&2, Types.GraphEntry>, +key: Types.GraphKey) -> List<&2, Types.GraphEntry>:
  match entries:
    case Nil{}: Nil{}
    case +head <> tail: retain_hit(same(key, head), head, remove(tail, key))

def install(key: Types.GraphKey, position: Nat, graph: ImportGraph.Bounded) -> Types.GraphEntry:
  match key:
    case Types.GraphKey{partition, lifetime, round, operation, unit}:
      Types.GraphEntry{partition, lifetime, round, operation, unit, position, graph}

def settle(state: Types.State, +key: Types.GraphKey, position: Nat, +before: ImportGraph.Bounded, +result: ImportGraph.BoundedStep) -> Types.GraphTransition:
  match state:
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring}:
      Types.GraphTransition{Types.State{canonical, install(key, position, ImportGraph.bounded_state(result)) <> remove(graphs, key), scheduler, workloads, random, advicees, credentials, opening, retiring}, before, result}

def expected(found: Maybe<&2, Types.GraphEntry>) -> Nat:
  match found:
    case None{}: 0n
    case Some{Types.GraphEntry{_, _, _, _, _, position, _}}: position

def checked(valid: Bool, state: Types.State, key: Types.GraphKey, position: Nat, +before: ImportGraph.Bounded, event: ImportGraph.GraphEvent) -> Types.GraphTransition:
  match valid:
    case False{}: Types.GraphRejected{state}
    case True{}: settle(state, key, Nat.add(position, 1n), before, ImportGraph.bounded_step(before, event))

def step(+state: Types.State, +key: Types.GraphKey, +position: Nat, limits: ImportGraph.Limits, event: ImportGraph.GraphEvent) -> Types.GraphTransition:
  match state:
    case Types.State{canonical, +graphs, scheduler, workloads, random, advicees, credentials, opening, retiring}:
      +found = {find(graphs, key) : Maybe<&2, Types.GraphEntry>}
      checked(Nat.is_eq(position, expected(found)), Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring}, key, position, graph(found, limits), event)

def retire_entry(entry: Types.GraphEntry, rest: List<&2, Types.GraphEntry>, operation: Nat) -> List<&2, Types.GraphEntry>:
  match entry:
    case Types.GraphEntry{p, l, r, +o, u, s, g}:
      retain_hit(Nat.is_eq(o, operation), Types.GraphEntry{p, l, r, o, u, s, g}, rest)

def retire_entries(entries: List<&2, Types.GraphEntry>, +operation: Nat) -> List<&2, Types.GraphEntry>:
  match entries:
    case Nil{}: Nil{}
    case +head <> tail:
      retire_entry(head, retire_entries(tail, operation), operation)

