import Base
import ./AttachmentArtifactIndexInvariant.bend as Invariant
import ./AttachmentArtifactIndexInduction.bend as I
import ./AttachmentCatalogDistinctProof.bend as D
import ./RetainedForestProjection.bend as P
import ../Core.bend as Core
import ../ForestSpecification.bend as F
import ../Types.bend as T
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# Exact full indexing fold at the existing review_unit entry: empty accumulator.
# Distinct numeric handles are already required by the retained forest projection.
# Successful construction and every present/absent lookup are conclusions.
def exact_index(+entries: List<&2, T.ArtifactEntry>, +index: Map<&2, Maybe<&2, T.Artifact>>) -> Type:
  {Core.index_artifacts(entries, MTip{}) == Some{index} : Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>} &
  {Patricia.canonical(Maybe<&2, T.Artifact>, index) == True{} : Bool} &
  @+handle: Nat ->
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, index, Nat.show(handle))
      == F.artifact_at(entries, handle) : Maybe<&2, T.Artifact>}

def empty_absent(entries: List<&2, T.ArtifactEntry>) -> {Invariant.absent(entries, MTip{}) == True{} : Bool}:
  match entries:
    case []: {==}
    case T.ArtifactEntry{id, _} <> +tail:
      D.and_true(True{}, Invariant.absent(tail, MTip{}), {==}, empty_absent(tail))

def expected_at(entries: List<&2, T.ArtifactEntry>, +handle: Nat) ->
    {I.expected(entries, handle, None{}) == F.artifact_at(entries, handle) : Maybe<&2, T.Artifact>}:
  match entries:
    case []: {==}
    case T.ArtifactEntry{+id, +artifact} <> +tail:
      %expected_at(tail, handle):
        {Bool.pick(Maybe<&2, T.Artifact>, Nat.is_eq(id, handle), Some{artifact}, I.expected(tail, handle, None{}))
          == Bool.pick(Maybe<&2, T.Artifact>, Nat.is_eq(id, handle), Some{artifact}, _) : Maybe<&2, T.Artifact>}
      {==}

def finish_catalog(+entries: List<&2, T.ArtifactEntry>,
    proof: Exists(Map<&2, Maybe<&2, T.Artifact>>, index => Invariant.accumulated(entries, MTip{}, index))) ->
    Exists(Map<&2, Maybe<&2, T.Artifact>>, index => exact_index(entries, index)):
  match proof:
    case Tuple{+index, Tuple{done, Tuple{valid, reads}}}:
      Tuple{index, Tuple{done, Tuple{valid, handle =>
        Equal.trans(Maybe<&2, T.Artifact>, Core.map_read(Maybe<&2, T.Artifact>, None{}, index, Nat.show(handle)),
          I.expected(entries, handle, None{}), F.artifact_at(entries, handle), reads(handle), expected_at(entries, handle))}}}

law indexed_catalog:
  for +entries: List<&2, T.ArtifactEntry>
  for unique: {P.catalog_unique(entries, entries) == True{} : Bool}
  Exists(Map<&2, Maybe<&2, T.Artifact>>, index => exact_index(entries, index))

def indexed_catalog(entries, unique):
  +entries = entries
  finish_catalog(entries, Invariant.index_accumulated(entries, MTip{}, Invariant.unique_distinct(entries, unique), empty_absent(entries), {==}))

def index_value(value: Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>) -> Map<&2, Maybe<&2, T.Artifact>>:
  match value:
    case None{}: MTip{}
    case Some{index}: index

def finish_existing_read(+entries: List<&2, T.ArtifactEntry>, +declared: Map<&2, Maybe<&2, T.Artifact>>, +handle: Nat,
    proof: Exists(Map<&2, Maybe<&2, T.Artifact>>, index => exact_index(entries, index)),
    declared_done: {Core.index_artifacts(entries, MTip{}) == Some{declared} : Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>}) ->
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, declared, Nat.show(handle)) == F.artifact_at(entries, handle) : Maybe<&2, T.Artifact>}:
  match proof:
    case Tuple{+index, Tuple{done, Tuple{_, reads}}}:
      same: {index == declared : Map<&2, Maybe<&2, T.Artifact>>} =
        Equal.cong(Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>, Map<&2, Maybe<&2, T.Artifact>>, value => index_value(value), Some{index}, Some{declared},
          Equal.trans(Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>, Some{index}, Core.index_artifacts(entries, MTip{}), Some{declared},
            Equal.sym(Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>, Core.index_artifacts(entries, MTip{}), Some{index}, done), declared_done))
      %same: {Core.map_read(Maybe<&2, T.Artifact>, None{}, _, Nat.show(handle)) == F.artifact_at(entries, handle) : Maybe<&2, T.Artifact>}
      reads(handle)

def existing_read(+entries: List<&2, T.ArtifactEntry>, +index: Map<&2, Maybe<&2, T.Artifact>>, +handle: Nat,
    unique: {P.catalog_unique(entries, entries) == True{} : Bool},
    done: {Core.index_artifacts(entries, MTip{}) == Some{index} : Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>}) ->
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, index, Nat.show(handle)) == F.artifact_at(entries, handle) : Maybe<&2, T.Artifact>}:
  finish_existing_read(entries, index, handle, indexed_catalog(entries, unique), done)

def main() -> Unit:
  Unit{}
