import Base
import ./TreeFacts.bend as TreeFacts
import ../agent-flow-bend/ImportGraph.bend as ImportGraph

# Source-free generated fixture identities. Registries compare captured facts;
# they do not decide freshness, admission or reuse. The upper u48 namespace is
# disjoint from boundary-interned labels in the lower u47 namespace. Exact
# explicit public labels bind to the same key; the first identity remains stable.
type GeneratedKey is Data:
  GeneratedKey{facts: List<&2, Nat>}
type GeneratedEntry is Data:
  GeneratedEntry{key: GeneratedKey, identity: Nat}
type State is Data:
  State{next: Nat, entries: List<&2, GeneratedEntry>}
type Interned is Data:
  Interned{state: State, identity: Nat}
type Units is Data:
  Units{state: State, prepared: List<&2, Nat>}
type Captured is Data:
  Captured{state: State, tree_identity: Nat, subject: Nat, input: Nat, prepared: List<&2, Nat>}

def initial() -> State:
  State{((2147483648n * 65536n : Nat) + 1n : Nat), []}

def subject_key() -> GeneratedKey:
  GeneratedKey{[2n]}

def fixture(revision: Nat) -> Nat:
  Nat.mod(Nat.div(Nat.sub(revision, 1n), 2n), 2n)

def equal_facts(left: List<&2, Nat>, right: List<&2, Nat>) -> Bool:
  match left right:
    case Nil{} Nil{}: True{}
    case a <> rest b <> other: Nat.is_eq(a, b) && equal_facts(rest, other)
    case _ _: False{}

def equal(left: GeneratedKey, right: GeneratedKey) -> Bool:
  match left right:
    case GeneratedKey{left} GeneratedKey{right}: equal_facts(left, right)

