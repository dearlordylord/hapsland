import Base
import ./Types.bend as T

# Independent binary64 comparison against the accepted 5000ms deadline.
# Nonnegative finite encodings are ordered lexicographically by high/low words.
# The threshold low word is zero. Negative values and either-sign NaNs do not
# expire; positive infinity does. No fixture-specific elapsed-time predicate.
def finite(finite: Bool, high: U32, low: U32) -> Bool:
  match finite:
    case True{}: U32.is_ge(high, 1085507584)
    case False{}: Bool.and(U32.is_eq(high, 2146435072), U32.is_eq(low, 0))

def positive(+high: U32, low: U32) -> Bool:
  finite(U32.is_lt(high, 2146435072), high, low)

def signed(negative: Bool, high: U32, low: U32) -> Bool:
  match negative:
    case True{}: False{}
    case False{}: positive(high, low)

def expired(bits: T.Binary64) -> Bool:
  match bits:
    case T.Binary64{+high, low}:
      signed(U32.is_ge(high, 2147483648), high, low)

def main() -> Unit:
  Unit{}
