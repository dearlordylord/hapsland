import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_SUPPORT_LAWS.bend as Support
import ./RANK_ABSENCE_LAWS.bend as Absence
import ./UNSEEN_PROOF.bend as Unseen

def Absence.unseen_absent_exact(visited, declaration, absent):
  match declaration:
    case Core.Declaration{_, identity, _, _, +references}:
      %Equal.sym(Bool, Core.has_identity(visited, identity), False{}, absent):
        {
          Support.weight(_, List.length(&2, Core.Reference, references))
          == List.length(&2, Core.Reference, references)
          : Nat
        }
      {==}
