import ../../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base
import ../Core.bend as Core
import ../Root.bend as PreparedRoot
import ../ForestSpecification.bend as F

# Direct dependency of projected_unit_total: ordered dependencies, including
# duplicates and the present empty-array field, use the actual builders.
def dependencies(items: List<&2, String>) ->
    {Core.dependency_products(items) == F.texts(items) : List<&2, ArtifactValue.ProductValue>}:
  match items:
    case []: {==}
    case +head <> +tail:
      %dependencies(tail):
        {Core.text(head) <> Core.dependency_products(tail) == F.text(head) <> _ : List<&2, ArtifactValue.ProductValue>}
      {==}

def product(+root: ArtifactValue.ProductValue, items: List<&2, String>) ->
    {F.unit_product(F.Materialized{root}, items)
      == F.Materialized{Core.unit_product(root, items)} : F.Materialization}:
  match items:
    case []: {==}
    case +head <> +tail:
      %Equal.sym(List<&2, ArtifactValue.ProductValue>, Core.dependency_products(head <> tail), F.texts(head <> tail), dependencies(head <> tail)):
        {F.unit_product(F.Materialized{root}, head <> tail)
          == F.Materialized{Core.object([Core.field("root", root),
            Core.field("sourceDependencies", ArtifactValue.ProductArray{_})])} : F.Materialization}
      {==}

# Concrete witness for the same whole unit, including optional first-field
# metadata. Both equalities below use the actual and independent builders.
def prepared_value(root: ArtifactValue.ProductValue, deps: List<&2, String>, fingerprint: Maybe<&2, String>) -> ArtifactValue.ProductValue:
  match fingerprint:
    case None{}: Core.unit_product(root, deps)
    case Some{value}: Core.object([Core.field("bindingFingerprint", Core.text(value)),
      Core.field("root", root), Core.field("sourceDependencies", ArtifactValue.ProductArray{Core.dependency_products(deps)})])

def actual_prepared(+root: ArtifactValue.ProductValue, +deps: List<&2, String>, +fingerprint: Maybe<&2, String>) ->
    {PreparedRoot.fingerprint_product(Some{Core.unit_product(root, deps)}, fingerprint)
      == Some{prepared_value(root, deps, fingerprint)} : Maybe<&2, ArtifactValue.ProductValue>}:
  match fingerprint:
    case None{}: {==}
    case Some{_}: {==}

def reference_prepared(+root: ArtifactValue.ProductValue, +deps: List<&2, String>, +fingerprint: Maybe<&2, String>) ->
    {F.prepared_product(F.unit_product(F.Materialized{root}, deps), fingerprint)
      == F.Materialized{prepared_value(root, deps, fingerprint)} : F.Materialization}:
  match fingerprint:
    case None{}: product(root, deps)
    case Some{+value}:
      %Equal.sym(F.Materialization, F.unit_product(F.Materialized{root}, deps), F.Materialized{Core.unit_product(root, deps)}, product(root, deps)):
        {F.prepared_product(_, Some{value}) == F.Materialized{prepared_value(root, deps, Some{value})} : F.Materialization}
      {==}

def main() -> Unit:
  Unit{}
