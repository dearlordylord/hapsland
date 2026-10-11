import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./RANK.bend as Rank
import ./RELATION.bend as Relation
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_MACHINE_PROOF.bend as Machine
import ./CONTINUATION_STEP_COMPOSITION_PROOF.bend as Composition
import ./CONTINUATION_STEP_BOUND_PROOF.bend as Fuel
import ./CONTINUATION_BOUND_PROOF.bend as Bound
import ./CONTINUATION_STATE_PROOF.bend as State
import ./STEP_RANK_PROOF.bend as StepRank
import ./INTERPRETER_ORDER_PROOF.bend as Order
import ./patricia-proof/PATRICIA_RELATION.bend as Patricia

def after_valid(+machine: Core.Machine,
    valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
    active: {CoreTraversal.done(machine) == False{} : Bool}) -> {
  Patricia.canonical(Bool, CoreTraversal.machine_visited(CoreTraversal.step(machine))) == True{} : Bool
}:
  Order.eq_true_of_and_left(Patricia.canonical(Bool, CoreTraversal.machine_visited(CoreTraversal.step(machine))),
    Nat.is_le((Rank.rank(CoreTraversal.step(machine)) + 1n : Nat), Rank.rank(machine)),
    StepRank.step_decreases_preserving_visited(machine, valid, active))

# Exact isolated statement from the approved CONTINUATION_LAWS owner.
law step_preserves_continuation:
  for +machine: Core.Machine
  for valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool}
  {Continuation.observe(CoreTraversal.step(machine)) == Continuation.observe(machine) : Relation.Observation}

def step_preserves_continuation(machine, valid):
  match machine:
    case Core.Machine{_, _, [], _, _, _, _, _, _}: {==}
    case Core.Machine{+facts, +path, Core.Frame{+owner, +depth, +index, []} <> +parents,
      +visited, +budget, +address, +nodes, +slots, +pending}:
      +valid = valid
      +base = {Core.Machine{facts, path, parents, visited, budget, address, nodes, slots, pending} : Core.Machine}
      +machine = CoreTraversal.push_frame(base, Core.Frame{owner, depth, index, []})
      +fuel = Fuel.fuel(machine)
      %Machine.adequate_evaluation_exact(fuel, base, valid, Fuel.after(machine)):
        {_ == Continuation.observe(machine) : Relation.Observation}
      %Machine.adequate_evaluation_exact(fuel, machine, valid, Fuel.before(machine)):
        {Machine.evaluate(fuel, base) == _ : Relation.Observation}
      Equal.sym(Relation.Observation, Machine.evaluate(fuel, machine), Machine.evaluate(fuel, base),
        Machine.empty_frame_evaluation(fuel, base, owner, depth, index, Fuel.positive(machine)))
    case Core.Machine{
      +facts,
      +path,
      Core.Frame{+owner, +depth, +index, +reference <> +items} <> +parents,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +valid = valid
      +base = {Core.Machine{facts, path, parents, visited, budget, address, nodes, slots, pending} : Core.Machine}
      +machine = CoreTraversal.push_frame(base, Core.Frame{owner, depth, index, reference <> items})
      +fuel = Fuel.fuel(machine)
      +cap = Bound.cap(facts, List.length(&2, Core.Reference, reference <> items))
      %Machine.adequate_evaluation_exact(
        fuel,
        CoreTraversal.step(machine),
        after_valid(machine, valid, {==}),
        Fuel.after(machine)
      ):
        {_ == Continuation.observe(machine) : Relation.Observation}
      %Machine.adequate_evaluation_exact(
        (1n + fuel : Nat),
        machine,
        valid,
        Fuel.before_successor(machine)
      ):
        {Machine.evaluate(fuel, CoreTraversal.step(machine)) == _ : Relation.Observation}
      Equal.sym(
        Relation.Observation,
        Machine.evaluate((1n + fuel : Nat), machine),
        Machine.evaluate(fuel, CoreTraversal.step(machine)),
        Composition.nonempty_step_exact(
          base,
          reference,
          items,
          owner,
          index,
          depth,
          fuel,
          valid,
          Fuel.specification(machine),
          Order.eq_true_of_and_left(
            Nat.is_le(cap, (1n + fuel : Nat)),
            Bound.adequate(facts, (1n + fuel : Nat), parents),
            Fuel.before_successor(machine)
          ),
          Order.eq_true_of_and_right(
            Nat.is_le(cap, (1n + fuel : Nat)),
            Bound.adequate(facts, (1n + fuel : Nat), parents),
            Fuel.before_successor(machine)
          ),
          Order.eq_true_of_and_right(
            Nat.is_le(cap, fuel),
            Bound.adequate(facts, fuel, parents),
            Fuel.before(machine)
          )
        )
      )
