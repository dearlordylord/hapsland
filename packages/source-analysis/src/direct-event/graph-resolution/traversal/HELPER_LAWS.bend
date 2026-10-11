import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec

# Supporting simulation obligations only; these do not replace the approved
# whole-algorithm equality and termination laws.
law declaration_key_agrees:
  for +aware: Bool
  for +expected: Core.ExpectedKind
  for +name: String
  {CoreTraversal.lookup_key(aware, expected, name) == Spec.key(aware, expected, name) : String}

law declaration_lookup_agrees:
  for +facts: Core.Facts
  for +name: String
  for +expected: Core.ExpectedKind
  {
    CoreTraversal.declaration_lookup(facts, name, expected)
    == Spec.find_declaration(facts, name, expected)
    : Maybe<&2, Core.Declaration>
  }

law import_lookup_agrees:
  for +facts: Core.Facts
  for +name: String
  {CoreTraversal.import_lookup(facts, name) == Spec.find_import(facts, name) : Maybe<&2, Core.ImportBinding>}

law supporting_lookup_agrees:
  for +facts: Core.Facts
  for +identity: String
  {
    CoreTraversal.supporting_lookup(facts, identity)
    == Spec.supporting(facts, identity)
    : Maybe<&2, Core.Declaration>
  }

law depth_observation_agrees:
  for +budget: Core.Budget
  for +depth: Nat
  {CoreTraversal.observe_depth(budget, depth) == Spec.depth_budget(budget, depth) : Core.Budget}

law work_charge_agrees:
  for +budget: Core.Budget
  {CoreTraversal.charge_work(budget) == Spec.work_budget(budget) : Core.Budget}

law path_targets_agree:
  for +budget: Core.Budget
  for +path: String
  {CoreTraversal.target_map(budget, path) == Spec.path_set(budget, path) : Map<&2, Bool>}

law empty_path_observation_agrees:
  for +budget: Core.Budget
  for +path: String
  {CoreTraversal.ensure_path(budget, path) == Spec.ensure_path(budget, path) : Core.Budget}

law target_charge_agrees:
  for +budget: Core.Budget
  for +path: String
  for +identity: String
  {
    CoreTraversal.charge_target(budget, path, identity)
    == Spec.target_budget(budget, path, identity)
    : Core.Budget
  }

law kind_admission_agrees:
  for +expected: Core.ExpectedKind
  for +function: Bool
  {CoreTraversal.kind_matches(expected, function) == Spec.matches(expected, function) : Bool}

# The two modules independently project the value from the primitive Map result.
law map_value_projection_agrees:
  for -V: Data
  for pair: Map<&2, V> & V
  {Core.map_result(V, pair) == Spec.value(V, pair) : V}
