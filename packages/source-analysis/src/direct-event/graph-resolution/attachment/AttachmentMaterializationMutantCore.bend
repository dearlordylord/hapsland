import Base
import ../Types.bend as T
import ../traversal/core.bend as Local

# Pure result construction for the entire resolver. No host builds ReviewUnit.
def decide(-Value: Data, condition: Bool, yes: Unit -> Value, no: Unit -> Value) -> Value:
  match condition:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})

def bind(
  -Value: Data,
  -Output: Data,
  value: Maybe<&2, Value>,
  next: Value -> Maybe<&2, Output>
) -> Maybe<&2, Output>:
  Maybe.bind(&2, Value, Output, value, next)

def field(key: String, value: T.ProductValue) -> T.OrderedField<T.ProductValue>:
  T.OrderedField{key, value}

def object(fields: List<&2, T.OrderedField<T.ProductValue>>) -> T.ProductValue:
  T.ProductObject{fields}

def text(value: String) -> T.ProductValue:
  T.ProductText{value}

def artifact_kind(kind: T.ArtifactKind) -> String:
  match kind:
    case T.InterfaceArtifact{}: "interface"
    case T.TypeAliasArtifact{}: "type-alias"
    case T.StructArtifact{}: "struct"
    case T.EnumArtifact{}: "enum"
    case T.DatatypeArtifact{}: "datatype"
    case T.FunctionArtifact{}: "function"
    case T.ClassArtifact{}: "class"

def artifact_is_function(kind: T.ArtifactKind) -> Bool:
  match kind:
    case T.FunctionArtifact{}: True{}
    case _: False{}

def origin_key(key: T.OriginKey) -> Nat:
  match key:
    case T.OriginKindKey{}: 0n
    case T.LibraryKey{}: 1n
    case T.CompilerVersionKey{}: 2n
    case T.CompilerSourceKey{}: 3n
    case T.ModuleHashKey{}: 4n
    case T.DeclarationHashKey{}: 5n

def artifact_key(key: T.ArtifactKey) -> Nat:
  match key:
    case T.OriginKey{}: 0n
    case T.ArtifactPathKey{}: 1n
    case T.ArtifactIdKey{}: 2n
    case T.ArtifactKindKey{}: 3n
    case T.ArtifactNameKey{}: 4n
    case T.ArtifactSourceKey{}: 5n
    case T.ArtifactHashKey{}: 6n

def seen_key(+key: Nat, keys: List<&2, Nat>) -> Bool:
  match keys:
    case []: False{}
    case head <> tail: Bool.or(Nat.is_eq(key, head), seen_key(key, tail))

def unique_origin_keys(keys: List<&2, T.OriginKey>, +seen: List<&2, Nat>) -> Bool:
  match keys:
    case []: True{}
    case key <> tail:
      +id = origin_key(key)
      Bool.and(Bool.not(seen_key(id, seen)), unique_origin_keys(tail, id <> seen))

def unique_artifact_keys(keys: List<&2, T.ArtifactKey>, +seen: List<&2, Nat>) -> Bool:
  match keys:
    case []: True{}
    case key <> tail:
      +id = artifact_key(key)
      Bool.and(Bool.not(seen_key(id, seen)), unique_artifact_keys(tail, id <> seen))

def origin_field(origin: T.BundledOrigin, key: T.OriginKey) -> T.OrderedField<T.ProductValue>:
  match origin:
    case T.BundledOrigin{version, source, module_hash, declaration_hash, _}:
      match key:
        case T.OriginKindKey{}: field("kind", text("bundled"))
        case T.LibraryKey{}: field("library", text("bend/Base"))
        case T.CompilerVersionKey{}: field("compilerVersion", text(version))
        case T.CompilerSourceKey{}: field("compilerSource", text(source))
        case T.ModuleHashKey{}: field("moduleHash", text(module_hash))
        case T.DeclarationHashKey{}: field("declarationHash", text(declaration_hash))

