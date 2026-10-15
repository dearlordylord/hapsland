import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S

# Independent protocol equations. These do not call Core's queue, admission,
# acceptance helpers, advance or resume. Wrong reply constructors/ids reject.
def queued(operations: List<&2, M.Operation>, next: C.Phase, request: Nat) -> C.Step:
  match operations:
    case []: C.Advance{next, request}
    case head <> tail: C.Engine{head, request, tail, next}

def ack(same: Bool, remaining: List<&2, M.Operation>, next: C.Phase, request: Nat) -> C.Step:
  match same:
    case False{}: C.InvalidReply{}
    case True{}: queued(remaining, next, Nat.add(request, 1n))

def sites_reply(
  same: Bool,
  slot: Nat,
  functions: Nat,
  count: Nat,
  sites: Nat,
  request: Nat
) -> C.Step:
  match same:
    case False{}: C.InvalidReply{}
    case True{}: C.Advance{C.Sites{slot, 0n, sites, functions, count}, Nat.add(request, 1n)}

def completed(empty: Bool, count: Nat, imports: Bool) -> C.Step:
  match empty:
    case True{}: C.Completed{M.MeasuredEmpty{imports}}
    case False{}: C.Completed{M.Measured{count, imports}}

def root(present: Bool, count: Nat, empty: Bool, request: Nat) -> C.Step:
  match present:
    case True{}: completed(empty, count, True{})
    case False{}: C.AwaitTypeImports{count, empty, Nat.add(request, 1n)}

def root_reply(same: Bool, count: Nat, empty: Bool, present: Bool, request: Nat) -> C.Step:
  match same:
    case False{}: C.InvalidReply{}
    case True{}: root(present, count, empty, request)

def type_reply(same: Bool, count: Nat, empty: Bool, present: Bool) -> C.Step:
  match same:
    case False{}: C.InvalidReply{}
    case True{}: completed(empty, count, present)

def inspected(valid: Bool) -> C.Step:
  match valid:
    case False{}: C.Completed{M.Unavailable{}}
    case True{}: C.Completed{M.MeasuredEmpty{True{}}}

def go_reply(same: Bool, valid: Bool) -> C.Step:
  match same:
    case False{}: C.InvalidReply{}
    case True{}: inspected(valid)

def resume(step: C.Step, reply: C.Reply) -> C.Step:
  match step reply:
    case C.Engine{_, +request, remaining, next} C.Ack{actual}:
      ack(Nat.is_eq(request, actual), remaining, next, request)
    case C.AwaitSites{slot, functions, count, +request} C.SitesObserved{actual, sites}:
      sites_reply(Nat.is_eq(request, actual), slot, functions, count, sites, request)
    case C.AwaitRootImports{count, empty, +request} C.ImportsObserved{actual, present}:
      root_reply(Nat.is_eq(request, actual), count, empty, present, request)
    case C.AwaitTypeImports{count, empty, request} C.ImportsObserved{actual, present}:
      type_reply(Nat.is_eq(request, actual), count, empty, present)
    case C.AwaitGo{request} C.GoInspected{actual, valid}:
      go_reply(Nat.is_eq(request, actual), valid)
    case _ _: C.InvalidReply{}

# Independently drain the scalar queue, accounting for the head Ack first and
# then one successor for each tail operation. This pins the entire next Step.
def drained(remaining: List<&2, M.Operation>, next: C.Phase, request: Nat) -> C.Step:
  match remaining:
    case []: C.Advance{next, request}
    case _ <> tail: drained(tail, next, Nat.add(request, 1n))

def grouped(same: Bool, remaining: List<&2, M.Operation>, next: C.Phase, request: Nat) -> C.Step:
  match same:
    case False{}: C.InvalidReply{}
    case True{}: drained(remaining, next, Nat.add(request, 1n))

def group(step: C.Step, reply: C.Reply) -> C.Step:
  match step reply:
    case C.Engine{_, +request, remaining, next} C.Ack{actual}:
      grouped(Nat.is_eq(request, actual), remaining, next, request)
    case _ _: C.InvalidReply{}

# Exact advance progression, including request preservation across every phase.
def function_phase(remaining: Nat, +slot: Nat, count: Nat, request: Nat) -> C.Step:
  match remaining:
    case 0n: C.Advance{C.Finish{count}, request}
    case 1n++tail:
      queued(
        [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}],
        C.FunctionSites{slot, tail, count},
        request
      )

def site_phase(
  remaining: Nat,
  +slot: Nat,
  +site: Nat,
  functions: Nat,
  count: Nat,
  request: Nat
) -> C.Step:
  match remaining:
    case 0n: queued([M.Add{}], C.Functions{Nat.add(slot, 1n), functions, count}, request)
    case 1n++tail:
      queued(
        S.site_operations(slot, site),
        C.Sites{slot, Nat.add(site, 1n), tail, functions, count},
        request
      )

def phase(phase: C.Phase, request: Nat) -> C.Step:
  match phase:
    case C.Functions{slot, remaining, count}: function_phase(remaining, slot, count, request)
    case C.FunctionSites{slot, remaining, count}: C.AwaitSites{slot, remaining, count, request}
    case C.Sites{slot, site, remaining, functions, count}: site_phase(
      remaining,
      slot,
      site,
      functions,
      count,
      request
    )
    case C.Finish{count}: queued(
      [M.ReadTypeBytes{}, M.Swap{}, M.Add{}],
      C.Imports{count, False{}},
      request
    )
    case C.Imports{count, empty}: C.AwaitRootImports{count, empty, request}

def advance(step: C.Step) -> C.Step:
  match step:
    case C.Advance{next, request}: phase(next, request)
    case _: C.InvalidReply{}

def main() -> Unit:
  Unit{}
