import Base
import ./RetainedForestProjection.bend as P
import ./AttachmentMapping.bend as Mapping
import ./AttachmentFrameView.bend as V
import ./ActualAttachmentPhaseProjection.bend as Ready
import ../Composition.bend as Compose
import ../ForestSpecification.bend as F
import ../Types.bend as T
import ../WholeObservation.bend as O
import ../traversal/core.bend as Local
import ../traversal/INTERPRETER_NAT_FACTS.bend as N

# Exact mathlib nat.bend comparison transport, add_comm supplied by existing N owner.
# Source SHA256 445fb22805af3d01f9c9a08cefcf0e5d02f2ac750a424aeb1e0f0b6836f87991
import ./AttachmentRemapFacts.bend as Facts

def slots_owned(
  items: List<&2, Local.ReferenceSlot>,
  +nodes: List<&2, Local.PlannedNode>,
  +offset: Nat
) -> {
  P.slots_owned(items, nodes)
  == P.slots_owned(Compose.shift_slots(items, offset), Compose.shift_nodes(nodes, offset))
  : Bool
}:
  match items:
    case []: {==}
    case Local.ReferenceSlot{+owner, index, symbol, reference} <> +tail:
      %Facts.node_count(nodes, owner, offset): {
        P.slots_owned(Local.ReferenceSlot{owner, index, symbol, reference} <> tail, nodes)
        == Bool.and(
          Nat.is_eq(_, 1n),
          P.slots_owned(Compose.shift_slots(tail, offset), Compose.shift_nodes(nodes, offset))
        )
        : Bool
      }
      %slots_owned(tail, nodes, offset): {
        P.slots_owned(Local.ReferenceSlot{owner, index, symbol, reference} <> tail, nodes)
        == Bool.and(Nat.is_eq(P.node_count(nodes, owner), 1n), _)
        : Bool
      }
      {==}

def forward_nodes(
  items: List<&2, Local.PlannedNode>,
  +slots: List<&2, Local.ReferenceSlot>,
  +offset: Nat
) -> {
  P.forward_nodes(items, slots)
  == P.forward_nodes(Compose.shift_nodes(items, offset), Compose.shift_slots(slots, offset))
  : Bool
}:
  match items:
    case []: {==}
    case Local.PlannedNode{+id, handle} <> +tail:
      %Facts.owner_slots(slots, id, offset): {
        P.forward_nodes(Local.PlannedNode{id, handle} <> tail, slots)
        == Bool.and(
          P.indexed(_, 0n, Compose.shift_nodes(tail, offset)),
          P.forward_nodes(Compose.shift_nodes(tail, offset), Compose.shift_slots(slots, offset))
        )
        : Bool
      }
      %Facts.indexed(P.owner_slots(slots, id), 0n, tail, offset): {
        P.forward_nodes(Local.PlannedNode{id, handle} <> tail, slots)
        == Bool.and(
          _,
          P.forward_nodes(Compose.shift_nodes(tail, offset), Compose.shift_slots(slots, offset))
        )
        : Bool
      }
      %forward_nodes(tail, slots, offset): {
        P.forward_nodes(Local.PlannedNode{id, handle} <> tail, slots)
        == Bool.and(P.indexed(P.owner_slots(slots, id), 0n, tail), _)
        : Bool
      }
      {==}

