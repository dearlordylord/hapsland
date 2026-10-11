import Base
import ../traversal/INTERPRETER_STRING_FACTS.bend as Facts

def claim_0_0(same: {Nat.show(0n) == Nat.show(0n) : String}) -> {0n == 0n : Nat}:
  {==}

def claim_0_1(same: {Nat.show(0n) == Nat.show(1n) : String}) -> {0n == 1n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(0n), _) == True{} : Bool}
    {==}
  Empty.absurd({0n == 1n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_0_2(same: {Nat.show(0n) == Nat.show(9n) : String}) -> {0n == 9n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(0n), _) == True{} : Bool}
    {==}
  Empty.absurd({0n == 9n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_0_3(same: {Nat.show(0n) == Nat.show(10n) : String}) -> {0n == 10n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(0n), _) == True{} : Bool}
    {==}
  Empty.absurd({0n == 10n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_0_4(same: {Nat.show(0n) == Nat.show(11n) : String}) -> {0n == 11n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(0n), _) == True{} : Bool}
    {==}
  Empty.absurd({0n == 11n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_0_5(same: {Nat.show(0n) == Nat.show(99n) : String}) -> {0n == 99n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(0n), _) == True{} : Bool}
    {==}
  Empty.absurd({0n == 99n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_0_6(same: {Nat.show(0n) == Nat.show(100n) : String}) -> {0n == 100n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(0n), _) == True{} : Bool}
    {==}
  Empty.absurd({0n == 100n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_1_0(same: {Nat.show(1n) == Nat.show(0n) : String}) -> {1n == 0n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(1n), _) == True{} : Bool}
    {==}
  Empty.absurd({1n == 0n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_1_1(same: {Nat.show(1n) == Nat.show(1n) : String}) -> {1n == 1n : Nat}:
  {==}

def claim_1_2(same: {Nat.show(1n) == Nat.show(9n) : String}) -> {1n == 9n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(1n), _) == True{} : Bool}
    {==}
  Empty.absurd({1n == 9n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_1_3(same: {Nat.show(1n) == Nat.show(10n) : String}) -> {1n == 10n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(1n), _) == True{} : Bool}
    {==}
  Empty.absurd({1n == 10n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_1_4(same: {Nat.show(1n) == Nat.show(11n) : String}) -> {1n == 11n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(1n), _) == True{} : Bool}
    {==}
  Empty.absurd({1n == 11n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_1_5(same: {Nat.show(1n) == Nat.show(99n) : String}) -> {1n == 99n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(1n), _) == True{} : Bool}
    {==}
  Empty.absurd({1n == 99n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_1_6(same: {Nat.show(1n) == Nat.show(100n) : String}) -> {1n == 100n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(1n), _) == True{} : Bool}
    {==}
  Empty.absurd({1n == 100n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_2_0(same: {Nat.show(9n) == Nat.show(0n) : String}) -> {9n == 0n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(9n), _) == True{} : Bool}
    {==}
  Empty.absurd({9n == 0n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_2_1(same: {Nat.show(9n) == Nat.show(1n) : String}) -> {9n == 1n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(9n), _) == True{} : Bool}
    {==}
  Empty.absurd({9n == 1n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_2_2(same: {Nat.show(9n) == Nat.show(9n) : String}) -> {9n == 9n : Nat}:
  {==}

def claim_2_3(same: {Nat.show(9n) == Nat.show(10n) : String}) -> {9n == 10n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(9n), _) == True{} : Bool}
    {==}
  Empty.absurd({9n == 10n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_2_4(same: {Nat.show(9n) == Nat.show(11n) : String}) -> {9n == 11n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(9n), _) == True{} : Bool}
    {==}
  Empty.absurd({9n == 11n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_2_5(same: {Nat.show(9n) == Nat.show(99n) : String}) -> {9n == 99n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(9n), _) == True{} : Bool}
    {==}
  Empty.absurd({9n == 99n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_2_6(same: {Nat.show(9n) == Nat.show(100n) : String}) -> {9n == 100n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(9n), _) == True{} : Bool}
    {==}
  Empty.absurd({9n == 100n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_3_0(same: {Nat.show(10n) == Nat.show(0n) : String}) -> {10n == 0n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(10n), _) == True{} : Bool}
    {==}
  Empty.absurd({10n == 0n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_3_1(same: {Nat.show(10n) == Nat.show(1n) : String}) -> {10n == 1n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(10n), _) == True{} : Bool}
    {==}
  Empty.absurd({10n == 1n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_3_2(same: {Nat.show(10n) == Nat.show(9n) : String}) -> {10n == 9n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(10n), _) == True{} : Bool}
    {==}
  Empty.absurd({10n == 9n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_3_3(same: {Nat.show(10n) == Nat.show(10n) : String}) -> {10n == 10n : Nat}:
  {==}

def claim_3_4(same: {Nat.show(10n) == Nat.show(11n) : String}) -> {10n == 11n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(10n), _) == True{} : Bool}
    {==}
  Empty.absurd({10n == 11n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_3_5(same: {Nat.show(10n) == Nat.show(99n) : String}) -> {10n == 99n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(10n), _) == True{} : Bool}
    {==}
  Empty.absurd({10n == 99n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_3_6(same: {Nat.show(10n) == Nat.show(100n) : String}) -> {10n == 100n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(10n), _) == True{} : Bool}
    {==}
  Empty.absurd({10n == 100n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_4_0(same: {Nat.show(11n) == Nat.show(0n) : String}) -> {11n == 0n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(11n), _) == True{} : Bool}
    {==}
  Empty.absurd({11n == 0n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_4_1(same: {Nat.show(11n) == Nat.show(1n) : String}) -> {11n == 1n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(11n), _) == True{} : Bool}
    {==}
  Empty.absurd({11n == 1n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_4_2(same: {Nat.show(11n) == Nat.show(9n) : String}) -> {11n == 9n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(11n), _) == True{} : Bool}
    {==}
  Empty.absurd({11n == 9n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_4_3(same: {Nat.show(11n) == Nat.show(10n) : String}) -> {11n == 10n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(11n), _) == True{} : Bool}
    {==}
  Empty.absurd({11n == 10n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_4_4(same: {Nat.show(11n) == Nat.show(11n) : String}) -> {11n == 11n : Nat}:
  {==}

def claim_4_5(same: {Nat.show(11n) == Nat.show(99n) : String}) -> {11n == 99n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(11n), _) == True{} : Bool}
    {==}
  Empty.absurd({11n == 99n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_4_6(same: {Nat.show(11n) == Nat.show(100n) : String}) -> {11n == 100n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(11n), _) == True{} : Bool}
    {==}
  Empty.absurd({11n == 100n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_5_0(same: {Nat.show(99n) == Nat.show(0n) : String}) -> {99n == 0n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(99n), _) == True{} : Bool}
    {==}
  Empty.absurd({99n == 0n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_5_1(same: {Nat.show(99n) == Nat.show(1n) : String}) -> {99n == 1n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(99n), _) == True{} : Bool}
    {==}
  Empty.absurd({99n == 1n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_5_2(same: {Nat.show(99n) == Nat.show(9n) : String}) -> {99n == 9n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(99n), _) == True{} : Bool}
    {==}
  Empty.absurd({99n == 9n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_5_3(same: {Nat.show(99n) == Nat.show(10n) : String}) -> {99n == 10n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(99n), _) == True{} : Bool}
    {==}
  Empty.absurd({99n == 10n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_5_4(same: {Nat.show(99n) == Nat.show(11n) : String}) -> {99n == 11n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(99n), _) == True{} : Bool}
    {==}
  Empty.absurd({99n == 11n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_5_5(same: {Nat.show(99n) == Nat.show(99n) : String}) -> {99n == 99n : Nat}:
  {==}

def claim_5_6(same: {Nat.show(99n) == Nat.show(100n) : String}) -> {99n == 100n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(99n), _) == True{} : Bool}
    {==}
  Empty.absurd({99n == 100n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_6_0(same: {Nat.show(100n) == Nat.show(0n) : String}) -> {100n == 0n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(100n), _) == True{} : Bool}
    {==}
  Empty.absurd({100n == 0n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_6_1(same: {Nat.show(100n) == Nat.show(1n) : String}) -> {100n == 1n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(100n), _) == True{} : Bool}
    {==}
  Empty.absurd({100n == 1n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_6_2(same: {Nat.show(100n) == Nat.show(9n) : String}) -> {100n == 9n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(100n), _) == True{} : Bool}
    {==}
  Empty.absurd({100n == 9n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_6_3(same: {Nat.show(100n) == Nat.show(10n) : String}) -> {100n == 10n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(100n), _) == True{} : Bool}
    {==}
  Empty.absurd({100n == 10n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_6_4(same: {Nat.show(100n) == Nat.show(11n) : String}) -> {100n == 11n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(100n), _) == True{} : Bool}
    {==}
  Empty.absurd({100n == 11n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_6_5(same: {Nat.show(100n) == Nat.show(99n) : String}) -> {100n == 99n : Nat}:
  impossible: {False{} == True{} : Bool} = %same: {String.eq(Nat.show(100n), _) == True{} : Bool}
    {==}
  Empty.absurd({100n == 99n : Nat}, Facts.internal_false_ne_true(impossible))

def claim_6_6(same: {Nat.show(100n) == Nat.show(100n) : String}) -> {100n == 100n : Nat}:
  {==}

def main() -> Unit:
  Unit{}
