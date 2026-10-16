import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Execution.bend as E
import ./Specification.bend as S
import ./ProtocolReference.bend as P
import ./LAWS.bend as Laws
import ../graph-resolution/RuntimeNatProof.bend as N
import ../graph-resolution/traversal/GRAPH_LIST_FACTS.bend as L

# Temporary migration proofs: delete at whole Preparation acceptance under the
# owner-approved cleanup condition in LAWS.bend.
# ---- shared protocol equations ----
def queue_same(+operations: List<&2, M.Operation>, +next: C.Phase, +request: Nat) ->
  {C.queue(operations, next, request) == P.queued(operations, next, request) : C.Step}:
  match operations:
    case []: {==}
    case _ <> _: {==}

def ack_same(+same: Bool, +remaining: List<&2, M.Operation>, +next: C.Phase, +request: Nat) ->
  {
    C.accepted_ack(same, remaining, next, request)
    == P.ack(same, remaining, next, request)
    : C.Step
  }:
  match same:
    case False{}: {==}
    case True{}: queue_same(remaining, next, Nat.add(request, 1n))

def completed_same(+empty: Bool, +count: Nat, +imports: Bool) ->
  {C.completed(empty, count, imports) == P.completed(empty, count, imports) : C.Step}:
  match empty:
    case False{}: {==}
    case True{}: {==}

def root_same(+present: Bool, +count: Nat, +empty: Bool, +request: Nat) ->
  {
    C.root_imports(present, count, empty, Nat.add(request, 1n))
    == P.root(present, count, empty, request)
    : C.Step
  }:
  match present:
    case False{}: {==}
    case True{}: completed_same(empty, count, True{})

def root_reply_same(+same: Bool, +count: Nat, +empty: Bool, +present: Bool, +request: Nat) ->
  {
    C.accepted_root_imports(same, count, empty, present, request)
    == P.root_reply(same, count, empty, present, request)
    : C.Step
  }:
  match same:
    case False{}: {==}
    case True{}: root_same(present, count, empty, request)

def sites_reply_same(
  +same: Bool,
  +slot: Nat,
  +functions: Nat,
  +count: Nat,
  +sites: Nat,
  +request: Nat
) ->
  {
    C.accepted_sites(same, slot, functions, count, sites, request)
    == P.sites_reply(same, slot, functions, count, sites, request)
    : C.Step
  }:
  match same:
    case False{}: {==}
    case True{}: {==}

def type_reply_same(+same: Bool, +count: Nat, +empty: Bool, +present: Bool) ->
  {
    C.accepted_type_imports(same, count, empty, present)
    == P.type_reply(same, count, empty, present)
    : C.Step
  }:
  match same:
    case False{}: {==}
    case True{}: completed_same(empty, count, present)

def inspected_same(+valid: Bool) ->
  {C.inspected_go(valid) == P.inspected(valid) : C.Step}:
  match valid:
    case False{}: {==}
    case True{}: {==}

def go_reply_same(+same: Bool, +valid: Bool) ->
  {C.accepted_go(same, valid) == P.go_reply(same, valid) : C.Step}:
  match same:
    case False{}: {==}
    case True{}: inspected_same(valid)

def resume_same(+step: C.Step, +reply: C.Reply) ->
  {C.resume(step, reply) == P.resume(step, reply) : C.Step}:
  match step reply:
    case C.Advance{_, _} C.Ack{_}: {==}
    case C.Advance{_, _} C.SitesObserved{_, _}: {==}
    case C.Advance{_, _} C.ImportsObserved{_, _}: {==}
    case C.Advance{_, _} C.GoInspected{_, _}: {==}
    case C.Engine{_, +request, remaining, next} C.Ack{actual}: ack_same(
      Nat.is_eq(request, actual),
      remaining,
      next,
      request
    )
    case C.Engine{_, _, _, _} C.SitesObserved{_, _}: {==}
    case C.Engine{_, _, _, _} C.ImportsObserved{_, _}: {==}
    case C.Engine{_, _, _, _} C.GoInspected{_, _}: {==}
    case C.AwaitSites{_, _, _, _} C.Ack{_}: {==}
    case C.AwaitSites{slot, functions, count, +request} C.SitesObserved{actual, sites}: sites_reply_same(
      Nat.is_eq(request, actual),
      slot,
      functions,
      count,
      sites,
      request
    )
    case C.AwaitSites{_, _, _, _} C.ImportsObserved{_, _}: {==}
    case C.AwaitSites{_, _, _, _} C.GoInspected{_, _}: {==}
    case C.AwaitRootImports{_, _, _} C.Ack{_}: {==}
    case C.AwaitRootImports{_, _, _} C.SitesObserved{_, _}: {==}
    case C.AwaitRootImports{count, empty, +request} C.ImportsObserved{actual, present}: root_reply_same(
      Nat.is_eq(request, actual),
      count,
      empty,
      present,
      request
    )
    case C.AwaitRootImports{_, _, _} C.GoInspected{_, _}: {==}
    case C.AwaitTypeImports{_, _, _} C.Ack{_}: {==}
    case C.AwaitTypeImports{_, _, _} C.SitesObserved{_, _}: {==}
    case C.AwaitTypeImports{count, empty, request} C.ImportsObserved{actual, present}: type_reply_same(
      Nat.is_eq(request, actual),
      count,
      empty,
      present
    )
    case C.AwaitTypeImports{_, _, _} C.GoInspected{_, _}: {==}
    case C.AwaitGo{_} C.Ack{_}: {==}
    case C.AwaitGo{_} C.SitesObserved{_, _}: {==}
    case C.AwaitGo{_} C.ImportsObserved{_, _}: {==}
    case C.AwaitGo{request} C.GoInspected{actual, valid}: go_reply_same(
      Nat.is_eq(request, actual),
      valid
    )
    case C.Completed{_} C.Ack{_}: {==}
    case C.Completed{_} C.SitesObserved{_, _}: {==}
    case C.Completed{_} C.ImportsObserved{_, _}: {==}
    case C.Completed{_} C.GoInspected{_, _}: {==}
    case C.InvalidReply{} C.Ack{_}: {==}
    case C.InvalidReply{} C.SitesObserved{_, _}: {==}
    case C.InvalidReply{} C.ImportsObserved{_, _}: {==}
    case C.InvalidReply{} C.GoInspected{_, _}: {==}

