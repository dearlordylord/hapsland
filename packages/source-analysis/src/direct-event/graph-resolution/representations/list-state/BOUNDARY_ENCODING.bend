import Base
import ../../traversal/core.bend as Source
import ../../traversal/Traversal.bend as SourceTraversal
import ../../traversal/BOUNDARY.bend as Boundary
import ./core.bend as Core
import ./Own.bend as Own
import ./REGISTRY_RELATION.bend as Registry

# Reference encoding of the entire ordered boundary, not a production host codec.
# One registry handles raw names, kind prefixes, identities and NUL import composites.
# Invalid supplied registries fail before projection; zero is never a valid assigned ID.
type Input is Data:
  Input{facts: Boundary.BoundaryFacts, state: Boundary.BoundaryState,
    path: String, name: String, expected: Source.ExpectedKind, depth: Nat}

type Encoding is Data:
  MissingRegistry{}
  Encoded{names: List<&2, String>, facts: Core.Facts, path: Nat, name: Core.Label,
    expected: Core.ExpectedKind, visited: Own.Dictionary<Bool>, budget: Core.Budget, depth: Nat}

def labels(+name: String) -> List<&2, String>:
  [name, String.append("type:", name), String.append("function:", name)]

def optional_strings(target: Maybe<&2, String>) -> List<&2, String>:
  match target:
    case None{}: []
    case Some{name}: [name]

def reference_strings(reference: Source.Reference) -> List<&2, String>:
  match reference:
    case Source.Reference{_, name, _, target}:
      List.append(&2, String, labels(name), optional_strings(target))

def references_strings(references: List<&2, Source.Reference>) -> List<&2, String>:
  match references:
    case []: []
    case head <> rest:
      List.append(&2, String, reference_strings(head), references_strings(rest))

def declaration_strings(declaration: Source.Declaration) -> List<&2, String>:
  match declaration:
    case Source.Declaration{_, identity, _, _, references}: identity <> references_strings(
      references
    )

def declarations_strings(items: List<&2, Boundary.DeclarationEntry>) -> List<&2, String>:
  match items:
    case []: []
    case Boundary.DeclarationEntry{key, declaration} <> rest:
      key <> List.append(&2, String, declaration_strings(declaration), declarations_strings(rest))

def import_strings(+path: String, binding: Source.ImportBinding) -> List<&2, String>:
  match binding:
    case Source.ImportBinding{+import_path, +name, type_only}:
      [
        import_path,
        name,
        SourceTraversal.import_target_key(path, Source.ImportBinding{import_path, name, type_only})
      ]

def imports_strings(items: List<&2, Boundary.ImportEntry>, +path: String) -> List<&2, String>:
  match items:
    case []: []
    case Boundary.ImportEntry{key, binding} <> rest:
      key <> List.append(&2, String, import_strings(path, binding), imports_strings(rest, path))

def facts_strings(facts: Boundary.BoundaryFacts, path: String) -> List<&2, String>:
  match facts:
    case Boundary.BoundaryFacts{_, declarations, imports, supporting}:
      List.append(&2, String, declarations_strings(declarations),
        List.append(&2, String, imports_strings(imports, path), declarations_strings(supporting)))

def targets_strings(items: List<&2, Boundary.PathTargetsEntry>) -> List<&2, String>:
  match items:
    case []: []
    case Boundary.PathTargetsEntry{path, targets} <> rest:
      path <> List.append(&2, String, targets, targets_strings(rest))

def state_strings(state: Boundary.BoundaryState) -> List<&2, String>:
  match state:
    case Boundary.BoundaryState{visited, targets, _, _, _, _, _}:
      List.append(&2, String, visited, targets_strings(targets))

def input_strings(input: Input) -> List<&2, String>:
  match input:
    case Input{facts, state, +path, name, _, _}:
      path <> List.append(&2, String, labels(name),
        List.append(&2, String, facts_strings(facts, path), state_strings(state)))

def all_present(items: List<&2, String>, +names: List<&2, String>) -> Bool:
  match items:
    case []: True{}
    case head <> rest: Bool.and(Registry.present(names, head), all_present(rest, names))

def assigned(found: Maybe<&2, Nat>) -> Nat:
  match found:
    case None{}: 0n
    case Some{identity}: identity

