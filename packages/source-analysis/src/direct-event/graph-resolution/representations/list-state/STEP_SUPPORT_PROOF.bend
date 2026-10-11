import Base
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_STEP_LAWS.bend as StepSupport
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

def StepSupport.empty_frame_rank_exact(machine, owner, depth, index):
  match machine:
    case Core.Machine{facts, _, +frames, visited, _, _, _, _, _}:
      +base = (2n * Rank.unseen_catalog(visited, Rank.declaration_catalog(facts)) + 2n * Rank.pending_references(
        frames
      ) : Nat)
      +count = List.length(&2, Core.Frame, frames)
      %NatFacts.add_comm(count, 1n):
        {Nat.add(base, _) == Nat.add(Nat.add(base, count), 1n) : Nat}
      %NatFacts.add_assoc(base, count, 1n):
        {_ == Nat.add(Nat.add(base, count), 1n) : Nat}
      {==}

def StepSupport.growth_consumes_two(before, after, growth):
  %NatFacts.add_assoc(before, 1n, 1n):
    {Nat.is_le(Nat.add(after, 1n), _) == True{} : Bool}
  NatFacts.add_le_add_right(after, Nat.add(before, 1n), 1n, growth)
