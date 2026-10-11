import Base
import ./Types.bend as T

# Native subtraction supplies exact binary64. Positive finite numbers preserve
# numeric order in these bits; exclude NaN and negative encodings explicitly.
def expired(bits: T.Binary64) -> Bool:
  match bits:
    case T.Binary64{+high, low}:
      Bool.and(U32.is_le(high, 2146435072),
        Bool.and(U32.is_ge(high, 1085507584),
          Bool.or(U32.is_lt(high, 2146435072), U32.is_eq(low, 0))))

def main() -> Unit:
  Unit{}
