import Base
import ./Types.bend as T
import ./WholeObservation.bend as O
import ./traversal/core.bend as Local
import ./traversal/SPEC.bend as Recursive

# Semantic construction forest, not the candidate's flattened production plan.
# Addresses record creation episode and original reference-index route. Slot
# replacement and rollback never rename a constructed child or pending owner.
# Symbols and artifact identities have distinct roles, but the accepted text
# domain includes empty text, NUL and lone surrogates. Nominal carriers prevent
# exchanging those roles without imposing an unsupported spelling restriction.
type ReferenceSymbol is Data:
  ReferenceSymbol{text: String}
type ArtifactIdentity is Data:
  ArtifactIdentity{text: String}
type Reference is Data:
  Included{symbol: ReferenceSymbol, identity: ArtifactIdentity}
  Expanded{symbol: ReferenceSymbol, child: O.NodeAddress}
  Omitted{symbol: ReferenceSymbol, target: ReferenceSymbol, reason: Local.Omission}
type Node is Data:
  Node{address: O.NodeAddress, artifact: T.Artifact, references: List<&2, Reference>}
type Forest is Data:
  Forest{root: Maybe<&2, O.NodeAddress>, nodes: List<&2, Node>}
type AddressEntry is Data:
  AddressEntry{local: Nat, address: O.NodeAddress}
type Created is Data:
  Created{root: O.NodeAddress, nodes: List<&2, Node>, addresses: List<&2, AddressEntry>}
type Construction is Data:
  Constructed{created: Created}
  ConstructionExhausted{}
  ConstructionInvalid{}
type References is Data:
  References{references: List<&2, Reference>, nodes: List<&2, Node>,
    addresses: List<&2, AddressEntry>}
type ReferencesResult is Data:
  ReferencesBuilt{result: References}
  ReferencesExhausted{}
  ReferencesInvalid{}
type Pending is Data:
  Pending{owner: O.NodeAddress, value: Local.Pending}
type PendingResult is Data:
  PendingBuilt{pending: List<&2, Pending>}
  PendingInvalid{}
type Replacement is Data:
  Replaced{forest: Forest}
  ReplacementInvalid{}
type Materialization is Data:
  Materialized{product: T.ProductValue}
  MaterializationExhausted{}
  MaterializationInvalid{}
type ProductReferences is Data:
  ProductReferences{items: List<&2, T.ProductValue>}
  ProductReferencesExhausted{}
  ProductReferencesInvalid{}

def same_route(left: List<&2, Nat>, right: List<&2, Nat>) -> Bool:
  match left right:
    case Nil{} Nil{}: True{}
    case Con{head, tail} Con{other, rest}:
      Bool.and(Nat.is_eq(head, other), same_route(tail, rest))
    case _ _: False{}

def same_address(left: O.NodeAddress, right: O.NodeAddress) -> Bool:
  match left right:
    case O.NodeAddress{episode, route} O.NodeAddress{other, rest}:
      Bool.and(Nat.is_eq(episode, other), same_route(route, rest))

def artifact_at(items: List<&2, T.ArtifactEntry>, +handle: Nat) -> Maybe<&2, T.Artifact>:
  match items:
    case []: None{}
    case T.ArtifactEntry{id, artifact} <> tail:
      Bool.pick(
        Maybe<&2, T.Artifact>,
        Nat.is_eq(id, handle),
        Some{artifact},
        artifact_at(tail, handle)
      )

def reference_prefix(result: ReferencesResult, reference: Reference,
    nodes: List<&2, Node>, addresses: List<&2, AddressEntry>) -> ReferencesResult:
  match result:
    case ReferencesBuilt{References{rest, more_nodes, more_addresses}}:
      ReferencesBuilt{References{reference <> rest,
        List.append(&2, Node, nodes, more_nodes),
        List.append(&2, AddressEntry, addresses, more_addresses)}}
    case other: other

