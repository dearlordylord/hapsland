import Base
import ../../../../source-artifacts/src/direct-event/value/Value.bend as Value
import ./UnitEvidence.bend as Evidence
import ./UnitEvidenceQuerySpec.bend as Spec

# Exact original query equations approved by Astra; proofs in UnitEvidenceQueryProof.
# No uniqueness, validity, or sorted-input premise may narrow these laws.

law field_exact:
  for +key: String
  for +fields: List<&2, Value.OrderedField<Value.ProductValue>>
  {Evidence.field_list(key, fields) == Spec.field_list(key, fields)
    : Maybe<&2, Value.ProductValue>}

law matching_exact:
  for +keys: List<&2, String>
  for +actual: Value.ProductValue
  for +candidate: Value.ProductValue
  {
    Evidence.matching_fields(keys, actual, candidate)
    == Spec.matching_fields(keys, actual, candidate)
    : Bool
  }

law member_exact:
  for +artifact: Value.ProductValue
  for +actual: Value.ProductValue
  {Evidence.member(artifact, actual) == Spec.member(artifact, actual) : Bool}

law bundled_exact:
  for +artifact: Value.ProductValue
  for +catalog: List<&2, Value.ProductValue>
  {Evidence.bundled(artifact, catalog) == Spec.bundled(artifact, catalog) : Bool}

law path_exact:
  for +path: String
  for +paths: List<&2, String>
  {Evidence.path_insert(path, paths) == Spec.path_insert(path, paths) : List<&2, String>}

def main() -> Unit:
  Unit{}
