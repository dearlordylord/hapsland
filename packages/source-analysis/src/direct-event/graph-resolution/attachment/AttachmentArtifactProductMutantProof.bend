import Base
import ../RuntimeNatProof.bend as NatFacts
import ../traversal/INTERPRETER_ORDER_PROOF.bend as BoolFacts
import ./AttachmentArtifactMutantOriginProduct.bend as Origin
import ../SourceValidationSpecification.bend as Validation
import ./AttachmentArtifactProductMutantCore.bend as Core
import ../ForestSpecification.bend as F
import ../Types.bend as T

# Private prerequisite of projected_unit_total, not a migration frontier.
# Validation is the actual catalog domain. Both renderers must succeed and
# construct exactly the same ordered product; equality of two None is excluded.
def origin_of(artifact: T.Artifact) -> Maybe<&2, T.BundledOrigin>:
  match artifact:
    case T.Artifact{origin, _, _, _, _, _, _, _}: origin

def kind_exact(kind: T.ArtifactKind) -> {Core.artifact_kind(kind) == F.kind_name(kind) : String}:
  match kind:
    case T.InterfaceArtifact{}: {==}
    case T.TypeAliasArtifact{}: {==}
    case T.StructArtifact{}: {==}
    case T.EnumArtifact{}: {==}
    case T.DatatypeArtifact{}: {==}
    case T.FunctionArtifact{}: {==}
    case T.ClassArtifact{}: {==}

def optional_origin_exact(+origin: Maybe<&2, T.BundledOrigin>,
    valid: {Validation.valid_origin(origin) == True{} : Bool}) ->
    {Core.optional_origin(origin) == Maybe.map(&2, T.BundledOrigin, T.OrderedField<T.ProductValue>,
      value => F.field("origin", F.origin_product(value)), origin)
      : Maybe<&2, T.OrderedField<T.ProductValue>>}:
  match origin:
    case None{}: {==}
    case Some{+value}:
      %Equal.sym(Maybe<&2, T.ProductValue>, Core.origin_product(value), Some{F.origin_product(value)}, Origin.origin_product_total(value, valid)):
        {Core.bind(T.ProductValue, T.OrderedField<T.ProductValue>, _,
          result => Some{Core.field("origin", result)})
          == Some{F.field("origin", F.origin_product(value))}
          : Maybe<&2, T.OrderedField<T.ProductValue>>}
      {==}

def origin_field_exact(+artifact: T.Artifact,
    valid: {Validation.valid_origin(origin_of(artifact)) == True{} : Bool}) ->
    {Core.artifact_field(artifact, T.OriginKey{}) == F.artifact_field(T.OriginKey{}, artifact)
      : Maybe<&2, T.OrderedField<T.ProductValue>>}:
  match artifact:
    case T.Artifact{+origin, _, _, _, _, _, _, _}:
      match origin:
        case None{}: {==}
        case Some{_}: optional_origin_exact(origin, valid)

def path_field_exact(+artifact: T.Artifact) ->
    {Core.artifact_field(artifact, T.ArtifactPathKey{}) == F.artifact_field(T.ArtifactPathKey{}, artifact)
      : Maybe<&2, T.OrderedField<T.ProductValue>>}:
  match artifact:
    case T.Artifact{_, +path, _, _, _, _, _, _}:
      match path:
        case None{}: {==}
        case Some{_}: {==}

def field_exact(+artifact: T.Artifact, +key: T.ArtifactKey,
    valid: {Validation.valid_origin(origin_of(artifact)) == True{} : Bool}) ->
    {Core.artifact_field(artifact, key) == F.artifact_field(key, artifact)
      : Maybe<&2, T.OrderedField<T.ProductValue>>}:
  match artifact:
    case T.Artifact{+origin, +path, _, +kind, _, _, _, _}:
      match key:
        case T.OriginKey{}:
          origin_field_exact(artifact, valid)
        case T.ArtifactPathKey{}:
          path_field_exact(artifact)
        case T.ArtifactKindKey{}:
          Equal.cong(String, Maybe<&2, T.OrderedField<T.ProductValue>>,
            value => Some{F.field("kind", F.text(value))},
            Core.artifact_kind(kind), F.kind_name(kind), kind_exact(kind))
        case T.ArtifactIdKey{}: {==}
        case T.ArtifactNameKey{}: {==}
        case T.ArtifactSourceKey{}: {==}
        case T.ArtifactHashKey{}: {==}

