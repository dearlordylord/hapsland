import Base
import ./AttachmentOriginProductTransport.bend as Origin
import ../SourceValidationSpecification.bend as Validation
import ../Core.bend as Core
import ../ForestSpecification.bend as F
import ../Types.bend as T

# Private prerequisite of projected_unit_total, not a migration frontier.
# Validation is the actual catalog domain. Both renderers must succeed and
# construct exactly the same ordered product; equality of two None is excluded.
def fixture_origin() -> T.BundledOrigin:
  T.BundledOrigin{String.append("v", SCon{Chr{55296}, SNil{}}), "s\0", String.append("m", SCon{Chr{55357}, SCon{Chr{56832}, SNil{}}}), "d", [T.DeclarationHashKey{}, T.ModuleHashKey{}, T.CompilerSourceKey{}, T.CompilerVersionKey{}, T.LibraryKey{}, T.OriginKindKey{}]}


def artifact_0() -> T.Artifact:
  T.Artifact{None{}, None{}, "id", T.InterfaceArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_0() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("interface")), F.field("id", F.text("id"))])
def valid_0() -> {Validation.artifact(artifact_0()) == True{} : Bool}:
  {==}
def claim_0() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_0()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_0()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_0(), ({==}, {==})}
def artifact_1() -> T.Artifact:
  T.Artifact{None{}, None{}, "id", T.TypeAliasArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_1() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("type-alias")), F.field("id", F.text("id"))])
def valid_1() -> {Validation.artifact(artifact_1()) == True{} : Bool}:
  {==}
def claim_1() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_1()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_1()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_1(), ({==}, {==})}
def artifact_2() -> T.Artifact:
  T.Artifact{None{}, None{}, "id", T.StructArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_2() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("struct")), F.field("id", F.text("id"))])
def valid_2() -> {Validation.artifact(artifact_2()) == True{} : Bool}:
  {==}
def claim_2() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_2()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_2()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_2(), ({==}, {==})}
def artifact_3() -> T.Artifact:
  T.Artifact{None{}, None{}, "id", T.EnumArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_3() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("enum")), F.field("id", F.text("id"))])
def valid_3() -> {Validation.artifact(artifact_3()) == True{} : Bool}:
  {==}
def claim_3() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_3()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_3()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_3(), ({==}, {==})}
def artifact_4() -> T.Artifact:
  T.Artifact{None{}, None{}, "id", T.DatatypeArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_4() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("datatype")), F.field("id", F.text("id"))])
def valid_4() -> {Validation.artifact(artifact_4()) == True{} : Bool}:
  {==}
def claim_4() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_4()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_4()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_4(), ({==}, {==})}
def artifact_5() -> T.Artifact:
  T.Artifact{None{}, None{}, "id", T.FunctionArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_5() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("function")), F.field("id", F.text("id"))])
def valid_5() -> {Validation.artifact(artifact_5()) == True{} : Bool}:
  {==}
def claim_5() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_5()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_5()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_5(), ({==}, {==})}
def artifact_6() -> T.Artifact:
  T.Artifact{None{}, None{}, "id", T.ClassArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_6() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("class")), F.field("id", F.text("id"))])
def valid_6() -> {Validation.artifact(artifact_6()) == True{} : Bool}:
  {==}
def claim_6() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_6()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_6()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_6(), ({==}, {==})}
def artifact_7() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, None{}, "id", T.InterfaceArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_7() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("interface")), F.field("id", F.text("id"))])
def valid_7() -> {Validation.artifact(artifact_7()) == True{} : Bool}:
  {==}
def claim_7() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_7()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_7()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_7(), ({==}, {==})}
def artifact_8() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, None{}, "id", T.TypeAliasArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_8() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("type-alias")), F.field("id", F.text("id"))])
def valid_8() -> {Validation.artifact(artifact_8()) == True{} : Bool}:
  {==}
def claim_8() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_8()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_8()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_8(), ({==}, {==})}
def artifact_9() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, None{}, "id", T.StructArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_9() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("struct")), F.field("id", F.text("id"))])
def valid_9() -> {Validation.artifact(artifact_9()) == True{} : Bool}:
  {==}
def claim_9() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_9()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_9()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_9(), ({==}, {==})}
def artifact_10() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, None{}, "id", T.EnumArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_10() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("enum")), F.field("id", F.text("id"))])
def valid_10() -> {Validation.artifact(artifact_10()) == True{} : Bool}:
  {==}
def claim_10() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_10()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_10()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_10(), ({==}, {==})}
def artifact_11() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, None{}, "id", T.DatatypeArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_11() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("datatype")), F.field("id", F.text("id"))])
def valid_11() -> {Validation.artifact(artifact_11()) == True{} : Bool}:
  {==}
def claim_11() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_11()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_11()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_11(), ({==}, {==})}
def artifact_12() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, None{}, "id", T.FunctionArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_12() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("function")), F.field("id", F.text("id"))])
def valid_12() -> {Validation.artifact(artifact_12()) == True{} : Bool}:
  {==}
def claim_12() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_12()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_12()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_12(), ({==}, {==})}
def artifact_13() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, None{}, "id", T.ClassArtifact{}, "name", "src\0", "hash", [T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_13() -> T.ProductValue:
  F.object([F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("class")), F.field("id", F.text("id"))])
def valid_13() -> {Validation.artifact(artifact_13()) == True{} : Bool}:
  {==}
