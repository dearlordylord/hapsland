import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

law consuming_reference_rank_exact:
  for +machine: Core.Machine
  for +owner: Nat
  for +depth: Nat
  for +index: Nat
  for reference: Core.Reference
  for +rest: List<&2, Core.Reference>
  {
    Rank.rank(Core.push_frame(machine, Core.Frame{owner, depth, index, reference <> rest}))
    == (Rank.rank(
      Core.push_frame(machine, Core.Frame{owner, depth, (index + 1n : Nat), rest})
    ) + 2n : Nat)
    : Nat
  }

# Exact reference-head consumption; positive rank is separately proved.

def consuming_reference_rank_exact(machine, owner, depth, index, reference, rest):
  match machine:
    case Core.Machine{facts, _, +frames, visited, _, _, _, _, _}:
      +base = Nat.mul(2n, Rank.unseen_catalog(visited, Rank.declaration_catalog(facts)))
      +pending = Nat.add(List.length(&2, Core.Reference, rest), Rank.pending_references(frames))
      +work = Nat.mul(2n, pending)
      +frame_count = Nat.add(1n, List.length(&2, Core.Frame, frames))
      %NatFacts.mul_succ_sym(2n, pending):
        {
          Nat.add(Nat.add(base, _), frame_count)
          == Nat.add(Nat.add(Nat.add(base, work), frame_count), 2n)
          : Nat
        }
      %NatFacts.add_assoc(base, work, 2n):
        {Nat.add(_, frame_count) == Nat.add(Nat.add(Nat.add(base, work), frame_count), 2n) : Nat}
      %NatFacts.add_assoc_sym(Nat.add(base, work), 2n, frame_count):
        {_ == Nat.add(Nat.add(Nat.add(base, work), frame_count), 2n) : Nat}
      %NatFacts.add_comm(frame_count, 2n):
        {
          Nat.add(Nat.add(base, work), _)
          == Nat.add(Nat.add(Nat.add(base, work), frame_count), 2n)
          : Nat
        }
      %NatFacts.add_assoc(Nat.add(base, work), frame_count, 2n):
        {_ == Nat.add(Nat.add(Nat.add(base, work), frame_count), 2n) : Nat}
      {==}
