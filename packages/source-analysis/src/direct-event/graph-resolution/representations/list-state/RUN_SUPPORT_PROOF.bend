import Base
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_RUN_LAWS.bend as RunSupport
import ./RANK_MACHINE_LAWS.bend as MachineLaws
import ./MACHINE_PROOF.bend as MachineProof
import ./STEP_RANK_PROOF.bend as Step
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolFacts

def terminal_type(machine: Core.Machine) -> Data:
  {Core.done(machine) == True{} : Bool}

def RunSupport.zero_rank_terminal(machine, enough):
  match machine:
    case Core.Machine{facts, path, [], visited, budget, next, nodes, references, pending}: {==}
    case Core.Machine{
      +facts,
      +path,
      +frame <> +tail,
      +visited,
      +budget,
      +next,
      +nodes,
      +references,
      +pending
    }:
      +original = {Core.Machine{facts, path, frame <> tail, visited, budget, next, nodes, references, pending} : Core.Machine}
      positive = MachineLaws.nonterminal_rank_positive(original, {==})
      not_bound = NatFacts.not_le_of_lt(0n, Rank.rank(original), positive)
      impossible = BoolFacts.internal_false_ne_true(
        Equal.trans(
          Bool,
          False{},
          Nat.is_le(Rank.rank(original), 0n),
          True{},
          Equal.sym(Bool, Nat.is_le(Rank.rank(original), 0n), False{}, not_bound),
          enough
        )
      )
      Empty.absurd(terminal_type(original), impossible)

def RunSupport.step_fuel_bound(machine, fuel, active, enough):
  %NatFacts.add_le_add_iff_right_sym(Rank.rank(Core.step(machine)), fuel, 1n):
    {_ == True{} : Bool}
  NatFacts.le_trans(
    Nat.add(Rank.rank(Core.step(machine)), 1n),
    Rank.rank(machine),
    Nat.add(fuel, 1n),
    Step.step_decreases_rank(machine, active),
    enough
  )

def RunSupport.zero_fuel_completes(machine, enough):
  %Equal.sym(Bool, Core.done(machine), True{}, RunSupport.zero_rank_terminal(machine, enough)):
    {Rank.successful(Core.run_zero(_, machine)) == True{} : Bool}
  {==}

def RunSupport.run_if_completes(complete, machine, fuel, agreement, enough, suffix):
  match complete:
    case True{}: {==}
    case False{}:
      suffix(Core.step(machine), RunSupport.step_fuel_bound(machine, fuel, agreement, enough))
