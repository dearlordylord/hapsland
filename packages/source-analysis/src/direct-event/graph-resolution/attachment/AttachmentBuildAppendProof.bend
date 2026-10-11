import Base
import ./AttachmentProjectionContentsProof.bend as C
import ../Core.bend as Core
import ../Types.bend as T
import ../traversal/core.bend as Local

def map_value(value: Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>) -> Map<&2, Maybe<&2, T.ProductValue>>:
  match value:
    case None{}: MTip{}
    case Some{built}: built

def updated(built: Map<&2, Maybe<&2, T.ProductValue>>, id: Nat, artifact: T.ProductValue, refs: List<&2, T.ProductValue>) -> Map<&2, Maybe<&2, T.ProductValue>>:
  Map.set(&2, Maybe<&2, T.ProductValue>, built, Nat.show(id), Some{Core.object([Core.field("artifact", artifact), Core.field("references", T.ProductArray{refs})])})

def references(+id: Nat, +tail: List<&2, Local.PlannedNode>, +right: List<&2, Local.PlannedNode>,
    +groups: Map<&2, List<&2, Local.ReferenceSlot>>, +index: Map<&2, Maybe<&2, T.Artifact>>,
    +built: Map<&2, Maybe<&2, T.ProductValue>>, +finished: Map<&2, Maybe<&2, T.ProductValue>>, +artifact: T.ProductValue,
    +value: Maybe<&2, List<&2, T.ProductValue>>,
    success: {Core.bind(List<&2, T.ProductValue>, Map<&2, Maybe<&2, T.ProductValue>>, value,
      refs => Core.build_products(tail, groups, index, updated(built, id, artifact, refs))) == Some{finished} : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>},
    recursive: @+next: Map<&2, Maybe<&2, T.ProductValue>> ->
      {Core.build_products(tail, groups, index, next) == Some{finished} : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>} ->
      {Core.build_products(List.append(&2, Local.PlannedNode, tail, right), groups, index, next) == Core.build_products(right, groups, index, finished) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}) ->
    {Core.bind(List<&2, T.ProductValue>, Map<&2, Maybe<&2, T.ProductValue>>, value,
      refs => Core.build_products(List.append(&2, Local.PlannedNode, tail, right), groups, index, updated(built, id, artifact, refs))) == Core.build_products(right, groups, index, finished) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}:
  match value:
    case None{}:
      Empty.absurd({None{} == Core.build_products(right, groups, index, finished) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}, C.none_some(Map<&2, Maybe<&2, T.ProductValue>>, finished, success))
    case Some{refs}: recursive(updated(built, id, artifact, refs))(success)

def artifact_value(+id: Nat, +tail: List<&2, Local.PlannedNode>, +right: List<&2, Local.PlannedNode>,
    +groups: Map<&2, List<&2, Local.ReferenceSlot>>, +index: Map<&2, Maybe<&2, T.Artifact>>,
    +built: Map<&2, Maybe<&2, T.ProductValue>>, +finished: Map<&2, Maybe<&2, T.ProductValue>>,
    +value: Maybe<&2, T.ProductValue>,
    success: {Core.bind(T.ProductValue, Map<&2, Maybe<&2, T.ProductValue>>, value,
      artifact => Core.bind(List<&2, T.ProductValue>, Map<&2, Maybe<&2, T.ProductValue>>,
        Core.reference_products(Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(id)), built),
        refs => Core.build_products(tail, groups, index, updated(built, id, artifact, refs)))) == Some{finished} : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>},
    recursive: @+next: Map<&2, Maybe<&2, T.ProductValue>> ->
      {Core.build_products(tail, groups, index, next) == Some{finished} : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>} ->
      {Core.build_products(List.append(&2, Local.PlannedNode, tail, right), groups, index, next) == Core.build_products(right, groups, index, finished) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}) ->
    {Core.bind(T.ProductValue, Map<&2, Maybe<&2, T.ProductValue>>, value,
      artifact => Core.bind(List<&2, T.ProductValue>, Map<&2, Maybe<&2, T.ProductValue>>,
        Core.reference_products(Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(id)), built),
        refs => Core.build_products(List.append(&2, Local.PlannedNode, tail, right), groups, index, updated(built, id, artifact, refs)))) == Core.build_products(right, groups, index, finished) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}:
  match value:
    case None{}:
      Empty.absurd({None{} == Core.build_products(right, groups, index, finished) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}, C.none_some(Map<&2, Maybe<&2, T.ProductValue>>, finished, success))
    case Some{artifact}:
      references(id, tail, right, groups, index, built, finished, artifact,
        Core.reference_products(Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(id)), built), success, recursive)

