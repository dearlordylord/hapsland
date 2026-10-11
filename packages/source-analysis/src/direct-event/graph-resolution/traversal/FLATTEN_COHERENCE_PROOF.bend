import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./INTERPRETER_MEASURE.bend as Measure
import ./INTERPRETER_ORDER_PROOF.bend as Order

# Internal transports for exact successful full projection equality.
def contract(+left: Nat, +right: Nat) -> Type:
  @+next: Spec.FlattenRequest ->
    {Measure.flat_success(Spec.flatten(left, next)) == True{} : Bool} ->
    {Measure.flat_success(Spec.flatten(right, next)) == True{} : Bool} ->
    {Spec.flatten(left, next) == Spec.flatten(right, next) : Spec.Flat}

def node_input_complete(+flat: Spec.Flat, +address: Nat, +artifact: Nat,
    complete: {Measure.flat_success(Spec.flat_node(flat, address, artifact)) == True{} : Bool}) -> {
  Measure.flat_success(flat) == True{} : Bool
}:
  match flat:
    case Spec.Flat{_, _}: {==}
    case Spec.FlatFailure{}: complete

def slot_input_complete(
  +flat: Spec.Flat,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +reference: Core.PlannedReference,
  complete: {
    Measure.flat_success(Spec.flat_slot(flat, owner, index, symbol, reference))
    == True{}
    : Bool
  }
) -> {
  Measure.flat_success(flat) == True{} : Bool
}:
  match flat:
    case Spec.Flat{_, _}: {==}
    case Spec.FlatFailure{}: complete

def join_left_complete(+left: Spec.Flat, +right: Spec.Flat,
    complete: {Measure.flat_success(Spec.flat_join(left, right)) == True{} : Bool}) -> {
  Measure.flat_success(left) == True{} : Bool
}:
  match left right:
    case Spec.Flat{_, _} Spec.Flat{_, _}: {==}
    case Spec.Flat{_, _} Spec.FlatFailure{}:
      Empty.absurd(
        {Measure.flat_success(left) == True{} : Bool},
        Order.internal_false_ne_true(complete)
      )
    case Spec.FlatFailure{} Spec.Flat{_, _}:
      Empty.absurd(
        {Measure.flat_success(left) == True{} : Bool},
        Order.internal_false_ne_true(complete)
      )
    case Spec.FlatFailure{} Spec.FlatFailure{}: complete

def join_right_complete(+left: Spec.Flat, +right: Spec.Flat,
    complete: {Measure.flat_success(Spec.flat_join(left, right)) == True{} : Bool}) -> {
  Measure.flat_success(right) == True{} : Bool
}:
  match left right:
    case Spec.Flat{_, _} Spec.Flat{_, _}: {==}
    case Spec.Flat{_, _} Spec.FlatFailure{}:
      Empty.absurd(
        {Measure.flat_success(right) == True{} : Bool},
        Order.internal_false_ne_true(complete)
      )
    case Spec.FlatFailure{} Spec.Flat{_, _}:
      Empty.absurd(
        {Measure.flat_success(right) == True{} : Bool},
        Order.internal_false_ne_true(complete)
      )
    case Spec.FlatFailure{} Spec.FlatFailure{}: complete

def outcome_equal(+left: Nat, +right: Nat, +outcome: Spec.Outcome,
    +owner: Nat, +index: Nat, +symbol: String,
    left_complete: {Measure.flat_success(Spec.flat_outcome(outcome, owner, index, symbol,
      Spec.flatten(left))) == True{} : Bool},
    right_complete: {Measure.flat_success(Spec.flat_outcome(outcome, owner, index, symbol,
      Spec.flatten(right))) == True{} : Bool},
    child: contract(left, right)) -> {
  Spec.flat_outcome(outcome, owner, index, symbol, Spec.flatten(left))
    == Spec.flat_outcome(outcome, owner, index, symbol, Spec.flatten(right)) : Spec.Flat
}:
  match outcome:
    case Spec.Included{_}: {==}
    case Spec.Omitted{_, _}: {==}
    case Spec.Expanded{Spec.Tree{+address, +artifact, +references}}:
      +request = {Spec.FlattenTree{Spec.Tree{address, artifact, references}} : Spec.FlattenRequest}
      Equal.cong(Spec.Flat, Spec.Flat,
        value => Spec.flat_slot(value, owner, index, symbol, Core.Expanded{address}),
        Spec.flatten(left, request), Spec.flatten(right, request),
        child(request,
          slot_input_complete(Spec.flatten(left, request), owner, index, symbol,
            Core.Expanded{address}, left_complete),
          slot_input_complete(Spec.flatten(right, request), owner, index, symbol,
            Core.Expanded{address}, right_complete)))

