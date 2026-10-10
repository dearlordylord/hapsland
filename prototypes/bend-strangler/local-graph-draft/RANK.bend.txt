import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal

# Proof-only structural inventory for the original String planner.
# Every raw catalog leaf contributes; neither key uniqueness nor routing is assumed.
def unseen_weight(seen: Bool, amount: Nat) -> Nat:
  match seen:
    case True{}: 0n
    case False{}: amount

def unseen_declaration(
  visited: Map<&2, Bool>,
  declaration: Maybe<&2, Core.Declaration>
) -> Nat:
  match declaration:
    case None{}: 0n
    case Some{Core.Declaration{_, identity, _, _, references}}:
      unseen_weight(
        CoreTraversal.has_identity(visited, identity),
        List.length(&2, Core.Reference, references)
      )

def unseen_catalog(
  +visited: Map<&2, Bool>,
  catalog: Map<&2, Maybe<&2, Core.Declaration>>
) -> Nat:
  match catalog:
    case MTip{}: 0n
    case MLeaf{_, declaration}: unseen_declaration(visited, declaration)
    case MNode{_, lo, hi}: (unseen_catalog(visited, lo) + unseen_catalog(visited, hi) : Nat)

def declaration_catalog(facts: Core.Facts) -> Map<&2, Maybe<&2, Core.Declaration>>:
  match facts:
    case Core.Facts{_, declarations, _, _}: declarations

def frame_references(frame: Core.Frame) -> Nat:
  match frame:
    case Core.Frame{_, _, _, references}: List.length(&2, Core.Reference, references)

def pending_references(frames: List<&2, Core.Frame>) -> Nat:
  match frames:
    case []: 0n
    case head <> tail: (frame_references(head) + pending_references(tail) : Nat)

def rank(machine: Core.Machine) -> Nat:
  match machine:
    case Core.Machine{facts, _, +frames, visited, _, _, _, _, _}:
      ((2n * unseen_catalog(visited, declaration_catalog(facts)) : Nat)
        + (2n * pending_references(frames) : Nat) + List.length(&2, Core.Frame, frames) : Nat)

def initial(
  facts: Core.Facts,
  path: String,
  visited: Map<&2, Bool>,
  budget: Core.Budget
) -> Core.Machine:
  Core.Machine{facts, path, [], visited, budget, 0n, [], [], []}

def successful(result: Core.RunResult) -> Bool:
  match result:
    case Core.InvariantFailure{_}: False{}
    case _: True{}
