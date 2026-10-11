import Base
import ../traversal/core.bend as Local
import ../Core.bend as Core
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../Types.bend as T

def node_value(artifact: T.ProductValue, references: List<&2, T.ProductValue>) -> T.ProductValue:
  Core.object([Core.field("artifact", artifact), Core.field("references", T.ProductArray{references})])

def nodes_of(forest: F.Forest) -> List<&2, F.Node>:
  match forest:
    case F.Forest{_, nodes}: nodes

def node_materialized(+forest: F.Forest, +address: O.NodeAddress, +artifact: T.Artifact, +references: List<&2, F.Reference>,
    +remaining: Nat, +artifact_value: T.ProductValue, +values: List<&2, T.ProductValue>,
    node_present: {F.node_at(nodes_of(forest), address) == Some{F.Node{address, artifact, references}} : Maybe<&2, F.Node>},
    artifact_present: {F.artifact(artifact) == Some{artifact_value} : Maybe<&2, T.ProductValue>},
    references_present: {F.as_products(F.product_interpret(1n+remaining, F.ReferencesProductRequest{forest, references})) == F.ProductReferences{values} : F.ProductReferences}) ->
    {F.materialize(1n+remaining, forest, address) == F.Materialized{node_value(artifact_value, values)} : F.Materialization}:
  match forest:
    case F.Forest{+root, +nodes}:
      %Equal.sym(Maybe<&2, F.Node>, F.node_at(nodes, address), Some{F.Node{address, artifact, references}}, node_present):
        {F.found_node(_, child => F.materialize(remaining, F.Forest{root, nodes}, child),
          rest => F.as_products(F.product_interpret(remaining, F.ReferencesProductRequest{F.Forest{root, nodes}, rest}))) == F.Materialized{node_value(artifact_value, values)} : F.Materialization}
      %Equal.sym(F.ProductReferences, F.as_products(F.product_interpret(1n+remaining, F.ReferencesProductRequest{F.Forest{root, nodes}, references})), F.ProductReferences{values}, references_present):
        {F.node_product(F.artifact(artifact), _) == F.Materialized{node_value(artifact_value, values)} : F.Materialization}
      %Equal.sym(Maybe<&2, T.ProductValue>, F.artifact(artifact), Some{artifact_value}, artifact_present):
        {F.node_product(_, F.ProductReferences{values}) == F.Materialized{node_value(artifact_value, values)} : F.Materialization}
      {==}

def build_head(+id: Nat, +handle: Nat, +tail: List<&2, Local.PlannedNode>,
    +groups: Map<&2, List<&2, Local.ReferenceSlot>>, +artifacts: Map<&2, Maybe<&2, T.Artifact>>,
    +built: Map<&2, Maybe<&2, T.ProductValue>>, +artifact: T.Artifact, +artifact_value: T.ProductValue, +values: List<&2, T.ProductValue>,
    indexed: {Core.map_read(Maybe<&2, T.Artifact>, None{}, artifacts, Nat.show(handle)) == Some{artifact} : Maybe<&2, T.Artifact>},
    rendered: {Core.artifact_product(artifact) == Some{artifact_value} : Maybe<&2, T.ProductValue>},
    references: {Core.reference_products(Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(id)), built) == Some{values} : Maybe<&2, List<&2, T.ProductValue>>}) ->
    {Core.build_products(Local.PlannedNode{id, handle} <> tail, groups, artifacts, built)
      == Core.build_products(tail, groups, artifacts, Map.set(&2, Maybe<&2, T.ProductValue>, built, Nat.show(id), Some{node_value(artifact_value, values)})) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}:
  %Equal.sym(Maybe<&2, T.Artifact>, Core.map_read(Maybe<&2, T.Artifact>, None{}, artifacts, Nat.show(handle)), Some{artifact}, indexed):
    {Core.bind(T.Artifact, Map<&2, Maybe<&2, T.ProductValue>>, _, item =>
      Core.bind(T.ProductValue, Map<&2, Maybe<&2, T.ProductValue>>, Core.artifact_product(item), value =>
        Core.bind(List<&2, T.ProductValue>, Map<&2, Maybe<&2, T.ProductValue>>, Core.reference_products(Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(id)), built), refs =>
          Core.build_products(tail, groups, artifacts, Map.set(&2, Maybe<&2, T.ProductValue>, built, Nat.show(id), Some{node_value(value, refs)})))))
      == Core.build_products(tail, groups, artifacts, Map.set(&2, Maybe<&2, T.ProductValue>, built, Nat.show(id), Some{node_value(artifact_value, values)})) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}
  %Equal.sym(Maybe<&2, T.ProductValue>, Core.artifact_product(artifact), Some{artifact_value}, rendered):
    {Core.bind(T.ProductValue, Map<&2, Maybe<&2, T.ProductValue>>, _, value =>
      Core.bind(List<&2, T.ProductValue>, Map<&2, Maybe<&2, T.ProductValue>>, Core.reference_products(Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(id)), built), refs =>
        Core.build_products(tail, groups, artifacts, Map.set(&2, Maybe<&2, T.ProductValue>, built, Nat.show(id), Some{node_value(value, refs)}))))
      == Core.build_products(tail, groups, artifacts, Map.set(&2, Maybe<&2, T.ProductValue>, built, Nat.show(id), Some{node_value(artifact_value, values)})) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}
  %Equal.sym(Maybe<&2, List<&2, T.ProductValue>>, Core.reference_products(Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(id)), built), Some{values}, references):
    {Core.bind(List<&2, T.ProductValue>, Map<&2, Maybe<&2, T.ProductValue>>, _, refs =>
      Core.build_products(tail, groups, artifacts, Map.set(&2, Maybe<&2, T.ProductValue>, built, Nat.show(id), Some{node_value(artifact_value, refs)})))
      == Core.build_products(tail, groups, artifacts, Map.set(&2, Maybe<&2, T.ProductValue>, built, Nat.show(id), Some{node_value(artifact_value, values)})) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}
  {==}

def main() -> Unit:
  Unit{}
