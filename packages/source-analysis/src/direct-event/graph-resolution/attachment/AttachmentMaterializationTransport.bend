import ../../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base
import ./AttachmentBuildProductsTransport.bend as Products
import ./AttachmentBuildCopiesProof.bend as Copies
import ./AttachmentProjectionContentsProof.bend as Contents
import ./AttachmentProjectionAllowanceProof.bend as Count
import ./AttachmentRootSelectionProof.bend as Root
import ./AttachmentReferenceMaterializationProof.bend as References
import ./AttachmentRenderedSuffix.bend as Suffix
import ./AttachmentNaturalArithmeticFacts.bend as N
import ./AttachmentUnitProductProof.bend as UnitProduct
import ./AttachmentUnitConstructionProof.bend as UnitConstruction
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B
import ../WholeObservation.bend as O
import ./RetainedForestProjection.bend as P
import ./AttachmentCatalogValidation.bend as ActualFrame
import ./ForestRelation.bend as Relation
import ../Core.bend as Core
import ../Root.bend as PreparedRoot
import ../ForestSpecification.bend as F
import ../ForestAllowance.bend as Allowance
import ../Types.bend as T
import ../traversal/core.bend as Local
import ../traversal/patricia-proof/PATRICIA_RELATION.bend as Patricia

# Private dependency of the approved whole attachment law. Astra agreed the
# statement before proof. This is not another migration acceptance frontier.
# Both successful rendering and exact ordered product equality are conclusions.
def unprepared_product(+root: Nat, +nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +forest: F.Forest, +deps: List<&2, String>, +value: ArtifactValue.ProductValue) -> Type:
  {Core.review_unit(root, nodes, slots, artifacts, deps) == Some{Core.unit_product(value, deps)}
    : Maybe<&2, ArtifactValue.ProductValue>} &
  {F.unit(Allowance.materialization(forest), forest, deps) == F.Materialized{Core.unit_product(value, deps)}
    : F.Materialization}

def transport_root(+forest: F.Forest, +address: O.NodeAddress, +birth: O.NodeAddress,
    +required: Nat, +available: Nat, +value: ArtifactValue.ProductValue,
    fuel: {required == available : Nat}, same_address: {address == birth : O.NodeAddress},
    rendered: {F.materialize(available, forest, address) == F.Materialized{value} : F.Materialization}) ->
    {F.materialize(required, forest, birth) == F.Materialized{value} : F.Materialization}:
  %Equal.sym(Nat, required, available, fuel):
    {F.materialize(_, forest, birth) == F.Materialized{value} : F.Materialization}
  %same_address:
    {F.materialize(available, forest, _) == F.Materialized{value} : F.Materialization}
  rendered

