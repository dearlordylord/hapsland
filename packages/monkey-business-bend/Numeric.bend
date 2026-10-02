import Base

# Sampler-domain IEEE754 binary64 only: operands/totals <=600, ratios <=1.
# This is not a general float implementation (overflow/infinity are excluded). Two base2^28 limbs keep
# every native intermediate inside immediate Nat; three low bits carry rounding.
type Words is Data:
  Words{high: Nat, low: Nat}
type Limb is Data:
  Limb{high: Nat, low: Nat}
type Value is Data:
  Value{mantissa: Limb, exponent: Nat}

def high(value: Limb) -> Nat:
  match value:
    case Limb{high, _}: high

def low(value: Limb) -> Nat:
  match value:
    case Limb{_, low}: low

def zero(+value: Limb) -> Bool:
  Nat.is_eq(high(value), 0n) && Nat.is_eq(low(value), 0n)

def greater(+a: Limb, +b: Limb) -> Bool:
  Nat.is_gt(high(a), high(b)) || (Nat.is_eq(high(a), high(b)) && Nat.is_gt(low(a), low(b)))

def ge(+a: Limb, +b: Limb) -> Bool:
  Bool.not(greater(b, a))

def add_parts(ah: Nat, bh: Nat, +lo: Nat) -> Limb:
  Limb{(ah + bh + lo / 268435456n : Nat), (lo % 268435456n : Nat)}

def add(a: Limb, b: Limb) -> Limb:
  match a b:
    case Limb{ah, al} Limb{bh, bl}: add_parts(ah, bh, (al + bl : Nat))

def sub_parts(ah: Nat, +al: Nat, bh: Nat, +bl: Nat) -> Limb:
  Limb{(ah - bh - Bool.pick(Nat, Nat.is_lt(al, bl), 1n, 0n) : Nat), ((al + 268435456n - bl : Nat) % 268435456n : Nat)}

def sub(a: Limb, b: Limb) -> Limb:
  match a b:
    case Limb{ah, al} Limb{bh, bl}: sub_parts(ah, al, bh, bl)

def shl(value: Limb) -> Limb:
  match value:
    case Limb{high, +low}: Limb{(high * 2n + low / 134217728n : Nat), (low * 2n % 268435456n : Nat)}

def shr(value: Limb) -> Limb:
  match value:
    case Limb{+high, low}: Limb{(high / 2n : Nat), (low / 2n + (high % 2n : Nat) * 134217728n : Nat)}

def sticky(value: Limb, bit: Bool) -> Limb:
  match value:
    case Limb{high, +low}: Limb{high, (low + Bool.pick(Nat, bit && Nat.is_eq((low % 2n : Nat), 0n), 1n, 0n) : Nat)}

def shr_sticky(+value: Limb) -> Limb:
  sticky(shr(value), Nat.is_eq((low(value) % 2n : Nat), 1n))

def shift_right(count: Nat, value: Limb) -> Limb:
  match count:
    case 0n: value
    case 1n+rest: shift_right(rest, shr_sticky(value))

def bounded_shift(+count: Nat, value: Limb) -> Limb:
  shift_right(Bool.pick(Nat, Nat.is_gt(count, 56n), 56n, count), value)

def normalize_step(done: Bool, +value: Limb, exponent: Nat, rest: Limb -> Nat -> Value) -> Value:
  match done:
    case True{}: Value{value, exponent}
    case False{}: rest(shl(value), (exponent - 1n : Nat))

def normalize(fuel: Nat, +value: Limb, exponent: Nat) -> Value:
  match fuel:
    case 0n: Value{value, exponent}
    case 1n+rest: normalize_step(zero(value) || Nat.is_ge(high(value), 16777216n), value, exponent, v => e => normalize(rest, v, e))

def decoded(+high: Nat, +low: Nat) -> Value:
  normalize(52n, Limb{((high % 1048576n : Nat) * 16n + low / 268435456n + Bool.pick(Nat, Nat.is_eq((high / 1048576n : Nat), 0n), 0n, 16777216n) : Nat), (low % 268435456n : Nat)},
    (2048n + Bool.pick(Nat, Nat.is_eq((high / 1048576n : Nat), 0n), 1n, (high / 1048576n : Nat)) : Nat))

def decode(words: Words) -> Value:
  match words:
    case Words{high, low}: decoded(high, low)

def encoded(+mantissa: Limb, +exponent: Nat) -> Words:
  Words{(Bool.pick(Nat, zero(mantissa) || Nat.is_lt(high(mantissa), 16777216n), 0n, (exponent - 2048n : Nat)) * 1048576n +
    high(mantissa) / 16n % 1048576n : Nat), ((high(mantissa) % 16n : Nat) * 268435456n + low(mantissa) : Nat)}

