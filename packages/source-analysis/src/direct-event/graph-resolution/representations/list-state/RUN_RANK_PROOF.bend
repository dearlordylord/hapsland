import Base
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_RUN_LAWS.bend as RunSupport
import ./RUN_SUPPORT_PROOF.bend as RunProof
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

def rank_le(machine: Core.Machine, fuel: Nat) -> Bool:
  Nat.is_le(Rank.rank(machine), fuel)

law run_completes_from_rank:
  for +fuel: Nat
  for +machine: Core.Machine
  for enough: {Nat.is_le(Rank.rank(machine), fuel) == True{} : Bool}
  {Rank.successful(Core.run(fuel, machine)) == True{} : Bool}


def run_completes_from_rank(fuel, machine, enough):
  match fuel:
    case 0n: RunSupport.zero_fuel_completes(machine, enough)
    case 1n++rest:
      continue = {+next => bound => run_completes_from_rank(rest, next, bound) : RunSupport.continuation_type(rest)}
      adjusted = Equal.trans(
        Bool,
        rank_le(machine, Nat.add(rest, 1n)),
        rank_le(machine, Nat.add(1n, rest)),
        True{},
        Equal.cong(
          Nat,
          Bool,
          rank_le(machine),
          Nat.add(rest, 1n),
          Nat.add(1n, rest),
          NatFacts.add_comm(rest, 1n)
        ),
        enough
      )
      RunSupport.run_if_completes(Core.done(machine), machine, rest, {==}, adjusted, continue)
