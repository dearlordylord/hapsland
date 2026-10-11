import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_MACHINE_PROOF.bend as Machine
import ./CONTINUATION_REFERENCE_PROOF.bend as Reference
import ./CONTINUATION_DISPATCH_PROOF.bend as Dispatch
import ./CONTINUATION_SEQUENCE_PROOF.bend as Sequence
import ./CONTINUATION_CHILD_PROOF.bend as Child
import ./CONTINUATION_STATE_PROOF.bend as State
import ./CONTINUATION_PREFIX_PROOF.bend as Prefix
import ./INTERPRETER_COMPLETION_RELATION.bend as C
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# Actual first nonempty frame, with the parent's fuel already normalized.
def head_exact(
  +machine: Core.Machine,
  +reference: Core.Reference,
  +items: List<&2, Core.Reference>,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +fuel: Nat,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool}
) -> {
      Continuation.after_references(
        Spec.interpret(
          (1n + fuel : Nat),
          Spec.ReferencesRequest{
            reference <> items,
            CoreTraversal.machine_facts(machine),
            CoreTraversal.machine_path(machine),
            owner,
            index,
            depth,
            State.state(machine)
          }
        ),
        owner,
        index,
        Prefix.prefix(machine),
        (1n + fuel : Nat),
        Continuation.resume(
          State.frames(machine),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          fuel
        )
      )
      == Machine.evaluate(
        fuel,
        CoreTraversal.visit_reference(
          CoreTraversal.push_frame(machine, Core.Frame{owner, depth, (index + 1n : Nat), items}),
          owner,
          index,
          depth,
          reference
        )
      )
      : Relation.Observation
    }:
  match machine:
    case Core.Machine{
      +facts,
      +path,
      +parents,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +state = {Spec.State{visited, budget, address, pending} : Spec.State}
      +prefix = {Spec.Flat{List.reverse(&2, Core.PlannedNode, nodes), List.reverse(&2, Core.ReferenceSlot, slots)} : Spec.Flat}
      +tail = {Core.Machine{facts, path, Core.Frame{owner, depth, (index + 1n : Nat), items} <> parents,
        visited, budget, address, nodes, slots, pending} : Core.Machine}
      +result = Spec.reference(
        reference,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        C.build_child(fuel)
      )
      %Equal.sym(Relation.Observation,
        Machine.evaluate(fuel, CoreTraversal.visit_reference(tail, owner, index, depth, reference)),
        Reference.observation(result, tail, fuel, owner, index),
        Dispatch.visit_exact(reference, fuel, tail, owner, index, depth, valid, enough)):
        {
          Continuation.after_references(
            Spec.interpret(
              (1n + fuel : Nat),
              Spec.ReferencesRequest{reference <> items, facts, path, owner, index, depth, state}
            ),
            owner,
            index,
            prefix,
            (1n + fuel : Nat),
            Continuation.resume(parents, facts, path, fuel)
          )
          == _
          : Relation.Observation
        }
      %Reference.reference_next_exact(result, tail, fuel, owner, index):
        {
          Continuation.after_references(
            Spec.interpret(
              (1n + fuel : Nat),
              Spec.ReferencesRequest{reference <> items, facts, path, owner, index, depth, state}
            ),
            owner,
            index,
            prefix,
            (1n + fuel : Nat),
            Continuation.resume(parents, facts, path, fuel)
          )
          == _
          : Relation.Observation
        }
      Sequence.reference_sequence(
        result,
        fuel,
        owner,
        index,
        depth,
        items,
        facts,
        path,
        parents,
        prefix
      )
