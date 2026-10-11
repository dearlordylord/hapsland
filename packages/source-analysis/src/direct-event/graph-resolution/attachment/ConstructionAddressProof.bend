import Base
import ./ConstructionAddressRelation.bend as Relation
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../Types.bend as T
import ../traversal/core.bend as Local
import ../traversal/SPEC.bend as R
import ./ConstructionAllowance.bend as C
import ../RuntimeNatProof.bend as NatFacts
import ../traversal/INTERPRETER_ORDER_PROOF.bend as BoolFacts

# Ordered occurrence/table alignment half of the approved construction case.
# Proofs use actual existing lists; no production representation is changed.
def true_and(+left: Bool, right: Bool,
    same_left: {left == True{} : Bool}, same_right: {right == True{} : Bool})
    -> {Bool.and(left, right) == True{} : Bool}:
  %Equal.sym(Bool, left, True{}, same_left) : {Bool.and(_, right) == True{} : Bool}
  same_right

def route_refl(route: List<&2, Nat>) -> {F.same_route(route, route) == True{} : Bool}:
  match route:
    case Nil{}: {==}
    case Con{+head, +tail}:
      true_and(Nat.is_eq(head, head), F.same_route(tail, tail),
        NatFacts.is_eq_refl(head), route_refl(tail))

def address_refl(address: O.NodeAddress) -> {F.same_address(address, address) == True{} : Bool}:
  match address:
    case O.NodeAddress{+episode, +route}:
      true_and(Nat.is_eq(episode, episode), F.same_route(route, route),
        NatFacts.is_eq_refl(episode), route_refl(route))

def aligned_prefix(+local: Nat, +address: O.NodeAddress, handle: Nat, artifact: T.Artifact,
    +nodes: List<&2, Local.PlannedNode>, +addresses: List<&2, F.AddressEntry>,
    +occurrences: List<&2, F.Node>, references: List<&2, F.Reference>,
    valid: {Relation.aligned(nodes, addresses, occurrences) == True{} : Bool})
    -> {Relation.aligned(Local.PlannedNode{local, handle} <> nodes,
      F.AddressEntry{local, address} <> addresses,
      F.Node{address, artifact, references} <> occurrences) == True{} : Bool}:
  true_and(Nat.is_eq(local, local),
    Bool.and(F.same_address(address, address), Relation.aligned(nodes, addresses, occurrences)),
    NatFacts.is_eq_refl(local),
    true_and(F.same_address(address, address), Relation.aligned(nodes, addresses, occurrences),
      address_refl(address), valid))

