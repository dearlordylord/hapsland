import Base
import ./CanonicalResolverOwner.bend as O

# Independent delivery lifecycle equations for the current Bend Owner API.
# DELIVERY_OWNER_PROOF checks the owner-approved implementation correspondence.
# Reuses Owner nominal data, first-match child lookup, state replacement, and
# reconcile_cancel (shared cross-family invalidation). Delivery permissions,
# phase/lease fences, receipt equality and action order are specified here.
# This does not model native pointers, cleanup success or canonical lifetime
# revocation: DeliveryContext binds receipts, while native authority stays native.

def children(+state: O.State) -> List<&2, O.Child>:
  match state:
    case O.State{_, _, _, +values}: values

def running(+phase: O.Phase) -> Bool:
  match phase:
    case O.ChildInstalling{}: True{}
    case O.ChildReady{}: True{}
    case O.ChildAwaiting{}: True{}
    case O.ChildResuming{}: True{}
    case _: False{}

def install_phase(+phase: O.Phase) -> Bool:
  match phase:
    case O.ChildInstalling{}: True{}
    case O.ChildResuming{}: True{}
    case _: False{}

def live(+child: O.Child) -> Bool:
  match child:
    case O.Child{O.DeliveryScope{+operation, _, _, _, _}, +inv, _, _, +phase, _, _, None{}}:
      Bool.and(Nat.is_eq(operation, inv), running(phase))
    case _: False{}

def retire(+inv: Nat, +handle: Nat) -> List<&2, O.Action>:
  match handle:
    case 0n: []
    case _: [O.RetireHandle{inv, handle}]

def free(+id: Nat, +found: Maybe<&2, O.Child>) -> Bool:
  match id found:
    case 0n _: False{}
    case _ None{}: True{}
    case _ _: False{}

def launch_selected(
  +valid: Bool,
  +state: O.State,
  +context: O.DeliveryContext,
  +input: Nat
) -> O.Step:
  match valid state:
    case False{} _: O.Rejected{state, O.NotPreparing{}}
    case True{} O.State{+canonical, +next, +lease, +rest}:
      O.Advanced{
        O.State{
          canonical,
          Nat.add(next, 1n),
          lease,
          O.Child{
            O.DeliveryScope{next, next, context, O.CollectDelivery{}, input},
            next,
            0n,
            0n,
            O.ChildInstalling{},
            None{},
            None{},
            None{}
          } <> rest
        },
        [],
        [O.Launch{next, input}]
      }

def launch_collection(+state: O.State, +context: O.DeliveryContext, +input: Nat) -> O.Step:
  match state:
    case O.State{_, +next, _, +rest}:
      launch_selected(free(next, O.find(next, rest)), state, context, input)

def same_optional(+a: Maybe<&2, Nat>, +b: Maybe<&2, Nat>) -> Bool:
  match a b:
    case None{} None{}: True{}
    case Some{+x} Some{+y}: Nat.is_eq(x, y)
    case _ _: False{}

def same_bool(+a: Bool, +b: Bool) -> Bool:
  match a b:
    case True{} True{}: True{}
    case False{} False{}: True{}
    case _ _: False{}

def same_list(+a: List<&2, Nat>, +b: List<&2, Nat>) -> Bool:
  match a b:
    case Nil{} Nil{}: True{}
    case +x <> +xs +y <> +ys: Bool.and(Nat.is_eq(x, y), same_list(xs, ys))
    case _ _: False{}

def same_context(+a: O.DeliveryContext, +b: O.DeliveryContext) -> Bool:
  match a b:
    case O.DeliveryContext{+request, +recipient, +partition, +lifetime, +round, +local}
      O.DeliveryContext{+request2, +recipient2, +partition2, +lifetime2, +round2, +local2}:
      Bool.and(Nat.is_eq(request, request2), Bool.and(String.eq(recipient, recipient2),
        Bool.and(same_optional(partition, partition2), Bool.and(Nat.is_eq(lifetime, lifetime2),
          Bool.and(same_optional(round, round2), same_bool(local, local2))))))

