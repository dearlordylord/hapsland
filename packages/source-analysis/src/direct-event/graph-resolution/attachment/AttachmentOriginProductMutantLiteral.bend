import Base
import ./AttachmentOriginRenderingProof.bend as Fields
import ../SourceValidationSpecification.bend as Validation
import ./AttachmentOriginProductMutantCore.bend as Core
import ../ForestSpecification.bend as F
import ../Types.bend as T

# Private dependency of complete artifact totality, then projected_unit_total.
# Shared domain validation is explicit; F constructs the result independently.
# Success is a conclusion, not an assumed materialization result.
def fixture_origin() -> T.BundledOrigin:
  T.BundledOrigin{String.append("v", SCon{Chr{55296}, SNil{}}), "s\0", String.append("m", SCon{Chr{55357}, SCon{Chr{56832}, SNil{}}}), "d", [T.DeclarationHashKey{}, T.ModuleHashKey{}, T.CompilerSourceKey{}, T.CompilerVersionKey{}, T.LibraryKey{}, T.OriginKindKey{}]}


def valid_premise() -> {Validation.valid_origin(Some{fixture_origin()}) == True{} : Bool}:
  {==}
def literal_origin_product() -> {Core.origin_product(fixture_origin()) == Some{F.origin_product(fixture_origin())} : Maybe<&2, T.ProductValue>}:
  {==}
def main() -> Unit:
  Unit{}