def claim_13() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_13()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_13()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_13(), ({==}, {==})}
def artifact_14() -> T.Artifact:
  T.Artifact{None{}, Some{"p\0"}, "id", T.InterfaceArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_14() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("interface")), F.field("id", F.text("id"))])
def valid_14() -> {Validation.artifact(artifact_14()) == True{} : Bool}:
  {==}
def claim_14() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_14()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_14()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_14(), ({==}, {==})}
def artifact_15() -> T.Artifact:
  T.Artifact{None{}, Some{"p\0"}, "id", T.TypeAliasArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_15() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("type-alias")), F.field("id", F.text("id"))])
def valid_15() -> {Validation.artifact(artifact_15()) == True{} : Bool}:
  {==}
def claim_15() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_15()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_15()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_15(), ({==}, {==})}
def artifact_16() -> T.Artifact:
  T.Artifact{None{}, Some{"p\0"}, "id", T.StructArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_16() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("struct")), F.field("id", F.text("id"))])
def valid_16() -> {Validation.artifact(artifact_16()) == True{} : Bool}:
  {==}
def claim_16() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_16()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_16()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_16(), ({==}, {==})}
def artifact_17() -> T.Artifact:
  T.Artifact{None{}, Some{"p\0"}, "id", T.EnumArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_17() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("enum")), F.field("id", F.text("id"))])
def valid_17() -> {Validation.artifact(artifact_17()) == True{} : Bool}:
  {==}
def claim_17() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_17()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_17()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_17(), ({==}, {==})}
def artifact_18() -> T.Artifact:
  T.Artifact{None{}, Some{"p\0"}, "id", T.DatatypeArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_18() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("datatype")), F.field("id", F.text("id"))])
def valid_18() -> {Validation.artifact(artifact_18()) == True{} : Bool}:
  {==}
def claim_18() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_18()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_18()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_18(), ({==}, {==})}
def artifact_19() -> T.Artifact:
  T.Artifact{None{}, Some{"p\0"}, "id", T.FunctionArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_19() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("function")), F.field("id", F.text("id"))])
def valid_19() -> {Validation.artifact(artifact_19()) == True{} : Bool}:
  {==}
def claim_19() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_19()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_19()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_19(), ({==}, {==})}
def artifact_20() -> T.Artifact:
  T.Artifact{None{}, Some{"p\0"}, "id", T.ClassArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_20() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("kind", F.text("class")), F.field("id", F.text("id"))])
def valid_20() -> {Validation.artifact(artifact_20()) == True{} : Bool}:
  {==}
def claim_20() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_20()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_20()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_20(), ({==}, {==})}
def artifact_21() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, Some{"p\0"}, "id", T.InterfaceArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_21() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("interface")), F.field("id", F.text("id"))])
def valid_21() -> {Validation.artifact(artifact_21()) == True{} : Bool}:
  {==}
def claim_21() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_21()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_21()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_21(), ({==}, {==})}
def artifact_22() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, Some{"p\0"}, "id", T.TypeAliasArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_22() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("type-alias")), F.field("id", F.text("id"))])
def valid_22() -> {Validation.artifact(artifact_22()) == True{} : Bool}:
  {==}
def claim_22() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_22()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_22()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_22(), ({==}, {==})}
def artifact_23() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, Some{"p\0"}, "id", T.StructArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_23() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("struct")), F.field("id", F.text("id"))])
def valid_23() -> {Validation.artifact(artifact_23()) == True{} : Bool}:
  {==}
def claim_23() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_23()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_23()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_23(), ({==}, {==})}
def artifact_24() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, Some{"p\0"}, "id", T.EnumArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_24() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("enum")), F.field("id", F.text("id"))])
def valid_24() -> {Validation.artifact(artifact_24()) == True{} : Bool}:
  {==}
def claim_24() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_24()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_24()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_24(), ({==}, {==})}
def artifact_25() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, Some{"p\0"}, "id", T.DatatypeArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_25() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("datatype")), F.field("id", F.text("id"))])
def valid_25() -> {Validation.artifact(artifact_25()) == True{} : Bool}:
  {==}
def claim_25() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_25()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_25()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_25(), ({==}, {==})}
def artifact_26() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, Some{"p\0"}, "id", T.FunctionArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_26() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("function")), F.field("id", F.text("id"))])
def valid_26() -> {Validation.artifact(artifact_26()) == True{} : Bool}:
  {==}
def claim_26() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_26()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_26()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_26(), ({==}, {==})}
def artifact_27() -> T.Artifact:
  T.Artifact{Some{fixture_origin()}, Some{"p\0"}, "id", T.ClassArtifact{}, "name", "src\0", "hash", [T.ArtifactPathKey{}, T.ArtifactHashKey{}, T.ArtifactSourceKey{}, T.ArtifactNameKey{}, T.OriginKey{}, T.ArtifactKindKey{}, T.ArtifactIdKey{}]}
def value_27() -> T.ProductValue:
  F.object([F.field("path", F.text("p\0")), F.field("sourceHash", F.text("hash")), F.field("source", F.text("src\0")), F.field("name", F.text("name")), F.field("origin", F.origin_product(fixture_origin())), F.field("kind", F.text("class")), F.field("id", F.text("id"))])
def valid_27() -> {Validation.artifact(artifact_27()) == True{} : Bool}:
  {==}
def claim_27() -> Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact_27()) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact_27()) == Some{value} : Maybe<&2, T.ProductValue>}):
  Tuple{value_27(), ({==}, {==})}
def main() -> Unit:
  Unit{}
