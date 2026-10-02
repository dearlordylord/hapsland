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
    case 1n+rest:
      match Random.sample(random, weights):
        case Random.Sampled{next, outcome}: outcome <> draws(rest, next, weights)

def json(values: List<&2, Nat>) -> String:
  match values:
    case Nil{}: ""
    case value <> Nil{}: Nat.show(value)
    case value <> tail: String.append(Nat.show(value), String.append(",", json(tail)))

def row(weights: List<&2, Numeric.Words>) -> String:
  String.append("[", String.append(json(draws(16n, Random.initial(7n), weights)), "]"))

def main() -> IO(Unit):
  IO.print(String.append("[", String.append(
    row(profile(Numeric.Words{1078525952n, 0n}, Numeric.Words{1078525952n, 0n})),
    String.append(",", String.append(
      row(profile(Numeric.Words{0n, 1n}, Numeric.Words{0n, 0n})),
      String.append(",", String.append(
        row(profile(Numeric.Words{1070596096n, 0n}, Numeric.Words{1072168960n, 0n})),
        "]")))))))
