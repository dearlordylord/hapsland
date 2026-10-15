import Base
import ./Model.bend as M

# Incremental combined-preflight policy inside the existing native Preflight
# invocation. Counts arrive only at their original parser observation boundary.
# No syntax node, IEEE value or cross-command resource enters this machine.
type Phase is Data:
  Functions{slot: Nat, remaining: Nat, count: Nat}
  FunctionSites{slot: Nat, remaining_functions: Nat, count: Nat}
  Sites{slot: Nat, site: Nat, remaining: Nat, remaining_functions: Nat, count: Nat}
  Finish{count: Nat}
  Imports{count: Nat, empty: Bool}

type Step is Data:
  Advance{phase: Phase, request: Nat}
  Engine{operation: M.Operation, request: Nat, remaining: List<&2, M.Operation>, next: Phase}
  AwaitSites{slot: Nat, remaining_functions: Nat, count: Nat, request: Nat}
  AwaitRootImports{count: Nat, empty: Bool, request: Nat}
  AwaitTypeImports{count: Nat, empty: Bool, request: Nat}
  AwaitGo{request: Nat}
  Completed{decision: M.Decision}
  InvalidReply{}

type Reply is Data:
  Ack{request: Nat}
  SitesObserved{request: Nat, count: Nat}
  ImportsObserved{request: Nat, present: Bool}
  GoInspected{request: Nat, valid: Bool}

def queue(operations: List<&2, M.Operation>, next: Phase, request: Nat) -> Step:
  match operations:
    case []: Advance{next, request}
    case head <> tail: Engine{head, request, tail, next}

# Written independently from the recursive verification equations. The cursor
# queues one site's primitives; it never precomputes future parser observations.
def site_operations(slot: Nat, site: Nat) -> List<&2, M.Operation>:
  [
    M.Push{4n},
    M.Push{1024n},
    M.Push{6n},
    M.MeasureRawSite{slot, site},
    M.Multiply{},
    M.Add{},
    M.Push{2n},
    M.MeasureRawPath{},
    M.Multiply{},
    M.Add{},
    M.Multiply{},
    M.Add{}
  ]

def functions(+slot: Nat, remaining: Nat, count: Nat, +request: Nat) -> Step:
  match remaining:
    case 0n: Advance{Finish{count}, request}
    case 1n++tail:
      queue([M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}],
        FunctionSites{slot, tail, count}, request)

def sites(
  +slot: Nat,
  +site: Nat,
  remaining: Nat,
  remaining_functions: Nat,
  count: Nat,
  request: Nat
) -> Step:
  match remaining:
    case 0n:
      queue([M.Add{}], Functions{Nat.add(slot, 1n), remaining_functions, count}, request)
    case 1n++tail:
      queue(
        site_operations(slot, site),
        Sites{slot, Nat.add(site, 1n), tail, remaining_functions, count},
        request
      )

def phase(phase: Phase, +request: Nat) -> Step:
  match phase:
    case Functions{slot, remaining, count}: functions(slot, remaining, count, request)
    case FunctionSites{slot, remaining, count}: AwaitSites{slot, remaining, count, request}
    case Sites{slot, site, remaining, functions, count}:
      sites(slot, site, remaining, functions, count, request)
    case Finish{count}:
      queue([M.ReadTypeBytes{}, M.Swap{}, M.Add{}], Imports{count, False{}}, request)
    case Imports{count, empty}: AwaitRootImports{count, empty, request}

def advance(step: Step) -> Step:
  match step:
    case Advance{next, request}: phase(next, request)
    case _: InvalidReply{}

def completed(empty: Bool, count: Nat, imports: Bool) -> Step:
  match empty:
    case True{}: Completed{M.MeasuredEmpty{imports}}
    case False{}: Completed{M.Measured{count, imports}}

def root_imports(present: Bool, count: Nat, empty: Bool, request: Nat) -> Step:
  match present:
    case True{}: completed(empty, count, True{})
    case False{}: AwaitTypeImports{count, empty, request}

def inspected_go(valid: Bool) -> Step:
  match valid:
    case True{}: Completed{M.MeasuredEmpty{True{}}}
    case False{}: Completed{M.Unavailable{}}

def accepted_ack(
  matches: Bool,
  remaining: List<&2, M.Operation>,
  next: Phase,
  request: Nat
) -> Step:
  match matches:
    case True{}: queue(remaining, next, Nat.add(request, 1n))
    case False{}: InvalidReply{}

def accepted_sites(
  matches: Bool,
  slot: Nat,
  functions: Nat,
  count: Nat,
  sites: Nat,
  request: Nat
) -> Step:
  match matches:
    case True{}: Advance{Sites{slot, 0n, sites, functions, count}, Nat.add(request, 1n)}
    case False{}: InvalidReply{}

def accepted_root_imports(
  matches: Bool,
  count: Nat,
  empty: Bool,
  present: Bool,
  request: Nat
) -> Step:
  match matches:
    case True{}: root_imports(present, count, empty, Nat.add(request, 1n))
    case False{}: InvalidReply{}

def accepted_type_imports(matches: Bool, count: Nat, empty: Bool, present: Bool) -> Step:
  match matches:
    case True{}: completed(empty, count, present)
    case False{}: InvalidReply{}

def accepted_go(matches: Bool, valid: Bool) -> Step:
  match matches:
    case True{}: inspected_go(valid)
    case False{}: InvalidReply{}

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case Engine{_, +request, remaining, next} Ack{actual}:
      accepted_ack(Nat.is_eq(request, actual), remaining, next, request)
    case AwaitSites{slot, functions, count, +request} SitesObserved{actual, sites}:
      accepted_sites(Nat.is_eq(request, actual), slot, functions, count, sites, request)
    case AwaitRootImports{count, empty, +request} ImportsObserved{actual, present}:
      accepted_root_imports(Nat.is_eq(request, actual), count, empty, present, request)
    case AwaitTypeImports{count, empty, request} ImportsObserved{actual, present}:
      accepted_type_imports(Nat.is_eq(request, actual), count, empty, present)
    case AwaitGo{request} GoInspected{actual, valid}:
      accepted_go(Nat.is_eq(request, actual), valid)
    case _ _: InvalidReply{}

def nonempty(allowed: Bool, count: Nat, functions: Nat) -> Step:
  match allowed:
    case False{}: Completed{M.Unavailable{}}
    case True{}: queue([M.Push{0n}], Functions{0n, functions, count}, 0n)

def admitted(+count: Nat, types: Nat, functions: Nat, bound: Bool) -> Step:
  match count:
    case 0n: AwaitRootImports{0n, True{}, 0n}
    case 1n++_:
      nonempty(Bool.or(Nat.is_eq(types, 0n), bound), count, functions)

def guarded(valid: Bool, count: Nat, types: Nat, functions: Nat, bound: Bool) -> Step:
  match valid:
    case False{}: Completed{M.Unavailable{}}
    case True{}: admitted(count, types, functions, bound)

def typescript(parse_valid: Bool, +types: Nat, +functions: Nat, bound: Bool) -> Step:
  guarded(Bool.and(parse_valid, Nat.is_le(Nat.add(types, functions), 1024n)),
    Nat.add(types, functions), types, functions, bound)

def go(bound: Bool) -> Step:
  match bound:
    case True{}: Completed{M.RetainBound{}}
    case False{}: AwaitGo{0n}

def passthrough(bound: Bool) -> Step:
  match bound:
    case True{}: Completed{M.RetainBound{}}
    case False{}: Completed{M.Unavailable{}}

def main() -> Unit:
  Unit{}
