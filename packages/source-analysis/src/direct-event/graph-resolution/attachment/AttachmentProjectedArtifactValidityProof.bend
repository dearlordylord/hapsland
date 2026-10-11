import Base
import ./AttachmentCatalogValidation.bend as ActualFrame
import ./AttachmentProjectionContentsProof.bend as Contents
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B
import ../ForestSpecification.bend as F
import ../SourceValidationSpecification.bend as V
import ../Types.bend as T

def value_of(-A: Data, fallback: A, value: Maybe<&2, A>) -> A:
  match value:
    case None{}: fallback
    case Some{item}: item

def selected_valid(+head: T.Artifact, +artifact: T.Artifact,
    head_valid: {V.artifact(head) == True{} : Bool},
    selected: {Some{head} == Some{artifact} : Maybe<&2, T.Artifact>}) ->
    {V.artifact(artifact) == True{} : Bool}:
  same: {head == artifact : T.Artifact} = Equal.cong(Maybe<&2, T.Artifact>, T.Artifact,
    value => value_of(T.Artifact, head, value), Some{head}, Some{artifact}, selected)
  %same: {V.artifact(_) == True{} : Bool}
  head_valid

def lookup_step(+equal: Bool, +head: T.Artifact, +tail: List<&2, T.ArtifactEntry>, +handle: Nat, +artifact: T.Artifact,
    head_valid: {V.artifact(head) == True{} : Bool},
    tail_valid: {ActualFrame.catalog_valid(tail) == True{} : Bool},
    selected: {Bool.pick(Maybe<&2, T.Artifact>, equal, Some{head}, F.artifact_at(tail, handle)) == Some{artifact} : Maybe<&2, T.Artifact>},
    recursive: {ActualFrame.catalog_valid(tail) == True{} : Bool} ->
      {F.artifact_at(tail, handle) == Some{artifact} : Maybe<&2, T.Artifact>} ->
      {V.artifact(artifact) == True{} : Bool}) ->
    {V.artifact(artifact) == True{} : Bool}:
  match equal:
    case True{}: selected_valid(head, artifact, head_valid, selected)
    case False{}: recursive(tail_valid)(selected)

def lookup_valid(entries: List<&2, T.ArtifactEntry>, +handle: Nat, +artifact: T.Artifact,
    +catalog_valid: {ActualFrame.catalog_valid(entries) == True{} : Bool},
    selected: {F.artifact_at(entries, handle) == Some{artifact} : Maybe<&2, T.Artifact>}) ->
    {V.artifact(artifact) == True{} : Bool}:
  match entries:
    case []:
      Empty.absurd({V.artifact(artifact) == True{} : Bool}, Contents.none_some(T.Artifact, artifact, selected))
    case T.ArtifactEntry{id, +head} <> +tail:
      lookup_step(Nat.is_eq(id, handle), head, tail, handle, artifact,
        B.eq_true_of_and_left(V.artifact(head), ActualFrame.catalog_valid(tail), catalog_valid),
        B.eq_true_of_and_right(V.artifact(head), ActualFrame.catalog_valid(tail), catalog_valid), selected,
        valid => present => lookup_valid(tail, handle, artifact, valid, present))

def main() -> Unit:
  Unit{}