def expanded(result: Construction, symbol: String,
    remaining: Unit -> ReferencesResult) -> ReferencesResult:
  match result:
    case Constructed{Created{root, nodes, addresses}}:
      reference_prefix(remaining(Unit{}), Expanded{ReferenceSymbol{symbol}, root}, nodes, addresses)
    case ConstructionExhausted{}: ReferencesExhausted{}
    case ConstructionInvalid{}: ReferencesInvalid{}

def converted_reference(reference: Recursive.TreeReference,
    child: Recursive.Tree -> Construction, remaining: Unit -> ReferencesResult) -> ReferencesResult:
  match reference:
    case Recursive.TreeReference{symbol, Recursive.Included{identity}}:
      reference_prefix(
        remaining(Unit{}),
        Included{ReferenceSymbol{symbol}, ArtifactIdentity{identity}},
        [],
        []
      )
    case Recursive.TreeReference{symbol, Recursive.Omitted{reason, target}}:
      reference_prefix(
        remaining(Unit{}),
        Omitted{ReferenceSymbol{symbol}, ReferenceSymbol{target}, reason},
        [],
        []
      )
    case Recursive.TreeReference{symbol, Recursive.Expanded{tree}}:
      expanded(child(tree), symbol, remaining)

def constructed(result: ReferencesResult, +address: O.NodeAddress,
    local: Nat, artifact: T.Artifact) -> Construction:
  match result:
    case ReferencesBuilt{References{references, nodes, addresses}}:
      Constructed{Created{address, Node{address, artifact, references} <> nodes,
        AddressEntry{local, address} <> addresses}}
    case ReferencesExhausted{}: ConstructionExhausted{}
    case ReferencesInvalid{}: ConstructionInvalid{}

type ConstructionRequest is Data:
  TreeRequest{
    tree: Recursive.Tree,
    episode: Nat,
    route: List<&2, Nat>,
    artifacts: List<&2, T.ArtifactEntry>
  }
  ReferencesRequest{items: List<&2, Recursive.TreeReference>, index: Nat, episode: Nat,
    route: List<&2, Nat>, artifacts: List<&2, T.ArtifactEntry>}
type ConstructionDispatch is Data:
  TreeResult{result: Construction}
  ListResult{result: ReferencesResult}

def as_tree(result: ConstructionDispatch) -> Construction:
  match result:
    case TreeResult{result}: result
    case _: ConstructionInvalid{}

def as_references(result: ConstructionDispatch) -> ReferencesResult:
  match result:
    case ListResult{result}: result
    case _: ReferencesInvalid{}

def tree_artifact(artifact: Maybe<&2, T.Artifact>, address: O.NodeAddress,
    local: Nat, references: List<&2, Recursive.TreeReference>,
    recurse: List<&2, Recursive.TreeReference> -> ReferencesResult) -> Construction:
  match artifact:
    case None{}: ConstructionInvalid{}
    case Some{artifact}: constructed(recurse(references), address, local, artifact)

def construct_dispatch(request: ConstructionRequest,
    child: ConstructionRequest -> ConstructionDispatch,
    sibling: ConstructionRequest -> ConstructionDispatch) -> ConstructionDispatch:
  match request:
    case TreeRequest{Recursive.Tree{local, handle, references}, +episode, +route, +artifacts}:
      continuation : List<&2, Recursive.TreeReference> -> ReferencesResult = items =>
        as_references(child(ReferencesRequest{items, 0n, episode, route, artifacts}))
      TreeResult{tree_artifact(artifact_at(artifacts, handle), O.NodeAddress{episode, route}, local,
        references, continuation)}
    case ReferencesRequest{Nil{}, _, _, _, _}: ListResult{ReferencesBuilt{References{[], [], []}}}
    case ReferencesRequest{head <> tail, +index, +episode, +route, +artifacts}:
      child_tree : Recursive.Tree -> Construction = tree =>
        as_tree(child(TreeRequest{tree, episode, List.append(&2, Nat, route, [index]), artifacts}))
      remaining : Unit -> ReferencesResult = _ =>
        as_references(
          sibling(ReferencesRequest{tail, (index + 1n : Nat), episode, route, artifacts})
        )
      ListResult{converted_reference(head, child_tree, remaining)}

