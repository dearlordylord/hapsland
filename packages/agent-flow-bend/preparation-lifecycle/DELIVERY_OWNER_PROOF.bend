import Base
import ../../../vendor/bendlib/packages/bend-mathlib/nat.bend as N
import ./CanonicalResolverOwner.bend as O
import ./DeliveryOwnerSpecification.bend as S
import ./DELIVERY_OWNER_LAWS.bend as Laws

# Temporary correspondence proof; delete with its laws/specification at whole
# delivery acceptance after retaining the accepted semantic properties.

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