def selected(same: Bool, identity: Nat, rest: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match same:
    case True{}: Some{identity}
    case False{}: rest

def lookup(entries: List<&2, GeneratedEntry>, +key: GeneratedKey) -> Maybe<&2, Nat>:
  match entries:
    case Nil{}: None{}
    case GeneratedEntry{other, identity} <> tail: selected(
      equal(key, other),
      identity,
      lookup(tail, key)
    )

def intern_found(found: Maybe<&2, Nat>, state: State, key: GeneratedKey) -> Interned:
  match found state:
    case Some{identity} state: Interned{state, identity}
    case None{} State{+next, entries}: Interned{
      State{
        (next + 1n : Nat),
        List.append(&2, GeneratedEntry, entries, [GeneratedEntry{key, next}])
      },
      next
    }

def intern(+state: State, +key: GeneratedKey) -> Interned:
  match state:
    case State{next, +entries}: intern_found(lookup(entries, key), State{next, entries}, key)

def bind_found(found: Maybe<&2, Nat>, state: State, key: GeneratedKey, +identity: Nat) -> Interned:
  match found state:
    case Some{existing} state: Interned{state, existing}
    case None{} State{next, entries}: Interned{
      State{next, List.append(&2, GeneratedEntry, entries, [GeneratedEntry{key, identity}])},
      identity
    }

def bind(state: State, +key: GeneratedKey, +identity: Nat) -> Interned:
  match state:
    case State{next, +entries}: bind_found(
      lookup(entries, key),
      State{next, entries},
      key,
      identity
    )

def profile_facts(profile: TreeFacts.Profile) -> List<&2, Nat>:
  match profile:
    case TreeFacts.Profile{
      min_files,
      max_files,
      max_imports,
      max_depth,
      denied_percent,
      missing_percent,
      unreadable_percent,
      repeated_percent,
      cyclic_percent,
      unsupported_percent,
      deadline_step,
      local_work,
      min_source,
      max_source,
      min_tree,
      max_tree
    }: [
      min_files,
      max_files,
      max_imports,
      max_depth,
      denied_percent,
      missing_percent,
      unreadable_percent,
      repeated_percent,
      cyclic_percent,
      unsupported_percent,
      deadline_step,
      local_work,
      min_source,
      max_source,
      min_tree,
      max_tree
    ]

def limit_facts(limits: ImportGraph.Limits) -> List<&2, Nat>:
  match limits:
    case ImportGraph.Limits{version, source, tree, files, read, edges, depth, work}: [
      version,
      source,
      tree,
      files,
      read,
      edges,
      depth,
      work
    ]

def captured_facts(
  seed: Nat,
  tree_label: Nat,
  limits_label: Nat,
  profile: TreeFacts.Profile,
  limits: ImportGraph.Limits
) -> List<&2, Nat>:
  seed <> tree_label <> limits_label <> List.append(
    &2,
    Nat,
    profile_facts(profile),
    limit_facts(limits)
  )

def unit_key_facts(
  partition: Nat,
  pair: Nat,
  index: Nat,
  byte: Nat,
  facts: List<&2, Nat>
) -> GeneratedKey:
  GeneratedKey{0n <> partition <> pair <> index <> byte <> facts}

def input_key_facts(
  pair: Nat,
  bytes: Nat,
  +unit_bytes: List<&2, Nat>,
  facts: List<&2, Nat>
) -> GeneratedKey:
  GeneratedKey{
    1n <> pair <> bytes <> List.length(
      &2,
      Nat,
      unit_bytes
    ) <> List.append(&2, Nat, unit_bytes, facts)
  }

def unit_key(
  partition: Nat,
  pair: Nat,
  index: Nat,
  byte: Nat,
  seed: Nat,
  profile: TreeFacts.Profile,
  limits: ImportGraph.Limits,
  tree_label: Nat,
  limits_label: Nat
) -> GeneratedKey:
  unit_key_facts(
    partition,
    pair,
    index,
    byte,
    captured_facts(seed, tree_label, limits_label, profile, limits)
  )

def input_key(
  pair: Nat,
  bytes: Nat,
  unit_bytes: List<&2, Nat>,
  seed: Nat,
  profile: TreeFacts.Profile,
  limits: ImportGraph.Limits,
  tree_label: Nat,
  limits_label: Nat
) -> GeneratedKey:
  input_key_facts(
    pair,
    bytes,
    unit_bytes,
    captured_facts(seed, tree_label, limits_label, profile, limits)
  )

def unit_prepend(identity: Nat, units: Units) -> Units:
  match units:
    case Units{state, prepared}: Units{state, identity <> prepared}

def unit_stored(value: Interned, continue: State -> Units) -> Units:
  match value:
    case Interned{state, identity}: unit_prepend(identity, continue(state))

def units(
  bytes: List<&2, Nat>,
  state: State,
  +partition: Nat,
  +index: Nat,
  +fixture: Nat,
  +facts: List<&2, Nat>
) -> Units:
  match bytes:
    case Nil{}: Units{state, []}
    case byte <> tail:
      unit_stored(intern(state, unit_key_facts(partition, fixture, index, byte, facts)),
        next => units(tail, next, partition, (index + 1n : Nat), fixture, facts))

def captured_subject(value: Interned, tree: Nat, input: Nat, prepared: List<&2, Nat>) -> Captured:
  match value:
    case Interned{state, identity}: Captured{state, tree, identity, input, prepared}

def captured_units(value: Units, tree: Nat, input: Nat) -> Captured:
  match value:
    case Units{state, prepared}: captured_subject(
      intern(state, subject_key()),
      tree,
      input,
      prepared
    )

def captured_input(
  value: Interned,
  partition: Nat,
  +unit_bytes: List<&2, Nat>,
  +pair: Nat,
  facts: List<&2, Nat>
) -> Captured:
  match value:
    case Interned{state, input}: captured_units(
      units(unit_bytes, state, partition, 0n, pair, facts),
      (pair + 1n : Nat),
      input
    )

def capture_facts(
  state: State,
  partition: Nat,
  +pair: Nat,
  bytes: Nat,
  +unit_bytes: List<&2, Nat>,
  +facts: List<&2, Nat>
) -> Captured:
  captured_input(
    intern(state, input_key_facts(pair, bytes, unit_bytes, facts)),
    partition,
    unit_bytes,
    pair,
    facts
  )

def capture(
  state: State,
  partition: Nat,
  revision: Nat,
  bytes: Nat,
  unit_bytes: List<&2, Nat>,
  seed: Nat,
  profile: TreeFacts.Profile,
  limits: ImportGraph.Limits,
  tree_label: Nat,
  limits_label: Nat
) -> Captured:
  capture_facts(
    state,
    partition,
    fixture(revision),
    bytes,
    unit_bytes,
    captured_facts(seed, tree_label, limits_label, profile, limits)
  )