def origin_fields(
  +origin: T.BundledOrigin,
  order: List<&2, T.OriginKey>
) -> List<&2, T.OrderedField<T.ProductValue>>:
  match order:
    case []: []
    case key <> tail: origin_field(origin, key) <> origin_fields(origin, tail)

def origin_product(+origin: T.BundledOrigin) -> Maybe<&2, T.ProductValue>:
  match origin:
    case T.BundledOrigin{_, _, _, _, +order}:
      yes : Unit -> Maybe<&2, T.ProductValue> = _ => Some{object(origin_fields(origin, order))}
      no : Unit -> Maybe<&2, T.ProductValue> = _ => None{}
      decide(
        Maybe<&2, T.ProductValue>,
        Bool.and(Nat.is_eq(List.length(&2, T.OriginKey, order), 6n), unique_origin_keys(order, [])),
        yes,
        no
      )

def optional_text(
  value: Maybe<&2, String>,
  key: String
) -> Maybe<&2, T.OrderedField<T.ProductValue>>:
  match value:
    case None{}: None{}
    case Some{value}: Some{field(key, text(value))}

def optional_origin(value: Maybe<&2, T.BundledOrigin>) -> Maybe<&2, T.OrderedField<T.ProductValue>>:
  match value:
    case None{}: None{}
    case Some{origin}:
      next : T.ProductValue -> Maybe<&2, T.OrderedField<T.ProductValue>> = value => Some{
        field("origin", value)
      }
      bind(T.ProductValue, T.OrderedField<T.ProductValue>, origin_product(origin), next)

def artifact_field(
  artifact: T.Artifact,
  key: T.ArtifactKey
) -> Maybe<&2, T.OrderedField<T.ProductValue>>:
  match artifact:
    case T.Artifact{origin, path, id, kind, name, source, hash, _}:
      match key:
        case T.OriginKey{}: optional_origin(origin)
        case T.ArtifactPathKey{}: optional_text(path, "path")
        case T.ArtifactIdKey{}: Some{field("id", text(id))}
        case T.ArtifactKindKey{}: Some{field("kind", text(artifact_kind(kind)))}
        case T.ArtifactNameKey{}: Some{field("name", text(name))}
        case T.ArtifactSourceKey{}: Some{field("source", text(source))}
        case T.ArtifactHashKey{}: Some{field("sourceHash", text(hash))}

def artifact_fields(
  +artifact: T.Artifact,
  order: List<&2, T.ArtifactKey>
) -> Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>>:
  match order:
    case []: Some{[]}
    case key <> tail:
      next : T.OrderedField<T.ProductValue> -> Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>> = value =>
        remaining : List<&2, T.OrderedField<T.ProductValue>> -> Maybe<&2, List<&2, T.OrderedField<T.ProductValue>>> = values => Some{
          value <> values
        }
        bind(
          List<&2, T.OrderedField<T.ProductValue>>,
          List<&2, T.OrderedField<T.ProductValue>>,
          artifact_fields(artifact, tail),
          remaining
        )
      bind(
        T.OrderedField<T.ProductValue>,
        List<&2, T.OrderedField<T.ProductValue>>,
        artifact_field(artifact, key),
        next
      )

def optional_count(-Value: Data, value: Maybe<&2, Value>) -> Nat:
  match value:
    case None{}: 0n
    case Some{_}: 1n

