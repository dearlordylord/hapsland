import Base
import ./AttachmentArtifactIndexInduction.bend as Induction
import ./AttachmentMapPayloadTransport.bend as Payload
import ./RetainedForestProjection.bend as P
import ../Core.bend as Core
import ../Types.bend as T
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

def build_rows(entries: List<&2, T.ArtifactEntry>, +written: Nat, +artifact: T.Artifact,
    +index: Map<&2, Maybe<&2, T.Artifact>>,
    +valid: {Patricia.canonical(Maybe<&2, T.Artifact>, index) == True{} : Bool}) ->
    Induction.read_rows(entries, written, artifact, index):
  match entries:
    case []: Unit{}
    case T.ArtifactEntry{+id, _} <> +tail:
      (Payload.lookup_after_set(Maybe<&2, T.Artifact>, index, Nat.show(written), Nat.show(id), Some{artifact}, None{}, valid),
       build_rows(tail, written, artifact, index, valid))

def absent_after_set(+entries: List<&2, T.ArtifactEntry>, +written: Nat, +artifact: T.Artifact,
    +index: Map<&2, Maybe<&2, T.Artifact>>,
    zero: {P.handle_count(entries, written) == 0n : Nat},
    fresh: {Induction.absent(entries, index) == True{} : Bool},
    +valid: {Patricia.canonical(Maybe<&2, T.Artifact>, index) == True{} : Bool}) ->
    {Induction.absent(entries, Map.set(&2, Maybe<&2, T.Artifact>, index, Nat.show(written), Some{artifact})) == True{} : Bool}:
  Induction.absent_after_set(entries, written, artifact, index,
    build_rows(entries, written, artifact, index, valid), zero, fresh, valid)

def main() -> Unit:
  Unit{}