def function_phase_same(+remaining: Nat, +slot: Nat, +count: Nat, +request: Nat) ->
  {
    C.functions(slot, remaining, count, request)
    == P.function_phase(remaining, slot, count, request)
    : C.Step
  }:
  match remaining:
    case 0n: {==}
    case 1n++_: {==}

def site_phase_same(
  +remaining: Nat,
  +slot: Nat,
  +site: Nat,
  +functions: Nat,
  +count: Nat,
  +request: Nat
) ->
  {
    C.sites(slot, site, remaining, functions, count, request)
    == P.site_phase(remaining, slot, site, functions, count, request)
    : C.Step
  }:
  match remaining:
    case 0n: {==}
    case 1n++_: {==}

def phase_same(+phase: C.Phase, +request: Nat) ->
  {C.phase(phase, request) == P.phase(phase, request) : C.Step}:
  match phase:
    case C.Functions{slot, remaining, count}: function_phase_same(remaining, slot, count, request)
    case C.FunctionSites{_, _, _}: {==}
    case C.Sites{slot, site, remaining, functions, count}: site_phase_same(
      remaining,
      slot,
      site,
      functions,
      count,
      request
    )
    case C.Finish{_}: {==}
    case C.Imports{_, _}: {==}

def advance_same(+step: C.Step) ->
  {C.advance(step) == P.advance(step) : C.Step}:
  match step:
    case C.Advance{next, request}: phase_same(next, request)
    case C.Engine{_, _, _, _}: {==}
    case C.AwaitSites{_, _, _, _}: {==}
    case C.AwaitRootImports{_, _, _}: {==}
    case C.AwaitTypeImports{_, _, _}: {==}
    case C.AwaitGo{_}: {==}
    case C.Completed{_}: {==}
    case C.InvalidReply{}: {==}

# ---- scalar_protocol_exact ----
def Laws.scalar_protocol_exact(step, reply):
  (resume_same(step, reply), advance_same(step))

# ---- shared grouped queue refinement ----
def drain_same(+remaining: List<&2, M.Operation>, +next: C.Phase, +request: Nat) ->
  {
    C.Advance{next, C.group_request(remaining, request)}
    == P.drained(remaining, next, Nat.add(request, 1n))
    : C.Step
  }:
  match remaining:
    case []: {==}
    case _ <> tail: drain_same(tail, next, Nat.add(request, 1n))

def grouped_same(+same: Bool, +remaining: List<&2, M.Operation>, +next: C.Phase, +request: Nat) ->
  {
    C.acknowledge_group(same, remaining, next, request)
    == P.grouped(same, remaining, next, request)
    : C.Step
  }:
  match same:
    case False{}: {==}
    case True{}: drain_same(remaining, next, request)