def forest(
  +root: Nat,
  +items: List<&2, Local.PlannedNode>,
  +slots: List<&2, Local.ReferenceSlot>,
  +artifacts: List<&2, T.ArtifactEntry>,
  +addresses: List<&2, F.AddressEntry>,
  +offset: Nat
) -> {
  P.forest(F.address_at(addresses, root), P.nodes(items, slots, artifacts, addresses))
  == P.forest(
    F.address_at(Mapping.shifted(addresses, offset), (root + offset : Nat)),
    P.nodes(
      Compose.shift_nodes(items, offset),
      Compose.shift_slots(slots, offset),
      artifacts,
      Mapping.shifted(addresses, offset)
    )
  )
  : Maybe<&2, F.Forest>
}:
  %Facts.address_at(addresses, root, offset): {
    P.forest(F.address_at(addresses, root), P.nodes(items, slots, artifacts, addresses))
    == P.forest(
      _,
      P.nodes(
        Compose.shift_nodes(items, offset),
        Compose.shift_slots(slots, offset),
        artifacts,
        Mapping.shifted(addresses, offset)
      )
    )
    : Maybe<&2, F.Forest>
  }
  %Facts.nodes(items, slots, artifacts, addresses, offset): {
    P.forest(F.address_at(addresses, root), P.nodes(items, slots, artifacts, addresses))
    == P.forest(F.address_at(addresses, root), _)
    : Maybe<&2, F.Forest>
  }
  {==}

def validated(
  valid: Bool,
  +root: Nat,
  +items: List<&2, Local.PlannedNode>,
  +slots: List<&2, Local.ReferenceSlot>,
  +artifacts: List<&2, T.ArtifactEntry>,
  +addresses: List<&2, F.AddressEntry>,
  +offset: Nat
) -> {
  P.validated(valid, root, items, slots, artifacts, addresses)
  == P.validated(
    valid,
    (root + offset : Nat),
    Compose.shift_nodes(items, offset),
    Compose.shift_slots(slots, offset),
    artifacts,
    Mapping.shifted(addresses, offset)
  )
  : Maybe<&2, F.Forest>
}:
  match valid:
    case False{}: {==}
    case True{}: forest(root, items, slots, artifacts, addresses, offset)

def project(
  +root: Nat,
  +nodes: List<&2, Local.PlannedNode>,
  +slots: List<&2, Local.ReferenceSlot>,
  +artifacts: List<&2, T.ArtifactEntry>,
  +addresses: List<&2, F.AddressEntry>,
  +offset: Nat
) -> {
  P.project(root, nodes, slots, artifacts, addresses)
  == P.project(
    (root + offset : Nat),
    Compose.shift_nodes(nodes, offset),
    Compose.shift_slots(slots, offset),
    artifacts,
    Mapping.shifted(addresses, offset)
  )
  : Maybe<&2, F.Forest>
}:
  %Facts.aligned(nodes, addresses, nodes, addresses, offset): {
    P.project(root, nodes, slots, artifacts, addresses)
    == P.validated(
      Bool.and(
        _,
        Bool.and(
          P.catalog_unique(artifacts, artifacts),
          Bool.and(
            P.slots_owned(Compose.shift_slots(slots, offset), Compose.shift_nodes(nodes, offset)),
            P.forward_nodes(Compose.shift_nodes(nodes, offset), Compose.shift_slots(slots, offset))
          )
        )
      ),
      (root + offset : Nat),
      Compose.shift_nodes(nodes, offset),
      Compose.shift_slots(slots, offset),
      artifacts,
      Mapping.shifted(addresses, offset)
    )
    : Maybe<&2, F.Forest>
  }
  %slots_owned(slots, nodes, offset): {
    P.project(root, nodes, slots, artifacts, addresses)
    == P.validated(
      Bool.and(
        P.aligned(nodes, addresses, nodes, addresses),
        Bool.and(
          P.catalog_unique(artifacts, artifacts),
          Bool.and(
            _,
            P.forward_nodes(Compose.shift_nodes(nodes, offset), Compose.shift_slots(slots, offset))
          )
        )
      ),
      (root + offset : Nat),
      Compose.shift_nodes(nodes, offset),
      Compose.shift_slots(slots, offset),
      artifacts,
      Mapping.shifted(addresses, offset)
    )
    : Maybe<&2, F.Forest>
  }
  %forward_nodes(nodes, slots, offset): {
    P.project(root, nodes, slots, artifacts, addresses)
    == P.validated(
      Bool.and(
        P.aligned(nodes, addresses, nodes, addresses),
        Bool.and(P.catalog_unique(artifacts, artifacts), Bool.and(P.slots_owned(slots, nodes), _))
      ),
      (root + offset : Nat),
      Compose.shift_nodes(nodes, offset),
      Compose.shift_slots(slots, offset),
      artifacts,
      Mapping.shifted(addresses, offset)
    )
    : Maybe<&2, F.Forest>
  }
  validated(
    Bool.and(
      P.aligned(nodes, addresses, nodes, addresses),
      Bool.and(
        P.catalog_unique(artifacts, artifacts),
        Bool.and(P.slots_owned(slots, nodes), P.forward_nodes(nodes, slots))
      )
    ),
    root,
    nodes,
    slots,
    artifacts,
    addresses,
    offset
  )

