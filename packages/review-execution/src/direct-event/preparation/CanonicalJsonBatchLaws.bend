import Base
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJsonBatch.bend as Batch

# Draft for designated reviewer approval. No proof bindings yet.
# Typed values here are Strings; raw non-string JS identity/coercion is an
# additional obligation of the actual emitted consumer, not this proof domain.

def primitives(parts: List<&2, Plan.Piece>) -> List<&2, Json.Primitive>:
  match parts:
    case []: []
    case Plan.LiteralPiece{_} <> rest: primitives(rest)
    case Plan.PrimitivePiece{value} <> rest: value <> primitives(rest)

def enumerate(
  values: List<&2, Json.Primitive>,
  +invocation: Nat,
  +first: Nat
) -> List<&2, Batch.Command>:
  match values:
    case []: []
    case value <> rest:
      Batch.Command{invocation, first, value} <> enumerate(rest, invocation, Nat.add(1n, first))

# Every primitive, including object keys and null, gets its original logical ID.
law selection_exact:
  for +parts: List<&2, Plan.Piece>
  for +invocation: Nat
  for +first: Nat
  {
    Batch.select(parts, invocation, first) == enumerate(primitives(parts), invocation, first)
    : List<&2, Batch.Command>
  }

# Splitting the plan cannot reset IDs or reorder native commands.
law selection_composition:
  for +prefix: List<&2, Plan.Piece>
  for +suffix: List<&2, Plan.Piece>
  for +invocation: Nat
  for +first: Nat
  {
    Batch.select(List.append(&2, Plan.Piece, prefix, suffix), invocation, first)
    == List.append(&2, Batch.Command,
      Batch.select(prefix, invocation, first),
      Batch.select(suffix, invocation,
        Nat.add(first, List.length(&2, Json.Primitive, primitives(prefix)))))
    : List<&2, Batch.Command>
  }

# The outer namespace is assigned in Bend, preserving complete inner commands.
law schedule_empty:
  for first: Nat
  {Batch.schedule([], first) == [] : List<&2, Batch.Scheduled>}

law schedule_cons:
  for +command: Batch.Command
  for +rest: List<&2, Batch.Command>
  for +first: Nat
  {
    Batch.schedule(command <> rest, first)
    == Batch.Scheduled{first, command} <> Batch.schedule(rest, Nat.add(1n, first))
    : List<&2, Batch.Scheduled>
  }

law schedule_composition:
  for +prefix: List<&2, Batch.Command>
  for +suffix: List<&2, Batch.Command>
  for +first: Nat
  {
    Batch.schedule(List.append(&2, Batch.Command, prefix, suffix), first)
    == List.append(&2, Batch.Scheduled,
      Batch.schedule(prefix, first),
      Batch.schedule(suffix, Nat.add(first, List.length(&2, Batch.Command, prefix))))
    : List<&2, Batch.Scheduled>
  }

def main() -> Unit:
  Unit{}
