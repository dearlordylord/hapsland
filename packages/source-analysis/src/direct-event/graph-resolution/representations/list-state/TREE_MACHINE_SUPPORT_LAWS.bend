import Base
import ./core.bend as Core
import ./RANK.bend as Rank
import ./TREE_MACHINE_RELATION.bend as Relation

# Observation preserves the exact existing full planner completion discriminator.
law observed_success_exact:
  for +result: Core.RunResult
  {Relation.successful(Relation.observe_core(result)) == Rank.successful(result) : Bool}
