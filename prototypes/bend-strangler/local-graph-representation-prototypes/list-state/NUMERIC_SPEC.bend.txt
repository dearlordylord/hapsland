import Base
import ./core.bend as Core
import ./Own.bend as Own

# Independent numeric adaptation of the unchanged direct recursive String DFS specification. No Core.step or transition helpers are used.
# Labels retain all lookup alternatives; import bindings carry the pre-encoded composite.
# String/registry correspondence remains a separate universal obligation.
# A tree is constructed only after its child result returns, as in native buildLocal.
type Outcome is Data:
  Included{identity: Nat}
  Expanded{tree: Tree}
  Omitted{reason: Core.Omission, target: Nat}

type TreeReference is Data:
  TreeReference{symbol: Nat, outcome: Outcome}

type Tree is Data:
  Tree{address: Nat, artifact: Nat, references: List<&2, TreeReference>}

type State is Data:
  State{
    visited: Own.Dictionary<Bool>,
    budget: Core.Budget,
    next_address: Nat,
    pending_rev: List<&2, Core.Pending>
  }

type Build is Data:
  Missing{state: State}
  Built{state: State, tree: Tree}
  InsufficientBound{state: State}

type ReferenceResult is Data:
  ReferenceResult{state: State, reference: TreeReference}
  ReferenceFailure{state: State}

type ReferencesResult is Data:
  ReferencesResult{state: State, references: List<&2, TreeReference>}
  ReferencesFailure{state: State}

type Request is Data:
  Request{
    facts: Core.Facts,
    path: Nat,
    name: Core.Label,
    expected: Core.ExpectedKind,
    depth: Nat,
    state: State
  }
  ReferencesRequest{
    items: List<&2, Core.Reference>,
    facts: Core.Facts,
    path: Nat,
    owner: Nat,
    index: Nat,
    depth: Nat,
    state: State
  }

type DispatchResult is Data:
  BuildResult{build: Build}
  ListResult{references: ReferencesResult}

def value(-V: Data, result: Own.Dictionary< V> & V) -> V:
  match result:
    case Tuple{_, found}: found

def key_by_kind(expected: Core.ExpectedKind, name: Core.Label) -> Nat:
  match expected name:
    case Core.TypeKind{} Core.Label{_, type_key, _}: type_key
    case _ Core.Label{_, _, function_key}: function_key

def key(aware: Bool, expected: Core.ExpectedKind, name: Core.Label) -> Nat:
  match aware name:
    case False{} Core.Label{raw, _, _}: raw
    case True{} label: key_by_kind(expected, label)

def find_declaration(
  facts: Core.Facts,
  name: Core.Label,
  expected: Core.ExpectedKind
) -> Maybe<&2, Core.Declaration>:
  match facts:
    case Core.Facts{aware, declarations, _, _}:
      value(
        Maybe<&2, Core.Declaration>,
        Own.get(Maybe<&2, Core.Declaration>, None{}, declarations, key(aware, expected, name))
      )

def find_import(facts: Core.Facts, name: Core.Label) -> Maybe<&2, Core.ImportBinding>:
  match facts:
    case Core.Facts{_, _, imports, _}:
      value(
        Maybe<&2, Core.ImportBinding>,
        Own.get(Maybe<&2, Core.ImportBinding>, None{}, imports, Core.label_key(name))
      )

def matches(expected: Core.ExpectedKind, function: Bool) -> Bool:
  match expected function:
    case Core.AnyKind{} _: True{}
    case Core.TypeKind{} False{}: True{}
    case Core.FunctionKind{} True{}: True{}
    case _ _: False{}

def state_budget(state: State) -> Core.Budget:
  match state:
    case State{_, budget, _, _}: budget

def replace_budget(state: State, budget: Core.Budget) -> State:
  match state:
    case State{visited, _, address, pending}: State{visited, budget, address, pending}

