import Base
import ../../../vendor/bendlib/packages/bend-mathlib/bool.bend as B
import ../../../vendor/bendlib/packages/bend-mathlib/nat.bend as N
import ./CanonicalResolverOwner.bend as O
import ./DeliveryOwnerSpecification.bend as S
import ./DELIVERY_OWNER_LAWS.bend as Laws

# Checked implementation contract for the current Bend delivery Owner API.
# On API replacement, transfer current lifecycle guarantees to its successor
# and delete the superseded equations/specification/proofs.

def free_exact(+next: Nat, +found: Maybe<&2, O.Child>) -> {
  O.settings_next_free(next, found) == S.free(next, found) : Bool
}:
  match next found:
    case 0n None{}: {==}
    case 0n Some{_}: {==}
    case 1n++_ None{}: {==}
    case 1n++_ Some{_}: {==}

def next_invocation(+state: O.State) -> Nat:
  match state:
    case O.State{_, +next, _, _}: next

def launched_exact(+valid: Bool, +state: O.State, +context: O.DeliveryContext, +input: Nat) -> {
  O.launched(
    valid,
    state,
    O.DeliveryScope{
      next_invocation(state),
      next_invocation(state),
      context,
      O.CollectDelivery{},
      input
    },
    input
  )
  == S.launch_selected(valid, state, context, input)
  : O.Step
}:
  match valid state:
    case False{} _: {==}
    case True{} O.State{_, _, _, _}: {==}

def Laws.collection_launch_exact(state, context, input):
  match state:
    case O.State{_, +next, _, +rest}:
      %Equal.sym(
        Bool,
        O.settings_next_free(next, O.find(next, rest)),
        S.free(next, O.find(next, rest)),
        free_exact(next, O.find(next, rest))
      ) : {
        O.launched(
          _,
          state,
          O.DeliveryScope{next, next, context, O.CollectDelivery{}, input},
          input
        )
        == S.launch_selected(S.free(next, O.find(next, rest)), state, context, input)
        : O.Step
      }
      launched_exact(S.free(next, O.find(next, rest)), state, context, input)


def and_exact(+a: Bool, +b: Bool, +c: Bool, +d: Bool,
    ab: {a == b : Bool}, cd: {c == d : Bool}) -> {
  Bool.and(a, c) == Bool.and(b, d) : Bool
}:
  %ab : {Bool.and(a, c) == Bool.and(_, d) : Bool}
  %cd : {Bool.and(a, c) == Bool.and(a, _) : Bool}
  {==}

def bool_exact(+a: Bool, +b: Bool) -> {
  O.delivery_bool_equal(a, b) == S.same_bool(a, b) : Bool
}:
  match a b:
    case True{} True{}: {==}
    case True{} False{}: {==}
    case False{} True{}: {==}
    case False{} False{}: {==}

def optional_exact(+a: Maybe<&2, Nat>, +b: Maybe<&2, Nat>) -> {
  O.delivery_round_equal(a, b) == S.same_optional(a, b) : Bool
}:
  match a b:
    case None{} None{}: {==}
    case None{} Some{_}: {==}
    case Some{_} None{}: {==}
    case Some{_} Some{_}: {==}

def list_exact(+a: List<&2, Nat>, +b: List<&2, Nat>) -> {
  O.delivery_nats_equal(a, b) == S.same_list(a, b) : Bool
}:
  match a b:
    case Nil{} Nil{}: {==}
    case Nil{} _ <> _: {==}
    case _ <> _ Nil{}: {==}
    case +x <> +xs +y <> +ys:
      Equal.cong(Bool, Bool, tail => Bool.and(Nat.is_eq(x, y), tail),
        O.delivery_nats_equal(xs, ys), S.same_list(xs, ys), list_exact(xs, ys))

def context_exact(+a: O.DeliveryContext, +b: O.DeliveryContext) -> {
  O.delivery_context_equal(a, b) == S.same_context(a, b) : Bool
}:
  match a b:
    case O.DeliveryContext{+r, +who, +p, +life, +round, +local}
      O.DeliveryContext{+r2, +who2, +p2, +life2, +round2, +local2}:
      %optional_exact(p, p2) : {
        O.delivery_context_equal(a, b)
        == Bool.and(
          Nat.is_eq(r, r2),
          Bool.and(
            String.eq(who, who2),
            Bool.and(
              _,
              Bool.and(
                Nat.is_eq(life, life2),
                Bool.and(S.same_optional(round, round2), S.same_bool(local, local2))
              )
            )
          )
        )
        : Bool
      }
      %optional_exact(round, round2) : {
        O.delivery_context_equal(a, b)
        == Bool.and(
          Nat.is_eq(r, r2),
          Bool.and(
            String.eq(who, who2),
            Bool.and(
              O.delivery_round_equal(p, p2),
              Bool.and(Nat.is_eq(life, life2), Bool.and(_, S.same_bool(local, local2)))
            )
          )
        )
        : Bool
      }
      %bool_exact(local, local2) : {
        O.delivery_context_equal(a, b)
        == Bool.and(
          Nat.is_eq(r, r2),
          Bool.and(
            String.eq(who, who2),
            Bool.and(
              O.delivery_round_equal(p, p2),
              Bool.and(Nat.is_eq(life, life2), Bool.and(O.delivery_round_equal(round, round2), _))
            )
          )
        )
        : Bool
      }
      {==}

def selection_exact(+a: O.DeliverySelection, +b: O.DeliverySelection) -> {
  O.delivery_selection_equal(a, b) == S.same_selection(a, b) : Bool
}:
  match a b:
    case O.NoDeliverySelection{} O.NoDeliverySelection{}: {==}
    case O.NoDeliverySelection{} O.DeliverySelection{_, _, _}: {==}
    case O.DeliverySelection{_, _, _} O.NoDeliverySelection{}: {==}
    case O.DeliverySelection{+token, +advice, +notices} O.DeliverySelection{
      +token2,
      +advice2,
      +notices2
    }:
      Equal.cong(Bool, Bool, tail => Bool.and(Nat.is_eq(token, token2), tail),
        Bool.and(O.delivery_nats_equal(advice, advice2), O.delivery_nats_equal(notices, notices2)),
        Bool.and(S.same_list(advice, advice2), S.same_list(notices, notices2)),
        and_exact(O.delivery_nats_equal(advice, advice2), S.same_list(advice, advice2),
          O.delivery_nats_equal(notices, notices2), S.same_list(notices, notices2),
          list_exact(advice, advice2), list_exact(notices, notices2)))

def permission_exact(+a: O.DeliveryPermission, +b: O.DeliveryPermission) -> {
  O.delivery_permission_equal(a, b) == S.same_permission(a, b) : Bool
}:
  match a b:
    case O.CollectDelivery{} O.CollectDelivery{}: {==}
    case O.CollectDelivery{} O.PrepareDeliveryIssued{_}: {==}
    case O.CollectDelivery{} O.PrepareDelivery{_}: {==}
    case O.CollectDelivery{} O.FinalizeDeliveryIssued{_}: {==}
    case O.CollectDelivery{} O.FinalizeDelivery{_}: {==}
    case O.PrepareDeliveryIssued{_} O.CollectDelivery{}: {==}
    case O.PrepareDeliveryIssued{+x} O.PrepareDeliveryIssued{+y}: selection_exact(x, y)
    case O.PrepareDeliveryIssued{_} O.PrepareDelivery{_}: {==}
    case O.PrepareDeliveryIssued{_} O.FinalizeDeliveryIssued{_}: {==}
    case O.PrepareDeliveryIssued{_} O.FinalizeDelivery{_}: {==}
    case O.PrepareDelivery{_} O.CollectDelivery{}: {==}
    case O.PrepareDelivery{_} O.PrepareDeliveryIssued{_}: {==}
    case O.PrepareDelivery{+x} O.PrepareDelivery{+y}: selection_exact(x, y)
    case O.PrepareDelivery{_} O.FinalizeDeliveryIssued{_}: {==}
    case O.PrepareDelivery{_} O.FinalizeDelivery{_}: {==}
    case O.FinalizeDeliveryIssued{_} O.CollectDelivery{}: {==}
    case O.FinalizeDeliveryIssued{_} O.PrepareDeliveryIssued{_}: {==}
    case O.FinalizeDeliveryIssued{_} O.PrepareDelivery{_}: {==}
    case O.FinalizeDeliveryIssued{+x} O.FinalizeDeliveryIssued{+y}: selection_exact(x, y)
    case O.FinalizeDeliveryIssued{_} O.FinalizeDelivery{_}: {==}
    case O.FinalizeDelivery{_} O.CollectDelivery{}: {==}
    case O.FinalizeDelivery{_} O.PrepareDeliveryIssued{_}: {==}
    case O.FinalizeDelivery{_} O.PrepareDelivery{_}: {==}
    case O.FinalizeDelivery{_} O.FinalizeDeliveryIssued{_}: {==}
    case O.FinalizeDelivery{+x} O.FinalizeDelivery{+y}: selection_exact(x, y)