def head_equal(+left: Nat, +right: Nat, +head: Spec.TreeReference,
    +owner: Nat, +index: Nat,
    left_complete: {Measure.flat_success(Spec.flat_head(head, owner, index,
      Spec.flatten(left))) == True{} : Bool},
    right_complete: {Measure.flat_success(Spec.flat_head(head, owner, index,
      Spec.flatten(right))) == True{} : Bool},
    child: contract(left, right)) -> {
  Spec.flat_head(head, owner, index, Spec.flatten(left))
    == Spec.flat_head(head, owner, index, Spec.flatten(right)) : Spec.Flat
}:
  match head:
    case Spec.TreeReference{symbol, outcome}:
      outcome_equal(
        left,
        right,
        outcome,
        owner,
        index,
        symbol,
        left_complete,
        right_complete,
        child
      )

def dispatch_equal(
  +left: Nat,
  +right: Nat,
  +request: Spec.FlattenRequest,
  +left_complete: {Measure.flat_success(Spec.flatten((1n + left : Nat), request)) == True{} : Bool},
  +right_complete: {
    Measure.flat_success(Spec.flatten((1n + right : Nat), request))
    == True{}
    : Bool
  },
  child: contract(left, right),
  sibling: contract(left, right)
) -> {
  Spec.flatten((1n + left : Nat), request) == Spec.flatten((1n + right : Nat), request) : Spec.Flat
}:
  match request:
    case Spec.FlattenTree{Spec.Tree{+address, +artifact, +references}}:
      +next = {Spec.FlattenReferences{address, 0n, references} : Spec.FlattenRequest}
      Equal.cong(Spec.Flat, Spec.Flat, value => Spec.flat_node(value, address, artifact),
        Spec.flatten(left, next), Spec.flatten(right, next),
        child(next,
          node_input_complete(Spec.flatten(left, next), address, artifact, left_complete),
          node_input_complete(Spec.flatten(right, next), address, artifact, right_complete)))
    case Spec.FlattenReferences{_, _, []}: {==}
    case Spec.FlattenReferences{+owner, +index, +head <> +tail}:
      +next = {Spec.FlattenReferences{owner, (index + 1n : Nat), tail} : Spec.FlattenRequest}
      +a = Spec.flat_head(head, owner, index, Spec.flatten(left))
      +b = Spec.flat_head(head, owner, index, Spec.flatten(right))
      +x = Spec.flatten(left, next)
      +y = Spec.flatten(right, next)
      head_exact = head_equal(left, right, head, owner, index,
        join_left_complete(a, x, left_complete), join_left_complete(b, y, right_complete), child)
      tail_exact = sibling(next, join_right_complete(a, x, left_complete),
        join_right_complete(b, y, right_complete))
      %Equal.sym(Spec.Flat, a, b, head_exact):
        {Spec.flat_join(_, x) == Spec.flat_join(b, y) : Spec.Flat}
      %Equal.sym(Spec.Flat, x, y, tail_exact):
        {Spec.flat_join(b, _) == Spec.flat_join(b, y) : Spec.Flat}
      {==}

law successful_flattenings_equal:
  for +left_fuel: Nat
  for +right_fuel: Nat
  for +request: Spec.FlattenRequest
  for left_complete: {
    Measure.flat_success(Spec.flatten(left_fuel, request)) == True{} : Bool
  }
  for right_complete: {
    Measure.flat_success(Spec.flatten(right_fuel, request)) == True{} : Bool
  }
  {Spec.flatten(left_fuel, request) == Spec.flatten(right_fuel, request) : Spec.Flat}

def successful_flattenings_equal(left_fuel, right_fuel, request, left_complete, right_complete):
  match left_fuel right_fuel:
    case 0n +right:
      Empty.absurd({Spec.flatten(0n, request) == Spec.flatten(right, request) : Spec.Flat},
        Order.internal_false_ne_true(left_complete))
    case 1n++left 0n:
      Empty.absurd(
        {Spec.flatten((1n + left : Nat), request) == Spec.flatten(0n, request) : Spec.Flat},
        Order.internal_false_ne_true(right_complete)
      )
    case 1n++left 1n++right:
      dispatch_equal(left, right, request, left_complete, right_complete,
        next => complete_left => complete_right =>
          successful_flattenings_equal(left, right, next, complete_left, complete_right),
        next => complete_left => complete_right =>
          successful_flattenings_equal(left, right, next, complete_left, complete_right))
