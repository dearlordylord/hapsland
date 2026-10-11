import Base
import ./Types.bend as T

# Observation-cache aggregate admission shared by graph reads and language
# authority captures; independent of per-unit graph limits.
def decide(-Value: Data, condition: Bool, yes: Unit -> Value, no: Unit -> Value) -> Value:
  match condition:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})

def cache_has(entries: List<&2, T.CaptureBytes>, +path: String) -> Bool:
  match entries:
    case []: False{}
    case T.CaptureBytes{key, _} <> tail: Bool.or(String.eq(key, path), cache_has(tail, path))

def cache_bytes(entries: List<&2, T.CaptureBytes>) -> Nat:
  match entries:
    case []: 0n
    case T.CaptureBytes{_, bytes} <> tail: (bytes + cache_bytes(tail) : Nat)

# The observation cache owns independent aggregate limits, not Graph.Limits.
# requestedBytes defaults to the original source ceiling, even for a tighter unit.
def bytes_refusal_for(+used: Nat, +requested: Nat) -> Maybe<&2, T.CaptureDiagnostic>:
  Bool.pick(Maybe<&2, T.CaptureDiagnostic>, Nat.is_gt((used + requested : Nat), 16777216n),
    Some{T.CaptureBudgetDiagnostic{"bytes", used, requested, 16777216n}}, None{})

def files_refusal_for(
  +entries: List<&2, T.CaptureBytes>,
  requested: Nat
) -> Maybe<&2, T.CaptureDiagnostic>:
  yes : Unit -> Maybe<&2, T.CaptureDiagnostic> = _ => Some{T.CaptureBudgetDiagnostic{
    "files", List.length(&2, T.CaptureBytes, entries), 1n, 64n}}
  no : Unit -> Maybe<&2, T.CaptureDiagnostic> = _ => bytes_refusal_for(
    cache_bytes(entries),
    requested
  )
  decide(
    Maybe<&2, T.CaptureDiagnostic>,
    Nat.is_ge(List.length(&2, T.CaptureBytes, entries), 64n),
    yes,
    no
  )

def cache_refusal_for(
  +entries: List<&2, T.CaptureBytes>,
  path: String, requested: Nat
) -> Maybe<&2, T.CaptureDiagnostic>:
  yes : Unit -> Maybe<&2, T.CaptureDiagnostic> = _ => None{}
  no : Unit -> Maybe<&2, T.CaptureDiagnostic> = _ => files_refusal_for(entries, requested)
  decide(Maybe<&2, T.CaptureDiagnostic>, cache_has(entries, path), yes, no)

def cache_refusal(
  entries: List<&2, T.CaptureBytes>,
  path: String
) -> Maybe<&2, T.CaptureDiagnostic>:
  cache_refusal_for(entries, path, 2097152n)

def main() -> Unit:
  Unit{}
