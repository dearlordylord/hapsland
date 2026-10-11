import Base
import ./AttachmentArtifactIndexModel.bend as Model
import ./AttachmentNaturalArithmeticFacts.bend as N
import ../traversal/INTERPRETER_NAT_FACTS.bend as NatFacts
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B
import ./RetainedForestProjection.bend as P
import ../Core.bend as Core
import ../Types.bend as T
import ../traversal/patricia-proof/PATRICIA_RELATION.bend as Patricia

# Internal induction invariant for the one full existing index fold.
def distinct(entries: List<&2, T.ArtifactEntry>) -> Bool:
  Model.distinct(entries)

def absent(entries: List<&2, T.ArtifactEntry>, +index: Map<&2, Maybe<&2, T.Artifact>>) -> Bool:
  Model.absent(entries, index)

def expected(entries: List<&2, T.ArtifactEntry>, +handle: Nat, prior: Maybe<&2, T.Artifact>) -> Maybe<&2, T.Artifact>:
  Model.expected(entries, handle, prior)

def accumulated(+entries: List<&2, T.ArtifactEntry>, +prior: Map<&2, Maybe<&2, T.Artifact>>,
    +result: Map<&2, Maybe<&2, T.Artifact>>) -> Type:
  Model.accumulated(entries, prior, result)

def and_true(+left: Bool, +right: Bool, left_true: {left == True{} : Bool}, right_true: {right == True{} : Bool}) ->
    {Bool.and(left, right) == True{} : Bool}:
  %Equal.sym(Bool, left, True{}, left_true): {Bool.and(_, right) == True{} : Bool}
  %Equal.sym(Bool, right, True{}, right_true): {Bool.and(True{}, _) == True{} : Bool}
  {==}

def zero_parts(bit: Bool, +rest: Nat, zero: {Nat.add(Bool.pick(Nat, bit, 1n, 0n), rest) == 0n : Nat}) ->
    {bit == False{} : Bool} & {rest == 0n : Nat}:
  match bit:
    case False{}: Tuple{{==}, zero}
    case True{}:
      Empty.absurd({True{} == False{} : Bool} & {rest == 0n : Nat}, N.succ_ne_zero(rest)(zero))

def strip_head(+id: Nat, +removed: Nat, +all: List<&2, T.ArtifactEntry>, +artifact: T.Artifact,
    different: {Nat.is_eq(removed, id) == False{} : Bool},
    head_unique: {Nat.is_eq(P.handle_count(T.ArtifactEntry{removed, artifact} <> all, id), 1n) == True{} : Bool}) ->
    {Nat.is_eq(P.handle_count(all, id), 1n) == True{} : Bool}:
  reverse: {Nat.is_eq(id, removed) == False{} : Bool} =
    Equal.trans(Bool, Nat.is_eq(id, removed), Nat.is_eq(removed, id), False{}, N.is_eq_comm(id, removed), different)
  %reverse: {Nat.is_eq(Nat.add(Bool.pick(Nat, _, 1n, 0n), P.handle_count(all, id)), 1n) == True{} : Bool}
  head_unique

def strip_finish(+id: Nat, +tail: List<&2, T.ArtifactEntry>, +all: List<&2, T.ArtifactEntry>, +removed: Nat, +artifact: T.Artifact,
    parts: {Nat.is_eq(removed, id) == False{} : Bool} & {P.handle_count(tail, removed) == 0n : Nat},
    +unique: {Bool.and(Nat.is_eq(P.handle_count(T.ArtifactEntry{removed, artifact} <> all, id), 1n),
      P.catalog_unique(tail, T.ArtifactEntry{removed, artifact} <> all)) == True{} : Bool},
    recursive: {P.handle_count(tail, removed) == 0n : Nat} ->
      {P.catalog_unique(tail, T.ArtifactEntry{removed, artifact} <> all) == True{} : Bool} ->
      {P.catalog_unique(tail, all) == True{} : Bool}) ->
    {Bool.and(Nat.is_eq(P.handle_count(all, id), 1n), P.catalog_unique(tail, all)) == True{} : Bool}:
  match parts:
    case (different, rest_zero):
      and_true(Nat.is_eq(P.handle_count(all, id), 1n), P.catalog_unique(tail, all),
        strip_head(id, removed, all, artifact, different,
          B.eq_true_of_and_left(Nat.is_eq(P.handle_count(T.ArtifactEntry{removed, artifact} <> all, id), 1n),
            P.catalog_unique(tail, T.ArtifactEntry{removed, artifact} <> all), unique)),
        recursive(rest_zero)(B.eq_true_of_and_right(Nat.is_eq(P.handle_count(T.ArtifactEntry{removed, artifact} <> all, id), 1n),
            P.catalog_unique(tail, T.ArtifactEntry{removed, artifact} <> all), unique)))