def construct_interpret(fuel: Nat, request: ConstructionRequest) -> ConstructionDispatch:
  match fuel request:
    case 0n TreeRequest{_, _, _, _}: TreeResult{ConstructionExhausted{}}
    case 0n _: ListResult{ReferencesExhausted{}}
    case 1n++remaining _:
      construct_dispatch(request, next => construct_interpret(remaining, next),
        next => construct_interpret(remaining, next))

def construct(fuel: Nat, tree: Recursive.Tree, episode: Nat, route: List<&2, Nat>,
    artifacts: List<&2, T.ArtifactEntry>) -> Construction:
  as_tree(construct_interpret(fuel, TreeRequest{tree, episode, route, artifacts}))

def address_at(items: List<&2, AddressEntry>, +local: Nat) -> Maybe<&2, O.NodeAddress>:
  match items:
    case []: None{}
    case AddressEntry{id, address} <> tail:
      Bool.pick(
        Maybe<&2, O.NodeAddress>,
        Nat.is_eq(id, local),
        Some{address},
        address_at(tail, local)
      )

def pending_prefix(result: PendingResult, owner: Maybe<&2, O.NodeAddress>,
    value: Local.Pending) -> PendingResult:
  match result owner:
    case PendingBuilt{rest} Some{address}: PendingBuilt{Pending{address, value} <> rest}
    case _ _: PendingInvalid{}

def pending(items: List<&2, Local.Pending>, +addresses: List<&2, AddressEntry>) -> PendingResult:
  match items:
    case []: PendingBuilt{[]}
    case +item <> tail:
      match item:
        case Local.Pending{owner, _, _, _, _, _, _, _}:
          pending_prefix(pending(tail, addresses), address_at(addresses, owner), item)

def append(forest: Forest, created: Created) -> Forest:
  match forest created:
    case Forest{root, nodes} Created{_, more, _}:
      Forest{root, List.append(&2, Node, nodes, more)}

def node_at(items: List<&2, Node>, +address: O.NodeAddress) -> Maybe<&2, Node>:
  match items:
    case []: None{}
    case +node <> tail:
      match node:
        case Node{actual, _, _}:
          Bool.pick(
            Maybe<&2, Node>,
            same_address(address, actual),
            Some{node},
            node_at(tail, address)
          )

type Slots is Data:
  Slots{references: List<&2, Reference>, changed: Nat}
type Nodes is Data:
  Nodes{nodes: List<&2, Node>, changed: Nat}

def slots_prefix(result: Slots, reference: Reference) -> Slots:
  match result:
    case Slots{rest, changed}: Slots{reference <> rest, changed}

def replace_slot(items: List<&2, Reference>, index: Nat, replacement: Reference) -> Slots:
  match items index:
    case [] _: Slots{[], 0n}
    case _ <> tail 0n: Slots{replacement <> tail, 1n}
    case head <> tail 1n++remaining:
      slots_prefix(replace_slot(tail, remaining, replacement), head)

def nodes_prefix(result: Nodes, node: Node, changed: Nat) -> Nodes:
  match result:
    case Nodes{rest, count}: Nodes{node <> rest, (count + changed : Nat)}

def replaced_slots(result: Slots, rest: Nodes,
    address: O.NodeAddress, artifact: T.Artifact) -> Nodes:
  match result:
    case Slots{references, count}: nodes_prefix(rest, Node{address, artifact, references}, count)

def replace_node(matches: Bool, node: Node, rest: Nodes,
    index: Nat, replacement: Reference) -> Nodes:
  match matches node:
    case False{} _: nodes_prefix(rest, node, 0n)
    case True{} Node{address, artifact, references}:
      replaced_slots(replace_slot(references, index, replacement), rest, address, artifact)

def replace_nodes(items: List<&2, Node>, +address: O.NodeAddress,
    +index: Nat, +replacement: Reference) -> Nodes:
  match items:
    case []: Nodes{[], 0n}
    case +node <> tail:
      match node:
        case Node{actual, _, _}:
          replace_node(same_address(address, actual), node,
            replace_nodes(tail, address, index, replacement), index, replacement)