# ---- resume_group_exact ----
def Laws.resume_group_exact(step, reply):
  match step reply:
    case C.Advance{_, _} C.Ack{_}: {==}
    case C.Advance{_, _} C.SitesObserved{_, _}: {==}
    case C.Advance{_, _} C.ImportsObserved{_, _}: {==}
    case C.Advance{_, _} C.GoInspected{_, _}: {==}
    case C.Engine{_, +request, remaining, next} C.Ack{actual}: grouped_same(
      Nat.is_eq(request, actual),
      remaining,
      next,
      request
    )
    case C.Engine{_, _, _, _} C.SitesObserved{_, _}: {==}
    case C.Engine{_, _, _, _} C.ImportsObserved{_, _}: {==}
    case C.Engine{_, _, _, _} C.GoInspected{_, _}: {==}
    case C.AwaitSites{_, _, _, _} C.Ack{_}: {==}
    case C.AwaitSites{_, _, _, _} C.SitesObserved{_, _}: {==}
    case C.AwaitSites{_, _, _, _} C.ImportsObserved{_, _}: {==}
    case C.AwaitSites{_, _, _, _} C.GoInspected{_, _}: {==}
    case C.AwaitRootImports{_, _, _} C.Ack{_}: {==}
    case C.AwaitRootImports{_, _, _} C.SitesObserved{_, _}: {==}
    case C.AwaitRootImports{_, _, _} C.ImportsObserved{_, _}: {==}
    case C.AwaitRootImports{_, _, _} C.GoInspected{_, _}: {==}
    case C.AwaitTypeImports{_, _, _} C.Ack{_}: {==}
    case C.AwaitTypeImports{_, _, _} C.SitesObserved{_, _}: {==}
    case C.AwaitTypeImports{_, _, _} C.ImportsObserved{_, _}: {==}
    case C.AwaitTypeImports{_, _, _} C.GoInspected{_, _}: {==}
    case C.AwaitGo{_} C.Ack{_}: {==}
    case C.AwaitGo{_} C.SitesObserved{_, _}: {==}
    case C.AwaitGo{_} C.ImportsObserved{_, _}: {==}
    case C.AwaitGo{_} C.GoInspected{_, _}: {==}
    case C.Completed{_} C.Ack{_}: {==}
    case C.Completed{_} C.SitesObserved{_, _}: {==}
    case C.Completed{_} C.ImportsObserved{_, _}: {==}
    case C.Completed{_} C.GoInspected{_, _}: {==}
    case C.InvalidReply{} C.Ack{_}: {==}
    case C.InvalidReply{} C.SitesObserved{_, _}: {==}
    case C.InvalidReply{} C.ImportsObserved{_, _}: {==}
    case C.InvalidReply{} C.GoInspected{_, _}: {==}

# ---- go_exact ----
def Laws.go_exact(bound, valid):
  match bound valid:
    case False{} False{}: {==}
    case False{} True{}: {==}
    case True{} _: {==}

# ---- passthrough_exact ----
def Laws.passthrough_exact(bound):
  match bound:
    case False{}: {==}
    case True{}: {==}

# ---- shared whole-trace completion ----
def plan(empty: Bool, count: Nat, imports: Bool, operations: List<&2, M.Operation>) -> M.Plan:
  match empty:
    case False{}: M.Plan{M.Measured{count, imports}, operations}
    case True{}: M.Plan{M.MeasuredEmpty{imports}, operations}

def group_exact(-next: C.Step -> List<&2, M.Operation> -> Maybe<&2, M.Plan>,
  +operation: M.Operation, +remaining: List<&2, M.Operation>,
  +phase: C.Phase, +request: Nat, +operations: List<&2, M.Operation>) -> {
  E.group(C.Engine{operation, request, remaining, phase}, operations, next)
  == next(C.phase(phase, C.group_request(remaining, request)))(
    List.append(&2, M.Operation, operations, operation <> remaining)
  )
  : Maybe<&2, M.Plan>
}:
  %Equal.sym(Bool, Nat.is_eq(request, request), True{}, N.is_eq_refl(request)) : {
    E.advance(
      C.acknowledge_group(_, remaining, phase, request),
      List.append(&2, M.Operation, operations, operation <> remaining),
      next
    )
    == next(
      C.phase(phase, C.group_request(remaining, request))
    )(List.append(&2, M.Operation, operations, operation <> remaining))
    : Maybe<&2, M.Plan>
  }
  {==}

def observation_exact(-next: C.Step -> List<&2, M.Operation> -> Maybe<&2, M.Plan>,
  +slot: Nat, +functions: Nat, +count: Nat, +request: Nat,
  +sites: Nat, +operations: List<&2, M.Operation>) -> {
  E.observation(C.AwaitSites{slot, functions, count, request}, sites, operations, next)
  == E.sites(sites, C.sites(slot, 0n, sites, functions, count, Nat.add(request, 1n)),
    List.append(&2, M.Operation, operations, [M.ObserveSites{slot}]), next)
  : Maybe<&2, M.Plan>
}:
  %Equal.sym(Bool, Nat.is_eq(request, request), True{}, N.is_eq_refl(request)) : {
    E.advance(C.accepted_sites(_, slot, functions, count, sites, request),
      List.append(&2, M.Operation, operations, [M.ObserveSites{slot}]),
      following => trace => E.sites(sites, following, trace, next))
    == E.sites(sites, C.sites(slot, 0n, sites, functions, count, Nat.add(request, 1n)),
      List.append(&2, M.Operation, operations, [M.ObserveSites{slot}]), next)
    : Maybe<&2, M.Plan>}
  {==}

