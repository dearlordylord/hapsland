import Base
import ./Own.bend as Own

# Whole local graph planner. Source and filesystem observations are opaque host data.
type ExpectedKind is Data:
  AnyKind{}
  TypeKind{}
  FunctionKind{}

type ReferenceKind is Data:
  Named{}
  Unsupported{}

type Reference is Data:
  Reference{kind: ReferenceKind, name: String, expected: ExpectedKind, target: Maybe<&2, String>}

type Declaration is Data:
  Declaration{handle: Nat, identity: String, function: Bool, bundled: Bool, references: List<&2, Reference>}

type ImportBinding is Data:
  ImportBinding{path: String, name: String, type_only: Bool}

type Facts is Data:
  Facts{kind_aware: Bool, declarations: Own.Dictionary<Maybe<&2, Declaration>>, imports: Own.Dictionary<Maybe<&2, ImportBinding>>, supporting: Own.Dictionary<Maybe<&2, Declaration>>}

type LocalLimits is Data:
  LocalLimits{work: Nat, depth: Nat, targets: Nat}

type Budget is Data:
  Budget{limits: LocalLimits, targets_by_path: Own.Dictionary<Own.Dictionary<Bool>>, max_targets: Nat, work: Nat, graph_work: Nat, max_depth: Nat}

type Omission is Data:
  Unresolved{}
  UnsupportedTarget{}
  ReferenceLimit{}
  Unavailable{}

type PlannedReference is Data:
  Included{identity: String}
  Expanded{node: Nat}
  Omitted{reason: Omission, target_name: String}

type ReferenceSlot is Data:
  ReferenceSlot{owner: Nat, index: Nat, symbol: String, reference: PlannedReference}

type PlannedNode is Data:
  PlannedNode{node: Nat, artifact: Nat}

type PendingTarget is Data:
  Imported{path: String, name: String}
  BundledTarget{declaration: Nat}

type Pending is Data:
  Pending{owner: Nat, index: Nat, from: String, symbol: String, name: String, depth: Nat, expected: ExpectedKind, target: PendingTarget}

type Frame is Data:
  Frame{owner: Nat, depth: Nat, index: Nat, remaining: List<&2, Reference>}

type Machine is Data:
  Machine{facts: Facts, path: String, frames: List<&2, Frame>, visited: Own.Dictionary<Bool>, budget: Budget, next_node: Nat, nodes_rev: List<&2, PlannedNode>, references_rev: List<&2, ReferenceSlot>, pending_rev: List<&2, Pending>}

type Plan is Data:
  Plan{root: Nat, nodes: List<&2, PlannedNode>, references: List<&2, ReferenceSlot>, pending: List<&2, Pending>, visited: Own.Dictionary<Bool>, budget: Budget}

def expected_key(expected: ExpectedKind, name: String) -> String:
  match expected:
    case TypeKind{}: String.append("type:", name)
    case _: String.append("function:", name)

def lookup_key(kind_aware: Bool, expected: ExpectedKind, name: String) -> String:
  match kind_aware:
    case True{}: expected_key(expected, name)
    case False{}: name

def kind_matches(expected: ExpectedKind, function: Bool) -> Bool:
  match expected:
    case AnyKind{}: True{}
    case TypeKind{}: Bool.not(function)
    case FunctionKind{}: function

# Output is accumulated in reverse while traversal remains depth-first.
def finish(machine: Machine) -> Plan:
  match machine:
    case Machine{_, _, _, visited, budget, _, nodes, references, pending}:
      Plan{0n,
        List.reverse(&2, PlannedNode, nodes),
        List.reverse(&2, ReferenceSlot, references),
        List.reverse(&2, Pending, pending), visited, budget}

def observe_depth(budget: Budget, depth: Nat) -> Budget:
  match budget:
    case Budget{limits, targets, max_targets, work, graph_work, maximum}:
      Budget{limits, targets, max_targets, work, graph_work, Nat.max(maximum, depth)}

def charge_work(budget: Budget) -> Budget:
  match budget:
    case Budget{limits, targets, max_targets, work, graph_work, depth}:
      Budget{limits, targets, max_targets, (work + 1n : Nat), graph_work, depth}