def receipt_success(+op: Nat, +origin: Nat, +ctx: O.DeliveryContext,
    +perm: O.DeliveryPermission, +input: Nat, +inv: Nat, +epoch: Nat,
    +handle: Nat, +receipt: O.DeliveryReceipt) -> {
  O.delivery_receipt_matches(O.Child{O.DeliveryScope{op, origin, ctx, perm, input},
    inv, epoch, handle, O.ChildInstalling{}, None{}, None{}, None{}}, receipt)
  == S.receipt_matches(O.Child{O.DeliveryScope{op, origin, ctx, perm, input},
    inv, epoch, handle, O.ChildInstalling{}, None{}, None{}, None{}}, receipt) : Bool
}:
  match receipt:
    case O.DeliveryReceipt{+actual, +generation, +source, +binding, +stage, +result}:
      Equal.cong(Bool, Bool, tail => Bool.and(Nat.is_eq(op, actual),
        Bool.and(Nat.is_eq(inv, actual), Bool.and(Nat.is_eq(epoch, generation),
          Bool.and(Nat.is_eq(origin, source), tail)))),
        Bool.and(O.delivery_context_equal(ctx, binding),
          Bool.and(O.delivery_permission_equal(perm, stage), Nat.is_eq(input, result))),
        Bool.and(S.same_context(ctx, binding),
          Bool.and(S.same_permission(perm, stage), Nat.is_eq(input, result))),
        and_exact(O.delivery_context_equal(ctx, binding), S.same_context(ctx, binding),
          Bool.and(O.delivery_permission_equal(perm, stage), Nat.is_eq(input, result)),
          Bool.and(S.same_permission(perm, stage), Nat.is_eq(input, result)),
          context_exact(ctx, binding),
          Equal.cong(Bool, Bool, value => Bool.and(value, Nat.is_eq(input, result)),
            O.delivery_permission_equal(perm, stage), S.same_permission(perm, stage),
            permission_exact(perm, stage))))

def receipt_parent(
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +parent: Maybe<&2, O.Parent>,
  +receipt: O.DeliveryReceipt
) -> {
  O.delivery_receipt_matches(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      O.ChildInstalling{},
      None{},
      None{},
      parent
    },
    receipt
  )
  == S.receipt_matches(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      O.ChildInstalling{},
      None{},
      None{},
      parent
    },
    receipt
  )
  : Bool
}:
  match parent:
    case None{}: receipt_success(op, origin, ctx, perm, input, inv, epoch, handle, receipt)
    case Some{_}: {==}

def receipt_lease(
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +receipt: O.DeliveryReceipt
) -> {
  O.delivery_receipt_matches(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      O.ChildInstalling{},
      None{},
      lease,
      parent
    },
    receipt
  )
  == S.receipt_matches(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      O.ChildInstalling{},
      None{},
      lease,
      parent
    },
    receipt
  )
  : Bool
}:
  match lease:
    case None{}: receipt_parent(op, origin, ctx, perm, input, inv, epoch, handle, parent, receipt)
    case Some{_}: {==}

def receipt_pending(
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +receipt: O.DeliveryReceipt
) -> {
  O.delivery_receipt_matches(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      O.ChildInstalling{},
      pending,
      lease,
      parent
    },
    receipt
  )
  == S.receipt_matches(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      O.ChildInstalling{},
      pending,
      lease,
      parent
    },
    receipt
  )
  : Bool
}:
  match pending:
    case None{}: receipt_lease(
      op,
      origin,
      ctx,
      perm,
      input,
      inv,
      epoch,
      handle,
      lease,
      parent,
      receipt
    )
    case Some{_}: {==}

def receipt_phase(
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +receipt: O.DeliveryReceipt
) -> {
  O.delivery_receipt_matches(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    receipt
  )
  == S.receipt_matches(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    receipt
  )
  : Bool
}:
  match phase:
    case O.ChildInstalling{}: receipt_pending(
      op,
      origin,
      ctx,
      perm,
      input,
      inv,
      epoch,
      handle,
      pending,
      lease,
      parent,
      receipt
    )
    case O.ChildReady{}: {==}
    case O.ChildAwaiting{}: {==}
    case O.ChildResuming{}: {==}
    case O.ChildAccepted{}: {==}
    case O.ChildCancelled{}: {==}

def receipt_scope(
  +scope: O.Scope,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +receipt: O.DeliveryReceipt
) -> {
  O.delivery_receipt_matches(
    O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
    receipt
  )
  == S.receipt_matches(O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}, receipt)
  : Bool
}:
  match scope:
    case O.DeliveryScope{+op, +origin, +ctx, +perm, +input}: receipt_phase(
      op,
      origin,
      ctx,
      perm,
      input,
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent,
      receipt
    )
    case O.EvaluationScope{_, _, _}: {==}
    case O.SettingsScope{_}: {==}
    case O.FreshnessScope{_}: {==}
    case O.Scope{_, _, _, _}: {==}
    case O.SourceScope{_, _, _, _, _}: {==}
    case O.AfterSourceScope{_, _, _, _, _, _, _}: {==}
    case O.PreparationScope{_, _, _, _}: {==}
    case O.RetainingScope{_, _, _, _, _}: {==}
    case O.AdviceTailScope{_, _, _, _, _, _}: {==}

def receipt_matches_exact(+child: O.Child, +receipt: O.DeliveryReceipt) -> {
  O.delivery_receipt_matches(child, receipt) == S.receipt_matches(child, receipt) : Bool
}:
  match child:
    case O.Child{+scope, +inv, +epoch, +handle, +phase, +pending, +lease, +parent}:
      receipt_scope(scope, inv, epoch, handle, phase, pending, lease, parent, receipt)

def claim_permission_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>
) -> {
  O.claim_delivery_allowed(
    True{},
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )
  == S.claim_valid(
    True{},
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )
  : O.Step
}:
  match perm:
    case O.CollectDelivery{}: {==}
    case O.PrepareDeliveryIssued{_}: {==}
    case O.PrepareDelivery{_}: {==}
    case O.FinalizeDeliveryIssued{_}: {==}
    case O.FinalizeDelivery{_}: {==}

def claim_scope_exact(
  +state: O.State,
  +scope: O.Scope,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>
) -> {
  O.claim_delivery_allowed(
    True{},
    state,
    O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
  )
  == S.claim_valid(True{}, state, O.Child{scope, inv, epoch, handle, phase, pending, lease, parent})
  : O.Step
}:
  match scope:
    case O.DeliveryScope{+op, +origin, +ctx, +perm, +input}: claim_permission_exact(
      state,
      op,
      origin,
      ctx,
      perm,
      input,
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    )
    case O.EvaluationScope{_, _, _}: {==}
    case O.SettingsScope{_}: {==}
    case O.FreshnessScope{_}: {==}
    case O.Scope{_, _, _, _}: {==}
    case O.SourceScope{_, _, _, _, _}: {==}
    case O.AfterSourceScope{_, _, _, _, _, _, _}: {==}
    case O.PreparationScope{_, _, _, _}: {==}
    case O.RetainingScope{_, _, _, _, _}: {==}
    case O.AdviceTailScope{_, _, _, _, _, _}: {==}

