import Base
import ../Core.bend as Core
import ../ForestSpecification.bend as F
import ../Types.bend as T
import ./RetainedForestProjection.bend as P
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

def entries_2(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> List<&2, T.ArtifactEntry>:
  [T.ArtifactEntry{10n, one}]
def index_2(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> Map<&2, Maybe<&2, T.Artifact>>:
  Map.set(&2, Maybe<&2, T.Artifact>, MTip{}, Nat.show(10n), Some{one})
def unique_2(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {P.catalog_unique(entries_2(one, two, three), entries_2(one, two, three)) == True{} : Bool}:
  {==}
def success_2(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.index_artifacts(entries_2(one, two, three), MTip{}) == Some{index_2(one, two, three)} : Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>}:
  {==}
def canonical_2(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Patricia.canonical(Maybe<&2, T.Artifact>, index_2(one, two, three)) == True{} : Bool}:
  {==}
def lookup_2_0(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_2(one, two, three), Nat.show(0n)) == F.artifact_at(entries_2(one, two, three), 0n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_2_1(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_2(one, two, three), Nat.show(1n)) == F.artifact_at(entries_2(one, two, three), 1n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_2_2(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_2(one, two, three), Nat.show(2n)) == F.artifact_at(entries_2(one, two, three), 2n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_2_9(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_2(one, two, three), Nat.show(9n)) == F.artifact_at(entries_2(one, two, three), 9n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_2_10(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_2(one, two, three), Nat.show(10n)) == F.artifact_at(entries_2(one, two, three), 10n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_2_11(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_2(one, two, three), Nat.show(11n)) == F.artifact_at(entries_2(one, two, three), 11n) : Maybe<&2, T.Artifact>}:
  {==}

def entries_3(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> List<&2, T.ArtifactEntry>:
  [T.ArtifactEntry{0n, one}, T.ArtifactEntry{10n, two}]
def index_3(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> Map<&2, Maybe<&2, T.Artifact>>:
  Map.set(&2, Maybe<&2, T.Artifact>, Map.set(&2, Maybe<&2, T.Artifact>, MTip{}, Nat.show(0n), Some{one}), Nat.show(10n), Some{two})
def unique_3(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {P.catalog_unique(entries_3(one, two, three), entries_3(one, two, three)) == True{} : Bool}:
  {==}
def success_3(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.index_artifacts(entries_3(one, two, three), MTip{}) == Some{index_3(one, two, three)} : Maybe<&2, Map<&2, Maybe<&2, T.Artifact>>>}:
  {==}
def canonical_3(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Patricia.canonical(Maybe<&2, T.Artifact>, index_3(one, two, three)) == True{} : Bool}:
  {==}
def lookup_3_0(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_3(one, two, three), Nat.show(0n)) == F.artifact_at(entries_3(one, two, three), 0n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_3_1(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_3(one, two, three), Nat.show(1n)) == F.artifact_at(entries_3(one, two, three), 1n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_3_2(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_3(one, two, three), Nat.show(2n)) == F.artifact_at(entries_3(one, two, three), 2n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_3_9(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_3(one, two, three), Nat.show(9n)) == F.artifact_at(entries_3(one, two, three), 9n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_3_10(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_3(one, two, three), Nat.show(10n)) == F.artifact_at(entries_3(one, two, three), 10n) : Maybe<&2, T.Artifact>}:
  {==}
def lookup_3_11(+one: T.Artifact, +two: T.Artifact, +three: T.Artifact) -> {Core.map_read(Maybe<&2, T.Artifact>, None{}, index_3(one, two, three), Nat.show(11n)) == F.artifact_at(entries_3(one, two, three), 11n) : Maybe<&2, T.Artifact>}:
  {==}

def main() -> Unit:
  Unit{}
