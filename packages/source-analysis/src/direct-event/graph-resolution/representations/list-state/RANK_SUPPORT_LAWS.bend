import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank

def weight(seen: Bool, amount: Nat) -> Nat:
  Own.choose(Nat, seen, 0n, next => amount)

# Union can only remove an entry from the unseen inventory.
law weight_of_union_nonincreasing:
  for +seen: Bool
  for +inserted: Bool
  for +amount: Nat
  {Nat.is_le(weight(Bool.or(inserted, seen), amount), weight(seen, amount)) == True{} : Bool}

# Each declaration's structural contribution decreases monotonically on insertion.
law unseen_declaration_nonincreasing:
  for +visited: Own.Dictionary<Bool>
  for +identity: Nat
  for +declaration: Maybe<&2, Core.Declaration>
  {
    Nat.is_le(
      Rank.unseen_declaration(Own.set(Bool, visited, identity, True{}), declaration),
      Rank.unseen_declaration(visited, declaration)
    )
    == True{}
    : Bool
  }