def optional_fields_exact(+head: Maybe<&2, T.OrderedField<T.ProductValue>>,
    +tail: Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>) ->
    {Core.bind(T.OrderedField<T.ProductValue>, List<&2, T.OrderedField<T.ProductValue>>, head,
      value => Core.bind(List<&2, T.OrderedField<T.ProductValue>>,
        List<&2, T.OrderedField<T.ProductValue>>, tail,
        rest => Some{Con{value, rest}})) == F.optional_field(head, tail)
      : Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>}:
  match head tail:
    case None{} _: {==}
    case Some{_} None{}: {==}
    case Some{_} Some{_}: {==}

def fields_exact(+artifact: T.Artifact, +order: List<&2, T.ArtifactKey>,
    +valid: {Validation.valid_origin(origin_of(artifact)) == True{} : Bool}) ->
    {Core.artifact_fields(artifact, order) == F.artifact_fields(order, artifact)
      : Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>}:
  match order:
    case Nil{}: {==}
    case Con{+head, +tail}:
      %field_exact(artifact, head, valid):
        {Core.bind(T.OrderedField<T.ProductValue>, List<&2, T.OrderedField<T.ProductValue>>,
          Core.artifact_field(artifact, head), value =>
            Core.bind(List<&2, T.OrderedField<T.ProductValue>>, List<&2, T.OrderedField<T.ProductValue>>,
              Core.artifact_fields(artifact, tail), rest => Some{Con{value, rest}}))
          == F.optional_field(_, F.artifact_fields(tail, artifact))
          : Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>}
      %fields_exact(artifact, tail, valid):
        {Core.bind(T.OrderedField<T.ProductValue>, List<&2, T.OrderedField<T.ProductValue>>,
          Core.artifact_field(artifact, head), value =>
            Core.bind(List<&2, T.OrderedField<T.ProductValue>>, List<&2, T.OrderedField<T.ProductValue>>,
              Core.artifact_fields(artifact, tail), rest => Some{Con{value, rest}}))
          == F.optional_field(Core.artifact_field(artifact, head), _)
          : Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>}
      optional_fields_exact(Core.artifact_field(artifact, head), Core.artifact_fields(artifact, tail))

def successor_not_zero(+n: Nat, equality: {1n+n == 0n : Nat}) -> Empty:
  %equality : Bool.pick(Type, Nat.is_eq(_, 0n), Empty, Unit)
  Unit{}

def add_zero_right(+a: Nat, +b: Nat, equality: {Nat.add(a, b) == 0n : Nat}) -> {b == 0n : Nat}:
  match a:
    case 0n: equality
    case 1n++n:
      Empty.absurd({b == 0n : Nat}, successor_not_zero(Nat.add(n, b), equality))

def count_tail_zero(+head: T.ArtifactKey, +tail: List<&2, T.ArtifactKey>, +wanted: Nat,
    equality: {Validation.count(Validation.artifact_keys(Con{head, tail}), wanted) == 0n : Nat}) ->
    {Validation.count(Validation.artifact_keys(tail), wanted) == 0n : Nat}:
  add_zero_right(Bool.pick(Nat, Nat.is_eq(Validation.artifact_key(head), wanted), 1n, 0n),
    Validation.count(Validation.artifact_keys(tail), wanted), equality)

def path_of(artifact: T.Artifact) -> Maybe<&2, String>:
  match artifact:
    case T.Artifact{_, path, _, _, _, _, _, _}: path

def origin_allowed(origin: Maybe<&2, T.BundledOrigin>, order: List<&2, T.ArtifactKey>) -> Data:
  match origin:
    case None{}: {Validation.count(Validation.artifact_keys(order), 0n) == 0n : Nat}
    case Some{value}: {Validation.valid_origin(Some{value}) == True{} : Bool}

def path_allowed(path: Maybe<&2, String>, order: List<&2, T.ArtifactKey>) -> Data:
  match path:
    case None{}: {Validation.count(Validation.artifact_keys(order), 1n) == 0n : Nat}
    case Some{_}: Unit

def origin_allowed_tail(+origin: Maybe<&2, T.BundledOrigin>, +head: T.ArtifactKey,
    +tail: List<&2, T.ArtifactKey>, allowed: origin_allowed(origin, Con{head, tail})) -> origin_allowed(origin, tail):
  match origin:
    case None{}: count_tail_zero(head, tail, 0n, allowed)
    case Some{_}: allowed