def identity(names: List<&2, String>, name: String) -> Nat:
  assigned(Registry.encode(names, name))

def label(+names: List<&2, String>, +name: String) -> Core.Label:
  Core.Label{identity(names, name), identity(names, String.append("type:", name)),
    identity(names, String.append("function:", name))}

def expected(kind: Source.ExpectedKind) -> Core.ExpectedKind:
  match kind:
    case Source.AnyKind{}: Core.AnyKind{}
    case Source.TypeKind{}: Core.TypeKind{}
    case Source.FunctionKind{}: Core.FunctionKind{}

def reference_kind(kind: Source.ReferenceKind) -> Core.ReferenceKind:
  match kind:
    case Source.Named{}: Core.Named{}
    case Source.Unsupported{}: Core.Unsupported{}

def optional_identity(names: List<&2, String>, target: Maybe<&2, String>) -> Maybe<&2, Nat>:
  match target:
    case None{}: None{}
    case Some{name}: Some{identity(names, name)}

def reference(+names: List<&2, String>, item: Source.Reference) -> Core.Reference:
  match item:
    case Source.Reference{kind, name, kind_expected, target}:
      Core.Reference{
        reference_kind(kind),
        label(names, name),
        expected(kind_expected),
        optional_identity(names, target)
      }

def references(
  +names: List<&2, String>,
  items: List<&2, Source.Reference>
) -> List<&2, Core.Reference>:
  match items:
    case []: []
    case head <> rest: reference(names, head) <> references(names, rest)

def declaration(+names: List<&2, String>, item: Source.Declaration) -> Core.Declaration:
  match item:
    case Source.Declaration{handle, id, function, bundled, refs}:
      Core.Declaration{handle, identity(names, id), function, bundled, references(names, refs)}

# Ordered updates deliberately retain the source boundary's last-record-wins contract.
def declarations(
  items: List<&2, Boundary.DeclarationEntry>,
  +names: List<&2, String>,
  catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
) -> Own.Dictionary<Maybe<&2, Core.Declaration>>:
  match items:
    case []: catalog
    case Boundary.DeclarationEntry{key, item} <> rest:
      declarations(rest, names, Own.set(Maybe<&2, Core.Declaration>, catalog,
        identity(names, key), Some{declaration(names, item)}))

def imported(
  +names: List<&2, String>,
  path: String,
  +item: Source.ImportBinding
) -> Core.ImportBinding:
  match item:
    case Source.ImportBinding{import_path, name, type_only}:
      Core.ImportBinding{identity(names, import_path), identity(names, name), type_only,
        identity(names, SourceTraversal.import_target_key(path, item))}

def imports(
  items: List<&2, Boundary.ImportEntry>,
  +names: List<&2, String>,
  +path: String,
  catalog: Own.Dictionary<Maybe<&2, Core.ImportBinding>>
) -> Own.Dictionary<Maybe<&2, Core.ImportBinding>>:
  match items:
    case []: catalog
    case Boundary.ImportEntry{key, item} <> rest:
      imports(rest, names, path, Own.set(Maybe<&2, Core.ImportBinding>, catalog,
        identity(names, key), Some{imported(names, path, item)}))

def facts(+names: List<&2, String>, input: Boundary.BoundaryFacts, path: String) -> Core.Facts:
  match input:
    case Boundary.BoundaryFacts{aware, decls, bindings, support}:
      Core.Facts{aware, declarations(decls, names, Own.DNil{}),
        imports(bindings, names, path, Own.DNil{}), declarations(support, names, Own.DNil{})}

def identities(
  items: List<&2, String>,
  +names: List<&2, String>,
  catalog: Own.Dictionary<Bool>
) -> Own.Dictionary<Bool>:
  match items:
    case []: catalog
    case head <> rest: identities(
      rest,
      names,
      Own.set(Bool, catalog, identity(names, head), True{})
    )

def targets(items: List<&2, Boundary.PathTargetsEntry>, +names: List<&2, String>,
    catalog: Own.Dictionary<Own.Dictionary<Bool>>) -> Own.Dictionary<Own.Dictionary<Bool>>:
  match items:
    case []: catalog
    case Boundary.PathTargetsEntry{path, ids} <> rest:
      targets(
        rest,
        names,
        Own.set(
          Own.Dictionary<Bool>,
          catalog,
          identity(names, path),
          identities(ids, names, Own.DNil{})
        )
      )

