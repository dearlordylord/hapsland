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

def permit_child_exact(
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +child: O.Child
) -> {
  O.provider_permit_matches(inv, generation, lease, request, child)
  == S.permit_child(inv, generation, lease, request, child)
  : Bool
}:
  match child:

    case O.Child{_, _, _, _, O.ChildInstalling{}, _, _, _}: {==}

    case O.Child{_, _, _, _, O.ChildReady{}, _, _, _}: {==}

    case O.Child{_, _, _, _, O.ChildResuming{}, _, _, _}: {==}

    case O.Child{_, _, _, _, O.ChildAccepted{}, _, _, _}: {==}

    case O.Child{_, _, _, _, O.ChildCancelled{}, _, _, _}: {==}

    case O.Child{_, _, _, _, O.ChildAwaiting{}, None{}, _, _}: {==}
    case O.Child{_, _, _, _, O.ChildAwaiting{}, Some{_}, None{}, _}: {==}
    case O.Child{_, _, _, _, O.ChildAwaiting{}, Some{_}, Some{O.Lease{_, _}}, _}: {==}

def provider_live_found_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +child: O.Child,
  live: {O.child_live(S.canonical(state), S.children(state), child) == S.live(state, child) : Bool}
) -> {
    O.provider_permit_found(
      S.canonical(state),
      S.children(state),
      inv,
      generation,
      lease,
      request,
      Some{child}
    )
    == S.permitted(state, inv, generation, lease, request, Some{child})
    : Bool
  }:
  %live : {
    O.provider_permit_found(
      S.canonical(state),
      S.children(state),
      inv,
      generation,
      lease,
      request,
      Some{child}
    )
    == Bool.and(S.permit_child(inv, generation, lease, request, child), _)
    : Bool
  }
  %permit_child_exact(inv, generation, lease, request, child) : {
    O.provider_permit_found(
      S.canonical(state),
      S.children(state),
      inv,
      generation,
      lease,
      request,
      Some{child}
    )
    == Bool.and(_, O.child_live(S.canonical(state), S.children(state), child))
    : Bool
  }
  {==}

def provider_live_lookup_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +child: O.Child,
  found: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  found_right: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  selected: {
    O.provider_permit_found(
      S.canonical(state),
      S.children(state),
      inv,
      generation,
      lease,
      request,
      Some{child}
    )
    == S.permitted(state, inv, generation, lease, request, Some{child})
    : Bool
  }
) -> {
      O.provider_live(state, inv, generation, lease, request)
      == S.provider_live(state, inv, generation, lease, request)
      : Bool
    }:
  match state:
    case O.State{canon, _, _, rest}:
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found_right) : {
        O.provider_permit_found(canon, rest, inv, generation, lease, request, O.find(inv, rest))
        == S.permitted(state, inv, generation, lease, request, _) : Bool
      }
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found) : {
        O.provider_permit_found(canon, rest, inv, generation, lease, request, _)
        == S.permitted(state, inv, generation, lease, request, Some{child}) : Bool
      }
      selected