def increment(value: Limb) -> Limb:
  add(value, Limb{0n, 1n})

def rounded_parts(+mantissa: Limb, exponent: Nat) -> Words:
  encoded(Bool.pick(Limb, Nat.is_ge(high(mantissa), 33554432n), shr(mantissa), mantissa),
    (exponent + Bool.pick(Nat, Nat.is_ge(high(mantissa), 33554432n), 1n, 0n) : Nat))

def rounded(+value: Limb, exponent: Nat) -> Words:
  +base = shr(shr(shr(value)))
  rounded_parts(Bool.pick(Limb, Nat.is_gt((low(value) % 8n : Nat), 4n) ||
    (Nat.is_eq((low(value) % 8n : Nat), 4n) && Nat.is_eq((low(base) % 2n : Nat), 1n)), increment(base), base), exponent)

def round_finite(+value: Limb, +exponent: Nat) -> Words:
  rounded(Bool.pick(Limb, Nat.is_lt(exponent, 2049n), bounded_shift((2049n - exponent : Nat), value), value),
    Bool.pick(Nat, Nat.is_lt(exponent, 2049n), 2049n, exponent))

def add_aligned(+sum: Limb, exponent: Nat) -> Words:
  round_finite(Bool.pick(Limb, Nat.is_ge(high(sum), 268435456n), shr_sticky(sum), sum),
    (exponent + Bool.pick(Nat, Nat.is_ge(high(sum), 268435456n), 1n, 0n) : Nat))

def add_ordered(a: Limb, +ae: Nat, b: Limb, be: Nat) -> Words:
  add_aligned(add(shl(shl(shl(a))), bounded_shift((ae - be : Nat), shl(shl(shl(b))))), ae)

def add_values(a: Value, b: Value) -> Words:
  match a b:
    case Value{+am, +ae} Value{+bm, +be}:
      Bool.pick(Words, zero(am), round_finite(shl(shl(shl(bm))), be), Bool.pick(Words, zero(bm), round_finite(shl(shl(shl(am))), ae),
        Bool.pick(Words, Nat.is_ge(ae, be), add_ordered(am, ae, bm, be), add_ordered(bm, be, am, ae))))

def plus(a: Words, b: Words) -> Words:
  add_values(decode(a), decode(b))

def divide_choose(take: Bool, +remainder: Limb, +denominator: Limb, quotient: Limb, exponent: Nat,
    rest: Limb -> Limb -> Limb -> Nat -> Words) -> Words:
  match take:
    case True{}: rest(sub(remainder, denominator), denominator, add(shl(quotient), Limb{0n, 1n}), exponent)
    case False{}: rest(remainder, denominator, shl(quotient), exponent)

def divide_loop(fuel: Nat, +remainder: Limb, +denominator: Limb, +quotient: Limb, exponent: Nat) -> Words:
  match fuel:
    case 0n: round_finite(sticky(quotient, Bool.not(zero(remainder))), exponent)
    case 1n+rest: divide_choose(ge(shl(remainder), denominator), shl(remainder), denominator, quotient, exponent, r => d => q => e => divide_loop(rest, r, d, q, e))

def divide_start(+numerator: Limb, +denominator: Limb, exponent: Nat) -> Words:
  divide_loop(55n, sub(numerator, denominator), denominator, Limb{0n, 1n}, exponent)

def divide_values(a: Value, b: Value) -> Words:
  match a b:
    case Value{+am, ae} Value{+bm, be}:
      Bool.pick(Words, zero(am), Words{0n, 0n}, divide_start(
        Bool.pick(Limb, greater(bm, am), shl(am), am), bm,
        (ae + 3071n - be - Bool.pick(Nat, greater(bm, am), 1n, 0n) : Nat)))

def divide(a: Words, b: Words) -> Words:
  divide_values(decode(a), decode(b))

def ordered(left: Words, right: Words) -> Bool:
  match left right:
    case Words{+lh, ll} Words{+rh, rl}: Nat.is_lt(lh, rh) || (Nat.is_eq(lh, rh) && Nat.is_lt(ll, rl))

def integer_words(value: Value) -> Words:
  match value:
    case Value{mantissa, exponent}: encoded(mantissa, (exponent - 32n : Nat))

def draw(+word: Nat) -> Words:
  integer_words(normalize(52n, Limb{(word / 268435456n : Nat), (word % 268435456n : Nat)}, 3123n))
