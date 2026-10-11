import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank

# An absent declaration contributes all its structural references to unseen weight.
law unseen_absent_exact:
  for +visited: Own.Dictionary<Bool>
  for +declaration: Core.Declaration
  for absent: {Core.has_identity(visited, Core.declaration_identity(declaration)) == False{} : Bool}
  {
    Rank.unseen_declaration(visited, Some{declaration})
    == Core.declaration_reference_count(Some{declaration})
    : Nat
  }