def replacement(result: Nodes, root: Maybe<&2, O.NodeAddress>) -> Replacement:
  match result:
    case Nodes{nodes, 1n}: Replaced{Forest{root, nodes}}
    case _: ReplacementInvalid{}

def count_address(items: List<&2, Node>, +address: O.NodeAddress) -> Nat:
  match items:
    case []: 0n
    case Node{actual, _, _} <> tail:
      (Bool.pick(Nat, same_address(address, actual), 1n, 0n) + count_address(tail, address) : Nat)

def descendant(parent: List<&2, Nat>, child: List<&2, Nat>) -> Bool:
  match parent child:
    case Nil{} Con{_, _}: True{}
    case Con{head, tail} Con{other, rest}:
      Bool.and(Nat.is_eq(head, other), descendant(tail, rest))
    case _ _: False{}

def born_after(owner: O.NodeAddress, child: O.NodeAddress) -> Bool:
  match owner child:
    case O.NodeAddress{+episode, route} O.NodeAddress{+other, rest}:
      Bool.or(Nat.is_gt(other, episode),
        Bool.and(Nat.is_eq(episode, other), descendant(route, rest)))

def reference_valid(reference: Reference, owner: O.NodeAddress, nodes: List<&2, Node>) -> Bool:
  match reference:
    case Expanded{_, +child}:
      Bool.and(Nat.is_eq(count_address(nodes, child), 1n), born_after(owner, child))
    case _: True{}

def replace_allowed(allowed: Bool, forest: Forest, owner: O.NodeAddress, index: Nat,
    reference: Reference) -> Replacement:
  match allowed forest:
    case True{} Forest{root, nodes}:
      replacement(replace_nodes(nodes, owner, index, reference), root)
    case False{} _: ReplacementInvalid{}

def replace(+forest: Forest, +owner: O.NodeAddress, index: Nat,
    +reference: Reference) -> Replacement:
  match forest:
    case Forest{_, nodes}:
      replace_allowed(Bool.and(Nat.is_eq(count_address(nodes, owner), 1n),
        reference_valid(reference, owner, nodes)), forest, owner, index, reference)

# Rendering replays typed artifact and origin field order directly. Parser
# facts must satisfy the declared artifact-domain boundary; this module does
# not invoke production Core/materializer helpers.
def text(value: String) -> T.ProductValue:
  T.ProductText{value}

def field(key: String, value: T.ProductValue) -> T.OrderedField<T.ProductValue>:
  T.OrderedField{key, value}

def object(fields: List<&2, T.OrderedField<T.ProductValue>>) -> T.ProductValue:
  T.ProductObject{fields}

def origin_field(key: T.OriginKey, origin: T.BundledOrigin) -> T.OrderedField<T.ProductValue>:
  match key origin:
    case T.OriginKindKey{} _: field("kind", text("bundled"))
    case T.LibraryKey{} _: field("library", text("bend/Base"))
    case T.CompilerVersionKey{} T.BundledOrigin{version, _, _, _, _}: field(
      "compilerVersion",
      text(version)
    )
    case T.CompilerSourceKey{} T.BundledOrigin{_, source, _, _, _}: field(
      "compilerSource",
      text(source)
    )
    case T.ModuleHashKey{} T.BundledOrigin{_, _, hash, _, _}: field("moduleHash", text(hash))
    case T.DeclarationHashKey{} T.BundledOrigin{_, _, _, hash, _}: field(
      "declarationHash",
      text(hash)
    )

def origin_fields(
  items: List<&2, T.OriginKey>,
  +origin: T.BundledOrigin
) -> List<&2, T.OrderedField<T.ProductValue>>:
  match items:
    case []: []
    case head <> tail: origin_field(head, origin) <> origin_fields(tail, origin)

def origin_product(origin: T.BundledOrigin) -> T.ProductValue:
  match origin:
    case T.BundledOrigin{_, _, _, _, +order}: object(origin_fields(order, origin))

