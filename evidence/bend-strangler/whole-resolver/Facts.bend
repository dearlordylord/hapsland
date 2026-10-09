import Base
import ./Types.bend as T
import ./Core.bend as Materialize
import ../local-graph-draft/core.bend as Local

# Bend owns catalog allocation and planner input. The frontend returns syntax
# declarations, never graph handles, policy decisions, or a traversal plan.
type Catalog is Data:
  Catalog{next: Nat, entries_rev: List<&2, T.ArtifactEntry>,
    declarations: Map<&2, Maybe<&2, Local.Declaration>>,
    supporting: Map<&2, Maybe<&2, Local.Declaration>>, exported: Map<&2, Bool>}
type PreparedFacts is Data:
  PreparedFacts{facts: Local.Facts, exported: Map<&2, Bool>,
    next_artifact: Nat, artifacts: List<&2, T.ArtifactEntry>}

def optional_bool(value: Maybe<&2, Bool>) -> Bool:
  match value:
    case None{}: False{}
    case Some{flag}: flag

def references(items: List<&2, T.FactReference>) -> List<&2, Local.Reference>:
  match items:
    case []: []
    case T.FactReference{kind, name, expected, target} <> tail:
      Local.Reference{kind, name, expected, target} <> references(tail)

def artifact_identity(artifact: T.Artifact) -> String:
  match artifact:
    case T.Artifact{_, _, id, _, _, _, _, _}: id

def bundled_origin(origin: Maybe<&2, T.BundledOrigin>) -> Bool:
  match origin:
    case None{}: False{}
    case Some{_}: True{}

def declaration(item: T.FactDeclaration, handle: Nat) -> Local.Declaration:
  match item:
    case T.FactDeclaration{_, T.Artifact{origin, _, id, kind, _, _, _, _}, refs, _}:
      Local.Declaration{
        handle,
        id,
        Materialize.artifact_is_function(kind),
        bundled_origin(origin),
        references(refs)
      }

def store_ordinary(catalog: Catalog, +item: T.FactDeclaration) -> Catalog:
  match catalog item:
    case Catalog{+next, entries, declarations, supporting, exported}
      T.FactDeclaration{+key, artifact, _, flag}:
      entry = declaration(item, next)
      Catalog{(next + 1n : Nat), T.ArtifactEntry{next, artifact} <> entries,
        Map.set(&2, Maybe<&2, Local.Declaration>, declarations, key, Some{entry}),
        supporting, Map.set(&2, Bool, exported, key, flag)}

def store_supporting(catalog: Catalog, +item: T.FactDeclaration) -> Catalog:
  match catalog item:
    case Catalog{+next, entries, declarations, supporting, exported}
      T.FactDeclaration{key, artifact, _, _}:
      entry = declaration(item, next)
      Catalog{(next + 1n : Nat), T.ArtifactEntry{next, artifact} <> entries,
        declarations, Map.set(&2, Maybe<&2, Local.Declaration>, supporting, key, Some{entry}),
        exported}

def store_declaration(catalog: Catalog, item: T.FactDeclaration, bundled: Bool) -> Catalog:
  match bundled:
    case False{}: store_ordinary(catalog, item)
    case True{}: store_supporting(catalog, item)

def map_has_result(-Value: Data, result: Map<&2, Value> & Bool) -> Bool:
  match result:
    case Tuple{_, flag}: flag

def declaration_present(catalog: Catalog, key: String, bundled: Bool) -> Bool:
  match catalog:
    case Catalog{_, _, declarations, supporting, _}:
      map_has_result(Maybe<&2, Local.Declaration>, Map.has(&2, Maybe<&2, Local.Declaration>,
        Bool.pick(Map<&2, Maybe<&2, Local.Declaration>>, bundled, supporting, declarations), key))

def valid_declaration(+catalog: Catalog, +item: T.FactDeclaration, +bundled: Bool) -> Bool:
  match item:
    case T.FactDeclaration{key, artifact, _, _}:
      Bool.and(Bool.not(declaration_present(catalog, key, bundled)),
        Maybe.is_some(&2, T.ProductValue, Materialize.artifact_product(artifact)))

def catalog_declarations(items: List<&2, T.FactDeclaration>, +catalog: Catalog,
    +bundled: Bool) -> Maybe<&2, Catalog>:
  match items:
    case []: Some{catalog}
    case +head <> tail:
      yes : Unit -> Maybe<&2, Catalog> = _ => catalog_declarations(
        tail,
        store_declaration(catalog, head, bundled),
        bundled
      )
      no : Unit -> Maybe<&2, Catalog> = _ => None{}
      Materialize.decide(Maybe<&2, Catalog>, valid_declaration(catalog, head, bundled), yes, no)

def catalog_imports(
  items: List<&2, T.FactImport>,
  +catalog: Map<&2, Maybe<&2, Local.ImportBinding>>
) -> Maybe<&2, Map<&2, Maybe<&2, Local.ImportBinding>>>:
  match items:
    case []: Some{catalog}
    case T.FactImport{+key, path, name, type_only} <> tail:
      yes : Unit -> Maybe<&2, Map<&2, Maybe<&2, Local.ImportBinding>>> = _ => None{}
      no : Unit -> Maybe<&2, Map<&2, Maybe<&2, Local.ImportBinding>>> = _ => catalog_imports(
        tail,
        Map.set(
          &2,
          Maybe<&2, Local.ImportBinding>,
          catalog,
          key,
          Some{Local.ImportBinding{path, name, optional_bool(type_only)}}
        )
      )
      Materialize.decide(
        Maybe<&2, Map<&2, Maybe<&2, Local.ImportBinding>>>,
        map_has_result(
          Maybe<&2, Local.ImportBinding>,
          Map.has(&2, Maybe<&2, Local.ImportBinding>, catalog, key)
        ),
        yes,
        no
      )

def prepared(
  catalog: Catalog,
  imports: Map<&2, Maybe<&2, Local.ImportBinding>>,
  aware: Bool
) -> PreparedFacts:
  match catalog:
    case Catalog{next, entries, declarations, supporting, exported}:
      PreparedFacts{Local.Facts{aware, declarations, imports, supporting}, exported,
        next, List.reverse(&2, T.ArtifactEntry, entries)}

def prepare(source: T.SourceFacts, next_artifact: Nat) -> Maybe<&2, PreparedFacts>:
  match source:
    case T.SourceFacts{aware, declarations, imports, supporting}:
      next : Catalog -> Maybe<&2, PreparedFacts> = catalog =>
        support : Catalog -> Maybe<&2, PreparedFacts> = catalog =>
          imported : Map<&2, Maybe<&2, Local.ImportBinding>> -> Maybe<&2, PreparedFacts> = imports => Some{
            prepared(catalog, imports, optional_bool(aware))
          }
          Materialize.bind(
            Map<&2, Maybe<&2, Local.ImportBinding>>,
            PreparedFacts,
            catalog_imports(imports, MTip{}),
            imported
          )
        Materialize.bind(
          Catalog,
          PreparedFacts,
          catalog_declarations(supporting, catalog, True{}),
          support
        )
      Materialize.bind(
        Catalog,
        PreparedFacts,
        catalog_declarations(
          declarations,
          Catalog{next_artifact, [], MTip{}, MTip{}, MTip{}},
          False{}
        ),
        next
      )

def main() -> Unit:
  Unit{}