def artifact_product(+artifact: T.Artifact) -> Maybe<&2, T.ProductValue>:
  match artifact:
    case T.Artifact{origin, path, _, _, _, _, _, +order}:
      expected = (5n + optional_count(T.BundledOrigin, origin) + optional_count(String, path) : Nat)
      yes : Unit -> Maybe<&2, T.ProductValue> = _ =>
        next : List<&2, T.OrderedField<T.ProductValue>> -> Maybe<&2, T.ProductValue> = fields => Some{
          object(fields)
        }
        bind(
          List<&2, T.OrderedField<T.ProductValue>>,
          T.ProductValue,
          artifact_fields(artifact, order),
          next
        )
      no : Unit -> Maybe<&2, T.ProductValue> = _ => None{}
      decide(
        Maybe<&2, T.ProductValue>,
        Bool.and(
          Nat.is_eq(List.length(&2, T.ArtifactKey, order), expected),
          unique_artifact_keys(order, [])
        ),
        yes,
        no
      )

def omission_name(reason: Local.Omission) -> String:
  match reason:
    case Local.Unresolved{}: "unresolved"
    case Local.UnsupportedTarget{}: "unsupported"
    case Local.ReferenceLimit{}: "reference-limit"
    case Local.Unavailable{}: "unavailable"

def site(symbol: String) -> T.ProductValue:
  object([field("symbol", text(symbol))])

def map_read(-Value: Data, default_value: Value, map: Map<&2, Value>, key: String) -> Value:
  Local.map_result(Value, Map.get(Value, default_value, map, key))

def index_artifacts(
  entries: List<&2, T.ArtifactEntry>,
  +index: Map<&2, Maybe<&2, T.Artifact>>
) -> Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>:
  match entries:
    case []: Some{index}
    case T.ArtifactEntry{id, artifact} <> tail:
      +key = Nat.show(id)
      yes : Unit -> Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>> = _ => None{}
      no : Unit -> Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>> = _ => index_artifacts(
        tail,
        Map.set(&2, Maybe<&2, T.Artifact>, index, key, Some{artifact})
      )
      decide(
        Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>,
        Maybe.is_some(&2, T.Artifact, map_read(Maybe<&2, T.Artifact>, None{}, index, key)),
        yes,
        no
      )

def group_references(
  slots: List<&2, Local.ReferenceSlot>,
  +groups: Map<&2, List<&2, Local.ReferenceSlot>>
) -> Map<&2, List<&2, Local.ReferenceSlot>>:
  match slots:
    case []: groups
    case +slot <> tail:
      match slot:
        case Local.ReferenceSlot{owner, _, _, _}:
          +key = Nat.show(owner)
          items = map_read(List<&2, Local.ReferenceSlot>, [], groups, key)
          group_references(
            tail,
            Map.set(&2, List<&2, Local.ReferenceSlot>, groups, key, slot <> items)
          )

def reference_product(symbol: String, reference: Local.PlannedReference,
    built: Map<&2, Maybe<&2, T.ProductValue>>) -> Maybe<&2, T.ProductValue>:
  match reference:
    case Local.Included{identity}: Some{
      object(
        [
          field("kind", text("included")),
          field("site", site(symbol)),
          field("target", text(identity))
        ]
      )
    }
    case Local.Omitted{reason, target}: Some{
      object(
        [
          field("kind", text("omitted")),
          field("site", site(symbol)),
          field(
            "target",
            object([field("kind", text("unresolved")), field("symbol", text(target))])
          ),
          field("reason", text(omission_name(reason)))
        ]
      )
    }
    case Local.Expanded{node}:
      next : T.ProductValue -> Maybe<&2, T.ProductValue> = value => Some{
        object([field("kind", text("expanded")), field("site", site(symbol)), field("node", value)])
      }
      bind(
        T.ProductValue,
        T.ProductValue,
        map_read(Maybe<&2, T.ProductValue>, None{}, built, Nat.show(node)),
        next
      )

def reference_products(
  slots: List<&2, Local.ReferenceSlot>,
  +built: Map<&2, Maybe<&2, T.ProductValue>>
) -> Maybe<&2, List<&2, T.ProductValue>>:
  match slots:
    case []: Some{[]}
    case Local.ReferenceSlot{_, _, symbol, reference} <> tail:
      next : T.ProductValue -> Maybe<&2, List<&2, T.ProductValue>> = value =>
        remaining : List<&2, T.ProductValue> -> Maybe<&2, List<&2, T.ProductValue>> = values => Some{
          value <> values
        }
        bind(
          List<&2, T.ProductValue>,
          List<&2, T.ProductValue>,
          reference_products(tail, built),
          remaining
        )
      bind(
        T.ProductValue,
        List<&2, T.ProductValue>,
        reference_product(symbol, reference, built),
        next
      )