def limits(input: Source.LocalLimits) -> Core.LocalLimits:
  match input:
    case Source.LocalLimits{work, depth, targets}: Core.LocalLimits{work, depth, targets}

def budget(+names: List<&2, String>, input: Boundary.BoundaryState) -> Core.Budget:
  match input:
    case Boundary.BoundaryState{_, prior, caps, max_targets, work, graph_work, max_depth}:
      Core.Budget{
        limits(caps),
        targets(prior, names, Own.DNil{}),
        max_targets,
        work,
        graph_work,
        max_depth
      }

def visited(names: List<&2, String>, input: Boundary.BoundaryState) -> Own.Dictionary<Bool>:
  match input:
    case Boundary.BoundaryState{ids, _, _, _, _, _, _}: identities(ids, names, Own.DNil{})

def encode_valid(+names: List<&2, String>, input: Input) -> Encoding:
  match input:
    case Input{input_facts, +state, +path, name, kind, depth}:
      Encoded{names, facts(names, input_facts, path), identity(names, path), label(names, name),
        expected(kind), visited(names, state), budget(names, state), depth}

def encode_if(valid: Bool, names: List<&2, String>, input: Input) -> Encoding:
  match valid:
    case False{}: MissingRegistry{}
    case True{}: encode_valid(names, input)

def encode_with_registry(+names: List<&2, String>, +input: Input) -> Encoding:
  encode_if(
    Bool.and(Registry.unique(names), all_present(input_strings(input), names)),
    names,
    input
  )

def encode_boundary(+input: Input) -> Encoding:
  encode_with_registry(Registry.registry(input_strings(input)), input)

# Logical inverse used only by correspondence laws for a covered encoding.
# This is not the production host's shape/error validator; unavailable IDs have
# a total default which roundtrip laws must prove unreachable on constructed input.
def decoded_string(found: Maybe<&2, String>) -> String:
  match found:
    case None{}: ""
    case Some{name}: name

def text(names: List<&2, String>, id: Nat) -> String:
  decoded_string(Registry.decode(names, id))

def source_expected(kind: Core.ExpectedKind) -> Source.ExpectedKind:
  match kind:
    case Core.AnyKind{}: Source.AnyKind{}
    case Core.TypeKind{}: Source.TypeKind{}
    case Core.FunctionKind{}: Source.FunctionKind{}

def source_kind(kind: Core.ReferenceKind) -> Source.ReferenceKind:
  match kind:
    case Core.Named{}: Source.Named{}
    case Core.Unsupported{}: Source.Unsupported{}

def source_target(names: List<&2, String>, target: Maybe<&2, Nat>) -> Maybe<&2, String>:
  match target:
    case None{}: None{}
    case Some{id}: Some{text(names, id)}

def source_reference(+names: List<&2, String>, item: Core.Reference) -> Source.Reference:
  match item:
    case Core.Reference{kind, name, kind_expected, target}:
      Source.Reference{source_kind(kind), text(names, Core.label_key(name)),
        source_expected(kind_expected), source_target(names, target)}

def source_references(
  +names: List<&2, String>,
  items: List<&2, Core.Reference>
) -> List<&2, Source.Reference>:
  match items:
    case []: []
    case head <> rest: source_reference(names, head) <> source_references(names, rest)

def source_declaration(+names: List<&2, String>, item: Core.Declaration) -> Source.Declaration:
  match item:
    case Core.Declaration{handle, id, function, bundled, refs}:
      Source.Declaration{handle, text(names, id), function, bundled, source_references(names, refs)}

def source_optional_declaration(
  names: List<&2, String>,
  item: Maybe<&2, Core.Declaration>
) -> Maybe<&2, Source.Declaration>:
  match item:
    case None{}: None{}
    case Some{declaration}: Some{source_declaration(names, declaration)}

def source_declarations(
  items: Own.Dictionary<Maybe<&2, Core.Declaration>>,
  +names: List<&2, String>,
  catalog: Map<&2, Maybe<&2, Source.Declaration>>
) -> Map<&2, Maybe<&2, Source.Declaration>>:
  match items:
    case Own.DNil{}: catalog
    case Own.DCon{key, declaration, rest, _}:
      source_declarations(rest, names, Map.set(&2, Maybe<&2, Source.Declaration>, catalog,
        text(names, key), source_optional_declaration(names, declaration)))

