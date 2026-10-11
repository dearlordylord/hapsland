import Base
import ../../../../source-analysis/src/direct-event/graph-resolution/Types.bend as T
import ./CanonicalJson.bend as Json

# Internal whole-finalization stage, over the native producer's unique-key domain.
# The raw compiler catalog is data. Bend validates provenance and traverses units.
type Node is Data:
  Node{value: T.ProductValue, root: Bool}
type State is Data:
  State{pending: List<&2, Node>, partial: Bool, paths: List<&2, String>}
type Step is Data:
  Continue{state: State}
  Inspected{partial: Bool, paths: List<&2, String>}
  MissingEvidence{}
  InvalidInput{}

def field_list(+key: String, fields: List<&2, T.OrderedField<T.ProductValue>>) -> Maybe<&2, T.ProductValue>:
  match fields:
    case []: None{}
    case T.OrderedField{+candidate, value} <> tail:
      Bool.pick(Maybe<&2, T.ProductValue>, String.eq(key, candidate), Some{value}, field_list(key, tail))

def field(key: String, value: T.ProductValue) -> Maybe<&2, T.ProductValue>:
  match value:
    case T.ProductObject{fields}: field_list(key, fields)
    case _: None{}

def text(value: Maybe<&2, T.ProductValue>) -> Maybe<&2, String>:
  match value:
    case Some{T.ProductText{value}}: Some{value}
    case _: None{}

def same_text(left: Maybe<&2, T.ProductValue>, right: Maybe<&2, T.ProductValue>) -> Bool:
  match left right:
    case Some{T.ProductText{a}} Some{T.ProductText{b}}: String.eq(a, b)
    case _ _: False{}

def absent(value: Maybe<&2, T.ProductValue>) -> Bool:
  match value:
    case None{}: True{}
    case _: False{}

def matching_fields(keys: List<&2, String>, +actual: T.ProductValue, +candidate: T.ProductValue) -> Bool:
  match keys:
    case []: True{}
    case +key <> tail:
      Bool.and(same_text(field(key, actual), field(key, candidate)), matching_fields(tail, actual, candidate))

def origin_shape(value: Maybe<&2, T.ProductValue>) -> Bool:
  match value:
    case Some{T.ProductObject{fields}}: Nat.is_eq(List.length(&2, T.OrderedField<T.ProductValue>, fields), 6n)
    case _: False{}

def origin_equal(actual: Maybe<&2, T.ProductValue>, candidate: Maybe<&2, T.ProductValue>) -> Bool:
  match actual candidate:
    case Some{actual} Some{candidate}:
      matching_fields(["kind", "library", "compilerVersion", "compilerSource", "moduleHash", "declarationHash"], actual, candidate)
    case _ _: False{}

def member(+artifact: T.ProductValue, +actual: T.ProductValue) -> Bool:
  Bool.and(absent(field("path", artifact)),
    Bool.and(origin_shape(field("origin", artifact)),
      Bool.and(matching_fields(["id", "kind", "name", "source", "sourceHash"], actual, artifact),
        origin_equal(field("origin", actual), field("origin", artifact)))))

def bundled(+artifact: T.ProductValue, catalog: List<&2, T.ProductValue>) -> Bool:
  match catalog:
    case []: False{}
    case actual <> tail: Bool.or(member(artifact, actual), bundled(artifact, tail))

def path_insert_result(less: Bool, +path: String, head: String, tail: List<&2, String>, inserted: List<&2, String>) -> List<&2, String>:
  match less:
    case True{}: path <> head <> tail
    case False{}: head <> inserted

def path_insert_same(same: Bool, +path: String, +head: String, +tail: List<&2, String>, inserted: List<&2, String>) -> List<&2, String>:
  match same:
    case True{}: head <> tail
    case False{}: path_insert_result(Json.units_le(Json.utf16(path), Json.utf16(head)), path, head, tail, inserted)

def path_insert(+path: String, paths: List<&2, String>) -> List<&2, String>:
  match paths:
    case []: [path]
    case +head <> +tail: path_insert_same(String.eq(path, head), path, head, tail, path_insert(path, tail))

def source_paths(items: List<&2, T.ProductValue>, paths: List<&2, String>) -> Maybe<&2, List<&2, String>>:
  match items:
    case []: Some{paths}
    case T.ProductText{path} <> tail: source_paths(tail, path_insert(path, paths))
    case _: None{}

