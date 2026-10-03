import Base
import ./RuntimeScenarios.bend as RuntimeScenarios
import ./AdviceeLifecycle.bend as AdviceeLifecycle
import ./AdviceeLifecycleCleanup.bend as AdviceeLifecycleCleanup
import ./AdviceeActivity.bend as AdviceeActivity
import ./Types.bend as Types
import ../agent-flow-bend/ImportGraph.bend as ImportGraph
import ../agent-flow-bend/Canonical.bend as Canonical

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
    case Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}:
      Types.GraphTransition{Types.State{canonical, install(key, position, ImportGraph.bounded_state(result)) <> remove(graphs, key), scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}, before, result}

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
    case Types.State{canonical, +graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}:
      +found = {find(graphs, key) : Maybe<&2, Types.GraphEntry>}
      checked(Nat.is_eq(position, expected(found)), Types.State{canonical, graphs, scheduler, workloads, random, advicees, credentials, opening, retiring, lifecycles, preparations, activity_scopes, scenarios}, key, position, graph(found, limits), event)

# Graph facts belong only to the exact retained preparing work identity.
def preparing(found: Maybe<&2, Canonical.Work>) -> Bool:
  match found:
    case Some{Canonical.Work{_, _, _, _, _, Canonical.Preparing{}, _}}: True{}
    case _: False{}

def active(canonical: Canonical.State, partition: Nat, lifetime: Nat, round: Nat, operation: Nat) -> Bool:
  match canonical:
    case Canonical.State{_, _, work, _, _, _, _, _, _}:
      preparing(Canonical.find_work(partition, lifetime, round, operation, work))

def retain_entry_pick(keep: Bool, entry: Types.GraphEntry, remaining: List<&2, Types.GraphEntry>) -> List<&2, Types.GraphEntry>:
  match keep:
    case True{}: entry <> remaining
    case False{}: remaining

def retained_entry(+entry: Types.GraphEntry, remaining: List<&2, Types.GraphEntry>, canonical: Canonical.State) -> List<&2, Types.GraphEntry>:
  match entry:
    case Types.GraphEntry{partition, lifetime, round, operation, _, _, _}:
      retain_entry_pick(active(canonical, partition, lifetime, round, operation), entry, remaining)

def retained(entries: List<&2, Types.GraphEntry>, +canonical: Canonical.State) -> List<&2, Types.GraphEntry>:
  match entries:
    case Nil{}: Nil{}
    case head <> tail: retained_entry(head, retained(tail, canonical), canonical)