def source_import(+names: List<&2, String>, item: Core.ImportBinding) -> Source.ImportBinding:
  match item:
    case Core.ImportBinding{path, name, type_only, _}:
      Source.ImportBinding{text(names, path), text(names, name), type_only}

def source_optional_import(
  names: List<&2, String>,
  item: Maybe<&2, Core.ImportBinding>
) -> Maybe<&2, Source.ImportBinding>:
  match item:
    case None{}: None{}
    case Some{binding}: Some{source_import(names, binding)}

def source_imports(items: Own.Dictionary<Maybe<&2, Core.ImportBinding>>, +names: List<&2, String>,
    catalog: Map<&2, Maybe<&2, Source.ImportBinding>>) -> Map<&2, Maybe<&2, Source.ImportBinding>>:
  match items:
    case Own.DNil{}: catalog
    case Own.DCon{key, binding, rest, _}:
      source_imports(rest, names, Map.set(&2, Maybe<&2, Source.ImportBinding>, catalog,
        text(names, key), source_optional_import(names, binding)))

def source_facts(+names: List<&2, String>, facts: Core.Facts) -> Source.Facts:
  match facts:
    case Core.Facts{aware, declarations, imports, supporting}:
      Source.Facts{aware, source_declarations(declarations, names, MTip{}),
        source_imports(imports, names, MTip{}), source_declarations(supporting, names, MTip{})}

def source_identities(
  items: Own.Dictionary<Bool>,
  +names: List<&2, String>,
  catalog: Map<&2, Bool>
) -> Map<&2, Bool>:
  match items:
    case Own.DNil{}: catalog
    case Own.DCon{key, value, rest, _}:
      source_identities(rest, names, Map.set(&2, Bool, catalog, text(names, key), value))

def source_targets(items: Own.Dictionary<Own.Dictionary<Bool>>, +names: List<&2, String>,
    catalog: Map<&2, Map<&2, Bool>>) -> Map<&2, Map<&2, Bool>>:
  match items:
    case Own.DNil{}: catalog
    case Own.DCon{key, targets, rest, _}:
      source_targets(
        rest,
        names,
        Map.set(
          &2,
          Map<&2, Bool>,
          catalog,
          text(names, key),
          source_identities(targets, names, MTip{})
        )
      )

def source_limits(limits: Core.LocalLimits) -> Source.LocalLimits:
  match limits:
    case Core.LocalLimits{work, depth, targets}: Source.LocalLimits{work, depth, targets}

def source_budget(names: List<&2, String>, budget: Core.Budget) -> Source.Budget:
  match budget:
    case Core.Budget{limits, targets, max_targets, work, graph_work, max_depth}:
      Source.Budget{
        source_limits(limits),
        source_targets(targets, names, MTip{}),
        max_targets,
        work,
        graph_work,
        max_depth
      }

type BoundaryView is Data:
  UnavailableEncoding{}
  Decoded{facts: Source.Facts, path: String, name: String, expected: Source.ExpectedKind,
    visited: Map<&2, Bool>, budget: Source.Budget, depth: Nat}

def source_view(input: Input) -> BoundaryView:
  match input:
    case Input{facts, +state, path, name, kind, depth}:
      Decoded{
        Boundary.facts(facts),
        path,
        name,
        kind,
        Boundary.state_visited(state),
        Boundary.state_budget(state),
        depth
      }

def decode(encoding: Encoding) -> BoundaryView:
  match encoding:
    case MissingRegistry{}: UnavailableEncoding{}
    case Encoded{+names, facts, path, name, kind, visited, budget, depth}:
      Decoded{
        source_facts(names, facts),
        text(names, path),
        text(names, Core.label_key(name)),
        source_expected(kind),
        source_identities(visited, names, MTip{}),
        source_budget(names, budget),
        depth
      }

def is_encoded(encoding: Encoding) -> Bool:
  match encoding:
    case MissingRegistry{}: False{}
    case Encoded{_, _, _, _, _, _, _, _}: True{}