def kind_name(kind: T.ArtifactKind) -> String:
  match kind:
    case T.InterfaceArtifact{}: "interface"
    case T.TypeAliasArtifact{}: "type-alias"
    case T.StructArtifact{}: "struct"
    case T.EnumArtifact{}: "enum"
    case T.DatatypeArtifact{}: "datatype"
    case T.FunctionArtifact{}: "function"
    case T.ClassArtifact{}: "class"

def artifact_field(
  key: T.ArtifactKey,
  artifact: T.Artifact
) -> Maybe<&2, T.OrderedField<T.ProductValue>>:
  match key artifact:
    case T.OriginKey{} T.Artifact{Some{origin}, _, _, _, _, _, _, _}: Some{
      field("origin", origin_product(origin))
    }
    case T.ArtifactPathKey{} T.Artifact{_, Some{path}, _, _, _, _, _, _}: Some{
      field("path", text(path))
    }
    case T.ArtifactIdKey{} T.Artifact{_, _, id, _, _, _, _, _}: Some{field("id", text(id))}
    case T.ArtifactKindKey{} T.Artifact{_, _, _, kind, _, _, _, _}: Some{
      field("kind", text(kind_name(kind)))
    }
    case T.ArtifactNameKey{} T.Artifact{_, _, _, _, name, _, _, _}: Some{field("name", text(name))}
    case T.ArtifactSourceKey{} T.Artifact{_, _, _, _, _, source, _, _}: Some{
      field("source", text(source))
    }
    case T.ArtifactHashKey{} T.Artifact{_, _, _, _, _, _, hash, _}: Some{
      field("sourceHash", text(hash))
    }
    case _ _: None{}

def optional_field(
  head: Maybe<&2, T.OrderedField<T.ProductValue>>,
  tail: Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>
) -> Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>:
  match head tail:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def artifact_fields(
  order: List<&2, T.ArtifactKey>,
  +artifact: T.Artifact
) -> Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>:
  match order:
    case []: Some{[]}
    case head <> tail: optional_field(
      artifact_field(head, artifact),
      artifact_fields(tail, artifact)
    )

def artifact(artifact: T.Artifact) -> Maybe<&2, T.ProductValue>:
  match artifact:
    case T.Artifact{_, _, _, _, _, _, _, +order}:
      Maybe.map(&2, List<&2, T.OrderedField<T.ProductValue>>, T.ProductValue,
        object, artifact_fields(order, artifact))

def omission(reason: Local.Omission) -> String:
  match reason:
    case Local.Unresolved{}: "unresolved"
    case Local.UnsupportedTarget{}: "unsupported"
    case Local.ReferenceLimit{}: "reference-limit"
    case Local.Unavailable{}: "unavailable"

def symbol_text(symbol: ReferenceSymbol) -> String:
  match symbol:
    case ReferenceSymbol{text}: text

def identity_text(identity: ArtifactIdentity) -> String:
  match identity:
    case ArtifactIdentity{text}: text

def site(symbol: ReferenceSymbol) -> T.ProductValue:
  object([field("symbol", text(symbol_text(symbol)))])

def expanded_product(child: Materialization, symbol: ReferenceSymbol) -> Materialization:
  match child:
    case Materialized{value}: Materialized{object([field("kind", text("expanded")),
      field("site", site(symbol)), field("node", value)])}
    case other: other

def reference_product(reference: Reference,
    child: O.NodeAddress -> Materialization) -> Materialization:
  match reference:
    case Included{symbol, identity}: Materialized{object([field("kind", text("included")),
      field("site", site(symbol)), field("target", text(identity_text(identity)))])}
    case Omitted{symbol, target, reason}: Materialized{object([field("kind", text("omitted")),
      field("site", site(symbol)), field("target", object([field("kind", text("unresolved")),
        field("symbol", text(symbol_text(target)))])), field("reason", text(omission(reason)))])}
    case Expanded{symbol, address}: expanded_product(child(address), symbol)

def product_cons(remaining: ProductReferences, value: T.ProductValue) -> ProductReferences:
  match remaining:
    case ProductReferences{rest}: ProductReferences{value <> rest}
    case other: other

