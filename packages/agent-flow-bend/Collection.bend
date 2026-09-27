import Base

# Source-free collection readiness and ordering. The adapter measures elapsed
# time from the host clock and supplies the native cycle and sequence IDs.
type Order is Data:
  Before{}
  Equal{}
  After{}

def order(+left_cycle: Nat, +left_sequence: Nat,
    +right_cycle: Nat, +right_sequence: Nat) -> Order:
  Bool.pick(Order, Nat.is_lt(left_cycle, right_cycle), Before{},
    Bool.pick(Order, Nat.is_gt(left_cycle, right_cycle), After{},
      Bool.pick(Order, Nat.is_lt(left_sequence, right_sequence), Before{},
        Bool.pick(Order, Nat.is_gt(left_sequence, right_sequence), After{}, Equal{}))))

def eligible(already: Bool, turn_end: Bool, cycle_complete: Bool,
    elapsed: Nat, window: Nat) -> Bool:
  Bool.or(already, Bool.or(turn_end,
    Bool.or(cycle_complete, Nat.is_ge(elapsed, window))))

def expired(elapsed: Nat, lifetime: Nat) -> Bool:
  Nat.is_ge(elapsed, lifetime)

def main() -> Bool:
  eligible(False{}, False{}, False{}, 50n, 50n)
