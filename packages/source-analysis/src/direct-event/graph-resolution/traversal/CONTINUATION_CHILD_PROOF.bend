import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_PREFIX_PROOF.bend as Prefix
import ./CONTINUATION_STATE_PROOF.bend as State

def declaration_handle(declaration: Core.Declaration) -> Nat:
  match declaration:
    case Core.Declaration{artifact, _, _, _, _}: artifact

# The production child emits its parent slot and own node before its references.
# The recursive child prepends these to the returned flat result. These exact
# ordered prefixes coincide; no membership-only or address-validity premise.
def expanded_prefix(+machine: Core.Machine, +declaration: Core.Declaration,
    +owner: Nat, +index: Nat, +symbol: String, +depth: Nat) -> {
      Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth))
      == Spec.flat_join(
        Prefix.prefix(machine),
        Spec.Flat{
          Core.PlannedNode{CoreTraversal.next_node(machine), declaration_handle(declaration)} <> [],
          Core.ReferenceSlot{owner, index, symbol, Core.Expanded{CoreTraversal.next_node(machine)}} <> []
        }
      )
      : Spec.Flat
    }:
  match machine declaration:
    case Core.Machine{_, _, _, _, _, +address, +nodes, +slots, _}
      Core.Declaration{+artifact, _, _, _, _}:
      %Equal.sym(
        List<&2, Core.PlannedNode>,
        List.reverse(&2, Core.PlannedNode, Core.PlannedNode{address, artifact} <> nodes),
        List.append(
          &2,
          Core.PlannedNode,
          List.reverse(&2, Core.PlannedNode, nodes),
          Core.PlannedNode{address, artifact} <> []
        ),
        Prefix.reverse_cons(Core.PlannedNode, Core.PlannedNode{address, artifact}, nodes)
      ):
        {
          Spec.Flat{
            _,
            List.reverse(
              &2,
              Core.ReferenceSlot,
              Core.ReferenceSlot{owner, index, symbol, Core.Expanded{address}} <> slots
            )
          }
          == Spec.Flat{
            List.append(
              &2,
              Core.PlannedNode,
              List.reverse(&2, Core.PlannedNode, nodes),
              Core.PlannedNode{address, artifact} <> []
            ),
            List.append(
              &2,
              Core.ReferenceSlot,
              List.reverse(&2, Core.ReferenceSlot, slots),
              Core.ReferenceSlot{owner, index, symbol, Core.Expanded{address}} <> []
            )
          }
          : Spec.Flat
        }
      %Equal.sym(
        List<&2, Core.ReferenceSlot>,
        List.reverse(
          &2,
          Core.ReferenceSlot,
          Core.ReferenceSlot{owner, index, symbol, Core.Expanded{address}} <> slots
        ),
        List.append(
          &2,
          Core.ReferenceSlot,
          List.reverse(&2, Core.ReferenceSlot, slots),
          Core.ReferenceSlot{owner, index, symbol, Core.Expanded{address}} <> []
        ),
        Prefix.reverse_cons(
          Core.ReferenceSlot,
          Core.ReferenceSlot{owner, index, symbol, Core.Expanded{address}},
          slots
        )
      ):
        {
          Spec.Flat{
            List.append(
              &2,
              Core.PlannedNode,
              List.reverse(&2, Core.PlannedNode, nodes),
              Core.PlannedNode{address, artifact} <> []
            ),
            _
          }
          == Spec.Flat{
            List.append(
              &2,
              Core.PlannedNode,
              List.reverse(&2, Core.PlannedNode, nodes),
              Core.PlannedNode{address, artifact} <> []
            ),
            List.append(
              &2,
              Core.ReferenceSlot,
              List.reverse(&2, Core.ReferenceSlot, slots),
              Core.ReferenceSlot{owner, index, symbol, Core.Expanded{address}} <> []
            )
          }
          : Spec.Flat
        }
      {==}

def ensure_path_from_set(budget: Core.Budget, path: String, set: Map<&2, Bool>) -> Core.Budget:
  CoreTraversal.store_path(budget, path, set)

def ensure_path_exact(+budget: Core.Budget, +path: String) -> {
  CoreTraversal.ensure_path(budget, path) == Spec.ensure_path(budget, path) : Core.Budget
}:
  match budget:
    case Core.Budget{+limits, +targets, +maximum, +work, +graph_work, +depth}:
      Equal.cong(
        Map<&2, Bool>,
        Core.Budget,
        ensure_path_from_set(Core.Budget{limits, targets, maximum, work, graph_work, depth}, path),
        CoreTraversal.target_map(Core.Budget{limits, targets, maximum, work, graph_work, depth}, path),
        Spec.path_set(Core.Budget{limits, targets, maximum, work, graph_work, depth}, path),
        State.target_map_exact(Core.Budget{limits, targets, maximum, work, graph_work, depth}, path)
      )

