import Base
import ../../../vendor/bendlib/packages/bend-mathlib/nat.bend as N
import ../../../vendor/bendlib/packages/bend-mathlib/bool.bend as B
import ./CanonicalResolverOwner.bend as O
import ./EvaluationOwnerSpecification.bend as S
import ../Canonical.bend as C
import ../Dispatch.bend as D

# Supporting proofs for the approved complete evaluation_owner_exact contract.
# Preserve arbitrary states and child tails; native IO/shared primitives retain
# the boundaries stated in EVALUATION_OWNER_LAWS. Maintain with that API;
# transfer guarantees and delete obsolete proofs on replacement.

def context_exact(+left: O.EvaluationContext, +right: O.EvaluationContext) -> {
  O.evaluation_context_equal(left, right) == S.same_context(left, right) : Bool
}:
  match left right:
    case O.EvaluationContext{_, _, _, _} O.EvaluationContext{_, _, _, _}: {==}

def claimed_exact(+context: O.EvaluationContext, +rest: List<&2, O.Child>) -> {
  O.evaluation_claimed(context, rest) == S.claimed(context, rest) : Bool
}:
  match rest:
    case Nil{}: {==}
    case O.Child{O.EvaluationScope{_, other, _}, _, _, _, _, _, _, _} <> tail:
      %context_exact(context, other) : {
        Bool.or(O.evaluation_context_equal(context, other), O.evaluation_claimed(context, tail))
        == Bool.or(_, S.claimed(context, tail)) : Bool
      }
      %claimed_exact(context, tail) : {
        Bool.or(O.evaluation_context_equal(context, other), O.evaluation_claimed(context, tail))
        == Bool.or(O.evaluation_context_equal(context, other), _) : Bool
      }
      {==}
    case O.Child{O.EvaluationCleanupScope{_, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      context,
      tail
    )
    case O.Child{O.EvaluationDispatchScope{_, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      context,
      tail
    )
    case O.Child{O.DeliveryScope{_, _, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      context,
      tail
    )
    case O.Child{O.SettingsScope{_}, _, _, _, _, _, _, _} <> tail: claimed_exact(context, tail)
    case O.Child{O.FreshnessScope{_}, _, _, _, _, _, _, _} <> tail: claimed_exact(context, tail)
    case O.Child{O.Scope{_, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(context, tail)
    case O.Child{O.SourceScope{_, _, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      context,
      tail
    )
    case O.Child{O.AfterSourceScope{_, _, _, _, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      context,
      tail
    )
    case O.Child{O.PreparationScope{_, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      context,
      tail
    )
    case O.Child{O.RetainingScope{_, _, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      context,
      tail
    )
    case O.Child{O.AdviceTailScope{_, _, _, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      context,
      tail
    )

def free_exact(+id: Nat, +found: Maybe<&2, O.Child>) -> {
  O.settings_next_free(id, found) == S.free(id, found) : Bool
}:
  match id found:
    case 0n None{}: {==}
    case 0n Some{_}: {==}
    case 1n+_ None{}: {==}
    case 1n+_ Some{_}: {==}

def birth_exact(+valid: Bool, +state: O.State, +scope: O.Scope, +input: Nat) -> {
  O.launched(valid, state, scope, input)
  == S.birth(valid, state, scope, None{}, input, O.NotPreparing{}) : O.Step
}:
  match valid state:
    case False{} _: {==}
    case True{} O.State{_, _, _, _}: {==}

def round_exact(+context: O.EvaluationContext, +round: C.Round) -> {
  S.current_round(context, Some{round})
  == O.evaluation_reviewing(
    context,
    Some{C.Work{0n, 0n, 0n, 0n, 0n, C.Reviewing{}, 0n}},
    Some{round}
  )
  : Bool
}:
  match context round:
    case O.EvaluationContext{p, l, r, _} C.Round{q, m, t, _, _, _, _, _}:
      %N.is_eq_comm(p, q) : {
        Bool.and(Nat.is_eq(p, q), Bool.and(Nat.is_eq(l, m), Nat.is_eq(r, t)))
        == Bool.and(_, Bool.and(Nat.is_eq(m, l), Nat.is_eq(t, r))) : Bool
      }
      %N.is_eq_comm(l, m) : {
        Bool.and(Nat.is_eq(p, q), Bool.and(Nat.is_eq(l, m), Nat.is_eq(r, t)))
        == Bool.and(Nat.is_eq(p, q), Bool.and(_, Nat.is_eq(t, r))) : Bool
      }
      %N.is_eq_comm(r, t) : {
        Bool.and(Nat.is_eq(p, q), Bool.and(Nat.is_eq(l, m), Nat.is_eq(r, t)))
        == Bool.and(Nat.is_eq(p, q), Bool.and(Nat.is_eq(l, m), _)) : Bool
      }
      {==}

def reviewing_exact(+context: O.EvaluationContext, +found: Maybe<&2, C.Work>,
  +round: Maybe<&2, C.Round>) -> {
  O.evaluation_reviewing(context, found, round)
  == Bool.and(S.current_round(context, round), S.work_kind(True{}, found)) : Bool
}:
  match context found round:
    case O.EvaluationContext{_, _, _, _} None{} _: Equal.sym(Bool,
      Bool.and(S.current_round(context, round), False{}), False{},
      B.and_false(S.current_round(context, round)))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.Reviewing{}, _}} None{}: {==}
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.Reviewing{}, _}} Some{actual}:
      %Equal.sym(
        Bool,
        Bool.and(S.current_round(context, Some{actual}), True{}),
        S.current_round(context, Some{actual}),
        B.and_true(S.current_round(context, Some{actual}))
      ) : {
        O.evaluation_reviewing(context, found, Some{actual}) == _ : Bool
      }
      Equal.sym(Bool, S.current_round(context, Some{actual}),
        O.evaluation_reviewing(context, found, Some{actual}), round_exact(context, actual))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.AwaitingSourceRead{}, _}} _:
      Equal.sym(Bool, Bool.and(S.current_round(context, round), False{}), False{},
        B.and_false(S.current_round(context, round)))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.SourceReading{}, _}} _:
      Equal.sym(Bool, Bool.and(S.current_round(context, round), False{}), False{},
        B.and_false(S.current_round(context, round)))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.Preparing{}, _}} _:
      Equal.sym(Bool, Bool.and(S.current_round(context, round), False{}), False{},
        B.and_false(S.current_round(context, round)))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.AtJev{}, _}} _:
      Equal.sym(Bool, Bool.and(S.current_round(context, round), False{}), False{},
        B.and_false(S.current_round(context, round)))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.PendingFinding{_}, _}} _:
      Equal.sym(Bool, Bool.and(S.current_round(context, round), False{}), False{},
        B.and_false(S.current_round(context, round)))

def admissible_exact(+canon: C.State, +context: O.EvaluationContext) -> {
  O.evaluation_admissible(canon, context) == S.current_work(canon, context, True{}) : Bool
}:
  match canon context:
    case C.State{_, rounds, work, _, _, _, _, _, _} O.EvaluationContext{p, l, r, o}:
      reviewing_exact(context, C.find_work(p, l, r, o, work), C.find_round(p, rounds))

