import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./INTERPRETER_ORDER_PROOF.bend as Order
import ./INTERPRETER_STRING_FACTS.bend as StringFacts
import ./GRAPH_STRING_FACTS.bend as StringAppend

# Exact projections/primitive correspondence for the original full step equation.
def state(machine: Core.Machine) -> Spec.State:
  match machine:
    case Core.Machine{_, _, _, visited, budget, address, _, _, pending}:
      Spec.State{visited, budget, address, pending}

def frames(machine: Core.Machine) -> List<&2, Core.Frame>:
  match machine:
    case Core.Machine{_, _, frames, _, _, _, _, _, _}: frames

def value_exact(-V: Data, pair: Map<&2, V> & V) -> {
  Core.map_result(V, pair) == Spec.value(V, pair) : V
}:
  match pair:
    case Tuple{_, _}: {==}

def cmp_le_not_gt(+comparison: Cmp) -> {
  Cmp.is_le(comparison) == Bool.not(Cmp.is_gt(comparison)) : Bool
}:
  match comparison:
    case LT{}: {==}
    case EQ{}: {==}
    case GT{}: {==}

def limits_exact(
  +limits: Core.LocalLimits,
  +work: Nat,
  +graph_work: Nat,
  +depth: Nat,
  +count: Nat
) -> {
  CoreTraversal.limits_allow(limits, work, graph_work, depth, count)
    == Spec.within_limits(limits, work, graph_work, depth, count) : Bool
}:
  match limits:
    case Core.LocalLimits{+work_cap, +depth_cap, +target_cap}:
      %Equal.sym(
        Bool,
        Nat.is_le(depth, depth_cap),
        Bool.not(Nat.is_gt(depth, depth_cap)),
        cmp_le_not_gt(Nat.cmp(depth, depth_cap))
      ):
        {
          Bool.and(
            _,
            Bool.and(Nat.is_le(count, target_cap), Nat.is_le((work + graph_work : Nat), work_cap))
          )
          == Bool.and(
            Bool.not(Nat.is_gt(depth, depth_cap)),
            Bool.and(
              Bool.not(Nat.is_gt(count, target_cap)),
              Bool.not(Nat.is_gt((work + graph_work : Nat), work_cap))
            )
          )
          : Bool
        }
      %Equal.sym(
        Bool,
        Nat.is_le(count, target_cap),
        Bool.not(Nat.is_gt(count, target_cap)),
        cmp_le_not_gt(Nat.cmp(count, target_cap))
      ):
        {
          Bool.and(
            Bool.not(Nat.is_gt(depth, depth_cap)),
            Bool.and(_, Nat.is_le((work + graph_work : Nat), work_cap))
          )
          == Bool.and(
            Bool.not(Nat.is_gt(depth, depth_cap)),
            Bool.and(
              Bool.not(Nat.is_gt(count, target_cap)),
              Bool.not(Nat.is_gt((work + graph_work : Nat), work_cap))
            )
          )
          : Bool
        }
      %Equal.sym(
        Bool,
        Nat.is_le((work + graph_work : Nat), work_cap),
        Bool.not(Nat.is_gt((work + graph_work : Nat), work_cap)),
        cmp_le_not_gt(Nat.cmp((work + graph_work : Nat), work_cap))
      ):
        {
          Bool.and(
            Bool.not(Nat.is_gt(depth, depth_cap)),
            Bool.and(Bool.not(Nat.is_gt(count, target_cap)), _)
          )
          == Bool.and(
            Bool.not(Nat.is_gt(depth, depth_cap)),
            Bool.and(
              Bool.not(Nat.is_gt(count, target_cap)),
              Bool.not(Nat.is_gt((work + graph_work : Nat), work_cap))
            )
          )
          : Bool
        }
      {==}

def budget_allows_exact(+budget: Core.Budget, +count: Nat) -> {
  CoreTraversal.budget_allows(budget, count) == Spec.allowed_budget(budget, count) : Bool
}:
  match budget:
    case Core.Budget{limits, _, _, work, graph_work, depth}:
      limits_exact(limits, work, graph_work, depth, count)

def target_map_exact(+budget: Core.Budget, +path: String) -> {
  CoreTraversal.target_map(budget, path) == Spec.path_set(budget, path) : Map<&2, Bool>
}:
  match budget:
    case Core.Budget{_, targets, _, _, _, _}:
      value_exact(Map<&2, Bool>, Map.get(Map<&2, Bool>, MTip{}, targets, path))

