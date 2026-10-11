import Base
import ./Own.bend as Own
import ./core.bend as Core

# Candidate whole-machine termination measure; no theorem claimed by definitions.
def unseen_declaration(
  +visited: Own.Dictionary<Bool>,
  declaration: Maybe<&2, Core.Declaration>
) -> Nat:
  match declaration:
    case None{}: 0n
    case Some{Core.Declaration{_, identity, _, _, references}}:
      Own.choose(Nat, Core.has_identity(visited, identity), 0n,
        next => List.length(&2, Core.Reference, references))

def unseen_catalog(
  +visited: Own.Dictionary<Bool>,
  catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
) -> Nat:
  match catalog:
    case Own.DNil{}: 0n
    case Own.DCon{_, declaration, rest, _}:
      (unseen_declaration(visited, declaration) + unseen_catalog(visited, rest) : Nat)

def frame_references(frame: Core.Frame) -> Nat:
  match frame:
    case Core.Frame{_, _, _, references}: List.length(&2, Core.Reference, references)

def pending_references(frames: List<&2, Core.Frame>) -> Nat:
  match frames:
    case []: 0n
    case head <> tail: (frame_references(head) + pending_references(tail) : Nat)

def declaration_catalog(facts: Core.Facts) -> Own.Dictionary<Maybe<&2, Core.Declaration>>:
  match facts:
    case Core.Facts{_, declarations, _, _}: declarations

def machine_frames(machine: Core.Machine) -> List<&2, Core.Frame>:
  match machine:
    case Core.Machine{_, _, frames, _, _, _, _, _, _}: frames

def rank(+machine: Core.Machine) -> Nat:
  unseen = unseen_catalog(
    Core.machine_visited(machine),
    declaration_catalog(Core.machine_facts(machine))
  )
  +frames = machine_frames(machine)
  (2n * unseen + 2n * pending_references(frames) + List.length(&2, Core.Frame, frames) : Nat)

def successful(result: Core.RunResult) -> Bool:
  match result:
    case Core.InvariantFailure{_}: False{}
    case _: True{}

def initial(
  facts: Core.Facts,
  path: Nat,
  visited: Own.Dictionary<Bool>,
  budget: Core.Budget
) -> Core.Machine:
  Core.Machine{facts, path, [], visited, budget, 0n, [], [], []}