def depth_budget(budget: Core.Budget, depth: Nat) -> Core.Budget:
  match budget:
    case Core.Budget{limits, targets, maximum, work, graph_work, old_depth}:
      Core.Budget{limits, targets, maximum, work, graph_work, Nat.max(old_depth, depth)}

def reference_depth(+state: State, depth: Nat) -> State:
  replace_budget(state, depth_budget(state_budget(state), depth))

def work_budget(budget: Core.Budget) -> Core.Budget:
  match budget:
    case Core.Budget{limits, targets, maximum, work, graph_work, depth}:
      Core.Budget{limits, targets, maximum, (work + 1n : Nat), graph_work, depth}

def local_work(+state: State) -> State:
  replace_budget(state, work_budget(state_budget(state)))

def path_set(budget: Core.Budget, path: Nat) -> Own.Dictionary< Bool>:
  match budget:
    case Core.Budget{_, targets, _, _, _, _}:
      value(Own.Dictionary< Bool>, Own.get(Own.Dictionary< Bool>, Own.DNil{}, targets, path))

def replace_path(
  budget: Core.Budget,
  path: Nat,
  set: Own.Dictionary< Bool>,
  maximum: Nat
) -> Core.Budget:
  match budget:
    case Core.Budget{limits, targets, _, work, graph_work, depth}:
      Core.Budget{
        limits,
        Own.set( Own.Dictionary< Bool>, targets, path, set),
        maximum,
        work,
        graph_work,
        depth
      }

def maximum_targets(budget: Core.Budget) -> Nat:
  match budget:
    case Core.Budget{_, _, maximum, _, _, _}: maximum

def ensure_path(+budget: Core.Budget, +path: Nat) -> Core.Budget:
  replace_path(budget, path, path_set(budget, path), maximum_targets(budget))

def observe_set(+budget: Core.Budget, path: Nat, +set: Own.Dictionary< Bool>) -> Core.Budget:
  replace_path(budget, path, set, Nat.max(maximum_targets(budget), Own.size( Bool, set)))

def target_budget(+budget: Core.Budget, +path: Nat, target: Nat) -> Core.Budget:
  observe_set(budget, path, Own.set( Bool, path_set(budget, path), target, True{}))

def target(+state: State, path: Nat, identity: Nat) -> State:
  replace_budget(state, target_budget(state_budget(state), path, identity))

def within_limits(
  limits: Core.LocalLimits,
  work: Nat,
  graph_work: Nat,
  depth: Nat,
  count: Nat
) -> Bool:
  match limits:
    case Core.LocalLimits{work_cap, depth_cap, target_cap}:
      Bool.and(
        Bool.not(Nat.is_gt(depth, depth_cap)),
        Bool.and(
          Bool.not(Nat.is_gt(count, target_cap)),
          Bool.not(Nat.is_gt((work + graph_work : Nat), work_cap))
        )
      )

def allowed_budget(budget: Core.Budget, count: Nat) -> Bool:
  match budget:
    case Core.Budget{limits, _, _, work, graph_work, depth}:
      within_limits(limits, work, graph_work, depth, count)

def allowed(+state: State, path: Nat) -> Bool:
  allowed_budget(state_budget(state), Own.size( Bool, path_set(state_budget(state), path)))

def seen(state: State, identity: Nat) -> Bool:
  match state:
    case State{visited, _, _, _}: value(Bool, Own.has( Bool, visited, identity))

def enter(state: State, path: Nat, identity: Nat) -> State:
  match state:
    case State{visited, budget, address, pending}:
      State{
        Own.set( Bool, visited, identity, True{}),
        ensure_path(budget, path),
        (address + 1n : Nat),
        pending
      }

def address(state: State) -> Nat:
  match state:
    case State{_, _, address, _}: address

def omitted(state: State, +name: Core.Label, reason: Core.Omission) -> ReferenceResult:
  ReferenceResult{state, TreeReference{Core.label_key(name), Omitted{reason, Core.label_key(name)}}}