def enter_state_exact(+machine: Core.Machine, +declaration: Core.Declaration, +depth: Nat) -> {
  State.state(CoreTraversal.enter_node(machine, declaration, depth))
  == Spec.enter(
    State.state(machine),
    CoreTraversal.machine_path(machine),
    CoreTraversal.declaration_identity(declaration)
  )
  : Spec.State
}:
  match machine declaration:
    case Core.Machine{_, +path, _, +visited, +budget, +address, _, _, +pending}
      Core.Declaration{_, +identity, _, _, _}:
      Equal.cong(
        Core.Budget,
        Spec.State,
        State.with_budget(
          Map.set(&2, Bool, visited, identity, True{}),
          (address + 1n : Nat),
          pending
        ),
        CoreTraversal.ensure_path(budget, path),
        Spec.ensure_path(budget, path),
        ensure_path_exact(budget, path)
      )

def join_right(right: Spec.Flat, left: Spec.Flat) -> Spec.Flat:
  Spec.flat_join(left, right)

def expanded_failure(+machine: Core.Machine, +declaration: Core.Declaration,
    +owner: Nat, +index: Nat, +symbol: String, +depth: Nat) -> {
      Spec.flat_join(
        Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth)),
        Spec.FlatFailure{}
      )
      == Spec.flat_join(Prefix.prefix(machine), Spec.FlatFailure{})
      : Spec.Flat
    }:
  match machine declaration:
    case Core.Machine{_, _, _, _, _, _, _, _, _} Core.Declaration{_, _, _, _, _}: {==}

def expanded_join(+machine: Core.Machine, +declaration: Core.Declaration,
    +owner: Nat, +index: Nat, +symbol: String, +depth: Nat, +flat: Spec.Flat) -> {
      Spec.flat_join(
        Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth)),
        flat
      )
      == Spec.flat_join(
        Prefix.prefix(machine),
        Spec.flat_slot(
          Spec.flat_node(flat, CoreTraversal.next_node(machine), declaration_handle(declaration)),
          owner,
          index,
          symbol,
          Core.Expanded{CoreTraversal.next_node(machine)}
        )
      )
      : Spec.Flat
    }:
  match flat:
    case Spec.FlatFailure{}: expanded_failure(machine, declaration, owner, index, symbol, depth)
    case Spec.Flat{+nodes, +slots}:
      Equal.trans(
        Spec.Flat,
        Spec.flat_join(
          Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth)),
          Spec.Flat{nodes, slots}
        ),
        Spec.flat_join(
          Spec.flat_join(
            Prefix.prefix(machine),
            Spec.Flat{
              Core.PlannedNode{CoreTraversal.next_node(machine), declaration_handle(declaration)} <> [],
              Core.ReferenceSlot{owner, index, symbol, Core.Expanded{CoreTraversal.next_node(machine)}} <> []
            }
          ),
          Spec.Flat{nodes, slots}
        ),
        Spec.flat_join(
          Prefix.prefix(machine),
          Spec.flat_slot(
            Spec.flat_node(
              Spec.Flat{nodes, slots},
              CoreTraversal.next_node(machine),
              declaration_handle(declaration)
            ),
            owner,
            index,
            symbol,
            Core.Expanded{CoreTraversal.next_node(machine)}
          )
        ),
        Equal.cong(
          Spec.Flat,
          Spec.Flat,
          join_right(Spec.Flat{nodes, slots}),
          Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth)),
          Spec.flat_join(
            Prefix.prefix(machine),
            Spec.Flat{
              Core.PlannedNode{CoreTraversal.next_node(machine), declaration_handle(declaration)} <> [],
              Core.ReferenceSlot{owner, index, symbol, Core.Expanded{CoreTraversal.next_node(machine)}} <> []
            }
          ),
          expanded_prefix(machine, declaration, owner, index, symbol, depth)
        ),
        Prefix.join_associative(
          Prefix.prefix(machine),
          Spec.Flat{
            Core.PlannedNode{CoreTraversal.next_node(machine), declaration_handle(declaration)} <> [],
            Core.ReferenceSlot{owner, index, symbol, Core.Expanded{CoreTraversal.next_node(machine)}} <> []
          },
          Spec.Flat{nodes, slots}
        )
      )

def continue_flat(state: Spec.State, next: Continuation.Progress -> Relation.Observation,
    flat: Spec.Flat) -> Relation.Observation:
  next(Continuation.Progress{state, flat})