def target_update_exact(+budget: Core.Budget, +path: String, +set: Map<&2, Bool>) -> {
  CoreTraversal.store_targets(budget, path, set) == Spec.observe_set(budget, path, set) : Core.Budget
}:
  match budget:
    case Core.Budget{_, _, _, _, _, _}: {==}

def target_from_set(
  budget: Core.Budget,
  path: String,
  identity: String,
  set: Map<&2, Bool>
) -> Core.Budget:
  CoreTraversal.store_targets(budget, path, Map.set(&2, Bool, set, identity, True{}))

def target_budget_exact(+budget: Core.Budget, +path: String, +identity: String) -> {
  CoreTraversal.charge_target(budget, path, identity)
  == Spec.target_budget(budget, path, identity)
  : Core.Budget
}:
  Equal.trans(
    Core.Budget,
    CoreTraversal.charge_target(budget, path, identity),
    target_from_set(budget, path, identity, Spec.path_set(budget, path)),
    Spec.target_budget(budget, path, identity),
    Equal.cong(
      Map<&2, Bool>,
      Core.Budget,
      target_from_set(budget, path, identity),
      CoreTraversal.target_map(budget, path),
      Spec.path_set(budget, path),
      target_map_exact(budget, path)
    ),
    target_update_exact(
      budget,
      path,
      Map.set(&2, Bool, Spec.path_set(budget, path), identity, True{})
    )
  )

def kind_exact(+expected: Core.ExpectedKind, +function: Bool) -> {
  CoreTraversal.kind_matches(expected, function) == Spec.matches(expected, function) : Bool
}:
  match expected function:
    case Core.AnyKind{} True{}: {==}
    case Core.AnyKind{} False{}: {==}
    case Core.TypeKind{} True{}: {==}
    case Core.TypeKind{} False{}: {==}
    case Core.FunctionKind{} True{}: {==}
    case Core.FunctionKind{} False{}: {==}

def expected_key_exact(+expected: Core.ExpectedKind, +name: String) -> {
  CoreTraversal.expected_key(expected, name) == Spec.key_by_kind(expected, name) : String
}:
  match expected:
    case Core.AnyKind{}: {==}
    case Core.TypeKind{}: {==}
    case Core.FunctionKind{}: {==}

def lookup_key_exact(+aware: Bool, +expected: Core.ExpectedKind, +name: String) -> {
  CoreTraversal.lookup_key(aware, expected, name) == Spec.key(aware, expected, name) : String
}:
  match aware:
    case True{}: expected_key_exact(expected, name)
    case False{}: {==}

def equal_symmetry_step(
  +ab: Bool,
  +ba: Bool,
  +a: String,
  +b: String,
  +left: {String.eq(a, b) == ab : Bool},
  +right: {String.eq(b, a) == ba : Bool}
) -> {ab == ba : Bool}:
  match ab ba:
    case True{} True{}: {==}
    case False{} False{}: {==}
    case True{} False{}:
      same = StringFacts.eq_of_eq_true(a, b, left)
      forward = Equal.cong(String, Bool, name => String.eq(b, name), a, b, same)
      impossible = Equal.trans(
        Bool,
        False{},
        String.eq(b, a),
        True{},
        Equal.sym(Bool, String.eq(b, a), False{}, right),
        Equal.trans(Bool, String.eq(b, a), String.eq(b, b), True{}, forward, StringFacts.eq_refl(b))
      )
      Empty.absurd({True{} == False{} : Bool}, Order.internal_false_ne_true(impossible))
    case False{} True{}:
      same = StringFacts.eq_of_eq_true(b, a, right)
      forward = Equal.cong(String, Bool, name => String.eq(a, name), b, a, same)
      impossible = Equal.trans(
        Bool,
        False{},
        String.eq(a, b),
        True{},
        Equal.sym(Bool, String.eq(a, b), False{}, left),
        Equal.trans(Bool, String.eq(a, b), String.eq(a, a), True{}, forward, StringFacts.eq_refl(a))
      )
      Empty.absurd({False{} == True{} : Bool}, Order.internal_false_ne_true(impossible))

def equal_symmetric(+a: String, +b: String) -> {String.eq(a, b) == String.eq(b, a) : Bool}:
  equal_symmetry_step(String.eq(a, b), String.eq(b, a), a, b, {==}, {==})