def claim_allowed_exact(+valid: Bool, +state: O.State, +child: O.Child) -> {
  O.claim_delivery_allowed(valid, state, child) == S.claim_valid(valid, state, child) : O.Step
}:
  match valid child:
    case False{} _: {==}
    case True{} O.Child{+scope, +inv, +epoch, +handle, +phase, +pending, +lease, +parent}:
      claim_scope_exact(state, scope, inv, epoch, handle, phase, pending, lease, parent)

def claim_found_exact(+state: O.State, +found: Maybe<&2, O.Child>, +receipt: O.DeliveryReceipt) -> {
  O.claim_delivery_found(state, found, receipt) == S.claim_found(state, found, receipt) : O.Step
}:
  match found:
    case None{}: {==}
    case Some{+child}:
      %receipt_matches_exact(child, receipt) : {
        O.claim_delivery_allowed(O.delivery_receipt_matches(child, receipt), state, child)
        == S.claim_valid(_, state, child) : O.Step
      }
      claim_allowed_exact(O.delivery_receipt_matches(child, receipt), state, child)

def Laws.receipt_claim_exact(state, receipt):
  match state receipt:
    case O.State{_, _, _, +children} O.DeliveryReceipt{+inv, _, _, _, _, _}:
      claim_found_exact(state, O.find(inv, children), receipt)

# The first child lookup is shared by the no-bypass, provider and cancellation
# proofs. Reuse the vendored Nat theorem rather than restating arithmetic laws.
def find_head_exact(+child: O.Child, +tail: List<&2, O.Child>) -> {
  O.find(O.child_invocation(child), child <> tail) == Some{child} : Maybe<&2, O.Child>
}:
  match child:
    case O.Child{_, +inv, _, _, _, _, _, _}:
      %Equal.sym(Bool, Nat.is_eq(inv, inv), True{}, N.is_eq_refl(inv)) : {
        Bool.pick(Maybe<&2, O.Child>, _, Some{child}, O.find(inv, tail))
        == Some{child} : Maybe<&2, O.Child>
      }
      {==}

def state_head_exact(+state: O.State, +child: O.Child) -> {
  O.find(O.child_invocation(child), O.state_children(S.state_with(state, child)))
  == Some{child} : Maybe<&2, O.Child>
}:
  match state:
    case O.State{_, _, _, +tail}: find_head_exact(child, tail)

def terminal_delivery_rejected(
  +state: O.State,
  +operation: Nat,
  +origin: Nat,
  +context: O.DeliveryContext,
  +permission: O.DeliveryPermission,
  +input: Nat,
  +invocation: Nat,
  +generation: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +attempt_generation: Nat,
  +result: Nat
) -> {
  O.terminal(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    invocation,
    attempt_generation,
    result
  )
  == O.Rejected{
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    O.WrongPhase{}
  }
  : O.Step
}:
  %Equal.sym(
    Maybe<&2, O.Child>,
    O.find(
      invocation,
      O.state_children(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{operation, origin, context, permission, input},
            invocation,
            generation,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
      )
    ),
    Some{
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    state_head_exact(
      state,
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
  ) : {
      O.terminal_found(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{operation, origin, context, permission, input},
            invocation,
            generation,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        ),
        _,
        attempt_generation,
        result
      )
      == O.Rejected{
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{operation, origin, context, permission, input},
            invocation,
            generation,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        ),
        O.WrongPhase{}
      }
      : O.Step
    }
  {==}

def Laws.delivery_no_bypass(
  state,
  operation,
  origin,
  context,
  permission,
  input,
  invocation,
  generation,
  handle,
  phase,
  pending,
  lease,
  parent,
  attempt_generation,
  result
):
  (
    {==},
    terminal_delivery_rejected(
      state,
      operation,
      origin,
      context,
      permission,
      input,
      invocation,
      generation,
      handle,
      phase,
      pending,
      lease,
      parent,
      attempt_generation,
      result
    )
  )

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

def cancel_delivery_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>
) -> {
  O.cancel_scope(
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    O.DeliveryScope{op, origin, ctx, perm, input}
  )
  == S.cancel_delivery(
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )
  : O.Step
}:
  match phase:
    case O.ChildInstalling{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          },
          O.DeliveryScope{op, origin, ctx, perm, input}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildReady{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          },
          O.DeliveryScope{op, origin, ctx, perm, input}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildAwaiting{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          },
          O.DeliveryScope{op, origin, ctx, perm, input}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildResuming{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          },
          O.DeliveryScope{op, origin, ctx, perm, input}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildAccepted{}:
      {==}
    case O.ChildCancelled{}:
      {==}

def Laws.delivery_cancellation_exact(
  state,
  operation,
  origin,
  context,
  permission,
  input,
  invocation,
  generation,
  handle,
  phase,
  pending,
  lease,
  parent
):
  %Equal.sym(
    Maybe<&2, O.Child>,
    O.find(
      invocation,
      O.state_children(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{operation, origin, context, permission, input},
            invocation,
            generation,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
      )
    ),
    Some{
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    state_head_exact(
      state,
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
  ) : {
      O.cancel_found(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{operation, origin, context, permission, input},
            invocation,
            generation,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        ),
        _
      )
      == S.cancel_delivery(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{operation, origin, context, permission, input},
            invocation,
            generation,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        ),
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      )
      : O.Step
    }
  cancel_delivery_exact(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    operation,
    origin,
    context,
    permission,
    input,
    invocation,
    generation,
    handle,
    phase,
    pending,
    lease,
    parent
  )

def active_exact(+phase: O.Phase) -> { O.active(phase) == S.running(phase) : Bool }:
  match phase:
    case O.ChildInstalling{}: {==}
    case O.ChildReady{}: {==}
    case O.ChildAwaiting{}: {==}
    case O.ChildResuming{}: {==}
    case O.ChildAccepted{}: {==}
    case O.ChildCancelled{}: {==}

def installing_exact(+phase: O.Phase) -> { O.installing(phase) == S.install_phase(phase) : Bool }:
  match phase:
    case O.ChildInstalling{}: {==}
    case O.ChildReady{}: {==}
    case O.ChildAwaiting{}: {==}
    case O.ChildResuming{}: {==}
    case O.ChildAccepted{}: {==}
    case O.ChildCancelled{}: {==}

def current_live_exact(
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>
) -> {
  O.delivery_current(
    op,
    inv,
    epoch,
    Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        None{}
      }
    }
  )
  == S.live(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      None{}
    }
  )
  : Bool
}:
  %Equal.sym(Bool, Nat.is_eq(op, op), True{}, N.is_eq_refl(op)) : {
    Bool.and(
      Nat.is_eq(op, inv),
      Bool.and(_, Bool.and(Nat.is_eq(inv, inv), Bool.and(Nat.is_eq(epoch, epoch), O.active(phase))))
    )
    == S.live(
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        None{}
      }
    )
    : Bool
  }
  %Equal.sym(Bool, Nat.is_eq(inv, inv), True{}, N.is_eq_refl(inv)) : {
    Bool.and(Nat.is_eq(op, inv), Bool.and(_, Bool.and(Nat.is_eq(epoch, epoch), O.active(phase))))
    == S.live(
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        None{}
      }
    )
    : Bool
  }
  %Equal.sym(Bool, Nat.is_eq(epoch, epoch), True{}, N.is_eq_refl(epoch)) : {
    Bool.and(Nat.is_eq(op, inv), Bool.and(_, O.active(phase)))
    == S.live(
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        None{}
      }
    )
    : Bool
  }
  %active_exact(phase) : {
    Bool.and(Nat.is_eq(op, inv), O.active(phase))
    == Bool.and(Nat.is_eq(op, inv), _)
    : Bool
  }
  {==}

def parent_none_exact(+children: List<&2, O.Child>) -> {
  O.parent_live(None{}, children) == True{} : Bool
}:
  match children:
    case Nil{}: {==}
    case _ <> _: {==}