def aligned_append(+nodes: List<&2, Local.PlannedNode>,
    +addresses: List<&2, F.AddressEntry>, +occurrences: List<&2, F.Node>,
    +more_nodes: List<&2, Local.PlannedNode>, +more_addresses: List<&2, F.AddressEntry>,
    +more_occurrences: List<&2, F.Node>,
    +left: {Relation.aligned(nodes, addresses, occurrences) == True{} : Bool},
    right: {Relation.aligned(more_nodes, more_addresses, more_occurrences) == True{} : Bool})
    -> {Relation.aligned(List.append(&2, Local.PlannedNode, nodes, more_nodes),
      List.append(&2, F.AddressEntry, addresses, more_addresses),
      List.append(&2, F.Node, occurrences, more_occurrences)) == True{} : Bool}:
  match nodes addresses occurrences:
    case Nil{} Nil{} Nil{}: right
    case Con{Local.PlannedNode{+local, _}, +tail}
        Con{F.AddressEntry{+other, +address}, +rest}
        Con{F.Node{+birth, _, _}, +more}:
      +same_local : {Nat.is_eq(local, other) == True{} : Bool} =
        BoolFacts.eq_true_of_and_left(Nat.is_eq(local, other),
          Bool.and(F.same_address(address, birth), Relation.aligned(tail, rest, more)), left)
      +remaining : {Bool.and(F.same_address(address, birth), Relation.aligned(tail, rest, more))
          == True{} : Bool} =
        BoolFacts.eq_true_of_and_right(Nat.is_eq(local, other),
          Bool.and(F.same_address(address, birth), Relation.aligned(tail, rest, more)), left)
      same_birth : {F.same_address(address, birth) == True{} : Bool} =
        BoolFacts.eq_true_of_and_left(F.same_address(address, birth),
          Relation.aligned(tail, rest, more), remaining)
      tail_valid : {Relation.aligned(tail, rest, more) == True{} : Bool} =
        BoolFacts.eq_true_of_and_right(F.same_address(address, birth),
          Relation.aligned(tail, rest, more), remaining)
      true_and(Nat.is_eq(local, other),
        Bool.and(F.same_address(address, birth),
          Relation.aligned(List.append(&2, Local.PlannedNode, tail, more_nodes),
            List.append(&2, F.AddressEntry, rest, more_addresses),
            List.append(&2, F.Node, more, more_occurrences))), same_local,
        true_and(F.same_address(address, birth),
          Relation.aligned(List.append(&2, Local.PlannedNode, tail, more_nodes),
            List.append(&2, F.AddressEntry, rest, more_addresses),
            List.append(&2, F.Node, more, more_occurrences)), same_birth,
          aligned_append(tail, rest, more, more_nodes, more_addresses, more_occurrences,
            tail_valid, right)))
    case Nil{} Nil{} Con{_, _}:
      Empty.absurd(
        {
          Relation.aligned(
            List.append(&2, Local.PlannedNode, nodes, more_nodes),
            List.append(&2, F.AddressEntry, addresses, more_addresses),
            List.append(&2, F.Node, occurrences, more_occurrences)
          )
          == True{}
          : Bool
        },
        NatFacts.internal_false_ne_true(left)
      )
    case Nil{} Con{_, _} Nil{}:
      Empty.absurd(
        {
          Relation.aligned(
            List.append(&2, Local.PlannedNode, nodes, more_nodes),
            List.append(&2, F.AddressEntry, addresses, more_addresses),
            List.append(&2, F.Node, occurrences, more_occurrences)
          )
          == True{}
          : Bool
        },
        NatFacts.internal_false_ne_true(left)
      )
    case Nil{} Con{_, _} Con{_, _}:
      Empty.absurd(
        {
          Relation.aligned(
            List.append(&2, Local.PlannedNode, nodes, more_nodes),
            List.append(&2, F.AddressEntry, addresses, more_addresses),
            List.append(&2, F.Node, occurrences, more_occurrences)
          )
          == True{}
          : Bool
        },
        NatFacts.internal_false_ne_true(left)
      )
    case Con{_, _} Nil{} Nil{}:
      Empty.absurd(
        {
          Relation.aligned(
            List.append(&2, Local.PlannedNode, nodes, more_nodes),
            List.append(&2, F.AddressEntry, addresses, more_addresses),
            List.append(&2, F.Node, occurrences, more_occurrences)
          )
          == True{}
          : Bool
        },
        NatFacts.internal_false_ne_true(left)
      )
    case Con{_, _} Nil{} Con{_, _}:
      Empty.absurd(
        {
          Relation.aligned(
            List.append(&2, Local.PlannedNode, nodes, more_nodes),
            List.append(&2, F.AddressEntry, addresses, more_addresses),
            List.append(&2, F.Node, occurrences, more_occurrences)
          )
          == True{}
          : Bool
        },
        NatFacts.internal_false_ne_true(left)
      )
    case Con{_, _} Con{_, _} Nil{}:
      Empty.absurd(
        {
          Relation.aligned(
            List.append(&2, Local.PlannedNode, nodes, more_nodes),
            List.append(&2, F.AddressEntry, addresses, more_addresses),
            List.append(&2, F.Node, occurrences, more_occurrences)
          )
          == True{}
          : Bool
        },
        NatFacts.internal_false_ne_true(left)
      )