# Recursive child results carry all shared state forward before the parent appends its reference.
def expanded_result(result: Build, symbol: Core.Label) -> ReferenceResult:
  match result:
    case Built{state, tree}: ReferenceResult{
      state,
      TreeReference{Core.label_key(symbol), Expanded{tree}}
    }
    case Missing{state}: omitted(state, symbol, Core.Unresolved{})
    case InsufficientBound{state}: ReferenceFailure{state}

def pending(state: State, item: Core.Pending) -> State:
  match state:
    case State{visited, budget, address, items}: State{visited, budget, address, item <> items}

def queue(state: State, +path: Nat, +symbol: Core.Label, +owner: Nat, +index: Nat,
    depth: Nat, expected: Core.ExpectedKind, imported: Core.ImportBinding) -> ReferenceResult:
  match imported:
    case Core.ImportBinding{import_path, +name, _, _}:
      omitted(
        pending(
          state,
          Core.Pending{
            owner,
            index,
            path,
            Core.label_key(symbol),
            name,
            depth,
            expected,
            Core.Imported{import_path, name}
          }
        ),
        symbol,
        Core.Unavailable{}
      )

def imported_kind(
  expected: Core.ExpectedKind,
  type_only: Bool,
  state: State,
  path: Nat,
  symbol: Core.Label,
  owner: Nat,
  index: Nat,
  depth: Nat,
  imported: Core.ImportBinding
) -> ReferenceResult:
  match expected type_only:
    case Core.FunctionKind{} True{}: omitted(state, symbol, Core.UnsupportedTarget{})
    case kind _: queue(state, path, symbol, owner, index, depth, kind, imported)

def unresolved_or_import(
  found: Maybe<&2, Core.ImportBinding>,
  state: State,
  path: Nat,
  symbol: Core.Label,
  owner: Nat,
  index: Nat,
  depth: Nat,
  expected: Core.ExpectedKind
) -> ReferenceResult:
  match found:
    case None{}: omitted(state, symbol, Core.Unresolved{})
    case Some{Core.ImportBinding{+import_path, +name, +type_only, +composite}}:
      imported_kind(expected, type_only, state, path, symbol, owner, index, depth,
        Core.ImportBinding{import_path, name, type_only, composite})

def child_or_cycle(
  already_seen: Bool,
  state: State,
  facts: Core.Facts,
  path: Nat,
  +symbol: Core.Label,
  depth: Nat,
  expected: Core.ExpectedKind,
  identity: Nat,
  recurse: Request -> Build
) -> ReferenceResult:
  match already_seen:
    case True{}: ReferenceResult{state, TreeReference{Core.label_key(symbol), Included{identity}}}
    case False{}: expanded_result(
      recurse(Request{facts, path, symbol, expected, (depth + 1n : Nat), state}),
      symbol
    )

def local_allowed(
  permit: Bool,
  +state: State,
  facts: Core.Facts,
  path: Nat,
  symbol: Core.Label,
  depth: Nat,
  expected: Core.ExpectedKind,
  +identity: Nat,
  recurse: Request -> Build
) -> ReferenceResult:
  match permit:
    case False{}: omitted(state, symbol, Core.ReferenceLimit{})
    case True{}: child_or_cycle(
      seen(state, identity),
      state,
      facts,
      path,
      symbol,
      depth,
      expected,
      identity,
      recurse
    )

def local_budget(
  +state: State,
  facts: Core.Facts,
  +path: Nat,
  symbol: Core.Label,
  depth: Nat,
  expected: Core.ExpectedKind,
  identity: Nat,
  recurse: Request -> Build
) -> ReferenceResult:
  local_allowed(
    allowed(state, path),
    state,
    facts,
    path,
    symbol,
    depth,
    expected,
    identity,
    recurse
  )

def local_kind(
  valid: Bool,
  state: State,
  facts: Core.Facts,
  path: Nat,
  symbol: Core.Label,
  depth: Nat,
  expected: Core.ExpectedKind,
  identity: Nat,
  recurse: Request -> Build
) -> ReferenceResult:
  match valid:
    case False{}: omitted(state, symbol, Core.UnsupportedTarget{})
    case True{}: local_budget(
      local_work(state),
      facts,
      path,
      symbol,
      depth,
      expected,
      identity,
      recurse
    )