def finish_child_flat(+flat: Spec.Flat, +state: Spec.State, +machine: Core.Machine,
    +declaration: Core.Declaration, +owner: Nat, +index: Nat, +symbol: String, +depth: Nat,
    next: Continuation.Progress -> Relation.Observation) -> {
  Continuation.after_flat(flat, state,
    Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth)), next)
    == Continuation.after_flat(
      Spec.flat_slot(Spec.flat_node(flat, CoreTraversal.next_node(machine), declaration_handle(declaration)),
        owner, index, symbol, Core.Expanded{CoreTraversal.next_node(machine)}),
      state, Prefix.prefix(machine), next) : Relation.Observation
}:
  match flat:
    case Spec.FlatFailure{}: {==}
    case Spec.Flat{+nodes, +slots}:
      Equal.cong(
        Spec.Flat,
        Relation.Observation,
        continue_flat(state, next),
        Spec.flat_join(
          Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth)),
          Spec.Flat{nodes, slots}
        ),
        Spec.flat_join(
          Prefix.prefix(machine),
          Spec.flat_slot(
            Spec.flat_node(
              Spec.Flat{nodes, slots},
              CoreTraversal.next_node(machine),
              declaration_handle(declaration)
            ),
            owner,
            index,
            symbol,
            Core.Expanded{CoreTraversal.next_node(machine)}
          )
        ),
        expanded_join(machine, declaration, owner, index, symbol, depth, Spec.Flat{nodes, slots})
      )

def reference_next(result: Spec.ReferenceResult, flat_fuel: Nat, owner: Nat, index: Nat,
    prefix: Spec.Flat, next: Continuation.Progress -> Relation.Observation) -> Relation.Observation:
  match result:
    case Spec.ReferenceFailure{_}: Relation.Failed{}
    case Spec.ReferenceResult{state, reference}:
      Continuation.after_flat(
        Spec.flat_head(reference, owner, index, Spec.flatten(flat_fuel)),
        state,
        prefix,
        next
      )

def after_child_result(+result: Spec.ReferencesResult, +fuel: Nat, +machine: Core.Machine,
    +declaration: Core.Declaration, +owner: Nat, +index: Nat, +symbol: String, +depth: Nat,
    next: Continuation.Progress -> Relation.Observation) -> {
      Continuation.after_references(
        Spec.ListResult{result},
        CoreTraversal.next_node(machine),
        0n,
        Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth)),
        fuel,
        next
      )
      == reference_next(
        Spec.expanded_result(
          Spec.tree_result(result, CoreTraversal.next_node(machine), declaration_handle(declaration)),
          symbol
        ),
        (1n + fuel : Nat),
        owner,
        index,
        Prefix.prefix(machine),
        next
      )
      : Relation.Observation
    }:
  match result:
    case Spec.ReferencesFailure{_}: {==}
    case Spec.ReferencesResult{+state, +references}:
      finish_child_flat(
        Spec.flatten(fuel, Spec.FlattenReferences{CoreTraversal.next_node(machine), 0n, references}),
        state,
        machine,
        declaration,
        owner,
        index,
        symbol,
        depth,
        next
      )

def after_child_dispatch(+result: Spec.DispatchResult, +fuel: Nat, +machine: Core.Machine,
    +declaration: Core.Declaration, +owner: Nat, +index: Nat, +symbol: String, +depth: Nat,
    next: Continuation.Progress -> Relation.Observation) -> {
  Continuation.after_references(result, CoreTraversal.next_node(machine), 0n,
    Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth)), fuel, next)
    == reference_next(Spec.expanded_result(Spec.tree_result(Spec.as_references(result),
      CoreTraversal.next_node(machine), declaration_handle(declaration)), symbol),
      (1n + fuel : Nat), owner, index, Prefix.prefix(machine), next) : Relation.Observation
}:
  match result:
    case Spec.BuildResult{Spec.Missing{_}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: {==}
    case Spec.BuildResult{Spec.Built{_, _}}: {==}
    case Spec.ListResult{references}:
      after_child_result(references, fuel, machine, declaration, owner, index, symbol, depth, next)

def child_request(+machine: Core.Machine, declaration: Core.Declaration, depth: Nat,
    state: Spec.State) -> Spec.Request:
  match declaration:
    case Core.Declaration{_, _, _, _, children}:
      Spec.ReferencesRequest{children, CoreTraversal.machine_facts(machine), CoreTraversal.machine_path(machine),
        CoreTraversal.next_node(machine), 0n, depth, state}

def walk_at(facts: Core.Facts, path: String, state: Spec.State, depth: Nat, fuel: Nat,
    found: Maybe<&2, Core.Declaration>) -> Spec.Build:
  Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(fuel))

