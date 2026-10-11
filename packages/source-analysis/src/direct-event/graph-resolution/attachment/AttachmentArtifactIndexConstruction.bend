import Base
import ./AttachmentMapPayloadTransport.bend as Payload
import ./AttachmentNaturalKeyEqualityProof.bend as Keys
import ./AttachmentNaturalArithmeticFacts.bend as N
import ../traversal/INTERPRETER_NAT_FACTS.bend as NatFacts
import ./AttachmentArtifactIndexConcreteRead.bend as Absence
import ./AttachmentArtifactIndexInduction.bend as I
import ./AttachmentCatalogDistinctProof.bend as D
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B
import ../traversal/patricia-proof/PATRICIA_INSERT_PROOF.bend as Insert
import ../traversal/patricia-proof/PATRICIA_RELATION.bend as Patricia
import ../Core.bend as Core
import ../Types.bend as T
import ./RetainedForestProjection.bend as P

def index_head(+id: Nat, +artifact: T.Artifact, +tail: List<&2, T.ArtifactEntry>, +prior: Map<&2, Maybe<&2, T.Artifact>>,
    none: {Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(id)) == None{} : Maybe<&2, T.Artifact>}) ->
    {Core.index_artifacts(T.ArtifactEntry{id, artifact} <> tail, prior)
      == Core.index_artifacts(tail, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}))
      : Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>}:
  %Equal.sym(Maybe<&2, T.Artifact>, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(id)), None{}, none):
    {Core.decide(Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>, Maybe.is_some(&2, T.Artifact, _),
      unit => None{}, unit => Core.index_artifacts(tail, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact})))
      == Core.index_artifacts(tail, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}))
      : Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>}
  {==}

def read_written(+id: Nat, +artifact: T.Artifact, +prior: Map<&2, Maybe<&2, T.Artifact>>,
    +valid: {Patricia.canonical(Maybe<&2, T.Artifact>, prior) == True{} : Bool}) ->
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}), Nat.show(id)) == Some{artifact} : Maybe<&2, T.Artifact>}:
  key_same: {String.eq(Nat.show(id), Nat.show(id)) == True{} : Bool} =
    Equal.trans(Bool, String.eq(Nat.show(id), Nat.show(id)), Nat.is_eq(id, id), True{}, Keys.natural_key_equality(id, id), N.is_eq_refl(id))
  %key_same:
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}), Nat.show(id))
      == Bool.pick(Maybe<&2, T.Artifact>, _, Some{artifact}, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(id))) : Maybe<&2, T.Artifact>}
  Payload.lookup_after_set(Maybe<&2, T.Artifact>, prior, Nat.show(id), Nat.show(id), Some{artifact}, None{}, valid)

def payload_same(+id: Nat, +artifact: T.Artifact, +tail: List<&2, T.ArtifactEntry>,
    +prior: Map<&2, Maybe<&2, T.Artifact>>, +result: Map<&2, Maybe<&2, T.Artifact>>,
    zero: {P.handle_count(tail, id) == 0n : Nat},
    +valid: {Patricia.canonical(Maybe<&2, T.Artifact>, prior) == True{} : Bool},
    recursive: {Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(id)) == I.expected(tail, id,
      Core.map_read(Maybe<&2, T.Artifact>, None{}, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}), Nat.show(id))) : Maybe<&2, T.Artifact>}) ->
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(id)) == I.expected(T.ArtifactEntry{id, artifact} <> tail, id,
      Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(id))) : Maybe<&2, T.Artifact>}:
  %Equal.sym(Bool, Nat.is_eq(id, id), True{}, N.is_eq_refl(id)):
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(id)) == Bool.pick(Maybe<&2, T.Artifact>, _, Some{artifact},
      I.expected(tail, id, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(id)))) : Maybe<&2, T.Artifact>}
  Equal.trans(Maybe<&2, T.Artifact>, Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(id)),
    I.expected(tail, id, Core.map_read(Maybe<&2, T.Artifact>, None{}, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}), Nat.show(id))), Some{artifact}, recursive,
    Equal.trans(Maybe<&2, T.Artifact>,
      I.expected(tail, id, Core.map_read(Maybe<&2, T.Artifact>, None{}, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}), Nat.show(id))),
      Core.map_read(Maybe<&2, T.Artifact>, None{}, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}), Nat.show(id)), Some{artifact},
      I.expected_zero(tail, id, Core.map_read(Maybe<&2, T.Artifact>, None{}, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}), Nat.show(id)), zero),
      read_written(id, artifact, prior, valid)))

def payload_other(+id: Nat, +artifact: T.Artifact, +tail: List<&2, T.ArtifactEntry>, +handle: Nat,
    +prior: Map<&2, Maybe<&2, T.Artifact>>, +result: Map<&2, Maybe<&2, T.Artifact>>,
    +different: {Nat.is_eq(id, handle) == False{} : Bool},
    +valid: {Patricia.canonical(Maybe<&2, T.Artifact>, prior) == True{} : Bool},
    recursive: {Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(handle)) == I.expected(tail, handle,
      Core.map_read(Maybe<&2, T.Artifact>, None{}, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}), Nat.show(handle))) : Maybe<&2, T.Artifact>}) ->
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(handle)) == I.expected(T.ArtifactEntry{id, artifact} <> tail, handle,
      Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(handle))) : Maybe<&2, T.Artifact>}:
  %Equal.sym(Bool, Nat.is_eq(id, handle), False{}, different):
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(handle)) == Bool.pick(Maybe<&2, T.Artifact>, _, Some{artifact},
      I.expected(tail, handle, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(handle)))) : Maybe<&2, T.Artifact>}
  %I.other_read(handle, id, artifact, prior,
      Payload.lookup_after_set(Maybe<&2, T.Artifact>, prior, Nat.show(id), Nat.show(handle), Some{artifact}, None{}, valid), different, valid):
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(handle)) == I.expected(tail, handle, _) : Maybe<&2, T.Artifact>}
  recursive

