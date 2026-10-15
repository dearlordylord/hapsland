import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Continuation.bend as K
import ./Joint.bend as J
import ./JointLaws.bend as Laws
import ./ContinuationProof.bend as Bootstrap
import ./ContinuationLaws.bend as BootstrapLaws
import ./PotentialProof.bend as CoreBudget
import ../graph-resolution/RuntimeNatProof.bend as NatEquality
import ./WeightedInventory.bend as W
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N
import ../graph-resolution/traversal/INTERPRETER_NAT_FACTS.bend as NatSub

# Initial exact Spec depth follows from the original catalog inventory plus
# one empty-reference equation per declaration. This is not a caller premise.
def fresh_cap(+already: Bool, +target: M.Declaration) -> N.le(
  W.fresh_weight(~W.specification_weight, already, target), 1n+M.declaration_inventory(target)):
  match already target:
    case True{} target: N.zero_le(1n+M.declaration_inventory(target))
    case False{} M.Declaration{_, _, _, _}: N.le_refl(W.specification_weight(target))

def cap_step(+head: Nat, +tail: Nat, +length: Nat) -> {
  Nat.add(1n+head, Nat.add(tail, length)) == Nat.add(Nat.add(head, tail), 1n+length) : Nat
}:
  Equal.sym(Nat, Nat.add(Nat.add(head, tail), 1n+length), Nat.add(1n+head, Nat.add(tail, length)),
    Equal.trans(Nat, Nat.add(Nat.add(head, tail), 1n+length), Nat.add(Nat.add(head, 1n), Nat.add(tail, length)),
      Nat.add(1n+head, Nat.add(tail, length)), N.add_add_add_comm(head, tail, 1n, length),
      Equal.cong(Nat, Nat, value => Nat.add(value, Nat.add(tail, length)), Nat.add(head, 1n), 1n+head, N.add_comm(head, 1n))))

def declarations_cap(+items: List<&2, M.Declaration>, +expanded: List<&2, String>) -> N.le(
  W.declarations_unvisited(~W.specification_weight, items, expanded),
  Nat.add(M.declarations_inventory(items), List.length(&2, M.Declaration, items))):
  match items:
    case []: {==}
    case +head <> +tail:
      %cap_step(M.declaration_inventory(head), M.declarations_inventory(tail), List.length(&2, M.Declaration, tail)) : N.le(
        W.declarations_unvisited(~W.specification_weight, head <> tail, expanded), _)
      N.add_le_add(W.selected_credit(~W.specification_weight, Some{head}, expanded),
        W.declarations_unvisited(~W.specification_weight, tail, expanded),
        1n+M.declaration_inventory(head), Nat.add(M.declarations_inventory(tail), List.length(&2, M.Declaration, tail)),
        fresh_cap(C.contains(C.declaration_identity(head), expanded), head), declarations_cap(tail, expanded))

def supporting_cap(+items: List<&2, M.Supporting>, +expanded: List<&2, String>) -> N.le(
  W.supporting_unvisited(~W.specification_weight, items, expanded),
  Nat.add(M.supporting_inventory(items), List.length(&2, M.Supporting, items))):
  match items:
    case []: {==}
    case M.Supporting{+key, +head} <> +tail:
      %cap_step(M.declaration_inventory(head), M.supporting_inventory(tail), List.length(&2, M.Supporting, tail)) : N.le(
        W.supporting_unvisited(~W.specification_weight, M.Supporting{key, head} <> tail, expanded), _)
      N.add_le_add(W.selected_credit(~W.specification_weight, Some{head}, expanded),
        W.supporting_unvisited(~W.specification_weight, tail, expanded),
        1n+M.declaration_inventory(head), Nat.add(M.supporting_inventory(tail), List.length(&2, M.Supporting, tail)),
        fresh_cap(C.contains(C.declaration_identity(head), expanded), head), supporting_cap(tail, expanded))

def catalog_cap(+declarations: List<&2, M.Declaration>, +supporting: List<&2, M.Supporting>, +expanded: List<&2, String>) -> N.le(
  W.catalog_unvisited(~W.specification_weight, M.Catalog{declarations, supporting}, expanded),
  Nat.add(Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting)),
    Nat.add(List.length(&2, M.Declaration, declarations), List.length(&2, M.Supporting, supporting)))):
  %N.add_add_add_comm(M.declarations_inventory(declarations), List.length(&2, M.Declaration, declarations),
    M.supporting_inventory(supporting), List.length(&2, M.Supporting, supporting)) : N.le(
    W.catalog_unvisited(~W.specification_weight, M.Catalog{declarations, supporting}, expanded), _)
  N.add_le_add(W.declarations_unvisited(~W.specification_weight, declarations, expanded),
    W.supporting_unvisited(~W.specification_weight, supporting, expanded),
    Nat.add(M.declarations_inventory(declarations), List.length(&2, M.Declaration, declarations)),
    Nat.add(M.supporting_inventory(supporting), List.length(&2, M.Supporting, supporting)),
    declarations_cap(declarations, expanded), supporting_cap(supporting, expanded))

