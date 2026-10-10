import Base
import ./core.bend as Core
import ./RANK.bend as Rank

def continuation_type(+fuel: Nat) -> Type:
  @+next: Core.Machine -> {Nat.is_le(Rank.rank(next), fuel) == True{} : Bool} -> {
    Rank.successful(Core.run(fuel, next))
    == True{}
    : Bool
  }

# A rank bounded by zero cannot contain any pending traversal frame.
law zero_rank_terminal:
  for +machine: Core.Machine
  for enough: {Nat.is_le(Rank.rank(machine), 0n) == True{} : Bool}
  {Core.done(machine) == True{} : Bool}

# One full nonterminal step leaves enough fuel for the strictly smaller run.
law step_fuel_bound:
  for +machine: Core.Machine
  for +fuel: Nat
  for active: {Core.done(machine) == False{} : Bool}
  for enough: {Nat.is_le(Rank.rank(machine), (fuel + 1n : Nat)) == True{} : Bool}
  {Nat.is_le(Rank.rank(Core.step(machine)), fuel) == True{} : Bool}

# A zero-fuel run finishes whenever its rank is bounded by zero.
law zero_fuel_completes:
  for +machine: Core.Machine
  for enough: {Nat.is_le(Rank.rank(machine), 0n) == True{} : Bool}
  {Rank.successful(Core.run(0n, machine)) == True{} : Bool}

# The production run dispatch combines completion or a smaller-fuel continuation.
law run_if_completes:
  for +complete: Bool
  for +machine: Core.Machine
  for +fuel: Nat
  for agreement: {Core.done(machine) == complete : Bool}
  for enough: {Nat.is_le(Rank.rank(machine), (fuel + 1n : Nat)) == True{} : Bool}
  for suffix: continuation_type(fuel)
  {Rank.successful(Core.run_if(complete, machine, next => Core.run(fuel, next))) == True{} : Bool}