def same_selection(+a: O.DeliverySelection, +b: O.DeliverySelection) -> Bool:
  match a b:
    case O.NoDeliverySelection{} O.NoDeliverySelection{}: True{}
    case O.DeliverySelection{+token, +advice, +notices} O.DeliverySelection{
      +other,
      +advice2,
      +notices2
    }:
      Bool.and(
        Nat.is_eq(token, other),
        Bool.and(same_list(advice, advice2), same_list(notices, notices2))
      )
    case _ _: False{}

def same_permission(+a: O.DeliveryPermission, +b: O.DeliveryPermission) -> Bool:
  match a b:
    case O.CollectDelivery{} O.CollectDelivery{}: True{}
    case O.PrepareDeliveryIssued{+x} O.PrepareDeliveryIssued{+y}: same_selection(x, y)
    case O.PrepareDelivery{+x} O.PrepareDelivery{+y}: same_selection(x, y)
    case O.FinalizeDeliveryIssued{+x} O.FinalizeDeliveryIssued{+y}: same_selection(x, y)
    case O.FinalizeDelivery{+x} O.FinalizeDelivery{+y}: same_selection(x, y)
    case _ _: False{}

def receipt_matches(+child: O.Child, +receipt: O.DeliveryReceipt) -> Bool:
  match child receipt:
    case O.Child{O.DeliveryScope{+operation, +origin, +context, +permission, +input},
        +inv, +epoch, _, O.ChildInstalling{}, None{}, None{}, None{}}
      O.DeliveryReceipt{+actual, +generation, +source, +binding, +stage, +handle}:
      Bool.and(
        Nat.is_eq(operation, actual),
        Bool.and(
          Nat.is_eq(inv, actual),
          Bool.and(
            Nat.is_eq(epoch, generation),
            Bool.and(
              Nat.is_eq(origin, source),
              Bool.and(
                same_context(context, binding),
                Bool.and(same_permission(permission, stage), Nat.is_eq(input, handle))
              )
            )
          )
        )
      )
    case _ _: False{}

def claim_stage(+state: O.State, +child: O.Child, +permission: O.DeliveryPermission) -> O.Step:
  match child:
    case O.Child{
      O.DeliveryScope{+operation, +origin, +context, _, +input},
      +inv,
      +epoch,
      _,
      _,
      _,
      _,
      +parent
    }:
      O.updated(state, O.ChildUpdate{
        O.Child{O.DeliveryScope{operation, origin, context, permission, input}, inv, epoch,
          0n, O.ChildInstalling{}, None{}, None{}, parent}, [O.Launch{inv, input}]})
    case _: O.Rejected{state, O.WrongPhase{}}