def current_parent_live_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>
) -> {
  Bool.and(
    O.delivery_current(
      op,
      inv,
      epoch,
      Some{
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      }
    ),
    O.parent_live(parent, O.state_children(state))
  )
  == S.live(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )
  : Bool
}:
  match parent:
    case None{}:
      %Equal.sym(
        Bool,
        O.parent_live(None{}, O.state_children(state)),
        True{},
        parent_none_exact(O.state_children(state))
      ) : {
        Bool.and(
          O.delivery_current(
            op,
            inv,
            epoch,
            Some{
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            }
          ),
          _
        )
        == S.live(
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
        : Bool
      }
      Equal.trans(
        Bool,
        Bool.and(
          O.delivery_current(
            op,
            inv,
            epoch,
            Some{
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            }
          ),
          True{}
        ),
        O.delivery_current(
          op,
          inv,
          epoch,
          Some{
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            }
          }
        ),
        S.live(
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        ),
        B.and_true(
          O.delivery_current(
            op,
            inv,
            epoch,
            Some{
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            }
          )
        ),
        current_live_exact(op, origin, ctx, perm, input, inv, epoch, handle, phase, pending, lease)
      )
    case Some{_}: {==}

def delivery_live_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>
) -> {
  O.child_live(
    O.state_canonical(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      )
    ),
    O.state_children(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      )
    ),
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )
  == S.live(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )
  : Bool
}:
  %Equal.sym(
    Maybe<&2, O.Child>,
    O.find(
      inv,
      O.state_children(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
      )
    ),
    Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    state_head_exact(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
  ) : {
    Bool.and(
      O.delivery_current(op, inv, epoch, _),
      O.parent_live(
        parent,
        O.state_children(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            }
          )
        )
      )
    )
    == S.live(
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
    : Bool
  }
  current_parent_live_exact(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    op,
    origin,
    ctx,
    perm,
    input,
    inv,
    epoch,
    handle,
    phase,
    pending,
    lease,
    parent
  )

# Lookup gives a correlation witness even in an arbitrary stored child list.
# This supplies completion's selected-child premise without a new state invariant.
def observed_invocation(value: Maybe<&2, O.Child>) -> Nat:
  match value:
    case None{}: 0n
    case Some{child}: O.child_invocation(child)

def find_inv_case(
  +hit: Bool,
  +inv: Nat,
  +head: O.Child,
  +tail: List<&2, O.Child>,
  +child: O.Child,
  matched: {Nat.is_eq(inv, O.child_invocation(head)) == hit : Bool},
  ih: {
    O.find(inv, tail)
    == Some{child}
    : Maybe<&2, O.Child>
  } -> {inv == O.child_invocation(child) : Nat},
  found: {
    Bool.pick(Maybe<&2, O.Child>, hit, Some{head}, O.find(inv, tail))
    == Some{child}
    : Maybe<&2, O.Child>
  }
) -> {
  inv == O.child_invocation(child) : Nat
}:
  match hit:
    case True{}:
      %Equal.sym(
        Nat,
        inv,
        O.child_invocation(head),
        N.eq_of_is_eq(inv, O.child_invocation(head), matched)
      ) : {
        _ == O.child_invocation(child) : Nat
      }
      Equal.cong(Maybe<&2, O.Child>, Nat, observed_invocation, Some{head}, Some{child}, found)
    case False{}: ih(found)

def find_inv_exact(+children: List<&2, O.Child>, +inv: Nat, +child: O.Child,
    found: {O.find(inv, children) == Some{child} : Maybe<&2, O.Child>}) -> {
  inv == O.child_invocation(child) : Nat
}:
  match children:
    case Nil{}:
      Empty.absurd({inv == O.child_invocation(child) : Nat},
        B.internal_false_ne_true(Equal.cong(Maybe<&2, O.Child>, Bool,
          value => Maybe.is_some(&2, O.Child, value), None{}, Some{child}, found)))
    case +head <> +tail:
      find_inv_case(Nat.is_eq(inv, O.child_invocation(head)), inv, head, tail, child,
        {==}, e => find_inv_exact(tail, inv, child, e), found)

def found_again_exact(+children: List<&2, O.Child>, +inv: Nat, +child: O.Child,
    +found: {O.find(inv, children) == Some{child} : Maybe<&2, O.Child>}) -> {
  O.find(O.child_invocation(child), children) == Some{child} : Maybe<&2, O.Child>
}:
  %find_inv_exact(children, inv, child, found) : {
    O.find(_, children) == Some{child} : Maybe<&2, O.Child>
  }
  found

def install_matches_exact(+child: O.Child, +generation: Nat) -> {
  O.install_matches(child, generation) == S.installable(child, generation) : Bool
}:
  match child:
    case O.Child{_, _, +epoch, _, +phase, _, None{}, _}:
      Equal.cong(Bool, Bool, value => Bool.and(Nat.is_eq(epoch, generation), value),
        O.installing(phase), S.install_phase(phase), installing_exact(phase))
    case O.Child{_, _, _, _, _, _, Some{_}, _}: {==}

def delivery_selected_live_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  found: {
    O.find(inv, O.state_children(state))
    == Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    }
    : Maybe<&2, O.Child>
  }
) -> {
  O.child_live(
    O.state_canonical(state),
    O.state_children(state),
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )
  == S.live(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )
  : Bool
}:
  %Equal.sym(
    Maybe<&2, O.Child>,
    O.find(inv, O.state_children(state)),
    Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    found
  ) : {
    Bool.and(O.delivery_current(op, inv, epoch, _), O.parent_live(parent, O.state_children(state)))
    == S.live(
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
    : Bool
  }
  current_parent_live_exact(
    state,
    op,
    origin,
    ctx,
    perm,
    input,
    inv,
    epoch,
    handle,
    phase,
    pending,
    lease,
    parent
  )

def handoff_ready_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +result: Nat,
  +next_permission: O.DeliveryPermission
) -> {
  O.issue_delivery(
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      None{},
      None{}
    },
    result,
    next_permission
  )
  == S.handoff(
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      None{},
      None{}
    },
    result,
    next_permission
  )
  : O.Step
}:
  match state:
    case O.State{+canonical, +next, +next_lease, +children}:
      %retire_exact(inv, handle) : {
        O.issue_delivery(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            None{},
            None{}
          },
          result,
          next_permission
        )
        == O.Advanced{
          O.State{
            canonical,
            Nat.add(next, 1n),
            next_lease,
            O.Child{
              O.DeliveryScope{next, origin, ctx, next_permission, result},
              next,
              0n,
              0n,
              O.ChildInstalling{},
              None{},
              None{},
              None{}
            } <> O.replace(
              inv,
              children,
              O.Child{
                O.DeliveryScope{inv, origin, ctx, perm, input},
                inv,
                epoch,
                0n,
                O.ChildAccepted{},
                None{},
                None{},
                None{}
              }
            )
          },
          Nil{},
          O.IssueDeliveryHandoff{
            inv,
            O.DeliveryReceipt{next, 0n, origin, ctx, next_permission, result}
          } <> _
        }
        : O.Step
      }
      {==}

def handoff_delivery_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +result: Nat,
  +next_permission: O.DeliveryPermission
) -> {
  O.issue_delivery(
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    result,
    next_permission
  )
  == S.handoff(
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    result,
    next_permission
  )
  : O.Step
}:
  match state lease parent:
    case O.State{_, _, _, _} None{} None{}: handoff_ready_exact(
      state,
      op,
      origin,
      ctx,
      perm,
      input,
      inv,
      epoch,
      handle,
      phase,
      pending,
      result,
      next_permission
    )
    case O.State{_, _, _, _} None{} Some{_}: {==}
    case O.State{_, _, _, _} Some{_} None{}: {==}
    case O.State{_, _, _, _} Some{_} Some{_}: {==}

def accepted_result_exact(+state: O.State, +child: O.Child, +result: Nat) -> {
  O.terminal_allowed(True{}, state, child, result)
  == S.accepted_result(state, child, result)
  : O.Step
}:
  match child:
    case O.Child{+scope, +inv, +epoch, +handle, _, _, None{}, +parent}:
      %retire_exact(inv, handle) : {
        O.terminal_allowed(True{}, state, child, result)
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
    case O.Child{_, _, _, _, _, _, Some{_}, _}: {==}

def complete_permission_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +result: Nat,
  +selection: O.DeliverySelection
) -> {
  O.complete_delivery_permission(
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    result,
    selection
  )
  == S.complete_stage(
    True{},
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    result,
    selection
  )
  : O.Step
}:
  match perm:
    case O.CollectDelivery{}:
      handoff_delivery_exact(
        state,
        op,
        origin,
        ctx,
        perm,
        input,
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent,
        result,
        O.PrepareDeliveryIssued{selection}
      )
    case O.PrepareDeliveryIssued{_}:
      {==}
    case O.PrepareDelivery{+original}:
      handoff_delivery_exact(
        state,
        op,
        origin,
        ctx,
        perm,
        input,
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent,
        result,
        O.FinalizeDeliveryIssued{original}
      )
    case O.FinalizeDeliveryIssued{_}:
      {==}
    case O.FinalizeDelivery{_}:
      accepted_result_exact(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        },
        result
      )

