import Base

# Rule text, source, paths, and Jev responses never enter retained state.
# Native code reports semantic/path/target observations and exact ordered
# IEEE-754 words for finite probabilities in [0, 1].
type Gate is Data:
  Admit{}
  Omit{}

type Target is Data:
  TypeShape{}
  FunctionTarget{}
  UnsupportedTarget{}

type Order is Data:
  Before{}
  Equal{}
  After{}

type ProbabilityWords is Data:
  Words{high: Nat, low: Nat}

def valid_words(word: ProbabilityWords) -> Bool:
  match word:
    case Words{+high, +low}:
      Bool.and(Nat.is_le(low, 4294967295n),
        Bool.and(Nat.is_le(high, 1072693248n),
          Bool.or(Nat.is_lt(high, 1072693248n), Nat.is_eq(low, 0n))))

def enabled(pack_enabled: Bool, rule_enabled: Bool) -> Gate:
  Bool.pick(Gate, Bool.and(pack_enabled, rule_enabled), Admit{}, Omit{})

def target_compatible(target: Target) -> Bool:
  match target:
    case TypeShape{}: True{}
    case FunctionTarget{}: True{}
    case UnsupportedTarget{}: False{}

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

def greater_words(left: ProbabilityWords, right: ProbabilityWords) -> Bool:
  match left right:
    case Words{+left_high, left_low} Words{+right_high, right_low}:
      Bool.or(Nat.is_gt(left_high, right_high),
        Bool.and(Nat.is_eq(left_high, right_high), Nat.is_gt(left_low, right_low)))

def finding(+probability: ProbabilityWords, +threshold: ProbabilityWords) -> Gate:
  Bool.pick(Gate, Bool.and(valid_words(probability),
    Bool.and(valid_words(threshold), greater_words(probability, threshold))),
    Admit{}, Omit{})

def probability_order(+left: ProbabilityWords, +right: ProbabilityWords) -> Order:
  Bool.pick(Order, Bool.and(valid_words(left), valid_words(right)),
    Bool.pick(Order, greater_words(left, right),
      Before{}, Bool.pick(Order,
        greater_words(right, left), After{}, Equal{})), Equal{})

def rank_order_result(order: Order, +left_rank: Nat, +right_rank: Nat) -> Order:
  match order:
    case Before{}: Before{}
    case After{}: After{}
    case Equal{}:
      Bool.pick(Order, Nat.is_lt(left_rank, right_rank), Before{},
        Bool.pick(Order, Nat.is_gt(left_rank, right_rank), After{}, Equal{}))

def rank_order(left: ProbabilityWords, right: ProbabilityWords,
    left_rank: Nat, right_rank: Nat) -> Order:
  rank_order_result(probability_order(left, right),
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

def advice_order(left: ProbabilityWords, right: ProbabilityWords,
    path_order: Order, id_order: Order) -> Order:
  advice_order_result(probability_order(left, right),
    path_order, id_order)

def budget(position: Nat, limit: Nat) -> Gate:
  Bool.pick(Gate, Nat.is_lt(position, limit), Admit{}, Omit{})

def main() -> Gate:
  finding(Words{1n, 1n}, Words{1n, 0n})
