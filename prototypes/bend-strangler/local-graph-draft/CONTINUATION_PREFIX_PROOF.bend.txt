import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./GRAPH_LIST_FACTS.bend as ListFacts

def reverse_cons(-V: Data, +head: V, +tail: List<&2, V>) -> {
  List.reverse(&2, V, head <> tail)
    == List.append(&2, V, List.reverse(&2, V, tail), head <> []) : List<&2, V>
}:
  ListFacts.reverse_go_spec(&2, V, tail, head <> [])

def join_nil(+flat: Spec.Flat) -> {
  Spec.flat_join(flat, Spec.Flat{[], []}) == flat : Spec.Flat
}:
  match flat:
    case Spec.FlatFailure{}: {==}
    case Spec.Flat{+nodes, +slots}:
      %Equal.sym(List<&2, Core.PlannedNode>, List.append(&2, Core.PlannedNode, nodes, []), nodes,
        ListFacts.append_nil(&2, Core.PlannedNode, nodes)):
        {
          Spec.Flat{_, List.append(&2, Core.ReferenceSlot, slots, [])}
          == Spec.Flat{nodes, slots}
          : Spec.Flat
        }
      %Equal.sym(
        List<&2, Core.ReferenceSlot>,
        List.append(&2, Core.ReferenceSlot, slots, []),
        slots,
        ListFacts.append_nil(&2, Core.ReferenceSlot, slots)
      ):
        {Spec.Flat{nodes, _} == Spec.Flat{nodes, slots} : Spec.Flat}
      {==}

def nil_join(+flat: Spec.Flat) -> {
  Spec.flat_join(Spec.Flat{[], []}, flat) == flat : Spec.Flat
}:
  match flat:
    case Spec.FlatFailure{}: {==}
    case Spec.Flat{_, _}: {==}

def join_associative(+left: Spec.Flat, +middle: Spec.Flat, +right: Spec.Flat) -> {
  Spec.flat_join(Spec.flat_join(left, middle), right)
    == Spec.flat_join(left, Spec.flat_join(middle, right)) : Spec.Flat
}:
  match left middle right:
    case Spec.Flat{+ln, +ls} Spec.Flat{+mn, +ms} Spec.Flat{+rn, +rs}:
      %Equal.sym(List<&2, Core.PlannedNode>,
        List.append(&2, Core.PlannedNode, List.append(&2, Core.PlannedNode, ln, mn), rn),
        List.append(&2, Core.PlannedNode, ln, List.append(&2, Core.PlannedNode, mn, rn)),
        ListFacts.append_assoc(&2, Core.PlannedNode, ln, mn, rn)):
        {
          Spec.Flat{
            _,
            List.append(&2, Core.ReferenceSlot, List.append(&2, Core.ReferenceSlot, ls, ms), rs)
          }
          == Spec.Flat{
            List.append(&2, Core.PlannedNode, ln, List.append(&2, Core.PlannedNode, mn, rn)),
            List.append(&2, Core.ReferenceSlot, ls, List.append(&2, Core.ReferenceSlot, ms, rs))
          }
          : Spec.Flat
        }
      %Equal.sym(List<&2, Core.ReferenceSlot>,
        List.append(&2, Core.ReferenceSlot, List.append(&2, Core.ReferenceSlot, ls, ms), rs),
        List.append(&2, Core.ReferenceSlot, ls, List.append(&2, Core.ReferenceSlot, ms, rs)),
        ListFacts.append_assoc(&2, Core.ReferenceSlot, ls, ms, rs)):
        {
          Spec.Flat{
            List.append(&2, Core.PlannedNode, ln, List.append(&2, Core.PlannedNode, mn, rn)),
            _
          }
          == Spec.Flat{
            List.append(&2, Core.PlannedNode, ln, List.append(&2, Core.PlannedNode, mn, rn)),
            List.append(&2, Core.ReferenceSlot, ls, List.append(&2, Core.ReferenceSlot, ms, rs))
          }
          : Spec.Flat
        }
      {==}
    case Spec.Flat{_, _} Spec.Flat{_, _} Spec.FlatFailure{}: {==}
    case Spec.Flat{_, _} Spec.FlatFailure{} Spec.Flat{_, _}: {==}
    case Spec.Flat{_, _} Spec.FlatFailure{} Spec.FlatFailure{}: {==}
    case Spec.FlatFailure{} Spec.Flat{_, _} Spec.Flat{_, _}: {==}
    case Spec.FlatFailure{} Spec.Flat{_, _} Spec.FlatFailure{}: {==}
    case Spec.FlatFailure{} Spec.FlatFailure{} Spec.Flat{_, _}: {==}
    case Spec.FlatFailure{} Spec.FlatFailure{} Spec.FlatFailure{}: {==}

def prefix(machine: Core.Machine) -> Spec.Flat:
  match machine:
    case Core.Machine{_, _, _, _, _, _, nodes, slots, _}:
      Spec.Flat{
        List.reverse(&2, Core.PlannedNode, nodes),
        List.reverse(&2, Core.ReferenceSlot, slots)
      }

def add_reference_prefix(+machine: Core.Machine, +slot: Core.ReferenceSlot) -> {
  prefix(CoreTraversal.add_reference(machine, slot))
  == Spec.flat_join(prefix(machine), Spec.Flat{[], slot <> []})
  : Spec.Flat
}:
  match machine:
    case Core.Machine{_, _, _, _, _, _, +nodes, +slots, _}:
      %ListFacts.append_nil(&2, Core.PlannedNode, List.reverse(&2, Core.PlannedNode, nodes)):
        {
          Spec.Flat{_, List.reverse(&2, Core.ReferenceSlot, slot <> slots)}
          == Spec.Flat{
            List.append(&2, Core.PlannedNode, List.reverse(&2, Core.PlannedNode, nodes), []),
            List.append(
              &2,
              Core.ReferenceSlot,
              List.reverse(&2, Core.ReferenceSlot, slots),
              slot <> []
            )
          }
          : Spec.Flat
        }
      %Equal.sym(
        List<&2, Core.ReferenceSlot>,
        List.reverse(&2, Core.ReferenceSlot, slot <> slots),
        List.append(
          &2,
          Core.ReferenceSlot,
          List.reverse(&2, Core.ReferenceSlot, slots),
          slot <> []
        ),
        reverse_cons(Core.ReferenceSlot, slot, slots)
      ):
        {
          Spec.Flat{
            List.append(&2, Core.PlannedNode, List.reverse(&2, Core.PlannedNode, nodes), []),
            _
          }
          == Spec.Flat{
            List.append(&2, Core.PlannedNode, List.reverse(&2, Core.PlannedNode, nodes), []),
            List.append(
              &2,
              Core.ReferenceSlot,
              List.reverse(&2, Core.ReferenceSlot, slots),
              slot <> []
            )
          }
          : Spec.Flat
        }
      {==}