def complete_allowed_exact(
  +valid: Bool,
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +result: Nat,
  +selection: O.DeliverySelection
) -> {
  O.complete_delivery_allowed(
    valid,
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    result,
    selection
  )
  == S.complete_stage(
    valid,
    state,
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    result,
    selection
  )
  : O.Step
}:
  match valid:
    case False{}: {==}
    case True{}: complete_permission_exact(
      state,
      op,
      origin,
      ctx,
      perm,
      input,
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent,
      result,
      selection
    )

def complete_rejected_if(
  +valid: Bool,
  +state: O.State,
  +child: O.Child,
  +result: Nat,
  +selection: O.DeliverySelection,
  rejected: {
    O.complete_delivery_permission(state, child, result, selection)
    == O.Rejected{state, O.WrongPhase{}}
    : O.Step
  }
) -> {
      O.complete_delivery_allowed(valid, state, child, result, selection)
      == O.Rejected{state, O.WrongPhase{}}
      : O.Step
    }:
  match valid:
    case False{}: {==}
    case True{}: rejected

def complete_scope_exact(
  +state: O.State,
  +scope: O.Scope,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +attempt_generation: Nat,
  +result: Nat,
  +selection: O.DeliverySelection,
  found: {
    O.find(inv, O.state_children(state))
    == Some{O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}}
    : Maybe<&2, O.Child>
  }
) -> {
  O.complete_delivery_found(
    state,
    Some{O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}},
    attempt_generation,
    result,
    selection
  )
  == S.complete_found(
    state,
    Some{O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}},
    attempt_generation,
    result,
    selection
  )
  : O.Step
}:
  match scope:
    case O.DeliveryScope{+op, +origin, +ctx, +perm, +input}:
      %and_exact(
        O.child_live(
          O.state_canonical(state),
          O.state_children(state),
          O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
        ),
        S.live(O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}),
        O.install_matches(
          O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
          attempt_generation
        ),
        S.installable(
          O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
          attempt_generation
        ),
        delivery_selected_live_exact(
          state,
          op,
          origin,
          ctx,
          perm,
          input,
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent,
          found
        ),
        install_matches_exact(
          O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
          attempt_generation
        )
      ) : {
          O.complete_delivery_allowed(
            Bool.and(
              O.child_live(
                O.state_canonical(state),
                O.state_children(state),
                O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
              ),
              O.install_matches(
                O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
                attempt_generation
              )
            ),
            state,
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            result,
            selection
          )
          == S.complete_stage(
            _,
            state,
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            result,
            selection
          )
          : O.Step
        }
      complete_allowed_exact(
        Bool.and(
          O.child_live(
            O.state_canonical(state),
            O.state_children(state),
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
          ),
          O.install_matches(
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            attempt_generation
          )
        ),
        state,
        op,
        origin,
        ctx,
        perm,
        input,
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent,
        result,
        selection
      )
    case O.EvaluationScope{_, _, _}:
      complete_rejected_if(
        Bool.and(
          O.child_live(
            O.state_canonical(state),
            O.state_children(state),
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
          ),
          O.install_matches(
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            attempt_generation
          )
        ),
        state,
        O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
        result,
        selection,
        {==}
      )
    case O.SettingsScope{_}:
      complete_rejected_if(
        Bool.and(
          O.child_live(
            O.state_canonical(state),
            O.state_children(state),
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
          ),
          O.install_matches(
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            attempt_generation
          )
        ),
        state,
        O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
        result,
        selection,
        {==}
      )
    case O.FreshnessScope{_}:
      complete_rejected_if(
        Bool.and(
          O.child_live(
            O.state_canonical(state),
            O.state_children(state),
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
          ),
          O.install_matches(
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            attempt_generation
          )
        ),
        state,
        O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
        result,
        selection,
        {==}
      )
    case O.Scope{_, _, _, _}:
      complete_rejected_if(
        Bool.and(
          O.child_live(
            O.state_canonical(state),
            O.state_children(state),
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
          ),
          O.install_matches(
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            attempt_generation
          )
        ),
        state,
        O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
        result,
        selection,
        {==}
      )
    case O.SourceScope{_, _, _, _, _}:
      complete_rejected_if(
        Bool.and(
          O.child_live(
            O.state_canonical(state),
            O.state_children(state),
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
          ),
          O.install_matches(
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            attempt_generation
          )
        ),
        state,
        O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
        result,
        selection,
        {==}
      )
    case O.AfterSourceScope{_, _, _, _, _, _, _}:
      complete_rejected_if(
        Bool.and(
          O.child_live(
            O.state_canonical(state),
            O.state_children(state),
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
          ),
          O.install_matches(
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            attempt_generation
          )
        ),
        state,
        O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
        result,
        selection,
        {==}
      )
    case O.PreparationScope{_, _, _, _}:
      complete_rejected_if(
        Bool.and(
          O.child_live(
            O.state_canonical(state),
            O.state_children(state),
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
          ),
          O.install_matches(
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            attempt_generation
          )
        ),
        state,
        O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
        result,
        selection,
        {==}
      )
    case O.RetainingScope{_, _, _, _, _}:
      complete_rejected_if(
        Bool.and(
          O.child_live(
            O.state_canonical(state),
            O.state_children(state),
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
          ),
          O.install_matches(
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            attempt_generation
          )
        ),
        state,
        O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
        result,
        selection,
        {==}
      )
    case O.AdviceTailScope{_, _, _, _, _, _}:
      complete_rejected_if(
        Bool.and(
          O.child_live(
            O.state_canonical(state),
            O.state_children(state),
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent}
          ),
          O.install_matches(
            O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
            attempt_generation
          )
        ),
        state,
        O.Child{scope, inv, epoch, handle, phase, pending, lease, parent},
        result,
        selection,
        {==}
      )

def complete_child_exact(
  +state: O.State,
  +child: O.Child,
  +generation: Nat,
  +result: Nat,
  +selection: O.DeliverySelection,
  found: {
    O.find(O.child_invocation(child), O.state_children(state))
    == Some{child}
    : Maybe<&2, O.Child>
  }
) -> {
  O.complete_delivery_found(state, Some{child}, generation, result, selection)
  == S.complete_found(state, Some{child}, generation, result, selection) : O.Step
}:
  match child:
    case O.Child{+scope, +inv, +epoch, +handle, +phase, +pending, +lease, +parent}:
      complete_scope_exact(
        state,
        scope,
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent,
        generation,
        result,
        selection,
        found
      )

def complete_found_witness_exact(+state: O.State, +request: Nat, +found: Maybe<&2, O.Child>,
    +generation: Nat, +result: Nat, +selection: O.DeliverySelection,
    witness: {O.find(request, O.state_children(state)) == found : Maybe<&2, O.Child>}) -> {
  O.complete_delivery_found(state, found, generation, result, selection)
  == S.complete_found(state, found, generation, result, selection) : O.Step
}:
  match found:
    case None{}: {==}
    case Some{+child}:
      complete_child_exact(state, child, generation, result, selection,
        found_again_exact(O.state_children(state), request, child, witness))

def Laws.delivery_completion_exact(state, invocation, generation, result, selection):
  match state:
    case O.State{_, _, _, +children}:
      complete_found_witness_exact(
        state,
        invocation,
        O.find(invocation, children),
        generation,
        result,
        selection,
        {==}
      )

def can_install_exact(+permission: O.DeliveryPermission) -> {
  O.delivery_installable(permission) == S.can_install(permission) : Bool
}:
  match permission:
    case O.CollectDelivery{}: {==}
    case O.PrepareDeliveryIssued{_}: {==}
    case O.PrepareDelivery{_}: {==}
    case O.FinalizeDeliveryIssued{_}: {==}
    case O.FinalizeDelivery{_}: {==}