def root_build_exact(
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +depth: Nat,
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Spec.as_build(
        Spec.interpret(
          (1n + fuel : Nat),
          Spec.Request{
            CoreTraversal.machine_facts(machine),
            CoreTraversal.machine_path(machine),
            symbol,
            expected,
            depth,
            State.state(machine)
          }
        )
      )
      == Spec.tree_result(
        Spec.as_references(
          Spec.interpret(
            fuel,
            child_request(
              machine,
              declaration,
              depth,
              Spec.enter(
                State.state(machine),
                CoreTraversal.machine_path(machine),
                CoreTraversal.declaration_identity(declaration)
              )
            )
          )
        ),
        CoreTraversal.next_node(machine),
        declaration_handle(declaration)
      )
      : Spec.Build
    }:
  match machine declaration:
    case Core.Machine{+facts, +path, _, +visited, +budget, +address, _, _, +pending}
      Core.Declaration{+artifact, +identity, +function, +bundled, +children}:
      Equal.cong(
        Maybe<&2, Core.Declaration>,
        Spec.Build,
        walk_at(facts, path, Spec.State{visited, budget, address, pending}, depth, fuel),
        Spec.find_declaration(facts, symbol, expected),
        Some{Core.Declaration{artifact, identity, function, bundled, children}},
        found
      )

def root_result(fuel: Nat, +machine: Core.Machine, symbol: String,
    expected: Core.ExpectedKind, depth: Nat) -> Spec.Build:
  Spec.as_build(
    Spec.interpret(
      fuel,
      Spec.Request{
        CoreTraversal.machine_facts(machine),
        CoreTraversal.machine_path(machine),
        symbol,
        expected,
        depth,
        State.state(machine)
      }
    )
  )

def entered_correspondence(
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +depth: Nat,
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  },
  next: Continuation.Progress -> Relation.Observation
) -> {
      Continuation.after_references(
        Spec.interpret(
          fuel,
          child_request(
            machine,
            declaration,
            depth,
            State.state(CoreTraversal.enter_node(machine, declaration, depth))
          )
        ),
        CoreTraversal.next_node(machine),
        0n,
        Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth)),
        fuel,
        next
      )
      == reference_next(
        Spec.expanded_result(
          root_result((1n + fuel : Nat), machine, symbol, expected, depth),
          symbol
        ),
        (1n + fuel : Nat),
        owner,
        index,
        Prefix.prefix(machine),
        next
      )
      : Relation.Observation
    }:
  %Equal.sym(
    Spec.Build,
    root_result((1n + fuel : Nat), machine, symbol, expected, depth),
    Spec.tree_result(
      Spec.as_references(
        Spec.interpret(
          fuel,
          child_request(
            machine,
            declaration,
            depth,
            Spec.enter(
              State.state(machine),
              CoreTraversal.machine_path(machine),
              CoreTraversal.declaration_identity(declaration)
            )
          )
        )
      ),
      CoreTraversal.next_node(machine),
      declaration_handle(declaration)
    ),
    root_build_exact(fuel, machine, declaration, symbol, expected, depth, found)
  ):
    {
      Continuation.after_references(
        Spec.interpret(
          fuel,
          child_request(
            machine,
            declaration,
            depth,
            State.state(CoreTraversal.enter_node(machine, declaration, depth))
          )
        ),
        CoreTraversal.next_node(machine),
        0n,
        Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth)),
        fuel,
        next
      )
      == reference_next(
        Spec.expanded_result(_, symbol),
        (1n + fuel : Nat),
        owner,
        index,
        Prefix.prefix(machine),
        next
      )
      : Relation.Observation
    }
  %enter_state_exact(machine, declaration, depth):
    {
      Continuation.after_references(
        Spec.interpret(
          fuel,
          child_request(
            machine,
            declaration,
            depth,
            State.state(CoreTraversal.enter_node(machine, declaration, depth))
          )
        ),
        CoreTraversal.next_node(machine),
        0n,
        Prefix.prefix(CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth)),
        fuel,
        next
      )
      == reference_next(
        Spec.expanded_result(
          Spec.tree_result(
            Spec.as_references(Spec.interpret(fuel, child_request(machine, declaration, depth, _))),
            CoreTraversal.next_node(machine),
            declaration_handle(declaration)
          ),
          symbol
        ),
        (1n + fuel : Nat),
        owner,
        index,
        Prefix.prefix(machine),
        next
      )
      : Relation.Observation
    }
  after_child_dispatch(Spec.interpret(fuel, child_request(machine, declaration, depth,
    State.state(CoreTraversal.enter_node(machine, declaration, depth)))), fuel, machine, declaration,
    owner, index, symbol, depth, next)
