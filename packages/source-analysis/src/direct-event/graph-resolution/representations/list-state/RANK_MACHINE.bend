import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank

type Traversal is Data:
  Traversal{
    catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>,
    visited: Own.Dictionary<Bool>,
    frames: List<&2, Core.Frame>
  }

def projection(machine: Core.Machine) -> Traversal:
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}:
      Traversal{Rank.declaration_catalog(facts), visited, frames}

def projected_rank(state: Traversal) -> Nat:
  match state:
    case Traversal{catalog, visited, +frames}:
      unseen = Rank.unseen_catalog(visited, catalog)
      (2n * unseen + 2n * Rank.pending_references(frames) + List.length(&2, Core.Frame, frames) : Nat)

def projected_catalog(state: Traversal) -> Own.Dictionary<Maybe<&2, Core.Declaration>>:
  match state:
    case Traversal{catalog, _, _}: catalog