def depth_numeric(+count: Nat, +inventory: Nat, +entries: Nat) -> {
  Nat.sub(Nat.add(Nat.add(1n+count, inventory), 1n+entries), 1n)
  == 1n+Nat.add(count, Nat.add(inventory, entries)) : Nat
}:
  Equal.trans(Nat,
    Nat.sub(Nat.add(Nat.add(1n+count, inventory), 1n+entries), 1n),
    Nat.add(Nat.add(count, inventory), 1n+entries), 1n+Nat.add(count, Nat.add(inventory, entries)),
    NatSub.sub_zero(Nat.add(Nat.add(count, inventory), 1n+entries)),
    Equal.trans(Nat, Nat.add(Nat.add(count, inventory), 1n+entries), 1n+Nat.add(Nat.add(count, inventory), entries),
      1n+Nat.add(count, Nat.add(inventory, entries)), N.add_succ(Nat.add(count, inventory), entries),
      Equal.cong(Nat, Nat, value => 1n+value, Nat.add(Nat.add(count, inventory), entries), Nat.add(count, Nat.add(inventory, entries)),
        N.add_assoc(count, inventory, entries))))

def initial_spec_bound(+count: Nat, +declarations: List<&2, M.Declaration>, +supporting: List<&2, M.Supporting>, +expanded: List<&2, String>) -> N.le(
  1n+Nat.add(count, W.catalog_unvisited(~W.specification_weight, M.Catalog{declarations, supporting}, expanded)),
  Nat.sub(Nat.add(Nat.add(1n+count, Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting))),
    1n+Nat.add(List.length(&2, M.Declaration, declarations), List.length(&2, M.Supporting, supporting))), 1n)):
  %Equal.sym(Nat,
    Nat.sub(Nat.add(Nat.add(1n+count, Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting))),
      1n+Nat.add(List.length(&2, M.Declaration, declarations), List.length(&2, M.Supporting, supporting))), 1n),
    1n+Nat.add(count, Nat.add(Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting)),
      Nat.add(List.length(&2, M.Declaration, declarations), List.length(&2, M.Supporting, supporting)))),
    depth_numeric(count, Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting)),
      Nat.add(List.length(&2, M.Declaration, declarations), List.length(&2, M.Supporting, supporting)))) : N.le(
    1n+Nat.add(count, W.catalog_unvisited(~W.specification_weight, M.Catalog{declarations, supporting}, expanded)), _)
  N.succ_le_succ(Nat.add(count, W.catalog_unvisited(~W.specification_weight, M.Catalog{declarations, supporting}, expanded)),
    Nat.add(count, Nat.add(Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting)),
      Nat.add(List.length(&2, M.Declaration, declarations), List.length(&2, M.Supporting, supporting)))),
    N.add_le_add_left(W.catalog_unvisited(~W.specification_weight, M.Catalog{declarations, supporting}, expanded),
      Nat.add(Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting)),
        Nat.add(List.length(&2, M.Declaration, declarations), List.length(&2, M.Supporting, supporting))), count,
      catalog_cap(declarations, supporting, expanded)))

def Laws.initial_cursor(root, invocation):
  match root invocation:
    case M.Declaration{+slot, +identity, +name, +references} C.Global{M.Catalog{+declarations, +supporting}, +purpose, pending, outcomes, request}:
      ({==}, ({==}, ({==}, (NatEquality.is_eq_refl(slot),
        (CoreBudget.entry_numeric(List.length(&2, M.Reference, references), declarations, supporting, [identity]),
        ((Bootstrap.empty_accumulator(purpose),
          (initial_spec_bound(List.length(&2, M.Reference, references), declarations, supporting, [identity]), Unit{})),
        BootstrapLaws.root_frame_initial(M.Declaration{slot, identity, name, references}, M.Catalog{declarations, supporting}, purpose)))))))

def Laws.initial_step(root, invocation):
  match root invocation:
    case M.Declaration{_, _, _, _} C.Global{M.Catalog{_, _}, _, _, _, _}: {==}

def main() -> Unit:
  Unit{}