def limits_allow(limits: LocalLimits, work: Nat, graph_work: Nat, depth: Nat, targets: Nat) -> Bool:
  match limits:
    case LocalLimits{work_cap, depth_cap, target_cap}:
      Bool.and(Nat.is_le(depth, depth_cap),
        Bool.and(Nat.is_le(targets, target_cap), Nat.is_le((work + graph_work : Nat), work_cap)))

def budget_allows(budget: Budget, distinct_targets: Nat) -> Bool:
  match budget:
    case Budget{limits, _, _, work, graph_work, depth}:
      limits_allow(limits, work, graph_work, depth, distinct_targets)

def add_reference(machine: Machine, slot: ReferenceSlot) -> Machine:
  match machine:
    case Machine{facts, path, frames, visited, budget, next, nodes, references, pending}:
      Machine{facts, path, frames, visited, budget, next, nodes, slot <> references, pending}

def add_pending(machine: Machine, item: Pending) -> Machine:
  match machine:
    case Machine{facts, path, frames, visited, budget, next, nodes, references, pending}:
      Machine{facts, path, frames, visited, budget, next, nodes, references, item <> pending}

def replace_budget(machine: Machine, budget: Budget) -> Machine:
  match machine:
    case Machine{facts, path, frames, visited, _, next, nodes, references, pending}:
      Machine{facts, path, frames, visited, budget, next, nodes, references, pending}

def map_result(-V: Data, result: Own.Dictionary<V> & V) -> V:
  match result:
    case Tuple{_, value}: value

def declaration_lookup(facts: Facts, name: String, expected: ExpectedKind) -> Maybe<&2, Declaration>:
  match facts:
    case Facts{aware, declarations, _, _}:
      map_result(Maybe<&2, Declaration>,
        Own.get(Maybe<&2, Declaration>, None{}, declarations, lookup_key(aware, expected, name)))

def import_lookup(facts: Facts, name: String) -> Maybe<&2, ImportBinding>:
  match facts:
    case Facts{_, _, imports, _}:
      map_result(Maybe<&2, ImportBinding>,
        Own.get(Maybe<&2, ImportBinding>, None{}, imports, name))

def supporting_lookup(facts: Facts, identity: String) -> Maybe<&2, Declaration>:
  match facts:
    case Facts{_, _, _, supporting}:
      map_result(Maybe<&2, Declaration>,
        Own.get(Maybe<&2, Declaration>, None{}, supporting, identity))

def machine_facts(machine: Machine) -> Facts:
  match machine:
    case Machine{facts, _, _, _, _, _, _, _, _}: facts

def machine_path(machine: Machine) -> String:
  match machine:
    case Machine{_, path, _, _, _, _, _, _, _}: path

def machine_budget(machine: Machine) -> Budget:
  match machine:
    case Machine{_, _, _, _, budget, _, _, _, _}: budget

def machine_visited(machine: Machine) -> Own.Dictionary<Bool>:
  match machine:
    case Machine{_, _, _, visited, _, _, _, _, _}: visited

def has_identity(visited: Own.Dictionary<Bool>, identity: String) -> Bool:
  map_result(Bool, Own.has(Bool, visited, identity))

def target_map(budget: Budget, path: String) -> Own.Dictionary<Bool>:
  match budget:
    case Budget{_, targets, _, _, _, _}:
      map_result(Own.Dictionary<Bool>, Own.get(Own.Dictionary<Bool>, Own.DNil{}, targets, path))

def target_count(+budget: Budget, path: String) -> Nat:
  Own.size(Bool, target_map(budget, path))

def store_targets(budget: Budget, path: String, +file_targets: Own.Dictionary<Bool>) -> Budget:
  match budget:
    case Budget{limits, targets, maximum, work, graph_work, depth}:
      Budget{limits, Own.set(Own.Dictionary<Bool>, targets, path, file_targets),
        Nat.max(maximum, Own.size(Bool, file_targets)), work, graph_work, depth}