def dependencies(value: Maybe<&2, T.ProductValue>) -> Maybe<&2, List<&2, String>>:
  match value:
    case None{}: Some{[]}
    case Some{T.ProductArray{items}}: source_paths(items, [])
    case _: None{}

def initial_parts(root: Maybe<&2, T.ProductValue>, paths: Maybe<&2, List<&2, String>>) -> Step:
  match root paths:
    case Some{root} Some{paths}: Continue{State{[Node{root, True{}}], False{}, paths}}
    case _ _: InvalidInput{}

def initial(+unit: T.ProductValue) -> Step:
  initial_parts(field("root", unit), dependencies(field("sourceDependencies", unit)))

def reference(kind: Maybe<&2, String>, node: Maybe<&2, T.ProductValue>, +pending: List<&2, Node>, partial: Bool) -> Maybe<&2, State>:
  match kind node:
    case Some{+kind} Some{node}:
      Some{State{Bool.pick(List<&2, Node>, String.eq(kind, "expanded"), Node{node, False{}} <> pending, pending),
        Bool.or(partial, String.eq(kind, "omitted")), []}}
    case Some{+kind} None{}:
      Bool.pick(Maybe<&2, State>, String.eq(kind, "expanded"), None{},
        Some{State{pending, Bool.or(partial, String.eq(kind, "omitted")), []}})
    case _ _: None{}

def references_next(state: Maybe<&2, State>, paths: List<&2, String>, next: List<&2, Node> -> Bool -> List<&2, String> -> Step) -> Step:
  match state:
    case None{}: InvalidInput{}
    case Some{State{pending, partial, _}}: next(pending, partial, paths)

def references(items: List<&2, T.ProductValue>, pending: List<&2, Node>, partial: Bool, paths: List<&2, String>) -> Step:
  match items:
    case []: Continue{State{pending, partial, paths}}
    case +value <> tail:
      references_next(reference(text(field("kind", value)), field("node", value), pending, partial), paths,
        pending => partial => paths => references(tail, pending, partial, paths))

def node_references(value: Maybe<&2, T.ProductValue>, pending: List<&2, Node>, partial: Bool, paths: List<&2, String>) -> Step:
  match value:
    case Some{T.ProductArray{items}}: references(items, pending, partial, paths)
    case _: InvalidInput{}

def accepted(valid: Bool, references: Maybe<&2, T.ProductValue>, pending: List<&2, Node>, partial: Bool, paths: List<&2, String>) -> Step:
  match valid:
    case True{}: node_references(references, pending, partial, paths)
    case False{}: MissingEvidence{}

def dependency(origin: Maybe<&2, T.ProductValue>, path: Maybe<&2, String>, root: Bool, artifact: T.ProductValue, catalog: List<&2, T.ProductValue>, references: Maybe<&2, T.ProductValue>, pending: List<&2, Node>, partial: Bool, paths: List<&2, String>) -> Step:
  match origin path:
    case None{} Some{path}: node_references(references, pending, partial, path_insert(path, paths))
    case None{} None{}: MissingEvidence{}
    case Some{_} _: accepted(Bool.and(Bool.not(root), bundled(artifact, catalog)), references, pending, partial, paths)

def node_artifact(artifact: Maybe<&2, T.ProductValue>, references: Maybe<&2, T.ProductValue>, root: Bool, catalog: List<&2, T.ProductValue>, pending: List<&2, Node>, partial: Bool, paths: List<&2, String>) -> Step:
  match artifact:
    case Some{+artifact}: dependency(field("origin", artifact), text(field("path", artifact)), root, artifact, catalog, references, pending, partial, paths)
    case None{}: InvalidInput{}

def advance(state: State, catalog: List<&2, T.ProductValue>) -> Step:
  match state:
    case State{[], partial, paths}: Inspected{partial, paths}
    case State{Node{+value, root} <> pending, partial, paths}:
      node_artifact(field("artifact", value), field("references", value), root, catalog, pending, partial, paths)

# These facts come from parser declarations and stable captures, without host selection.
type Metadata is Data:
  EvidenceReady{partial: Bool, root_location: Maybe<&2, T.ProductValue>, fingerprints: T.ProductValue}
  EvidenceMissing{}
  EvidenceInvalid{}

def artifact_value(value: Maybe<&2, T.ProductValue>) -> T.ProductValue:
  match value:
    case Some{value}: value
    case None{}: T.ProductNull{}