def imports_exact(+root: Bool, +empty: Bool, +count: Nat, +type_imports: Bool,
  +request: Nat, +operations: List<&2, M.Operation>) -> {
  E.imports(C.AwaitRootImports{count, empty, request}, root, type_imports, operations)
  == Some{plan(empty, count, Bool.or(root, type_imports),
    List.append(&2, M.Operation, operations, S.imports_operations(root)))}
  : Maybe<&2, M.Plan>
}:
  match root empty:
    case False{} False{}:
      %Equal.sym(Bool, Nat.is_eq(request, request), True{}, N.is_eq_refl(request)) : {
        E.after_root(C.accepted_root_imports(_, count, False{}, False{}, request), type_imports,
          List.append(&2, M.Operation, operations, [M.ObserveRootImports{}]))
        == Some{plan(False{}, count, Bool.or(False{}, type_imports),
          List.append(&2, M.Operation, operations, S.imports_operations(False{})))}
        : Maybe<&2, M.Plan>}
      %Equal.sym(
        Bool,
        Nat.is_eq(Nat.add(request, 1n), Nat.add(request, 1n)),
        True{},
        N.is_eq_refl(Nat.add(request, 1n))
      ) : {
        E.completed(
          C.accepted_type_imports(_, count, False{}, type_imports),
          List.append(
            &2,
            M.Operation,
            List.append(&2, M.Operation, operations, [M.ObserveRootImports{}]),
            [M.ReadTypeImports{}]
          )
        )
        == Some{
          plan(
            False{},
            count,
            type_imports,
            List.append(&2, M.Operation, operations, [M.ObserveRootImports{}, M.ReadTypeImports{}])
          )
        }
        : Maybe<&2, M.Plan>
      }
      %L.append_assoc(
        &2,
        M.Operation,
        operations,
        [M.ObserveRootImports{}],
        [M.ReadTypeImports{}]
      ) : {
        E.completed(
          C.completed(False{}, count, type_imports),
          List.append(
            &2,
            M.Operation,
            List.append(&2, M.Operation, operations, [M.ObserveRootImports{}]),
            [M.ReadTypeImports{}]
          )
        )
        == Some{plan(False{}, count, type_imports, _)}
        : Maybe<&2, M.Plan>
      }
      {==}
    case False{} True{}:
      %Equal.sym(Bool, Nat.is_eq(request, request), True{}, N.is_eq_refl(request)) : {
        E.after_root(C.accepted_root_imports(_, count, True{}, False{}, request), type_imports,
          List.append(&2, M.Operation, operations, [M.ObserveRootImports{}]))
        == Some{plan(True{}, count, Bool.or(False{}, type_imports),
          List.append(&2, M.Operation, operations, S.imports_operations(False{})))}
        : Maybe<&2, M.Plan>}
      %Equal.sym(
        Bool,
        Nat.is_eq(Nat.add(request, 1n), Nat.add(request, 1n)),
        True{},
        N.is_eq_refl(Nat.add(request, 1n))
      ) : {
        E.completed(
          C.accepted_type_imports(_, count, True{}, type_imports),
          List.append(
            &2,
            M.Operation,
            List.append(&2, M.Operation, operations, [M.ObserveRootImports{}]),
            [M.ReadTypeImports{}]
          )
        )
        == Some{
          plan(
            True{},
            count,
            type_imports,
            List.append(&2, M.Operation, operations, [M.ObserveRootImports{}, M.ReadTypeImports{}])
          )
        }
        : Maybe<&2, M.Plan>
      }
      %L.append_assoc(
        &2,
        M.Operation,
        operations,
        [M.ObserveRootImports{}],
        [M.ReadTypeImports{}]
      ) : {
        E.completed(
          C.completed(True{}, count, type_imports),
          List.append(
            &2,
            M.Operation,
            List.append(&2, M.Operation, operations, [M.ObserveRootImports{}]),
            [M.ReadTypeImports{}]
          )
        )
        == Some{plan(True{}, count, type_imports, _)}
        : Maybe<&2, M.Plan>
      }
      {==}
    case True{} False{}:
      %Equal.sym(Bool, Nat.is_eq(request, request), True{}, N.is_eq_refl(request)) : {
        E.after_root(C.accepted_root_imports(_, count, False{}, True{}, request), type_imports,
          List.append(&2, M.Operation, operations, [M.ObserveRootImports{}]))
        == Some{plan(False{}, count, Bool.or(True{}, type_imports),
          List.append(&2, M.Operation, operations, S.imports_operations(True{})))}
        : Maybe<&2, M.Plan>}
      {==}
    case True{} True{}:
      %Equal.sym(Bool, Nat.is_eq(request, request), True{}, N.is_eq_refl(request)) : {
        E.after_root(C.accepted_root_imports(_, count, True{}, True{}, request), type_imports,
          List.append(&2, M.Operation, operations, [M.ObserveRootImports{}]))
        == Some{plan(True{}, count, Bool.or(True{}, type_imports),
          List.append(&2, M.Operation, operations, S.imports_operations(True{})))}
        : Maybe<&2, M.Plan>}
      {==}

