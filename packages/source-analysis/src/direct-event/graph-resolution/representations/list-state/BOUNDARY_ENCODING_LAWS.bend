import Base
import ./BOUNDARY_ENCODING.bend as Encoding
import ./REGISTRY_RELATION.bend as Registry
import ./core.bend as Core
import ../../traversal/core.bend as Source
import ../../traversal/Traversal.bend as SourceTraversal

# The complete finite boundary constructs a unique registry in the one namespace.
law boundary_registry_unique:
  for input: Encoding.Input
  {Registry.unique(Registry.registry(Encoding.input_strings(input))) == True{} : Bool}

# Every occurrence needed by the whole encoder is registered, not just root names.
law boundary_registry_covers:
  for +input: Encoding.Input
  {
    Encoding.all_present(
      Encoding.input_strings(input),
      Registry.registry(Encoding.input_strings(input))
    )
    == True{}
    : Bool
  }

# Constructing the registry for a finite complete boundary never returns a missing registry.
law boundary_encoding_complete:
  for input: Encoding.Input
  {Encoding.is_encoded(Encoding.encode_boundary(input)) == True{} : Bool}

# The exact complete source facts, maps, counters, handles and reference order roundtrip.
# This requires BaseMap structural equality, not merely membership or cardinality.
law whole_boundary_roundtrip:
  for +input: Encoding.Input
  {
    Encoding.decode(Encoding.encode_boundary(input))
    == Encoding.source_view(input)
    : Encoding.BoundaryView
  }

# Any covered unique renaming, including extra unused entries, has the same full source view.
law covered_registry_roundtrip:
  for +names: List<&2, String>
  for +input: Encoding.Input
  for valid: {Registry.unique(names) == True{} : Bool}
  for covered: {Encoding.all_present(Encoding.input_strings(input), names) == True{} : Bool}
  {
    Encoding.decode(Encoding.encode_with_registry(names, input))
    == Encoding.source_view(input)
    : Encoding.BoundaryView
  }

# Exact kind-aware lookup keys preserve real prefix collisions in the shared namespace.
law lookup_key_roundtrip:
  for +names: List<&2, String>
  for +name: String
  for +aware: Bool
  for +expected: Source.ExpectedKind
  for covered: {Encoding.all_present(Encoding.labels(name), names) == True{} : Bool}
  {
    Encoding.text(
      names,
      Core.lookup_key(aware, Encoding.expected(expected), Encoding.label(names, name))
    )
    == SourceTraversal.lookup_key(aware, expected, name)
    : String
  }

# A covered String decodes through Some, so the zero/empty total defaults cannot hide it.
law covered_identity_exact:
  for +names: List<&2, String>
  for +name: String
  for covered: {Registry.present(names, name) == True{} : Bool}
  {Registry.decode(names, Encoding.identity(names, name)) == Some{name} : Maybe<&2, String>}

# Coverage excludes reserved zero even when the original String is empty.
law covered_identity_in_range:
  for +names: List<&2, String>
  for +name: String
  for covered: {Registry.present(names, name) == True{} : Bool}
  {
    Bool.and(Nat.is_lt(0n, Encoding.identity(names, name)),
      Nat.is_le(Encoding.identity(names, name), List.length(&2, String, names)))
    == True{}
    : Bool
  }

# Numeric imports preserve the exact invocation-path NUL composite, including collisions.
law import_composite_exact:
  for +names: List<&2, String>
  for +path: String
  for +binding: Source.ImportBinding
  for covered: {
    Encoding.all_present(Encoding.import_strings(path, binding), names)
    == True{}
    : Bool
  }
  {
    Registry.decode(
      names,
      Core.import_target_key(
        Encoding.identity(names, path),
        Encoding.imported(names, path, binding)
      )
    )
    == Some{SourceTraversal.import_target_key(path, binding)}
    : Maybe<&2, String>
  }