def budget_exact(+machine: Core.Machine) -> {
  CoreTraversal.machine_budget(machine) == Spec.state_budget(state(machine)) : Core.Budget
}:
  match machine:
    case Core.Machine{_, _, _, _, _, _, _, _, _}: {==}

def depth_exact(+machine: Core.Machine, +depth: Nat) -> {
  state(CoreTraversal.observe_machine_depth(machine, depth))
  == Spec.reference_depth(state(machine), depth)
  : Spec.State
}:
  match machine:
    case Core.Machine{_, _, _, _, Core.Budget{_, _, _, _, _, _}, _, _, _, _}: {==}

def work_exact(+machine: Core.Machine) -> {
  state(CoreTraversal.charge_machine_work(machine)) == Spec.local_work(state(machine)) : Spec.State
}:
  match machine:
    case Core.Machine{_, _, _, _, Core.Budget{_, _, _, _, _, _}, _, _, _, _}: {==}

def with_budget(
  visited: Map<&2, Bool>,
  address: Nat,
  pending: List<&2, Core.Pending>,
  budget: Core.Budget
) -> Spec.State:
  Spec.State{visited, budget, address, pending}

def target_exact(+machine: Core.Machine, +identity: String) -> {
  state(CoreTraversal.charge_machine_target(machine, identity))
    == Spec.target(state(machine), CoreTraversal.machine_path(machine), identity) : Spec.State
}:
  match machine:
    case Core.Machine{_, +path, _, +visited, +budget, +address, _, _, +pending}:
      Equal.cong(Core.Budget, Spec.State, with_budget(visited, address, pending),
        CoreTraversal.charge_target(budget, path, identity), Spec.target_budget(budget, path, identity),
        target_budget_exact(budget, path, identity))

def allowed_from_set(budget: Core.Budget, set: Map<&2, Bool>) -> Bool:
  CoreTraversal.budget_allows(budget, Map.size(&2, Bool, set))

def allowed_exact(+machine: Core.Machine) -> {
  CoreTraversal.machine_allows(machine) == Spec.allowed(state(machine), CoreTraversal.machine_path(machine)) : Bool
}:
  match machine:
    case Core.Machine{_, +path, _, _, +budget, _, _, _, _}:
      Equal.trans(Bool,
        CoreTraversal.budget_allows(budget, Map.size(&2, Bool, CoreTraversal.target_map(budget, path))),
        CoreTraversal.budget_allows(budget, Map.size(&2, Bool, Spec.path_set(budget, path))),
        Spec.allowed_budget(budget, Map.size(&2, Bool, Spec.path_set(budget, path))),
        Equal.cong(Map<&2, Bool>, Bool, allowed_from_set(budget), CoreTraversal.target_map(budget, path),
          Spec.path_set(budget, path), target_map_exact(budget, path)),
        budget_allows_exact(budget, Map.size(&2, Bool, Spec.path_set(budget, path))))

def seen_exact(+machine: Core.Machine, +identity: String) -> {
  CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), identity)
  == Spec.seen(state(machine), identity)
  : Bool
}:
  match machine:
    case Core.Machine{_, _, _, visited, _, _, _, _, _}:
      value_exact(Bool, Map.has(&2, Bool, visited, identity))

def declaration_at(
  catalog: Map<&2, Maybe<&2, Core.Declaration>>,
  key: String
) -> Maybe<&2, Core.Declaration>:
  Core.map_result(
    Maybe<&2, Core.Declaration>,
    Map.get(Maybe<&2, Core.Declaration>, None{}, catalog, key)
  )

def declaration_lookup_exact(+facts: Core.Facts, +name: String, +expected: Core.ExpectedKind) -> {
  CoreTraversal.declaration_lookup(facts, name, expected)
  == Spec.find_declaration(facts, name, expected)
  : Maybe<&2, Core.Declaration>
}:
  match facts:
    case Core.Facts{+aware, +catalog, _, _}:
      Equal.trans(
        Maybe<&2, Core.Declaration>,
        declaration_at(catalog, CoreTraversal.lookup_key(aware, expected, name)),
        declaration_at(catalog, Spec.key(aware, expected, name)),
        Spec.value(
          Maybe<&2, Core.Declaration>,
          Map.get(Maybe<&2, Core.Declaration>, None{}, catalog, Spec.key(aware, expected, name))
        ),
        Equal.cong(
          String,
          Maybe<&2, Core.Declaration>,
          declaration_at(catalog),
          CoreTraversal.lookup_key(aware, expected, name),
          Spec.key(aware, expected, name),
          lookup_key_exact(aware, expected, name)
        ),
        value_exact(
          Maybe<&2, Core.Declaration>,
          Map.get(Maybe<&2, Core.Declaration>, None{}, catalog, Spec.key(aware, expected, name))
        )
      )

