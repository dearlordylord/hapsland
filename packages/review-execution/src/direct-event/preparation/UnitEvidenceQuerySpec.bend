import Base
import ../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import ./UnitEvidence.bend as Evidence
import ./CanonicalJson.bend as Json

# Independent eager query equations retained solely as the equivalence oracle.
# Arbitrary lists are intentional: duplicates and unsorted paths remain covered.
def field_list(
  +key: String,
  fields: List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>
) -> Maybe<&2, ArtifactValue.ProductValue>:
  match fields:
    case []: None{}
    case ArtifactValue.OrderedField{+candidate, value} <> tail:
      Bool.pick(
        Maybe<&2, ArtifactValue.ProductValue>,
        String.eq(key, candidate),
        Some{value},
        field_list(key, tail)
      )

def field(key: String, value: ArtifactValue.ProductValue) -> Maybe<&2, ArtifactValue.ProductValue>:
  match value:
    case ArtifactValue.ProductObject{fields}: field_list(key, fields)
    case _: None{}

def matching_fields(
  keys: List<&2, String>,
  +actual: ArtifactValue.ProductValue,
  +candidate: ArtifactValue.ProductValue
) -> Bool:
  match keys:
    case []: True{}
    case +key <> tail:
      Bool.and(
        Evidence.same_text(field(key, actual), field(key, candidate)),
        matching_fields(tail, actual, candidate)
      )

def origin_equal(
  actual: Maybe<&2, ArtifactValue.ProductValue>,
  candidate: Maybe<&2, ArtifactValue.ProductValue>
) -> Bool:
  match actual candidate:
    case Some{actual} Some{candidate}:
      matching_fields(
        ["kind", "library", "compilerVersion", "compilerSource", "moduleHash", "declarationHash"],
        actual,
        candidate
      )
    case _ _: False{}

def member(+artifact: ArtifactValue.ProductValue, +actual: ArtifactValue.ProductValue) -> Bool:
  Bool.and(Evidence.absent(field("path", artifact)),
    Bool.and(Evidence.origin_shape(field("origin", artifact)),
      Bool.and(matching_fields(["id", "kind", "name", "source", "sourceHash"], actual, artifact),
        origin_equal(field("origin", actual), field("origin", artifact)))))

def bundled(
  +artifact: ArtifactValue.ProductValue,
  catalog: List<&2, ArtifactValue.ProductValue>
) -> Bool:
  match catalog:
    case []: False{}
    case actual <> tail: Bool.or(member(artifact, actual), bundled(artifact, tail))

def path_insert_result(
  less: Bool,
  +path: String,
  head: String,
  tail: List<&2, String>,
  inserted: List<&2, String>
) -> List<&2, String>:
  match less:
    case True{}: path <> head <> tail
    case False{}: head <> inserted

def path_insert_same(
  same: Bool,
  +path: String,
  +head: String,
  +tail: List<&2, String>,
  inserted: List<&2, String>
) -> List<&2, String>:
  match same:
    case True{}: head <> tail
    case False{}: path_insert_result(
      Json.units_le(Json.utf16(path), Json.utf16(head)),
      path,
      head,
      tail,
      inserted
    )

def path_insert(+path: String, paths: List<&2, String>) -> List<&2, String>:
  match paths:
    case []: [path]
    case +head <> +tail: path_insert_same(
      String.eq(path, head),
      path,
      head,
      tail,
      path_insert(path, tail)
    )

def main() -> Unit:
  Unit{}
