import Base
import ../Core.bend as Core
import ../ForestSpecification.bend as F
import ../Types.bend as T
import ./RetainedForestProjection.bend as P
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

def entries_4(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> List<&2, T.ArtifactEntry>:
  [T.ArtifactEntry{10n, two}, T.ArtifactEntry{0n, one}]
def index_4(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> Map<&2, Maybe<&2, T.Artifact>>:
  Map.set(&2, Maybe<&2, T.Artifact>, Map.set(&2, Maybe<&2, T.Artifact>, MTip{}, Nat.show(10n), Some{two}), Nat.show(0n), Some{one})
def unique_4(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {P.catalog_unique(entries_4(one, two, three), entries_4(one, two, three)) == True{} : Bool}:
  {==}
def success_4(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.index_artifacts(entries_4(one, two, three), MTip{}) == Some{index_4(one, two, three)} : Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>}:
  {==}
def canonical_4(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Patricia.canonical(Maybe<&2, T.Artifact>, index_4(one, two, three)) == True{} : Bool}:
  {==}
def lookup_4_0(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_4(one, two, three), Nat.show(0n)) == F.artifact_at(entries_4(one, two, three), 0n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_4_1(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_4(one, two, three), Nat.show(1n)) == F.artifact_at(entries_4(one, two, three), 1n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_4_2(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_4(one, two, three), Nat.show(2n)) == F.artifact_at(entries_4(one, two, three), 2n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_4_9(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_4(one, two, three), Nat.show(9n)) == F.artifact_at(entries_4(one, two, three), 9n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_4_10(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_4(one, two, three), Nat.show(10n)) == F.artifact_at(entries_4(one, two, three), 10n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_4_11(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_4(one, two, three), Nat.show(11n)) == F.artifact_at(entries_4(one, two, three), 11n) : Maybe<&2, T.Artifact>}:
  {==}

def entries_5(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> List<&2, T.ArtifactEntry>:
  [T.ArtifactEntry{0n, one}, T.ArtifactEntry{1n, two}, T.ArtifactEntry{10n, three}]
def index_5(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> Map<&2, Maybe<&2, T.Artifact>>:
  Map.set(&2, Maybe<&2, T.Artifact>, Map.set(&2, Maybe<&2, T.Artifact>, Map.set(&2, Maybe<&2, T.Artifact>, MTip{}, Nat.show(0n), Some{one}), Nat.show(1n), Some{two}), Nat.show(10n), Some{three})
def unique_5(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {P.catalog_unique(entries_5(one, two, three), entries_5(one, two, three)) == True{} : Bool}:
  {==}
def success_5(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.index_artifacts(entries_5(one, two, three), MTip{}) == Some{index_5(one, two, three)} : Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>}:
  {==}
def canonical_5(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Patricia.canonical(Maybe<&2, T.Artifact>, index_5(one, two, three)) == True{} : Bool}:
  {==}
def lookup_5_0(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_5(one, two, three), Nat.show(0n)) == F.artifact_at(entries_5(one, two, three), 0n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_5_1(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_5(one, two, three), Nat.show(1n)) == F.artifact_at(entries_5(one, two, three), 1n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_5_2(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_5(one, two, three), Nat.show(2n)) == F.artifact_at(entries_5(one, two, three), 2n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_5_9(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_5(one, two, three), Nat.show(9n)) == F.artifact_at(entries_5(one, two, three), 9n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_5_10(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_5(one, two, three), Nat.show(10n)) == F.artifact_at(entries_5(one, two, three), 10n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_5_11(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_5(one, two, three), Nat.show(11n)) == F.artifact_at(entries_5(one, two, three), 11n) : Maybe<&2, T.Artifact>}:
  {==}

def main() -> Unit:
  Unit{}
