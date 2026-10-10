import Base
import ./core.bend as Core

def expected_key(expected: Core.ExpectedKind, name: String) -> String:
  match expected:
    case Core.TypeKind{}: String.append("type:", name)
    case _: String.append("function:", name)

def lookup_key(kind_aware: Bool, expected: Core.ExpectedKind, name: String) -> String:
  match kind_aware:
    case True{}: expected_key(expected, name)
    case False{}: name

def kind_matches(expected: Core.ExpectedKind, function: Bool) -> Bool:
  match expected:
    case Core.AnyKind{}: True{}
    case Core.TypeKind{}: Bool.not(function)
    case Core.FunctionKind{}: function

# Output is accumulated in reverse while traversal remains depth-first.
def finish(machine: Core.Machine) -> Core.Plan:
  match machine:
    case Core.Machine{_, _, _, visited, budget, _, nodes, references, pending}:
      Core.Plan{0n,
        List.reverse(&2, Core.PlannedNode, nodes),
        List.reverse(&2, Core.ReferenceSlot, references),
        List.reverse(&2, Core.Pending, pending), visited, budget}

def observe_depth(budget: Core.Budget, depth: Nat) -> Core.Budget:
  match budget:
    case Core.Budget{limits, targets, max_targets, work, graph_work, maximum}:
      Core.Budget{limits, targets, max_targets, work, graph_work, Nat.max(maximum, depth)}

def charge_work(budget: Core.Budget) -> Core.Budget:
  match budget:
    case Core.Budget{limits, targets, max_targets, work, graph_work, depth}:
      Core.Budget{limits, targets, max_targets, (work + 1n : Nat), graph_work, depth}

def limits_allow(limits: Core.LocalLimits, work: Nat, graph_work: Nat, depth: Nat, targets: Nat) -> Bool:
  match limits:
    case Core.LocalLimits{work_cap, depth_cap, target_cap}:
      Bool.and(Nat.is_le(depth, depth_cap),
        Bool.and(Nat.is_le(targets, target_cap), Nat.is_le((work + graph_work : Nat), work_cap)))

def budget_allows(budget: Core.Budget, distinct_targets: Nat) -> Bool:
  match budget:
    case Core.Budget{limits, _, _, work, graph_work, depth}:
      limits_allow(limits, work, graph_work, depth, distinct_targets)

def add_reference(machine: Core.Machine, slot: Core.ReferenceSlot) -> Core.Machine:
  match machine:
    case Core.Machine{facts, path, frames, visited, budget, next, nodes, references, pending}:
      Core.Machine{facts, path, frames, visited, budget, next, nodes, slot <> references, pending}

def add_pending(machine: Core.Machine, item: Core.Pending) -> Core.Machine:
  match machine:
    case Core.Machine{facts, path, frames, visited, budget, next, nodes, references, pending}:
      Core.Machine{facts, path, frames, visited, budget, next, nodes, references, item <> pending}

def replace_budget(machine: Core.Machine, budget: Core.Budget) -> Core.Machine:
  match machine:
    case Core.Machine{facts, path, frames, visited, _, next, nodes, references, pending}:
      Core.Machine{facts, path, frames, visited, budget, next, nodes, references, pending}

def declaration_lookup(facts: Core.Facts, name: String, expected: Core.ExpectedKind) -> Maybe<&2, Core.Declaration>:
  match facts:
    case Core.Facts{aware, declarations, _, _}:
      Core.map_result(Maybe<&2, Core.Declaration>,
        Map.get(Maybe<&2, Core.Declaration>, None{}, declarations, lookup_key(aware, expected, name)))

def import_lookup(facts: Core.Facts, name: String) -> Maybe<&2, Core.ImportBinding>:
  match facts:
    case Core.Facts{_, _, imports, _}:
      Core.map_result(Maybe<&2, Core.ImportBinding>,
        Map.get(Maybe<&2, Core.ImportBinding>, None{}, imports, name))