def charge_target(+budget: Budget, +path: String, key: String) -> Budget:
  store_targets(budget, path, Own.set(Bool, target_map(budget, path), key, True{}))

def observe_machine_depth(+machine: Machine, depth: Nat) -> Machine:
  replace_budget(machine, observe_depth(machine_budget(machine), depth))

def charge_machine_work(+machine: Machine) -> Machine:
  replace_budget(machine, charge_work(machine_budget(machine)))

def charge_machine_target(+machine: Machine, key: String) -> Machine:
  replace_budget(machine, charge_target(machine_budget(machine), machine_path(machine), key))

def machine_allows(+machine: Machine) -> Bool:
  budget_allows(machine_budget(machine), target_count(machine_budget(machine), machine_path(machine)))

def omit(machine: Machine, owner: Nat, index: Nat, +name: String, reason: Omission) -> Machine:
  add_reference(machine, ReferenceSlot{owner, index, name, Omitted{reason, name}})

def include(machine: Machine, owner: Nat, index: Nat, name: String, identity: String) -> Machine:
  add_reference(machine, ReferenceSlot{owner, index, name, Included{identity}})

def store_path(budget: Budget, path: String, file_targets: Own.Dictionary<Bool>) -> Budget:
  match budget:
    case Budget{limits, targets, maximum, work, graph_work, depth}:
      Budget{limits, Own.set(Own.Dictionary<Bool>, targets, path, file_targets), maximum, work, graph_work, depth}

def ensure_path(+budget: Budget, +path: String) -> Budget:
  store_path(budget, path, target_map(budget, path))

def enter_node(machine: Machine, declaration: Declaration, depth: Nat) -> Machine:
  match machine declaration:
    case Machine{facts, +path, frames, visited, budget, +next, nodes, references, pending}
      Declaration{artifact, identity, _, _, children}:
      Machine{facts, path, Frame{next, depth, 0n, children} <> frames,
        Own.set(Bool, visited, identity, True{}), ensure_path(budget, path), (next + 1n : Nat),
        PlannedNode{next, artifact} <> nodes, references, pending}

def next_node(machine: Machine) -> Nat:
  match machine:
    case Machine{_, _, _, _, _, next, _, _, _}: next

def expand_node(+machine: Machine, declaration: Declaration, owner: Nat, index: Nat, name: String, depth: Nat) -> Machine:
  enter_node(add_reference(machine, ReferenceSlot{owner, index, name, Expanded{next_node(machine)}}), declaration, depth)

def declaration_identity(declaration: Declaration) -> String:
  match declaration:
    case Declaration{_, identity, _, _, _}: identity

def local_expand_if(visited: Bool, machine: Machine, +declaration: Declaration,
    owner: Nat, index: Nat, name: String, depth: Nat) -> Machine:
  match visited:
    case True{}: include(machine, owner, index, name, declaration_identity(declaration))
    case False{}: expand_node(machine, declaration, owner, index, name, depth)

def local_expand(+machine: Machine, +declaration: Declaration,
    owner: Nat, index: Nat, name: String, depth: Nat) -> Machine:
  local_expand_if(has_identity(machine_visited(machine), declaration_identity(declaration)),
    machine, declaration, owner, index, name, depth)

def import_target_key(path: String, imported: ImportBinding) -> String:
  match imported:
    case ImportBinding{import_path, name, _}:
      String.append(path, String.append(SCon{Char.from_u32(0), SNil{}},
        String.append(import_path, String.append(SCon{Char.from_u32(0), SNil{}}, name))))

def nonlocal_target_key(path: String, name: String, imported: Maybe<&2, ImportBinding>) -> String:
  match imported:
    case None{}: name
    case Some{binding}: import_target_key(path, binding)

def reference_target_key(path: String, name: String, local: Maybe<&2, Declaration>, imported: Maybe<&2, ImportBinding>) -> String:
  match local:
    case None{}: nonlocal_target_key(path, name, imported)
    case Some{declaration}: declaration_identity(declaration)

