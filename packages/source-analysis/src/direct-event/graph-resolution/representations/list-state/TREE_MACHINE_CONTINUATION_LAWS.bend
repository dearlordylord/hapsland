import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./RANK.bend as Rank
import ./TREE_MACHINE_RELATION.bend as Relation
import ./TREE_MACHINE_CONTINUATION.bend as Continuation

# The independent recursive suffix completes for every finite raw stack and state.
law continuation_completes:
  for machine: Core.Machine
  {Relation.successful(Continuation.observe(machine)) == True{} : Bool}

# One complete actual production step preserves the meaning of all remaining work.
law step_preserves_continuation:
  for +machine: Core.Machine
  {Continuation.observe(Core.step(machine)) == Continuation.observe(machine) : Relation.Observation}

# At a terminal stack the entire accumulated flat plan is the recursive observation.
law terminal_observation_exact:
  for +machine: Core.Machine
  for terminal: {Core.done(machine) == True{} : Bool}
  {
    Relation.observe_core(Core.CompletePlan{Core.finish(machine)})
    == Continuation.observe(machine) : Relation.Observation
  }

# Adequate production fuel yields exactly the independent whole-stack result.
law run_observation_exact:
  for +fuel: Nat
  for +machine: Core.Machine
  for enough: {Nat.is_le(Rank.rank(machine), fuel) == True{} : Bool}
  {
    Relation.observe_core(Core.run(fuel, machine))
    == Continuation.observe(machine)
    : Relation.Observation
  }

# Production root entry corresponds to the complete independent recursive tree.
law initial_recursive_exact:
  for +facts: Core.Facts
  for +path: Nat
  for +name: Core.Label
  for +expected: Core.ExpectedKind
  for +visited: Own.Dictionary<Bool>
  for +budget: Core.Budget
  for +depth: Nat
  {
    Continuation.initial(facts, path, name, expected, visited, budget, depth)
    == Relation.recursive_observation(facts, path, name, expected, visited, budget, depth)
    : Relation.Observation
  }
