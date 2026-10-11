import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_BOUND_PROOF.bend as Bound
import ./CONTINUATION_FUEL_PROOF.bend as Fuel
import ./CONTINUATION_PREFIX_PROOF.bend as Prefix
import ./CONTINUATION_STATE_PROOF.bend as State
import ./CONTINUATION_CHILD_PROOF.bend as Child
import ./INTERPRETER_ORDER_PROOF.bend as Order
import ./patricia-proof/PATRICIA_RELATION.bend as Patricia

# A proof-only explicit-fuel view of the SAME independent remaining-stack evaluator.
def evaluate(fuel: Nat, machine: Core.Machine) -> Relation.Observation:
  match machine:
    case Core.Machine{facts, path, frames, visited, budget, address, nodes, slots, pending}:
      Continuation.resume(
        frames,
        facts,
        path,
        fuel,
        Continuation.Progress{
          Spec.State{visited, budget, address, pending},
          Spec.Flat{
            List.reverse(&2, Core.PlannedNode, nodes),
            List.reverse(&2, Core.ReferenceSlot, slots)
          }
        }
      )

def adequate_evaluation_exact(
  +fuel: Nat,
  +machine: Core.Machine,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {
    Bound.adequate(CoreTraversal.machine_facts(machine), fuel, State.frames(machine))
    == True{}
    : Bool
  }
) -> {
  evaluate(fuel, machine) == Continuation.observe(machine) : Relation.Observation
}:
  match machine:
    case Core.Machine{
      +facts,
      +path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      Fuel.resume_equal(
        frames,
        facts,
        path,
        fuel,
        Continuation.bound(facts, frames),
        Spec.State{visited, budget, address, pending},
        Spec.Flat{
          List.reverse(&2, Core.PlannedNode, nodes),
          List.reverse(&2, Core.ReferenceSlot, slots)
        },
        valid,
        {==},
        enough,
        Bound.actual_bound_adequate(facts, frames)
      )

def resume_prefix(frames: List<&2, Core.Frame>, facts: Core.Facts, path: String,
    fuel: Nat, state: Spec.State, prefix: Spec.Flat) -> Relation.Observation:
  Continuation.resume(frames, facts, path, fuel, Continuation.Progress{state, prefix})

def empty_frame_evaluation(
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +depth: Nat,
  +index: Nat,
  positive: {Nat.is_le(1n, fuel) == True{} : Bool}
) -> {
  evaluate(fuel, CoreTraversal.push_frame(machine, Core.Frame{owner, depth, index, []}))
    == evaluate(fuel, machine) : Relation.Observation
}:
  match fuel machine:
    case 0n +machine:
      Empty.absurd({evaluate(0n, CoreTraversal.push_frame(machine, Core.Frame{owner, depth, index, []}))
        == evaluate(0n, machine) : Relation.Observation}, Order.internal_false_ne_true(positive))
    case 1n++remaining Core.Machine{
      +facts,
      +path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +state = {Spec.State{visited, budget, address, pending} : Spec.State}
      +prefix = {Spec.Flat{List.reverse(&2, Core.PlannedNode, nodes),
        List.reverse(&2, Core.ReferenceSlot, slots)} : Spec.Flat}
      Equal.cong(Spec.Flat, Relation.Observation,
        resume_prefix(frames, facts, path, (1n + remaining : Nat), state),
        Spec.flat_join(prefix, Spec.Flat{[], []}), prefix, Prefix.join_nil(prefix))

def expanded_evaluation(
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +expected: Core.ExpectedKind,
  +depth: Nat,
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
  evaluate(fuel, CoreTraversal.expand_node(machine, declaration, owner, index, symbol, depth))
    == Child.reference_next(
      Spec.expanded_result(
        Child.root_result((1n + fuel : Nat), machine, symbol, expected, depth),
        symbol
      ),
      (1n + fuel : Nat),
      owner,
      index,
      Prefix.prefix(machine),
      Continuation.resume(
        State.frames(machine),
        CoreTraversal.machine_facts(machine),
        CoreTraversal.machine_path(machine),
        fuel
      )
    )
    : Relation.Observation
}:
  match machine declaration:
    case Core.Machine{+facts, +path, +frames, +visited, +budget, +address, +nodes, +slots, +pending}
      Core.Declaration{+artifact, +identity, +function, +bundled, +children}:
      Child.entered_correspondence(
        fuel,
        Core.Machine{facts, path, frames, visited, budget, address, nodes, slots, pending},
        Core.Declaration{artifact, identity, function, bundled, children},
        owner,
        index,
        symbol,
        expected,
        depth,
        found,
        Continuation.resume(frames, facts, path, fuel)
      )
