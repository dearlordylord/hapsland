import Base
import ./AttachmentNaturalKeyProof.bend as Keys
import ../traversal/INTERPRETER_STRING_FACTS.bend as Strings
import ../traversal/INTERPRETER_NAT_FACTS.bend as NatFacts
import ./AttachmentNaturalArithmeticFacts.bend as N

def nat_true_of_same(+left: Nat, +right: Nat, same: {left == right : Nat}) ->
    {Nat.is_eq(left, right) == True{} : Bool}:
  %same: {Nat.is_eq(left, _) == True{} : Bool}
  N.is_eq_refl(left)

def string_true_of_same(+left: Nat, +right: Nat, same: {left == right : Nat}) ->
    {String.eq(Nat.show(left), Nat.show(right)) == True{} : Bool}:
  %Equal.cong(Nat, String, number => Nat.show(number), left, right, same):
    {String.eq(Nat.show(left), _) == True{} : Bool}
  Strings.eq_refl(Nat.show(left))

def equality_case(+left: Nat, +right: Nat, string_equal: Bool, nat_equal: Bool,
    string_test: {String.eq(Nat.show(left), Nat.show(right)) == string_equal : Bool},
    nat_test: {Nat.is_eq(left, right) == nat_equal : Bool}) -> {string_equal == nat_equal : Bool}:
  match string_equal nat_equal:
    case True{} True{}: {==}
    case False{} False{}: {==}
    case True{} False{}:
      Empty.absurd({True{} == False{} : Bool}, Strings.internal_false_ne_true(
        Equal.trans(Bool, False{}, Nat.is_eq(left, right), True{},
          Equal.sym(Bool, Nat.is_eq(left, right), False{}, nat_test),
          nat_true_of_same(left, right,
            Keys.natural_key_injective(left, right, Strings.eq_of_eq_true(Nat.show(left), Nat.show(right), string_test))))))
    case False{} True{}:
      Empty.absurd({False{} == True{} : Bool}, Strings.internal_false_ne_true(
        Equal.trans(Bool, False{}, String.eq(Nat.show(left), Nat.show(right)), True{},
          Equal.sym(Bool, String.eq(Nat.show(left), Nat.show(right)), False{}, string_test),
          string_true_of_same(left, right, NatFacts.eq_of_is_eq(left, right, nat_test)))))

law natural_key_equality:
  for +left: Nat
  for +right: Nat
  {String.eq(Nat.show(left), Nat.show(right)) == Nat.is_eq(left, right) : Bool}

def natural_key_equality(left, right):
  equality_case(left, right, String.eq(Nat.show(left), Nat.show(right)), Nat.is_eq(left, right), {==}, {==})

def main() -> Unit:
  Unit{}
