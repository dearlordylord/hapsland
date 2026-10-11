import Base
import ./core.bend as Core

# Draft proof relation only. Allocation extent is the returned node-list length,
# never a recursive specification state's next_address field.
def allocation_count(plan: Core.Plan) -> Nat:
  match plan:
    case Core.Plan{_, nodes, _, _, _, _}: List.length(&2, Core.PlannedNode, nodes)

# Exact list order, not merely distinctness or membership in a numeric interval.
def nodes_from(nodes: List<&2, Core.PlannedNode>, +next: Nat) -> Bool:
  match nodes:
    case []: True{}
    case Core.PlannedNode{node, _} <> rest:
      Bool.and(Nat.is_eq(node, next), nodes_from(rest, (next + 1n : Nat)))

def nonempty(nodes: List<&2, Core.PlannedNode>) -> Bool:
  match nodes:
    case []: False{}
    case _ <> _: True{}

def plan_nodes(plan: Core.Plan) -> Bool:
  match plan:
    case Core.Plan{root, +nodes, _, _, _, _}:
      Bool.and(Nat.is_eq(root, 0n), Bool.and(nonempty(nodes), nodes_from(nodes, 0n)))