def launch_exact(+state: O.State, +context: O.EvaluationContext, +input: Nat) -> {
  O.launch_evaluation(state, context, input) == S.launch_evaluation(state, context, input) : O.Step
}:
  match state:
    case O.State{canon, next, _, rest}:
      %free_exact(next, O.find(next, rest)) : {
        O.launch_evaluation(state, context, input)
        == S.birth(
          Bool.and(
            _,
            Bool.and(S.current_work(canon, context, True{}), Bool.not(S.claimed(context, rest)))
          ),
          state,
          O.EvaluationScope{next, context, O.EvaluationUnissued{}},
          None{},
          input,
          O.NotPreparing{}
        )
        : O.Step
      }
      %admissible_exact(canon, context) : {
        O.launch_evaluation(state, context, input)
        == S.birth(
          Bool.and(
            O.settings_next_free(next, O.find(next, rest)),
            Bool.and(_, Bool.not(S.claimed(context, rest)))
          ),
          state,
          O.EvaluationScope{next, context, O.EvaluationUnissued{}},
          None{},
          input,
          O.NotPreparing{}
        )
        : O.Step
      }
      %claimed_exact(context, rest) : {
        O.launch_evaluation(state, context, input)
        == S.birth(
          Bool.and(
            O.settings_next_free(next, O.find(next, rest)),
            Bool.and(O.evaluation_admissible(canon, context), Bool.not(_))
          ),
          state,
          O.EvaluationScope{next, context, O.EvaluationUnissued{}},
          None{},
          input,
          O.NotPreparing{}
        )
        : O.Step
      }
      birth_exact(
        Bool.and(
          O.settings_next_free(next, O.find(next, rest)),
          Bool.and(
            O.evaluation_admissible(canon, context),
            Bool.not(O.evaluation_claimed(context, rest))
          )
        ),
        state,
        O.EvaluationScope{next, context, O.EvaluationUnissued{}},
        input
      )

def active_chain_exact(+operation: Nat, +inv: Nat, +generation: Nat, +actual: Nat,
  +current: Nat, +epoch: Nat, +phase: O.Phase) -> {
    Bool.and(
      Nat.is_eq(operation, inv),
      Bool.and(
        Nat.is_eq(operation, actual),
        Bool.and(Nat.is_eq(inv, current), Bool.and(Nat.is_eq(generation, epoch), O.active(phase)))
      )
    )
    == Bool.and(
      Nat.is_eq(operation, inv),
      Bool.and(
        Nat.is_eq(operation, actual),
        Bool.and(Nat.is_eq(inv, current), Bool.and(Nat.is_eq(generation, epoch), S.active(phase)))
      )
    )
    : Bool
  }:
  match phase:

    case O.ChildInstalling{}: {==}

    case O.ChildReady{}: {==}

    case O.ChildAwaiting{}: {==}

    case O.ChildResuming{}: {==}

    case O.ChildAccepted{}: {==}

    case O.ChildCancelled{}: {==}

def root_current_exact(
  +operation: Nat,
  +inv: Nat,
  +generation: Nat,
  +found: Maybe<&2, O.Child>
) -> {
  O.evaluation_current(operation, inv, generation, found)
  == S.current_root(operation, inv, generation, found)
  : Bool
}:
  match found:
    case None{}: {==}

    case Some{
      O.Child{O.EvaluationCleanupScope{actual, _, _, _}, current, epoch, _, phase, _, _, None{}}
    }: active_chain_exact(operation, inv, generation, actual, current, epoch, phase)

    case Some{
      O.Child{O.EvaluationCleanupScope{actual, _, _, _}, current, epoch, _, phase, _, _, Some{_}}
    }: {==}

    case Some{O.Child{O.EvaluationDispatchScope{_, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.EvaluationScope{actual, _, _}, current, epoch, _, phase, _, _, None{}}}: active_chain_exact(
      operation,
      inv,
      generation,
      actual,
      current,
      epoch,
      phase
    )

    case Some{O.Child{O.EvaluationScope{actual, _, _}, current, epoch, _, phase, _, _, Some{_}}}: {==}

    case Some{O.Child{O.DeliveryScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.SettingsScope{_}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.FreshnessScope{_}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.Scope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.SourceScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.AfterSourceScope{_, _, _, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.PreparationScope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.RetainingScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.AdviceTailScope{_, _, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

def dispatch_current_exact(
  +operation: Nat,
  +inv: Nat,
  +generation: Nat,
  +found: Maybe<&2, O.Child>
) -> {
  O.evaluation_dispatch_current(operation, inv, generation, found)
  == S.current_dispatch(operation, inv, generation, found)
  : Bool
}:
  match found:
    case None{}: {==}

    case Some{O.Child{O.EvaluationCleanupScope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{
      O.Child{O.EvaluationDispatchScope{actual, _, _}, current, epoch, _, phase, _, _, None{}}
    }: {==}

    case Some{
      O.Child{O.EvaluationDispatchScope{actual, _, _}, current, epoch, _, phase, _, _, Some{_}}
    }: active_chain_exact(operation, inv, generation, actual, current, epoch, phase)

    case Some{O.Child{O.EvaluationScope{_, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.DeliveryScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.SettingsScope{_}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.FreshnessScope{_}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.Scope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.SourceScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.AfterSourceScope{_, _, _, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.PreparationScope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.RetainingScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.AdviceTailScope{_, _, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

def at_jev_exact(+context: O.EvaluationContext, +found: Maybe<&2, C.Work>,
  +round: Maybe<&2, C.Round>) -> {
  O.evaluation_at_jev(context, found, round)
  == Bool.and(S.current_round(context, round), S.work_kind(False{}, found)) : Bool
}:
  match context found round:
    case O.EvaluationContext{_, _, _, _} None{} _: Equal.sym(Bool,
      Bool.and(S.current_round(context, round), False{}), False{},
      B.and_false(S.current_round(context, round)))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.AtJev{}, _}} None{}: {==}
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.AtJev{}, _}} Some{actual}:
      %Equal.sym(
        Bool,
        Bool.and(S.current_round(context, Some{actual}), True{}),
        S.current_round(context, Some{actual}),
        B.and_true(S.current_round(context, Some{actual}))
      ) : {
        O.evaluation_at_jev(context, found, Some{actual}) == _ : Bool
      }
      Equal.sym(Bool, S.current_round(context, Some{actual}),
        O.evaluation_at_jev(context, found, Some{actual}), round_exact(context, actual))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.AwaitingSourceRead{}, _}} _:
      Equal.sym(Bool, Bool.and(S.current_round(context, round), False{}), False{},
        B.and_false(S.current_round(context, round)))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.SourceReading{}, _}} _:
      Equal.sym(Bool, Bool.and(S.current_round(context, round), False{}), False{},
        B.and_false(S.current_round(context, round)))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.Preparing{}, _}} _:
      Equal.sym(Bool, Bool.and(S.current_round(context, round), False{}), False{},
        B.and_false(S.current_round(context, round)))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.Reviewing{}, _}} _:
      Equal.sym(Bool, Bool.and(S.current_round(context, round), False{}), False{},
        B.and_false(S.current_round(context, round)))
    case O.EvaluationContext{_, _, _, _} Some{C.Work{_, _, _, _, _, C.PendingFinding{_}, _}} _:
      Equal.sym(Bool, Bool.and(S.current_round(context, round), False{}), False{},
        B.and_false(S.current_round(context, round)))


