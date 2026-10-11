import Base
import ./Types.bend as T

# Pure catalog-domain validation shared by preparation and the renderer.
# External replies are validated, not restricted by a caller precondition.
# Independent ForestSpecification rendering does not call these guards.
def count(keys: List<&2, Nat>, +wanted: Nat) -> Nat:
  match keys:
    case []: 0n
    case key <> tail:
      (Bool.pick(Nat, Nat.is_eq(key, wanted), 1n, 0n) + count(tail, wanted) : Nat)

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

def origin_keys(items: List<&2, T.OriginKey>) -> List<&2, Nat>:
  match items:
    case []: []
    case head <> tail: origin_key(head) <> origin_keys(tail)

def artifact_keys(items: List<&2, T.ArtifactKey>) -> List<&2, Nat>:
  match items:
    case []: []
    case head <> tail: artifact_key(head) <> artifact_keys(tail)

def ones(+keys: List<&2, Nat>, remaining: Nat, +first: Nat) -> Bool:
  match remaining:
    case 0n: True{}
    case 1n++tail:
      Bool.and(Nat.is_eq(count(keys, first), 1n), ones(keys, tail, (first + 1n : Nat)))

def valid_origin(value: Maybe<&2, T.BundledOrigin>) -> Bool:
  match value:
    case None{}: True{}
    case Some{T.BundledOrigin{_, _, _, _, order}}:
      ones(origin_keys(order), 6n, 0n)

def present(-Value: Data, value: Maybe<&2, Value>) -> Nat:
  match value:
    case None{}: 0n
    case Some{_}: 1n

def artifact_fields(+keys: List<&2, Nat>, +origin: Maybe<&2, T.BundledOrigin>,
    path: Maybe<&2, String>) -> Bool:
  Bool.and(ones(keys, 5n, 2n),
    Bool.and(Nat.is_eq(count(keys, 0n), present(T.BundledOrigin, origin)),
      Bool.and(Nat.is_eq(count(keys, 1n), present(String, path)), valid_origin(origin))))

def artifact(value: T.Artifact) -> Bool:
  match value:
    case T.Artifact{origin, path, _, _, _, _, _, order}:
      artifact_fields(artifact_keys(order), origin, path)

def contains(names: List<&2, String>, +name: String) -> Bool:
  match names:
    case []: False{}
    case head <> tail: Bool.or(String.eq(head, name), contains(tail, name))

def unique(names: List<&2, String>) -> Bool:
  match names:
    case []: True{}
    case +head <> +tail: Bool.and(Bool.not(contains(tail, head)), unique(tail))

def declaration_names(items: List<&2, T.FactDeclaration>) -> List<&2, String>:
  match items:
    case []: []
    case T.FactDeclaration{name, _, _, _} <> tail: name <> declaration_names(tail)

def import_names(items: List<&2, T.FactImport>) -> List<&2, String>:
  match items:
    case []: []
    case T.FactImport{name, _, _, _} <> tail: name <> import_names(tail)

def artifacts(items: List<&2, T.FactDeclaration>) -> Bool:
  match items:
    case []: True{}
    case T.FactDeclaration{_, value, _, _} <> tail: Bool.and(artifact(value), artifacts(tail))

def declarations(+items: List<&2, T.FactDeclaration>) -> Bool:
  Bool.and(unique(declaration_names(items)), artifacts(items))

def source(value: T.SourceFacts) -> Bool:
  match value:
    case T.SourceFacts{_, ordinary, imports, supporting}:
      Bool.and(declarations(ordinary),
        Bool.and(declarations(supporting), unique(import_names(imports))))

def main() -> Unit:
  Unit{}