def product_prefix(head: Materialization,
    remaining: Unit -> ProductReferences) -> ProductReferences:
  match head:
    case Materialized{value}: product_cons(remaining(Unit{}), value)
    case MaterializationExhausted{}: ProductReferencesExhausted{}
    case MaterializationInvalid{}: ProductReferencesInvalid{}

def reference_products(
  items: List<&2, Reference>,
  child: O.NodeAddress -> Materialization,
  sibling: List<&2, Reference> -> ProductReferences
) -> ProductReferences:
  match items:
    case []: ProductReferences{[]}
    case head <> tail:
      product_prefix(reference_product(head, child), _ => sibling(tail))

def node_product(
  artifact: Maybe<&2, T.ProductValue>,
  references: ProductReferences
) -> Materialization:
  match artifact references:
    case Some{value} ProductReferences{references}:
      Materialized{
        object([field("artifact", value), field("references", T.ProductArray{references})])
      }
    case _ ProductReferencesExhausted{}: MaterializationExhausted{}
    case _ _: MaterializationInvalid{}

def found_node(found: Maybe<&2, Node>, child: O.NodeAddress -> Materialization,
    sibling: List<&2, Reference> -> ProductReferences) -> Materialization:
  match found:
    case None{}: MaterializationInvalid{}
    case Some{Node{_, value, references}}:
      node_product(artifact(value), reference_products(references, child, sibling))

type ProductRequest is Data:
  NodeRequest{forest: Forest, address: O.NodeAddress}
  ReferencesProductRequest{forest: Forest, items: List<&2, Reference>}
type ProductDispatch is Data:
  NodeMaterialization{result: Materialization}
  ReferencesMaterialization{result: ProductReferences}

def as_product(result: ProductDispatch) -> Materialization:
  match result:
    case NodeMaterialization{result}: result
    case _: MaterializationInvalid{}

def as_products(result: ProductDispatch) -> ProductReferences:
  match result:
    case ReferencesMaterialization{result}: result
    case _: ProductReferencesInvalid{}

def product_dispatch(request: ProductRequest, child: ProductRequest -> ProductDispatch,
    sibling: ProductRequest -> ProductDispatch) -> ProductDispatch:
  match request:
    case NodeRequest{+forest, address}:
      match forest:
        case Forest{_, nodes}:
          NodeMaterialization{found_node(node_at(nodes, address),
            address => as_product(child(NodeRequest{forest, address})),
            items => as_products(sibling(ReferencesProductRequest{forest, items})))}
    case ReferencesProductRequest{+forest, items}:
      ReferencesMaterialization{reference_products(items,
        address => as_product(child(NodeRequest{forest, address})),
        rest => as_products(sibling(ReferencesProductRequest{forest, rest})))}

def product_interpret(fuel: Nat, request: ProductRequest) -> ProductDispatch:
  match fuel request:
    case 0n NodeRequest{_, _}: NodeMaterialization{MaterializationExhausted{}}
    case 0n _: ReferencesMaterialization{ProductReferencesExhausted{}}
    case 1n++remaining _:
      product_dispatch(request, next => product_interpret(remaining, next),
        next => product_interpret(remaining, next))

def materialize(fuel: Nat, forest: Forest, address: O.NodeAddress) -> Materialization:
  as_product(product_interpret(fuel, NodeRequest{forest, address}))

def texts(items: List<&2, String>) -> List<&2, T.ProductValue>:
  match items:
    case []: []
    case head <> tail: text(head) <> texts(tail)

def unit_product(root: Materialization, dependencies: List<&2, String>) -> Materialization:
  match root dependencies:
    case Materialized{value} Nil{}: Materialized{object([field("root", value)])}
    case Materialized{value} dependencies:
      Materialized{object([field("root", value), field("sourceDependencies",
        T.ProductArray{texts(dependencies)})])}
    case other _: other

def unit(fuel: Nat, +forest: Forest, dependencies: List<&2, String>) -> Materialization:
  match forest:
    case Forest{None{}, _}: MaterializationInvalid{}
    case Forest{Some{root}, _}: unit_product(materialize(fuel, forest, root), dependencies)

def main() -> Unit:
  Unit{}
