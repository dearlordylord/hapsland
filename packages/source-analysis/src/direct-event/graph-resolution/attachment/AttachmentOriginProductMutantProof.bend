import Base
import ./AttachmentOriginRenderingProof.bend as Fields
import ../SourceValidationSpecification.bend as Validation
import ./AttachmentOriginProductMutantCore.bend as Core
import ../ForestSpecification.bend as F
import ../Types.bend as T

# Private dependency of complete artifact totality, then projected_unit_total.
# Shared domain validation is explicit; F constructs the result independently.
# Success is a conclusion, not an assumed materialization result.
law origin_product_total:
  for +origin: T.BundledOrigin
  for valid: {Validation.valid_origin(Some{origin}) == True{} : Bool}
  {Core.origin_product(origin) == Some{F.origin_product(origin)}
    : Maybe<&2, T.ProductValue>}

def origin_product_total(origin, valid):
  match origin:
    case T.BundledOrigin{+version, +source, +module_hash, +declaration_hash, +order}:
      +value: T.BundledOrigin = T.BundledOrigin{version, source, module_hash, declaration_hash, order}
      %Equal.sym(Bool, Validation.valid_origin(Some{value}), True{}, valid):
        {Core.decide(Maybe<&2, T.ProductValue>, _,
          _ => Some{Core.object(Core.origin_fields(value, order))},
          _ => None{}) == Some{F.origin_product(value)}
          : Maybe<&2, T.ProductValue>}
      Equal.cong(
        List<&2, T.OrderedField<T.ProductValue>>,
        Maybe<&2, T.ProductValue>,
        fields => Some{T.ProductObject{fields}},
        Core.origin_fields(value, order),
        F.origin_fields(order, value),
        Fields.origin_fields_exact(value, order))

def main() -> Unit:
  Unit{}