def root_provider_live_entry_exact(
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
  +lease: Nat,
  +request: Nat
) -> {
    O.provider_live(
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
      lease,
      request
    )
    == S.provider_live(
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
      lease,
      request
    )
    : Bool
  }:
  provider_live_lookup_exact(
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
    lease,
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
    provider_live_found_exact(
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
      lease,
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

def cleanup_provider_live_entry_exact(
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
  +lease: Nat,
  +request: Nat
) -> {
    O.provider_live(
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
      lease,
      request
    )
    == S.provider_live(
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
      lease,
      request
    )
    : Bool
  }:
  provider_live_lookup_exact(
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
    lease,
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
    provider_live_found_exact(
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
      lease,
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

def dispatch_provider_live_entry_exact(
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
  +lease: Nat,
  +request: Nat
) -> {
    O.provider_live(
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
      lease,
      request
    )
    == S.provider_live(
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
      lease,
      request
    )
    : Bool
  }:
  provider_live_lookup_exact(
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
    lease,
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
    provider_live_found_exact(
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
      lease,
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

def permission_scope_exact(+scope: O.Scope, +permission: O.EvaluationPermission) -> {
  O.evaluation_permission_scope(scope, permission)
  == S.permission_scope(scope, permission)
  : O.Scope
}:
  match scope:

    case O.EvaluationCleanupScope{_, _, _, _}: {==}

    case O.EvaluationDispatchScope{_, _, _}: {==}

    case O.EvaluationScope{_, _, _}: {==}

    case O.DeliveryScope{_, _, _, _, _}: {==}

    case O.SettingsScope{_}: {==}

    case O.FreshnessScope{_}: {==}

    case O.Scope{_, _, _, _}: {==}

    case O.SourceScope{_, _, _, _, _}: {==}

    case O.AfterSourceScope{_, _, _, _, _, _, _}: {==}

    case O.PreparationScope{_, _, _, _}: {==}

    case O.RetainingScope{_, _, _, _, _}: {==}

    case O.AdviceTailScope{_, _, _, _, _, _}: {==}

def commit_exact(
  +state: O.State,
  +child: O.Child,
  +permission: O.EvaluationPermission,
  +result: C.Step
) -> {
  O.evaluation_commit(state, child, permission, result)
  == S.commit(state, child, permission, result)
  : O.Step
}:
  match state child result:
    case O.State{_, next, next_lease, rest} O.Child{
      scope,
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent
    } C.Advanced{canon, outputs}:
      %permission_scope_exact(scope, permission) : {
        O.evaluation_commit(state, child, permission, result)
        == S.reconcile(O.Advanced{O.State{canon, next, next_lease, O.replace(inv, rest,
          O.Child{_, inv, epoch, handle, phase, pending, held, parent})}, outputs, Nil{}}) : O.Step
      }
      reconcile_exact(
        O.Advanced{
          O.State{
            canon,
            next,
            next_lease,
            O.replace(
              inv,
              rest,
              O.Child{
                O.evaluation_permission_scope(scope, permission),
                inv,
                epoch,
                handle,
                phase,
                pending,
                held,
                parent
              }
            )
          },
          outputs,
          Nil{}
        }
      )
    case O.State{_, _, _, _} O.Child{_, _, _, _, _, _, _, _} C.Rejected{_, _}: {==}

def ready_permission_exact(+outputs: List<&2, C.Output>) -> {
  O.evaluation_ready_permission(outputs) == S.ready_permission(outputs) : O.EvaluationPermission
}:
  match outputs:
    case Nil{}: {==}

    case C.ActionRequested{_} <> tail: ready_permission_exact(tail)

    case C.EventEstablished{C.CapacityGranted{_, _}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CapacityResized{_, _}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CapacityUnitAdmitted{_, _, _, _}} <> tail: ready_permission_exact(
      tail
    )
    case C.EventEstablished{C.PermitIssued{_, _}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CompletedEditSeen{_, _}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CompletedEditRemembered{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.QuietRoundBusy{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.QuietRoundWaiting{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.QuietRoundResetRecorded{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.PermitConsumed{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.PermitReleased{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.PermitExpired{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.PermitRoundClosed{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.RoundStarted{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ObservationAdmitted{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ObservationStarted{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ObservationCompleted{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ObservationInterrupted{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.UnitAdmitted{_, _, _, _, _}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.PreparationReleased{_, _}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReviewStarted{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.JevRequestIssued{_, _, _, _, request}} <> tail: {==}
    case C.EventEstablished{C.JevRequestStartRecorded{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.JevInterruptionRecorded{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.JevRequestOutcomeRecorded{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReservationReleased{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReviewRecorded{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.FindingRetained{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.FindingCountRecorded{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ClearSettled{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.StaleClearSettled{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.StaleFindingRetired{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.DispatchStarted{_, _}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.DispatchDiscarded{_, _}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.WaitForWork{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.FinishReady{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.FinishLimit{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.StopEnded{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CollectionEligible{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CollectionLeaseReserved{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CollectionLeaseReleased{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CollectionAdviceRetired{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CollectionBackgroundClaimed{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CollectionBackgroundReleased{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.FinishReserved{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.FinishReleased{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.FinishAuthorized{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.FinishRecorded{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.FinishEnded{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ContinuationConsumed{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.SubmissionBegun{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.SubmissionAuthorized{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.SubmissionRecorded{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.SubmissionReleased{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.SubmissionForgotten{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.RevisionReused{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.RevisionReplaced{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.RevisionReleased{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CleanupCommitted{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReuseAdviceJoined{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReusePendingJoined{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReuseClaimedJoined{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReuseCacheHit{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReuseOwned{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReuseClaimed{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReuseAttached{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReuseReleased{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CachePrepared{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CacheCommitted{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.CacheDiscarded{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.NoticeSuppressed{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.NoticePendingCreated{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.NoticePendingMerged{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.NoticeLeaseKept{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.NoticeCommitted{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.NoticePruned{_, _, _}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.NoticeDropped{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.NoticeLeased{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.NoticePendingCleared{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.WriteAuthorized{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.WriteRecorded{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.ReofferAtStop{}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.PartitionRetired{_}} <> tail: ready_permission_exact(tail)
    case C.EventEstablished{C.AdmissionForgotten{}} <> tail: ready_permission_exact(tail)

    case C.PolicyDecided{_} <> tail: ready_permission_exact(tail)

def ready_event_exact(+context: O.EvaluationContext, +facts: O.EvaluationFacts) -> {
  O.evaluation_ready_event(context, facts) == S.ready_event(context, facts) : C.CanonicalEvent
}:
  match context facts:
    case O.EvaluationContext{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

def ready_result_exact(+state: O.State, +child: O.Child, +result: C.Step) -> {
  O.evaluation_ready_result(state, child, result) == S.ready_result(state, child, result) : O.Step
}:
  match result:
    case C.Rejected{_, _}: {==}
    case C.Advanced{_, outputs}:
      %ready_permission_exact(outputs) : {
        O.evaluation_ready_result(state, child, result)
        == S.commit(state, child, _, result)
        : O.Step
      }
      commit_exact(state, child, O.evaluation_ready_permission(outputs), result)

def ready_transition_exact(
  +state: O.State,
  +child: O.Child,
  +context: O.EvaluationContext,
  +facts: O.EvaluationFacts
) -> {
  O.evaluation_ready_result(
    state,
    child,
    C.step(O.state_canonical(state), O.evaluation_ready_event(context, facts))
  )
  == S.ready_result(state, child, C.step(S.canonical(state), S.ready_event(context, facts)))
  : O.Step
}:
  match state:
    case O.State{canon, _, _, _}:
      %ready_event_exact(context, facts) : {
        O.evaluation_ready_result(
          state,
          child,
          C.step(canon, O.evaluation_ready_event(context, facts))
        )
        == S.ready_result(state, child, C.step(canon, _))
        : O.Step
      }
      ready_result_exact(state, child, C.step(canon, O.evaluation_ready_event(context, facts)))

def ready_child_exact(
  +valid: Bool,
  +state: O.State,
  +found: Maybe<&2, O.Child>,
  +facts: O.EvaluationFacts
) -> {
  O.evaluation_ready_found(valid, state, found, facts)
  == S.ready_child(valid, state, found, facts)
  : O.Step
}:
  match valid found facts:
    case False{} None{} O.EvaluationFacts{_, _, _, _, _, _}: {==}
    case False{} Some{O.Child{_, _, _, _, _, _, _, _}} O.EvaluationFacts{_, _, _, _, _, _}: {==}
    case True{} None{} O.EvaluationFacts{_, _, _, _, _, _}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, False{}, False{}, False{}, False{}}: ready_transition_exact(
      state,
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      context,
      facts
    )
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, False{}, False{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, False{}, False{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, False{}, False{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, False{}, True{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, False{}, True{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, False{}, True{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, False{}, True{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, True{}, False{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, True{}, False{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, True{}, False{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, True{}, False{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, True{}, True{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, True{}, True{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, True{}, True{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, False{}, True{}, True{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, False{}, False{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, False{}, False{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, False{}, False{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, False{}, False{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, False{}, True{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, False{}, True{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, False{}, True{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, False{}, True{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, True{}, False{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, True{}, False{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, True{}, False{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, True{}, False{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, True{}, True{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, True{}, True{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, True{}, True{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{False{}, True{}, True{}, True{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, False{}, False{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, False{}, False{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, False{}, False{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, False{}, False{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, False{}, True{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, False{}, True{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, False{}, True{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, False{}, True{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, True{}, False{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, True{}, False{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, True{}, False{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, True{}, False{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, True{}, True{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, True{}, True{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, True{}, True{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, False{}, True{}, True{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, False{}, False{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, False{}, False{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, False{}, False{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, False{}, False{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, False{}, True{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, False{}, True{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, False{}, True{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, False{}, True{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, True{}, False{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, True{}, False{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, True{}, False{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, True{}, False{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, True{}, True{}, False{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, True{}, True{}, False{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, True{}, True{}, True{}, False{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{True{}, True{}, True{}, True{}, True{}, True{}}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{_, _, context, O.EvaluationIssued{_}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{_, _, _, _, _, _}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{_, _, context, O.EvaluationAtProvider{_, _}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{_, _, _, _, _, _}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{_, _, context, O.EvaluationSettled{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{_, _, _, _, _, _}: {==}
    case True{} Some{O.Child{O.EvaluationDispatchScope{_, _, _}, _, _, _, _, _, _, _}} O.EvaluationFacts{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case True{} Some{
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{_, _, _, _, _, _}: ready_transition_exact(
      state,
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      context,
      facts
    )
    case True{} Some{
      O.Child{
        O.EvaluationScope{_, context, O.EvaluationIssued{_}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{_, _, _, _, _, _}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationScope{_, context, O.EvaluationAtProvider{_, _}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{_, _, _, _, _, _}: {==}
    case True{} Some{
      O.Child{
        O.EvaluationScope{_, context, O.EvaluationSettled{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    } O.EvaluationFacts{_, _, _, _, _, _}: {==}
    case True{} Some{O.Child{O.DeliveryScope{_, _, _, _, _}, _, _, _, _, _, _, _}} O.EvaluationFacts{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case True{} Some{O.Child{O.SettingsScope{_}, _, _, _, _, _, _, _}} O.EvaluationFacts{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case True{} Some{O.Child{O.FreshnessScope{_}, _, _, _, _, _, _, _}} O.EvaluationFacts{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case True{} Some{O.Child{O.Scope{_, _, _, _}, _, _, _, _, _, _, _}} O.EvaluationFacts{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case True{} Some{O.Child{O.SourceScope{_, _, _, _, _}, _, _, _, _, _, _, _}} O.EvaluationFacts{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case True{} Some{O.Child{O.AfterSourceScope{_, _, _, _, _, _, _}, _, _, _, _, _, _, _}} O.EvaluationFacts{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case True{} Some{O.Child{O.PreparationScope{_, _, _, _}, _, _, _, _, _, _, _}} O.EvaluationFacts{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case True{} Some{O.Child{O.RetainingScope{_, _, _, _, _}, _, _, _, _, _, _, _}} O.EvaluationFacts{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case True{} Some{O.Child{O.AdviceTailScope{_, _, _, _, _, _}, _, _, _, _, _, _, _}} O.EvaluationFacts{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}

def ready_foreign_scope(scope: O.Scope) -> Bool:
  match scope:
    case O.EvaluationScope{_, _, _}: False{}
    case O.EvaluationCleanupScope{_, _, _, _}: False{}
    case _: True{}


def ready_same_authority_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +child: O.Child,
  +facts: O.EvaluationFacts,
  live: {O.child_live(S.canonical(state), S.children(state), child) == S.live(state, child) : Bool}
) -> {
    O.evaluation_ready_found(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        Some{child}
      ),
      state,
      Some{child},
      facts
    )
    == S.ready_child(
      S.permitted(state, inv, generation, lease, request, Some{child}),
      state,
      Some{child},
      facts
    )
    : O.Step
  }:
  %provider_live_found_exact(state, inv, generation, lease, request, child, live) : {
    O.evaluation_ready_found(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        Some{child}
      ),
      state,
      Some{child},
      facts
    )
    == S.ready_child(_, state, Some{child}, facts)
    : O.Step
  }
  ready_child_exact(
    O.provider_permit_found(
      S.canonical(state),
      S.children(state),
      inv,
      generation,
      lease,
      request,
      Some{child}
    ),
    state,
    Some{child},
    facts
  )

def ready_non_evaluation_exact(
  +left: Bool,
  +right: Bool,
  +scope: O.Scope,
  +facts: O.EvaluationFacts,
  +state: O.State,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  unrelated: {ready_foreign_scope(scope) == True{} : Bool}
) -> {
    O.evaluation_ready_found(
      left,
      state,
      Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
      facts
    )
    == S.ready_child(
      right,
      state,
      Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
      facts
    )
    : O.Step
  }:
  match left right scope facts:

    case False{} False{} O.EvaluationCleanupScope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: Empty.absurd(
      {
        O.evaluation_ready_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        == S.ready_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case False{} False{} O.EvaluationDispatchScope{_, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} False{} O.EvaluationScope{_, _, _} O.EvaluationFacts{_, _, _, _, _, _}: Empty.absurd(
      {
        O.evaluation_ready_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        == S.ready_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case False{} False{} O.DeliveryScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} False{} O.SettingsScope{_} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} False{} O.FreshnessScope{_} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} False{} O.Scope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} False{} O.SourceScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} False{} O.AfterSourceScope{_, _, _, _, _, _, _} O.EvaluationFacts{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}

    case False{} False{} O.PreparationScope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} False{} O.RetainingScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} False{} O.AdviceTailScope{_, _, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} True{} O.EvaluationCleanupScope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: Empty.absurd(
      {
        O.evaluation_ready_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        == S.ready_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case False{} True{} O.EvaluationDispatchScope{_, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} True{} O.EvaluationScope{_, _, _} O.EvaluationFacts{_, _, _, _, _, _}: Empty.absurd(
      {
        O.evaluation_ready_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        == S.ready_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case False{} True{} O.DeliveryScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} True{} O.SettingsScope{_} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} True{} O.FreshnessScope{_} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} True{} O.Scope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} True{} O.SourceScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} True{} O.AfterSourceScope{_, _, _, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} True{} O.PreparationScope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} True{} O.RetainingScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case False{} True{} O.AdviceTailScope{_, _, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} False{} O.EvaluationCleanupScope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: Empty.absurd(
      {
        O.evaluation_ready_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        == S.ready_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case True{} False{} O.EvaluationDispatchScope{_, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} False{} O.EvaluationScope{_, _, _} O.EvaluationFacts{_, _, _, _, _, _}: Empty.absurd(
      {
        O.evaluation_ready_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        == S.ready_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case True{} False{} O.DeliveryScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} False{} O.SettingsScope{_} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} False{} O.FreshnessScope{_} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} False{} O.Scope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} False{} O.SourceScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} False{} O.AfterSourceScope{_, _, _, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} False{} O.PreparationScope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} False{} O.RetainingScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} False{} O.AdviceTailScope{_, _, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} True{} O.EvaluationCleanupScope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: Empty.absurd(
      {
        O.evaluation_ready_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        == S.ready_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case True{} True{} O.EvaluationDispatchScope{_, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} True{} O.EvaluationScope{_, _, _} O.EvaluationFacts{_, _, _, _, _, _}: Empty.absurd(
      {
        O.evaluation_ready_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        == S.ready_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          facts
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case True{} True{} O.DeliveryScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} True{} O.SettingsScope{_} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} True{} O.FreshnessScope{_} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} True{} O.Scope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} True{} O.SourceScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} True{} O.AfterSourceScope{_, _, _, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} True{} O.PreparationScope{_, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} True{} O.RetainingScope{_, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

    case True{} True{} O.AdviceTailScope{_, _, _, _, _, _} O.EvaluationFacts{_, _, _, _, _, _}: {==}

def ready_found_exact(
  +state: O.State,
  +found: Maybe<&2, O.Child>,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +facts: O.EvaluationFacts
) -> {
  O.evaluation_ready_found(
    O.provider_permit_found(
      S.canonical(state),
      S.children(state),
      inv,
      generation,
      lease,
      request,
      found
    ),
    state,
    found,
    facts
  )
  == S.ready_child(S.permitted(state, inv, generation, lease, request, found), state, found, facts)
  : O.Step
}:
  match found:
    case None{}: ready_child_exact(False{}, state, None{}, facts)

    case Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: ready_same_authority_exact(
      state,
      inv,
      generation,
      lease,
      request,
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      facts,
      live_from_scope_exact(
        state,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          actual,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        cleanup_scope_live_exact(
          state,
          operation,
          context,
          permission,
          origin,
          0n,
          actual,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )

    case Some{
      O.Child{
        O.EvaluationDispatchScope{v0, v1, v2},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: ready_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.EvaluationDispatchScope{v0, v1, v2},
      facts,
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.EvaluationScope{operation, context, permission},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: ready_same_authority_exact(
      state,
      inv,
      generation,
      lease,
      request,
      O.Child{
        O.EvaluationScope{operation, context, permission},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      facts,
      live_from_scope_exact(
        state,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          actual,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        root_scope_live_exact(
          state,
          operation,
          context,
          permission,
          0n,
          0n,
          actual,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )

    case Some{
      O.Child{
        O.DeliveryScope{v0, v1, v2, v3, v4},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: ready_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.DeliveryScope{v0, v1, v2, v3, v4},
      facts,
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{O.Child{O.SettingsScope{v0}, actual, epoch, handle, phase, pending, held, parent}}: ready_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.SettingsScope{v0},
      facts,
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{O.Child{O.FreshnessScope{v0}, actual, epoch, handle, phase, pending, held, parent}}: ready_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.FreshnessScope{v0},
      facts,
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{O.Scope{v0, v1, v2, v3}, actual, epoch, handle, phase, pending, held, parent}
    }: ready_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.Scope{v0, v1, v2, v3},
      facts,
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.SourceScope{v0, v1, v2, v3, v4},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: ready_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.SourceScope{v0, v1, v2, v3, v4},
      facts,
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.AfterSourceScope{v0, v1, v2, v3, v4, v5, v6},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: ready_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.AfterSourceScope{v0, v1, v2, v3, v4, v5, v6},
      facts,
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.PreparationScope{v0, v1, v2, v3},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: ready_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.PreparationScope{v0, v1, v2, v3},
      facts,
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.RetainingScope{v0, v1, v2, v3, v4},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: ready_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.RetainingScope{v0, v1, v2, v3, v4},
      facts,
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.AdviceTailScope{v0, v1, v2, v3, v4, v5},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: ready_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.AdviceTailScope{v0, v1, v2, v3, v4, v5},
      facts,
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

def evaluation_ready_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +facts: O.EvaluationFacts
) -> {
  O.evaluation_ready(state, inv, generation, lease, request, facts)
  == S.evaluation_ready(state, inv, generation, lease, request, facts)
  : O.Step
}:
  match state:
    case O.State{_, _, _, rest}: ready_found_exact(
      state,
      O.find(inv, rest),
      inv,
      generation,
      lease,
      request,
      facts
    )

def settle_event_exact(
  +context: O.EvaluationContext,
  +request: Nat,
  +outcome: C.RequestOutcome,
  +current: Bool
) -> {
  O.evaluation_settle_event(context, request, outcome, current)
  == S.settle_event(context, request, outcome, current)
  : C.CanonicalEvent
}:
  match context:
    case O.EvaluationContext{_, _, _, _}: {==}

def settle_transition_exact(+state: O.State, +child: O.Child, +context: O.EvaluationContext,
  +request: Nat, +outcome: C.RequestOutcome, +current: Bool) -> {
    O.evaluation_commit(
      state,
      child,
      O.EvaluationSettled{},
      C.step(
        O.state_canonical(state),
        O.evaluation_settle_event(context, request, outcome, current)
      )
    )
    == S.commit(
      state,
      child,
      O.EvaluationSettled{},
      C.step(S.canonical(state), S.settle_event(context, request, outcome, current))
    )
    : O.Step
  }:
  match state:
    case O.State{canon, _, _, _}:
      %settle_event_exact(context, request, outcome, current) : {
        O.evaluation_commit(
          state,
          child,
          O.EvaluationSettled{},
          C.step(canon, O.evaluation_settle_event(context, request, outcome, current))
        )
        == S.commit(state, child, O.EvaluationSettled{}, C.step(canon, _))
        : O.Step
      }
      commit_exact(
        state,
        child,
        O.EvaluationSettled{},
        C.step(canon, O.evaluation_settle_event(context, request, outcome, current))
      )

def cleanup_settle_exact(
  +state: O.State,
  +child: O.Child,
  +context: O.EvaluationContext,
  +request: Nat,
  +outcome: C.RequestOutcome
) -> {
  O.evaluation_cleanup_settle(state, child, context, request, outcome)
  == S.cleanup_settle(state, child, context, request, outcome)
  : O.Step
}:
  match outcome:
    case C.RequestFinding{}: {==}
    case C.RequestClear{}: {==}

    case C.NeverSent{}: settle_transition_exact(state, child, context, request, outcome, False{})

    case C.RequestBackendFailure{}: settle_transition_exact(
      state,
      child,
      context,
      request,
      outcome,
      False{}
    )

    case C.RequestTimeout{}: settle_transition_exact(
      state,
      child,
      context,
      request,
      outcome,
      False{}
    )

    case C.RequestInterrupted{}: settle_transition_exact(
      state,
      child,
      context,
      request,
      outcome,
      False{}
    )

def settle_child_exact(
  +valid: Bool,
  +state: O.State,
  +found: Maybe<&2, O.Child>,
  +outcome: C.RequestOutcome,
  +current: Bool
) -> {
  O.evaluation_settle_found(valid, state, found, outcome, current)
  == S.settle_child(valid, state, found, outcome, current)
  : O.Step
}:
  match valid found:
    case False{} None{}: {==}
    case False{} Some{O.Child{_, _, _, _, _, _, _, _}}: {==}
    case True{} None{}: {==}

    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: {==}

    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationIssued{request}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: cleanup_settle_exact(
      state,
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationIssued{request}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      context,
      request,
      outcome
    )

    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{
          operation,
          origin,
          context,
          O.EvaluationAtProvider{request, authority}
        },
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: {==}

    case True{} Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, O.EvaluationSettled{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: {==}

    case True{} Some{O.Child{O.EvaluationDispatchScope{_, _, _}, _, _, _, _, _, _, _}}: {==}

    case True{} Some{
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationUnissued{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: {==}

    case True{} Some{
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationIssued{request}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: settle_transition_exact(
      state,
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationIssued{request}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      context,
      request,
      outcome,
      current
    )

    case True{} Some{
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationAtProvider{request, authority}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: settle_transition_exact(
      state,
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationAtProvider{request, authority}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      context,
      request,
      outcome,
      current
    )

    case True{} Some{
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationSettled{}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: {==}

    case True{} Some{O.Child{O.DeliveryScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case True{} Some{O.Child{O.SettingsScope{_}, _, _, _, _, _, _, _}}: {==}

    case True{} Some{O.Child{O.FreshnessScope{_}, _, _, _, _, _, _, _}}: {==}

    case True{} Some{O.Child{O.Scope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case True{} Some{O.Child{O.SourceScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case True{} Some{O.Child{O.AfterSourceScope{_, _, _, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case True{} Some{O.Child{O.PreparationScope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case True{} Some{O.Child{O.RetainingScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case True{} Some{O.Child{O.AdviceTailScope{_, _, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

def settle_same_authority_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +child: O.Child,
  +outcome: C.RequestOutcome,
  +current: Bool,
  live: {O.child_live(S.canonical(state), S.children(state), child) == S.live(state, child) : Bool}
) -> {
    O.evaluation_settle_found(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        Some{child}
      ),
      state,
      Some{child},
      outcome,
      current
    )
    == S.settle_child(
      S.permitted(state, inv, generation, lease, request, Some{child}),
      state,
      Some{child},
      outcome,
      current
    )
    : O.Step
  }:
  %provider_live_found_exact(state, inv, generation, lease, request, child, live) : {
    O.evaluation_settle_found(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        Some{child}
      ),
      state,
      Some{child},
      outcome,
      current
    )
    == S.settle_child(_, state, Some{child}, outcome, current)
    : O.Step
  }
  settle_child_exact(
    O.provider_permit_found(
      S.canonical(state),
      S.children(state),
      inv,
      generation,
      lease,
      request,
      Some{child}
    ),
    state,
    Some{child},
    outcome,
    current
  )

def settle_non_evaluation_exact(
  +left: Bool,
  +right: Bool,
  +scope: O.Scope,
  +state: O.State,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +outcome: C.RequestOutcome,
  +current: Bool,
  unrelated: {ready_foreign_scope(scope) == True{} : Bool}
) -> {
    O.evaluation_settle_found(
      left,
      state,
      Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
      outcome,
      current
    )
    == S.settle_child(
      right,
      state,
      Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
      outcome,
      current
    )
    : O.Step
  }:
  match left right scope:

    case False{} False{} O.EvaluationCleanupScope{_, _, _, _}: Empty.absurd(
      {
        O.evaluation_settle_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        == S.settle_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case False{} False{} O.EvaluationDispatchScope{_, _, _}: {==}

    case False{} False{} O.EvaluationScope{_, _, _}: Empty.absurd(
      {
        O.evaluation_settle_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        == S.settle_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case False{} False{} O.DeliveryScope{_, _, _, _, _}: {==}

    case False{} False{} O.SettingsScope{_}: {==}

    case False{} False{} O.FreshnessScope{_}: {==}

    case False{} False{} O.Scope{_, _, _, _}: {==}

    case False{} False{} O.SourceScope{_, _, _, _, _}: {==}

    case False{} False{} O.AfterSourceScope{_, _, _, _, _, _, _}: {==}

    case False{} False{} O.PreparationScope{_, _, _, _}: {==}

    case False{} False{} O.RetainingScope{_, _, _, _, _}: {==}

    case False{} False{} O.AdviceTailScope{_, _, _, _, _, _}: {==}

    case False{} True{} O.EvaluationCleanupScope{_, _, _, _}: Empty.absurd(
      {
        O.evaluation_settle_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        == S.settle_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case False{} True{} O.EvaluationDispatchScope{_, _, _}: {==}

    case False{} True{} O.EvaluationScope{_, _, _}: Empty.absurd(
      {
        O.evaluation_settle_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        == S.settle_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case False{} True{} O.DeliveryScope{_, _, _, _, _}: {==}

    case False{} True{} O.SettingsScope{_}: {==}

    case False{} True{} O.FreshnessScope{_}: {==}

    case False{} True{} O.Scope{_, _, _, _}: {==}

    case False{} True{} O.SourceScope{_, _, _, _, _}: {==}

    case False{} True{} O.AfterSourceScope{_, _, _, _, _, _, _}: {==}

    case False{} True{} O.PreparationScope{_, _, _, _}: {==}

    case False{} True{} O.RetainingScope{_, _, _, _, _}: {==}

    case False{} True{} O.AdviceTailScope{_, _, _, _, _, _}: {==}

    case True{} False{} O.EvaluationCleanupScope{_, _, _, _}: Empty.absurd(
      {
        O.evaluation_settle_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        == S.settle_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case True{} False{} O.EvaluationDispatchScope{_, _, _}: {==}

    case True{} False{} O.EvaluationScope{_, _, _}: Empty.absurd(
      {
        O.evaluation_settle_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        == S.settle_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case True{} False{} O.DeliveryScope{_, _, _, _, _}: {==}

    case True{} False{} O.SettingsScope{_}: {==}

    case True{} False{} O.FreshnessScope{_}: {==}

    case True{} False{} O.Scope{_, _, _, _}: {==}

    case True{} False{} O.SourceScope{_, _, _, _, _}: {==}

    case True{} False{} O.AfterSourceScope{_, _, _, _, _, _, _}: {==}

    case True{} False{} O.PreparationScope{_, _, _, _}: {==}

    case True{} False{} O.RetainingScope{_, _, _, _, _}: {==}

    case True{} False{} O.AdviceTailScope{_, _, _, _, _, _}: {==}

    case True{} True{} O.EvaluationCleanupScope{_, _, _, _}: Empty.absurd(
      {
        O.evaluation_settle_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        == S.settle_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case True{} True{} O.EvaluationDispatchScope{_, _, _}: {==}

    case True{} True{} O.EvaluationScope{_, _, _}: Empty.absurd(
      {
        O.evaluation_settle_found(
          left,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        == S.settle_child(
          right,
          state,
          Some{O.Child{scope, inv, epoch, handle, phase, pending, held, parent}},
          outcome,
          current
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case True{} True{} O.DeliveryScope{_, _, _, _, _}: {==}

    case True{} True{} O.SettingsScope{_}: {==}

    case True{} True{} O.FreshnessScope{_}: {==}

    case True{} True{} O.Scope{_, _, _, _}: {==}

    case True{} True{} O.SourceScope{_, _, _, _, _}: {==}

    case True{} True{} O.AfterSourceScope{_, _, _, _, _, _, _}: {==}

    case True{} True{} O.PreparationScope{_, _, _, _}: {==}

    case True{} True{} O.RetainingScope{_, _, _, _, _}: {==}

    case True{} True{} O.AdviceTailScope{_, _, _, _, _, _}: {==}

def settle_found_exact(
  +state: O.State,
  +found: Maybe<&2, O.Child>,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +outcome: C.RequestOutcome,
  +current: Bool
) -> {
  O.evaluation_settle_found(
    O.provider_permit_found(
      S.canonical(state),
      S.children(state),
      inv,
      generation,
      lease,
      request,
      found
    ),
    state,
    found,
    outcome,
    current
  )
  == S.settle_child(
    S.permitted(state, inv, generation, lease, request, found),
    state,
    found,
    outcome,
    current
  )
  : O.Step
}:
  match found:
    case None{}: settle_child_exact(False{}, state, None{}, outcome, current)

    case Some{
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: settle_same_authority_exact(
      state,
      inv,
      generation,
      lease,
      request,
      O.Child{
        O.EvaluationCleanupScope{operation, origin, context, permission},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      outcome,
      current,
      live_from_scope_exact(
        state,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          actual,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        cleanup_scope_live_exact(
          state,
          operation,
          context,
          permission,
          origin,
          0n,
          actual,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )

    case Some{
      O.Child{
        O.EvaluationDispatchScope{v0, v1, v2},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: settle_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.EvaluationDispatchScope{v0, v1, v2},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      outcome,
      current,
      {==}
    )

    case Some{
      O.Child{
        O.EvaluationScope{operation, context, permission},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: settle_same_authority_exact(
      state,
      inv,
      generation,
      lease,
      request,
      O.Child{
        O.EvaluationScope{operation, context, permission},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      outcome,
      current,
      live_from_scope_exact(
        state,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          actual,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        root_scope_live_exact(
          state,
          operation,
          context,
          permission,
          0n,
          0n,
          actual,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      )
    )

    case Some{
      O.Child{
        O.DeliveryScope{v0, v1, v2, v3, v4},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: settle_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.DeliveryScope{v0, v1, v2, v3, v4},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      outcome,
      current,
      {==}
    )

    case Some{O.Child{O.SettingsScope{v0}, actual, epoch, handle, phase, pending, held, parent}}: settle_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.SettingsScope{v0},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      outcome,
      current,
      {==}
    )

    case Some{O.Child{O.FreshnessScope{v0}, actual, epoch, handle, phase, pending, held, parent}}: settle_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.FreshnessScope{v0},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      outcome,
      current,
      {==}
    )

    case Some{
      O.Child{O.Scope{v0, v1, v2, v3}, actual, epoch, handle, phase, pending, held, parent}
    }: settle_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.Scope{v0, v1, v2, v3},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      outcome,
      current,
      {==}
    )

    case Some{
      O.Child{
        O.SourceScope{v0, v1, v2, v3, v4},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: settle_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.SourceScope{v0, v1, v2, v3, v4},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      outcome,
      current,
      {==}
    )

    case Some{
      O.Child{
        O.AfterSourceScope{v0, v1, v2, v3, v4, v5, v6},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: settle_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.AfterSourceScope{v0, v1, v2, v3, v4, v5, v6},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      outcome,
      current,
      {==}
    )

    case Some{
      O.Child{
        O.PreparationScope{v0, v1, v2, v3},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: settle_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.PreparationScope{v0, v1, v2, v3},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      outcome,
      current,
      {==}
    )

    case Some{
      O.Child{
        O.RetainingScope{v0, v1, v2, v3, v4},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: settle_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.RetainingScope{v0, v1, v2, v3, v4},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      outcome,
      current,
      {==}
    )

    case Some{
      O.Child{
        O.AdviceTailScope{v0, v1, v2, v3, v4, v5},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: settle_non_evaluation_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.AdviceTailScope{v0, v1, v2, v3, v4, v5},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      outcome,
      current,
      {==}
    )

def evaluation_settle_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +outcome: C.RequestOutcome,
  +current: Bool
) -> {
  O.evaluation_settle(state, inv, generation, lease, request, outcome, current)
  == S.evaluation_settle(state, inv, generation, lease, request, outcome, current) : O.Step
}:
  match state:
    case O.State{_, _, _, rest}: settle_found_exact(
      state,
      O.find(inv, rest),
      inv,
      generation,
      lease,
      request,
      outcome,
      current
    )

def provider_install_issued_exact(
  +state: O.State,
  +operation: Nat,
  +context: O.EvaluationContext,
  +jev: Nat,
  +inv: Nat,
  +epoch: Nat,
  +old_handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +handle: Nat,
  +request: Nat
) -> {
    O.evaluation_provider_child(
      state,
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
        inv,
        epoch,
        old_handle,
        phase,
        pending,
        held,
        parent
      },
      generation,
      handle,
      request
    )
    == S.provider_install_found(
      state,
      Some{
        O.Child{
          O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          parent
        }
      },
      generation,
      handle,
      request
    )
    : O.Step
  }:
  match state:
    case O.State{canon, _, _, rest}:
      %install_matches_exact(
        O.Child{
          O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          parent
        },
        generation
      ) : {
        O.evaluation_provider_child(
          state,
          O.Child{
            O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
            inv,
            epoch,
            old_handle,
            phase,
            pending,
            held,
            parent
          },
          generation,
          handle,
          request
        )
        == S.installed(
          Bool.and(
            _,
            Bool.and(
              S.live(
                state,
                O.Child{
                  O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
                  inv,
                  epoch,
                  old_handle,
                  phase,
                  pending,
                  held,
                  parent
                }
              ),
              S.pending_dispatch(canon, context, jev)
            )
          ),
          state,
          O.Child{
            O.EvaluationScope{
              operation,
              context,
              O.EvaluationAtProvider{jev, O.Parent{inv, generation, request}}
            },
            inv,
            epoch,
            old_handle,
            phase,
            pending,
            held,
            parent
          },
          handle,
          request
        )
        : O.Step
      }
      %live_from_scope_exact(
        state,
        O.Child{
          O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          parent
        },
        root_scope_live_exact(
          state,
          operation,
          context,
          O.EvaluationIssued{jev},
          0n,
          0n,
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          parent
        )
      ) : {
        O.evaluation_provider_child(
          state,
          O.Child{
            O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
            inv,
            epoch,
            old_handle,
            phase,
            pending,
            held,
            parent
          },
          generation,
          handle,
          request
        )
        == S.installed(
          Bool.and(
            O.install_matches(
              O.Child{
                O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
                inv,
                epoch,
                old_handle,
                phase,
                pending,
                held,
                parent
              },
              generation
            ),
            Bool.and(_, S.pending_dispatch(canon, context, jev))
          ),
          state,
          O.Child{
            O.EvaluationScope{
              operation,
              context,
              O.EvaluationAtProvider{jev, O.Parent{inv, generation, request}}
            },
            inv,
            epoch,
            old_handle,
            phase,
            pending,
            held,
            parent
          },
          handle,
          request
        )
        : O.Step
      }
      %pending_dispatch_exact(canon, context, jev) : {
        O.evaluation_provider_child(
          state,
          O.Child{
            O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
            inv,
            epoch,
            old_handle,
            phase,
            pending,
            held,
            parent
          },
          generation,
          handle,
          request
        )
        == S.installed(
          Bool.and(
            O.install_matches(
              O.Child{
                O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
                inv,
                epoch,
                old_handle,
                phase,
                pending,
                held,
                parent
              },
              generation
            ),
            Bool.and(
              O.child_live(
                canon,
                rest,
                O.Child{
                  O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
                  inv,
                  epoch,
                  old_handle,
                  phase,
                  pending,
                  held,
                  parent
                }
              ),
              _
            )
          ),
          state,
          O.Child{
            O.EvaluationScope{
              operation,
              context,
              O.EvaluationAtProvider{jev, O.Parent{inv, generation, request}}
            },
            inv,
            epoch,
            old_handle,
            phase,
            pending,
            held,
            parent
          },
          handle,
          request
        )
        : O.Step
      }
      installed_exact(
        Bool.and(
          O.install_matches(
            O.Child{
              O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
              inv,
              epoch,
              old_handle,
              phase,
              pending,
              held,
              parent
            },
            generation
          ),
          Bool.and(
            O.child_live(
              canon,
              rest,
              O.Child{
                O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
                inv,
                epoch,
                old_handle,
                phase,
                pending,
                held,
                parent
              }
            ),
            O.evaluation_dispatch_pending(canon, context, jev)
          )
        ),
        state,
        O.Child{
          O.EvaluationScope{
            operation,
            context,
            O.EvaluationAtProvider{jev, O.Parent{inv, generation, request}}
          },
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          parent
        },
        handle,
        request
      )

def provider_install_found_exact(
  +state: O.State,
  +found: Maybe<&2, O.Child>,
  +generation: Nat,
  +handle: Nat,
  +request: Nat
) -> {
  O.evaluation_provider_found(state, found, generation, handle, request)
  == S.provider_install_found(state, found, generation, handle, request) : O.Step
}:
  match found:
    case None{}: {==}
    case Some{
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationIssued{jev}},
        inv,
        epoch,
        old_handle,
        phase,
        pending,
        held,
        parent
      }
    }: provider_install_issued_exact(
      state,
      operation,
      context,
      jev,
      inv,
      epoch,
      old_handle,
      phase,
      pending,
      held,
      parent,
      generation,
      handle,
      request
    )

    case Some{O.Child{O.EvaluationScope{_, _, O.EvaluationUnissued{}}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.EvaluationScope{_, _, O.EvaluationAtProvider{_, _}}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.EvaluationScope{_, _, O.EvaluationSettled{}}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.EvaluationCleanupScope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.EvaluationDispatchScope{_, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.DeliveryScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.SettingsScope{_}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.FreshnessScope{_}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.Scope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.SourceScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.AfterSourceScope{_, _, _, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.PreparationScope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.RetainingScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.AdviceTailScope{_, _, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

def install_evaluation_provider_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +handle: Nat,
  +request: Nat
) -> {
  O.install_evaluation_provider(state, inv, generation, handle, request)
  == S.install_evaluation_provider(state, inv, generation, handle, request) : O.Step
}:
  match state:
    case O.State{_, _, _, rest}: provider_install_found_exact(
      state,
      O.find(inv, rest),
      generation,
      handle,
      request
    )

def no_work_exact(
  +found: Maybe<&2, C.Work>
) -> {O.evaluation_no_work(found) == S.no_work(found) : Bool}:
  match found:
    case None{}: {==}
    case Some{_}: {==}

def idle_exact(
  +canon: C.State,
  +context: O.EvaluationContext
) -> {O.evaluation_idle(canon, context) == S.idle(canon, context) : Bool}:
  match canon context:
    case C.State{_, _, work, _, _, _, D.State{_, _, _, _, requests}, _, _} O.EvaluationContext{
      p,
      l,
      r,
      o
    }:
      %no_work_exact(C.find_work(p, l, r, o, work)) : {
        O.evaluation_idle(canon, context)
        == Bool.and(Bool.not(D.request_for_work(requests, o)), _)
        : Bool
      }
      {==}

def complete_scope_exact(+canon: C.State, +scope: O.Scope) -> {
  O.evaluation_complete_scope(canon, scope) == S.complete_scope(canon, scope) : Bool
}:
  match scope:

    case O.EvaluationCleanupScope{_, _, context, O.EvaluationUnissued{}}: idle_exact(canon, context)

    case O.EvaluationCleanupScope{_, _, context, O.EvaluationIssued{_}}: {==}

    case O.EvaluationCleanupScope{_, _, context, O.EvaluationAtProvider{_, _}}: {==}

    case O.EvaluationCleanupScope{_, _, context, O.EvaluationSettled{}}: {==}

    case O.EvaluationDispatchScope{_, _, _}: {==}

    case O.EvaluationScope{_, context, O.EvaluationUnissued{}}: idle_exact(canon, context)

    case O.EvaluationScope{_, context, O.EvaluationIssued{_}}: {==}

    case O.EvaluationScope{_, context, O.EvaluationAtProvider{_, _}}: {==}

    case O.EvaluationScope{_, context, O.EvaluationSettled{}}: {==}

    case O.DeliveryScope{_, _, _, _, _}: {==}

    case O.SettingsScope{_}: {==}

    case O.FreshnessScope{_}: {==}

    case O.Scope{_, _, _, _}: {==}

    case O.SourceScope{_, _, _, _, _}: {==}

    case O.AfterSourceScope{_, _, _, _, _, _, _}: {==}

    case O.PreparationScope{_, _, _, _}: {==}

    case O.RetainingScope{_, _, _, _, _}: {==}

    case O.AdviceTailScope{_, _, _, _, _, _}: {==}

def complete_from_live_exact(
  +state: O.State,
  +child: O.Child,
  +generation: Nat,
  +result: Nat,
  live: {O.child_live(S.canonical(state), S.children(state), child) == S.live(state, child) : Bool}
) -> {
    O.complete_evaluation_found(state, Some{child}, generation, result)
    == S.complete_found(state, Some{child}, generation, result)
    : O.Step
  }:
  match state child:
    case O.State{canon, _, _, rest} O.Child{scope, _, _, _, _, _, _, _}:
      %complete_scope_exact(canon, scope) : {
        O.complete_evaluation_found(state, Some{child}, generation, result)
        == S.accepted(
          Bool.and(_, Bool.and(S.live(state, child), S.installable(child, generation))),
          state,
          child,
          result
        )
        : O.Step
      }
      %live : {
        O.complete_evaluation_found(state, Some{child}, generation, result)
        == S.accepted(
          Bool.and(
            O.evaluation_complete_scope(canon, scope),
            Bool.and(_, S.installable(child, generation))
          ),
          state,
          child,
          result
        )
        : O.Step
      }
      %install_matches_exact(child, generation) : {
        O.complete_evaluation_found(state, Some{child}, generation, result)
        == S.accepted(
          Bool.and(
            O.evaluation_complete_scope(canon, scope),
            Bool.and(O.child_live(canon, rest, child), _)
          ),
          state,
          child,
          result
        )
        : O.Step
      }
      accepted_exact(
        Bool.and(
          O.evaluation_complete_scope(canon, scope),
          Bool.and(O.child_live(canon, rest, child), O.install_matches(child, generation))
        ),
        state,
        child,
        result
      )

def complete_found_exact(
  +state: O.State,
  +found: Maybe<&2, O.Child>,
  +generation: Nat,
  +result: Nat
) -> {
  O.complete_evaluation_found(state, found, generation, result)
  == S.complete_found(state, found, generation, result)
  : O.Step
}:
  match found:
    case None{}: {==}

    case Some{
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
    }: complete_from_live_exact(
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
      },
      generation,
      result,
      live_from_scope_exact(
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
        },
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

    case Some{
      O.Child{
        O.EvaluationDispatchScope{v0, v1, v2},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: accepted_exact(
      False{},
      state,
      O.Child{
        O.EvaluationDispatchScope{v0, v1, v2},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      result
    )

    case Some{
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
    }: complete_from_live_exact(
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
      },
      generation,
      result,
      live_from_scope_exact(
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
        },
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

    case Some{
      O.Child{O.DeliveryScope{v0, v1, v2, v3, v4}, inv, epoch, handle, phase, pending, held, parent}
    }: accepted_exact(
      False{},
      state,
      O.Child{
        O.DeliveryScope{v0, v1, v2, v3, v4},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      result
    )

    case Some{O.Child{O.SettingsScope{v0}, inv, epoch, handle, phase, pending, held, parent}}: accepted_exact(
      False{},
      state,
      O.Child{O.SettingsScope{v0}, inv, epoch, handle, phase, pending, held, parent},
      result
    )

    case Some{O.Child{O.FreshnessScope{v0}, inv, epoch, handle, phase, pending, held, parent}}: accepted_exact(
      False{},
      state,
      O.Child{O.FreshnessScope{v0}, inv, epoch, handle, phase, pending, held, parent},
      result
    )

    case Some{O.Child{O.Scope{v0, v1, v2, v3}, inv, epoch, handle, phase, pending, held, parent}}: accepted_exact(
      False{},
      state,
      O.Child{O.Scope{v0, v1, v2, v3}, inv, epoch, handle, phase, pending, held, parent},
      result
    )

    case Some{
      O.Child{O.SourceScope{v0, v1, v2, v3, v4}, inv, epoch, handle, phase, pending, held, parent}
    }: accepted_exact(
      False{},
      state,
      O.Child{O.SourceScope{v0, v1, v2, v3, v4}, inv, epoch, handle, phase, pending, held, parent},
      result
    )

    case Some{
      O.Child{
        O.AfterSourceScope{v0, v1, v2, v3, v4, v5, v6},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: accepted_exact(
      False{},
      state,
      O.Child{
        O.AfterSourceScope{v0, v1, v2, v3, v4, v5, v6},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      result
    )

    case Some{
      O.Child{O.PreparationScope{v0, v1, v2, v3}, inv, epoch, handle, phase, pending, held, parent}
    }: accepted_exact(
      False{},
      state,
      O.Child{O.PreparationScope{v0, v1, v2, v3}, inv, epoch, handle, phase, pending, held, parent},
      result
    )

    case Some{
      O.Child{
        O.RetainingScope{v0, v1, v2, v3, v4},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: accepted_exact(
      False{},
      state,
      O.Child{
        O.RetainingScope{v0, v1, v2, v3, v4},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      result
    )

    case Some{
      O.Child{
        O.AdviceTailScope{v0, v1, v2, v3, v4, v5},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: accepted_exact(
      False{},
      state,
      O.Child{
        O.AdviceTailScope{v0, v1, v2, v3, v4, v5},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      },
      result
    )

def complete_evaluation_exact(+state: O.State, +inv: Nat, +generation: Nat, +result: Nat) -> {
  O.complete_evaluation(state, inv, generation, result)
  == S.complete_evaluation(state, inv, generation, result)
  : O.Step
}:
  match state:
    case O.State{_, _, _, rest}: complete_found_exact(state, O.find(inv, rest), generation, result)

def cleanup_claimed_exact(+origin: Nat, +rest: List<&2, O.Child>) -> {
  O.evaluation_cleanup_claimed(origin, rest) == S.cleanup_claimed(origin, rest) : Bool
}:
  match rest:
    case Nil{}: {==}
    case O.Child{O.EvaluationCleanupScope{_, other, _, _}, _, _, _, phase, _, _, _} <> tail:
      %active_exact(phase) : {
        O.evaluation_cleanup_claimed(origin, rest)
        == Bool.or(Bool.and(Nat.is_eq(origin, other), _), S.cleanup_claimed(origin, tail)) : Bool
      }
      %cleanup_claimed_exact(origin, tail) : {
        O.evaluation_cleanup_claimed(origin, rest)
        == Bool.or(Bool.and(Nat.is_eq(origin, other), O.active(phase)), _) : Bool
      }
      {==}

    case O.Child{O.EvaluationDispatchScope{_, _, _}, _, _, _, _, _, _, _} <> tail: cleanup_claimed_exact(
      origin,
      tail
    )

    case O.Child{O.EvaluationScope{_, _, _}, _, _, _, _, _, _, _} <> tail: cleanup_claimed_exact(
      origin,
      tail
    )

    case O.Child{O.DeliveryScope{_, _, _, _, _}, _, _, _, _, _, _, _} <> tail: cleanup_claimed_exact(
      origin,
      tail
    )

    case O.Child{O.SettingsScope{_}, _, _, _, _, _, _, _} <> tail: cleanup_claimed_exact(
      origin,
      tail
    )

    case O.Child{O.FreshnessScope{_}, _, _, _, _, _, _, _} <> tail: cleanup_claimed_exact(
      origin,
      tail
    )

    case O.Child{O.Scope{_, _, _, _}, _, _, _, _, _, _, _} <> tail: cleanup_claimed_exact(
      origin,
      tail
    )

    case O.Child{O.SourceScope{_, _, _, _, _}, _, _, _, _, _, _, _} <> tail: cleanup_claimed_exact(
      origin,
      tail
    )

    case O.Child{O.AfterSourceScope{_, _, _, _, _, _, _}, _, _, _, _, _, _, _} <> tail: cleanup_claimed_exact(
      origin,
      tail
    )

    case O.Child{O.PreparationScope{_, _, _, _}, _, _, _, _, _, _, _} <> tail: cleanup_claimed_exact(
      origin,
      tail
    )

    case O.Child{O.RetainingScope{_, _, _, _, _}, _, _, _, _, _, _, _} <> tail: cleanup_claimed_exact(
      origin,
      tail
    )

    case O.Child{O.AdviceTailScope{_, _, _, _, _, _}, _, _, _, _, _, _, _} <> tail: cleanup_claimed_exact(
      origin,
      tail
    )

def cleanup_issued_exact(+request: Nat, +found: Maybe<&2, D.Request>) -> {
  O.evaluation_cleanup_pending(request, found)
  == S.cleanup_issued(request, found)
  : O.EvaluationPermission
}:
  match found:
    case None{}: {==}
    case Some{_}: {==}

def cleanup_permission_exact(
  +canon: C.State,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission
) -> {
  O.evaluation_cleanup_permission(canon, context, permission)
  == S.cleanup_permission(canon, context, permission)
  : O.EvaluationPermission
}:
  match permission:
    case O.EvaluationUnissued{}: {==}
    case O.EvaluationSettled{}: {==}
    case O.EvaluationIssued{request}:
      %request_exact(canon, context, request) : {
        O.evaluation_cleanup_permission(canon, context, permission)
        == S.cleanup_issued(request, _)
        : O.EvaluationPermission
      }
      cleanup_issued_exact(request, O.evaluation_request(canon, context, request))
    case O.EvaluationAtProvider{request, _}:
      %request_exact(canon, context, request) : {
        O.evaluation_cleanup_permission(canon, context, permission)
        == S.cleanup_issued(request, _)
        : O.EvaluationPermission
      }
      cleanup_issued_exact(request, O.evaluation_request(canon, context, request))

def cleanup_birth_exact(
  +state: O.State,
  +origin: Nat,
  +input: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission
) -> {
  O.evaluation_cleanup_found(
    state,
    origin,
    input,
    Some{
      O.Child{
        O.EvaluationScope{0n, context, permission},
        0n,
        0n,
        0n,
        O.ChildCancelled{},
        None{},
        None{},
        None{}
      }
    }
  )
  == S.cleanup_found(
    state,
    origin,
    input,
    Some{
      O.Child{
        O.EvaluationScope{0n, context, permission},
        0n,
        0n,
        0n,
        O.ChildCancelled{},
        None{},
        None{},
        None{}
      }
    }
  )
  : O.Step
}:
  match state:
    case O.State{canon, next, _, rest}:
      %free_exact(next, O.find(next, rest)) : {
        O.evaluation_cleanup_found(
          state,
          origin,
          input,
          Some{
            O.Child{
              O.EvaluationScope{0n, context, permission},
              0n,
              0n,
              0n,
              O.ChildCancelled{},
              None{},
              None{},
              None{}
            }
          }
        )
        == S.birth(
          Bool.and(_, Bool.not(S.cleanup_claimed(origin, rest))),
          state,
          O.EvaluationCleanupScope{
            next,
            origin,
            context,
            S.cleanup_permission(canon, context, permission)
          },
          None{},
          input,
          O.NotPreparing{}
        )
        : O.Step
      }
      %cleanup_claimed_exact(origin, rest) : {
        O.evaluation_cleanup_found(
          state,
          origin,
          input,
          Some{
            O.Child{
              O.EvaluationScope{0n, context, permission},
              0n,
              0n,
              0n,
              O.ChildCancelled{},
              None{},
              None{},
              None{}
            }
          }
        )
        == S.birth(
          Bool.and(O.settings_next_free(next, O.find(next, rest)), Bool.not(_)),
          state,
          O.EvaluationCleanupScope{
            next,
            origin,
            context,
            S.cleanup_permission(canon, context, permission)
          },
          None{},
          input,
          O.NotPreparing{}
        )
        : O.Step
      }
      %cleanup_permission_exact(canon, context, permission) : {
        O.evaluation_cleanup_found(
          state,
          origin,
          input,
          Some{
            O.Child{
              O.EvaluationScope{0n, context, permission},
              0n,
              0n,
              0n,
              O.ChildCancelled{},
              None{},
              None{},
              None{}
            }
          }
        )
        == S.birth(
          Bool.and(
            O.settings_next_free(next, O.find(next, rest)),
            Bool.not(O.evaluation_cleanup_claimed(origin, rest))
          ),
          state,
          O.EvaluationCleanupScope{next, origin, context, _},
          None{},
          input,
          O.NotPreparing{}
        )
        : O.Step
      }
      birth_exact(
        Bool.and(
          O.settings_next_free(next, O.find(next, rest)),
          Bool.not(O.evaluation_cleanup_claimed(origin, rest))
        ),
        state,
        O.EvaluationCleanupScope{
          next,
          origin,
          context,
          O.evaluation_cleanup_permission(canon, context, permission)
        },
        input
      )

def cleanup_found_exact(+state: O.State, +origin: Nat, +input: Nat, +found: Maybe<&2, O.Child>) -> {
  O.evaluation_cleanup_found(state, origin, input, found)
  == S.cleanup_found(state, origin, input, found)
  : O.Step
}:
  match found:
    case None{}: {==}
    case Some{
      O.Child{O.EvaluationScope{_, context, permission}, _, _, _, O.ChildCancelled{}, _, _, _}
    }:
      cleanup_birth_exact(state, origin, input, context, permission)

    case Some{O.Child{O.EvaluationScope{_, _, _}, _, _, _, O.ChildInstalling{}, _, _, _}}: {==}

    case Some{O.Child{O.EvaluationScope{_, _, _}, _, _, _, O.ChildReady{}, _, _, _}}: {==}

    case Some{O.Child{O.EvaluationScope{_, _, _}, _, _, _, O.ChildAwaiting{}, _, _, _}}: {==}

    case Some{O.Child{O.EvaluationScope{_, _, _}, _, _, _, O.ChildResuming{}, _, _, _}}: {==}

    case Some{O.Child{O.EvaluationScope{_, _, _}, _, _, _, O.ChildAccepted{}, _, _, _}}: {==}

    case Some{O.Child{O.EvaluationCleanupScope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.EvaluationDispatchScope{_, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.DeliveryScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.SettingsScope{_}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.FreshnessScope{_}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.Scope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.SourceScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.AfterSourceScope{_, _, _, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.PreparationScope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.RetainingScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case Some{O.Child{O.AdviceTailScope{_, _, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

def launch_evaluation_cleanup_exact(+state: O.State, +origin: Nat, +input: Nat) -> {
  O.launch_evaluation_cleanup(state, origin, input)
  == S.launch_evaluation_cleanup(state, origin, input)
  : O.Step
}:
  match state:
    case O.State{_, _, _, rest}: cleanup_found_exact(state, origin, input, O.find(origin, rest))

def nested_false_exact(
  +valid: Bool,
  +state: O.State,
  +parent: O.Parent,
  +scope: O.Scope,
  +input: Nat
) -> {
  O.launched_nested(Bool.and(valid, False{}), state, parent, scope, input)
  == O.Rejected{state, O.WrongPhase{}}
  : O.Step
}:
  match valid:
    case True{}: {==}
    case False{}: {==}

def nested_role_refused_exact(+state: O.State, +parent: O.Parent, +child: O.Child, +input: Nat,
  role: {O.resolver_parent_role(child) == False{} : Bool}) -> {
  O.nested_found(state, parent, Some{child}, input) == S.nested_refused(state, Some{child}) : O.Step
}:
  %Equal.sym(Bool, O.resolver_parent_role(child), False{}, role) : {
    O.launched_nested(
      Bool.and(
        Bool.not(O.parent_used(parent, O.state_children(state))),
        Bool.and(
          Bool.and(_, O.parent_matches(parent, Some{child})),
          Bool.and(
            O.live_preparing(
              O.state_canonical(state),
              O.resolver_scope(O.child_scope_value(child))
            ),
            O.child_live(O.state_canonical(state), O.state_children(state), child)
          )
        )
      ),
      state,
      parent,
      O.resolver_scope(O.child_scope_value(child)),
      input
    )
    == O.Rejected{state, O.WrongPhase{}}
    : O.Step
  }
  nested_false_exact(
    Bool.not(O.parent_used(parent, O.state_children(state))),
    state,
    parent,
    O.resolver_scope(O.child_scope_value(child)),
    input
  )

def nested_lookup_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +request: Nat,
  +input: Nat,
  +child: O.Child,
  found: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  found_right: {O.find(inv, S.children(state)) == Some{child} : Maybe<&2, O.Child>},
  selected: {
    O.nested_found(state, O.Parent{inv, generation, request}, Some{child}, input)
    == S.nested_refused(state, Some{child})
    : O.Step
  }
) -> {
    O.launch_nested(state, O.Parent{inv, generation, request}, input)
    == S.launch_nested(state, O.Parent{inv, generation, request}, input)
    : O.Step
  }:
  match state:
    case O.State{_, _, _, rest}:
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found_right) : {
        O.nested_found(state, O.Parent{inv, generation, request}, O.find(inv, rest), input)
        == S.nested_refused(state, _)
        : O.Step
      }
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, rest), Some{child}, found) : {
        O.nested_found(state, O.Parent{inv, generation, request}, _, input)
        == S.nested_refused(state, Some{child})
        : O.Step
      }
      selected

def root_generic_refusals_exact(
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
  +request: Nat,
  +input: Nat
) -> ({
    O.launch(
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
      input
    )
    == S.launch(
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
      input
    )
    : O.Step
  }
  & {
    O.launch_nested(
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
      O.Parent{inv, generation, request},
      input
    )
    == S.launch_nested(
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
      O.Parent{inv, generation, request},
      input
    )
    : O.Step
  }):
  (
    {==},
    nested_lookup_exact(
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
      request,
      input,
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
      nested_role_refused_exact(
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
        O.Parent{inv, generation, request},
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
        input,
        {==}
      )
    )
  )

def cleanup_generic_refusals_exact(
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
  +request: Nat,
  +input: Nat
) -> ({
    O.launch(
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
      input
    )
    == S.launch(
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
      input
    )
    : O.Step
  }
  & {
    O.launch_nested(
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
      O.Parent{inv, generation, request},
      input
    )
    == S.launch_nested(
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
      O.Parent{inv, generation, request},
      input
    )
    : O.Step
  }):
  (
    {==},
    nested_lookup_exact(
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
      request,
      input,
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
      nested_role_refused_exact(
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
        O.Parent{inv, generation, request},
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
        input,
        {==}
      )
    )
  )

def dispatch_generic_refusals_exact(
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
  +request: Nat,
  +input: Nat
) -> ({
    O.launch(
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
      input
    )
    == S.launch(
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
      input
    )
    : O.Step
  }
  & {
    O.launch_nested(
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
      O.Parent{inv, generation, request},
      input
    )
    == S.launch_nested(
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
      O.Parent{inv, generation, request},
      input
    )
    : O.Step
  }):
  (
    {==},
    nested_lookup_exact(
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
      request,
      input,
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
      nested_role_refused_exact(
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
        O.Parent{inv, generation, request},
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
        input,
        {==}
      )
    )
  )

def request_started_exact(+canon: C.State, +context: O.EvaluationContext, +id: Nat) -> {
  O.evaluation_request_started(O.evaluation_request(canon, context, id))
  == S.started(S.request(canon, context, id))
  : Bool
}:
  %request_exact(canon, context, id) : {
    O.evaluation_request_started(O.evaluation_request(canon, context, id)) == S.started(_) : Bool
  }
  started_exact(O.evaluation_request(canon, context, id))

def dispatch_terminal_exact(
  +state: O.State,
  +operation: Nat,
  +context: O.EvaluationContext,
  +jev: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +result: Nat,
  +success: Bool
) -> {
    O.evaluation_dispatch_terminal_child(
      state,
      O.Child{
        O.EvaluationDispatchScope{operation, context, jev},
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
      success
    )
    == S.dispatch_complete_found(
      state,
      Some{
        O.Child{
          O.EvaluationDispatchScope{operation, context, jev},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        }
      },
      generation,
      result,
      success
    )
    : O.Step
  }:
  match state:
    case O.State{canon, _, _, rest}:
      %live_from_scope_exact(
        state,
        O.Child{
          O.EvaluationDispatchScope{operation, context, jev},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        dispatch_scope_live_exact(
          state,
          operation,
          context,
          O.EvaluationUnissued{},
          0n,
          jev,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        )
      ) : {
        O.evaluation_dispatch_terminal_child(
          state,
          O.Child{
            O.EvaluationDispatchScope{operation, context, jev},
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
          success
        )
        == S.accepted(
          Bool.and(
            _,
            Bool.and(
              S.installable(
                O.Child{
                  O.EvaluationDispatchScope{operation, context, jev},
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
              Bool.or(Bool.not(success), S.started(S.request(canon, context, jev)))
            )
          ),
          state,
          O.Child{
            O.EvaluationDispatchScope{operation, context, jev},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          },
          result
        )
        : O.Step
      }
      %install_matches_exact(
        O.Child{
          O.EvaluationDispatchScope{operation, context, jev},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        generation
      ) : {
        O.evaluation_dispatch_terminal_child(
          state,
          O.Child{
            O.EvaluationDispatchScope{operation, context, jev},
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
          success
        )
        == S.accepted(
          Bool.and(
            O.child_live(
              canon,
              rest,
              O.Child{
                O.EvaluationDispatchScope{operation, context, jev},
                inv,
                epoch,
                handle,
                phase,
                pending,
                held,
                parent
              }
            ),
            Bool.and(_, Bool.or(Bool.not(success), S.started(S.request(canon, context, jev))))
          ),
          state,
          O.Child{
            O.EvaluationDispatchScope{operation, context, jev},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          },
          result
        )
        : O.Step
      }
      %request_started_exact(canon, context, jev) : {
        O.evaluation_dispatch_terminal_child(
          state,
          O.Child{
            O.EvaluationDispatchScope{operation, context, jev},
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
          success
        )
        == S.accepted(
          Bool.and(
            O.child_live(
              canon,
              rest,
              O.Child{
                O.EvaluationDispatchScope{operation, context, jev},
                inv,
                epoch,
                handle,
                phase,
                pending,
                held,
                parent
              }
            ),
            Bool.and(
              O.install_matches(
                O.Child{
                  O.EvaluationDispatchScope{operation, context, jev},
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
              Bool.or(Bool.not(success), _)
            )
          ),
          state,
          O.Child{
            O.EvaluationDispatchScope{operation, context, jev},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          },
          result
        )
        : O.Step
      }
      accepted_exact(
        Bool.and(
          O.child_live(
            canon,
            rest,
            O.Child{
              O.EvaluationDispatchScope{operation, context, jev},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            }
          ),
          Bool.and(
            O.install_matches(
              O.Child{
                O.EvaluationDispatchScope{operation, context, jev},
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
            Bool.or(
              Bool.not(success),
              O.evaluation_request_started(O.evaluation_request(canon, context, jev))
            )
          )
        ),
        state,
        O.Child{
          O.EvaluationDispatchScope{operation, context, jev},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        result
      )

def dispatch_complete_found_exact(
  +state: O.State,
  +found: Maybe<&2, O.Child>,
  +generation: Nat,
  +result: Nat,
  +success: Bool
) -> {
  O.evaluation_dispatch_terminal_found(state, found, generation, result, success)
  == S.dispatch_complete_found(state, found, generation, result, success) : O.Step
}:
  match found:
    case None{}: {==}
    case Some{
      O.Child{
        O.EvaluationDispatchScope{operation, context, jev},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: dispatch_terminal_exact(
      state,
      operation,
      context,
      jev,
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      generation,
      result,
      success
    )

    case Some{O.Child{O.EvaluationCleanupScope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

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

def complete_evaluation_dispatch_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +result: Nat,
  +success: Bool
) -> {
  O.complete_evaluation_dispatch(state, inv, generation, result, success)
  == S.complete_evaluation_dispatch(state, inv, generation, result, success) : O.Step
}:
  match state:
    case O.State{_, _, _, rest}: dispatch_complete_found_exact(
      state,
      O.find(inv, rest),
      generation,
      result,
      success
    )

def canonical_installed_exact(+old: C.State, +next: Nat, +lease: Nat, +rest: List<&2, O.Child>,
  +canon: C.State, +outputs: List<&2, C.Output>, +invalidated: O.Invalidated) -> {
  O.installed_canonical(O.State{old, next, lease, rest}, canon, outputs, invalidated)
  == S.reconciled(O.State{canon, next, lease, rest}, outputs, Nil{}, invalidated) : O.Step
}:
  match invalidated:
    case O.Invalidated{_, _}: {==}

def canonical_commit_exact(+state: O.State, +result: C.Step) -> {
  O.canonical_result(state, result) == S.canonical_commit(state, result) : O.Step
}:
  match state result:
    case O.State{old, next, lease, rest} C.Advanced{canon, outputs}:
      %invalidation_scan_exact(O.State{canon, next, lease, rest}, rest) : {
        O.canonical_result(state, result)
        == S.reconciled(O.State{canon, next, lease, rest}, outputs, Nil{}, _)
        : O.Step
      }
      canonical_installed_exact(
        old,
        next,
        lease,
        rest,
        canon,
        outputs,
        O.invalidate_scan(canon, rest, rest)
      )
    case O.State{_, _, _, _} C.Rejected{_, _}: {==}

def start_allowed_exact(
  +valid: Bool,
  +state: O.State,
  +context: O.EvaluationContext,
  +request: Nat
) -> {
  O.evaluation_start_pending(valid, state, context, request)
  == S.start_allowed(valid, state, context, request)
  : O.Step
}:
  match valid state context:
    case False{} O.State{_, _, _, _} O.EvaluationContext{_, _, _, _}: {==}
    case True{} O.State{canon, _, _, _} O.EvaluationContext{p, l, r, o}:
      canonical_commit_exact(state, C.step(canon, C.JevRequestStarted{p, l, r, o, request}))

def start_dispatch_exact(
  +valid: Bool,
  +state: O.State,
  +operation: Nat,
  +context: O.EvaluationContext,
  +jev: Nat,
  +actual: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>
) -> {
    O.evaluation_start_found(
      valid,
      state,
      Some{
        O.Child{
          O.EvaluationDispatchScope{operation, context, jev},
          actual,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        }
      }
    )
    == S.start_child(
      valid,
      state,
      Some{
        O.Child{
          O.EvaluationDispatchScope{operation, context, jev},
          actual,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        }
      }
    )
    : O.Step
  }:
  match valid state:
    case False{} O.State{_, _, _, _}: start_allowed_exact(False{}, state, context, jev)
    case True{} O.State{canon, _, _, _}:
      %pending_dispatch_exact(canon, context, jev) : {
        O.evaluation_start_found(
          valid,
          state,
          Some{
            O.Child{
              O.EvaluationDispatchScope{operation, context, jev},
              actual,
              epoch,
              handle,
              phase,
              pending,
              held,
              parent
            }
          }
        )
        == S.start_allowed(_, state, context, jev)
        : O.Step
      }
      start_allowed_exact(O.evaluation_dispatch_pending(canon, context, jev), state, context, jev)

def start_foreign_scope(scope: O.Scope) -> Bool:
  match scope:
    case O.EvaluationDispatchScope{_, _, _}: False{}
    case _: True{}

def start_foreign_exact(
  +left: Bool,
  +right: Bool,
  +scope: O.Scope,
  +state: O.State,
  +actual: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  unrelated: {start_foreign_scope(scope) == True{} : Bool}
) -> {
    O.evaluation_start_found(
      left,
      state,
      Some{O.Child{scope, actual, epoch, handle, phase, pending, held, parent}}
    )
    == S.start_child(
      right,
      state,
      Some{O.Child{scope, actual, epoch, handle, phase, pending, held, parent}}
    )
    : O.Step
  }:
  match left right scope:

    case False{} False{} O.EvaluationCleanupScope{_, _, _, _}: {==}

    case False{} False{} O.EvaluationDispatchScope{_, _, _}: Empty.absurd(
      {
        O.evaluation_start_found(
          left,
          state,
          Some{O.Child{scope, actual, epoch, handle, phase, pending, held, parent}}
        )
        == S.start_child(
          right,
          state,
          Some{O.Child{scope, actual, epoch, handle, phase, pending, held, parent}}
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case False{} False{} O.EvaluationScope{_, _, _}: {==}

    case False{} False{} O.DeliveryScope{_, _, _, _, _}: {==}

    case False{} False{} O.SettingsScope{_}: {==}

    case False{} False{} O.FreshnessScope{_}: {==}

    case False{} False{} O.Scope{_, _, _, _}: {==}

    case False{} False{} O.SourceScope{_, _, _, _, _}: {==}

    case False{} False{} O.AfterSourceScope{_, _, _, _, _, _, _}: {==}

    case False{} False{} O.PreparationScope{_, _, _, _}: {==}

    case False{} False{} O.RetainingScope{_, _, _, _, _}: {==}

    case False{} False{} O.AdviceTailScope{_, _, _, _, _, _}: {==}

    case False{} True{} O.EvaluationCleanupScope{_, _, _, _}: {==}

    case False{} True{} O.EvaluationDispatchScope{_, _, _}: Empty.absurd(
      {
        O.evaluation_start_found(
          left,
          state,
          Some{O.Child{scope, actual, epoch, handle, phase, pending, held, parent}}
        )
        == S.start_child(
          right,
          state,
          Some{O.Child{scope, actual, epoch, handle, phase, pending, held, parent}}
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case False{} True{} O.EvaluationScope{_, _, _}: {==}

    case False{} True{} O.DeliveryScope{_, _, _, _, _}: {==}

    case False{} True{} O.SettingsScope{_}: {==}

    case False{} True{} O.FreshnessScope{_}: {==}

    case False{} True{} O.Scope{_, _, _, _}: {==}

    case False{} True{} O.SourceScope{_, _, _, _, _}: {==}

    case False{} True{} O.AfterSourceScope{_, _, _, _, _, _, _}: {==}

    case False{} True{} O.PreparationScope{_, _, _, _}: {==}

    case False{} True{} O.RetainingScope{_, _, _, _, _}: {==}

    case False{} True{} O.AdviceTailScope{_, _, _, _, _, _}: {==}

    case True{} False{} O.EvaluationCleanupScope{_, _, _, _}: {==}

    case True{} False{} O.EvaluationDispatchScope{_, _, _}: Empty.absurd(
      {
        O.evaluation_start_found(
          left,
          state,
          Some{O.Child{scope, actual, epoch, handle, phase, pending, held, parent}}
        )
        == S.start_child(
          right,
          state,
          Some{O.Child{scope, actual, epoch, handle, phase, pending, held, parent}}
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case True{} False{} O.EvaluationScope{_, _, _}: {==}

    case True{} False{} O.DeliveryScope{_, _, _, _, _}: {==}

    case True{} False{} O.SettingsScope{_}: {==}

    case True{} False{} O.FreshnessScope{_}: {==}

    case True{} False{} O.Scope{_, _, _, _}: {==}

    case True{} False{} O.SourceScope{_, _, _, _, _}: {==}

    case True{} False{} O.AfterSourceScope{_, _, _, _, _, _, _}: {==}

    case True{} False{} O.PreparationScope{_, _, _, _}: {==}

    case True{} False{} O.RetainingScope{_, _, _, _, _}: {==}

    case True{} False{} O.AdviceTailScope{_, _, _, _, _, _}: {==}

    case True{} True{} O.EvaluationCleanupScope{_, _, _, _}: {==}

    case True{} True{} O.EvaluationDispatchScope{_, _, _}: Empty.absurd(
      {
        O.evaluation_start_found(
          left,
          state,
          Some{O.Child{scope, actual, epoch, handle, phase, pending, held, parent}}
        )
        == S.start_child(
          right,
          state,
          Some{O.Child{scope, actual, epoch, handle, phase, pending, held, parent}}
        )
        : O.Step
      },
      B.false_ne_true()(unrelated)
    )

    case True{} True{} O.EvaluationScope{_, _, _}: {==}

    case True{} True{} O.DeliveryScope{_, _, _, _, _}: {==}

    case True{} True{} O.SettingsScope{_}: {==}

    case True{} True{} O.FreshnessScope{_}: {==}

    case True{} True{} O.Scope{_, _, _, _}: {==}

    case True{} True{} O.SourceScope{_, _, _, _, _}: {==}

    case True{} True{} O.AfterSourceScope{_, _, _, _, _, _, _}: {==}

    case True{} True{} O.PreparationScope{_, _, _, _}: {==}

    case True{} True{} O.RetainingScope{_, _, _, _, _}: {==}

    case True{} True{} O.AdviceTailScope{_, _, _, _, _, _}: {==}

def start_with_permit_exact(
  +state: O.State,
  +found: Maybe<&2, O.Child>,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat
) -> {
  O.evaluation_start_found(
    O.provider_permit_found(
      S.canonical(state),
      S.children(state),
      inv,
      generation,
      lease,
      request,
      found
    ),
    state,
    found
  )
  == S.start_child(S.permitted(state, inv, generation, lease, request, found), state, found)
  : O.Step
}:
  match found:
    case None{}: {==}
    case Some{
      O.Child{
        O.EvaluationDispatchScope{operation, context, jev},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }:
      %provider_live_found_exact(
        state,
        inv,
        generation,
        lease,
        request,
        O.Child{
          O.EvaluationDispatchScope{operation, context, jev},
          actual,
          epoch,
          handle,
          phase,
          pending,
          held,
          parent
        },
        live_from_scope_exact(
          state,
          O.Child{
            O.EvaluationDispatchScope{operation, context, jev},
            actual,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          },
          dispatch_scope_live_exact(
            state,
            operation,
            context,
            O.EvaluationUnissued{},
            0n,
            jev,
            actual,
            epoch,
            handle,
            phase,
            pending,
            held,
            parent
          )
        )
      ) : {
          O.evaluation_start_found(
            O.provider_permit_found(
              S.canonical(state),
              S.children(state),
              inv,
              generation,
              lease,
              request,
              found
            ),
            state,
            found
          )
          == S.start_child(_, state, found)
          : O.Step
        }
      start_dispatch_exact(
        O.provider_permit_found(
          S.canonical(state),
          S.children(state),
          inv,
          generation,
          lease,
          request,
          found
        ),
        state,
        operation,
        context,
        jev,
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      )

    case Some{
      O.Child{
        O.EvaluationCleanupScope{v0, v1, v2, v3},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: start_foreign_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.EvaluationCleanupScope{v0, v1, v2, v3},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{O.EvaluationScope{v0, v1, v2}, actual, epoch, handle, phase, pending, held, parent}
    }: start_foreign_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.EvaluationScope{v0, v1, v2},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.DeliveryScope{v0, v1, v2, v3, v4},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: start_foreign_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.DeliveryScope{v0, v1, v2, v3, v4},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{O.Child{O.SettingsScope{v0}, actual, epoch, handle, phase, pending, held, parent}}: start_foreign_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.SettingsScope{v0},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{O.Child{O.FreshnessScope{v0}, actual, epoch, handle, phase, pending, held, parent}}: start_foreign_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.FreshnessScope{v0},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{O.Scope{v0, v1, v2, v3}, actual, epoch, handle, phase, pending, held, parent}
    }: start_foreign_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.Scope{v0, v1, v2, v3},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.SourceScope{v0, v1, v2, v3, v4},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: start_foreign_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.SourceScope{v0, v1, v2, v3, v4},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.AfterSourceScope{v0, v1, v2, v3, v4, v5, v6},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: start_foreign_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.AfterSourceScope{v0, v1, v2, v3, v4, v5, v6},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.PreparationScope{v0, v1, v2, v3},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: start_foreign_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.PreparationScope{v0, v1, v2, v3},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.RetainingScope{v0, v1, v2, v3, v4},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: start_foreign_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.RetainingScope{v0, v1, v2, v3, v4},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

    case Some{
      O.Child{
        O.AdviceTailScope{v0, v1, v2, v3, v4, v5},
        actual,
        epoch,
        handle,
        phase,
        pending,
        held,
        parent
      }
    }: start_foreign_exact(
      O.provider_permit_found(
        S.canonical(state),
        S.children(state),
        inv,
        generation,
        lease,
        request,
        found
      ),
      S.permitted(state, inv, generation, lease, request, found),
      O.AdviceTailScope{v0, v1, v2, v3, v4, v5},
      state,
      actual,
      epoch,
      handle,
      phase,
      pending,
      held,
      parent,
      {==}
    )

def evaluation_start_request_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat
) -> {
  O.evaluation_start_request(state, inv, generation, lease, request)
  == S.evaluation_start_request(state, inv, generation, lease, request)
  : O.Step
}:
  match state:
    case O.State{_, _, _, rest}: start_with_permit_exact(
      state,
      O.find(inv, rest),
      inv,
      generation,
      lease,
      request
    )

def same_parent_exact(
  +left: O.Parent,
  +right: O.Parent
) -> {O.parent_equal(left, right) == S.same_parent(left, right) : Bool}:
  match left right:
    case O.Parent{_, _, _} O.Parent{_, _, _}: {==}

def parent_matches_exact(
  +parent: O.Parent,
  +found: Maybe<&2, O.Child>
) -> {O.parent_matches(parent, found) == S.parent_matches(parent, found) : Bool}:
  match parent found:
    case O.Parent{_, _, _} None{}: {==}

    case O.Parent{_, _, _} Some{O.Child{_, _, _, _, O.ChildInstalling{}, _, _, _}}: {==}

    case O.Parent{_, _, _} Some{O.Child{_, _, _, _, O.ChildReady{}, _, _, _}}: {==}

    case O.Parent{_, _, _} Some{O.Child{_, _, _, _, O.ChildResuming{}, _, _, _}}: {==}

    case O.Parent{_, _, _} Some{O.Child{_, _, _, _, O.ChildAccepted{}, _, _, _}}: {==}

    case O.Parent{_, _, _} Some{O.Child{_, _, _, _, O.ChildCancelled{}, _, _, _}}: {==}

    case O.Parent{_, _, _} Some{O.Child{_, _, _, _, O.ChildAwaiting{}, None{}, _, _}}: {==}
    case O.Parent{_, _, _} Some{O.Child{_, _, _, _, O.ChildAwaiting{}, Some{_}, None{}, _}}: {==}
    case O.Parent{_, _, _} Some{
      O.Child{_, _, _, _, O.ChildAwaiting{}, Some{_}, Some{O.Lease{_, _}}, _}
    }: {==}

def parent_used_exact(
  +parent: O.Parent,
  +rest: List<&2, O.Child>
) -> {O.parent_used(parent, rest) == S.parent_used(parent, rest) : Bool}:
  match rest:
    case Nil{}: {==}
    case O.Child{_, _, _, _, _, _, _, None{}} <> tail: parent_used_exact(parent, tail)
    case O.Child{_, _, _, _, _, _, _, Some{other}} <> tail:
      %same_parent_exact(parent, other) : {
        O.parent_used(parent, rest)
        == Bool.or(_, S.parent_used(parent, tail))
        : Bool
      }
      %parent_used_exact(parent, tail) : {
        O.parent_used(parent, rest)
        == Bool.or(O.parent_equal(parent, other), _)
        : Bool
      }
      {==}

def nested_birth_exact(
  +valid: Bool,
  +state: O.State,
  +parent: O.Parent,
  +scope: O.Scope,
  +input: Nat
) -> {
  O.launched_nested(valid, state, parent, scope, input)
  == S.birth(valid, state, scope, Some{parent}, input, O.WrongPhase{})
  : O.Step
}:
  match valid state:
    case False{} _: {==}
    case True{} O.State{_, _, _, _}: {==}

def dispatch_parent_exact(
  +state: O.State,
  +parent: O.Parent,
  +operation: Nat,
  +context: O.EvaluationContext,
  +jev: Nat,
  +expected: O.Parent,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +ancestor: Maybe<&2, O.Parent>,
  +input: Nat
) -> {
    O.evaluation_dispatch_parent(
      state,
      parent,
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      },
      input
    )
    == S.dispatch_found(
      state,
      parent,
      Some{
        O.Child{
          O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        }
      },
      input
    )
    : O.Step
  }:
  match state:
    case O.State{canon, next, _, rest}:

      %free_exact(next, O.find(next, rest)) : {
        O.evaluation_dispatch_parent(
          state,
          parent,
          O.Child{
            O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            ancestor
          },
          input
        )
        == S.birth(
          Bool.and(
            _,
            Bool.and(
              Bool.not(S.parent_used(parent, rest)),
              Bool.and(
                Bool.and(
                  S.same_parent(parent, expected),
                  S.parent_matches(
                    parent,
                    Some{
                      O.Child{
                        O.EvaluationScope{
                          operation,
                          context,
                          O.EvaluationAtProvider{jev, expected}
                        },
                        inv,
                        epoch,
                        handle,
                        phase,
                        pending,
                        held,
                        ancestor
                      }
                    }
                  )
                ),
                Bool.and(
                  S.live(
                    state,
                    O.Child{
                      O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
                      inv,
                      epoch,
                      handle,
                      phase,
                      pending,
                      held,
                      ancestor
                    }
                  ),
                  S.pending_dispatch(canon, context, jev)
                )
              )
            )
          ),
          state,
          O.EvaluationDispatchScope{next, context, jev},
          Some{parent},
          input,
          O.WrongPhase{}
        )
        : O.Step
      }

      %parent_used_exact(parent, rest) : {
        O.evaluation_dispatch_parent(
          state,
          parent,
          O.Child{
            O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            ancestor
          },
          input
        )
        == S.birth(
          Bool.and(
            O.settings_next_free(next, O.find(next, rest)),
            Bool.and(
              Bool.not(_),
              Bool.and(
                Bool.and(
                  S.same_parent(parent, expected),
                  S.parent_matches(
                    parent,
                    Some{
                      O.Child{
                        O.EvaluationScope{
                          operation,
                          context,
                          O.EvaluationAtProvider{jev, expected}
                        },
                        inv,
                        epoch,
                        handle,
                        phase,
                        pending,
                        held,
                        ancestor
                      }
                    }
                  )
                ),
                Bool.and(
                  S.live(
                    state,
                    O.Child{
                      O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
                      inv,
                      epoch,
                      handle,
                      phase,
                      pending,
                      held,
                      ancestor
                    }
                  ),
                  S.pending_dispatch(canon, context, jev)
                )
              )
            )
          ),
          state,
          O.EvaluationDispatchScope{next, context, jev},
          Some{parent},
          input,
          O.WrongPhase{}
        )
        : O.Step
      }

      %same_parent_exact(parent, expected) : {
        O.evaluation_dispatch_parent(
          state,
          parent,
          O.Child{
            O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            ancestor
          },
          input
        )
        == S.birth(
          Bool.and(
            O.settings_next_free(next, O.find(next, rest)),
            Bool.and(
              Bool.not(O.parent_used(parent, rest)),
              Bool.and(
                Bool.and(
                  _,
                  S.parent_matches(
                    parent,
                    Some{
                      O.Child{
                        O.EvaluationScope{
                          operation,
                          context,
                          O.EvaluationAtProvider{jev, expected}
                        },
                        inv,
                        epoch,
                        handle,
                        phase,
                        pending,
                        held,
                        ancestor
                      }
                    }
                  )
                ),
                Bool.and(
                  S.live(
                    state,
                    O.Child{
                      O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
                      inv,
                      epoch,
                      handle,
                      phase,
                      pending,
                      held,
                      ancestor
                    }
                  ),
                  S.pending_dispatch(canon, context, jev)
                )
              )
            )
          ),
          state,
          O.EvaluationDispatchScope{next, context, jev},
          Some{parent},
          input,
          O.WrongPhase{}
        )
        : O.Step
      }

      %parent_matches_exact(
        parent,
        Some{
          O.Child{
            O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            ancestor
          }
        }
      ) : {
        O.evaluation_dispatch_parent(
          state,
          parent,
          O.Child{
            O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            ancestor
          },
          input
        )
        == S.birth(
          Bool.and(
            O.settings_next_free(next, O.find(next, rest)),
            Bool.and(
              Bool.not(O.parent_used(parent, rest)),
              Bool.and(
                Bool.and(O.parent_equal(parent, expected), _),
                Bool.and(
                  S.live(
                    state,
                    O.Child{
                      O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
                      inv,
                      epoch,
                      handle,
                      phase,
                      pending,
                      held,
                      ancestor
                    }
                  ),
                  S.pending_dispatch(canon, context, jev)
                )
              )
            )
          ),
          state,
          O.EvaluationDispatchScope{next, context, jev},
          Some{parent},
          input,
          O.WrongPhase{}
        )
        : O.Step
      }

      %live_from_scope_exact(
        state,
        O.Child{
          O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        },
        root_scope_live_exact(
          state,
          operation,
          context,
          O.EvaluationAtProvider{jev, expected},
          0n,
          0n,
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        )
      ) : {
        O.evaluation_dispatch_parent(
          state,
          parent,
          O.Child{
            O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            ancestor
          },
          input
        )
        == S.birth(
          Bool.and(
            O.settings_next_free(next, O.find(next, rest)),
            Bool.and(
              Bool.not(O.parent_used(parent, rest)),
              Bool.and(
                Bool.and(
                  O.parent_equal(parent, expected),
                  O.parent_matches(
                    parent,
                    Some{
                      O.Child{
                        O.EvaluationScope{
                          operation,
                          context,
                          O.EvaluationAtProvider{jev, expected}
                        },
                        inv,
                        epoch,
                        handle,
                        phase,
                        pending,
                        held,
                        ancestor
                      }
                    }
                  )
                ),
                Bool.and(_, S.pending_dispatch(canon, context, jev))
              )
            )
          ),
          state,
          O.EvaluationDispatchScope{next, context, jev},
          Some{parent},
          input,
          O.WrongPhase{}
        )
        : O.Step
      }

      %pending_dispatch_exact(canon, context, jev) : {
        O.evaluation_dispatch_parent(
          state,
          parent,
          O.Child{
            O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
            inv,
            epoch,
            handle,
            phase,
            pending,
            held,
            ancestor
          },
          input
        )
        == S.birth(
          Bool.and(
            O.settings_next_free(next, O.find(next, rest)),
            Bool.and(
              Bool.not(O.parent_used(parent, rest)),
              Bool.and(
                Bool.and(
                  O.parent_equal(parent, expected),
                  O.parent_matches(
                    parent,
                    Some{
                      O.Child{
                        O.EvaluationScope{
                          operation,
                          context,
                          O.EvaluationAtProvider{jev, expected}
                        },
                        inv,
                        epoch,
                        handle,
                        phase,
                        pending,
                        held,
                        ancestor
                      }
                    }
                  )
                ),
                Bool.and(
                  O.child_live(
                    canon,
                    rest,
                    O.Child{
                      O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
                      inv,
                      epoch,
                      handle,
                      phase,
                      pending,
                      held,
                      ancestor
                    }
                  ),
                  _
                )
              )
            )
          ),
          state,
          O.EvaluationDispatchScope{next, context, jev},
          Some{parent},
          input,
          O.WrongPhase{}
        )
        : O.Step
      }

      nested_birth_exact(
        Bool.and(
          O.settings_next_free(next, O.find(next, rest)),
          Bool.and(
            Bool.not(O.parent_used(parent, rest)),
            Bool.and(
              Bool.and(
                O.parent_equal(parent, expected),
                O.parent_matches(
                  parent,
                  Some{
                    O.Child{
                      O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
                      inv,
                      epoch,
                      handle,
                      phase,
                      pending,
                      held,
                      ancestor
                    }
                  }
                )
              ),
              Bool.and(
                O.child_live(
                  canon,
                  rest,
                  O.Child{
                    O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
                    inv,
                    epoch,
                    handle,
                    phase,
                    pending,
                    held,
                    ancestor
                  }
                ),
                O.evaluation_dispatch_pending(canon, context, jev)
              )
            )
          )
        ),
        state,
        parent,
        O.EvaluationDispatchScope{next, context, jev},
        input
      )

def dispatch_launch_found_exact(
  +state: O.State,
  +parent: O.Parent,
  +found: Maybe<&2, O.Child>,
  +input: Nat
) -> {
  O.evaluation_dispatch_found(state, parent, found, input)
  == S.dispatch_found(state, parent, found, input)
  : O.Step
}:
  match state found:
    case O.State{_, _, _, _} None{}: {==}
    case O.State{_, _, _, _} Some{
      O.Child{
        O.EvaluationScope{operation, context, O.EvaluationAtProvider{jev, expected}},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      }
    }: dispatch_parent_exact(
      state,
      parent,
      operation,
      context,
      jev,
      expected,
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      ancestor,
      input
    )

    case O.State{_, _, _, _} Some{
      O.Child{O.EvaluationScope{_, _, O.EvaluationUnissued{}}, _, _, _, _, _, _, _}
    }: {==}

    case O.State{_, _, _, _} Some{
      O.Child{O.EvaluationScope{_, _, O.EvaluationIssued{_}}, _, _, _, _, _, _, _}
    }: {==}

    case O.State{_, _, _, _} Some{
      O.Child{O.EvaluationScope{_, _, O.EvaluationSettled{}}, _, _, _, _, _, _, _}
    }: {==}

    case O.State{_, _, _, _} Some{
      O.Child{O.EvaluationCleanupScope{_, _, _, _}, _, _, _, _, _, _, _}
    }: {==}

    case O.State{_, _, _, _} Some{O.Child{O.EvaluationDispatchScope{_, _, _}, _, _, _, _, _, _, _}}: {==}

    case O.State{_, _, _, _} Some{O.Child{O.DeliveryScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case O.State{_, _, _, _} Some{O.Child{O.SettingsScope{_}, _, _, _, _, _, _, _}}: {==}

    case O.State{_, _, _, _} Some{O.Child{O.FreshnessScope{_}, _, _, _, _, _, _, _}}: {==}

    case O.State{_, _, _, _} Some{O.Child{O.Scope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case O.State{_, _, _, _} Some{O.Child{O.SourceScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case O.State{_, _, _, _} Some{
      O.Child{O.AfterSourceScope{_, _, _, _, _, _, _}, _, _, _, _, _, _, _}
    }: {==}

    case O.State{_, _, _, _} Some{O.Child{O.PreparationScope{_, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case O.State{_, _, _, _} Some{O.Child{O.RetainingScope{_, _, _, _, _}, _, _, _, _, _, _, _}}: {==}

    case O.State{_, _, _, _} Some{
      O.Child{O.AdviceTailScope{_, _, _, _, _, _}, _, _, _, _, _, _, _}
    }: {==}

def launch_evaluation_dispatch_exact(+state: O.State, +parent: O.Parent, +input: Nat) -> {
  O.launch_evaluation_dispatch(state, parent, input)
  == S.launch_evaluation_dispatch(state, parent, input)
  : O.Step
}:
  match state parent:
    case O.State{_, _, _, rest} O.Parent{inv, _, _}: dispatch_launch_found_exact(
      state,
      parent,
      O.find(inv, rest),
      input
    )

def main() -> Unit:
  Unit{}