# Astra-approved internal transport. No density, successful projection, or
# disjoint-parent premise: the complete Maybe forest is unchanged, including None.
# This does not establish that remap.next_node is an allocation highwater.
law projection_shift_exact:
  for +root: Nat
  for +nodes: List<&2, Local.PlannedNode>
  for +slots: List<&2, Local.ReferenceSlot>
  for +artifacts: List<&2, T.ArtifactEntry>
  for +addresses: List<&2, F.AddressEntry>
  for +offset: Nat
  {P.project((root + offset : Nat), Compose.shift_nodes(nodes, offset),
    Compose.shift_slots(slots, offset), artifacts, Mapping.shifted(addresses, offset))
    == P.project(root, nodes, slots, artifacts, addresses) : Maybe<&2, F.Forest>}


def projection_shift_exact(root, nodes, slots, artifacts, addresses, offset):
  +root = root
  +nodes = nodes
  +slots = slots
  +artifacts = artifacts
  +addresses = addresses
  +offset = offset
  Equal.sym(
    Maybe<&2, F.Forest>,
    P.project(root, nodes, slots, artifacts, addresses),
    P.project(
      (root + offset : Nat),
      Compose.shift_nodes(nodes, offset),
      Compose.shift_slots(slots, offset),
      artifacts,
      Mapping.shifted(addresses, offset)
    ),
    project(root, nodes, slots, artifacts, addresses, offset)
  )

def child_projection(
  plan: Local.Plan,
  artifacts: List<&2, T.ArtifactEntry>,
  addresses: List<&2, F.AddressEntry>
) -> Maybe<&2, F.Forest>:
  match plan:
    case Local.Plan{root, nodes, slots, _, _, _}: P.project(
      root,
      nodes,
      slots,
      artifacts,
      addresses
    )

def remapped_projection(
  plan: Compose.RemappedPlan,
  artifacts: List<&2, T.ArtifactEntry>,
  addresses: List<&2, F.AddressEntry>
) -> Maybe<&2, F.Forest>:
  match plan:
    case Compose.RemappedPlan{root, _, nodes, slots, _, _, _}: P.project(
      root,
      nodes,
      slots,
      artifacts,
      addresses
    )

# Same child forest from the actual remap constructor, including malformed None.
law remap_projection_exact:
  for +plan: Local.Plan
  for +artifacts: List<&2, T.ArtifactEntry>
  for +addresses: List<&2, F.AddressEntry>
  for +offset: Nat
  {remapped_projection(Compose.remap(plan, offset), artifacts, Mapping.shifted(addresses, offset))
    == child_projection(plan, artifacts, addresses) : Maybe<&2, F.Forest>}

def remap_projection_exact(plan, artifacts, addresses, offset):
  match plan:
    case Local.Plan{root, nodes, slots, _, _, _}:
      projection_shift_exact(root, nodes, slots, artifacts, addresses, offset)

