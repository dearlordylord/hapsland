import Base
import ./core.bend as Core
import ./RANK.bend as Rank

# An empty frame contributes exactly one rank unit and no pending references.
law empty_frame_rank_exact:
  for +machine: Core.Machine
  for owner: Nat
  for depth: Nat
  for index: Nat
  {
    Rank.rank(Core.push_frame(machine, Core.Frame{owner, depth, index, []}))
    == (Rank.rank(machine) + 1n : Nat)
    : Nat
  }

# Growth by one after consuming two still decreases rank by at least one.
law growth_consumes_two:
  for +before: Nat
  for +after: Nat
  for growth: {Nat.is_le(after, (before + 1n : Nat)) == True{} : Bool}
  {Nat.is_le((after + 1n : Nat), (before + 2n : Nat)) == True{} : Bool}
