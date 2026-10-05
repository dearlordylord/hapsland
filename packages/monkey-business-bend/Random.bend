import Base
import ./Numeric.bend as Numeric
import ./Session.bend as Session

type Sampled is Data:
  Sampled{random: U32, outcome: Nat}

def word_bits(fuel: Nat, +value: Nat, acc: U32, +power: U32) -> U32:
  match fuel:
    case 0n: acc
    case 1n+rest: word_bits(rest, (value / 2n : Nat),
      (acc + Bool.pick(U32, Nat.is_eq((value % 2n : Nat), 1n), power, 0) : U32), (power << 1n : U32))

def word(value: Nat) -> U32:
  word_bits(32n, value, 0, 1)

def folded(+seed: Nat) -> U32:
  (word(seed) .^. word((seed / (4294967295n + 1n : Nat) : Nat)) : U32)

def named_initial(seed: Nat, codes: List<&2, U32>) -> U32:
  Session.nonzero(Session.seed_hash(codes, folded(seed)))

def initial(seed: Nat) -> U32:
  named_initial(seed, [106,101,118,45,111,117,116,99,111,109,101,115])

type State is Data:
  State{outcomes: U32, faults: U32}

def streams(+seed: Nat) -> State:
  State{initial(seed), named_initial(seed, [102,97,117,108,116,115])}

def total(weights: List<&2, Numeric.Words>, acc: Numeric.Words) -> Numeric.Words:
  match weights:
    case Nil{}: acc
    case head <> tail: total(tail, Numeric.plus(acc, head))

def weight_nonzero(weight: Numeric.Words) -> Bool:
  match weight:
    case Numeric.Words{high, low}: Nat.is_gt(high, 0n) || Nat.is_gt(low, 0n)

def selected(done: Bool, +index: Nat, draw: Numeric.Words,
    sum: Numeric.Words, cumulative: Numeric.Words, fallback: Nat,
    rest: Numeric.Words -> Numeric.Words -> Numeric.Words -> Nat -> Nat -> Nat) -> Nat:
  match done:
    case True{}: index
    case False{}: rest(draw, sum, cumulative, (index + 1n : Nat), fallback)

def choice_step(+weight: Numeric.Words, +draw: Numeric.Words, +sum: Numeric.Words,
    cumulative: Numeric.Words, +index: Nat, fallback: Nat,
    rest: Numeric.Words -> Numeric.Words -> Numeric.Words -> Nat -> Nat -> Nat) -> Nat:
  +next = Numeric.plus(cumulative, Numeric.divide(weight, sum))
  selected(weight_nonzero(weight) && Numeric.ordered(draw, next), index, draw, sum, next,
    Bool.pick(Nat, weight_nonzero(weight), index, fallback), rest)

def choose(weights: List<&2, Numeric.Words>, draw: Numeric.Words, sum: Numeric.Words,
    cumulative: Numeric.Words, index: Nat, fallback: Nat) -> Nat:
  match weights:
    case Nil{}: fallback
    case weight <> tail: choice_step(weight, draw, sum, cumulative, index, fallback,
      d => s => c => i => f => choose(tail, d, s, c, i, f))

def sampled(+random: U32, +weights: List<&2, Numeric.Words>) -> Sampled:
  Sampled{random, choose(weights, Numeric.draw(U32.to_nat(random)), total(weights, Numeric.Words{0n, 0n}), Numeric.Words{0n, 0n}, 0n, 1n)}

def sample(random: U32, weights: List<&2, Numeric.Words>) -> Sampled:
  sampled(Session.random_step(random), weights)

def outcomes(state: State) -> U32:
  match state:
    case State{outcomes, _}: outcomes

def set_outcomes(state: State, outcomes: U32) -> State:
  match state:
    case State{_, faults}: State{outcomes, faults}
