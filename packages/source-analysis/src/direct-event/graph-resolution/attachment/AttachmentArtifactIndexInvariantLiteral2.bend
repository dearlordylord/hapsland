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


def entries(+one: T.Artifact, +two: T.Artifact) -> List<&2, T.ArtifactEntry>:
  [T.ArtifactEntry{0n, one}]
def prior(+one: T.Artifact, +two: T.Artifact) -> Map<&2, Maybe<&2, T.Artifact>>:
  MLeaf{"0", None{}}
def result(+one: T.Artifact, +two: T.Artifact) -> Map<&2, Maybe<&2, T.Artifact>>:
  Map.set(&2, Maybe<&2, T.Artifact>, MLeaf{"0", None{}}, Nat.show(0n), Some{one})
def claim_unique(+one: T.Artifact, +two: T.Artifact) -> {P.catalog_unique(entries(one, two), entries(one, two)) == True{} : Bool}:
  {==}

def claim_distinct(+one: T.Artifact, +two: T.Artifact) -> {distinct(entries(one, two)) == True{} : Bool}:
  {==}

def claim_fresh(+one: T.Artifact, +two: T.Artifact) -> {absent(entries(one, two), prior(one, two)) == True{} : Bool}:
  {==}

def claim_canonical_prior(+one: T.Artifact, +two: T.Artifact) -> {Patricia.canonical(Maybe<&2, T.Artifact>, prior(one, two)) == True{} : Bool}:
  {==}

def claim_canonical_result(+one: T.Artifact, +two: T.Artifact) -> {Patricia.canonical(Maybe<&2, T.Artifact>, result(one, two)) == True{} : Bool}:
  {==}

def claim_success(+one: T.Artifact, +two: T.Artifact) -> {Core.index_artifacts(entries(one, two), prior(one, two)) == Some{result(one, two)} : Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>}:
  {==}

def claim_lookup_0(+one: T.Artifact, +two: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, result(one, two), Nat.show(0n)) == expected(entries(one, two), 0n, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior(one, two), Nat.show(0n))) : Maybe<&2, T.Artifact>}:
  {==}

def claim_lookup_1(+one: T.Artifact, +two: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, result(one, two), Nat.show(1n)) == expected(entries(one, two), 1n, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior(one, two), Nat.show(1n))) : Maybe<&2, T.Artifact>}:
  {==}

def claim_lookup_10(+one: T.Artifact, +two: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, result(one, two), Nat.show(10n)) == expected(entries(one, two), 10n, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior(one, two), Nat.show(10n))) : Maybe<&2, T.Artifact>}:
  {==}

def claim_lookup_11(+one: T.Artifact, +two: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, result(one, two), Nat.show(11n)) == expected(entries(one, two), 11n, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior(one, two), Nat.show(11n))) : Maybe<&2, T.Artifact>}:
  {==}

def claim_lookup_99(+one: T.Artifact, +two: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, result(one, two), Nat.show(99n)) == expected(entries(one, two), 99n, Core.map_read(Maybe<&2, T.Artifact>, None{}, prior(one, two), Nat.show(99n))) : Maybe<&2, T.Artifact>}:
  {==}

def main() -> Unit:
  Unit{}
