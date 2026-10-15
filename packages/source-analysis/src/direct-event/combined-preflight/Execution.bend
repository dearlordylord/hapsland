import Base
import ./Model.bend as M
import ./Core.bend as C

# Verification only: execute the actual grouped production protocol. Recursion
# consumes the supplied function list and each observed site's Nat count. There
# is no caller fuel premise; an unexpected stage returns None, never a successful
# Unavailable plan. The trace comes only from actual Engine/Await constructors.
def completed(step: C.Step, operations: List<&2, M.Operation>) -> Maybe<&2, M.Plan>:
  match step:
    case C.Completed{decision}: Some{M.Plan{decision, operations}}
    case _: None{}

def advance(
  +step: C.Step,
  operations: List<&2, M.Operation>,
  next: C.Step -> List<&2, M.Operation> -> Maybe<&2, M.Plan>
) -> Maybe<&2, M.Plan>:
  match step:
    case C.Advance{_, _}: next(C.advance(step))(operations)
    case _: None{}

def group(
  +step: C.Step,
  operations: List<&2, M.Operation>,
  next: C.Step -> List<&2, M.Operation> -> Maybe<&2, M.Plan>
) -> Maybe<&2, M.Plan>:
  match step:
    case C.Engine{operation, +request, remaining, _}:
      advance(C.resume_group(step, C.Ack{request}),
        List.append(&2, M.Operation, operations, operation <> remaining), next)
    case _: None{}

def after_root(
  +step: C.Step,
  type_imports: Bool,
  operations: List<&2, M.Operation>
) -> Maybe<&2, M.Plan>:
  match step:
    case C.Completed{_}: completed(step, operations)
    case C.AwaitTypeImports{_, _, request}:
      completed(C.resume(step, C.ImportsObserved{request, type_imports}),
        List.append(&2, M.Operation, operations, [M.ReadTypeImports{}]))
    case _: None{}

def imports(
  +step: C.Step,
  root_imports: Bool,
  type_imports: Bool,
  operations: List<&2, M.Operation>
) -> Maybe<&2, M.Plan>:
  match step:
    case C.AwaitRootImports{_, _, request}:
      after_root(C.resume(step, C.ImportsObserved{request, root_imports}), type_imports,
        List.append(&2, M.Operation, operations, [M.ObserveRootImports{}]))
    case _: None{}

def measurement(
  step: C.Step,
  root_imports: Bool,
  type_imports: Bool,
  operations: List<&2, M.Operation>
) -> Maybe<&2, M.Plan>:
  group(step, operations,
    next => trace => imports(next, root_imports, type_imports, trace))

def sites(
  remaining: Nat,
  step: C.Step,
  operations: List<&2, M.Operation>,
  next: C.Step -> List<&2, M.Operation> -> Maybe<&2, M.Plan>
) -> Maybe<&2, M.Plan>:
  match remaining:
    case 0n: group(step, operations, next)
    case 1n++tail:
      group(step, operations,
        following => trace => sites(tail, following, trace, next))

def observation(
  +step: C.Step,
  +count: Nat,
  operations: List<&2, M.Operation>,
  next: C.Step -> List<&2, M.Operation> -> Maybe<&2, M.Plan>
) -> Maybe<&2, M.Plan>:
  match step:
    case C.AwaitSites{slot, _, _, request}:
      advance(C.resume(step, C.SitesObserved{request, count}),
        List.append(&2, M.Operation, operations, [M.ObserveSites{slot}]),
        following => trace => sites(count, following, trace, next))
    case _: None{}

def functions(
  counts: List<&2, Nat>,
  step: C.Step,
  root_imports: Bool,
  type_imports: Bool,
  operations: List<&2, M.Operation>
) -> Maybe<&2, M.Plan>:
  match counts:
    case []:
      advance(step, operations,
        following => trace => measurement(following, root_imports, type_imports, trace))
    case head <> tail:
      group(step, operations,
        following => trace => observation(following, head, trace,
          after => emitted => functions(tail, after, root_imports, type_imports, emitted)))

def started(
  +step: C.Step,
  counts: List<&2, Nat>,
  +root_imports: Bool,
  +type_imports: Bool
) -> Maybe<&2, M.Plan>:
  match step:
    case C.Completed{_}: completed(step, [])
    case C.AwaitRootImports{_, _, _}: imports(step, root_imports, type_imports, [])
    case C.Engine{_, _, _, _}:
      group(step, [],
        following => trace => functions(counts, following, root_imports, type_imports, trace))
    case _: None{}

def typescript(
  valid: Bool,
  types: Nat,
  +counts: List<&2, Nat>,
  bound: Bool,
  root_imports: Bool,
  type_imports: Bool
) -> Maybe<&2, M.Plan>:
  started(C.typescript(valid, types, List.length(&2, Nat, counts), bound),
    counts, root_imports, type_imports)

def inspected(+step: C.Step, valid: Bool) -> Maybe<&2, M.Plan>:
  match step:
    case C.Completed{_}: completed(step, [])
    case C.AwaitGo{request}:
      completed(C.resume(step, C.GoInspected{request, valid}), [M.InspectGo{}])
    case _: None{}

def go(bound: Bool, valid: Bool) -> Maybe<&2, M.Plan>:
  inspected(C.go(bound), valid)

def passthrough(bound: Bool) -> Maybe<&2, M.Plan>:
  completed(C.passthrough(bound), [])

def main() -> Unit:
  Unit{}
