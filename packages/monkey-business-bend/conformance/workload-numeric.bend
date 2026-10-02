import Base
import ../Numeric.bend as Numeric
import ../Random.bend as Random

# Original raw IEEE64 weight words, not a JS-normalized CDF or recorded draw.
def profile(finding: Numeric.Words, clear: Numeric.Words) -> List<&2, Numeric.Words>:
  [Numeric.Words{0n, 0n}, finding, clear, Numeric.Words{0n, 0n},
    Numeric.Words{0n, 0n}, Numeric.Words{0n, 0n}]

def draws(fuel: Nat, random: U32, +weights: List<&2, Numeric.Words>) -> List<&2, Nat>:
  match fuel:
    case 0n: []
    case 1n+rest: draw_sample(Random.sample(random, weights), rest, weights)

def draw_sample(sample: Random.Sampled, fuel: Nat, weights: List<&2, Numeric.Words>) -> List<&2, Nat>:
  match sample:
    case Random.Sampled{next, outcome}: outcome <> draws(fuel, next, weights)

def json(values: List<&2, Nat>) -> String:
  match values:
    case Nil{}: ""
    case value <> Nil{}: Nat.show(value)
    case value <> tail: String.append(Nat.show(value), String.append(",", json(tail)))

def row(weights: List<&2, Numeric.Words>) -> String:
  String.append("[", String.append(json(draws(16n, Random.initial(7n), weights)), "]"))

def raw(value: Numeric.Words) -> List<&2, Nat>:
  match value:
    case Numeric.Words{high, low}: [high, low]

def zeros() -> String:
  +words = List.append(&2, Nat,
    raw(Numeric.plus(Numeric.Words{0n, 0n}, Numeric.Words{0n, 1n})),
    raw(Numeric.plus(Numeric.Words{0n, 1n}, Numeric.Words{0n, 0n})))
  String.append("[", String.append(json(words), "]"))

def rounding() -> String:
  +words = List.append(&2, Nat,
    raw(Numeric.plus(Numeric.Words{1072693248n, 0n}, Numeric.Words{1017118720n, 0n})),
    List.append(&2, Nat,
      raw(Numeric.plus(Numeric.Words{1072693248n, 1n}, Numeric.Words{1017118720n, 0n})),
      List.append(&2, Nat,
        raw(Numeric.plus(Numeric.Words{0n, 1n}, Numeric.Words{0n, 1n})),
        raw(Numeric.divide(Numeric.Words{0n, 1n}, Numeric.Words{0n, 1n})))))
  String.append("[", String.append(json(words), "]"))

def main() -> IO(Unit):
  IO.print(String.append("[", String.append(
    row(profile(Numeric.Words{1078525952n, 0n}, Numeric.Words{1078525952n, 0n})),
    String.append(",", String.append(
      row(profile(Numeric.Words{0n, 1n}, Numeric.Words{0n, 0n})),
      String.append(",", String.append(
        row(profile(Numeric.Words{1070596096n, 0n}, Numeric.Words{1072168960n, 0n})),
        String.append(",", String.append(zeros(),
          String.append(",", String.append(rounding(), "]")))))))))))
