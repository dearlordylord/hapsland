import ../../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base
import ../Types.bend as T
import ../SourceValidationSpecification.bend as Validation
import ../traversal/core.bend as Local

# Pure result construction for the entire resolver. No host builds ReviewUnit.
# Catalog-domain validation is shared with preparation; ForestSpecification
# independently renders the full ordered product for the relational proof.
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

def field(
  key: String,
  value: ArtifactValue.ProductValue
) -> ArtifactValue.OrderedField<ArtifactValue.ProductValue>:
  ArtifactValue.OrderedField{key, value}

def object(
  fields: List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>
) -> ArtifactValue.ProductValue:
  ArtifactValue.ProductObject{fields}

def text(value: String) -> ArtifactValue.ProductValue:
  ArtifactValue.ProductText{value}

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

def origin_field(
  origin: T.BundledOrigin,
  key: T.OriginKey
) -> ArtifactValue.OrderedField<ArtifactValue.ProductValue>:
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
) -> List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>:
  match order:
    case []: []
    case key <> tail: origin_field(origin, key) <> origin_fields(origin, tail)

def origin_product(+origin: T.BundledOrigin) -> Maybe<&2, ArtifactValue.ProductValue>:
  match origin:
    case T.BundledOrigin{_, _, _, _, +order}:
      yes : Unit -> Maybe<&2, ArtifactValue.ProductValue> = _ => Some{
        object(origin_fields(origin, order))
      }
      no : Unit -> Maybe<&2, ArtifactValue.ProductValue> = _ => None{}
      decide(
        Maybe<&2, ArtifactValue.ProductValue>,
        Validation.valid_origin(Some{origin}),
        yes,
        no
      )

def optional_text(
  value: Maybe<&2, String>,
  key: String
) -> Maybe<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>:
  match value:
    case None{}: None{}
    case Some{value}: Some{field(key, text(value))}

def optional_origin(
  value: Maybe<&2, T.BundledOrigin>
) -> Maybe<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>:
  match value:
    case None{}: None{}
    case Some{origin}:
      next : ArtifactValue.ProductValue -> Maybe<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>> = value => Some{
        field("origin", value)
      }
      bind(
        ArtifactValue.ProductValue,
        ArtifactValue.OrderedField<ArtifactValue.ProductValue>,
        origin_product(origin),
        next
      )

def artifact_field(
  artifact: T.Artifact,
  key: T.ArtifactKey
) -> Maybe<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>:
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
) -> Maybe<&2, List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>>:
  match order:
    case []: Some{[]}
    case key <> tail:
      next : ArtifactValue.OrderedField<ArtifactValue.ProductValue> -> Maybe<&2, List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>> = value =>
        remaining : List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>> -> Maybe<&2, List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>> = values => Some{
          value <> values
        }
        bind(
          List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>,
          List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>,
          artifact_fields(artifact, tail),
          remaining
        )
      bind(
        ArtifactValue.OrderedField<ArtifactValue.ProductValue>,
        List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>,
        artifact_field(artifact, key),
        next
      )

def artifact_product(+artifact: T.Artifact) -> Maybe<&2, ArtifactValue.ProductValue>:
  match artifact:
    case T.Artifact{origin, path, _, _, _, _, _, +order}:
      yes : Unit -> Maybe<&2, ArtifactValue.ProductValue> = _ =>
        next : List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>> -> Maybe<&2, ArtifactValue.ProductValue> = fields => Some{
          ArtifactValue.ProductNull{}
        }
        bind(
          List<&2, ArtifactValue.OrderedField<ArtifactValue.ProductValue>>,
          ArtifactValue.ProductValue,
          artifact_fields(artifact, order),
          next
        )
      no : Unit -> Maybe<&2, ArtifactValue.ProductValue> = _ => None{}
      decide(
        Maybe<&2, ArtifactValue.ProductValue>,
        Validation.artifact(artifact),
        yes,
        no
      )

def omission_name(reason: Local.Omission) -> String:
  match reason:
    case Local.Unresolved{}: "unresolved"
    case Local.UnsupportedTarget{}: "unsupported"
    case Local.ReferenceLimit{}: "reference-limit"
    case Local.Unavailable{}: "unavailable"

def site(symbol: String) -> ArtifactValue.ProductValue:
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
    built: Map<&2, Maybe<&2, ArtifactValue.ProductValue>>) -> Maybe<&2, ArtifactValue.ProductValue>:
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
      next : ArtifactValue.ProductValue -> Maybe<&2, ArtifactValue.ProductValue> = value => Some{
        object([field("kind", text("expanded")), field("site", site(symbol)), field("node", value)])
      }
      bind(
        ArtifactValue.ProductValue,
        ArtifactValue.ProductValue,
        map_read(Maybe<&2, ArtifactValue.ProductValue>, None{}, built, Nat.show(node)),
        next
      )