def supporting_lookup(facts: Core.Facts, identity: String) -> Maybe<&2, Core.Declaration>:
  match facts:
    case Core.Facts{_, _, _, supporting}:
      Core.map_result(Maybe<&2, Core.Declaration>,
        Map.get(Maybe<&2, Core.Declaration>, None{}, supporting, identity))

def machine_facts(machine: Core.Machine) -> Core.Facts:
  match machine:
    case Core.Machine{facts, _, _, _, _, _, _, _, _}: facts

def machine_path(machine: Core.Machine) -> String:
  match machine:
    case Core.Machine{_, path, _, _, _, _, _, _, _}: path

def machine_budget(machine: Core.Machine) -> Core.Budget:
  match machine:
    case Core.Machine{_, _, _, _, budget, _, _, _, _}: budget

def machine_visited(machine: Core.Machine) -> Map<&2, Bool>:
  match machine:
    case Core.Machine{_, _, _, visited, _, _, _, _, _}: visited

def has_identity(visited: Map<&2, Bool>, identity: String) -> Bool:
  Core.map_result(Bool, Map.has(&2, Bool, visited, identity))

def target_map(budget: Core.Budget, path: String) -> Map<&2, Bool>:
  match budget:
    case Core.Budget{_, targets, _, _, _, _}:
      Core.map_result(Map<&2, Bool>, Map.get(Map<&2, Bool>, MTip{}, targets, path))

def target_count(+budget: Core.Budget, path: String) -> Nat:
  Map.size(&2, Bool, target_map(budget, path))

def store_targets(budget: Core.Budget, path: String, +file_targets: Map<&2, Bool>) -> Core.Budget:
  match budget:
    case Core.Budget{limits, targets, maximum, work, graph_work, depth}:
      Core.Budget{limits, Map.set(&2, Map<&2, Bool>, targets, path, file_targets),
        Nat.max(maximum, Map.size(&2, Bool, file_targets)), work, graph_work, depth}

def charge_target(+budget: Core.Budget, +path: String, key: String) -> Core.Budget:
  store_targets(budget, path, Map.set(&2, Bool, target_map(budget, path), key, True{}))

def observe_machine_depth(+machine: Core.Machine, depth: Nat) -> Core.Machine:
  replace_budget(machine, observe_depth(machine_budget(machine), depth))

def charge_machine_work(+machine: Core.Machine) -> Core.Machine:
  replace_budget(machine, charge_work(machine_budget(machine)))

def charge_machine_target(+machine: Core.Machine, key: String) -> Core.Machine:
  replace_budget(machine, charge_target(machine_budget(machine), machine_path(machine), key))

def machine_allows(+machine: Core.Machine) -> Bool:
  budget_allows(machine_budget(machine), target_count(machine_budget(machine), machine_path(machine)))

def omit(machine: Core.Machine, owner: Nat, index: Nat, +name: String, reason: Core.Omission) -> Core.Machine:
  add_reference(machine, Core.ReferenceSlot{owner, index, name, Core.Omitted{reason, name}})

def include(machine: Core.Machine, owner: Nat, index: Nat, name: String, identity: String) -> Core.Machine:
  add_reference(machine, Core.ReferenceSlot{owner, index, name, Core.Included{identity}})

def store_path(budget: Core.Budget, path: String, file_targets: Map<&2, Bool>) -> Core.Budget:
  match budget:
    case Core.Budget{limits, targets, maximum, work, graph_work, depth}:
      Core.Budget{limits, Map.set(&2, Map<&2, Bool>, targets, path, file_targets), maximum, work, graph_work, depth}

def ensure_path(+budget: Core.Budget, +path: String) -> Core.Budget:
  store_path(budget, path, target_map(budget, path))

