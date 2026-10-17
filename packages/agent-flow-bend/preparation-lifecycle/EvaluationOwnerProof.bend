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

def main() -> Unit:
  Unit{}
