import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./TREE_MACHINE_RELATION.bend as Relation
import ./TREE_MACHINE_SUPPORT_LAWS.bend as Support
import ./RANK.bend as Rank
import ./RANK_LAWS.bend as RankLaws
import ./RANK_PROOF.bend as RankProof

law numeric_production_completes:
  for facts: Core.Facts
  for path: Nat
  for name: Core.Label
  for expected: Core.ExpectedKind
  for visited: Own.Dictionary<Bool>
  for budget: Core.Budget
  for depth: Nat
  {
    Relation.successful(
      Relation.core_observation(facts, path, name, expected, visited, budget, depth)
    )
    == True{}
    : Bool
  }

def Support.observed_success_exact(result):
  match result:
    case Core.CompletePlan{_}: {==}
    case Core.MissingRoot{_, _}: {==}
    case Core.InvariantFailure{_}: {==}

def numeric_production_completes(facts, path, name, expected, visited, budget, depth):
  +source = facts
  +root_path = path
  +root_name = name
  +kind = expected
  +seen = visited
  +initial_budget = budget
  +initial_depth = depth
  +result = Core.plan(source, root_path, root_name, kind, seen, initial_budget, initial_depth)
  %Equal.sym(Bool,
    Relation.successful(Relation.observe_core(result)),
    Rank.successful(result),
    Support.observed_success_exact(result)):
    {_ == True{} : Bool}
  RankLaws.plan_completes(source, root_path, root_name, kind, seen, initial_budget, initial_depth)