def local_conflict(imported: Maybe<&2, Core.ImportBinding>, declaration: Core.Declaration,
    state: State, facts: Core.Facts, path: Nat, symbol: Core.Label, depth: Nat,
    +expected: Core.ExpectedKind, recurse: Request -> Build) -> ReferenceResult:
  match imported declaration:
    case Some{_} _: omitted(state, symbol, Core.UnsupportedTarget{})
    case None{} Core.Declaration{_, identity, function, _, _}:
      local_kind(
        matches(expected, function),
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        recurse
      )

def import_budget(
  permit: Bool,
  imported: Maybe<&2, Core.ImportBinding>,
  state: State,
  path: Nat,
  symbol: Core.Label,
  owner: Nat,
  index: Nat,
  depth: Nat,
  expected: Core.ExpectedKind
) -> ReferenceResult:
  match permit:
    case False{}: omitted(state, symbol, Core.ReferenceLimit{})
    case True{}: unresolved_or_import(imported, state, path, symbol, owner, index, depth, expected)

def choose_local(local: Maybe<&2, Core.Declaration>, imported: Maybe<&2, Core.ImportBinding>,
    +state: State, facts: Core.Facts, +path: Nat, symbol: Core.Label, owner: Nat, index: Nat,
    depth: Nat, expected: Core.ExpectedKind, recurse: Request -> Build) -> ReferenceResult:
  match local:
    case Some{declaration}: local_conflict(
      imported,
      declaration,
      state,
      facts,
      path,
      symbol,
      depth,
      expected,
      recurse
    )
    case None{}: import_budget(
      allowed(state, path),
      imported,
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      expected
    )

def import_key(path: Nat, imported: Core.ImportBinding) -> Nat:
  match imported:
    case Core.ImportBinding{_, _, _, composite}: composite

def other_key(imported: Maybe<&2, Core.ImportBinding>, path: Nat, symbol: Core.Label) -> Nat:
  match imported:
    case None{}: Core.label_key(symbol)
    case Some{binding}: import_key(path, binding)

def identity_key(
  local: Maybe<&2, Core.Declaration>,
  imported: Maybe<&2, Core.ImportBinding>,
  path: Nat,
  symbol: Core.Label
) -> Nat:
  match local:
    case Some{Core.Declaration{_, identity, _, _, _}}: identity
    case None{}: other_key(imported, path, symbol)

def ordinary_found(+local: Maybe<&2, Core.Declaration>, +imported: Maybe<&2, Core.ImportBinding>,
    state: State, facts: Core.Facts, +path: Nat, +symbol: Core.Label, owner: Nat, index: Nat,
    depth: Nat, expected: Core.ExpectedKind, recurse: Request -> Build) -> ReferenceResult:
  choose_local(local, imported, target(state, path, identity_key(local, imported, path, symbol)),
    facts, path, symbol, owner, index, depth, expected, recurse)

def ordinary(
  +facts: Core.Facts,
  path: Nat,
  +symbol: Core.Label,
  owner: Nat,
  index: Nat,
  depth: Nat,
  +expected: Core.ExpectedKind,
  state: State,
  recurse: Request -> Build
) -> ReferenceResult:
  ordinary_found(find_declaration(facts, symbol, expected), find_import(facts, symbol), state,
    facts, path, symbol, owner, index, depth, expected, recurse)

def supporting(facts: Core.Facts, identity: Nat) -> Maybe<&2, Core.Declaration>:
  match facts:
    case Core.Facts{_, _, _, catalog}:
      value(
        Maybe<&2, Core.Declaration>,
        Own.get(Maybe<&2, Core.Declaration>, None{}, catalog, identity)
      )