def artifact(+id: Nat, +tail: List<&2, Local.PlannedNode>, +right: List<&2, Local.PlannedNode>,
    +groups: Map<&2, List<&2, Local.ReferenceSlot>>, +index: Map<&2, Maybe<&2, T.Artifact>>,
    +built: Map<&2, Maybe<&2, T.ProductValue>>, +finished: Map<&2, Maybe<&2, T.ProductValue>>,
    +value: Maybe<&2, T.Artifact>,
    success: {Core.bind(T.Artifact, Map<&2, Maybe<&2, T.ProductValue>>, value, item =>
      Core.bind(T.ProductValue, Map<&2, Maybe<&2, T.ProductValue>>, Core.artifact_product(item), artifact =>
        Core.bind(List<&2, T.ProductValue>, Map<&2, Maybe<&2, T.ProductValue>>,
          Core.reference_products(Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(id)), built),
          refs => Core.build_products(tail, groups, index, updated(built, id, artifact, refs))))) == Some{finished} : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>},
    recursive: @+next: Map<&2, Maybe<&2, T.ProductValue>> ->
      {Core.build_products(tail, groups, index, next) == Some{finished} : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>} ->
      {Core.build_products(List.append(&2, Local.PlannedNode, tail, right), groups, index, next) == Core.build_products(right, groups, index, finished) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}) ->
    {Core.bind(T.Artifact, Map<&2, Maybe<&2, T.ProductValue>>, value, item =>
      Core.bind(T.ProductValue, Map<&2, Maybe<&2, T.ProductValue>>, Core.artifact_product(item), artifact =>
        Core.bind(List<&2, T.ProductValue>, Map<&2, Maybe<&2, T.ProductValue>>,
          Core.reference_products(Core.map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(id)), built),
          refs => Core.build_products(List.append(&2, Local.PlannedNode, tail, right), groups, index, updated(built, id, artifact, refs))))) == Core.build_products(right, groups, index, finished) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}:
  match value:
    case None{}:
      Empty.absurd({None{} == Core.build_products(right, groups, index, finished) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}, C.none_some(Map<&2, Maybe<&2, T.ProductValue>>, finished, success))
    case Some{item}: artifact_value(id, tail, right, groups, index, built, finished, Core.artifact_product(item), success, recursive)

def append_success(left: List<&2, Local.PlannedNode>, +right: List<&2, Local.PlannedNode>,
    +groups: Map<&2, List<&2, Local.ReferenceSlot>>, +index: Map<&2, Maybe<&2, T.Artifact>>,
    +built: Map<&2, Maybe<&2, T.ProductValue>>, +finished: Map<&2, Maybe<&2, T.ProductValue>>,
    success: {Core.build_products(left, groups, index, built) == Some{finished} : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}) ->
    {Core.build_products(List.append(&2, Local.PlannedNode, left, right), groups, index, built) == Core.build_products(right, groups, index, finished) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}:
  match left:
    case []:
      same: {built == finished : Map<&2, Maybe<&2, T.ProductValue>>} =
        Equal.cong(Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>, Map<&2, Maybe<&2, T.ProductValue>>, value => map_value(value), Some{built}, Some{finished}, success)
      %same: {Core.build_products(right, groups, index, built) == Core.build_products(right, groups, index, _) : Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>}
      {==}
    case Local.PlannedNode{+id, handle} <> +tail:
      artifact(id, tail, right, groups, index, built, finished, Core.map_read(Maybe<&2, T.Artifact>, None{}, index, Nat.show(handle)), success,
        next => done => append_success(tail, right, groups, index, next, finished, done))

def main() -> Unit:
  Unit{}