# Compose existing append associativity for the actual nested trace prefixes.
def append_trace(+prefix: List<&2, M.Operation>, +left: List<&2, M.Operation>,
  +middle: List<&2, M.Operation>, +right: List<&2, M.Operation>) -> {
  List.append(
    &2,
    M.Operation,
    List.append(&2, M.Operation, prefix, left),
    List.append(&2, M.Operation, middle, right)
  )
  == List.append(
    &2,
    M.Operation,
    prefix,
    List.append(&2, M.Operation, List.append(&2, M.Operation, left, middle), right)
  )
  : List<&2, M.Operation>
}:
  Equal.trans(
    List<&2, M.Operation>,
    List.append(
      &2,
      M.Operation,
      List.append(&2, M.Operation, prefix, left),
      List.append(&2, M.Operation, middle, right)
    ),
    List.append(
      &2,
      M.Operation,
      prefix,
      List.append(&2, M.Operation, left, List.append(&2, M.Operation, middle, right))
    ),
    List.append(
      &2,
      M.Operation,
      prefix,
      List.append(&2, M.Operation, List.append(&2, M.Operation, left, middle), right)
    ),
    L.append_assoc(&2, M.Operation, prefix, left, List.append(&2, M.Operation, middle, right)),
    Equal.cong(
      List<&2, M.Operation>,
      List<&2, M.Operation>,
      items => List.append(&2, M.Operation, prefix, items),
      List.append(&2, M.Operation, left, List.append(&2, M.Operation, middle, right)),
      List.append(&2, M.Operation, List.append(&2, M.Operation, left, middle), right),
      Equal.sym(List<&2, M.Operation>,
        List.append(&2, M.Operation, List.append(&2, M.Operation, left, middle), right),
        List.append(&2, M.Operation, left, List.append(&2, M.Operation, middle, right)),
        L.append_assoc(&2, M.Operation, left, middle, right))
    )
  )

def sites_trace(
  -next: C.Step -> List<&2, M.Operation> -> Maybe<&2, M.Plan>,
  -finish: List<&2, M.Operation> -> Maybe<&2, M.Plan>,
  +remaining: Nat,
  +slot: Nat,
  +site: Nat,
  +functions: Nat,
  +count: Nat,
  +request: Nat,
  +operations: List<&2, M.Operation>,
  done: @+q: Nat -> @+trace: List<&2, M.Operation> -> {
    next(C.functions(Nat.add(slot, 1n), functions, count, q))(trace)
    == finish(trace)
    : Maybe<&2, M.Plan>
  }
) -> {
  E.sites(remaining, C.sites(slot, site, remaining, functions, count, request), operations, next)
  == finish(List.append(&2, M.Operation, operations,
    List.append(&2, M.Operation, S.sites_operations(remaining, slot, site), [M.Add{}])))
  : Maybe<&2, M.Plan>
}:
  match remaining:
    case 0n:
      Equal.trans(
        Maybe<&2, M.Plan>,
        E.sites(0n, C.sites(slot, site, 0n, functions, count, request), operations, next),
        next(
          C.functions(Nat.add(slot, 1n), functions, count, Nat.add(request, 1n))
        )(List.append(&2, M.Operation, operations, [M.Add{}])),
        finish(List.append(&2, M.Operation, operations, [M.Add{}])),
        group_exact(
          next,
          M.Add{},
          [],
          C.Functions{Nat.add(slot, 1n), functions, count},
          request,
          operations
        ),
        done(Nat.add(request, 1n), List.append(&2, M.Operation, operations, [M.Add{}]))
      )
    case 1n++tail:
      %append_trace(
        operations,
        S.site_operations(slot, site),
        S.sites_operations(tail, slot, Nat.add(site, 1n)),
        [M.Add{}]
      ) : {
        E.sites(1n+tail, C.sites(slot, site, 1n+tail, functions, count, request), operations, next)
        == finish(_) : Maybe<&2, M.Plan>}
      Equal.trans(
        Maybe<&2, M.Plan>,
        E.sites(1n+tail, C.sites(slot, site, 1n+tail, functions, count, request), operations, next),
        E.sites(tail, C.sites(slot, Nat.add(site, 1n), tail, functions, count,
          C.group_request(List.tail(&2, M.Operation, C.site_operations(slot, site)), request)),
          List.append(&2, M.Operation, operations, C.site_operations(slot, site)), next),
        finish(
          List.append(
            &2,
            M.Operation,
            List.append(&2, M.Operation, operations, S.site_operations(slot, site)),
            List.append(&2, M.Operation, S.sites_operations(tail, slot, Nat.add(site, 1n)), [M.Add{}])
          )
        ),
        group_exact(following => trace => E.sites(tail, following, trace, next),
          M.Push{4n}, List.tail(&2, M.Operation, C.site_operations(slot, site)),
          C.Sites{slot, Nat.add(site, 1n), tail, functions, count}, request, operations),
        sites_trace(next, finish, tail, slot, Nat.add(site, 1n), functions, count,
          C.group_request(List.tail(&2, M.Operation, C.site_operations(slot, site)), request),
          List.append(&2, M.Operation, operations, C.site_operations(slot, site)), done)
      )

