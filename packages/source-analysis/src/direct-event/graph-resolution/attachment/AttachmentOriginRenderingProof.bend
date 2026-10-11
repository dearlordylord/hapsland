import Base
import ../Core.bend as Core
import ../ForestSpecification.bend as F
import ../Types.bend as T

# Private transports for projected_unit_total. No runtime representation or
# separate migration frontier; they pin the full ordered origin fields.
# Origin text and the requested field order are arbitrary typed inputs.
law origin_field_exact:
  for +origin: T.BundledOrigin
  for +key: T.OriginKey
  {Core.origin_field(origin, key) == F.origin_field(key, origin)
    : T.OrderedField<T.ProductValue>}

law origin_fields_exact:
  for +origin: T.BundledOrigin
  for +order: List<&2, T.OriginKey>
  {Core.origin_fields(origin, order) == F.origin_fields(order, origin)
    : List<&2, T.OrderedField<T.ProductValue>>}


def origin_field_exact(origin, key):
  match origin:
    case T.BundledOrigin{_, _, _, _, _}:
      match key:
        case T.OriginKindKey{}: {==}
        case T.LibraryKey{}: {==}
        case T.CompilerVersionKey{}: {==}
        case T.CompilerSourceKey{}: {==}
        case T.ModuleHashKey{}: {==}
        case T.DeclarationHashKey{}: {==}

def origin_fields_exact(origin, order):
  match order:
    case Nil{}: {==}
    case Con{+head, +tail}:
      +origin = origin
      %origin_field_exact(origin, head):
        {Con{Core.origin_field(origin, head), Core.origin_fields(origin, tail)}
          == Con{_, F.origin_fields(tail, origin)}
          : List<&2, T.OrderedField<T.ProductValue>>}
      Equal.cong(
        List<&2, T.OrderedField<T.ProductValue>>,
        List<&2, T.OrderedField<T.ProductValue>>,
        fields => Con{Core.origin_field(origin, head), fields},
        Core.origin_fields(origin, tail),
        F.origin_fields(tail, origin),
        origin_fields_exact(origin, tail)
      )

def main() -> Unit:
  Unit{}