def complete_ready(+root: Nat, +nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +birth: O.NodeAddress, +retained: List<&2, F.Node>,
    +deps: List<&2, String>, +built: Map<&2, Maybe<&2, ArtifactValue.ProductValue>>,
    done: {Products.products(nodes, slots, artifacts) == Some{built} : Maybe<&2, Map<&2, Maybe<&2, ArtifactValue.ProductValue>>>},
    root_present: {F.address_at(addresses, root) == Some{birth} : Maybe<&2, O.NodeAddress>},
    node_done: {P.nodes(nodes, slots, artifacts, addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>},
    ready: References.ready(Local.Expanded{root}, addresses, F.Forest{Some{birth}, retained}, built,
      Nat.add(Suffix.suffix_allowance(nodes, slots), 0n))) ->
    Exists(ArtifactValue.ProductValue, value => unprepared_product(root, nodes, slots, artifacts, F.Forest{Some{birth}, retained}, deps, value)):
  match ready:
    case (+address, (+value, (address_present, (built_present, materialized)))):
      same_address: {address == birth : O.NodeAddress} = Count.some_equal(O.NodeAddress, address, birth,
        Equal.trans(Maybe<&2, O.NodeAddress>, Some{address}, F.address_at(addresses, root), Some{birth},
          Equal.sym(Maybe<&2, O.NodeAddress>, F.address_at(addresses, root), Some{address}, address_present), root_present))
      fuel: {Allowance.materialization(F.Forest{Some{birth}, retained}) == Nat.add(Suffix.suffix_allowance(nodes, slots), 0n) : Nat} =
        Equal.trans(Nat, Allowance.materialization(F.Forest{Some{birth}, retained}), Suffix.suffix_allowance(nodes, slots),
          Nat.add(Suffix.suffix_allowance(nodes, slots), 0n),
          Equal.cong(Nat, Nat, value => Nat.add(value, 2n), Allowance.nodes(retained), Suffix.suffix_weight(nodes, slots),
            Count.nodes(nodes, slots, artifacts, addresses, retained, node_done)),
          Equal.sym(Nat, Nat.add(Suffix.suffix_allowance(nodes, slots), 0n), Suffix.suffix_allowance(nodes, slots), N.add_zero(Suffix.suffix_allowance(nodes, slots))))
      root_materialized: {F.materialize(Allowance.materialization(F.Forest{Some{birth}, retained}), F.Forest{Some{birth}, retained}, birth)
        == F.Materialized{value} : F.Materialization} =
        transport_root(F.Forest{Some{birth}, retained}, address, birth,
          Allowance.materialization(F.Forest{Some{birth}, retained}), Nat.add(Suffix.suffix_allowance(nodes, slots), 0n),
          value, fuel, same_address, materialized)
      Tuple{value, Tuple{
        UnitConstruction.completed(root, nodes, slots, artifacts, deps, built, value, done, built_present),
        %Equal.sym(F.Materialization, F.materialize(Allowance.materialization(F.Forest{Some{birth}, retained}), F.Forest{Some{birth}, retained}, birth),
          F.Materialized{value}, root_materialized):
          {F.unit_product(_, deps) == F.Materialized{Core.unit_product(value, deps)} : F.Materialization}
        UnitProduct.product(value, deps)}}

def complete_built(+root: Nat, +nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +birth: O.NodeAddress, +retained: List<&2, F.Node>, +deps: List<&2, String>,
    aligned: {P.aligned(nodes, addresses, nodes, addresses) == True{} : Bool},
    +root_present: {F.address_at(addresses, root) == Some{birth} : Maybe<&2, O.NodeAddress>},
    node_done: {P.nodes(nodes, slots, artifacts, addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>},
    products: Exists(Map<&2, Maybe<&2, ArtifactValue.ProductValue>>, built =>
      {Products.products(nodes, slots, artifacts) == Some{built} : Maybe<&2, Map<&2, Maybe<&2, ArtifactValue.ProductValue>>>} &
      {Patricia.canonical(Maybe<&2, ArtifactValue.ProductValue>, built) == True{} : Bool} &
      Copies.copies(1n, Suffix.rendered_suffix(nodes, slots, addresses, F.Forest{Some{birth}, retained}, built)))) ->
    Exists(ArtifactValue.ProductValue, value => unprepared_product(root, nodes, slots, artifacts, F.Forest{Some{birth}, retained}, deps, value)):
  match products:
    case (+built, (done, (_, (rendered, _)))):
      complete_ready(root, nodes, slots, artifacts, addresses, birth, retained, deps, built, done, root_present, node_done,
        References.child_ready(nodes, root, slots, addresses, F.Forest{Some{birth}, retained}, built, 0n,
          Root.count(nodes, addresses, nodes, addresses, root, birth, aligned, root_present), rendered))

def complete_forest(+root: Nat, +nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +forest: F.Forest, +deps: List<&2, String>,
    aligned: {P.aligned(nodes, addresses, nodes, addresses) == True{} : Bool},
    contents: Exists(O.NodeAddress, birth => Exists(List<&2, F.Node>, retained =>
      {F.address_at(addresses, root) == Some{birth} : Maybe<&2, O.NodeAddress>} &
      {P.nodes(nodes, slots, artifacts, addresses) == Some{retained} : Maybe<&2, List<&2, F.Node>>} &
      {Some{F.Forest{Some{birth}, retained}} == Some{forest} : Maybe<&2, F.Forest>})),
    products: Exists(Map<&2, Maybe<&2, ArtifactValue.ProductValue>>, built =>
      {Products.products(nodes, slots, artifacts) == Some{built} : Maybe<&2, Map<&2, Maybe<&2, ArtifactValue.ProductValue>>>} &
      {Patricia.canonical(Maybe<&2, ArtifactValue.ProductValue>, built) == True{} : Bool} &
      Copies.copies(1n, Suffix.rendered_suffix(nodes, slots, addresses, forest, built)))) ->
    Exists(ArtifactValue.ProductValue, value => unprepared_product(root, nodes, slots, artifacts, forest, deps, value)):
  match contents:
    case (+birth, (+retained, (root_present, (node_done, same)))):
      +same_forest: {F.Forest{Some{birth}, retained} == forest : F.Forest} = Count.some_equal(F.Forest, F.Forest{Some{birth}, retained}, forest, same)
      fixed_products: Exists(Map<&2, Maybe<&2, ArtifactValue.ProductValue>>, built =>
        {Products.products(nodes, slots, artifacts) == Some{built} : Maybe<&2, Map<&2, Maybe<&2, ArtifactValue.ProductValue>>>} &
        {Patricia.canonical(Maybe<&2, ArtifactValue.ProductValue>, built) == True{} : Bool} &
        Copies.copies(1n, Suffix.rendered_suffix(nodes, slots, addresses, F.Forest{Some{birth}, retained}, built))) =
        %Equal.sym(F.Forest, F.Forest{Some{birth}, retained}, forest, same_forest):
          Exists(Map<&2, Maybe<&2, ArtifactValue.ProductValue>>, built =>
            {Products.products(nodes, slots, artifacts) == Some{built} : Maybe<&2, Map<&2, Maybe<&2, ArtifactValue.ProductValue>>>} &
            {Patricia.canonical(Maybe<&2, ArtifactValue.ProductValue>, built) == True{} : Bool} &
            Copies.copies(1n, Suffix.rendered_suffix(nodes, slots, addresses, _, built)))
        products
      %same_forest: Exists(ArtifactValue.ProductValue, value => unprepared_product(root, nodes, slots, artifacts, _, deps, value))
      complete_built(root, nodes, slots, artifacts, addresses, birth, retained, deps, aligned, root_present, node_done, fixed_products)

def complete_projection(+root: Nat, +nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>, +forest: F.Forest, +deps: List<&2, String>,
    contents: {Bool.and(P.aligned(nodes, addresses, nodes, addresses), Bool.and(P.catalog_unique(artifacts, artifacts),
      Bool.and(P.slots_owned(slots, nodes), P.forward_nodes(nodes, slots)))) == True{} : Bool} &
      {P.forest(F.address_at(addresses, root), P.nodes(nodes, slots, artifacts, addresses)) == Some{forest} : Maybe<&2, F.Forest>},
    products: Exists(Map<&2, Maybe<&2, ArtifactValue.ProductValue>>, built =>
      {Products.products(nodes, slots, artifacts) == Some{built} : Maybe<&2, Map<&2, Maybe<&2, ArtifactValue.ProductValue>>>} &
      {Patricia.canonical(Maybe<&2, ArtifactValue.ProductValue>, built) == True{} : Bool} &
      Copies.copies(1n, Suffix.rendered_suffix(nodes, slots, addresses, forest, built)))) ->
    Exists(ArtifactValue.ProductValue, value => unprepared_product(root, nodes, slots, artifacts, forest, deps, value)):
  match contents:
    case (guards, present):
      complete_forest(root, nodes, slots, artifacts, addresses, forest, deps,
        B.eq_true_of_and_left(P.aligned(nodes, addresses, nodes, addresses), Bool.and(P.catalog_unique(artifacts, artifacts),
          Bool.and(P.slots_owned(slots, nodes), P.forward_nodes(nodes, slots))), guards),
        Contents.forest_contents(F.address_at(addresses, root), P.nodes(nodes, slots, artifacts, addresses), forest, present), products)

def common_product(+root: Nat, +nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +forest: F.Forest, +deps: List<&2, String>, +fingerprint: Maybe<&2, String>, +value: ArtifactValue.ProductValue) -> Type:
  {PreparedRoot.fingerprint_product(Core.review_unit(root, nodes, slots, artifacts, deps), fingerprint) == Some{value}
    : Maybe<&2, ArtifactValue.ProductValue>} &
  {F.prepared_unit(Allowance.materialization(forest), forest, deps, fingerprint) == F.Materialized{value}
    : F.Materialization}

def prepare_product(+root: Nat, +nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +forest: F.Forest, +deps: List<&2, String>, +fingerprint: Maybe<&2, String>,
    result: Exists(ArtifactValue.ProductValue, value => unprepared_product(root, nodes, slots, artifacts, forest, deps, value))) ->
    Exists(ArtifactValue.ProductValue, value => common_product(root, nodes, slots, artifacts, forest, deps, fingerprint, value)):
  match result:
    case (+value, (actual, reference)):
      Tuple{UnitProduct.prepared_value(value, deps, fingerprint), Tuple{
        %Equal.sym(Maybe<&2, ArtifactValue.ProductValue>, Core.review_unit(root, nodes, slots, artifacts, deps),
          Some{Core.unit_product(value, deps)}, actual):
          {PreparedRoot.fingerprint_product(_, fingerprint) == Some{UnitProduct.prepared_value(value, deps, fingerprint)} : Maybe<&2, ArtifactValue.ProductValue>}
        UnitProduct.actual_prepared(value, deps, fingerprint),
        %Equal.sym(F.Materialization, F.unit(Allowance.materialization(forest), forest, deps),
          F.Materialized{Core.unit_product(value, deps)}, reference):
          {F.prepared_product(_, fingerprint) == F.Materialized{UnitProduct.prepared_value(value, deps, fingerprint)} : F.Materialization}
        %UnitProduct.product(value, deps):
          {F.prepared_product(_, fingerprint) == F.Materialized{UnitProduct.prepared_value(value, deps, fingerprint)} : F.Materialization}
        UnitProduct.reference_prepared(value, deps, fingerprint)}}

law projected_unit_total:
  for +root: Nat
  for +nodes: List<&2, Local.PlannedNode>
  for +slots: List<&2, Local.ReferenceSlot>
  for +artifacts: List<&2, T.ArtifactEntry>
  for +addresses: List<&2, F.AddressEntry>
  for +forest: F.Forest
  for +next_episode: Nat
  for +deps: List<&2, String>
  for +fingerprint: Maybe<&2, String>
  for projected: {P.project(root, nodes, slots, artifacts, addresses) == Some{forest}
    : Maybe<&2, F.Forest>}
  for artifacts_valid: {ActualFrame.catalog_valid(artifacts) == True{} : Bool}
  for forest_valid: {Relation.frame_forest(forest, next_episode) == True{} : Bool}
  Exists(ArtifactValue.ProductValue, value => common_product(root, nodes, slots, artifacts, forest, deps, fingerprint, value))

def projected_unit_total(root, nodes, slots, artifacts, addresses, forest, next_episode, deps, fingerprint, projected, artifacts_valid, forest_valid):
  +root = root
  +nodes = nodes
  +slots = slots
  +artifacts = artifacts
  +addresses = addresses
  +forest = forest
  +deps = deps
  +projected = projected
  prepare_product(root, nodes, slots, artifacts, forest, deps, fingerprint,
    complete_projection(root, nodes, slots, artifacts, addresses, forest, deps,
    Contents.project_contents(root, nodes, slots, artifacts, addresses, forest, projected),
    Products.rendered_products(root, nodes, slots, artifacts, addresses, forest, next_episode, 1n, projected, artifacts_valid, forest_valid)))

def main() -> Unit:
  Unit{}