def measurement_trace(+count: Nat, +request: Nat, +operations: List<&2, M.Operation>,
  +root: Bool, +type_imports: Bool) -> {
  E.measurement(
    C.queue([M.ReadTypeBytes{}, M.Swap{}, M.Add{}], C.Imports{count, False{}}, request),
    root,
    type_imports,
    operations
  )
  == Some{
    plan(
      False{},
      count,
      Bool.or(root, type_imports),
      List.append(
        &2,
        M.Operation,
        operations,
        List.append(
          &2,
          M.Operation,
          [M.ReadTypeBytes{}, M.Swap{}, M.Add{}],
          S.imports_operations(root)
        )
      )
    )
  }
  : Maybe<&2, M.Plan>
}:
  %L.append_assoc(
    &2,
    M.Operation,
    operations,
    [M.ReadTypeBytes{}, M.Swap{}, M.Add{}],
    S.imports_operations(root)
  ) : {
    E.measurement(
      C.queue([M.ReadTypeBytes{}, M.Swap{}, M.Add{}], C.Imports{count, False{}}, request),
      root,
      type_imports,
      operations
    )
    == Some{plan(False{}, count, Bool.or(root, type_imports), _)}
    : Maybe<&2, M.Plan>
  }
  Equal.trans(
    Maybe<&2, M.Plan>,
    E.measurement(
      C.queue([M.ReadTypeBytes{}, M.Swap{}, M.Add{}], C.Imports{count, False{}}, request),
      root,
      type_imports,
      operations
    ),
    E.imports(
      C.AwaitRootImports{count, False{}, C.group_request([M.Swap{}, M.Add{}], request)},
      root,
      type_imports,
      List.append(&2, M.Operation, operations, [M.ReadTypeBytes{}, M.Swap{}, M.Add{}])
    ),
    Some{
      plan(
        False{},
        count,
        Bool.or(root, type_imports),
        List.append(
          &2,
          M.Operation,
          List.append(&2, M.Operation, operations, [M.ReadTypeBytes{}, M.Swap{}, M.Add{}]),
          S.imports_operations(root)
        )
      )
    },
    group_exact(following => trace => E.imports(following, root, type_imports, trace),
      M.ReadTypeBytes{}, [M.Swap{}, M.Add{}], C.Imports{count, False{}}, request, operations),
    imports_exact(root, False{}, count, type_imports, C.group_request([M.Swap{}, M.Add{}], request),
      List.append(&2, M.Operation, operations, [M.ReadTypeBytes{}, M.Swap{}, M.Add{}]))
  )

def function_enter(-next: C.Step -> List<&2, M.Operation> -> Maybe<&2, M.Plan>,
  +slot: Nat, +functions: Nat, +count: Nat, +request: Nat, +site_count: Nat,
  +operations: List<&2, M.Operation>) -> {
    E.group(
      C.queue(
        [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}],
        C.FunctionSites{slot, functions, count},
        request
      ),
      operations,
      following => trace => E.observation(following, site_count, trace, next)
    )
    == E.sites(
      site_count,
      C.sites(slot, 0n, site_count, functions, count,
          Nat.add(C.group_request([M.Push{1024n}, M.Add{}], request), 1n)),
      List.append(
        &2,
        M.Operation,
        operations,
        [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}, M.ObserveSites{slot}]
      ),
      next
    )
    : Maybe<&2, M.Plan>
  }:
  %L.append_assoc(
    &2,
    M.Operation,
    operations,
    [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}],
    [M.ObserveSites{slot}]
  ) : {
    E.group(
      C.queue(
        [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}],
        C.FunctionSites{slot, functions, count},
        request
      ),
      operations,
      following => trace => E.observation(following, site_count, trace, next)
    )
    == E.sites(site_count, C.sites(slot, 0n, site_count, functions, count,
      Nat.add(C.group_request([M.Push{1024n}, M.Add{}], request), 1n)), _, next)
    : Maybe<&2, M.Plan>
  }
  Equal.trans(
    Maybe<&2, M.Plan>,
    E.group(
      C.queue(
        [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}],
        C.FunctionSites{slot, functions, count},
        request
      ),
      operations,
      following => trace => E.observation(following, site_count, trace, next)
    ),
    E.observation(
      C.AwaitSites{slot, functions, count, C.group_request([M.Push{1024n}, M.Add{}], request)},
      site_count,
      List.append(&2, M.Operation, operations, [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}]),
      next
    ),
    E.sites(
      site_count,
      C.sites(slot, 0n, site_count, functions, count,
        Nat.add(C.group_request([M.Push{1024n}, M.Add{}], request), 1n)),
      List.append(
        &2,
        M.Operation,
        List.append(&2, M.Operation, operations, [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}]),
        [M.ObserveSites{slot}]
      ),
      next
    ),
    group_exact(
      following => trace => E.observation(following, site_count, trace, next),
      M.MeasureArtifact{slot},
      [M.Push{1024n}, M.Add{}],
      C.FunctionSites{slot, functions, count},
      request,
      operations
    ),
    observation_exact(next, slot, functions, count, C.group_request([M.Push{1024n}, M.Add{}], request), site_count,
      List.append(&2, M.Operation, operations, [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}]))
  )

