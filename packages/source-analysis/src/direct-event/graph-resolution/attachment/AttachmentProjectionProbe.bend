import Base
import ./AttachmentMapping.bend as Mapping
import ./RetainedForestProjection.bend as Projection
import ../Composition.bend as Actual
import ../ForestSpecification.bend as F
import ../Types.bend as T
import ../traversal/core.bend as Local

def budget() -> Local.Budget:
  Local.Budget{Local.LocalLimits{1000n, 1000n, 1000n},
    Map.new(&2, Map<&2, Bool>), 0n, 0n, 0n, 0n}

def attach(child_root: Nat, child_nodes: List<&2, Local.PlannedNode>,
    child_slots: List<&2, Local.ReferenceSlot>, offset: Nat,
    nodes: List<&2, Local.PlannedNode>, slots: List<&2, Local.ReferenceSlot>,
    owner: Nat, index: Nat, include: Maybe<&2, String>,
    pending: List<&2, Local.Pending>, next_edge: Nat) -> Maybe<&2, Actual.Attachment>:
  Actual.tentative_attachment(
    Actual.remap(Local.Plan{child_root, child_nodes, child_slots, pending,
      Map.new(&2, Bool), budget()}, offset),
    nodes, slots, owner, index, include, next_edge, Map.new(&2, Maybe<&2, Local.Pending>))

def pending_at(attachment: Actual.Attachment, id: Nat) -> Maybe<&2, Local.Pending>:
  match attachment:
    case Actual.Attachment{_, _, _, _, _, pending, _, _, _}:
      Local.map_result(
        Maybe<&2, Local.Pending>,
        Map.get(Maybe<&2, Local.Pending>, None{}, pending, Nat.show(id))
      )

def main() -> Unit:
  Unit{}