def strip_catalog(entries: List<&2, T.ArtifactEntry>, +all: List<&2, T.ArtifactEntry>, +removed: Nat, +artifact: T.Artifact,
    zero: {P.handle_count(entries, removed) == 0n : Nat},
    unique: {P.catalog_unique(entries, T.ArtifactEntry{removed, artifact} <> all) == True{} : Bool}) ->
    {P.catalog_unique(entries, all) == True{} : Bool}:
  match entries:
    case []: {==}
    case T.ArtifactEntry{+id, _} <> +tail:
      strip_finish(id, tail, all, removed, artifact,
        zero_parts(Nat.is_eq(removed, id), P.handle_count(tail, removed), zero), unique,
        rest_zero => tail_unique => strip_catalog(tail, all, removed, artifact, rest_zero, tail_unique))

def head_absent(+id: Nat, +artifact: T.Artifact, +tail: List<&2, T.ArtifactEntry>,
    head_unique: {Nat.is_eq(P.handle_count(T.ArtifactEntry{id, artifact} <> tail, id), 1n) == True{} : Bool}) ->
    {P.handle_count(tail, id) == 0n : Nat}:
  one: {1n+P.handle_count(tail, id) == 1n : Nat} =
    %N.is_eq_refl(id): {Nat.add(Bool.pick(Nat, _, 1n, 0n), P.handle_count(tail, id)) == 1n : Nat}
    NatFacts.eq_of_is_eq(P.handle_count(T.ArtifactEntry{id, artifact} <> tail, id), 1n, head_unique)
  N.succ_inj(P.handle_count(tail, id), 0n, one)

def distinct_from_unique(entries: List<&2, T.ArtifactEntry>, +unique: {P.catalog_unique(entries, entries) == True{} : Bool}) ->
    {distinct(entries) == True{} : Bool}:
  match entries:
    case []: {==}
    case T.ArtifactEntry{+id, +artifact} <> +tail:
      +zero: {P.handle_count(tail, id) == 0n : Nat} = head_absent(id, artifact, tail,
        B.eq_true_of_and_left(Nat.is_eq(P.handle_count(T.ArtifactEntry{id, artifact} <> tail, id), 1n),
          P.catalog_unique(tail, T.ArtifactEntry{id, artifact} <> tail), unique))
      and_true(Nat.is_eq(P.handle_count(tail, id), 0n), distinct(tail),
        %Equal.sym(Nat, P.handle_count(tail, id), 0n, zero): {Nat.is_eq(_, 0n) == True{} : Bool}
        {==},
        distinct_from_unique(tail, strip_catalog(tail, tail, id, artifact, zero,
          B.eq_true_of_and_right(Nat.is_eq(P.handle_count(T.ArtifactEntry{id, artifact} <> tail, id), 1n),
            P.catalog_unique(tail, T.ArtifactEntry{id, artifact} <> tail), unique))))

law unique_distinct:
  for +entries: List<&2, T.ArtifactEntry>
  for unique: {P.catalog_unique(entries, entries) == True{} : Bool}
  {distinct(entries) == True{} : Bool}

def unique_distinct(entries, unique):
  distinct_from_unique(entries, unique)

def main() -> Unit:
  Unit{}
