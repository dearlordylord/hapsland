import Base
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_MACHINE_LAWS.bend as MachineLaws
import ./MACHINE_PROOF.bend as MachineProof
import ./RANK_STEP_LAWS.bend as StepSupport
import ./STEP_SUPPORT_PROOF.bend as StepProof
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolFacts

def step_type(machine: Core.Machine) -> Data:
  {Nat.is_le((Rank.rank(Core.step(machine)) + 1n : Nat), Rank.rank(machine)) == True{} : Bool}

law step_decreases_rank:
  for +machine: Core.Machine
  for active: {Core.done(machine) == False{} : Bool}
  {Nat.is_le((Rank.rank(Core.step(machine)) + 1n : Nat), Rank.rank(machine)) == True{} : Bool}


def step_decreases_rank(machine, active):
  match machine:
    case Core.Machine{facts, path, [], visited, budget, next, nodes, references, pending}:
      impossible = BoolFacts.internal_false_ne_true(Equal.sym(Bool, True{}, False{}, active))
      Empty.absurd(
        step_type(Core.Machine{facts, path, [], visited, budget, next, nodes, references, pending}),
        impossible
      )
    case Core.Machine{
      +facts,
      +path,
      Core.Frame{+owner, +depth, +index, []} <> +tail,
      +visited,
      +budget,
      +next,
      +nodes,
      +references,
      +pending
    }:
      +stripped = {Core.Machine{facts, path, tail, visited, budget, next, nodes, references, pending} : Core.Machine}
      +before = Core.push_frame(stripped, Core.Frame{owner, depth, index, []})
      %Equal.sym(
        Nat,
        Rank.rank(before),
        Nat.add(Rank.rank(stripped), 1n),
        StepSupport.empty_frame_rank_exact(stripped, owner, depth, index)
      ):
        {Nat.is_le(Nat.add(Rank.rank(stripped), 1n), _) == True{} : Bool}
      NatFacts.le_refl(Nat.add(Rank.rank(stripped), 1n))
    case Core.Machine{
      +facts,
      +path,
      Core.Frame{+owner, +depth, +index, +reference <> +rest} <> +tail,
      +visited,
      +budget,
      +next,
      +nodes,
      +references,
      +pending
    }:
      +stripped = {Core.Machine{facts, path, tail, visited, budget, next, nodes, references, pending} : Core.Machine}
      +before = Core.push_frame(stripped, Core.Frame{owner, depth, index, reference <> rest})
      +resumed = Core.push_frame(stripped, Core.Frame{owner, depth, (index + 1n : Nat), rest})
      +after = Core.visit_reference(resumed, owner, index, depth, reference)
      consumed = MachineLaws.consuming_reference_rank_exact(
        stripped,
        owner,
        depth,
        index,
        reference,
        rest
      )
      %Equal.sym(Nat, Rank.rank(before), Nat.add(Rank.rank(resumed), 2n), consumed):
        {Nat.is_le(Nat.add(Rank.rank(after), 1n), _) == True{} : Bool}
      StepSupport.growth_consumes_two(
        Rank.rank(resumed),
        Rank.rank(after),
        MachineLaws.visit_reference_rank_bound(resumed, owner, index, depth, reference)
      )