def enter_node(machine: Core.Machine, declaration: Core.Declaration, depth: Nat) -> Core.Machine:
  match machine declaration:
    case Core.Machine{facts, +path, frames, visited, budget, +next, nodes, references, pending}
      Core.Declaration{artifact, identity, _, _, children}:
      Core.Machine{facts, path, Core.Frame{next, depth, 0n, children} <> frames,
        Map.set(&2, Bool, visited, identity, True{}), ensure_path(budget, path), (next + 1n : Nat),
        Core.PlannedNode{next, artifact} <> nodes, references, pending}

def next_node(machine: Core.Machine) -> Nat:
  match machine:
    case Core.Machine{_, _, _, _, _, next, _, _, _}: next

def expand_node(+machine: Core.Machine, declaration: Core.Declaration, owner: Nat, index: Nat, name: String, depth: Nat) -> Core.Machine:
  enter_node(add_reference(machine, Core.ReferenceSlot{owner, index, name, Core.Expanded{next_node(machine)}}), declaration, depth)

def declaration_identity(declaration: Core.Declaration) -> String:
  match declaration:
    case Core.Declaration{_, identity, _, _, _}: identity

def local_expand_if(visited: Bool, machine: Core.Machine, +declaration: Core.Declaration,
    owner: Nat, index: Nat, name: String, depth: Nat) -> Core.Machine:
  match visited:
    case True{}: include(machine, owner, index, name, declaration_identity(declaration))
    case False{}: expand_node(machine, declaration, owner, index, name, depth)

def local_expand(+machine: Core.Machine, +declaration: Core.Declaration,
    owner: Nat, index: Nat, name: String, depth: Nat) -> Core.Machine:
  local_expand_if(has_identity(machine_visited(machine), declaration_identity(declaration)),
    machine, declaration, owner, index, name, depth)

def import_target_key(path: String, imported: Core.ImportBinding) -> String:
  match imported:
    case Core.ImportBinding{import_path, name, _}:
      String.append(path, String.append(SCon{Char.from_u32(0), SNil{}},
        String.append(import_path, String.append(SCon{Char.from_u32(0), SNil{}}, name))))

def nonlocal_target_key(path: String, name: String, imported: Maybe<&2, Core.ImportBinding>) -> String:
  match imported:
    case None{}: name
    case Some{binding}: import_target_key(path, binding)

def reference_target_key(path: String, name: String, local: Maybe<&2, Core.Declaration>, imported: Maybe<&2, Core.ImportBinding>) -> String:
  match local:
    case None{}: nonlocal_target_key(path, name, imported)
    case Some{declaration}: declaration_identity(declaration)

def queue_import(+machine: Core.Machine, +owner: Nat, +index: Nat, +symbol: String,
    depth: Nat, expected: Core.ExpectedKind, imported: Core.ImportBinding) -> Core.Machine:
  match imported:
    case Core.ImportBinding{path, +name, _}:
      add_pending(omit(machine, owner, index, symbol, Core.Unavailable{}),
        Core.Pending{owner, index, machine_path(machine), symbol, name, depth, expected, Core.Imported{path, name}})

def import_by_kind(expected: Core.ExpectedKind, type_only: Bool, machine: Core.Machine,
    owner: Nat, index: Nat, symbol: String, depth: Nat, imported: Core.ImportBinding) -> Core.Machine:
  match expected type_only:
    case Core.FunctionKind{} True{}: omit(machine, owner, index, symbol, Core.UnsupportedTarget{})
    case kind _: queue_import(machine, owner, index, symbol, depth, kind, imported)

def import_present(machine: Core.Machine, owner: Nat, index: Nat, symbol: String, depth: Nat,
    expected: Core.ExpectedKind, imported: Maybe<&2, Core.ImportBinding>) -> Core.Machine:
  match imported:
    case None{}: omit(machine, owner, index, symbol, Core.Unresolved{})
    case Some{Core.ImportBinding{+path, +name, +type_only}}:
      import_by_kind(expected, type_only, machine, owner, index, symbol, depth, Core.ImportBinding{path, name, type_only})

