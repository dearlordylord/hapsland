import Base

# Draft independent equations of the existing combined materialization preflight.
# This is a verification owner, never a production dependency. Native arithmetic
# remains JS IEEE arithmetic; the specification pins its ordered primitive trace.
# Site counts denote replies to ObserveSites, not eagerly extracted parser facts.
type Operation is Data:
  Push{value: Nat}
  MeasureArtifact{function_slot: Nat}
  ObserveSites{function_slot: Nat}
  MeasureRawSite{function_slot: Nat, site_slot: Nat}
  MeasureRawPath{}
  Add{}
  Multiply{}
  ReadTypeBytes{}
  Swap{}
  ObserveRootImports{}
  ReadTypeImports{}
  InspectGo{}

type Decision is Data:
  Unavailable{}
  RetainBound{}
  MeasuredEmpty{imports: Bool}
  Measured{declarations: Nat, imports: Bool}

type Plan is Data:
  Plan{decision: Decision, operations: List<&2, Operation>}

# Each site's original left-associated expression is
# 4 * ((1024 + (6 * rawSiteBytes)) + (2 * rawPathBytes)).
# Raw path measurement is deliberately repeated for every site.
def site_operations(function_slot: Nat, site_slot: Nat) -> List<&2, Operation>:
  [Push{4n}, Push{1024n}, Push{6n}, MeasureRawSite{function_slot, site_slot},
    Multiply{}, Add{}, Push{2n}, MeasureRawPath{}, Multiply{}, Add{}, Multiply{}, Add{}]

def sites_operations(remaining: Nat, +function_slot: Nat, +site_slot: Nat) -> List<&2, Operation>:
  match remaining:
    case 0n: []
    case 1n++tail:
      List.append(&2, Operation, site_operations(function_slot, site_slot),
        sites_operations(tail, function_slot, Nat.add(site_slot, 1n)))

# Artifact construction (including the 64-zero sentinel hash) and JSON byte
# measurement happen before descendants are read. ObserveSites preserves that
# native fault boundary. Only then may raw site text be observed.
def function_operations(+slot: Nat, sites: Nat) -> List<&2, Operation>:
  List.append(&2, Operation,
    [MeasureArtifact{slot}, Push{1024n}, Add{}, ObserveSites{slot}],
    List.append(&2, Operation, sites_operations(sites, slot, 0n), [Add{}]))

def functions_operations(sites: List<&2, Nat>, +slot: Nat) -> List<&2, Operation>:
  match sites:
    case []: []
    case head <> tail:
      List.append(&2, Operation, function_operations(slot, head),
        functions_operations(tail, Nat.add(slot, 1n)))

# Type bytes are read after callable sizing. Swap retains the original final
# operand order (typeBytes ?? 0) + functionTotal, rather than commuting addition.
# Imports are observed after arithmetic, except for the measured-empty branch.
def imports_operations(root_imports: Bool) -> List<&2, Operation>:
  match root_imports:
    case True{}: [ObserveRootImports{}]
    case False{}: [ObserveRootImports{}, ReadTypeImports{}]

def measured_operations(sites: List<&2, Nat>, root_imports: Bool) -> List<&2, Operation>:
  List.append(
    &2,
    Operation,
    [Push{0n}],
    List.append(
      &2,
      Operation,
      functions_operations(sites, 0n),
      List.append(&2, Operation, [ReadTypeBytes{}, Swap{}, Add{}], imports_operations(root_imports))
    )
  )

def nonempty_admission(
  has_types_without_bound: Bool,
  count: Nat,
  sites: List<&2, Nat>,
  imports: Bool,
  root_imports: Bool
) -> Plan:
  match has_types_without_bound:
    case True{}: Plan{Unavailable{}, []}
    case False{}: Plan{Measured{count, imports}, measured_operations(sites, root_imports)}

def admitted(
  +count: Nat,
  types: Nat,
  sites: List<&2, Nat>,
  bound: Bool,
  imports: Bool,
  root_imports: Bool
) -> Plan:
  match count:
    case 0n: Plan{MeasuredEmpty{imports}, imports_operations(root_imports)}
    case 1n++_:
      nonempty_admission(Bool.and(Bool.not(Nat.is_eq(types, 0n)), Bool.not(bound)),
        count, sites, imports, root_imports)

def guarded(
  valid: Bool,
  count: Nat,
  types: Nat,
  sites: List<&2, Nat>,
  bound: Bool,
  imports: Bool,
  root_imports: Bool
) -> Plan:
  match valid:
    case False{}: Plan{Unavailable{}, []}
    case True{}: admitted(count, types, sites, bound, imports, root_imports)

# Imports in this equation are the eventual native observations. The trace fixes
# when they may be read; no input encoding may move that read before measurements.
def typescript(
  parse_valid: Bool,
  +types: Nat,
  +sites: List<&2, Nat>,
  bound: Bool,
  +root_imports: Bool,
  type_imports: Bool
) -> Plan:
  guarded(Bool.and(parse_valid, Nat.is_le(Nat.add(types, List.length(&2, Nat, sites)), 1024n)),
    Nat.add(types, List.length(&2, Nat, sites)), types, sites, bound,
    Bool.or(root_imports, type_imports), root_imports)

def inspected_go(valid: Bool) -> Plan:
  match valid:
    case False{}: Plan{Unavailable{}, [InspectGo{}]}
    case True{}: Plan{MeasuredEmpty{True{}}, [InspectGo{}]}

# Inspection is not performed when a type bound already exists.
def go(bound: Bool, inspection_valid: Bool) -> Plan:
  match bound:
    case True{}: Plan{RetainBound{}, []}
    case False{}: inspected_go(inspection_valid)

def passthrough(bound: Bool) -> Plan:
  match bound:
    case True{}: Plan{RetainBound{}, []}
    case False{}: Plan{Unavailable{}, []}

def main() -> Unit:
  Unit{}
