import Base
import ../NativeGenerated.bend as Generated

# Executable literal identity probes, not proposed universal product laws.
def identity(value: Generated.Interned) -> Nat:
  match value:
    case Generated.Interned{_, identity}: identity

def explicit_then_generated(value: Generated.Interned) -> Nat:
  match value:
    case Generated.Interned{state, _}: identity(Generated.intern(state, Generated.subject_key()))

def generated_then_explicit(value: Generated.Interned) -> Nat:
  match value:
    case Generated.Interned{state, _}: identity(Generated.bind(state, Generated.subject_key(), 7n))

def distinct(value: Generated.Interned) -> Nat:
  match value:
    case Generated.Interned{state, _}: identity(
      Generated.bind(state, Generated.GeneratedKey{[3n]}, 8n)
    )

def prepared(value: Generated.Captured) -> Nat:
  match value:
    case Generated.Captured{_, _, _, _, head <> _}: head
    case _: 0n

def captured_explicit(value: Generated.Interned) -> Nat:
  match value:
    case Generated.Interned{state, _}: prepared(
      Generated.capture_facts(state, 1n, 0n, 10n, [5n], [])
    )

def bind_generated(value: Generated.Captured) -> Nat:
  match value:
    case Generated.Captured{state, _, _, _, _}: identity(
      Generated.bind(state, Generated.unit_key_facts(1n, 0n, 0n, 5n, []), 9n)
    )

def other_partition(value: Generated.Interned) -> Nat:
  match value:
    case Generated.Interned{state, _}: prepared(
      Generated.capture_facts(state, 2n, 0n, 10n, [5n], [])
    )

def main() -> List<&2, Nat>:
  [
    explicit_then_generated(Generated.bind(Generated.initial(), Generated.subject_key(), 7n)),
    generated_then_explicit(Generated.intern(Generated.initial(), Generated.subject_key())),
    distinct(Generated.bind(Generated.initial(), Generated.subject_key(), 7n)),
    captured_explicit(
      Generated.bind(Generated.initial(), Generated.unit_key_facts(1n, 0n, 0n, 5n, []), 9n)
    ),
    bind_generated(Generated.capture_facts(Generated.initial(), 1n, 0n, 10n, [5n], [])),
    other_partition(
      Generated.bind(Generated.initial(), Generated.unit_key_facts(1n, 0n, 0n, 5n, []), 9n)
    )
  ]