def payload_case(+id: Nat, +artifact: T.Artifact, +tail: List<&2, T.ArtifactEntry>, +handle: Nat,
    +prior: Map<&2, Maybe<&2, T.Artifact>>, +result: Map<&2, Maybe<&2, T.Artifact>>,
    zero: {P.handle_count(tail, id) == 0n : Nat},
    +valid: {Patricia.canonical(Maybe<&2, T.Artifact>, prior) == True{} : Bool},
    recursive: @+query: Nat -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(query)) == I.expected(tail, query,
      Core.map_read(Maybe<&2, T.Artifact>, None{}, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}), Nat.show(query))) : Maybe<&2, T.Artifact>},
    equal: Bool, branch: {Nat.is_eq(id, handle) == equal : Bool}) ->
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(handle)) == I.expected(T.ArtifactEntry{id, artifact} <> tail, handle,
      Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(handle))) : Maybe<&2, T.Artifact>}:
  match equal:
    case False{}: payload_other(id, artifact, tail, handle, prior, result, branch, valid, recursive(handle))
    case True{}:
      same: {id == handle : Nat} = NatFacts.eq_of_is_eq(id, handle, branch)
      %same:
        {Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(_)) == I.expected(T.ArtifactEntry{id, artifact} <> tail, _,
          Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(_))) : Maybe<&2, T.Artifact>}
      payload_same(id, artifact, tail, prior, result, zero, valid, recursive(id))

def finish_full(+id: Nat, +artifact: T.Artifact, +tail: List<&2, T.ArtifactEntry>, +prior: Map<&2, Maybe<&2, T.Artifact>>,
    +zero: {P.handle_count(tail, id) == 0n : Nat},
    +prior_valid: {Patricia.canonical(Maybe<&2, T.Artifact>, prior) == True{} : Bool},
    none: {Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(id)) == None{} : Maybe<&2, T.Artifact>},
    recursive: Exists(Map<&2, Maybe<&2, T.Artifact>>, result => I.accumulated(tail, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}), result))) ->
    Exists(Map<&2, Maybe<&2, T.Artifact>>, result => I.accumulated(T.ArtifactEntry{id, artifact} <> tail, prior, result)):
  match recursive:
    case Tuple{+result, Tuple{done, Tuple{valid, reads}}}:
      Tuple{result, Tuple{
        Equal.trans(Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>,
          Core.index_artifacts(T.ArtifactEntry{id, artifact} <> tail, prior),
          Core.index_artifacts(tail, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact})), Some{result},
          index_head(id, artifact, tail, prior, none), done),
        Tuple{valid, handle => payload_case(id, artifact, tail, handle, prior, result, zero, prior_valid, reads, Nat.is_eq(id, handle), {==})}}}

def construct_full(+entries: List<&2, T.ArtifactEntry>, +prior: Map<&2, Maybe<&2, T.Artifact>>,
    +unique: {I.distinct(entries) == True{} : Bool}, +fresh: {I.absent(entries, prior) == True{} : Bool},
    +valid: {Patricia.canonical(Maybe<&2, T.Artifact>, prior) == True{} : Bool}) ->
    Exists(Map<&2, Maybe<&2, T.Artifact>>, result => I.accumulated(entries, prior, result)):
  match entries:
    case []: Tuple{prior, Tuple{{==}, Tuple{valid, handle => {==}}}}
    case T.ArtifactEntry{+id, +artifact} <> +tail:
      +zero = B.eq_true_of_and_left(Nat.is_eq(P.handle_count(tail, id), 0n), I.distinct(tail), unique)
      +tail_unique = B.eq_true_of_and_right(Nat.is_eq(P.handle_count(tail, id), 0n), I.distinct(tail), unique)
      +head_fresh = B.eq_true_of_and_left(Bool.not(Maybe.is_some(&2, T.Artifact, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(id)))), I.absent(tail, prior), fresh)
      +tail_fresh = B.eq_true_of_and_right(Bool.not(Maybe.is_some(&2, T.Artifact, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(id)))), I.absent(tail, prior), fresh)
      finish_full(id, artifact, tail, prior, NatFacts.eq_of_is_eq(P.handle_count(tail, id), 0n, zero), valid,
        I.none_of_fresh(Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(id)), head_fresh),
        construct_full(tail, Map.set(&2, Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}), tail_unique,
          Absence.absent_after_set(tail, id, artifact, prior, NatFacts.eq_of_is_eq(P.handle_count(tail, id), 0n, zero), tail_fresh, valid),
          Insert.set_preserves_canonical(Maybe<&2, T.Artifact>, prior, Nat.show(id), Some{artifact}, valid)))

def main() -> Unit:
  Unit{}