def path_allowed_tail(+path: Maybe<&2, String>, +head: T.ArtifactKey,
    +tail: List<&2, T.ArtifactKey>, allowed: path_allowed(path, Con{head, tail})) -> path_allowed(path, tail):
  match path:
    case None{}: count_tail_zero(head, tail, 1n, allowed)
    case Some{_}: Unit{}

def origin_success(+artifact: T.Artifact, +tail: List<&2, T.ArtifactKey>,
    allowed: origin_allowed(origin_of(artifact), Con{T.OriginKey{}, tail})) ->
    Exists(T.OrderedField<T.ProductValue>, value => {F.artifact_field(T.OriginKey{}, artifact) == Some{value}
      : Maybe<&2, T.OrderedField<T.ProductValue>>}):
  match artifact:
    case T.Artifact{+origin, _, _, _, _, _, _, _}:
      match origin:
        case None{}:
          Empty.absurd(Exists(T.OrderedField<T.ProductValue>, value => {F.artifact_field(T.OriginKey{}, artifact) == Some{value}
            : Maybe<&2, T.OrderedField<T.ProductValue>>}),
            successor_not_zero(Validation.count(Validation.artifact_keys(tail), 0n), allowed))
        case Some{value}: Tuple{F.field("origin", F.origin_product(value)), {==}}

def path_success(+artifact: T.Artifact, +tail: List<&2, T.ArtifactKey>,
    allowed: path_allowed(path_of(artifact), Con{T.ArtifactPathKey{}, tail})) ->
    Exists(T.OrderedField<T.ProductValue>, value => {F.artifact_field(T.ArtifactPathKey{}, artifact) == Some{value}
      : Maybe<&2, T.OrderedField<T.ProductValue>>}):
  match artifact:
    case T.Artifact{_, +path, _, _, _, _, _, _}:
      match path:
        case None{}:
          Empty.absurd(Exists(T.OrderedField<T.ProductValue>, value => {F.artifact_field(T.ArtifactPathKey{}, artifact) == Some{value}
            : Maybe<&2, T.OrderedField<T.ProductValue>>}),
            successor_not_zero(Validation.count(Validation.artifact_keys(tail), 1n), allowed))
        case Some{value}: Tuple{F.field("path", F.text(value)), {==}}

def field_success(+key: T.ArtifactKey, +artifact: T.Artifact, +tail: List<&2, T.ArtifactKey>,
    origin_ok: origin_allowed(origin_of(artifact), Con{key, tail}),
    path_ok: path_allowed(path_of(artifact), Con{key, tail})) ->
    Exists(T.OrderedField<T.ProductValue>, value => {F.artifact_field(key, artifact) == Some{value}
      : Maybe<&2, T.OrderedField<T.ProductValue>>}):
  match key:
    case T.OriginKey{}: origin_success(artifact, tail, origin_ok)
    case T.ArtifactPathKey{}: path_success(artifact, tail, path_ok)
    case T.ArtifactIdKey{}:
      match artifact:
        case T.Artifact{_, _, value, _, _, _, _, _}: Tuple{F.field("id", F.text(value)), {==}}
    case T.ArtifactKindKey{}:
      match artifact:
        case T.Artifact{_, _, _, value, _, _, _, _}: Tuple{F.field("kind", F.text(F.kind_name(value))), {==}}
    case T.ArtifactNameKey{}:
      match artifact:
        case T.Artifact{_, _, _, _, value, _, _, _}: Tuple{F.field("name", F.text(value)), {==}}
    case T.ArtifactSourceKey{}:
      match artifact:
        case T.Artifact{_, _, _, _, _, value, _, _}: Tuple{F.field("source", F.text(value)), {==}}
    case T.ArtifactHashKey{}:
      match artifact:
        case T.Artifact{_, _, _, _, _, _, value, _}: Tuple{F.field("sourceHash", F.text(value)), {==}}

def prepend_success(+artifact: T.Artifact, +key: T.ArtifactKey, +tail: List<&2, T.ArtifactKey>,
    head_result: Exists(T.OrderedField<T.ProductValue>, value => {F.artifact_field(key, artifact) == Some{value}
      : Maybe<&2, T.OrderedField<T.ProductValue>>}),
    tail_result: Exists(List<&2, T.OrderedField<T.ProductValue>>, value => {F.artifact_fields(tail, artifact) == Some{value}
      : Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>})) ->
    Exists(List<&2, T.OrderedField<T.ProductValue>>, value => {F.artifact_fields(Con{key, tail}, artifact) == Some{value}
      : Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>}):
  match head_result tail_result:
    case Tuple{+head, head_equal} Tuple{+rest, tail_equal}:
      Tuple{Con{head, rest},
        %Equal.sym(Maybe<&2, T.OrderedField<T.ProductValue>>, F.artifact_field(key, artifact), Some{head}, head_equal):
          {F.optional_field(_, F.artifact_fields(tail, artifact)) == Some{Con{head, rest}}
            : Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>}
        %Equal.sym(Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>, F.artifact_fields(tail, artifact), Some{rest}, tail_equal):
          {F.optional_field(Some{head}, _) == Some{Con{head, rest}}
            : Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>}
        {==}}

