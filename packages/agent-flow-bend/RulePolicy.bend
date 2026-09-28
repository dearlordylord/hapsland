import Base

# Rule text, source, paths, and Jev responses never enter retained state.
# Native code reports semantic/path/target observations and exact ordered
# IEEE-754 words for finite probabilities in [0, 1].
type Gate is Data:
  Admit{}
  Omit{}

type Target is Data:
  DirectTypeShape{}
  LegacyFileTypeShape{}
  OtherTypeShape{}
  FunctionTarget{}

type Order is Data:
  Before{}
  Equal{}
  After{}

def enabled(pack_enabled: Bool, rule_enabled: Bool) -> Gate:
  Bool.pick(Gate, Bool.and(pack_enabled, rule_enabled), Admit{}, Omit{})

def target_compatible(target: Target) -> Bool:
  match target:
    case DirectTypeShape{}: True{}
    case LegacyFileTypeShape{}: True{}
    case OtherTypeShape{}: False{}
    case FunctionTarget{}: False{}

def applicable(consent: Bool, complete: Bool, target: Target,
    global_included: Bool, global_excluded: Bool,
    pack_enabled: Bool, rule_enabled: Bool,
    rule_included: Bool, rule_excluded: Bool,
    semantic_applicable: Bool) -> Gate:
  Bool.pick(Gate, Bool.and(consent, Bool.and(complete,
    Bool.and(target_compatible(target), Bool.and(global_included,
      Bool.and(Bool.not(global_excluded), Bool.and(pack_enabled,
        Bool.and(rule_enabled, Bool.and(rule_included,
          Bool.and(Bool.not(rule_excluded), semantic_applicable))))))))),
    Admit{}, Omit{})

def greater_words(+left_high: Nat, left_low: Nat,
    +right_high: Nat, right_low: Nat) -> Bool:
  Bool.or(Nat.is_gt(left_high, right_high),
    Bool.and(Nat.is_eq(left_high, right_high), Nat.is_gt(left_low, right_low)))

def finding(prob_high: Nat, prob_low: Nat,
    threshold_high: Nat, threshold_low: Nat) -> Gate:
  Bool.pick(Gate, greater_words(prob_high, prob_low,
    threshold_high, threshold_low), Admit{}, Omit{})

def probability_order(+left_high: Nat, +left_low: Nat,
    +right_high: Nat, +right_low: Nat) -> Order:
  Bool.pick(Order, greater_words(left_high, left_low, right_high, right_low),
    Before{}, Bool.pick(Order,
      greater_words(right_high, right_low, left_high, left_low), After{}, Equal{}))

def rank_order_result(order: Order, +left_rank: Nat, +right_rank: Nat) -> Order:
  match order:
    case Before{}: Before{}
    case After{}: After{}
    case Equal{}:
      Bool.pick(Order, Nat.is_lt(left_rank, right_rank), Before{},
        Bool.pick(Order, Nat.is_gt(left_rank, right_rank), After{}, Equal{}))

def rank_order(left_high: Nat, left_low: Nat, right_high: Nat, right_low: Nat,
    left_rank: Nat, right_rank: Nat) -> Order:
  rank_order_result(probability_order(left_high, left_low, right_high, right_low),
    left_rank, right_rank)

def advice_order_result(order: Order, path_order: Order, id_order: Order) -> Order:
  match order:
    case Before{}: Before{}
    case After{}: After{}
    case Equal{}:
      match path_order:
        case Equal{}: id_order
        case Before{}: Before{}
        case After{}: After{}

def advice_order(left_high: Nat, left_low: Nat, right_high: Nat, right_low: Nat,
    path_order: Order, id_order: Order) -> Order:
  advice_order_result(probability_order(left_high, left_low, right_high, right_low),
    path_order, id_order)

def budget(position: Nat, limit: Nat) -> Gate:
  Bool.pick(Gate, Nat.is_lt(position, limit), Admit{}, Omit{})

def main() -> Gate:
  finding(1n, 1n, 1n, 0n)