def request_work_exact(+canon: C.State, +context: O.EvaluationContext) -> {
  O.evaluation_request_work(canon, context) == S.current_work(canon, context, False{}) : Bool
}:
  match canon context:
    case C.State{_, rounds, work, _, _, _, _, _, _} O.EvaluationContext{p, l, r, o}:
      at_jev_exact(context, C.find_work(p, l, r, o, work), C.find_round(p, rounds))

def request_exact(+canon: C.State, +context: O.EvaluationContext, +id: Nat) -> {
  O.evaluation_request(canon, context, id) == S.request(canon, context, id) : Maybe<&2, D.Request>
}:
  match canon context:
    case C.State{_, _, _, _, _, _, D.State{_, _, _, _, _}, _, _} O.EvaluationContext{_, _, _, _}: {==}

def started_exact(+found: Maybe<&2, D.Request>) -> {
  O.evaluation_request_started(found) == S.started(found) : Bool
}:
  match found:
    case None{}: {==}
    case Some{D.Request{_, _, _, _, _, _, _}}: {==}

def unstarted_exact(+found: Maybe<&2, D.Request>) -> {
  O.evaluation_request_unstarted(found) == S.unstarted(found) : Bool
}:
  match found:
    case None{}: {==}
    case Some{D.Request{_, _, _, _, _, True{}, _}}: {==}
    case Some{D.Request{_, _, _, _, _, False{}, True{}}}: {==}
    case Some{D.Request{_, _, _, _, _, False{}, False{}}}: {==}

def pending_dispatch_exact(+canon: C.State, +context: O.EvaluationContext, +id: Nat) -> {
  O.evaluation_dispatch_pending(canon, context, id) == S.pending_dispatch(canon, context, id) : Bool
}:
  %request_work_exact(canon, context) : {
    O.evaluation_dispatch_pending(canon, context, id)
    == Bool.and(_, S.unstarted(S.request(canon, context, id))) : Bool
  }
  %request_exact(canon, context, id) : {
    O.evaluation_dispatch_pending(canon, context, id)
    == Bool.and(O.evaluation_request_work(canon, context), S.unstarted(_)) : Bool
  }
  %unstarted_exact(O.evaluation_request(canon, context, id)) : {
    O.evaluation_dispatch_pending(canon, context, id)
    == Bool.and(O.evaluation_request_work(canon, context), _) : Bool
  }
  {==}

def dispatch_custody_exact(+canon: C.State, +context: O.EvaluationContext, +id: Nat) -> {
  O.evaluation_dispatch_custody(canon, context, id)
  == Bool.or(S.started(S.request(canon, context, id)), S.pending_dispatch(canon, context, id))
  : Bool
}:
  %pending_dispatch_exact(canon, context, id) : {
    O.evaluation_dispatch_custody(canon, context, id)
    == Bool.or(S.started(S.request(canon, context, id)), _) : Bool
  }
  %request_exact(canon, context, id) : {
    O.evaluation_dispatch_custody(canon, context, id)
    == Bool.or(S.started(_), O.evaluation_dispatch_pending(canon, context, id)) : Bool
  }
  %started_exact(O.evaluation_request(canon, context, id)) : {
    O.evaluation_dispatch_custody(canon, context, id)
    == Bool.or(_, O.evaluation_dispatch_pending(canon, context, id)) : Bool
  }
  {==}

def root_scope_live_exact(+state: O.State, +operation: Nat, +context: O.EvaluationContext,
  +permission: O.EvaluationPermission, +origin: Nat, +id: Nat, +inv: Nat, +epoch: Nat,
  +handle: Nat, +phase: O.Phase, +pending: Maybe<&2, Nat>, +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>) -> {
    O.child_scope_live(
      S.canonical(state),
      S.children(state),
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    )
    == S.scope_live(
      state,
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    )
    : Bool
  }:
  match state:
    case O.State{canon, _, _, rest}:

      root_current_exact(operation, inv, epoch, O.find(inv, rest))

def cleanup_scope_live_exact(+state: O.State, +operation: Nat, +context: O.EvaluationContext,
  +permission: O.EvaluationPermission, +origin: Nat, +id: Nat, +inv: Nat, +epoch: Nat,
  +handle: Nat, +phase: O.Phase, +pending: Maybe<&2, Nat>, +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>) -> {
    O.child_scope_live(
      S.canonical(state),
      S.children(state),
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    )
    == S.scope_live(
      state,
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    )
    : Bool
  }:
  match state:
    case O.State{canon, _, _, rest}:

      root_current_exact(operation, inv, epoch, O.find(inv, rest))

def dispatch_scope_live_exact(+state: O.State, +operation: Nat, +context: O.EvaluationContext,
  +permission: O.EvaluationPermission, +origin: Nat, +id: Nat, +inv: Nat, +epoch: Nat,
  +handle: Nat, +phase: O.Phase, +pending: Maybe<&2, Nat>, +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>) -> {
    O.child_scope_live(
      S.canonical(state),
      S.children(state),
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    )
    == S.scope_live(
      state,
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    )
    : Bool
  }:
  match state:
    case O.State{canon, _, _, rest}:

      %dispatch_current_exact(operation, inv, epoch, O.find(inv, rest)) : {
        O.child_scope_live(
          canon,
          rest,
          O.Child{
            O.EvaluationDispatchScope{operation, context, id},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          }
        )
        == Bool.and(
          _,
          Bool.or(S.started(S.request(canon, context, id)), S.pending_dispatch(canon, context, id))
        )
        : Bool
      }
      %dispatch_custody_exact(canon, context, id) : {
        O.child_scope_live(
          canon,
          rest,
          O.Child{
            O.EvaluationDispatchScope{operation, context, id},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          }
        )
        == Bool.and(O.evaluation_dispatch_current(operation, inv, epoch, O.find(inv, rest)), _)
        : Bool
      }
      {==}

def live_from_scope_exact(+state: O.State, +child: O.Child,
  scope: {O.child_scope_live(S.canonical(state), S.children(state), child)
    == S.scope_live(state, child) : Bool}) -> {
  O.child_live(S.canonical(state), S.children(state), child) == S.live(state, child) : Bool
}:
  match state child:
    case O.State{canon, _, _, rest} O.Child{_, _, _, _, _, _, _, parent}:
      %scope : {
        Bool.and(O.child_scope_live(canon, rest, child), O.parent_live(parent, rest))
        == Bool.and(_, O.parent_live(parent, rest)) : Bool
      }
      {==}

def active_exact(+phase: O.Phase) -> {O.active(phase) == S.active(phase) : Bool}:
  match phase:

    case O.ChildInstalling{}: {==}

    case O.ChildReady{}: {==}

    case O.ChildAwaiting{}: {==}

    case O.ChildResuming{}: {==}

    case O.ChildAccepted{}: {==}

    case O.ChildCancelled{}: {==}

def retire_exact(+inv: Nat, +handle: Nat) -> {
  O.retire(inv, handle) == S.retire(inv, handle) : List<&2, O.Action>
}:
  match handle:
    case 0n: {==}
    case 1n++value:
      %N.add_comm(value, 1n) : {
        O.RetireHandle{inv, Nat.add(value, 1n)} <> Nil{}
        == O.RetireHandle{inv, _} <> Nil{} : List<&2, O.Action>
      }
      {==}