def install_allowed_exact(
  +valid: Bool,
  +state: O.State,
  +child: O.Child,
  +handle: Nat,
  +request: Nat
) -> {
  O.install_allowed(valid, state, child, handle, request)
  == S.install_valid(valid, state, child, handle, request)
  : O.Step
}:
  match valid child:
    case False{} _: {==}
    case True{} O.Child{_, _, _, _, _, _, _, _}: {==}

def start_allowed_exact(+valid: Bool, +state: O.State, +child: O.Child) -> {
  O.provider_allowed(valid, state, child) == S.start_valid(valid, state, child) : O.Step
}:
  match valid state child:
    case False{} _ _: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildInstalling{}, _, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildAwaiting{}, _, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildResuming{}, _, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildAccepted{}, _, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildCancelled{}, _, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildReady{}, None{}, _, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildReady{}, Some{_}, None{}, _}: {==}
    case True{} O.State{_, _, _, _} O.Child{_, _, _, _, O.ChildReady{}, Some{_}, Some{_}, _}: {==}

def install_whole_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +new_handle: Nat,
  +request: Nat
) -> {
  O.install(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    inv,
    generation,
    new_handle,
    request
  )
  == S.install_delivery(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    generation,
    new_handle,
    request
  )
  : O.Step
}:
  %Equal.sym(
    Maybe<&2, O.Child>,
    O.find(
      inv,
      O.state_children(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
      )
    ),
    Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    state_head_exact(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
  ) : {
    O.install_found(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      _,
      generation,
      new_handle,
      request
    )
    == S.install_delivery(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      },
      generation,
      new_handle,
      request
    )
    : O.Step
  }
  %and_exact(
    O.child_live(
      O.state_canonical(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
      ),
      O.state_children(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
      ),
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    S.live(
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    Bool.and(
      O.delivery_installable(perm),
      O.install_matches(
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        },
        generation
      )
    ),
    Bool.and(
      S.can_install(perm),
      S.installable(
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        },
        generation
      )
    ),
    delivery_live_exact(
      state,
      op,
      origin,
      ctx,
      perm,
      input,
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    ),
    and_exact(
      O.delivery_installable(perm),
      S.can_install(perm),
      O.install_matches(
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        },
        generation
      ),
      S.installable(
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        },
        generation
      ),
      can_install_exact(perm),
      install_matches_exact(
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        },
        generation
      )
    )
  ) : {
      O.install_allowed(
        Bool.and(
          O.child_live(
            O.state_canonical(
              S.state_with(
                state,
                O.Child{
                  O.DeliveryScope{op, origin, ctx, perm, input},
                  inv,
                  epoch,
                  handle,
                  phase,
                  pending,
                  lease,
                  parent
                }
              )
            ),
            O.state_children(
              S.state_with(
                state,
                O.Child{
                  O.DeliveryScope{op, origin, ctx, perm, input},
                  inv,
                  epoch,
                  handle,
                  phase,
                  pending,
                  lease,
                  parent
                }
              )
            ),
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            }
          ),
          Bool.and(
            O.delivery_installable(perm),
            O.install_matches(
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              },
              generation
            )
          )
        ),
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        ),
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        },
        new_handle,
        request
      )
      == S.install_valid(
        _,
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        ),
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        },
        new_handle,
        request
      )
      : O.Step
    }
  install_allowed_exact(
    Bool.and(
      O.child_live(
        O.state_canonical(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            }
          )
        ),
        O.state_children(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            }
          )
        ),
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      Bool.and(
        O.delivery_installable(perm),
        O.install_matches(
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          },
          generation
        )
      )
    ),
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    new_handle,
    request
  )

def start_whole_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>
) -> {
  O.provider_start(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    inv
  )
  == S.provider_start(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )
  : O.Step
}:
  %Equal.sym(
    Maybe<&2, O.Child>,
    O.find(
      inv,
      O.state_children(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
      )
    ),
    Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    state_head_exact(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
  ) : {
    O.provider_found(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      _
    )
    == S.provider_start(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
    : O.Step
  }
  %delivery_live_exact(
    state,
    op,
    origin,
    ctx,
    perm,
    input,
    inv,
    epoch,
    handle,
    phase,
    pending,
    lease,
    parent
  ) : {
    O.provider_allowed(
      O.child_live(
        O.state_canonical(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            }
          )
        ),
        O.state_children(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            }
          )
        ),
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
    == S.start_valid(
      _,
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
    : O.Step
  }
  start_allowed_exact(
    O.child_live(
      O.state_canonical(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
      ),
      O.state_children(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
      ),
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )

def permit_present_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +pending_value: Nat,
  +actual_lease: Nat,
  +expected_request: Nat,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +requested_lease: Nat,
  +requested_request: Nat
) -> {
  O.provider_permit_found(
    O.state_canonical(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      )
    ),
    O.state_children(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      )
    ),
    inv,
    generation,
    requested_lease,
    requested_request,
    Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending_value},
        Some{O.Lease{actual_lease, expected_request}},
        parent
      }
    }
  )
  == S.provider_live(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      O.ChildAwaiting{},
      Some{pending_value},
      Some{O.Lease{actual_lease, expected_request}},
      parent
    },
    inv,
    generation,
    requested_lease,
    requested_request
  )
  : Bool
}:
  Equal.trans(
    Bool,
    Bool.and(
      O.provider_permit_matches(
        inv,
        generation,
        requested_lease,
        requested_request,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      ),
      O.child_live(
        O.state_canonical(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending_value},
              Some{O.Lease{actual_lease, expected_request}},
              parent
            }
          )
        ),
        O.state_children(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending_value},
              Some{O.Lease{actual_lease, expected_request}},
              parent
            }
          )
        ),
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      )
    ),
    Bool.and(
      O.child_live(
        O.state_canonical(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending_value},
              Some{O.Lease{actual_lease, expected_request}},
              parent
            }
          )
        ),
        O.state_children(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending_value},
              Some{O.Lease{actual_lease, expected_request}},
              parent
            }
          )
        ),
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      ),
      O.provider_permit_matches(
        inv,
        generation,
        requested_lease,
        requested_request,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      )
    ),
    S.provider_live(
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending_value},
        Some{O.Lease{actual_lease, expected_request}},
        parent
      },
      inv,
      generation,
      requested_lease,
      requested_request
    ),
    B.and_comm(
      O.provider_permit_matches(
        inv,
        generation,
        requested_lease,
        requested_request,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      ),
      O.child_live(
        O.state_canonical(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending_value},
              Some{O.Lease{actual_lease, expected_request}},
              parent
            }
          )
        ),
        O.state_children(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending_value},
              Some{O.Lease{actual_lease, expected_request}},
              parent
            }
          )
        ),
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      )
    ),
    and_exact(
      O.child_live(
        O.state_canonical(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending_value},
              Some{O.Lease{actual_lease, expected_request}},
              parent
            }
          )
        ),
        O.state_children(
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending_value},
              Some{O.Lease{actual_lease, expected_request}},
              parent
            }
          )
        ),
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      ),
      S.live(
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      ),
      O.provider_permit_matches(
        inv,
        generation,
        requested_lease,
        requested_request,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      ),
      O.provider_permit_matches(
        inv,
        generation,
        requested_lease,
        requested_request,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          Some{O.Lease{actual_lease, expected_request}},
          parent
        }
      ),
      delivery_live_exact(
        state,
        op,
        origin,
        ctx,
        perm,
        input,
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending_value},
        Some{O.Lease{actual_lease, expected_request}},
        parent
      ),
      {==}
    )
  )