def fields_success(+order: List<&2, T.ArtifactKey>, +artifact: T.Artifact,
    +origin_ok: origin_allowed(origin_of(artifact), order),
    +path_ok: path_allowed(path_of(artifact), order)) ->
    Exists(List<&2, T.OrderedField<T.ProductValue>>, value => {F.artifact_fields(order, artifact) == Some{value}
      : Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>}):
  match order:
    case Nil{}: Tuple{Nil{}, {==}}
    case Con{+head, +tail}:
      prepend_success(artifact, head, tail, field_success(head, artifact, tail, origin_ok, path_ok),
        fields_success(tail, artifact,
          origin_allowed_tail(origin_of(artifact), head, tail, origin_ok),
          path_allowed_tail(path_of(artifact), head, tail, path_ok)))

def optional_domain(+keys: List<&2, Nat>, +origin: Maybe<&2, T.BundledOrigin>, +path: Maybe<&2, String>) -> Bool:
  Bool.and(Nat.is_eq(Validation.count(keys, 0n), Validation.present(T.BundledOrigin, origin)),
    Bool.and(Nat.is_eq(Validation.count(keys, 1n), Validation.present(String, path)), Validation.valid_origin(origin)))

def optional_domain_valid(+keys: List<&2, Nat>, +origin: Maybe<&2, T.BundledOrigin>, +path: Maybe<&2, String>,
    valid: {Validation.artifact_fields(keys, origin, path) == True{} : Bool}) ->
    {optional_domain(keys, origin, path) == True{} : Bool}:
  BoolFacts.eq_true_of_and_right(Validation.ones(keys, 5n, 2n), optional_domain(keys, origin, path), valid)

def domain_origin_valid(+keys: List<&2, Nat>, +origin: Maybe<&2, T.BundledOrigin>, +path: Maybe<&2, String>,
    valid: {Validation.artifact_fields(keys, origin, path) == True{} : Bool}) ->
    {Validation.valid_origin(origin) == True{} : Bool}:
  BoolFacts.eq_true_of_and_right(Nat.is_eq(Validation.count(keys, 1n), Validation.present(String, path)),
    Validation.valid_origin(origin),
    BoolFacts.eq_true_of_and_right(Nat.is_eq(Validation.count(keys, 0n), Validation.present(T.BundledOrigin, origin)),
      Bool.and(Nat.is_eq(Validation.count(keys, 1n), Validation.present(String, path)), Validation.valid_origin(origin)),
      optional_domain_valid(keys, origin, path, valid)))

def domain_origin_allowed(+origin: Maybe<&2, T.BundledOrigin>, +path: Maybe<&2, String>, +order: List<&2, T.ArtifactKey>,
    valid: {Validation.artifact_fields(Validation.artifact_keys(order), origin, path) == True{} : Bool}) -> origin_allowed(origin, order):
  match origin:
    case None{}:
      NatFacts.eq_of_is_eq(Validation.count(Validation.artifact_keys(order), 0n), 0n,
        BoolFacts.eq_true_of_and_left(Nat.is_eq(Validation.count(Validation.artifact_keys(order), 0n), 0n),
          Bool.and(Nat.is_eq(Validation.count(Validation.artifact_keys(order), 1n), Validation.present(String, path)), True{}),
          optional_domain_valid(Validation.artifact_keys(order), origin, path, valid)))
    case Some{_}: domain_origin_valid(Validation.artifact_keys(order), origin, path, valid)