def bundle_queue(state: State, +path: Nat, +symbol: Core.Label, owner: Nat, index: Nat,
    depth: Nat, expected: Core.ExpectedKind, handle: Nat) -> ReferenceResult:
  omitted(
    pending(
      state,
      Core.Pending{
        owner,
        index,
        path,
        Core.label_key(symbol),
        Core.label_key(symbol),
        depth,
        expected,
        Core.BundledTarget{handle}
      }
    ),
    symbol,
    Core.Unavailable{}
  )

def bundle_finish(
  permit: Bool,
  already_seen: Bool,
  state: State,
  path: Nat,
  symbol: Core.Label,
  owner: Nat,
  index: Nat,
  depth: Nat,
  expected: Core.ExpectedKind,
  handle: Nat,
  identity: Nat
) -> ReferenceResult:
  match permit already_seen:
    case False{} _: omitted(state, symbol, Core.ReferenceLimit{})
    case True{} True{}: ReferenceResult{
      state,
      TreeReference{Core.label_key(symbol), Included{identity}}
    }
    case True{} False{}: bundle_queue(state, path, symbol, owner, index, depth, expected, handle)

def bundle_budget(
  +state: State,
  already_seen: Bool,
  +path: Nat,
  symbol: Core.Label,
  owner: Nat,
  index: Nat,
  depth: Nat,
  expected: Core.ExpectedKind,
  handle: Nat,
  identity: Nat
) -> ReferenceResult:
  bundle_finish(
    allowed(state, path),
    already_seen,
    state,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    handle,
    identity
  )

def bundle_work(already_seen: Bool, state: State) -> State:
  match already_seen:
    case True{}: local_work(state)
    case False{}: state

def bundle_seen(
  +already_seen: Bool,
  state: State,
  +path: Nat,
  symbol: Core.Label,
  owner: Nat,
  index: Nat,
  depth: Nat,
  expected: Core.ExpectedKind,
  handle: Nat,
  +identity: Nat
) -> ReferenceResult:
  bundle_budget(
    bundle_work(already_seen, target(state, path, identity)),
    already_seen,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    handle,
    identity
  )

def bundle_admission(
  valid: Bool,
  +state: State,
  path: Nat,
  symbol: Core.Label,
  owner: Nat,
  index: Nat,
  depth: Nat,
  expected: Core.ExpectedKind,
  handle: Nat,
  +identity: Nat
) -> ReferenceResult:
  match valid:
    case False{}: omitted(state, symbol, Core.UnsupportedTarget{})
    case True{}: bundle_seen(
      seen(state, identity),
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      expected,
      handle,
      identity
    )

def bundle_found(
  found: Maybe<&2, Core.Declaration>,
  identity: Nat,
  +expected: Core.ExpectedKind,
  state: State,
  path: Nat,
  symbol: Core.Label,
  owner: Nat,
  index: Nat,
  depth: Nat
) -> ReferenceResult:
  match found:
    case None{}: omitted(state, symbol, Core.UnsupportedTarget{})
    case Some{Core.Declaration{handle, +actual_id, function, bundled, _}}:
      bundle_admission(
        Bool.and(bundled, Bool.and(Nat.is_eq(identity, actual_id), matches(expected, function))),
        state,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        handle,
        actual_id
      )

def named(
  target_id: Maybe<&2, Nat>,
  +facts: Core.Facts,
  path: Nat,
  symbol: Core.Label,
  owner: Nat,
  index: Nat,
  depth: Nat,
  expected: Core.ExpectedKind,
  state: State,
  recurse: Request -> Build
) -> ReferenceResult:
  match target_id:
    case None{}: ordinary(facts, path, symbol, owner, index, depth, expected, state, recurse)
    case Some{+identity}: bundle_found(
      supporting(facts, identity),
      identity,
      expected,
      state,
      path,
      symbol,
      owner,
      index,
      depth
    )

