import Base

# Exact approved multiplicity definition; no imported unfilled law.
def copies(count: Nat, -Claim: Type) -> Type:
  match count:
    case 0n: Unit
    case 1n+n: Claim & copies(n, Claim)

def finish_split(-Claim: Type, +left: Nat, +right: Nat, head: Claim,
    parts: copies(left, Claim) & copies(right, Claim)) -> copies(1n+left, Claim) & copies(right, Claim):
  match parts:
    case Tuple{front, rest}: Tuple{Tuple{head, front}, rest}

def split_step(-Claim: Type, +left: Nat, +right: Nat,
    proof: Claim & copies(Nat.add(left, right), Claim),
    recursive: copies(Nat.add(left, right), Claim) -> copies(left, Claim) & copies(right, Claim)) ->
    copies(1n+left, Claim) & copies(right, Claim):
  match proof:
    case Tuple{head, rest}: finish_split(Claim, left, right, head, recursive(rest))

def split(left: Nat, +right: Nat, -Claim: Type, proof: copies(Nat.add(left, right), Claim)) ->
    copies(left, Claim) & copies(right, Claim):
  match left:
    case 0n: Tuple{Unit{}, proof}
    case 1n++remaining:
      split_step(Claim, remaining, right, proof, rest => split(remaining, right, Claim, rest))

def append(left: Nat, +right: Nat, -Claim: Type, front: copies(left, Claim), rest: copies(right, Claim)) ->
    copies(Nat.add(left, right), Claim):
  match left front:
    case 0n Unit{}: rest
    case 1n+remaining Tuple{head, tail}:
      Tuple{head, append(remaining, right, Claim, tail, rest)}

def main() -> Unit:
  Unit{}
