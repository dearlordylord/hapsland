import Base
import ./AttachmentArtifactIndexModel.bend as Model
import ./AttachmentArtifactIndexConstruction.bend as Proof
import ./AttachmentCatalogDistinctProof.bend as D
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

law unique_distinct:
  for +entries: List<&2, T.ArtifactEntry>
  for unique: {P.catalog_unique(entries, entries) == True{} : Bool}
  {distinct(entries) == True{} : Bool}

def unique_distinct(entries, unique):
  D.unique_distinct(entries, unique)

law index_accumulated:
  for +entries: List<&2, T.ArtifactEntry>
  for +prior: Map<&2, Maybe<&2, T.Artifact>>
  for unique: {distinct(entries) == True{} : Bool}
  for fresh: {absent(entries, prior) == True{} : Bool}
  for valid: {Patricia.canonical(Maybe<&2, T.Artifact>, prior) == True{} : Bool}
  Exists(Map<&2, Maybe<&2, T.Artifact>>, result => accumulated(entries, prior, result))

def index_accumulated(entries, prior, unique, fresh, valid):
  Proof.construct_full(entries, prior, unique, fresh, valid)

def main() -> Unit:
  Unit{}