def functions_trace(+counts: List<&2, Nat>, +slot: Nat, +count: Nat, +request: Nat,
  +operations: List<&2, M.Operation>, +root: Bool, +type_imports: Bool) -> {
  E.functions(
    counts,
    C.functions(slot, List.length(&2, Nat, counts), count, request),
    root,
    type_imports,
    operations
  )
  == Some{
    plan(
      False{},
      count,
      Bool.or(root, type_imports),
      List.append(
        &2,
        M.Operation,
        operations,
        List.append(
          &2,
          M.Operation,
          S.functions_operations(counts, slot),
          List.append(
            &2,
            M.Operation,
            [M.ReadTypeBytes{}, M.Swap{}, M.Add{}],
            S.imports_operations(root)
          )
        )
      )
    )
  }
  : Maybe<&2, M.Plan>
}:
  match counts:
    case []: measurement_trace(count, request, operations, root, type_imports)
    case +head <> +tail:
      %append_trace(
        operations,
        S.function_operations(slot, head),
        S.functions_operations(tail, Nat.add(slot, 1n)),
        List.append(
          &2,
          M.Operation,
          [M.ReadTypeBytes{}, M.Swap{}, M.Add{}],
          S.imports_operations(root)
        )
      ) : {
          E.functions(
            head <> tail,
            C.functions(slot, List.length(&2, Nat, head <> tail), count, request),
            root,
            type_imports,
            operations
          )
          == Some{plan(False{}, count, Bool.or(root, type_imports), _)}
          : Maybe<&2, M.Plan>
        }
      %L.append_assoc(&2, M.Operation, operations,
        [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}, M.ObserveSites{slot}],
        List.append(&2, M.Operation, S.sites_operations(head, slot, 0n), [M.Add{}])) : {
          E.functions(
            head <> tail,
            C.functions(slot, List.length(&2, Nat, head <> tail), count, request),
            root,
            type_imports,
            operations
          )
          == Some{
            plan(
              False{},
              count,
              Bool.or(root, type_imports),
              List.append(
                &2,
                M.Operation,
                _,
                List.append(
                  &2,
                  M.Operation,
                  S.functions_operations(tail, Nat.add(slot, 1n)),
                  List.append(
                    &2,
                    M.Operation,
                    [M.ReadTypeBytes{}, M.Swap{}, M.Add{}],
                    S.imports_operations(root)
                  )
                )
              )
            )
          }
          : Maybe<&2, M.Plan>
        }
      Equal.trans(
        Maybe<&2, M.Plan>,
        E.functions(
          head <> tail,
          C.functions(slot, List.length(&2, Nat, head <> tail), count, request),
          root,
          type_imports,
          operations
        ),
        E.sites(
          head,
          C.sites(slot, 0n, head, List.length(&2, Nat, tail), count,
              Nat.add(C.group_request([M.Push{1024n}, M.Add{}], request), 1n)),
          List.append(
            &2,
            M.Operation,
            operations,
            [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}, M.ObserveSites{slot}]
          ),
          following => trace => E.functions(tail, following, root, type_imports, trace)
        ),
        Some{
          plan(
            False{},
            count,
            Bool.or(root, type_imports),
            List.append(
              &2,
              M.Operation,
              List.append(
                &2,
                M.Operation,
                List.append(
                  &2,
                  M.Operation,
                  operations,
                  [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}, M.ObserveSites{slot}]
                ),
                List.append(&2, M.Operation, S.sites_operations(head, slot, 0n), [M.Add{}])
              ),
              List.append(
                &2,
                M.Operation,
                S.functions_operations(tail, Nat.add(slot, 1n)),
                List.append(
                  &2,
                  M.Operation,
                  [M.ReadTypeBytes{}, M.Swap{}, M.Add{}],
                  S.imports_operations(root)
                )
              )
            )
          )
        },
        function_enter(following => trace => E.functions(tail, following, root, type_imports, trace),
          slot, List.length(&2, Nat, tail), count, request, head, operations),
        sites_trace(
          following => trace => E.functions(tail, following, root, type_imports, trace),
          prefix => Some{
            plan(
              False{},
              count,
              Bool.or(root, type_imports),
              List.append(
                &2,
                M.Operation,
                prefix,
                List.append(
                  &2,
                  M.Operation,
                  S.functions_operations(tail, Nat.add(slot, 1n)),
                  List.append(
                    &2,
                    M.Operation,
                    [M.ReadTypeBytes{}, M.Swap{}, M.Add{}],
                    S.imports_operations(root)
                  )
                )
              )
            )
          },
          head,
          slot,
          0n,
          List.length(&2, Nat, tail),
          count,
          Nat.add(C.group_request([M.Push{1024n}, M.Add{}], request), 1n),
          List.append(
            &2,
            M.Operation,
            operations,
            [M.MeasureArtifact{slot}, M.Push{1024n}, M.Add{}, M.ObserveSites{slot}]
          ),
          q => trace => functions_trace(tail, Nat.add(slot, 1n), count, q, trace, root, type_imports)
        )
      )

