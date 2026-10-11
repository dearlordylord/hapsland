import Base
import ./RetainedForestProjection.bend as P
import ../Core.bend as Core
import ../Types.bend as T
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# Internal induction invariant for the one full existing index fold.
def distinct(entries: List<&2, T.ArtifactEntry>) -> Bool:
  match entries:
    case []: True{}
    case T.ArtifactEntry{+id, _} <> +tail:
      Bool.and(Nat.is_eq(P.handle_count(tail, id), 0n), distinct(tail))

def absent(entries: List<&2, T.ArtifactEntry>, +index: Map<&2, Maybe<&2, T.Artifact>>) -> Bool:
  match entries:
    case []: True{}
    case T.ArtifactEntry{id, _} <> tail:
      Bool.and(Bool.not(Maybe.is_some(&2, T.Artifact,
        Core.map_read(Maybe<&2, T.Artifact>, None{}, index, Nat.show(id)))), absent(tail, index))

def expected(entries: List<&2, T.ArtifactEntry>, +handle: Nat, prior: Maybe<&2, T.Artifact>) -> Maybe<&2, T.Artifact>:
  match entries:
    case []: prior
    case T.ArtifactEntry{id, artifact} <> tail:
      Bool.pick(Maybe<&2, T.Artifact>, Nat.is_eq(id, handle), Some{artifact}, expected(tail, handle, prior))

def accumulated(+entries: List<&2, T.ArtifactEntry>, +prior: Map<&2, Maybe<&2, T.Artifact>>,
    +result: Map<&2, Maybe<&2, T.Artifact>>) -> Type:
  {Core.index_artifacts(entries, prior) == Some{result} : Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>} &
  {Patricia.canonical(Maybe<&2, T.Artifact>, result) == True{} : Bool} &
  @+handle: Nat ->
    {Core.map_read(Maybe<&2, T.Artifact>, None{}, result, Nat.show(handle))
      == expected(entries, handle, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior, Nat.show(handle))) : Maybe<&2, T.Artifact>}

def main() -> Unit:
  Unit{}