def cancel_update_exact(
  +child: O.Child
) -> {O.cancel_child(child) == S.cancel_update(child) : O.ChildUpdate}:
  match child:
    case O.Child{scope, inv, epoch, handle, phase, _, held, parent}:
      %active_exact(phase) : {
        O.cancel_child(child)
        == O.ChildUpdate{
          O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, held, parent},
          Bool.pick(
            List<&2, O.Action>,
            _,
            O.CancelChild{inv, handle} <> S.retire(inv, handle),
            Nil{}
          )
        }
        : O.ChildUpdate
      }
      %retire_exact(inv, handle) : {
        O.cancel_child(child)
        == O.ChildUpdate{
          O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, held, parent},
          Bool.pick(List<&2, O.Action>, O.active(phase), O.CancelChild{inv, handle} <> _, Nil{})
        }
        : O.ChildUpdate
      }
      {==}

def invalidated_exact(+valid: Bool, +child: O.Child) -> {
  O.invalidate_live(valid, child) == S.invalidated(valid, child) : O.ChildUpdate
}:
  match valid:
    case True{}: {==}
    case False{}: cancel_update_exact(child)

def invalidate_from_live_exact(
  +state: O.State,
  +scope: O.Scope,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  validity: {O.validity_needed(phase, scope) == S.active(phase) : Bool},
  live: {
    O.child_live(
      S.canonical(state),
      S.children(state),
      O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
    )
    == S.live(state, O.Child{scope, inv, epoch, handle, phase, pending, held, parent})
    : Bool
  }
) -> {
      O.invalidate(
        S.canonical(state),
        S.children(state),
        O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
      )
      == S.invalidated(
        Bool.or(
          Bool.not(S.active(phase)),
          S.live(state, O.Child{scope, inv, epoch, handle, phase, pending, held, parent})
        ),
        O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
      )
      : O.ChildUpdate
    }:
  match state:
    case O.State{canon, _, _, rest}:
      %validity : {
        O.invalidate(canon, rest, O.Child{scope, inv, epoch, handle, phase, pending, held, parent})
        == S.invalidated(
          Bool.or(
            Bool.not(_),
            S.live(state, O.Child{scope, inv, epoch, handle, phase, pending, held, parent})
          ),
          O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
        )
        : O.ChildUpdate
      }
      %live : {
        O.invalidate(canon, rest, O.Child{scope, inv, epoch, handle, phase, pending, held, parent})
        == S.invalidated(Bool.or(Bool.not(O.validity_needed(phase, scope)), _),
          O.Child{scope, inv, epoch, handle, phase, pending, held, parent}) : O.ChildUpdate
      }
      invalidated_exact(
        Bool.or(
          Bool.not(O.validity_needed(phase, scope)),
          O.child_live(
            canon,
            rest,
            O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
          )
        ),
        O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
      )

def root_validity_exact(+phase: O.Phase, +operation: Nat, +context: O.EvaluationContext,
  +permission: O.EvaluationPermission, +origin: Nat, +id: Nat) -> {
    O.validity_needed(phase, O.EvaluationScope{operation, context, permission})
    == S.active(phase)
    : Bool
  }:
  match phase:

    case O.ChildInstalling{}: {==}

    case O.ChildReady{}: {==}

    case O.ChildAwaiting{}: {==}

    case O.ChildResuming{}: {==}

    case O.ChildAccepted{}: {==}

    case O.ChildCancelled{}: {==}

def cleanup_validity_exact(+phase: O.Phase, +operation: Nat, +context: O.EvaluationContext,
  +permission: O.EvaluationPermission, +origin: Nat, +id: Nat) -> {
    O.validity_needed(phase, O.EvaluationCleanupScope{operation, origin, context, permission})
    == S.active(phase)
    : Bool
  }:
  match phase:

    case O.ChildInstalling{}: {==}

    case O.ChildReady{}: {==}

    case O.ChildAwaiting{}: {==}

    case O.ChildResuming{}: {==}

    case O.ChildAccepted{}: {==}

    case O.ChildCancelled{}: {==}

def dispatch_validity_exact(+phase: O.Phase, +operation: Nat, +context: O.EvaluationContext,
  +permission: O.EvaluationPermission, +origin: Nat, +id: Nat) -> {
    O.validity_needed(phase, O.EvaluationDispatchScope{operation, context, id})
    == S.active(phase)
    : Bool
  }:
  match phase:

    case O.ChildInstalling{}: {==}

    case O.ChildReady{}: {==}

    case O.ChildAwaiting{}: {==}

    case O.ChildResuming{}: {==}

    case O.ChildAccepted{}: {==}

    case O.ChildCancelled{}: {==}