def measured_trace(+count: Nat, +counts: List<&2, Nat>, +root: Bool, +type_imports: Bool) -> {
  E.started(C.nonempty(True{}, count, List.length(&2, Nat, counts)), counts, root, type_imports)
  == Some{
    M.Plan{M.Measured{count, Bool.or(root, type_imports)}, S.measured_operations(counts, root)}
  }
  : Maybe<&2, M.Plan>
}:
  Equal.trans(
    Maybe<&2, M.Plan>,
    E.started(C.nonempty(True{}, count, List.length(&2, Nat, counts)), counts, root, type_imports),
    E.functions(
      counts,
      C.functions(0n, List.length(&2, Nat, counts), count, 1n),
      root,
      type_imports,
      [M.Push{0n}]
    ),
    Some{M.Plan{M.Measured{count, Bool.or(root, type_imports)}, S.measured_operations(counts, root)}},
    group_exact(following => trace => E.functions(counts, following, root, type_imports, trace),
      M.Push{0n}, [], C.Functions{0n, List.length(&2, Nat, counts), count}, 0n, []),
    functions_trace(counts, 0n, count, 1n, [M.Push{0n}], root, type_imports)
  )

def bound_trace(
  +no_types: Bool,
  +bound: Bool,
  +count: Nat,
  +counts: List<&2, Nat>,
  +root: Bool,
  +type_imports: Bool
) -> {
  E.started(
    C.nonempty(Bool.or(no_types, bound), count, List.length(&2, Nat, counts)),
    counts,
    root,
    type_imports
  )
  == Some{
    S.nonempty_admission(
      Bool.and(Bool.not(no_types), Bool.not(bound)),
      count,
      counts,
      Bool.or(root, type_imports),
      root
    )
  }
  : Maybe<&2, M.Plan>
}:
  match no_types bound:
    case True{} _: measured_trace(count, counts, root, type_imports)
    case False{} True{}: measured_trace(count, counts, root, type_imports)
    case False{} False{}: {==}

def admitted_trace(
  +count: Nat,
  +types: Nat,
  +counts: List<&2, Nat>,
  +bound: Bool,
  +root: Bool,
  +type_imports: Bool
) -> {
  E.started(
    C.admitted(count, types, List.length(&2, Nat, counts), bound),
    counts,
    root,
    type_imports
  )
  == Some{S.admitted(count, types, counts, bound, Bool.or(root, type_imports), root)}
  : Maybe<&2, M.Plan>
}:
  match count:
    case 0n: imports_exact(root, True{}, 0n, type_imports, 0n, [])
    case 1n++tail: bound_trace(Nat.is_eq(types, 0n), bound, 1n+tail, counts, root, type_imports)

def guarded_trace(
  +valid: Bool,
  +count: Nat,
  +types: Nat,
  +counts: List<&2, Nat>,
  +bound: Bool,
  +root: Bool,
  +type_imports: Bool
) -> {
  E.started(
    C.guarded(valid, count, types, List.length(&2, Nat, counts), bound),
    counts,
    root,
    type_imports
  )
  == Some{S.guarded(valid, count, types, counts, bound, Bool.or(root, type_imports), root)}
  : Maybe<&2, M.Plan>
}:
  match valid:
    case False{}: {==}
    case True{}: admitted_trace(count, types, counts, bound, root, type_imports)

# ---- typescript_exact ----
def Laws.typescript_exact(valid, types, sites, bound, root_imports, type_imports):
  guarded_trace(Bool.and(valid, Nat.is_le(Nat.add(types, List.length(&2, Nat, sites)), 1024n)),
    Nat.add(types, List.length(&2, Nat, sites)), types, sites, bound, root_imports, type_imports)

def main() -> Unit:
  Unit{}