def permit_lease_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +pending_value: Nat,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +requested_lease: Nat,
  +requested_request: Nat
) -> {
  O.provider_permit_found(
    O.state_canonical(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          lease,
          parent
        }
      )
    ),
    O.state_children(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending_value},
          lease,
          parent
        }
      )
    ),
    inv,
    generation,
    requested_lease,
    requested_request,
    Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending_value},
        lease,
        parent
      }
    }
  )
  == S.provider_live(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      O.ChildAwaiting{},
      Some{pending_value},
      lease,
      parent
    },
    inv,
    generation,
    requested_lease,
    requested_request
  )
  : Bool
}:
  match lease:
    case None{}: {==}
    case Some{O.Lease{+actual_lease, +expected_request}}:
      permit_present_exact(
        state,
        op,
        origin,
        ctx,
        perm,
        input,
        inv,
        epoch,
        handle,
        pending_value,
        actual_lease,
        expected_request,
        parent,
        generation,
        requested_lease,
        requested_request
      )

def permit_pending_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +requested_lease: Nat,
  +requested_request: Nat
) -> {
  O.provider_permit_found(
    O.state_canonical(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          pending,
          lease,
          parent
        }
      )
    ),
    O.state_children(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          pending,
          lease,
          parent
        }
      )
    ),
    inv,
    generation,
    requested_lease,
    requested_request,
    Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        pending,
        lease,
        parent
      }
    }
  )
  == S.provider_live(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      O.ChildAwaiting{},
      pending,
      lease,
      parent
    },
    inv,
    generation,
    requested_lease,
    requested_request
  )
  : Bool
}:
  match pending:
    case None{}: {==}
    case Some{+pending_value}: permit_lease_exact(
      state,
      op,
      origin,
      ctx,
      perm,
      input,
      inv,
      epoch,
      handle,
      pending_value,
      lease,
      parent,
      generation,
      requested_lease,
      requested_request
    )

def permit_phase_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +requested_lease: Nat,
  +requested_request: Nat
) -> {
  O.provider_permit_found(
    O.state_canonical(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      )
    ),
    O.state_children(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      )
    ),
    inv,
    generation,
    requested_lease,
    requested_request,
    Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    }
  )
  == S.provider_live(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    inv,
    generation,
    requested_lease,
    requested_request
  )
  : Bool
}:
  match phase:
    case O.ChildInstalling{}: {==}
    case O.ChildReady{}: {==}
    case O.ChildAwaiting{}: permit_pending_exact(
      state,
      op,
      origin,
      ctx,
      perm,
      input,
      inv,
      epoch,
      handle,
      pending,
      lease,
      parent,
      generation,
      requested_lease,
      requested_request
    )
    case O.ChildResuming{}: {==}
    case O.ChildAccepted{}: {==}
    case O.ChildCancelled{}: {==}

def permit_whole_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +generation: Nat,
  +requested_lease: Nat,
  +requested_request: Nat
) -> {
  O.provider_live(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    inv,
    generation,
    requested_lease,
    requested_request
  )
  == S.provider_live(
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    inv,
    generation,
    requested_lease,
    requested_request
  )
  : Bool
}:
  match state:
    case O.State{_, _, _, _}:
      %Equal.sym(
        Maybe<&2, O.Child>,
        O.find(
          inv,
          O.state_children(
            S.state_with(
              state,
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            )
          )
        ),
        Some{
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        },
        state_head_exact(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
      ) : {
        O.provider_permit_found(
          O.state_canonical(
            S.state_with(
              state,
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            )
          ),
          O.state_children(
            S.state_with(
              state,
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            )
          ),
          inv,
          generation,
          requested_lease,
          requested_request,
          _
        )
        == S.provider_live(
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          },
          inv,
          generation,
          requested_lease,
          requested_request
        )
        : Bool
      }
      permit_phase_exact(
        state,
        op,
        origin,
        ctx,
        perm,
        input,
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent,
        generation,
        requested_lease,
        requested_request
      )

def completed_some_active_exact(
  +valid: Bool,
  +state: O.State,
  +scope: O.Scope,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +actual_lease: Nat,
  +expected_request: Nat,
  +parent: Maybe<&2, O.Parent>,
  +reply: Nat
) -> {
  O.completion_active(
    valid,
    state,
    O.Child{
      scope,
      inv,
      epoch,
      handle,
      phase,
      pending,
      Some{O.Lease{actual_lease, expected_request}},
      parent
    },
    reply
  )
  == S.completed_active(
    valid,
    state,
    O.Child{
      scope,
      inv,
      epoch,
      handle,
      phase,
      pending,
      Some{O.Lease{actual_lease, expected_request}},
      parent
    },
    reply
  )
  : O.Step
}:
  match valid phase:
    case False{} _:
      %retire_exact(inv, handle) : {
        O.completion_active(
          valid,
          state,
          O.Child{
            scope,
            inv,
            epoch,
            handle,
            phase,
            pending,
            Some{O.Lease{actual_lease, expected_request}},
            parent
          },
          reply
        )
        == O.updated(
          state,
          O.ChildUpdate{
            O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
            O.CleanupProvider{inv, actual_lease} <> _
          }
        )
        : O.Step
      }
      {==}
    case True{} O.ChildInstalling{}:
      %retire_exact(inv, handle) : {
        O.completion_active(
          valid,
          state,
          O.Child{
            scope,
            inv,
            epoch,
            handle,
            phase,
            pending,
            Some{O.Lease{actual_lease, expected_request}},
            parent
          },
          reply
        )
        == O.updated(
          state,
          O.ChildUpdate{
            O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
            O.CleanupProvider{inv, actual_lease} <> _
          }
        )
        : O.Step
      }
      {==}
    case True{} O.ChildReady{}:
      %retire_exact(inv, handle) : {
        O.completion_active(
          valid,
          state,
          O.Child{
            scope,
            inv,
            epoch,
            handle,
            phase,
            pending,
            Some{O.Lease{actual_lease, expected_request}},
            parent
          },
          reply
        )
        == O.updated(
          state,
          O.ChildUpdate{
            O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
            O.CleanupProvider{inv, actual_lease} <> _
          }
        )
        : O.Step
      }
      {==}
    case True{} O.ChildAwaiting{}:
      %retire_exact(inv, handle) : {
        O.completion_active(
          valid,
          state,
          O.Child{
            scope,
            inv,
            epoch,
            handle,
            phase,
            pending,
            Some{O.Lease{actual_lease, expected_request}},
            parent
          },
          reply
        )
        == O.updated(
          state,
          O.ChildUpdate{
            O.Child{scope, inv, Nat.add(epoch, 1n), 0n, O.ChildResuming{}, None{}, None{}, parent},
            O.Resume{
              inv,
              Nat.add(epoch, 1n),
              handle,
              reply
            } <> List.append(&2, O.Action, _, O.CleanupProvider{inv, actual_lease} <> Nil{})
          }
        )
        : O.Step
      }
      {==}
    case True{} O.ChildResuming{}:
      %retire_exact(inv, handle) : {
        O.completion_active(
          valid,
          state,
          O.Child{
            scope,
            inv,
            epoch,
            handle,
            phase,
            pending,
            Some{O.Lease{actual_lease, expected_request}},
            parent
          },
          reply
        )
        == O.updated(
          state,
          O.ChildUpdate{
            O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
            O.CleanupProvider{inv, actual_lease} <> _
          }
        )
        : O.Step
      }
      {==}
    case True{} O.ChildAccepted{}:
      %retire_exact(inv, handle) : {
        O.completion_active(
          valid,
          state,
          O.Child{
            scope,
            inv,
            epoch,
            handle,
            phase,
            pending,
            Some{O.Lease{actual_lease, expected_request}},
            parent
          },
          reply
        )
        == O.updated(
          state,
          O.ChildUpdate{
            O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
            O.CleanupProvider{inv, actual_lease} <> _
          }
        )
        : O.Step
      }
      {==}
    case True{} O.ChildCancelled{}:
      %retire_exact(inv, handle) : {
        O.completion_active(
          valid,
          state,
          O.Child{
            scope,
            inv,
            epoch,
            handle,
            phase,
            pending,
            Some{O.Lease{actual_lease, expected_request}},
            parent
          },
          reply
        )
        == O.updated(
          state,
          O.ChildUpdate{
            O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
            O.CleanupProvider{inv, actual_lease} <> _
          }
        )
        : O.Step
      }
      {==}

