import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./NUMERIC_SPEC.bend as Spec
import ./TREE_MACHINE_RELATION.bend as Relation
import ./RANK.bend as Rank

# Independent recursive meaning of the complete remaining production stack.
# Already emitted nodes/slots are a prefix; current child completes before parents.
# No Core.step, production classifier or run loop is used to evaluate the suffix.
type Progress is Data:
  Progress{state: Spec.State, prefix: Spec.Flat}

def frame_inventory(frames: List<&2, Core.Frame>) -> Nat:
  match frames:
    case []: 0n
    case Core.Frame{_, _, _, references} <> rest:
      (List.length(&2, Core.Reference, references) + frame_inventory(rest) : Nat)

def bound(+facts: Core.Facts, +frames: List<&2, Core.Frame>) -> Nat:
  (Relation.spec_bound(facts) + 3n * frame_inventory(frames)
    + 3n * List.length(&2, Core.Frame, frames) : Nat)

def after_flat(flat: Spec.Flat, state: Spec.State, prefix: Spec.Flat,
    next: Progress -> Relation.Observation) -> Relation.Observation:
  match flat:
    case Spec.FlatFailure{}: Relation.Failed{}
    case Spec.Flat{nodes, slots}:
      next(Progress{state, Spec.flat_join(prefix, Spec.Flat{nodes, slots})})

def after_references(result: Spec.DispatchResult, owner: Nat, index: Nat,
    prefix: Spec.Flat, fuel: Nat, next: Progress -> Relation.Observation) -> Relation.Observation:
  match result:
    case Spec.ListResult{Spec.ReferencesResult{state, references}}:
      after_flat(Spec.flatten(fuel, Spec.FlattenReferences{owner, index, references}),
        state, prefix, next)
    case _: Relation.Failed{}

def resume(frames: List<&2, Core.Frame>, +facts: Core.Facts, +path: Nat,
    +fuel: Nat, progress: Progress) -> Relation.Observation:
  match frames progress:
    case [] Progress{state, prefix}: Relation.observe_flat(prefix, state)
    case Core.Frame{+owner, depth, +index, references} <> rest Progress{state, prefix}:
      after_references(
        Spec.interpret(
          fuel,
          Spec.ReferencesRequest{references, facts, path, owner, index, depth, state}
        ),
        owner,
        index,
        prefix,
        fuel,
        resume(rest, facts, path, fuel)
      )

def observe(machine: Core.Machine) -> Relation.Observation:
  match machine:
    case Core.Machine{+facts, path, +frames, visited, budget, address, nodes, slots, pending}:
      resume(
        frames,
        facts,
        path,
        bound(facts, frames),
        Progress{
          Spec.State{visited, budget, address, pending},
          Spec.Flat{
            List.reverse(&2, Core.PlannedNode, nodes),
            List.reverse(&2, Core.ReferenceSlot, slots)
          }
        }
      )

def start(found: Maybe<&2, Core.Declaration>, facts: Core.Facts, path: Nat,
    visited: Own.Dictionary<Bool>, budget: Core.Budget, depth: Nat) -> Relation.Observation:
  match found:
    case None{}: Relation.Absent{visited, budget}
    case Some{declaration}: observe(
      Core.enter_node(Rank.initial(facts, path, visited, budget), declaration, depth)
    )

def initial(+facts: Core.Facts, path: Nat, name: Core.Label, expected: Core.ExpectedKind,
    visited: Own.Dictionary<Bool>, budget: Core.Budget, depth: Nat) -> Relation.Observation:
  start(Spec.find_declaration(facts, name, expected), facts, path, visited, budget, depth)