def invalidate_exact(+state: O.State, +child: O.Child) -> {
  O.invalidate(S.canonical(state), S.children(state), child)
  == S.invalidate(state, child)
  : O.ChildUpdate
}:
  match child:

    case O.Child{
      O.EvaluationScope{operation, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    }:
      invalidate_from_live_exact(
        state,
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent,
        root_validity_exact(phase, operation, context, permission, 0n, 0n),
        live_from_scope_exact(
          state,
          child,
          root_scope_live_exact(
            state,
            operation,
            context,
            permission,
            0n,
            0n,
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          )
        )
      )

    case O.Child{
      O.EvaluationCleanupScope{operation, origin, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    }:
      invalidate_from_live_exact(
        state,
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent,
        cleanup_validity_exact(phase, operation, context, permission, origin, 0n),
        live_from_scope_exact(
          state,
          child,
          cleanup_scope_live_exact(
            state,
            operation,
            context,
            permission,
            origin,
            0n,
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          )
        )
      )

    case O.Child{
      O.EvaluationDispatchScope{operation, context, id},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    }:
      invalidate_from_live_exact(
        state,
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent,
        dispatch_validity_exact(phase, operation, context, O.EvaluationUnissued{}, 0n, id),
        live_from_scope_exact(
          state,
          child,
          dispatch_scope_live_exact(
            state,
            operation,
            context,
            O.EvaluationUnissued{},
            0n,
            id,
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          )
        )
      )

    case O.Child{O.DeliveryScope{_, _, _, _, _}, _, _, _, _, _, _, _}: {==}

    case O.Child{O.SettingsScope{_}, _, _, _, _, _, _, _}: {==}

    case O.Child{O.FreshnessScope{_}, _, _, _, _, _, _, _}: {==}

    case O.Child{O.Scope{_, _, _, _}, _, _, _, _, _, _, _}: {==}

    case O.Child{O.SourceScope{_, _, _, _, _}, _, _, _, _, _, _, _}: {==}

    case O.Child{O.AfterSourceScope{_, _, _, _, _, _, _}, _, _, _, _, _, _, _}: {==}

    case O.Child{O.PreparationScope{_, _, _, _}, _, _, _, _, _, _, _}: {==}

    case O.Child{O.RetainingScope{_, _, _, _, _}, _, _, _, _, _, _, _}: {==}

    case O.Child{O.AdviceTailScope{_, _, _, _, _, _}, _, _, _, _, _, _, _}: {==}

def invalidation_join_exact(+head: O.ChildUpdate, +tail: O.Invalidated) -> {
  O.invalidate_join(head, tail) == S.invalidation_join(head, tail) : O.Invalidated
}:
  match head tail:
    case O.ChildUpdate{_, _} O.Invalidated{_, _}: {==}

def invalidation_scan_exact(+state: O.State, +rest: List<&2, O.Child>) -> {
  O.invalidate_scan(S.canonical(state), S.children(state), rest)
  == S.invalidation_scan(state, rest) : O.Invalidated
}:
  match rest:
    case Nil{}: {==}
    case child <> tail:
      %invalidate_exact(state, child) : {
        O.invalidate_scan(S.canonical(state), S.children(state), rest)
        == S.invalidation_join(_, S.invalidation_scan(state, tail)) : O.Invalidated
      }
      %invalidation_scan_exact(state, tail) : {
        O.invalidate_scan(S.canonical(state), S.children(state), rest)
        == S.invalidation_join(O.invalidate(S.canonical(state), S.children(state), child), _)
        : O.Invalidated
      }
      invalidation_join_exact(O.invalidate(S.canonical(state), S.children(state), child),
        O.invalidate_scan(S.canonical(state), S.children(state), tail))

def reconciled_exact(+state: O.State, +outputs: List<&2, C.Output>, +actions: List<&2, O.Action>,
  +invalidated: O.Invalidated) -> {
  O.reconcile_cancel_join(state, outputs, actions, invalidated)
  == S.reconciled(state, outputs, actions, invalidated) : O.Step
}:
  match state invalidated:
    case O.State{_, _, _, _} O.Invalidated{_, _}: {==}

def reconcile_advanced_exact(
  +state: O.State,
  +outputs: List<&2, C.Output>,
  +actions: List<&2, O.Action>
) -> {
  O.reconcile_cancel(O.Advanced{state, outputs, actions})
  == S.reconcile(O.Advanced{state, outputs, actions}) : O.Step
}:
  match state:
    case O.State{canon, _, _, rest}:
      %invalidation_scan_exact(state, rest) : {
        O.reconcile_cancel(O.Advanced{state, outputs, actions})
        == S.reconciled(state, outputs, actions, _) : O.Step
      }
      reconciled_exact(state, outputs, actions, O.invalidate_scan(canon, rest, rest))

def reconcile_exact(+step: O.Step) -> {O.reconcile_cancel(step) == S.reconcile(step) : O.Step}:
  match step:
    case O.Advanced{state, outputs, actions}: reconcile_advanced_exact(state, outputs, actions)
    case O.Rejected{_, _}: {==}

def installing_exact(+phase: O.Phase) -> {O.installing(phase) == S.install_phase(phase) : Bool}:
  match phase:
    case O.ChildInstalling{}: {==}
    case O.ChildReady{}: {==}
    case O.ChildAwaiting{}: {==}
    case O.ChildResuming{}: {==}
    case O.ChildAccepted{}: {==}
    case O.ChildCancelled{}: {==}

def install_matches_exact(+child: O.Child, +generation: Nat) -> {
  O.install_matches(child, generation) == S.installable(child, generation) : Bool
}:
  match child:
    case O.Child{_, _, epoch, _, phase, _, None{}, _}:
      %N.is_eq_comm(epoch, generation) : {
        Bool.and(Nat.is_eq(epoch, generation), O.installing(phase))
        == Bool.and(_, S.install_phase(phase)) : Bool
      }
      %installing_exact(phase) : {
        Bool.and(Nat.is_eq(epoch, generation), O.installing(phase))
        == Bool.and(Nat.is_eq(epoch, generation), _) : Bool
      }
      {==}
    case O.Child{_, _, _, _, _, _, Some{_}, _}: {==}

def installed_exact(
  +valid: Bool,
  +state: O.State,
  +child: O.Child,
  +handle: Nat,
  +request: Nat
) -> {
  O.install_allowed(valid, state, child, handle, request)
  == S.installed(valid, state, child, handle, request)
  : O.Step
}:
  match valid child:
    case False{} _: {==}
    case True{} O.Child{_, _, _, _, _, _, _, _}: {==}

def install_found_from_live_exact(
  +state: O.State,
  +child: O.Child,
  +generation: Nat,
  +handle: Nat,
  +request: Nat,
  eligible: {
    Bool.and(
      O.scope_request(O.child_scope_value(child), generation, request),
      Bool.and(O.ordinary_scope(O.child_scope_value(child)), O.install_matches(child, generation))
    )
    == S.installable(child, generation)
    : Bool
  },
  live: {O.child_live(S.canonical(state), S.children(state), child) == S.live(state, child) : Bool}
) -> {
  O.install_found(state, Some{child}, generation, handle, request)
  == S.install_found(state, Some{child}, generation, handle, request) : O.Step
}:
  match state:
    case O.State{canon, _, _, rest}:
      %live : {
        O.install_found(state, Some{child}, generation, handle, request)
        == S.installed(Bool.and(_, S.installable(child, generation)), state, child, handle, request)
        : O.Step
      }
      %eligible : {
        O.install_found(state, Some{child}, generation, handle, request)
        == S.installed(Bool.and(O.child_live(canon, rest, child), _), state, child, handle, request)
        : O.Step
      }
      installed_exact(
        Bool.and(
          O.child_live(canon, rest, child),
          Bool.and(
            O.scope_request(O.child_scope_value(child), generation, request),
            Bool.and(
              O.ordinary_scope(O.child_scope_value(child)),
              O.install_matches(child, generation)
            )
          )
        ),
        state,
        child,
        handle,
        request
      )

def find_head_exact(+child: O.Child, +rest: List<&2, O.Child>) -> {
  O.find(O.child_invocation(child), child <> rest) == Some{child} : Maybe<&2, O.Child>
}:
  match child:
    case O.Child{_, inv, _, _, _, _, _, _}:
      %Equal.sym(Bool, Nat.is_eq(inv, inv), True{}, N.is_eq_refl(inv)) : {
        Bool.pick(Maybe<&2, O.Child>, _, Some{child}, O.find(inv, rest))
        == Some{child}
        : Maybe<&2, O.Child>
      }
      {==}

def install_lookup_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +handle: Nat,
  +request: Nat,
  +child: O.Child,
  found: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  found_right: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  selected: {
    O.install_found(state, Some{child}, generation, handle, request)
    == S.install_found(state, Some{child}, generation, handle, request)
    : O.Step
  }
) -> {
      O.install(state, inv, generation, handle, request)
      == S.install(state, inv, generation, handle, request)
      : O.Step
    }:
  match state:
    case O.State{_, _, _, rest}:
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found_right) : {
        O.install_found(state, O.find(inv, rest), generation, handle, request)
        == S.install_found(state, _, generation, handle, request) : O.Step
      }
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found) : {
        O.install_found(state, _, generation, handle, request)
        == S.install_found(state, Some{child}, generation, handle, request) : O.Step
      }
      selected

def provider_started_exact(+valid: Bool, +state: O.State, +child: O.Child) -> {
  O.provider_allowed(valid, state, child) == S.provider_started(valid, state, child) : O.Step
}:
  match valid state child:
    case False{} O.State{_, _, _, _} O.Child{_, _, _, _, _, _, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildInstalling{}, _, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildAwaiting{}, _, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildResuming{}, _, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildAccepted{}, _, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildCancelled{}, _, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildReady{}, None{}, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildReady{}, Some{_}, Some{_}, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildReady{}, Some{_}, None{}, _}: {==}

