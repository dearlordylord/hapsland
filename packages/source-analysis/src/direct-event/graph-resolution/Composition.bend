import Base
import ./Types.bend as T
import ./Core.bend as Materialize
import ./traversal/core.bend as Local

# Whole resolver composition: addresses are allocated before attachment admission.
# Artifact handles already belong to the invocation-wide catalog and are not shifted.
type RemappedPlan is Data:
  RemappedPlan{root: Nat, next_node: Nat, nodes: List<&2, Local.PlannedNode>,
    references: List<&2, Local.ReferenceSlot>, pending: List<&2, Local.Pending>,
    visited: Map<&2, Bool>, budget: Local.Budget}

def shift_reference(reference: Local.PlannedReference, offset: Nat) -> Local.PlannedReference:
  match reference:
    case Local.Expanded{node}: Local.Expanded{(node + offset : Nat)}
    case Local.Included{identity}: Local.Included{identity}
    case Local.Omitted{reason, target}: Local.Omitted{reason, target}

def shift_nodes(nodes: List<&2, Local.PlannedNode>, +offset: Nat) -> List<&2, Local.PlannedNode>:
  match nodes:
    case []: []
    case Local.PlannedNode{node, artifact} <> tail:
      Local.PlannedNode{(node + offset : Nat), artifact} <> shift_nodes(tail, offset)

def shift_slots(
  slots: List<&2, Local.ReferenceSlot>,
  +offset: Nat
) -> List<&2, Local.ReferenceSlot>:
  match slots:
    case []: []
    case Local.ReferenceSlot{owner, index, symbol, reference} <> tail:
      Local.ReferenceSlot{(owner + offset : Nat), index, symbol, shift_reference(reference, offset)} <> shift_slots(
        tail,
        offset
      )

def shift_pending(pending: List<&2, Local.Pending>, +offset: Nat) -> List<&2, Local.Pending>:
  match pending:
    case []: []
    case Local.Pending{owner, index, from, symbol, name, depth, expected, target} <> tail:
      Local.Pending{(owner + offset : Nat), index, from, symbol, name, depth, expected, target} <> shift_pending(
        tail,
        offset
      )

# Local planner addresses are dense from zero. The whole-machine preservation law
# must establish that invariant before this constructor is reached.
def remap(plan: Local.Plan, +offset: Nat) -> RemappedPlan:
  match plan:
    case Local.Plan{root, +nodes, references, pending, visited, budget}:
      RemappedPlan{
        (root + offset : Nat),
        (offset + List.length(&2, Local.PlannedNode, nodes) : Nat),
        shift_nodes(nodes, offset),
        shift_slots(references, offset),
        shift_pending(pending, offset),
        visited,
        budget
      }

type RegisteredPending is Data:
  RegisteredPending{next_edge: Nat, ids: List<&2, Nat>, entries: Map<&2, Maybe<&2, Local.Pending>>}

def registered_prefix(result: RegisteredPending, id: Nat) -> RegisteredPending:
  match result:
    case RegisteredPending{end, ids, entries}: RegisteredPending{end, id <> ids, entries}

def register_pending(pending: List<&2, Local.Pending>, +next: Nat,
    entries: Map<&2, Maybe<&2, Local.Pending>>) -> RegisteredPending:
  match pending:
    case []: RegisteredPending{next, [], entries}
    case edge <> tail:
      registered_prefix(
        register_pending(
          tail,
          (next + 1n : Nat),
          Map.set(&2, Maybe<&2, Local.Pending>, entries, Nat.show(next), Some{edge})
        ),
        next
      )

# Replace exactly one address, retaining the order of every other reference.
# Zero or duplicate matches is a protocol failure, never an append operation.
type ReplacedSlots is Data:
  ReplacedSlots{count: Nat, slots: List<&2, Local.ReferenceSlot>}

def replaced_prefix(
  result: ReplacedSlots,
  +same: Bool,
  owner: Nat,
  index: Nat,
  symbol: String,
  previous: Local.PlannedReference,
  reference: Local.PlannedReference
) -> ReplacedSlots:
  match result:
    case ReplacedSlots{count, rest}:
      ReplacedSlots{
        (count + Bool.pick(Nat, same, 1n, 0n) : Nat),
        Local.ReferenceSlot{
          owner,
          index,
          symbol,
          Bool.pick(Local.PlannedReference, same, reference, previous)
        } <> rest
      }