def completed_active_exact(+valid: Bool, +state: O.State, +child: O.Child, +reply: Nat) -> {
  O.completion_active(valid, state, child, reply)
  == S.completed_active(valid, state, child, reply)
  : O.Step
}:
  match valid child:
    case False{} O.Child{_, _, _, _, _, _, None{}, _}: {==}
    case True{} O.Child{_, _, _, _, O.ChildInstalling{}, _, None{}, _}: {==}
    case True{} O.Child{_, _, _, _, O.ChildReady{}, _, None{}, _}: {==}
    case True{} O.Child{_, _, _, _, O.ChildAwaiting{}, _, None{}, _}: {==}
    case True{} O.Child{_, _, _, _, O.ChildResuming{}, _, None{}, _}: {==}
    case True{} O.Child{_, _, _, _, O.ChildAccepted{}, _, None{}, _}: {==}
    case True{} O.Child{_, _, _, _, O.ChildCancelled{}, _, None{}, _}: {==}
    case False{} O.Child{
      +scope,
      +inv,
      +epoch,
      +handle,
      +phase,
      +pending,
      Some{O.Lease{+actual_lease, +expected_request}},
      +parent
    }:
      completed_some_active_exact(
        False{},
        state,
        scope,
        inv,
        epoch,
        handle,
        phase,
        pending,
        actual_lease,
        expected_request,
        parent,
        reply
      )
    case True{} O.Child{
      +scope,
      +inv,
      +epoch,
      +handle,
      +phase,
      +pending,
      Some{O.Lease{+actual_lease, +expected_request}},
      +parent
    }:
      completed_some_active_exact(
        True{},
        state,
        scope,
        inv,
        epoch,
        handle,
        phase,
        pending,
        actual_lease,
        expected_request,
        parent,
        reply
      )

def completed_matched_exact(
  +matched: Bool,
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +reply: Nat
) -> {
  O.completion_matched(
    matched,
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    reply
  )
  == S.completed_valid(
    matched,
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    reply
  )
  : O.Step
}:
  match matched:
    case False{}: {==}
    case True{}:
      %delivery_live_exact(
        state,
        op,
        origin,
        ctx,
        perm,
        input,
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      ) : {
        O.reconcile_cancel(
          O.completion_active(
            O.child_live(
              O.state_canonical(
                S.state_with(
                  state,
                  O.Child{
                    O.DeliveryScope{op, origin, ctx, perm, input},
                    inv,
                    epoch,
                    handle,
                    phase,
                    pending,
                    lease,
                    parent
                  }
                )
              ),
              O.state_children(
                S.state_with(
                  state,
                  O.Child{
                    O.DeliveryScope{op, origin, ctx, perm, input},
                    inv,
                    epoch,
                    handle,
                    phase,
                    pending,
                    lease,
                    parent
                  }
                )
              ),
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            ),
            S.state_with(
              state,
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            ),
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            },
            reply
          )
        )
        == O.reconcile_cancel(
          S.completed_active(
            _,
            S.state_with(
              state,
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            ),
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            },
            reply
          )
        )
        : O.Step
      }
      %completed_active_exact(
        O.child_live(
          O.state_canonical(
            S.state_with(
              state,
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            )
          ),
          O.state_children(
            S.state_with(
              state,
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            )
          ),
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        ),
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        ),
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        },
        reply
      ) : {
        O.reconcile_cancel(
          O.completion_active(
            O.child_live(
              O.state_canonical(
                S.state_with(
                  state,
                  O.Child{
                    O.DeliveryScope{op, origin, ctx, perm, input},
                    inv,
                    epoch,
                    handle,
                    phase,
                    pending,
                    lease,
                    parent
                  }
                )
              ),
              O.state_children(
                S.state_with(
                  state,
                  O.Child{
                    O.DeliveryScope{op, origin, ctx, perm, input},
                    inv,
                    epoch,
                    handle,
                    phase,
                    pending,
                    lease,
                    parent
                  }
                )
              ),
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            ),
            S.state_with(
              state,
              O.Child{
                O.DeliveryScope{op, origin, ctx, perm, input},
                inv,
                epoch,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            ),
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            },
            reply
          )
        )
        == O.reconcile_cancel(_)
        : O.Step
      }
      {==}

def completed_after_head_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +requested_lease: Nat,
  +requested_request: Nat,
  +reply: Nat
) -> {
  O.completion_found(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    requested_lease,
    requested_request,
    reply
  )
  == S.provider_completed(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    requested_lease,
    requested_request,
    reply
  )
  : O.Step
}:
  match lease:
    case None{}: {==}
    case Some{O.Lease{+actual_lease, +expected_request}}:
      %and_exact(
        Nat.is_eq(actual_lease, requested_lease),
        Nat.is_eq(requested_lease, actual_lease),
        Nat.is_eq(expected_request, requested_request),
        Nat.is_eq(requested_request, expected_request),
        N.is_eq_comm(actual_lease, requested_lease),
        N.is_eq_comm(expected_request, requested_request)
      ) : {
        O.completion_matched(
          Bool.and(
            Nat.is_eq(actual_lease, requested_lease),
            Nat.is_eq(expected_request, requested_request)
          ),
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            }
          ),
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          },
          reply
        )
        == S.completed_valid(
          _,
          S.state_with(
            state,
            O.Child{
              O.DeliveryScope{op, origin, ctx, perm, input},
              inv,
              epoch,
              handle,
              phase,
              pending,
              lease,
              parent
            }
          ),
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          },
          reply
        )
        : O.Step
      }
      completed_matched_exact(
        Bool.and(
          Nat.is_eq(actual_lease, requested_lease),
          Nat.is_eq(expected_request, requested_request)
        ),
        state,
        op,
        origin,
        ctx,
        perm,
        input,
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent,
        reply
      )

def completed_whole_exact(
  +state: O.State,
  +op: Nat,
  +origin: Nat,
  +ctx: O.DeliveryContext,
  +perm: O.DeliveryPermission,
  +input: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +lease: Maybe<&2, O.Lease>,
  +parent: Maybe<&2, O.Parent>,
  +requested_lease: Nat,
  +requested_request: Nat,
  +reply: Nat
) -> {
  O.provider_completed(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    inv,
    requested_lease,
    requested_request,
    reply
  )
  == S.provider_completed(
    S.state_with(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    ),
    O.Child{
      O.DeliveryScope{op, origin, ctx, perm, input},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    requested_lease,
    requested_request,
    reply
  )
  : O.Step
}:
  %Equal.sym(
    Maybe<&2, O.Child>,
    O.find(
      inv,
      O.state_children(
        S.state_with(
          state,
          O.Child{
            O.DeliveryScope{op, origin, ctx, perm, input},
            inv,
            epoch,
            handle,
            phase,
            pending,
            lease,
            parent
          }
        )
      )
    ),
    Some{
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    state_head_exact(
      state,
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
  ) : {
    O.completion_found(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      _,
      requested_lease,
      requested_request,
      reply
    )
    == S.provider_completed(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{op, origin, ctx, perm, input},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      O.Child{
        O.DeliveryScope{op, origin, ctx, perm, input},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      },
      requested_lease,
      requested_request,
      reply
    )
    : O.Step
  }
  completed_after_head_exact(
    state,
    op,
    origin,
    ctx,
    perm,
    input,
    inv,
    epoch,
    handle,
    phase,
    pending,
    lease,
    parent,
    requested_lease,
    requested_request,
    reply
  )

def Laws.delivery_provider_cycle_exact(
  state,
  operation,
  origin,
  context,
  permission,
  input,
  invocation,
  generation,
  handle,
  phase,
  pending,
  lease,
  parent,
  attempt_generation,
  new_handle,
  request,
  lease_id,
  reply
):
  (
    install_whole_exact(
      state,
      operation,
      origin,
      context,
      permission,
      input,
      invocation,
      generation,
      handle,
      phase,
      pending,
      lease,
      parent,
      attempt_generation,
      new_handle,
      request
    ),
    (
      start_whole_exact(
        state,
        operation,
        origin,
        context,
        permission,
        input,
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      ),
      (
        permit_whole_exact(
          state,
          operation,
          origin,
          context,
          permission,
          input,
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent,
          attempt_generation,
          lease_id,
          request
        ),
        completed_whole_exact(
          state,
          operation,
          origin,
          context,
          permission,
          input,
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent,
          lease_id,
          request,
          reply
        )
      )
    )
  )