def claim_valid(+valid: Bool, +state: O.State, +child: O.Child) -> O.Step:
  match valid child:
    case True{} O.Child{
      O.DeliveryScope{_, _, _, O.PrepareDeliveryIssued{+selection}, _},
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      claim_stage(state, child, O.PrepareDelivery{selection})
    case True{} O.Child{
      O.DeliveryScope{_, _, _, O.FinalizeDeliveryIssued{+selection}, _},
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      claim_stage(state, child, O.FinalizeDelivery{selection})
    case _ _: O.Rejected{state, O.WrongPhase{}}

def claim_found(+state: O.State, +found: Maybe<&2, O.Child>, +receipt: O.DeliveryReceipt) -> O.Step:
  match found:
    case None{}: O.Rejected{state, O.UnknownInvocation{}}
    case Some{+child}: claim_valid(receipt_matches(child, receipt), state, child)

def claim_delivery(+state: O.State, +receipt: O.DeliveryReceipt) -> O.Step:
  match receipt:
    case O.DeliveryReceipt{+inv, _, _, _, _, _}: claim_found(
      state,
      O.find(inv, children(state)),
      receipt
    )

# Acceptance transfers one opaque result to the pending successor. No Launch or
# AcceptResult is emitted for an intermediate stage, including empty collection.
def handoff(
  +state: O.State,
  +child: O.Child,
  +result: Nat,
  +next_permission: O.DeliveryPermission
) -> O.Step:
  match state child:
    case O.State{+canonical, +next, +lease, +rest}
      O.Child{
        O.DeliveryScope{_, +origin, +context, +old, +input},
        +inv,
        +epoch,
        +handle,
        _,
        _,
        None{},
        None{}
      }:
      O.Advanced{
        O.State{
          canonical,
          Nat.add(next, 1n),
          lease,
          O.Child{
            O.DeliveryScope{next, origin, context, next_permission, result},
            next,
            0n,
            0n,
            O.ChildInstalling{},
            None{},
            None{},
            None{}
          } <> O.replace(
            inv,
            rest,
            O.Child{
              O.DeliveryScope{inv, origin, context, old, input},
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
        [],
        O.IssueDeliveryHandoff{
          inv,
          O.DeliveryReceipt{next, 0n, origin, context, next_permission, result}
        } <> retire(inv, handle)
      }
    case _ _: O.Rejected{state, O.WrongPhase{}}

def accepted_result(+state: O.State, +child: O.Child, +result: Nat) -> O.Step:
  match child:
    case O.Child{+scope, +inv, +epoch, +handle, _, _, None{}, +parent}:
      O.updated(
        state,
        O.ChildUpdate{
          O.Child{scope, inv, epoch, 0n, O.ChildAccepted{}, None{}, None{}, parent},
          O.AcceptResult{scope, inv, result} <> retire(inv, handle)
        }
      )
    case _: O.Rejected{state, O.WrongPhase{}}

def complete_stage(
  +valid: Bool,
  +state: O.State,
  +child: O.Child,
  +result: Nat,
  +selection: O.DeliverySelection
) -> O.Step:
  match valid child:
    case True{} O.Child{O.DeliveryScope{_, _, _, O.CollectDelivery{}, _}, _, _, _, _, _, _, _}:
      handoff(state, child, result, O.PrepareDeliveryIssued{selection})
    case True{} O.Child{
      O.DeliveryScope{_, _, _, O.PrepareDelivery{+original}, _},
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      handoff(state, child, result, O.FinalizeDeliveryIssued{original})
    case True{} O.Child{O.DeliveryScope{_, _, _, O.FinalizeDelivery{_}, _}, _, _, _, _, _, _, _}:
      accepted_result(state, child, result)
    case _ _: O.Rejected{state, O.WrongPhase{}}

def installable(+child: O.Child, +generation: Nat) -> Bool:
  match child:
    case O.Child{_, _, +epoch, _, +phase, _, None{}, _}:
      Bool.and(Nat.is_eq(epoch, generation), install_phase(phase))
    case _: False{}

def complete_found(
  +state: O.State,
  +found: Maybe<&2, O.Child>,
  +generation: Nat,
  +result: Nat,
  +selection: O.DeliverySelection
) -> O.Step:
  match found:
    case None{}: O.Rejected{state, O.UnknownInvocation{}}
    case Some{+child}: complete_stage(
      Bool.and(live(child), installable(child, generation)),
      state,
      child,
      result,
      selection
    )

def complete_delivery(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +result: Nat,
  +selection: O.DeliverySelection
) -> O.Step:
  complete_found(state, O.find(inv, children(state)), generation, result, selection)

# The remaining equations specialize existing generic child APIs to an actual
# delivery child at the first lookup position. The tail stays arbitrary, so the
# shared replacement/reconciliation effects are still part of the exact result.
def state_with(+state: O.State, +child: O.Child) -> O.State:
  match state:
    case O.State{+canonical, +next, +lease, +rest}: O.State{canonical, next, lease, child <> rest}

def can_install(+permission: O.DeliveryPermission) -> Bool:
  match permission:
    case O.CollectDelivery{}: True{}
    case O.PrepareDelivery{_}: True{}
    case O.FinalizeDelivery{_}: True{}
    case _: False{}

def install_valid(
  +valid: Bool,
  +state: O.State,
  +child: O.Child,
  +handle: Nat,
  +request: Nat
) -> O.Step:
  match valid child:
    case True{} O.Child{+scope, +inv, +epoch, _, _, _, _, +parent}:
      O.updated(
        state,
        O.ChildUpdate{
          O.Child{scope, inv, epoch, handle, O.ChildReady{}, Some{request}, None{}, parent},
          []
        }
      )
    case _ _: O.Rejected{state, O.WrongGeneration{}}

def install_delivery(
  +state: O.State,
  +child: O.Child,
  +generation: Nat,
  +handle: Nat,
  +request: Nat
) -> O.Step:
  match child:
    case O.Child{O.DeliveryScope{_, _, _, +permission, _}, _, _, _, _, _, _, _}:
      install_valid(
        Bool.and(live(child), Bool.and(can_install(permission), installable(child, generation))),
        state,
        child,
        handle,
        request
      )
    case _: O.Rejected{state, O.WrongGeneration{}}

def start_valid(+valid: Bool, +state: O.State, +child: O.Child) -> O.Step:
  match valid state child:
    case True{} O.State{+canonical, +next, +lease, +rest}
      O.Child{+scope, +inv, +epoch, +handle, O.ChildReady{}, Some{+request}, None{}, +parent}:
      O.Advanced{
        O.State{
          canonical,
          next,
          Nat.add(lease, 1n),
          O.replace(
            inv,
            rest,
            O.Child{
              scope,
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{request},
              Some{O.Lease{lease, request}},
              parent
            }
          )
        },
        [],
        [O.ExecuteProvider{inv, lease, request, handle}]
      }
    case _ _ _: O.Rejected{state, O.WrongPhase{}}

def provider_start(+state: O.State, +child: O.Child) -> O.Step:
  start_valid(live(child), state, child)

def provider_live(+child: O.Child, +inv: Nat, +epoch: Nat, +lease: Nat, +request: Nat) -> Bool:
  match child:
    case O.Child{
      _,
      +actual,
      +generation,
      _,
      O.ChildAwaiting{},
      Some{+pending},
      Some{O.Lease{+id, +expected}},
      _
    }:
      Bool.and(
        live(child),
        Bool.and(
          Nat.is_eq(inv, actual),
          Bool.and(
            Nat.is_eq(epoch, generation),
            Bool.and(
              Nat.is_eq(lease, id),
              Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, expected))
            )
          )
        )
      )
    case _: False{}

def completed_active(+valid: Bool, +state: O.State, +child: O.Child, +reply: Nat) -> O.Step:
  match valid child:
    case True{} O.Child{
      +scope,
      +inv,
      +epoch,
      +handle,
      O.ChildAwaiting{},
      _,
      Some{O.Lease{+lease, _}},
      +parent
    }:
      O.updated(
        state,
        O.ChildUpdate{
          O.Child{scope, inv, Nat.add(epoch, 1n), 0n, O.ChildResuming{}, None{}, None{}, parent},
          O.Resume{
            inv,
            Nat.add(epoch, 1n),
            handle,
            reply
          } <> List.append(&2, O.Action, retire(inv, handle), [O.CleanupProvider{inv, lease}])
        }
      )
    case _ O.Child{+scope, +inv, +epoch, +handle, _, _, Some{O.Lease{+lease, _}}, +parent}:
      O.updated(
        state,
        O.ChildUpdate{
          O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, None{}, parent},
          O.CleanupProvider{inv, lease} <> retire(inv, handle)
        }
      )
    case _ _: O.Rejected{state, O.WrongLease{}}

def completed_valid(+matched: Bool, +state: O.State, +child: O.Child, +reply: Nat) -> O.Step:
  match matched:
    case False{}: O.Rejected{state, O.WrongLease{}}
    case True{}: O.reconcile_cancel(completed_active(live(child), state, child, reply))

def provider_completed(
  +state: O.State,
  +child: O.Child,
  +lease: Nat,
  +request: Nat,
  +reply: Nat
) -> O.Step:
  match child:
    case O.Child{_, _, _, _, _, _, Some{O.Lease{+actual, +expected}}, _}:
      completed_valid(
        Bool.and(Nat.is_eq(lease, actual), Nat.is_eq(request, expected)),
        state,
        child,
        reply
      )
    case _: O.Rejected{state, O.WrongLease{}}

def cancel_valid(+valid: Bool, +state: O.State, +child: O.Child) -> O.Step:
  match valid child:
    case True{} O.Child{+scope, +inv, +epoch, +handle, _, _, +lease, +parent}:
      O.reconcile_cancel(O.updated(state, O.ChildUpdate{
        O.Child{scope, inv, epoch, 0n, O.ChildCancelled{}, None{}, lease, parent},
        O.CancelChild{inv, handle} <> retire(inv, handle)}))
    case _ _: O.Rejected{state, O.WrongPhase{}}

def cancel_delivery(+state: O.State, +child: O.Child) -> O.Step:
  match child:
    case O.Child{_, _, _, _, +phase, _, _, _}: cancel_valid(running(phase), state, child)

def main() -> Unit:
  Unit{}