def provider_found_from_live_exact(
  +state: O.State,
  +child: O.Child,
  live: {O.child_live(S.canonical(state), S.children(state), child) == S.live(state, child) : Bool}
) -> {
  O.provider_found(state, Some{child}) == S.provider_start_found(state, Some{child}) : O.Step
}:
  match state:
    case O.State{canon, _, _, rest}:
      %live : {
        O.provider_found(state, Some{child}) == S.provider_started(_, state, child) : O.Step
      }
      provider_started_exact(O.child_live(canon, rest, child), state, child)

def provider_start_lookup_exact(
  +state: O.State,
  +inv: Nat,
  +child: O.Child,
  found: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  found_right: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  selected: {
    O.provider_found(state, Some{child})
    == S.provider_start_found(state, Some{child})
    : O.Step
  }
) -> {
  O.provider_start(state, inv) == S.provider_start(state, inv) : O.Step
}:
  match state:
    case O.State{_, _, _, rest}:
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found_right) : {
        O.provider_found(state, O.find(inv, rest)) == S.provider_start_found(state, _) : O.Step
      }
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found) : {
        O.provider_found(state, _) == S.provider_start_found(state, Some{child}) : O.Step
      }
      selected

def root_install_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +new_handle: Nat,
  +request: Nat
) -> {
    O.install(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      new_handle,
      request
    )
    == S.install(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      new_handle,
      request
    )
    : O.Step
  }:
  install_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    generation,
    new_handle,
    request,
    O.Child{
      O.EvaluationScope{operation, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    install_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      generation,
      new_handle,
      request,
      install_matches_exact(
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        generation
      ),
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationScope{operation, context, permission},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        root_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationScope{operation, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def root_provider_start_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +new_handle: Nat,
  +request: Nat
) -> {
    O.provider_start(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    == S.provider_start(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    : O.Step
  }:
  provider_start_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    O.Child{
      O.EvaluationScope{operation, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    provider_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationScope{operation, context, permission},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        root_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationScope{operation, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def cleanup_install_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +new_handle: Nat,
  +request: Nat
) -> {
    O.install(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      new_handle,
      request
    )
    == S.install(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      new_handle,
      request
    )
    : O.Step
  }:
  install_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    generation,
    new_handle,
    request,
    O.Child{
      O.EvaluationCleanupScope{operation, origin, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    install_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      generation,
      new_handle,
      request,
      install_matches_exact(
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        generation
      ),
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationCleanupScope{operation, origin, context, permission},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        cleanup_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationCleanupScope{operation, origin, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def cleanup_provider_start_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +new_handle: Nat,
  +request: Nat
) -> {
    O.provider_start(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    == S.provider_start(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    : O.Step
  }:
  provider_start_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    O.Child{
      O.EvaluationCleanupScope{operation, origin, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    provider_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationCleanupScope{operation, origin, context, permission},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        cleanup_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationCleanupScope{operation, origin, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def dispatch_install_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +new_handle: Nat,
  +request: Nat
) -> {
    O.install(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      new_handle,
      request
    )
    == S.install(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      new_handle,
      request
    )
    : O.Step
  }:
  install_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    generation,
    new_handle,
    request,
    O.Child{
      O.EvaluationDispatchScope{operation, context, id},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    install_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      generation,
      new_handle,
      request,
      install_matches_exact(
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        generation
      ),
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationDispatchScope{operation, context, id},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        dispatch_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationDispatchScope{operation, context, id},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def dispatch_provider_start_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +new_handle: Nat,
  +request: Nat
) -> {
    O.provider_start(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    == S.provider_start(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    : O.Step
  }:
  provider_start_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    O.Child{
      O.EvaluationDispatchScope{operation, context, id},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    provider_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationDispatchScope{operation, context, id},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        dispatch_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationDispatchScope{operation, context, id},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def completed_exact(+valid: Bool, +state: O.State, +child: O.Child, +reply: Nat) -> {
  O.completion_active(valid, state, child, reply)
  == S.completed(valid, state, child, reply)
  : O.Step
}:
  match valid child:

    case False{} O.Child{
      scope,
      inv,
      epoch,
      handle,
      phase,
      pending,
      Some{O.Lease{lease, expected}},
      parent
    }:
      %retire_exact(inv, handle) : {
        O.completion_active(valid, state, child, reply)
        == O.updated(state, O.ChildUpdate{

          O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
          O.CleanupProvider{inv, lease} <> _}) : O.Step

      }
      {==}

    case True{} O.Child{
      scope,
      inv,
      epoch,
      handle,
      O.ChildInstalling{},
      pending,
      Some{O.Lease{lease, expected}},
      parent
    }:
      %retire_exact(inv, handle) : {
        O.completion_active(valid, state, child, reply)
        == O.updated(state, O.ChildUpdate{

          O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
          O.CleanupProvider{inv, lease} <> _}) : O.Step

      }
      {==}

    case True{} O.Child{
      scope,
      inv,
      epoch,
      handle,
      O.ChildReady{},
      pending,
      Some{O.Lease{lease, expected}},
      parent
    }:
      %retire_exact(inv, handle) : {
        O.completion_active(valid, state, child, reply)
        == O.updated(state, O.ChildUpdate{

          O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
          O.CleanupProvider{inv, lease} <> _}) : O.Step

      }
      {==}

    case True{} O.Child{
      scope,
      inv,
      epoch,
      handle,
      O.ChildAwaiting{},
      pending,
      Some{O.Lease{lease, expected}},
      parent
    }:
      %retire_exact(inv, handle) : {
        O.completion_active(valid, state, child, reply)
        == O.updated(
          state,
          O.ChildUpdate{
            O.Child{scope, inv, Nat.add(epoch, 1n), 0n, O.ChildResuming{}, None{}, None{}, parent},
            O.Resume{
              inv,
              Nat.add(epoch, 1n),
              handle,
              reply
            } <> List.append(&2, O.Action, _, [O.CleanupProvider{inv, lease}])
          }
        )
        : O.Step
      }
      {==}

    case True{} O.Child{
      scope,
      inv,
      epoch,
      handle,
      O.ChildResuming{},
      pending,
      Some{O.Lease{lease, expected}},
      parent
    }:
      %retire_exact(inv, handle) : {
        O.completion_active(valid, state, child, reply)
        == O.updated(state, O.ChildUpdate{

          O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
          O.CleanupProvider{inv, lease} <> _}) : O.Step

      }
      {==}

    case True{} O.Child{
      scope,
      inv,
      epoch,
      handle,
      O.ChildAccepted{},
      pending,
      Some{O.Lease{lease, expected}},
      parent
    }:
      %retire_exact(inv, handle) : {
        O.completion_active(valid, state, child, reply)
        == O.updated(state, O.ChildUpdate{

          O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
          O.CleanupProvider{inv, lease} <> _}) : O.Step

      }
      {==}

    case True{} O.Child{
      scope,
      inv,
      epoch,
      handle,
      O.ChildCancelled{},
      pending,
      Some{O.Lease{lease, expected}},
      parent
    }:
      %retire_exact(inv, handle) : {
        O.completion_active(valid, state, child, reply)
        == O.updated(state, O.ChildUpdate{

          O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
          O.CleanupProvider{inv, lease} <> _}) : O.Step

      }
      {==}

    case False{} O.Child{_, _, _, _, _, _, None{}, _}: {==}

    case True{} O.Child{_, _, _, _, O.ChildInstalling{}, _, None{}, _}: {==}

    case True{} O.Child{_, _, _, _, O.ChildReady{}, _, None{}, _}: {==}

    case True{} O.Child{_, _, _, _, O.ChildAwaiting{}, _, None{}, _}: {==}

    case True{} O.Child{_, _, _, _, O.ChildResuming{}, _, None{}, _}: {==}

    case True{} O.Child{_, _, _, _, O.ChildAccepted{}, _, None{}, _}: {==}

    case True{} O.Child{_, _, _, _, O.ChildCancelled{}, _, None{}, _}: {==}


def completion_selected_from_live_exact(
  +matches: Bool,
  +state: O.State,
  +child: O.Child,
  +reply: Nat,
  live: {O.child_live(S.canonical(state), S.children(state), child) == S.live(state, child) : Bool}
) -> {
    O.completion_matched(matches, state, child, reply)
    == S.completion_selected(matches, state, child, reply)
    : O.Step
  }:
  match matches state:
    case False{} _: {==}
    case True{} O.State{canon, _, _, rest}:
      %live : {
        O.completion_matched(matches, state, child, reply)
        == S.reconcile(S.completed(_, state, child, reply))
        : O.Step
      }
      %completed_exact(O.child_live(canon, rest, child), state, child, reply) : {
        O.completion_matched(matches, state, child, reply) == S.reconcile(_) : O.Step
      }
      reconcile_exact(O.completion_active(O.child_live(canon, rest, child), state, child, reply))

def completion_found_from_live_exact(
  +state: O.State,
  +child: O.Child,
  +lease: Nat,
  +request: Nat,
  +reply: Nat,
  live: {O.child_live(S.canonical(state), S.children(state), child) == S.live(state, child) : Bool}
) -> {
  O.completion_found(state, Some{child}, lease, request, reply)
  == S.completion_found(state, Some{child}, lease, request, reply) : O.Step
}:
  match child:
    case O.Child{_, _, _, _, _, _, None{}, _}: {==}
    case O.Child{_, _, _, _, _, _, Some{O.Lease{id, expected}}, _}:
      %N.is_eq_comm(id, lease) : {
        O.completion_found(state, Some{child}, lease, request, reply)
        == S.completion_selected(Bool.and(_, Nat.is_eq(request, expected)), state, child, reply)
        : O.Step
      }
      %N.is_eq_comm(expected, request) : {
        O.completion_found(state, Some{child}, lease, request, reply)
        == S.completion_selected(Bool.and(Nat.is_eq(id, lease), _), state, child, reply) : O.Step
      }
      completion_selected_from_live_exact(
        Bool.and(Nat.is_eq(id, lease), Nat.is_eq(expected, request)),
        state,
        child,
        reply,
        live
      )

def completion_lookup_exact(
  +state: O.State,
  +inv: Nat,
  +lease: Nat,
  +request: Nat,
  +reply: Nat,
  +child: O.Child,
  found: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  found_right: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  selected: {
    O.completion_found(state, Some{child}, lease, request, reply)
    == S.completion_found(state, Some{child}, lease, request, reply)
    : O.Step
  }
) -> {
      O.provider_completed(state, inv, lease, request, reply)
      == S.provider_completed(state, inv, lease, request, reply)
      : O.Step
    }:
  match state:
    case O.State{_, _, _, rest}:
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found_right) : {
        O.completion_found(state, O.find(inv, rest), lease, request, reply)
        == S.completion_found(state, _, lease, request, reply) : O.Step
      }
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found) : {
        O.completion_found(state, _, lease, request, reply)
        == S.completion_found(state, Some{child}, lease, request, reply) : O.Step
      }
      selected

def root_provider_completed_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +lease: Nat,
  +request: Nat,
  +reply: Nat
) -> {
    O.provider_completed(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      lease,
      request,
      reply
    )
    == S.provider_completed(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      lease,
      request,
      reply
    )
    : O.Step
  }:
  completion_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    lease,
    request,
    reply,
    O.Child{
      O.EvaluationScope{operation, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    completion_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      lease,
      request,
      reply,
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationScope{operation, context, permission},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        root_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationScope{operation, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def cleanup_provider_completed_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +lease: Nat,
  +request: Nat,
  +reply: Nat
) -> {
    O.provider_completed(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      lease,
      request,
      reply
    )
    == S.provider_completed(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      lease,
      request,
      reply
    )
    : O.Step
  }:
  completion_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    lease,
    request,
    reply,
    O.Child{
      O.EvaluationCleanupScope{operation, origin, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    completion_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      lease,
      request,
      reply,
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationCleanupScope{operation, origin, context, permission},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        cleanup_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationCleanupScope{operation, origin, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def dispatch_provider_completed_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +lease: Nat,
  +request: Nat,
  +reply: Nat
) -> {
    O.provider_completed(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      lease,
      request,
      reply
    )
    == S.provider_completed(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      lease,
      request,
      reply
    )
    : O.Step
  }:
  completion_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    lease,
    request,
    reply,
    O.Child{
      O.EvaluationDispatchScope{operation, context, id},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    completion_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      lease,
      request,
      reply,
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationDispatchScope{operation, context, id},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        dispatch_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationDispatchScope{operation, context, id},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def cancel_cycle_exact(
  +state: O.State,
  +scope: O.Scope,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>
) -> {
    O.cancel_allowed(
      O.active(phase),
      state,
      O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
    )
    == S.cancelled(
      S.active(phase),
      state,
      O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
    )
    : O.Step
  }:
  match phase:

    case O.ChildInstalling{}:
      %retire_exact(inv, handle) : {
        O.cancel_allowed(
          O.active(phase),
          state,
          O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
        )
        == S.reconcile(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, held, parent},
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      reconcile_exact(
        O.updated(
          state,
          O.cancel_child(O.Child{scope, inv, epoch, handle, phase, pending, held, parent})
        )
      )

    case O.ChildReady{}:
      %retire_exact(inv, handle) : {
        O.cancel_allowed(
          O.active(phase),
          state,
          O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
        )
        == S.reconcile(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, held, parent},
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      reconcile_exact(
        O.updated(
          state,
          O.cancel_child(O.Child{scope, inv, epoch, handle, phase, pending, held, parent})
        )
      )

    case O.ChildAwaiting{}:
      %retire_exact(inv, handle) : {
        O.cancel_allowed(
          O.active(phase),
          state,
          O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
        )
        == S.reconcile(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, held, parent},
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      reconcile_exact(
        O.updated(
          state,
          O.cancel_child(O.Child{scope, inv, epoch, handle, phase, pending, held, parent})
        )
      )

    case O.ChildResuming{}:
      %retire_exact(inv, handle) : {
        O.cancel_allowed(
          O.active(phase),
          state,
          O.Child{scope, inv, epoch, handle, phase, pending, held, parent}
        )
        == S.reconcile(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, held, parent},
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      reconcile_exact(
        O.updated(
          state,
          O.cancel_child(O.Child{scope, inv, epoch, handle, phase, pending, held, parent})
        )
      )

    case O.ChildAccepted{}: {==}

    case O.ChildCancelled{}: {==}

def cancel_lookup_exact(
  +state: O.State,
  +inv: Nat,
  +child: O.Child,
  found: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  found_right: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  selected: {O.cancel_found(state, Some{child}) == S.cancel_found(state, Some{child}) : O.Step}
) -> {
  O.cancel(state, inv) == S.cancel(state, inv) : O.Step
}:
  match state:
    case O.State{_, _, _, rest}:
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found_right) : {
        O.cancel_found(state, O.find(inv, rest)) == S.cancel_found(state, _) : O.Step
      }
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found) : {
        O.cancel_found(state, _) == S.cancel_found(state, Some{child}) : O.Step
      }
      selected

def root_cancel_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>
) -> {
    O.cancel(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    == S.cancel(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    : O.Step
  }:
  cancel_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    O.Child{
      O.EvaluationScope{operation, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    cancel_cycle_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.EvaluationScope{operation, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    )
  )

def cleanup_cancel_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>
) -> {
    O.cancel(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    == S.cancel(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    : O.Step
  }:
  cancel_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    O.Child{
      O.EvaluationCleanupScope{operation, origin, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    cancel_cycle_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.EvaluationCleanupScope{operation, origin, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    )
  )

def dispatch_cancel_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>
) -> {
    O.cancel(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    == S.cancel(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv
    )
    : O.Step
  }:
  cancel_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    O.Child{
      O.EvaluationDispatchScope{operation, context, id},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    cancel_cycle_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.EvaluationDispatchScope{operation, context, id},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    )
  )

def accepted_exact(+valid: Bool, +state: O.State, +child: O.Child, +result: Nat) -> {
  O.terminal_allowed(valid, state, child, result)
  == S.accepted(valid, state, child, result)
  : O.Step
}:
  match valid child:
    case False{} O.Child{_, _, _, _, _, _, None{}, _}: {==}
    case False{} O.Child{_, _, _, _, _, _, Some{_}, _}: {==}
    case True{} O.Child{_, _, _, _, _, _, Some{_}, _}: {==}
    case True{} O.Child{scope, inv, epoch, handle, _, _, None{}, parent}:
      %retire_exact(inv, handle) : {
        O.terminal_allowed(valid, state, child, result)
        == O.updated(
          state,
          O.ChildUpdate{
            O.Child{scope, inv, epoch, 0n, O.ChildAccepted{}, None{}, None{}, parent},
            O.AcceptResult{scope, inv, result} <> _
          }
        )
        : O.Step
      }
      {==}

def root_terminal_scope_exact(
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission
) -> {
  O.terminal_scope(O.EvaluationScope{operation, context, permission})
  == S.terminal_permission(O.EvaluationScope{operation, context, permission}) : Bool
}:
  match permission:
    case O.EvaluationUnissued{}: {==}
    case O.EvaluationIssued{_}: {==}
    case O.EvaluationAtProvider{_, _}: {==}
    case O.EvaluationSettled{}: {==}

def terminal_found_from_live_exact(
  +state: O.State,
  +child: O.Child,
  +generation: Nat,
  +result: Nat,
  scope: {
    O.terminal_scope(O.child_scope_value(child))
    == S.terminal_permission(O.child_scope_value(child))
    : Bool
  },
  live: {O.child_live(S.canonical(state), S.children(state), child) == S.live(state, child) : Bool}
) -> {
    O.terminal_found(state, Some{child}, generation, result)
    == S.terminal_found(state, Some{child}, generation, result)
    : O.Step
  }:
  match state child:
    case O.State{canon, _, _, rest} O.Child{sc, _, _, _, _, _, _, _}:
      %scope : {
        O.terminal_found(state, Some{child}, generation, result)
        == S.accepted(
          Bool.and(_, Bool.and(S.live(state, child), S.installable(child, generation))),
          state,
          child,
          result
        )
        : O.Step
      }
      %live : {
        O.terminal_found(state, Some{child}, generation, result)
        == S.accepted(
          Bool.and(O.terminal_scope(sc), Bool.and(_, S.installable(child, generation))),
          state,
          child,
          result
        )
        : O.Step
      }
      %install_matches_exact(child, generation) : {
        O.terminal_found(state, Some{child}, generation, result)
        == S.accepted(
          Bool.and(O.terminal_scope(sc), Bool.and(O.child_live(canon, rest, child), _)),
          state,
          child,
          result
        )
        : O.Step
      }
      accepted_exact(
        Bool.and(
          O.terminal_scope(sc),
          Bool.and(O.child_live(canon, rest, child), O.install_matches(child, generation))
        ),
        state,
        child,
        result
      )

def terminal_lookup_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +result: Nat,
  +child: O.Child,
  found: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  found_right: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  selected: {
    O.terminal_found(state, Some{child}, generation, result)
    == S.terminal_found(state, Some{child}, generation, result)
    : O.Step
  }
) -> {
  O.terminal(state, inv, generation, result) == S.terminal(state, inv, generation, result) : O.Step
}:
  match state:
    case O.State{_, _, _, rest}:
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found_right) : {
        O.terminal_found(state, O.find(inv, rest), generation, result)
        == S.terminal_found(state, _, generation, result)
        : O.Step
      }
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found) : {
        O.terminal_found(state, _, generation, result)
        == S.terminal_found(state, Some{child}, generation, result)
        : O.Step
      }
      selected

def root_terminal_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +result: Nat
) -> {
    O.terminal(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      result
    )
    == S.terminal(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      result
    )
    : O.Step
  }:
  terminal_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    generation,
    result,
    O.Child{
      O.EvaluationScope{operation, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    terminal_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationScope{operation, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      generation,
      result,
      root_terminal_scope_exact(operation, context, permission),
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationScope{operation, context, permission},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        root_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationScope{operation, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def cleanup_terminal_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +result: Nat
) -> {
    O.terminal(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      result
    )
    == S.terminal(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      result
    )
    : O.Step
  }:
  terminal_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    generation,
    result,
    O.Child{
      O.EvaluationCleanupScope{operation, origin, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    terminal_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      generation,
      result,
      {==},
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationCleanupScope{operation, origin, context, permission},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        cleanup_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationCleanupScope{operation, origin, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def dispatch_terminal_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +id: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +result: Nat
) -> {
    O.terminal(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      result
    )
    == S.terminal(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      inv,
      generation,
      result
    )
    : O.Step
  }:
  terminal_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      } <> rest
    },
    inv,
    generation,
    result,
    O.Child{
      O.EvaluationDispatchScope{operation, context, id},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      rest
    ),
    terminal_found_from_live_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        } <> rest
      },
      O.Child{
        O.EvaluationDispatchScope{operation, context, id},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      generation,
      result,
      {==},
      live_from_scope_exact(
        O.State{
          canon,
          next,
          next_lease,
          O.Child{
            O.EvaluationDispatchScope{operation, context, id},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          } <> rest
        },
        O.Child{
          O.EvaluationDispatchScope{operation, context, id},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        dispatch_scope_live_exact(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationDispatchScope{operation, context, id},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            } <> rest
          },
          operation,
          context,
          permission,
          origin,
          id,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )
  )

def main() -> Unit:
  Unit{}
