import Base
import ./CONSTRUCTION_ALLOWANCE_LAWS.bend as Laws
import ./ConstructionAllowance.bend as C
import ../traversal/SPEC.bend as R
import ../traversal/core.bend as Local
import ../traversal/INTERPRETER_ORDER_PROOF.bend as Order
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../Types.bend as T

def tree_safe(value: F.Construction) -> Bool:
  C.not_exhausted(F.TreeResult{value})

def refs_safe(value: F.ReferencesResult) -> Bool:
  C.not_exhausted(F.ListResult{value})

def as_tree_safe(+result: F.ConstructionDispatch,
    complete: {C.not_exhausted(result) == True{} : Bool}) -> {
  tree_safe(F.as_tree(result)) == True{} : Bool
}:
  match result:
    case F.TreeResult{_}: complete
    case F.ListResult{_}: {==}

def as_refs_safe(+result: F.ConstructionDispatch,
    complete: {C.not_exhausted(result) == True{} : Bool}) -> {
  refs_safe(F.as_references(result)) == True{} : Bool
}:
  match result:
    case F.ListResult{_}: complete
    case F.TreeResult{_}: {==}

def constructed_safe(+result: F.ReferencesResult, +address: O.NodeAddress,
    +local: Nat, +artifact: T.Artifact,
    complete: {refs_safe(result) == True{} : Bool}) -> {
  tree_safe(F.constructed(result, address, local, artifact)) == True{} : Bool
}:
  match result:
    case F.ReferencesBuilt{F.References{_, _, _}}: {==}
    case F.ReferencesInvalid{}: {==}
    case F.ReferencesExhausted{}: complete

def prefix_safe(+result: F.ReferencesResult, +reference: F.Reference,
    +nodes: List<&2, F.Node>, +addresses: List<&2, F.AddressEntry>,
    complete: {refs_safe(result) == True{} : Bool}) -> {
  refs_safe(F.reference_prefix(result, reference, nodes, addresses)) == True{} : Bool
}:
  match result:
    case F.ReferencesBuilt{F.References{_, _, _}}: {==}
    case F.ReferencesInvalid{}: {==}
    case F.ReferencesExhausted{}: complete

def node_input_complete(+flat: R.Flat, +address: Nat, +artifact: Nat,
    complete: {C.flatten_success(R.flat_node(flat, address, artifact)) == True{} : Bool}) -> {
  C.flatten_success(flat) == True{} : Bool
}:
  match flat:
    case R.Flat{_, _}: {==}
    case R.FlatFailure{}: complete

def slot_input_complete(
  +flat: R.Flat,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +reference: Local.PlannedReference,
  complete: {C.flatten_success(R.flat_slot(flat, owner, index, symbol, reference)) == True{} : Bool}
) -> {
      C.flatten_success(flat)
      == True{}
      : Bool
    }:
  match flat:
    case R.Flat{_, _}: {==}
    case R.FlatFailure{}: complete

def join_left_complete(+left: R.Flat, +right: R.Flat,
    complete: {C.flatten_success(R.flat_join(left, right)) == True{} : Bool}) -> {
  C.flatten_success(left) == True{} : Bool
}:
  match left right:
    case R.Flat{_, _} R.Flat{_, _}: {==}
    case R.Flat{_, _} R.FlatFailure{}:
      Empty.absurd(
        {C.flatten_success(left) == True{} : Bool},
        Order.internal_false_ne_true(complete)
      )
    case R.FlatFailure{} _: complete

def join_right_complete(+left: R.Flat, +right: R.Flat,
    complete: {C.flatten_success(R.flat_join(left, right)) == True{} : Bool}) -> {
  C.flatten_success(right) == True{} : Bool
}:
  match left right:
    case R.Flat{_, _} R.Flat{_, _}: {==}
    case R.FlatFailure{} R.Flat{_, _}:
      Empty.absurd(
        {C.flatten_success(right) == True{} : Bool},
        Order.internal_false_ne_true(complete)
      )
    case _ R.FlatFailure{}: complete

def contract(+fuel: Nat) -> Type:
  @+request: R.FlattenRequest -> @episode: Nat -> @route: List<&2, Nat> ->
    @artifacts: List<&2, T.ArtifactEntry> ->
    {C.flatten_success(R.flatten(fuel, request)) == True{} : Bool} ->
    {C.not_exhausted(F.construct_interpret(fuel,
      C.construction_request(request, episode, route, artifacts))) == True{} : Bool}

def expanded_safe(remaining: Unit -> F.ReferencesResult,
    +result: F.Construction, +symbol: String,
    child_safe: {tree_safe(result) == True{} : Bool},
    tail_safe: {refs_safe(remaining(Unit{})) == True{} : Bool}) -> {
  refs_safe(F.expanded(result, symbol, remaining)) == True{} : Bool
}:
  match result:
    case F.Constructed{F.Created{root, nodes, addresses}}:
      prefix_safe(remaining(Unit{}), F.Expanded{F.ReferenceSymbol{symbol}, root},
        nodes, addresses, tail_safe)
    case F.ConstructionInvalid{}: {==}
    case F.ConstructionExhausted{}: child_safe