def reference_products(
  slots: List<&2, Local.ReferenceSlot>,
  +built: Map<&2, Maybe<&2, ArtifactValue.ProductValue>>
) -> Maybe<&2, List<&2, ArtifactValue.ProductValue>>:
  match slots:
    case []: Some{[]}
    case Local.ReferenceSlot{_, _, symbol, reference} <> tail:
      next : ArtifactValue.ProductValue -> Maybe<&2, List<&2, ArtifactValue.ProductValue>> = value =>
        remaining : List<&2, ArtifactValue.ProductValue> -> Maybe<&2, List<&2, ArtifactValue.ProductValue>> = values => Some{
          value <> values
        }
        bind(
          List<&2, ArtifactValue.ProductValue>,
          List<&2, ArtifactValue.ProductValue>,
          reference_products(tail, built),
          remaining
        )
      bind(
        ArtifactValue.ProductValue,
        List<&2, ArtifactValue.ProductValue>,
        reference_product(symbol, reference, built),
        next
      )

# The machine must establish children-first order; this constructor alone
# does not prove dense IDs, slot order, reachability or unique parenthood.

def build_products(
  nodes: List<&2, Local.PlannedNode>,
  +groups: Map<&2, List<&2, Local.ReferenceSlot>>,
  +artifacts: Map<&2, Maybe<&2, T.Artifact>>,
  +built: Map<&2, Maybe<&2, ArtifactValue.ProductValue>>
) -> Maybe<&2, Map<&2, Maybe<&2, ArtifactValue.ProductValue>>>:
  match nodes:
    case []: Some{built}
    case Local.PlannedNode{+id, handle} <> tail:
      next : T.Artifact -> Maybe<&2, Map<&2, Maybe<&2, ArtifactValue.ProductValue>>> = artifact =>
        product : ArtifactValue.ProductValue -> Maybe<&2, Map<&2, Maybe<&2, ArtifactValue.ProductValue>>> = value =>
          refs : List<&2, ArtifactValue.ProductValue> -> Maybe<&2, Map<&2, Maybe<&2, ArtifactValue.ProductValue>>> = references =>
            build_products(
              tail,
              groups,
              artifacts,
              Map.set(
                &2,
                Maybe<&2, ArtifactValue.ProductValue>,
                built,
                Nat.show(id),
                Some{
                  object(
                    [
                      field("artifact", value),
                      field("references", ArtifactValue.ProductArray{references})
                    ]
                  )
                }
              )
            )
          bind(
            List<&2, ArtifactValue.ProductValue>,
            Map<&2, Maybe<&2, ArtifactValue.ProductValue>>,
            reference_products(
              map_read(List<&2, Local.ReferenceSlot>, [], groups, Nat.show(id)),
              built
            ),
            refs
          )
        bind(
          ArtifactValue.ProductValue,
          Map<&2, Maybe<&2, ArtifactValue.ProductValue>>,
          artifact_product(artifact),
          product
        )
      bind(
        T.Artifact,
        Map<&2, Maybe<&2, ArtifactValue.ProductValue>>,
        map_read(Maybe<&2, T.Artifact>, None{}, artifacts, Nat.show(handle)),
        next
      )

def dependency_products(paths: List<&2, String>) -> List<&2, ArtifactValue.ProductValue>:
  match paths:
    case []: []
    case head <> tail: text(head) <> dependency_products(tail)

def unit_product(
  root: ArtifactValue.ProductValue,
  dependencies: List<&2, String>
) -> ArtifactValue.ProductValue:
  match dependencies:
    case []: object([field("root", root)])
    case head <> tail: object(
      [
        field("root", root),
        field("sourceDependencies", ArtifactValue.ProductArray{dependency_products(head <> tail)})
      ]
    )

def review_unit(
  root: Nat,
  nodes: List<&2, Local.PlannedNode>,
  references: List<&2, Local.ReferenceSlot>,
  artifacts: List<&2, T.ArtifactEntry>,
  dependencies: List<&2, String>
) -> Maybe<&2, ArtifactValue.ProductValue>:
  next : Map<&2, Maybe<&2, T.Artifact>> -> Maybe<&2, ArtifactValue.ProductValue> = indexed =>
    products : Map<&2, Maybe<&2, ArtifactValue.ProductValue>> -> Maybe<&2, ArtifactValue.ProductValue> = built =>
      result : ArtifactValue.ProductValue -> Maybe<&2, ArtifactValue.ProductValue> = value => Some{
        unit_product(value, dependencies)
      }
      bind(
        ArtifactValue.ProductValue,
        ArtifactValue.ProductValue,
        map_read(Maybe<&2, ArtifactValue.ProductValue>, None{}, built, Nat.show(root)),
        result
      )
    bind(
      Map<&2, Maybe<&2, ArtifactValue.ProductValue>>,
      ArtifactValue.ProductValue,
      build_products(
        List.reverse(&2, Local.PlannedNode, nodes),
        group_references(List.reverse(&2, Local.ReferenceSlot, references), MTip{}),
        indexed,
        MTip{}
      ),
      products
    )
  bind(
    Map<&2, Maybe<&2, T.Artifact>>,
    ArtifactValue.ProductValue,
    index_artifacts(artifacts, MTip{}),
    next
  )

def main() -> Unit:
  Unit{}
