import Base
import ./sharing-original-inputs.bend as Inputs
import ./sharing-observed-initial.bend as Initial

# Source-bearing payload provenance accompanies actual Edge queue orders.
# It neither creates an order nor selects the next scheduler entry.
def selected(equal: Bool, edit: Inputs.Edit, rest: Maybe<&2,Inputs.Edit>) -> Maybe<&2,Inputs.Edit>:
  match equal:
    case True{}: Some{edit}
    case False{}: rest

def original(list: List<&2,Initial.QueuedOriginal>, +order: Nat) -> Maybe<&2,Inputs.Edit>:
  match list:
    case Nil{}: None{}
    case Initial.QueuedOriginal{id,edit} <> tail:
      selected(Nat.is_eq(id,order),edit,original(tail,order))

# The caller supplies the actual newly appended queue entries. Decreasing this
# list preserves their original order and avoids inventing a numeric range.
def inherit(list: List<&2,Nat>, +edit: Inputs.Edit,
    originals: List<&2,Initial.QueuedOriginal>) -> List<&2,Initial.QueuedOriginal>:
  match list:
    case Nil{}: originals
    case order <> tail:
      inherit(tail,edit,List.append(&2,Initial.QueuedOriginal,originals,[Initial.QueuedOriginal{order,edit}]))

def appended(orders: List<&2,Nat>, current: Maybe<&2,Inputs.Edit>,
    originals: List<&2,Initial.QueuedOriginal>) -> List<&2,Initial.QueuedOriginal>:
  match current:
    case Some{edit}: inherit(orders,edit,originals)
    case None{}: originals
