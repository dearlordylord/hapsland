import Base
import ./CanonicalJsonPlanLaws.bend as Laws
import ./CanonicalJsonPlan.bend as Plan
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/GRAPH_LIST_FACTS.bend as Lists

def Laws.invalid_absorbing(pending):
  match pending:
    case Nil{}: {==}
    case Con{_, _}: {==}

def Laws.fold_composition(prefix, suffix, state):
  match prefix state:
    case Nil{} Plan.InvalidStack{}: {==}
    case Con{_, _} Plan.InvalidStack{}:
      Equal.sym(
        Plan.Stack,
        Plan.fold(suffix, Plan.InvalidStack{}),
        Plan.InvalidStack{},
        Laws.invalid_absorbing(suffix)
      )
    case Nil{} Plan.ValidStack{_}: {==}
    case Con{head, tail} Plan.ValidStack{stack}:
      Laws.fold_composition(tail, suffix, Plan.operation(head, stack))

# The successor pop uses the same reverse accumulator as the existing list facts.
def popped_accumulator(
  +head: List<&2, Plan.Piece>,
  +tail: List<&2, List<&2, Plan.Piece>>,
  +values: List<&2, List<&2, Plan.Piece>>
) -> {
  List.append(
    &2,
    List<&2, Plan.Piece>,
    List.reverse(&2, List<&2, Plan.Piece>, head <> tail),
    values
  )
  == List.append(
    &2,
    List<&2, Plan.Piece>,
    List.reverse(&2, List<&2, Plan.Piece>, tail),
    head <> values
  )
  : List<&2, List<&2, Plan.Piece>>
}:
  Equal.trans(
    List<&2, List<&2, Plan.Piece>>,
    List.append(
      &2,
      List<&2, Plan.Piece>,
      List.reverse(&2, List<&2, Plan.Piece>, head <> tail),
      values
    ),
    List.reverse.go(&2, List<&2, Plan.Piece>, tail, head <> values),
    List.append(
      &2,
      List<&2, Plan.Piece>,
      List.reverse(&2, List<&2, Plan.Piece>, tail),
      head <> values
    ),
    Equal.sym(
      List<&2, List<&2, Plan.Piece>>,
      List.reverse.go(&2, List<&2, Plan.Piece>, tail, head <> values),
      List.append(
        &2,
        List<&2, Plan.Piece>,
        List.reverse(&2, List<&2, Plan.Piece>, head <> tail),
        values
      ),
      Lists.internal_reverse_go_append(&2, List<&2, Plan.Piece>, tail, [head], values)
    ),
    Lists.reverse_go_spec(&2, List<&2, Plan.Piece>, tail, head <> values)
  )

def Laws.pop_exact(arity, stack, values):
  match arity stack:
    case 0n Nil{}: {==}
    case 0n Con{_, _}: {==}
    case 1n++_ Nil{}: {==}
    case 1n++remaining Con{head, tail}:
      %Equal.sym(
        List<&2, List<&2, Plan.Piece>>,
        List.append(
          &2,
          List<&2, Plan.Piece>,
          List.reverse(
            &2,
            List<&2, Plan.Piece>,
            head <> List.take(&2, List<&2, Plan.Piece>, tail, remaining)
          ),
          values
        ),
        List.append(
          &2,
          List<&2, Plan.Piece>,
          List.reverse(
            &2,
            List<&2, Plan.Piece>,
            List.take(&2, List<&2, Plan.Piece>, tail, remaining)
          ),
          head <> values
        ),
        popped_accumulator(head, List.take(&2, List<&2, Plan.Piece>, tail, remaining), values)
      ):
        {
          Plan.pop(remaining, tail, head <> values)
          == Bool.pick(Plan.Popped,
            Nat.is_gt(remaining, List.length(&2, List<&2, Plan.Piece>, tail)),
            Plan.Underflow{},
            Plan.Popped{_, List.drop(&2, List<&2, Plan.Piece>, tail, remaining)})
          : Plan.Popped
        }
      Laws.pop_exact(remaining, tail, head <> values)

def Laws.primitive_exact(value, stack):
  {==}

def Laws.empty_refused():
  {==}

def Laws.single_root(parts):
  {==}

def Laws.multiple_roots_refused(first, second, rest):
  {==}

def main() -> Unit:
  Unit{}