def by_kind(
  kind: Core.ReferenceKind,
  target_id: Maybe<&2, Nat>,
  facts: Core.Facts,
  path: Nat,
  symbol: Core.Label,
  owner: Nat,
  index: Nat,
  depth: Nat,
  expected: Core.ExpectedKind,
  state: State,
  recurse: Request -> Build
) -> ReferenceResult:
  match kind:
    case Core.Unsupported{}: omitted(state, symbol, Core.UnsupportedTarget{})
    case Core.Named{}: named(
      target_id,
      facts,
      path,
      symbol,
      owner,
      index,
      depth,
      expected,
      state,
      recurse
    )

def reference(
  reference: Core.Reference,
  facts: Core.Facts,
  path: Nat,
  owner: Nat,
  index: Nat,
  +depth: Nat,
  state: State,
  recurse: Request -> Build
) -> ReferenceResult:
  match reference:
    case Core.Reference{kind, symbol, expected, target_id}:
      by_kind(kind, target_id, facts, path, symbol, owner, index, depth, expected,
        reference_depth(state, (depth + 1n : Nat)), recurse)

def prepend(result: ReferencesResult, reference: TreeReference) -> ReferencesResult:
  match result:
    case ReferencesResult{state, references}: ReferencesResult{state, reference <> references}
    case ReferencesFailure{state}: ReferencesFailure{state}

def after_reference(
  result: ReferenceResult,
  continue: State -> ReferencesResult
) -> ReferencesResult:
  match result:
    case ReferenceFailure{state}: ReferencesFailure{state}
    case ReferenceResult{state, reference}: prepend(continue(state), reference)

def as_build(result: DispatchResult) -> Build:
  match result:
    case BuildResult{build}: build
    case ListResult{ReferencesResult{state, _}}: InsufficientBound{state}
    case ListResult{ReferencesFailure{state}}: InsufficientBound{state}

def as_references(result: DispatchResult) -> ReferencesResult:
  match result:
    case ListResult{references}: references
    case BuildResult{Missing{state}}: ReferencesFailure{state}
    case BuildResult{Built{state, _}}: ReferencesFailure{state}
    case BuildResult{InsufficientBound{state}}: ReferencesFailure{state}

def build_child(child: Request -> DispatchResult, request: Request) -> Build:
  as_build(child(request))

def references_sibling(tail: List<&2, Core.Reference>, facts: Core.Facts, path: Nat,
    owner: Nat, index: Nat, depth: Nat, sibling: Request -> DispatchResult,
    state: State) -> ReferencesResult:
  as_references(sibling(ReferencesRequest{tail, facts, path, owner, index, depth, state}))

def references(items: List<&2, Core.Reference>, +facts: Core.Facts, +path: Nat,
    +owner: Nat, +index: Nat, +depth: Nat, state: State,
    child: Request -> DispatchResult, sibling: Request -> DispatchResult) -> ReferencesResult:
  match items:
    case []: ReferencesResult{state, []}
    case head <> tail:
      after_reference(reference(head, facts, path, owner, index, depth, state,
        build_child(child)),
        references_sibling(tail, facts, path, owner, (index + 1n : Nat), depth, sibling))

def tree_result(result: ReferencesResult, owner: Nat, artifact: Nat) -> Build:
  match result:
    case ReferencesFailure{state}: InsufficientBound{state}
    case ReferencesResult{state, references}: Built{state, Tree{owner, artifact, references}}

def walk_declaration(found: Maybe<&2, Core.Declaration>, +facts: Core.Facts, +path: Nat,
    +state: State, depth: Nat, recurse: Request -> DispatchResult) -> Build:
  match found:
    case None{}: Missing{state}
    case Some{Core.Declaration{artifact, identity, _, _, children}}:
      tree_result(
        as_references(
          recurse(
            ReferencesRequest{
              children,
              facts,
              path,
              address(state),
              0n,
              depth,
              enter(state, path, identity)
            }
          )
        ),
        address(state),
        artifact
      )

def dispatch(
  request: Request,
  child: Request -> DispatchResult,
  sibling: Request -> DispatchResult
) -> DispatchResult:
  match request:
    case Request{+facts, +path, name, expected, depth, state}:
      BuildResult{
        walk_declaration(find_declaration(facts, name, expected), facts, path, state, depth, child)
      }
    case ReferencesRequest{items, facts, path, owner, index, depth, state}:
      ListResult{references(items, facts, path, owner, index, depth, state, child, sibling)}