def tree_artifact_safe(
    recurse: List<&2, R.TreeReference> -> F.ReferencesResult,
    +found: Maybe<&2, T.Artifact>, +address: O.NodeAddress,
    +local: Nat, +references: List<&2, R.TreeReference>,
    complete: {refs_safe(recurse(references)) == True{} : Bool}) -> {
  tree_safe(F.tree_artifact(found, address, local, references, recurse)) == True{} : Bool
}:
  match found:
    case None{}: {==}
    case Some{artifact}: constructed_safe(recurse(references), address, local, artifact, complete)

def head_safe(
  remaining: Unit -> F.ReferencesResult,
  +fuel: Nat,
  +head: R.TreeReference,
  +owner: Nat,
  +index: Nat,
  +episode: Nat,
  +route: List<&2, Nat>,
  +artifacts: List<&2, T.ArtifactEntry>,
  complete: {C.flatten_success(R.flat_head(head, owner, index, R.flatten(fuel))) == True{} : Bool},
  tail_safe: {refs_safe(remaining(Unit{})) == True{} : Bool},
  child: contract(fuel)
) -> {
  refs_safe(F.converted_reference(head,
    tree => F.as_tree(F.construct_interpret(fuel,
      F.TreeRequest{tree, episode, List.append(&2, Nat, route, [index]), artifacts})),
    remaining)) == True{} : Bool
}:
  match head:
    case R.TreeReference{symbol, R.Included{identity}}:
      prefix_safe(
        remaining(Unit{}),
        F.Included{F.ReferenceSymbol{symbol}, F.ArtifactIdentity{identity}},
        [],
        [],
        tail_safe
      )
    case R.TreeReference{symbol, R.Omitted{reason, target}}:
      prefix_safe(
        remaining(Unit{}),
        F.Omitted{F.ReferenceSymbol{symbol}, F.ReferenceSymbol{target}, reason},
        [],
        [],
        tail_safe
      )
    case R.TreeReference{+symbol, R.Expanded{R.Tree{+address, +handle, +refs}}}:
      +tree : R.Tree = R.Tree{address, handle, refs}
      +request : R.FlattenRequest = R.FlattenTree{tree}
      +nested_route = List.append(&2, Nat, route, [index])
      +result = F.construct_interpret(fuel, F.TreeRequest{tree, episode, nested_route, artifacts})
      expanded_safe(remaining, F.as_tree(result), symbol,
        as_tree_safe(result, child(request, episode, nested_route, artifacts,
          slot_input_complete(R.flatten(fuel, request), owner, index, symbol,
            Local.Expanded{address}, complete))), tail_safe)

def dispatch_safe(+fuel: Nat, +request: R.FlattenRequest,
    +episode: Nat, +route: List<&2, Nat>, +artifacts: List<&2, T.ArtifactEntry>,
    +complete: {C.flatten_success(R.flatten((1n + fuel : Nat), request)) == True{} : Bool},
    child: contract(fuel), sibling: contract(fuel)) -> {
  C.not_exhausted(F.construct_interpret((1n + fuel : Nat),
    C.construction_request(request, episode, route, artifacts))) == True{} : Bool
}:
  match request:
    case R.FlattenTree{R.Tree{+address, +handle, +refs}}:
      +next : R.FlattenRequest = R.FlattenReferences{address, 0n, refs}
      +result = F.construct_interpret(
        fuel,
        F.ReferencesRequest{refs, 0n, episode, route, artifacts}
      )
      tree_artifact_safe(
        items => F.as_references(F.construct_interpret(fuel,
          F.ReferencesRequest{items, 0n, episode, route, artifacts})),
        F.artifact_at(artifacts, handle), O.NodeAddress{episode, route}, address, refs,
        as_refs_safe(result, child(next, episode, route, artifacts,
          node_input_complete(R.flatten(fuel, next), address, handle, complete))))
    case R.FlattenReferences{_, _, []}: {==}
    case R.FlattenReferences{+owner, +index, +head <> +tail}:
      +next : R.FlattenRequest = R.FlattenReferences{owner, (index + 1n : Nat), tail}
      +head_flat = R.flat_head(head, owner, index, R.flatten(fuel))
      +tail_flat = R.flatten(fuel, next)
      +tail_result = F.construct_interpret(fuel,
        F.ReferencesRequest{tail, (index + 1n : Nat), episode, route, artifacts})
      head_safe(_ => F.as_references(tail_result), fuel, head, owner, index,
        episode, route, artifacts, join_left_complete(head_flat, tail_flat, complete),
        as_refs_safe(tail_result, sibling(next, episode, route, artifacts,
          join_right_complete(head_flat, tail_flat, complete))), child)

def Laws.successful_flatten_preserves_construction_allowance(
    fuel, request, episode, route, artifacts, adequate):
  match fuel:
    case 0n:
      Empty.absurd({C.not_exhausted(F.construct_interpret(0n,
        C.construction_request(request, episode, route, artifacts))) == True{} : Bool},
        Order.internal_false_ne_true(adequate))
    case 1n++fuel:
      dispatch_safe(fuel, request, episode, route, artifacts, adequate,
        next => episode => route => artifacts => complete =>
          Laws.successful_flatten_preserves_construction_allowance(
            fuel, next, episode, route, artifacts, complete),
        next => episode => route => artifacts => complete =>
          Laws.successful_flatten_preserves_construction_allowance(
            fuel, next, episode, route, artifacts, complete))

def main() -> Unit:
  Unit{}
