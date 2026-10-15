import Base
import ./Model.bend as M

# Draft independent equations of the existing combined materialization preflight.
# This is a verification owner, never a production dependency. Native arithmetic
# remains JS IEEE arithmetic; the specification pins its ordered primitive trace.
# Site counts denote replies to M.ObserveSites, not eagerly extracted parser facts.
# Each site's original left-associated expression is
# 4 * ((1024 + (6 * rawSiteBytes)) + (2 * rawPathBytes)).
# Raw path measurement is deliberately repeated for every site.
def site_operations(function_slot: Nat, site_slot: Nat) -> List<&2, M.Operation>:
  [
    M.Push{4n},
    M.Push{1024n},
    M.Push{6n},
    M.MeasureRawSite{function_slot, site_slot},
    M.Multiply{},
    M.Add{},
    M.Push{2n},
    M.MeasureRawPath{},
    M.Multiply{},
    M.Add{},
    M.Multiply{},
    M.Add{}
  ]

def sites_operations(remaining: Nat, +function_slot: Nat, +site_slot: Nat) -> List<&2, M.Operation>:
  match remaining:
    case 0n: []
    case 1n++tail:
      List.append(&2, M.Operation, site_operations(function_slot, site_slot),
        sites_operations(tail, function_slot, Nat.add(site_slot, 1n)))

# Artifact construction (including the 64-zero sentinel hash) and JSON byte
# measurement happen before descendants are read. M.ObserveSites preserves that
# native fault boundary. Only then may raw site text be observed.
def function_operations(+slot: Nat, sites: Nat) -> List<&2, M.Operation>:
  List.append(&2, M.Operation,
    [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}, M.ObserveSites{slot}],
    List.append(&2, M.Operation, sites_operations(sites, slot, 0n), [M.Add{}]))

def functions_operations(sites: List<&2, Nat>, +slot: Nat) -> List<&2, M.Operation>:
  match sites:
    case []: []
    case head <> tail:
      List.append(&2, M.Operation, function_operations(slot, head),
        functions_operations(tail, Nat.add(slot, 1n)))

# Type bytes are read after callable sizing. M.Swap retains the original final
# operand order (typeBytes ?? 0) + functionTotal, rather than commuting addition.
# Imports are observed after arithmetic, except for the measured-empty branch.
def imports_operations(root_imports: Bool) -> List<&2, M.Operation>:
  match root_imports:
    case True{}: [M.ObserveRootImports{}]
    case False{}: [M.ObserveRootImports{}, M.ReadTypeImports{}]

def measured_operations(sites: List<&2, Nat>, root_imports: Bool) -> List<&2, M.Operation>:
  List.append(
    &2,
    M.Operation,
    [M.Push{0n}],
    List.append(
      &2,
      M.Operation,
      functions_operations(sites, 0n),
      List.append(
        &2,
        M.Operation,
        [M.ReadTypeBytes{}, M.Swap{}, M.Add{}],
        imports_operations(root_imports)
      )
    )
  )

def nonempty_admission(
  has_types_without_bound: Bool,
  count: Nat,
  sites: List<&2, Nat>,
  imports: Bool,
  root_imports: Bool
) -> M.Plan:
  match has_types_without_bound:
    case True{}: M.Plan{M.Unavailable{}, []}
    case False{}: M.Plan{M.Measured{count, imports}, measured_operations(sites, root_imports)}

def admitted(
  +count: Nat,
  types: Nat,
  sites: List<&2, Nat>,
  bound: Bool,
  imports: Bool,
  root_imports: Bool
) -> M.Plan:
  match count:
    case 0n: M.Plan{M.MeasuredEmpty{imports}, imports_operations(root_imports)}
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
) -> M.Plan:
  match valid:
    case False{}: M.Plan{M.Unavailable{}, []}
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
) -> M.Plan:
  guarded(Bool.and(parse_valid, Nat.is_le(Nat.add(types, List.length(&2, Nat, sites)), 1024n)),
    Nat.add(types, List.length(&2, Nat, sites)), types, sites, bound,
    Bool.or(root_imports, type_imports), root_imports)

def inspected_go(valid: Bool) -> M.Plan:
  match valid:
    case False{}: M.Plan{M.Unavailable{}, [M.InspectGo{}]}
    case True{}: M.Plan{M.MeasuredEmpty{True{}}, [M.InspectGo{}]}

# Inspection is not performed when a type bound already exists.
def go(bound: Bool, inspection_valid: Bool) -> M.Plan:
  match bound:
    case True{}: M.Plan{M.RetainBound{}, []}
    case False{}: inspected_go(inspection_valid)

def passthrough(bound: Bool) -> M.Plan:
  match bound:
    case True{}: M.Plan{M.RetainBound{}, []}
    case False{}: M.Plan{M.Unavailable{}, []}

def main() -> Unit:
  Unit{}