# Failure remains an explicit separate outcome. This relation only projects
# actual successful pairs; it never establishes their completion or coverage.
def tree_layout(result: F.Construction, flat: R.Flat) -> Bool:
  match result flat:
    case F.Constructed{F.Created{_, occurrences, addresses}} R.Flat{nodes, _}:
      Relation.aligned(nodes, addresses, occurrences)
    case _ _: True{}

def references_layout(result: F.ReferencesResult, flat: R.Flat) -> Bool:
  match result flat:
    case F.ReferencesBuilt{F.References{_, occurrences, addresses}} R.Flat{nodes, _}:
      Relation.aligned(nodes, addresses, occurrences)
    case _ _: True{}

def prefix_layout(+result: F.ReferencesResult, +flat: R.Flat,
    reference: F.Reference, owner: Nat, index: Nat, symbol: String,
    planned: Local.PlannedReference,
    valid: {references_layout(result, flat) == True{} : Bool})
    -> {references_layout(F.reference_prefix(result, reference, [], []),
      R.flat_join(R.Flat{[], [Local.ReferenceSlot{owner, index, symbol, planned}]}, flat))
      == True{} : Bool}:
  match result:
    case F.ReferencesBuilt{F.References{_, _, _}}:
      match flat:
        case R.FlatFailure{}: {==}
        case R.Flat{_, _}: valid
    case F.ReferencesExhausted{}: {==}
    case F.ReferencesInvalid{}: {==}

def constructed_layout(+result: F.ReferencesResult, +flat: R.Flat,
    +address: O.NodeAddress, +local: Nat, handle: Nat, artifact: T.Artifact,
    valid: {references_layout(result, flat) == True{} : Bool})
    -> {tree_layout(F.constructed(result, address, local, artifact),
      R.flat_node(flat, local, handle)) == True{} : Bool}:
  match result:
    case F.ReferencesBuilt{F.References{references, +occurrences, +addresses}}:
      match flat:
        case R.FlatFailure{}: {==}
        case R.Flat{+nodes, _}:
          aligned_prefix(local, address, handle, artifact, nodes, addresses, occurrences,
            references, valid)
    case F.ReferencesExhausted{}: {==}
    case F.ReferencesInvalid{}: {==}

def tree_artifact_layout(recurse: List<&2, R.TreeReference> -> F.ReferencesResult,
    artifact: Maybe<&2, T.Artifact>, +flat: R.Flat, +address: O.NodeAddress,
    +local: Nat, handle: Nat, +references: List<&2, R.TreeReference>,
    valid: {references_layout(recurse(references), flat) == True{} : Bool})
    -> {tree_layout(F.tree_artifact(artifact, address, local, references, recurse),
      R.flat_node(flat, local, handle)) == True{} : Bool}:
  match artifact:
    case None{}: {==}
    case Some{artifact}:
      constructed_layout(recurse(references), flat, address, local, handle, artifact, valid)

def remaining_references(result: F.ReferencesResult) -> Unit -> F.ReferencesResult:
  _ => result

def expanded_layout(+child: F.Construction, +sibling: F.ReferencesResult,
    +flat_child: R.Flat, +flat_sibling: R.Flat, +symbol: String,
    owner: Nat, index: Nat, planned: Local.PlannedReference,
    child_exact: {tree_layout(child, flat_child) == True{} : Bool},
    sibling_exact: {references_layout(sibling, flat_sibling) == True{} : Bool})
    -> {references_layout(F.expanded(child, symbol, remaining_references(sibling)),
      R.flat_join(R.flat_slot(flat_child, owner, index, symbol, planned), flat_sibling))
      == True{} : Bool}:
  match child:
    case F.ConstructionExhausted{}: {==}
    case F.ConstructionInvalid{}: {==}
    case F.Constructed{F.Created{_, +child_nodes, +child_addresses}}:
      match sibling:
        case F.ReferencesExhausted{}: {==}
        case F.ReferencesInvalid{}: {==}
        case F.ReferencesBuilt{F.References{_, +sibling_nodes, +sibling_addresses}}:
          match flat_child:
            case R.FlatFailure{}: {==}
            case R.Flat{+nodes, _}:
              match flat_sibling:
                case R.FlatFailure{}: {==}
                case R.Flat{+more_nodes, _}:
                  aligned_append(nodes, child_addresses, child_nodes,
                    more_nodes, sibling_addresses, sibling_nodes, child_exact, sibling_exact)