def queue_import(+machine: Machine, +owner: Nat, +index: Nat, +symbol: String,
    depth: Nat, expected: ExpectedKind, imported: ImportBinding) -> Machine:
  match imported:
    case ImportBinding{path, +name, _}:
      add_pending(omit(machine, owner, index, symbol, Unavailable{}),
        Pending{owner, index, machine_path(machine), symbol, name, depth, expected, Imported{path, name}})

def import_by_kind(expected: ExpectedKind, type_only: Bool, machine: Machine,
    owner: Nat, index: Nat, symbol: String, depth: Nat, imported: ImportBinding) -> Machine:
  match expected type_only:
    case FunctionKind{} True{}: omit(machine, owner, index, symbol, UnsupportedTarget{})
    case kind _: queue_import(machine, owner, index, symbol, depth, kind, imported)

def import_present(machine: Machine, owner: Nat, index: Nat, symbol: String, depth: Nat,
    expected: ExpectedKind, imported: Maybe<&2, ImportBinding>) -> Machine:
  match imported:
    case None{}: omit(machine, owner, index, symbol, Unresolved{})
    case Some{ImportBinding{+path, +name, +type_only}}:
      import_by_kind(expected, type_only, machine, owner, index, symbol, depth, ImportBinding{path, name, type_only})

def local_kind(declaration: Declaration) -> Bool:
  match declaration:
    case Declaration{_, _, function, _, _}: function

def import_exists(imported: Maybe<&2, ImportBinding>) -> Bool:
  match imported:
    case None{}: False{}
    case Some{_}: True{}

def ambiguous(local: Maybe<&2, Declaration>, imported: Maybe<&2, ImportBinding>, expected: ExpectedKind) -> Bool:
  match local:
    case None{}: False{}
    case Some{declaration}: Bool.or(import_exists(imported), Bool.not(kind_matches(expected, local_kind(declaration))))