def replace_slot(slots: List<&2, Local.ReferenceSlot>, +owner: Nat, +index: Nat,
    +reference: Local.PlannedReference) -> ReplacedSlots:
  match slots:
    case []: ReplacedSlots{0n, []}
    case Local.ReferenceSlot{+actual_owner, +actual_index, symbol, previous} <> tail:
      replaced_prefix(replace_slot(tail, owner, index, reference),
        Bool.and(Nat.is_eq(owner, actual_owner), Nat.is_eq(index, actual_index)),
        actual_owner, actual_index, symbol, previous, reference)

def replacement(result: ReplacedSlots) -> Maybe<&2, List<&2, Local.ReferenceSlot>>:
  match result:
    case ReplacedSlots{count, slots}:
      Bool.pick(Maybe<&2, List<&2, Local.ReferenceSlot>>, Nat.is_eq(count, 1n), Some{slots}, None{})

type Attachment is Data:
  Attachment{root: Nat, next_node: Nat, next_edge: Nat,
    nodes: List<&2, Local.PlannedNode>, references: List<&2, Local.ReferenceSlot>,
    pending: Map<&2, Maybe<&2, Local.Pending>>, pending_ids: List<&2, Nat>,
    tentative_visited: Map<&2, Bool>, attempted_budget: Local.Budget}

def attachment_registered(registration: RegisteredPending, child: RemappedPlan,
    nodes: List<&2, Local.PlannedNode>, references: List<&2, Local.ReferenceSlot>) -> Attachment:
  match registration:
    case RegisteredPending{next_edge, ids, pending}:
      match child:
        case RemappedPlan{root, next_node, children, child_references, _, visited, budget}:
          Attachment{
            root,
            next_node,
            next_edge,
            List.append(&2, Local.PlannedNode, nodes, children),
            List.append(&2, Local.ReferenceSlot, references, child_references),
            pending,
            ids,
            visited,
            budget
          }

def attach_replaced(replaced: Maybe<&2, List<&2, Local.ReferenceSlot>>, +child: RemappedPlan,
    nodes: List<&2, Local.PlannedNode>, next_edge: Nat,
    pending: Map<&2, Maybe<&2, Local.Pending>>) -> Maybe<&2, Attachment>:
  match replaced:
    case None{}: None{}
    case Some{references}:
      match child:
        case RemappedPlan{_, _, _, _, edges, _, _}:
          Some{
            attachment_registered(
              register_pending(edges, next_edge, pending),
              child,
              nodes,
              references
            )
          }

# Addresses and pending IDs are committed before ImportGraph.Captured. Callers
# publish visited/captured/artifact maps only after that transition accepts.
def tentative_attachment(+child: RemappedPlan, nodes: List<&2, Local.PlannedNode>,
    references: List<&2, Local.ReferenceSlot>, owner: Nat, index: Nat,
    include: Maybe<&2, String>, next_edge: Nat,
    pending: Map<&2, Maybe<&2, Local.Pending>>) -> Maybe<&2, Attachment>:
  match child:
    case RemappedPlan{root, _, _, _, _, _, _}:
      match include:
        case None{}:
          attach_replaced(
            replacement(replace_slot(references, owner, index, Local.Expanded{root})),
            child,
            nodes,
            next_edge,
            pending
          )
        case Some{identity}:
          attach_replaced(
            replacement(replace_slot(references, owner, index, Local.Included{identity})),
            child,
            nodes,
            next_edge,
            pending
          )

# Refusal retains allocation, attempted budget and registered pending records.
# The whole-machine caller keeps its previously published visited/captured maps.
def refuse_attachment(attachment: Attachment, owner: Nat, index: Nat,
    target_name: String) -> Maybe<&2, Attachment>:
  match attachment:
    case Attachment{root, next_node, next_edge, nodes, references, pending, ids, visited, budget}:
      next : List<&2, Local.ReferenceSlot> -> Maybe<&2, Attachment> = slots => Some{
        Attachment{root, next_node, next_edge, nodes, slots, pending, ids, visited, budget}
      }
      Materialize.bind(
        List<&2, Local.ReferenceSlot>,
        Attachment,
        replacement(
          replace_slot(references, owner, index, Local.Omitted{Local.ReferenceLimit{}, target_name})
        ),
        next
      )

def main() -> Unit:
  Unit{}