def dispatch_layout(result: F.ConstructionDispatch, flat: R.Flat) -> Bool:
  match result:
    case F.TreeResult{result}: tree_layout(result, flat)
    case F.ListResult{result}: references_layout(result, flat)

def as_tree_layout(+result: F.ConstructionDispatch, +flat: R.Flat,
    valid: {dispatch_layout(result, flat) == True{} : Bool})
    -> {tree_layout(F.as_tree(result), flat) == True{} : Bool}:
  match result:
    case F.TreeResult{_}: valid
    case F.ListResult{_}: {==}

def as_references_layout(+result: F.ConstructionDispatch, +flat: R.Flat,
    valid: {dispatch_layout(result, flat) == True{} : Bool})
    -> {references_layout(F.as_references(result), flat) == True{} : Bool}:
  match result:
    case F.TreeResult{_}: {==}
    case F.ListResult{_}: valid

# Both interpreters receive the same request/fuel. Result/error constructors
# remain actual; the relation cannot invent a completed result.
def interpreter_layout(+fuel: Nat, +request: R.FlattenRequest, +episode: Nat,
    +route: List<&2, Nat>, +artifacts: List<&2, T.ArtifactEntry>)
    -> {dispatch_layout(F.construct_interpret(fuel,
      C.construction_request(request, episode, route, artifacts)),
      R.flatten(fuel, request)) == True{} : Bool}:
  match fuel:
    case 0n:
      match request:
        case R.FlattenTree{_}: {==}
        case R.FlattenReferences{_, _, _}: {==}
    case 1n++remaining:
      match request:
        case R.FlattenTree{R.Tree{+local, +handle, +references}}:
          +child : R.FlattenRequest = R.FlattenReferences{local, 0n, references}
          recurse : List<&2, R.TreeReference> -> F.ReferencesResult = items =>
            F.as_references(F.construct_interpret(remaining,
              F.ReferencesRequest{items, 0n, episode, route, artifacts}))
          tree_artifact_layout(
            recurse,
            F.artifact_at(artifacts, handle),
            R.flatten(remaining, child),
            O.NodeAddress{episode, route},
            local,
            handle,
            references,
            as_references_layout(
              F.construct_interpret(
                remaining,
                C.construction_request(child, episode, route, artifacts)
              ),
              R.flatten(remaining, child),
              interpreter_layout(remaining, child, episode, route, artifacts)
            )
          )
        case R.FlattenReferences{_, _, Nil{}}: {==}
        case R.FlattenReferences{+owner, +index, Con{reference, +tail}}:
          match reference:
            case R.TreeReference{+symbol, R.Included{+identity}}:
              +sibling : R.FlattenRequest = R.FlattenReferences{owner, (index + 1n : Nat), tail}
              +converted : F.ReferencesResult = F.as_references(F.construct_interpret(remaining,
                C.construction_request(sibling, episode, route, artifacts)))
              +flat_sibling : R.Flat = R.flatten(remaining, sibling)
              +sibling_exact : {references_layout(converted, flat_sibling) == True{} : Bool} =
                as_references_layout(F.construct_interpret(remaining,
                  C.construction_request(sibling, episode, route, artifacts)), flat_sibling,
                  interpreter_layout(remaining, sibling, episode, route, artifacts))
              prefix_layout(converted, flat_sibling,
                F.Included{F.ReferenceSymbol{symbol}, F.ArtifactIdentity{identity}},
                owner, index, symbol, Local.Included{identity}, sibling_exact)
            case R.TreeReference{+symbol, R.Omitted{+reason, +target}}:
              +sibling : R.FlattenRequest = R.FlattenReferences{owner, (index + 1n : Nat), tail}
              +converted : F.ReferencesResult = F.as_references(F.construct_interpret(remaining,
                C.construction_request(sibling, episode, route, artifacts)))
              +flat_sibling : R.Flat = R.flatten(remaining, sibling)
              +sibling_exact : {references_layout(converted, flat_sibling) == True{} : Bool} =
                as_references_layout(F.construct_interpret(remaining,
                  C.construction_request(sibling, episode, route, artifacts)), flat_sibling,
                  interpreter_layout(remaining, sibling, episode, route, artifacts))
              prefix_layout(converted, flat_sibling,
                F.Omitted{F.ReferenceSymbol{symbol}, F.ReferenceSymbol{target}, reason},
                owner, index, symbol, Local.Omitted{reason, target}, sibling_exact)
            case R.TreeReference{+symbol, R.Expanded{R.Tree{+local, +handle, +references}}}:
              +sibling : R.FlattenRequest = R.FlattenReferences{owner, (index + 1n : Nat), tail}
              +converted : F.ReferencesResult = F.as_references(F.construct_interpret(remaining,
                C.construction_request(sibling, episode, route, artifacts)))
              +flat_sibling : R.Flat = R.flatten(remaining, sibling)
              +sibling_exact : {references_layout(converted, flat_sibling) == True{} : Bool} =
                as_references_layout(F.construct_interpret(remaining,
                  C.construction_request(sibling, episode, route, artifacts)), flat_sibling,
                  interpreter_layout(remaining, sibling, episode, route, artifacts))
              +child : R.FlattenRequest = R.FlattenTree{R.Tree{local, handle, references}}
              +child_route : List<&2, Nat> = List.append(&2, Nat, route, [index])
              expanded_layout(F.as_tree(F.construct_interpret(remaining,
                  C.construction_request(child, episode, child_route, artifacts))),
                converted, R.flatten(remaining, child), flat_sibling, symbol, owner, index,
                Local.Expanded{local},
                as_tree_layout(F.construct_interpret(remaining,
                    C.construction_request(child, episode, child_route, artifacts)),
                  R.flatten(remaining, child),
                  interpreter_layout(remaining, child, episode, child_route, artifacts)),
                sibling_exact)

def construction_order(+fuel: Nat, +tree: R.Tree, +episode: Nat,
    +route: List<&2, Nat>, +artifacts: List<&2, T.ArtifactEntry>,
    +created: F.Created, +nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>,
    constructed: {F.construct(fuel, tree, episode, route, artifacts)
      == F.Constructed{created} : F.Construction},
    flattened: {R.flatten(fuel, R.FlattenTree{tree}) == R.Flat{nodes, slots} : R.Flat})
    -> {Relation.actual_layout(R.Flat{nodes, slots}, created) == True{} : Bool}:
  match created:
    case F.Created{_, _, _}:
      %flattened : {tree_layout(F.Constructed{created}, _) == True{} : Bool}
      %constructed : {tree_layout(_, R.flatten(fuel, R.FlattenTree{tree})) == True{} : Bool}
      as_tree_layout(F.construct_interpret(fuel,
          C.construction_request(R.FlattenTree{tree}, episode, route, artifacts)),
        R.flatten(fuel, R.FlattenTree{tree}),
        interpreter_layout(fuel, R.FlattenTree{tree}, episode, route, artifacts))

def main() -> Unit:
  Unit{}