def insufficient(request: Request) -> DispatchResult:
  match request:
    case Request{_, _, _, _, _, state}: BuildResult{InsufficientBound{state}}
    case ReferencesRequest{_, _, _, _, _, _, state}: ListResult{ReferencesFailure{state}}

def interpret(fuel: Nat, request: Request) -> DispatchResult:
  match fuel:
    case 0n: insufficient(request)
    case 1n++remaining:
      dispatch(request, next => interpret(remaining, next), next => interpret(remaining, next))
# Representation projection only: recursive tree semantics remain independent of
# the production stack. Slots use parent-before-child order for exact plan equality.
type Flat is Data:
  Flat{nodes: List<&2, Core.PlannedNode>, slots: List<&2, Core.ReferenceSlot>}
  FlatFailure{}

type FlattenRequest is Data:
  FlattenTree{tree: Tree}
  FlattenReferences{owner: Nat, index: Nat, references: List<&2, TreeReference>}

def flat_join(left: Flat, right: Flat) -> Flat:
  match left right:
    case Flat{nodes, slots} Flat{more_nodes, more_slots}:
      Flat{
        List.append(&2, Core.PlannedNode, nodes, more_nodes),
        List.append(&2, Core.ReferenceSlot, slots, more_slots)
      }
    case _ _: FlatFailure{}

def flat_slot(
  flat: Flat,
  owner: Nat,
  index: Nat,
  symbol: Nat,
  reference: Core.PlannedReference
) -> Flat:
  match flat:
    case Flat{nodes, slots}: Flat{
      nodes,
      Core.ReferenceSlot{owner, index, symbol, reference} <> slots
    }
    case FlatFailure{}: FlatFailure{}

def flat_node(flat: Flat, address: Nat, artifact: Nat) -> Flat:
  match flat:
    case Flat{nodes, slots}: Flat{Core.PlannedNode{address, artifact} <> nodes, slots}
    case FlatFailure{}: FlatFailure{}

def flat_outcome(
  outcome: Outcome,
  owner: Nat,
  index: Nat,
  symbol: Nat,
  child: FlattenRequest -> Flat
) -> Flat:
  match outcome:
    case Included{identity}: Flat{
      [],
      Core.ReferenceSlot{owner, index, symbol, Core.Included{identity}} <> []
    }
    case Omitted{reason, target}: Flat{
      [],
      Core.ReferenceSlot{owner, index, symbol, Core.Omitted{reason, target}} <> []
    }
    case Expanded{Tree{+address, artifact, references}}:
      flat_slot(
        child(FlattenTree{Tree{address, artifact, references}}),
        owner,
        index,
        symbol,
        Core.Expanded{address}
      )

def flat_head(
  reference: TreeReference,
  owner: Nat,
  index: Nat,
  child: FlattenRequest -> Flat
) -> Flat:
  match reference:
    case TreeReference{symbol, outcome}: flat_outcome(outcome, owner, index, symbol, child)

def flatten_dispatch(
  request: FlattenRequest,
  child: FlattenRequest -> Flat,
  sibling: FlattenRequest -> Flat
) -> Flat:
  match request:
    case FlattenTree{Tree{+address, artifact, references}}:
      flat_node(child(FlattenReferences{address, 0n, references}), address, artifact)
    case FlattenReferences{_, _, []}: Flat{[], []}
    case FlattenReferences{+owner, +index, head <> tail}:
      flat_join(
        flat_head(head, owner, index, child),
        sibling(FlattenReferences{owner, (index + 1n : Nat), tail})
      )

def flatten(fuel: Nat, request: FlattenRequest) -> Flat:
  match fuel:
    case 0n: FlatFailure{}
    case 1n++remaining:
      flatten_dispatch(request, next => flatten(remaining, next), next => flatten(remaining, next))
