import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./RANK.bend as Rank
import ./CONTINUATION.bend as Continuation
import ./INTERPRETER_MEASURE.bend as Measure
import ./INTERPRETER_INITIAL_PROOF.bend as Initial
import ./RANK_INVENTORY_PROOF.bend as Inventory
import ./MAP_WEIGHT_LAWS.bend as Weight
import ./INTERPRETER_INVENTORY_RELATION.bend as Progress
import ../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

# Internal whole-stack fuel accounting. These are proof expressions only.
def total(facts: Core.Facts) -> Nat:
  match facts:
    case Core.Facts{_, catalog, _, _}:
      Relation.count_catalog(Map.values(&2, Maybe<&2, Core.Declaration>, catalog))

def cap(facts: Core.Facts, references: Nat) -> Nat:
  (3n * total(facts) + 3n * references + 1n : Nat)

def adequate(+facts: Core.Facts, +fuel: Nat, frames: List<&2, Core.Frame>) -> Bool:
  match frames:
    case []: True{}
    case Core.Frame{_, _, _, references} <> rest:
      Bool.and(
        Nat.is_le(cap(facts, List.length(&2, Core.Reference, references)), fuel),
        adequate(facts, fuel, rest)
      )

def cap_monotone(+facts: Core.Facts, +left: Nat, +right: Nat,
    enough: {Nat.is_le(left, right) == True{} : Bool}) -> {
  Nat.is_le(cap(facts, left), cap(facts, right)) == True{} : Bool
}:
  NatFacts.add_le_add_right((3n * total(facts) + 3n * left : Nat),
    (3n * total(facts) + 3n * right : Nat), 1n,
    NatFacts.add_le_add_left((3n * left : Nat), (3n * right : Nat), (3n * total(facts) : Nat),
      NatFacts.mul_le_mul_left(left, right, 3n, enough)))

def adequate_from_inventory(
  +facts: Core.Facts,
  frames: List<&2, Core.Frame>,
  +fuel: Nat,
  +enough: {Nat.is_le(cap(facts, Continuation.frame_inventory(frames)), fuel) == True{} : Bool}
) -> {
  adequate(facts, fuel, frames) == True{} : Bool
}:
  match frames:
    case []: {==}
    case Core.Frame{_, _, _, +references} <> +rest:
      +head = List.length(&2, Core.Reference, references)
      +tail = Continuation.frame_inventory(rest)
      Progress.conjoin(
        Nat.is_le(cap(facts, head), fuel),
        adequate(facts, fuel, rest),
        NatFacts.le_trans(
          cap(facts, head),
          cap(facts, (head + tail : Nat)),
          fuel,
          cap_monotone(facts, head, (head + tail : Nat), NatFacts.le_add_right(head, tail)),
          enough
        ),
        adequate_from_inventory(
          facts,
          rest,
          fuel,
          NatFacts.le_trans(
            cap(facts, tail),
            cap(facts, (head + tail : Nat)),
            fuel,
            cap_monotone(facts, tail, (head + tail : Nat), NatFacts.le_add_left(tail, head)),
            enough
          )
        )
      )

def actual_bound_scalar(+raw: Nat, +references: Nat, +frames: Nat) -> {
  Nat.is_le((3n * raw + 3n * references + 1n : Nat),
    (3n * raw + 3n + 3n * references + 3n * frames : Nat)) == True{} : Bool
}:
  %NatFacts.add_right_comm((3n * raw : Nat), 1n, (3n * references : Nat)):
    {Nat.is_le(_, (3n * raw + 3n + 3n * references + 3n * frames : Nat)) == True{} : Bool}
  NatFacts.le_trans((3n * raw + 1n + 3n * references : Nat),
    (3n * raw + 3n + 3n * references : Nat),
    (3n * raw + 3n + 3n * references + 3n * frames : Nat),
    NatFacts.add_le_add_right((3n * raw + 1n : Nat), (3n * raw + 3n : Nat),
      (3n * references : Nat), NatFacts.add_le_add_left(1n, 3n, (3n * raw : Nat), {==})),
    NatFacts.le_add_right((3n * raw + 3n + 3n * references : Nat), (3n * frames : Nat)))

def actual_bound_adequate(+facts: Core.Facts, +frames: List<&2, Core.Frame>) -> {
  adequate(facts, Continuation.bound(facts, frames), frames) == True{} : Bool
}:
  match facts:
    case Core.Facts{+aware, +catalog, +imports, +supporting}:
      +saved = {Core.Facts{aware, catalog, imports, supporting} : Core.Facts}
      adequate_from_inventory(
        saved,
        frames,
        Continuation.bound(saved, frames),
        actual_bound_scalar(
          total(saved),
          Continuation.frame_inventory(frames),
          List.length(&2, Core.Frame, frames)
        )
      )

def request_cap(+facts: Core.Facts, +items: List<&2, Core.Reference>, +path: String,
    +owner: Nat, +index: Nat, +depth: Nat, +state: Spec.State) -> {
      Nat.is_le(
        Measure.request_rank(
          Spec.ReferencesRequest{items, facts, path, owner, index, depth, state}
        ),
        cap(facts, List.length(&2, Core.Reference, items))
      )
      == True{}
      : Bool
    }:
  match facts:
    case Core.Facts{aware, +catalog, imports, supporting}:
      +visited = Measure.visited(state)
      +amount = List.length(&2, Core.Reference, items)
      %Equal.sym(Nat, Relation.count_catalog(Map.values(&2, Maybe<&2, Core.Declaration>, catalog)),
        Weight.inventory(catalog), Initial.catalog_inventory_exact(catalog)):
        {Nat.is_le((3n * Rank.unseen_catalog(visited, catalog) + 3n * amount + 1n : Nat),
          (3n * _ + 3n * amount + 1n : Nat)) == True{} : Bool}
      NatFacts.add_le_add_right(
        (3n * Rank.unseen_catalog(visited, catalog) + 3n * amount : Nat),
        (3n * Weight.inventory(catalog) + 3n * amount : Nat),
        1n,
        NatFacts.add_le_add_right(
          (3n * Rank.unseen_catalog(visited, catalog) : Nat),
          (3n * Weight.inventory(catalog) : Nat),
          (3n * amount : Nat),
          NatFacts.mul_le_mul_left(
            Rank.unseen_catalog(visited, catalog),
            Weight.inventory(catalog),
            3n,
            Inventory.catalog_bounded(catalog, visited)
          )
        )
      )
