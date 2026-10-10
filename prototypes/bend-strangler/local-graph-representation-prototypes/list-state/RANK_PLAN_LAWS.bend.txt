import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank

# The production root dispatch completes for a value selected from its actual catalog.
law plan_found_completes:
  for +found: Maybe<&2, Core.Declaration>
  for +facts: Core.Facts
  for +path: Nat
  for +visited: Own.Dictionary<Bool>
  for +budget: Core.Budget
  for +depth: Nat
  for +key: Nat
  for selected: {
    Own.lookup(Maybe<&2, Core.Declaration>, None{}, Rank.declaration_catalog(facts), key)
    == found
    : Maybe<&2, Core.Declaration>
  }
  {Rank.successful(Core.plan_found(found, facts, path, visited, budget, depth)) == True{} : Bool}