def materialize_allowed(local: Maybe<&2, Declaration>, imported: Maybe<&2, ImportBinding>,
    machine: Machine, owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  match local:
    case None{}: import_present(machine, owner, index, symbol, depth, expected, imported)
    case Some{declaration}: local_expand(machine, declaration, owner, index, symbol, (depth + 1n : Nat))

def ordinary_budget(allowed: Bool, local: Maybe<&2, Declaration>, imported: Maybe<&2, ImportBinding>,
    machine: Machine, owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  match allowed:
    case False{}: omit(machine, owner, index, symbol, ReferenceLimit{})
    case True{}: materialize_allowed(local, imported, machine, owner, index, symbol, depth, expected)

def charge_if_local(local: Maybe<&2, Declaration>, machine: Machine) -> Machine:
  match local:
    case None{}: machine
    case Some{_}: charge_machine_work(machine)

def ordinary_charged(+machine: Machine, local: Maybe<&2, Declaration>, imported: Maybe<&2, ImportBinding>,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  ordinary_budget(machine_allows(machine), local, imported, machine, owner, index, symbol, depth, expected)

def ordinary_ambiguity(conflict: Bool, +local: Maybe<&2, Declaration>, imported: Maybe<&2, ImportBinding>,
    machine: Machine, owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  match conflict:
    case True{}: omit(machine, owner, index, symbol, UnsupportedTarget{})
    case False{}: ordinary_charged(charge_if_local(local, machine), local, imported, owner, index, symbol, depth, expected)

def ordinary_targets(+machine: Machine, +local: Maybe<&2, Declaration>, +imported: Maybe<&2, ImportBinding>,
    owner: Nat, index: Nat, +symbol: String, depth: Nat, +expected: ExpectedKind) -> Machine:
  ordinary_ambiguity(ambiguous(local, imported, expected), local, imported,
    charge_machine_target(machine, reference_target_key(machine_path(machine), symbol, local, imported)),
    owner, index, symbol, depth, expected)

def ordinary_reference(+machine: Machine, owner: Nat, index: Nat, +symbol: String, depth: Nat, +expected: ExpectedKind) -> Machine:
  ordinary_targets(machine,
    declaration_lookup(machine_facts(machine), symbol, expected),
    import_lookup(machine_facts(machine), symbol), owner, index, symbol, depth, expected)

def bundled_valid(declaration: Declaration, target: String, expected: ExpectedKind) -> Bool:
  match declaration:
    case Declaration{_, identity, function, bundled, _}:
      Bool.and(bundled, Bool.and(String.eq(identity, target), kind_matches(expected, function)))

def bundled_queue(+machine: Machine, +owner: Nat, +index: Nat, +symbol: String,
    depth: Nat, expected: ExpectedKind, declaration: Declaration) -> Machine:
  match declaration:
    case Declaration{handle, _, _, _, _}:
      add_pending(omit(machine, owner, index, symbol, Unavailable{}),
        Pending{owner, index, machine_path(machine), symbol, symbol, depth, expected, BundledTarget{handle}})

def bundled_materialize(visited: Bool, machine: Machine, declaration: Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  match visited:
    case True{}: include(machine, owner, index, symbol, declaration_identity(declaration))
    case False{}: bundled_queue(machine, owner, index, symbol, depth, expected, declaration)

def bundled_budget(allowed: Bool, visited: Bool, machine: Machine, declaration: Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  match allowed:
    case False{}: omit(machine, owner, index, symbol, ReferenceLimit{})
    case True{}: bundled_materialize(visited, machine, declaration, owner, index, symbol, depth, expected)

def charge_if_visited(visited: Bool, machine: Machine) -> Machine:
  match visited:
    case True{}: charge_machine_work(machine)
    case False{}: machine

def bundled_charged(+machine: Machine, visited: Bool, declaration: Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  bundled_budget(machine_allows(machine), visited, machine, declaration, owner, index, symbol, depth, expected)

def bundled_seen(+visited: Bool, machine: Machine, declaration: Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  bundled_charged(charge_if_visited(visited, machine), visited, declaration, owner, index, symbol, depth, expected)

def bundled_target(+machine: Machine, +declaration: Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  bundled_seen(has_identity(machine_visited(machine), declaration_identity(declaration)),
    charge_machine_target(machine, declaration_identity(declaration)), declaration,
    owner, index, symbol, depth, expected)

def bundled_admit(valid: Bool, machine: Machine, declaration: Declaration,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  match valid:
    case False{}: omit(machine, owner, index, symbol, UnsupportedTarget{})
    case True{}: bundled_target(machine, declaration, owner, index, symbol, depth, expected)

def bundled_lookup(found: Maybe<&2, Declaration>, machine: Machine,
    owner: Nat, index: Nat, symbol: String, depth: Nat, +expected: ExpectedKind, target: String) -> Machine:
  match found:
    case None{}: omit(machine, owner, index, symbol, UnsupportedTarget{})
    case Some{+declaration}: bundled_admit(bundled_valid(declaration, target, expected), machine,
      declaration, owner, index, symbol, depth, expected)

def named_reference(target: Maybe<&2, String>, +machine: Machine,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  match target:
    case None{}: ordinary_reference(machine, owner, index, symbol, depth, expected)
    case Some{+identity}: bundled_lookup(supporting_lookup(machine_facts(machine), identity),
      machine, owner, index, symbol, depth, expected, identity)

def reference_kind(kind: ReferenceKind, target: Maybe<&2, String>, machine: Machine,
    owner: Nat, index: Nat, symbol: String, depth: Nat, expected: ExpectedKind) -> Machine:
  match kind:
    case Unsupported{}: omit(machine, owner, index, symbol, UnsupportedTarget{})
    case Named{}: named_reference(target, machine, owner, index, symbol, depth, expected)

def visit_reference(machine: Machine, owner: Nat, index: Nat, +depth: Nat, reference: Reference) -> Machine:
  match reference:
    case Reference{kind, name, expected, target}:
      reference_kind(kind, target, observe_machine_depth(machine, (depth + 1n : Nat)),
        owner, index, name, depth, expected)

def push_frame(machine: Machine, frame: Frame) -> Machine:
  match machine:
    case Machine{facts, path, frames, visited, budget, next, nodes, references, pending}:
      Machine{facts, path, frame <> frames, visited, budget, next, nodes, references, pending}

def process_frame(machine: Machine, frame: Frame) -> Machine:
  match frame:
    case Frame{_, _, _, []}: machine
    case Frame{+owner, +depth, +index, reference <> rest}:
      visit_reference(push_frame(machine, Frame{owner, depth, (index + 1n : Nat), rest}), owner, index, depth, reference)

def step(machine: Machine) -> Machine:
  match machine:
    case Machine{facts, path, [], visited, budget, next, nodes, references, pending}:
      Machine{facts, path, [], visited, budget, next, nodes, references, pending}
    case Machine{facts, path, frame <> tail, visited, budget, next, nodes, references, pending}:
      process_frame(Machine{facts, path, tail, visited, budget, next, nodes, references, pending}, frame)

type RunResult is Data:
  CompletePlan{plan: Plan}
  MissingRoot{visited: Own.Dictionary<Bool>, budget: Budget}
  InvariantFailure{machine: Machine}

def done(machine: Machine) -> Bool:
  match machine:
    case Machine{_, _, [], _, _, _, _, _, _}: True{}
    case _: False{}

def run_zero(complete: Bool, machine: Machine) -> RunResult:
  match complete:
    case True{}: CompletePlan{finish(machine)}
    case False{}: InvariantFailure{machine}

def run_if(complete: Bool, machine: Machine, recurse: Machine -> RunResult) -> RunResult:
  match complete:
    case True{}: CompletePlan{finish(machine)}
    case False{}: recurse(step(machine))

def run(fuel: Nat, +machine: Machine) -> RunResult:
  match fuel:
    case 0n: run_zero(done(machine), machine)
    case 1n+rest: run_if(done(machine), machine, next => run(rest, next))

def declaration_reference_count(declaration: Maybe<&2, Declaration>) -> Nat:
  match declaration:
    case None{}: 0n
    case Some{Declaration{_, _, _, _, references}}: List.length(&2, Reference, references)

def catalog_reference_count(entries: List<&2, Maybe<&2, Declaration>>) -> Nat:
  match entries:
    case []: 0n
    case head <> tail: (declaration_reference_count(head) + catalog_reference_count(tail) : Nat)

def traversal_bound(facts: Facts) -> Nat:
  match facts:
    case Facts{_, declarations, _, _}:
      (2n * catalog_reference_count(Own.values(Maybe<&2, Declaration>, declarations)) + 2n : Nat)

def plan_found(found: Maybe<&2, Declaration>, +facts: Facts, path: String,
    visited: Own.Dictionary<Bool>, budget: Budget, depth: Nat) -> RunResult:
  match found:
    case None{}: MissingRoot{visited, budget}
    case Some{declaration}:
      run(traversal_bound(facts), enter_node(
        Machine{facts, path, [], visited, budget, 0n, [], [], []}, declaration, depth))

def plan(+facts: Facts, path: String, name: String, expected: ExpectedKind,
    visited: Own.Dictionary<Bool>, budget: Budget, depth: Nat) -> RunResult:
  plan_found(declaration_lookup(facts, name, expected), facts, path, visited, budget, depth)

# Boundary constructors only: no reference classification in the host encoder.
def declaration_entry(catalog: Own.Dictionary<Maybe<&2, Declaration>>, key: String, declaration: Declaration) -> Own.Dictionary<Maybe<&2, Declaration>>:
  Own.set(Maybe<&2, Declaration>, catalog, key, Some{declaration})

def import_entry(catalog: Own.Dictionary<Maybe<&2, ImportBinding>>, key: String, imported: ImportBinding) -> Own.Dictionary<Maybe<&2, ImportBinding>>:
  Own.set(Maybe<&2, ImportBinding>, catalog, key, Some{imported})

def identity_entry(visited: Own.Dictionary<Bool>, identity: String) -> Own.Dictionary<Bool>:
  Own.set(Bool, visited, identity, True{})

def path_targets_entry(catalog: Own.Dictionary<Own.Dictionary<Bool>>, path: String, targets: Own.Dictionary<Bool>) -> Own.Dictionary<Own.Dictionary<Bool>>:
  Own.set(Own.Dictionary<Bool>, catalog, path, targets)