# Exact retained payload and counter formula; highwater/density is not asserted.
def remap_fields(
  +root: Nat,
  +nodes: List<&2, Local.PlannedNode>,
  +slots: List<&2, Local.ReferenceSlot>,
  +pending: List<&2, Local.Pending>,
  +visited: Map<&2, Bool>,
  +budget: Local.Budget,
  +offset: Nat
) -> {
  Compose.remap(Local.Plan{root, nodes, slots, pending, visited, budget}, offset)
  == Compose.RemappedPlan{
    (root + offset : Nat),
    (offset + List.length(&2, Local.PlannedNode, nodes) : Nat),
    Compose.shift_nodes(nodes, offset),
    Compose.shift_slots(slots, offset),
    Compose.shift_pending(pending, offset),
    visited,
    budget
  }
  : Compose.RemappedPlan
}:
  {==}

def payload_at_same(
  address: Maybe<&2, O.NodeAddress>,
  +owner: Nat,
  +index: Nat,
  +from: String,
  +symbol: String,
  +name: String,
  +depth: Nat,
  +expected: Local.ExpectedKind,
  +target: Local.PendingTarget,
  +offset: Nat
) -> {
  V.payload_at(address, Local.Pending{owner, index, from, symbol, name, depth, expected, target})
  == V.payload_at(
    address,
    Local.Pending{(owner + offset : Nat), index, from, symbol, name, depth, expected, target}
  )
  : Maybe<&2, V.PendingPayload>
}:
  match address:
    case None{}: {==}
    case Some{_}: {==}

def pending_payload(
  +owner: Nat,
  +index: Nat,
  +from: String,
  +symbol: String,
  +name: String,
  +depth: Nat,
  +expected: Local.ExpectedKind,
  +target: Local.PendingTarget,
  +addresses: List<&2, F.AddressEntry>,
  +offset: Nat
) -> {
  V.pending_payload(
    Local.Pending{owner, index, from, symbol, name, depth, expected, target},
    addresses
  )
  == V.pending_payload(
    Local.Pending{(owner + offset : Nat), index, from, symbol, name, depth, expected, target},
    Mapping.shifted(addresses, offset)
  )
  : Maybe<&2, V.PendingPayload>
}:
  %Facts.address_at(addresses, owner, offset):
    {
      V.pending_payload(
        Local.Pending{owner, index, from, symbol, name, depth, expected, target},
        addresses
      )
      == V.payload_at(
        _,
        Local.Pending{(owner + offset : Nat), index, from, symbol, name, depth, expected, target}
      )
      : Maybe<&2, V.PendingPayload>
    }
  payload_at_same(
    F.address_at(addresses, owner),
    owner,
    index,
    from,
    symbol,
    name,
    depth,
    expected,
    target,
    offset
  )

def pending(
  items: List<&2, Local.Pending>,
  +addresses: List<&2, F.AddressEntry>,
  +offset: Nat
) -> {
  Ready.pending(items, addresses)
  == Ready.pending(Compose.shift_pending(items, offset), Mapping.shifted(addresses, offset))
  : Maybe<&2, List<&2, V.PendingPayload>>
}:
  match items:
    case []: {==}
    case Local.Pending{+owner, +index, +from, +symbol, +name, +depth, +expected, +target} <> +tail:
      %pending_payload(
        owner,
        index,
        from,
        symbol,
        name,
        depth,
        expected,
        target,
        addresses,
        offset
      ):
        {
          Ready.pending(
            Local.Pending{owner, index, from, symbol, name, depth, expected, target} <> tail,
            addresses
          )
          == Ready.pending_prefix(
            _,
            Ready.pending(Compose.shift_pending(tail, offset), Mapping.shifted(addresses, offset))
          )
          : Maybe<&2, List<&2, V.PendingPayload>>
        }
      %pending(tail, addresses, offset):
        {
          Ready.pending(
            Local.Pending{owner, index, from, symbol, name, depth, expected, target} <> tail,
            addresses
          )
          == Ready.pending_prefix(
            V.pending_payload(
              Local.Pending{owner, index, from, symbol, name, depth, expected, target},
              addresses
            ),
            _
          )
          : Maybe<&2, List<&2, V.PendingPayload>>
        }
      {==}

def main() -> Unit:
  Unit{}