# The machine must establish children-first order; this constructor alone
# does not prove dense IDs, slot order, reachability or unique parenthood.

def build_products(
  nodes: List<&2, Local.PlannedNode>,
  +groups: Map<&2, List<&2, Local.ReferenceSlot>>,
  +artifacts: Map<&2, Maybe<&2, T.Artifact>>,
  +built: Map<&2, Maybe<&2, T.ProductValue>>
) -> Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>>:
  match nodes:
    case []: Some{built}
    case Local.PlannedNode{+id, handle} <> tail:
      next : T.Artifact -> Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>> = artifact =>
        product : T.ProductValue -> Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>> = value =>
          refs : List<&2, T.ProductValue> -> Maybe<&2, Map<&2, Maybe<&2, T.ProductValue>>> = references =>
            build_products(
              tail,
              groups,
              artifacts,
              Map.set(
                &2,
                Maybe<&2, T.ProductValue>,
                built,
                Nat.show(id),
                Some{
                  object(
                    [field("artifact", value), field("references", T.ProductArray{references})]
                  )
                }
              )
            )
          bind(
            List<&2, T.ProductValue>,
            Map<&2, Maybe<&2, T.ProductValue>>,
            reference_products(
              map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(id)),
              built
            ),
            refs
          )
        bind(
          T.ProductValue,
          Map<&2, Maybe<&2, T.ProductValue>>,
          artifact_product(artifact),
          product
        )
      bind(
        T.Artifact,
        Map<&2, Maybe<&2, T.ProductValue>>,
        map_read(Maybe<&2, T.Artifact>, None{}, artifacts, Nat.show(handle)),
        next
      )

def dependency_products(paths: List<&2, String>) -> List<&2, T.ProductValue>:
  match paths:
    case []: []
    case head <> tail: text(head) <> dependency_products(tail)

def unit_product(root: T.ProductValue, dependencies: List<&2, String>) -> T.ProductValue:
  match dependencies:
    case []: object([field("root", root)])
    case head <> tail: object(
      [
        field("root", root),
        field("sourceDependencies", T.ProductArray{[]})
      ]
    )

def review_unit(
  root: Nat,
  nodes: List<&2, Local.PlannedNode>,
  references: List<&2, Local.ReferenceSlot>,
  artifacts: List<&2, T.ArtifactEntry>,
  dependencies: List<&2, String>
) -> Maybe<&2, T.ProductValue>:
  next : Map<&2, Maybe<&2, T.Artifact>> -> Maybe<&2, T.ProductValue> = indexed =>
    products : Map<&2, Maybe<&2, T.ProductValue>> -> Maybe<&2, T.ProductValue> = built =>
      result : T.ProductValue -> Maybe<&2, T.ProductValue> = value => Some{
        unit_product(value, dependencies)
      }
      bind(
        T.ProductValue,
        T.ProductValue,
        map_read(Maybe<&2, T.ProductValue>, None{}, built, Nat.show(root)),
        result
      )
    bind(
      Map<&2, Maybe<&2, T.ProductValue>>,
      T.ProductValue,
      build_products(
        List.reverse(&2, Local.PlannedNode, nodes),
        group_references(List.reverse(&2, Local.ReferenceSlot, references), MTip{}),
        indexed,
        MTip{}
      ),
      products
    )
  bind(Map<&2, Maybe<&2, T.Artifact>>, T.ProductValue, index_artifacts(artifacts, MTip{}), next)

def main() -> Unit:
  Unit{}