def local_kind(declaration: Core.Declaration) -> Bool:
  match declaration:
    case Core.Declaration{_, _, function, _, _}: function

def import_exists(imported: Maybe<&2, Core.ImportBinding>) -> Bool:
  match imported:
    case None{}: False{}
    case Some{_}: True{}

def ambiguous(local: Maybe<&2, Core.Declaration>, imported: Maybe<&2, Core.ImportBinding>, expected: Core.ExpectedKind) -> Bool:
  match local:
    case None{}: False{}
    case Some{declaration}: Bool.or(import_exists(imported), Bool.not(kind_matches(expected, local_kind(declaration))))

def materialize_allowed(local: Maybe<&2, Core.Declaration>, imported: Maybe<&2, Core.ImportBinding>,
    machine: Core.Machine, owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  match local:
    case None{}: import_present(machine, owner, index, symbol, depth, expected, imported)
    case Some{declaration}: local_expand(machine, declaration, owner, index, symbol, (depth + 1n : Nat))

def ordinary_budget(allowed: Bool, local: Maybe<&2, Core.Declaration>, imported: Maybe<&2, Core.ImportBinding>,
    machine: Core.Machine, owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  match allowed:
    case False{}: omit(machine, owner, index, symbol, Core.ReferenceLimit{})
    case True{}: materialize_allowed(local, imported, machine, owner, index, symbol, depth, expected)

def charge_if_local(local: Maybe<&2, Core.Declaration>, machine: Core.Machine) -> Core.Machine:
  match local:
    case None{}: machine
    case Some{_}: charge_machine_work(machine)

def ordinary_charged(+machine: Core.Machine, local: Maybe<&2, Core.Declaration>, imported: Maybe<&2, Core.ImportBinding>,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  ordinary_budget(machine_allows(machine), local, imported, machine, owner, index, symbol, depth, expected)

def ordinary_ambiguity(conflict: Bool, +local: Maybe<&2, Core.Declaration>, imported: Maybe<&2, Core.ImportBinding>,
    machine: Core.Machine, owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  match conflict:
    case True{}: omit(machine, owner, index, symbol, Core.UnsupportedTarget{})
    case False{}: ordinary_charged(charge_if_local(local, machine), local, imported, owner, index, symbol, depth, expected)

def ordinary_targets(+machine: Core.Machine, +local: Maybe<&2, Core.Declaration>, +imported: Maybe<&2, Core.ImportBinding>,
    owner: Nat, index: Nat, +symbol: String, depth: Nat, +expected: Core.ExpectedKind) -> Core.Machine:
  ordinary_ambiguity(ambiguous(local, imported, expected), local, imported,
    charge_machine_target(machine, reference_target_key(machine_path(machine), symbol, local, imported)),
    owner, index, symbol, depth, expected)

def ordinary_reference(+machine: Core.Machine, owner: Nat, index: Nat, +symbol: String, depth: Nat, +expected: Core.ExpectedKind) -> Core.Machine:
  ordinary_targets(machine,
    declaration_lookup(machine_facts(machine), symbol, expected),
    import_lookup(machine_facts(machine), symbol), owner, index, symbol, depth, expected)

def bundled_valid(declaration: Core.Declaration, target: String, expected: Core.ExpectedKind) -> Bool:
  match declaration:
    case Core.Declaration{_, identity, function, bundled, _}:
      Bool.and(bundled, Bool.and(String.eq(identity, target), kind_matches(expected, function)))

def bundled_queue(+machine: Core.Machine, +owner: Nat, +index: Nat, +symbol: String,
    depth: Nat, expected: Core.ExpectedKind, declaration: Core.Declaration) -> Core.Machine:
  match declaration:
    case Core.Declaration{handle, _, _, _, _}:
      add_pending(omit(machine, owner, index, symbol, Core.Unavailable{}),
        Core.Pending{owner, index, machine_path(machine), symbol, symbol, depth, expected, Core.BundledTarget{handle}})

def bundled_materialize(visited: Bool, machine: Core.Machine, declaration: Core.Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  match visited:
    case True{}: include(machine, owner, index, symbol, declaration_identity(declaration))
    case False{}: bundled_queue(machine, owner, index, symbol, depth, expected, declaration)

def bundled_budget(allowed: Bool, visited: Bool, machine: Core.Machine, declaration: Core.Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  match allowed:
    case False{}: omit(machine, owner, index, symbol, Core.ReferenceLimit{})
    case True{}: bundled_materialize(visited, machine, declaration, owner, index, symbol, depth, expected)

def charge_if_visited(visited: Bool, machine: Core.Machine) -> Core.Machine:
  match visited:
    case True{}: charge_machine_work(machine)
    case False{}: machine

def bundled_charged(+machine: Core.Machine, visited: Bool, declaration: Core.Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  bundled_budget(machine_allows(machine), visited, machine, declaration, owner, index, symbol, depth, expected)

def bundled_seen(+visited: Bool, machine: Core.Machine, declaration: Core.Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  bundled_charged(charge_if_visited(visited, machine), visited, declaration, owner, index, symbol, depth, expected)

def bundled_target(+machine: Core.Machine, +declaration: Core.Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  bundled_seen(has_identity(machine_visited(machine), declaration_identity(declaration)),
    charge_machine_target(machine, declaration_identity(declaration)), declaration,
    owner, index, symbol, depth, expected)

def bundled_admit(valid: Bool, machine: Core.Machine, declaration: Core.Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  match valid:
    case False{}: omit(machine, owner, index, symbol, Core.UnsupportedTarget{})
    case True{}: bundled_target(machine, declaration, owner, index, symbol, depth, expected)

def bundled_lookup(found: Maybe<&2, Core.Declaration>, machine: Core.Machine,
    owner: Nat, index: Nat, symbol: String, depth: Nat, +expected: Core.ExpectedKind, target: String) -> Core.Machine:
  match found:
    case None{}: omit(machine, owner, index, symbol, Core.UnsupportedTarget{})
    case Some{+declaration}: bundled_admit(bundled_valid(declaration, target, expected), machine,
      declaration, owner, index, symbol, depth, expected)

def named_reference(target: Maybe<&2, String>, +machine: Core.Machine,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  match target:
    case None{}: ordinary_reference(machine, owner, index, symbol, depth, expected)
    case Some{+identity}: bundled_lookup(supporting_lookup(machine_facts(machine), identity),
      machine, owner, index, symbol, depth, expected, identity)

def reference_kind(kind: Core.ReferenceKind, target: Maybe<&2, String>, machine: Core.Machine,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: Core.ExpectedKind) -> Core.Machine:
  match kind:
    case Core.Unsupported{}: omit(machine, owner, index, symbol, Core.UnsupportedTarget{})
    case Core.Named{}: named_reference(target, machine, owner, index, symbol, depth, expected)

def visit_reference(machine: Core.Machine, owner: Nat, index: Nat, +depth: Nat, reference: Core.Reference) -> Core.Machine:
  match reference:
    case Core.Reference{kind, name, expected, target}:
      reference_kind(kind, target, observe_machine_depth(machine, (depth + 1n : Nat)),
        owner, index, name, depth, expected)

def push_frame(machine: Core.Machine, frame: Core.Frame) -> Core.Machine:
  match machine:
    case Core.Machine{facts, path, frames, visited, budget, next, nodes, references, pending}:
      Core.Machine{facts, path, frame <> frames, visited, budget, next, nodes, references, pending}

def process_frame(machine: Core.Machine, frame: Core.Frame) -> Core.Machine:
  match frame:
    case Core.Frame{_, _, _, []}: machine
    case Core.Frame{+owner, +depth, +index, reference <> rest}:
      visit_reference(push_frame(machine, Core.Frame{owner, depth, (index + 1n : Nat), rest}), owner, index, depth, reference)

def step(machine: Core.Machine) -> Core.Machine:
  match machine:
    case Core.Machine{facts, path, [], visited, budget, next, nodes, references, pending}:
      Core.Machine{facts, path, [], visited, budget, next, nodes, references, pending}
    case Core.Machine{facts, path, frame <> tail, visited, budget, next, nodes, references, pending}:
      process_frame(Core.Machine{facts, path, tail, visited, budget, next, nodes, references, pending}, frame)

def done(machine: Core.Machine) -> Bool:
  match machine:
    case Core.Machine{_, _, [], _, _, _, _, _, _}: True{}
    case _: False{}

def run_zero(complete: Bool, machine: Core.Machine) -> Core.RunResult:
  match complete:
    case True{}: Core.CompletePlan{finish(machine)}
    case False{}: Core.InvariantFailure{machine}

def run_if(complete: Bool, machine: Core.Machine, recurse: Core.Machine -> Core.RunResult) -> Core.RunResult:
  match complete:
    case True{}: Core.CompletePlan{finish(machine)}
    case False{}: recurse(step(machine))

def run(fuel: Nat, +machine: Core.Machine) -> Core.RunResult:
  match fuel:
    case 0n: run_zero(done(machine), machine)
    case 1n+rest: run_if(done(machine), machine, next => run(rest, next))

def declaration_reference_count(declaration: Maybe<&2, Core.Declaration>) -> Nat:
  match declaration:
    case None{}: 0n
    case Some{Core.Declaration{_, _, _, _, references}}: List.length(&2, Core.Reference, references)

def catalog_reference_count(entries: List<&2, Maybe<&2, Core.Declaration>>) -> Nat:
  match entries:
    case []: 0n
    case head <> tail: (declaration_reference_count(head) + catalog_reference_count(tail) : Nat)

def traversal_bound(facts: Core.Facts) -> Nat:
  match facts:
    case Core.Facts{_, declarations, _, _}:
      (2n * catalog_reference_count(Map.values(&2, Maybe<&2, Core.Declaration>, declarations)) + 2n : Nat)

def plan_found(found: Maybe<&2, Core.Declaration>, +facts: Core.Facts, path: String,
    visited: Map<&2, Bool>, budget: Core.Budget, depth: Nat) -> Core.RunResult:
  match found:
    case None{}: Core.MissingRoot{visited, budget}
    case Some{declaration}:
      run(traversal_bound(facts), enter_node(
        Core.Machine{facts, path, [], visited, budget, 0n, [], [], []}, declaration, depth))

def plan(+facts: Core.Facts, path: String, name: String, expected: Core.ExpectedKind,
    visited: Map<&2, Bool>, budget: Core.Budget, depth: Nat) -> Core.RunResult:
  plan_found(declaration_lookup(facts, name, expected), facts, path, visited, budget, depth)

# Boundary constructors only: no reference classification in the host encoder.
def declaration_entry(catalog: Map<&2, Maybe<&2, Core.Declaration>>, key: String, declaration: Core.Declaration) -> Map<&2, Maybe<&2, Core.Declaration>>:
  Map.set(&2, Maybe<&2, Core.Declaration>, catalog, key, Some{declaration})

def import_entry(catalog: Map<&2, Maybe<&2, Core.ImportBinding>>, key: String, imported: Core.ImportBinding) -> Map<&2, Maybe<&2, Core.ImportBinding>>:
  Map.set(&2, Maybe<&2, Core.ImportBinding>, catalog, key, Some{imported})

def identity_entry(visited: Map<&2, Bool>, identity: String) -> Map<&2, Bool>:
  Map.set(&2, Bool, visited, identity, True{})

def path_targets_entry(catalog: Map<&2, Map<&2, Bool>>, path: String, targets: Map<&2, Bool>) -> Map<&2, Map<&2, Bool>>:
  Map.set(&2, Map<&2, Bool>, catalog, path, targets)