def import_lookup_exact(+facts: Core.Facts, +name: String) -> {
  CoreTraversal.import_lookup(facts, name) == Spec.find_import(facts, name) : Maybe<&2, Core.ImportBinding>
}:
  match facts:
    case Core.Facts{_, _, imports, _}:
      value_exact(
        Maybe<&2, Core.ImportBinding>,
        Map.get(Maybe<&2, Core.ImportBinding>, None{}, imports, name)
      )

def supporting_lookup_exact(+facts: Core.Facts, +name: String) -> {
  CoreTraversal.supporting_lookup(facts, name) == Spec.supporting(facts, name) : Maybe<&2, Core.Declaration>
}:
  match facts:
    case Core.Facts{_, _, _, supporting}:
      value_exact(
        Maybe<&2, Core.Declaration>,
        Map.get(Maybe<&2, Core.Declaration>, None{}, supporting, name)
      )

def composite_ending(path: String, import_path: String, name: String) -> String:
  String.append(path, String.append(SCon{Char.from_u32(0), SNil{}},
    String.append(import_path, String.append(SCon{Char.from_u32(0), SNil{}}, name))))

def import_key_exact(+path: String, +imported: Core.ImportBinding) -> {
  CoreTraversal.import_target_key(path, imported) == Spec.import_key(path, imported) : String
}:
  match imported:
    case Core.ImportBinding{+import_path, +name, _}:
      Equal.cong(
        String,
        String,
        composite_ending(path, import_path),
        name,
        String.append(name, SNil{}),
        Equal.sym(String, String.append(name, SNil{}), name, StringAppend.append_nil(name))
      )

def other_key_exact(+path: String, +symbol: String, +imported: Maybe<&2, Core.ImportBinding>) -> {
  CoreTraversal.nonlocal_target_key(path, symbol, imported)
  == Spec.other_key(imported, path, symbol)
  : String
}:
  match imported:
    case None{}: {==}
    case Some{binding}: import_key_exact(path, binding)

def target_key_exact(+path: String, +symbol: String, +local: Maybe<&2, Core.Declaration>,
    +imported: Maybe<&2, Core.ImportBinding>) -> {
      CoreTraversal.reference_target_key(path, symbol, local, imported)
      == Spec.identity_key(local, imported, path, symbol)
      : String
    }:
  match local:
    case None{}: other_key_exact(path, symbol, imported)
    case Some{Core.Declaration{_, _, _, _, _}}: {==}

def bundled_test(
  declaration: Core.Declaration,
  target: String,
  expected: Core.ExpectedKind
) -> Bool:
  match declaration:
    case Core.Declaration{_, identity, function, bundled, _}:
      Bool.and(bundled, Bool.and(String.eq(target, identity), Spec.matches(expected, function)))

def bundled_test_exact(
  +declaration: Core.Declaration,
  +target: String,
  +expected: Core.ExpectedKind
) -> {
  CoreTraversal.bundled_valid(declaration, target, expected)
    == bundled_test(declaration, target, expected) : Bool
}:
  match declaration:
    case Core.Declaration{_, +identity, +function, +bundled, _}:
      %Equal.sym(
        Bool,
        CoreTraversal.kind_matches(expected, function),
        Spec.matches(expected, function),
        kind_exact(expected, function)
      ):
        {
          Bool.and(bundled, Bool.and(String.eq(identity, target), _))
          == Bool.and(
            bundled,
            Bool.and(String.eq(target, identity), Spec.matches(expected, function))
          )
          : Bool
        }
      %Equal.sym(
        Bool,
        String.eq(identity, target),
        String.eq(target, identity),
        equal_symmetric(identity, target)
      ):
        {
          Bool.and(bundled, Bool.and(_, Spec.matches(expected, function)))
          == Bool.and(
            bundled,
            Bool.and(String.eq(target, identity), Spec.matches(expected, function))
          )
          : Bool
        }
      {==}