def candidate_artifact(value: T.ProductValue) -> T.ProductValue:
  artifact_value(field("artifact", value))

def unit_artifact(value: T.ProductValue) -> T.ProductValue:
  candidate_artifact(artifact_value(field("root", value)))

def declaration_match(+artifact: T.ProductValue, +candidate: T.ProductValue) -> Bool:
  matching_fields(["kind", "name"], artifact, candidate)

def location_selected(matched: Bool, value: Maybe<&2, T.ProductValue>, rest: Maybe<&2, T.ProductValue>) -> Maybe<&2, T.ProductValue>:
  match matched:
    case True{}: value
    case False{}: rest

def declaration_location(+artifact: T.ProductValue, declarations: List<&2, T.ProductValue>) -> Maybe<&2, T.ProductValue>:
  match declarations:
    case []: None{}
    case +candidate <> tail:
      location_selected(declaration_match(artifact, candidate_artifact(candidate)), field("location", candidate), declaration_location(artifact, tail))

def root_location(contract: String, artifact: T.ProductValue, declarations: List<&2, T.ProductValue>) -> Maybe<&2, T.ProductValue>:
  Bool.pick(Maybe<&2, T.ProductValue>,
    Bool.or(String.eq(contract, "direct-event/type-shape/v1"), String.eq(contract, "direct-event/function/v1")),
    declaration_location(artifact, declarations), None{})

def capture_fields(path: String, hash: Maybe<&2, T.ProductValue>, bytes: Maybe<&2, T.ProductValue>) -> Maybe<&2, T.ProductValue>:
  match hash bytes:
    case Some{T.ProductText{hash}} Some{T.ProductNumber{bits}}:
      Some{T.ProductObject{[T.OrderedField{"path", T.ProductText{path}},
        T.OrderedField{"contentHash", T.ProductText{hash}}, T.OrderedField{"byteLength", T.ProductNumber{bits}}]}}
    case _ _: None{}

def capture_selected(matched: Bool, value: Maybe<&2, T.ProductValue>, rest: Maybe<&2, T.ProductValue>) -> Maybe<&2, T.ProductValue>:
  match matched:
    case True{}: value
    case False{}: rest

def capture_at(+path: String, captures: List<&2, T.ProductValue>) -> Maybe<&2, T.ProductValue>:
  match captures:
    case []: None{}
    case +capture <> tail:
      capture_selected(same_text(Some{T.ProductText{path}}, field("path", capture)),
        capture_fields(path, field("contentHash", capture), field("byteLength", capture)), capture_at(path, tail))

def fingerprint_cons(head: Maybe<&2, T.ProductValue>, tail: Maybe<&2, List<&2, T.ProductValue>>) -> Maybe<&2, List<&2, T.ProductValue>>:
  match head tail:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def fingerprints(paths: List<&2, String>, +captures: List<&2, T.ProductValue>) -> Maybe<&2, List<&2, T.ProductValue>>:
  match paths:
    case []: Some{[]}
    case path <> tail: fingerprint_cons(capture_at(path, captures), fingerprints(tail, captures))

def metadata_ready(missing_root: Bool, partial: Bool, location: Maybe<&2, T.ProductValue>, fingerprints: Maybe<&2, List<&2, T.ProductValue>>) -> Metadata:
  match missing_root fingerprints:
    case False{} Some{values}: EvidenceReady{partial, location, T.ProductArray{values}}
    case _ _: EvidenceMissing{}

def metadata_location(partial: Bool, paths: List<&2, String>, +contract: String, +location: Maybe<&2, T.ProductValue>, captures: List<&2, T.ProductValue>) -> Metadata:
  metadata_ready(Bool.and(Bool.or(String.eq(contract, "direct-event/type-shape/v1"),
    String.eq(contract, "direct-event/function/v1")), absent(location)), partial, location, fingerprints(paths, captures))

def metadata(step: Step, +contract: String, declarations: List<&2, T.ProductValue>, captures: List<&2, T.ProductValue>, unit: T.ProductValue) -> Metadata:
  match step:
    case Inspected{partial, paths}:
      metadata_location(partial, paths, contract, root_location(contract, unit_artifact(unit), declarations), captures)
    case MissingEvidence{}: EvidenceMissing{}
    case _: EvidenceInvalid{}

def main() -> Unit:
  Unit{}
