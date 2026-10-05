import Base
import ./DefenseNumericOutput.bend as Writer

def repeated(count: Nat) -> List<&2,Nat>:
  match count:
    case 0n: [Nat.add(Nat.mul(65536n,4294967295n),65535n)]
    case 1n++rest: 0n <> repeated(rest)

def main() -> IO(Unit):
  IO.bind(Unit,Unit,Writer.write(Nil{}),_ =>
    IO.bind(Unit,Unit,Writer.write([0n]),_ =>
      IO.bind(Unit,Unit,Writer.write([0n,1n,Nat.add(Nat.mul(65536n,4294967295n),65535n)]),_ =>
        Writer.write(repeated(257n)))))