def domain_path_allowed(+path: Maybe<&2, String>, +origin: Maybe<&2, T.BundledOrigin>, +order: List<&2, T.ArtifactKey>,
    valid: {Validation.artifact_fields(Validation.artifact_keys(order), origin, path) == True{} : Bool}) -> path_allowed(path, order):
  match path:
    case None{}:
      NatFacts.eq_of_is_eq(Validation.count(Validation.artifact_keys(order), 1n), 0n,
        BoolFacts.eq_true_of_and_left(Nat.is_eq(Validation.count(Validation.artifact_keys(order), 1n), 0n), Validation.valid_origin(origin),
          BoolFacts.eq_true_of_and_right(Nat.is_eq(Validation.count(Validation.artifact_keys(order), 0n), Validation.present(T.BundledOrigin, origin)),
            Bool.and(Nat.is_eq(Validation.count(Validation.artifact_keys(order), 1n), 0n), Validation.valid_origin(origin)),
            optional_domain_valid(Validation.artifact_keys(order), origin, path, valid))))
    case Some{_}: Unit{}

def order_of(artifact: T.Artifact) -> List<&2, T.ArtifactKey>:
  match artifact:
    case T.Artifact{_, _, _, _, _, _, _, order}: order

def finish_values(+artifact: T.Artifact, +valid: {Validation.artifact(artifact) == True{} : Bool},
    +values: List<&2, T.OrderedField<T.ProductValue>>,
    +equal: {F.artifact_fields(order_of(artifact), artifact) == Some{values}
      : Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>}) ->
    Exists(T.ProductValue, value => {Core.artifact_product(artifact) == Some{value} : Maybe<&2, T.ProductValue>} &
      {F.artifact(artifact) == Some{value} : Maybe<&2, T.ProductValue>}):
  match artifact:
    case T.Artifact{+origin, +path, +id, +kind, +name, +source, +hash, +order}:
      Tuple{F.object(values), (
        %Equal.sym(Bool, Validation.artifact(artifact), True{}, valid):
          {Core.decide(Maybe<&2, T.ProductValue>, _,
            _ => Core.bind(List<&2, T.OrderedField<T.ProductValue>>, T.ProductValue,
              Core.artifact_fields(artifact, order), fields => Some{Core.object(fields)}),
            _ => None{}) == Some{F.object(values)} : Maybe<&2, T.ProductValue>}
        %Equal.sym(Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>, Core.artifact_fields(artifact, order), F.artifact_fields(order, artifact),
          fields_exact(artifact, order, domain_origin_valid(Validation.artifact_keys(order), origin, path, valid))):
          {Core.bind(List<&2, T.OrderedField<T.ProductValue>>, T.ProductValue, _, fields => Some{Core.object(fields)})
            == Some{F.object(values)} : Maybe<&2, T.ProductValue>}
        %Equal.sym(Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>, F.artifact_fields(order, artifact), Some{values}, equal):
          {Core.bind(List<&2, T.OrderedField<T.ProductValue>>, T.ProductValue, _, fields => Some{Core.object(fields)})
            == Some{F.object(values)} : Maybe<&2, T.ProductValue>}
        {==},
        %Equal.sym(Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>, F.artifact_fields(order, artifact), Some{values}, equal):
          {Maybe.map(&2, List<&2, T.OrderedField<T.ProductValue>>, T.ProductValue, F.object, _) == Some{F.object(values)}
            : Maybe<&2, T.ProductValue>}
        {==})}

def finish_product(+artifact: T.Artifact, valid: {Validation.artifact(artifact) == True{} : Bool},
    result: Exists(List<&2, T.OrderedField<T.ProductValue>>, value => {F.artifact_fields(order_of(artifact), artifact) == Some{value}
      : Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>})) ->
    Exists(T.ProductValue, value => {Core.artifact_product(artifact) == Some{value} : Maybe<&2, T.ProductValue>} &
      {F.artifact(artifact) == Some{value} : Maybe<&2, T.ProductValue>}):
  match result:
    case Tuple{values, equal}: finish_values(artifact, valid, values, equal)

law artifact_product_total:
  for +artifact: T.Artifact
  for valid: {Validation.artifact(artifact) == True{} : Bool}
  Exists(T.ProductValue, value =>
    {Core.artifact_product(artifact) == Some{value} : Maybe<&2, T.ProductValue>} &
    {F.artifact(artifact) == Some{value} : Maybe<&2, T.ProductValue>})

def artifact_product_total(artifact, valid):
  match artifact:
    case T.Artifact{+origin, +path, +id, +kind, +name, +source, +hash, +order}:
      +artifact: T.Artifact = artifact
      +valid: {Validation.artifact(artifact) == True{} : Bool} = valid
      finish_product(artifact, valid, fields_success(order, artifact,
        domain_origin_allowed(origin, path, order, valid),
        domain_path_allowed(path, origin, order, valid)))

def main() -> Unit:
  Unit{}
