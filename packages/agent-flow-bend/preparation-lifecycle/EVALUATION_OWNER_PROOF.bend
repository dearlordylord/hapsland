import Base
import ./CanonicalResolverOwner.bend as O
import ./EvaluationOwnerSpecification.bend as S
import ./EVALUATION_OWNER_LAWS.bend as Laws
import ./EvaluationOwnerProof.bend as P
import ../Canonical.bend as C

# Complete approved Evaluation ownership contract. All public entries and the
# three family cycles use independently stated decisions; only the law's named
# mechanical primitives and native IO limits are shared. Maintain with this API;
# transfer guarantees and delete obsolete specifications/proofs on replacement.

def specific_exact(
  +state: O.State,
  +context: O.EvaluationContext,
  +parent: O.Parent,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +handle: Nat,
  +result: Nat,
  +facts: O.EvaluationFacts,
  +outcome: C.RequestOutcome,
  +current: Bool,
  +success: Bool,
  +origin: Nat
) -> Laws.specific_entries(
    state,
    context,
    parent,
    inv,
    generation,
    lease,
    request,
    handle,
    result,
    facts,
    outcome,
    current,
    success,
    origin
  ):
  (
    P.launch_exact(state, context, handle),
    (
      P.evaluation_ready_exact(state, inv, generation, lease, request, facts),
      (
        P.install_evaluation_provider_exact(state, inv, generation, handle, request),
        (
          P.launch_evaluation_dispatch_exact(state, parent, handle),
          (
            P.evaluation_start_request_exact(state, inv, generation, lease, request),
            (
              P.complete_evaluation_dispatch_exact(state, inv, generation, result, success),
              (
                P.evaluation_settle_exact(state, inv, generation, lease, request, outcome, current),
                (
                  P.launch_evaluation_cleanup_exact(state, origin, handle),
                  P.complete_evaluation_exact(state, inv, generation, result)
                )
              )
            )
          )
        )
      )
    )
  )

def root_family_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +jev: Nat,
  +inv: Nat,
  +epoch: Nat,
  +old_handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +ancestor: Maybe<&2, O.Parent>,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +handle: Nat,
  +result: Nat,
  +prior_outputs: List<&2, C.Output>,
  +prior_actions: List<&2, O.Action>,
  generic: ({
    O.launch(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.EvaluationScope{operation, context, permission},
      handle
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
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.EvaluationScope{operation, context, permission},
      handle
    )
    : O.Step
  } & {
    O.launch_nested(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{operation, context, permission},
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.Parent{inv, generation, request},
      handle
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
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.Parent{inv, generation, request},
      handle
    )
    : O.Step
  })
) -> Laws.family_cycle(
    O.State{canon, next, next_lease, rest},
    O.Child{
      O.EvaluationScope{operation, context, permission},
      inv,
      epoch,
      old_handle,
      phase,
      pending,
      held,
      ancestor
    },
    inv,
    generation,
    lease,
    request,
    handle,
    result,
    prior_outputs,
    prior_actions
  ):
  match generic:
    case (launch, nested):
      (
        P.root_install_entry_exact(
          canon,
          next,
          next_lease,
          rest,
          operation,
          context,
          permission,
          origin,
          jev,
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          ancestor,
          generation,
          handle,
          request
        ),
        (
          P.root_provider_start_entry_exact(
            canon,
            next,
            next_lease,
            rest,
            operation,
            context,
            permission,
            origin,
            jev,
            inv,
            epoch,
            old_handle,
            phase,
            pending,
            held,
            ancestor,
            generation,
            handle,
            request
          ),
          (
            P.root_provider_live_entry_exact(
              canon,
              next,
              next_lease,
              rest,
              operation,
              context,
              permission,
              origin,
              jev,
              inv,
              epoch,
              old_handle,
              phase,
              pending,
              held,
              ancestor,
              generation,
              lease,
              request
            ),
            (
              P.root_provider_completed_entry_exact(
                canon,
                next,
                next_lease,
                rest,
                operation,
                context,
                permission,
                origin,
                jev,
                inv,
                epoch,
                old_handle,
                phase,
                pending,
                held,
                ancestor,
                lease,
                request,
                result
              ),
              (
                P.root_cancel_entry_exact(
                  canon,
                  next,
                  next_lease,
                  rest,
                  operation,
                  context,
                  permission,
                  origin,
                  jev,
                  inv,
                  epoch,
                  old_handle,
                  phase,
                  pending,
                  held,
                  ancestor
                ),
                (
                  P.root_terminal_entry_exact(
                    canon,
                    next,
                    next_lease,
                    rest,
                    operation,
                    context,
                    permission,
                    origin,
                    jev,
                    inv,
                    epoch,
                    old_handle,
                    phase,
                    pending,
                    held,
                    ancestor,
                    generation,
                    result
                  ),
                  (
                    launch,
                    (
                      nested,
                      (
                        P.live_from_scope_exact(
                          O.State{
                            canon,
                            next,
                            next_lease,
                            O.Child{
                              O.EvaluationScope{operation, context, permission},
                              inv,
                              epoch,
                              old_handle,
                              phase,
                              pending,
                              held,
                              ancestor
                            } <> rest
                          },
                          O.Child{
                            O.EvaluationScope{operation, context, permission},
                            inv,
                            epoch,
                            old_handle,
                            phase,
                            pending,
                            held,
                            ancestor
                          },
                          P.root_scope_live_exact(
                            O.State{
                              canon,
                              next,
                              next_lease,
                              O.Child{
                                O.EvaluationScope{operation, context, permission},
                                inv,
                                epoch,
                                old_handle,
                                phase,
                                pending,
                                held,
                                ancestor
                              } <> rest
                            },
                            operation,
                            context,
                            permission,
                            origin,
                            jev,
                            inv,
                            epoch,
                            old_handle,
                            phase,
                            pending,
                            held,
                            ancestor
                          )
                        ),
                        (
                          P.invalidate_exact(
                            O.State{
                              canon,
                              next,
                              next_lease,
                              O.Child{
                                O.EvaluationScope{operation, context, permission},
                                inv,
                                epoch,
                                old_handle,
                                phase,
                                pending,
                                held,
                                ancestor
                              } <> rest
                            },
                            O.Child{
                              O.EvaluationScope{operation, context, permission},
                              inv,
                              epoch,
                              old_handle,
                              phase,
                              pending,
                              held,
                              ancestor
                            }
                          ),
                          P.reconcile_advanced_exact(
                            O.State{
                              canon,
                              next,
                              next_lease,
                              O.Child{
                                O.EvaluationScope{operation, context, permission},
                                inv,
                                epoch,
                                old_handle,
                                phase,
                                pending,
                                held,
                                ancestor
                              } <> rest
                            },
                            prior_outputs,
                            prior_actions
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )

def cleanup_family_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +jev: Nat,
  +inv: Nat,
  +epoch: Nat,
  +old_handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +ancestor: Maybe<&2, O.Parent>,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +handle: Nat,
  +result: Nat,
  +prior_outputs: List<&2, C.Output>,
  +prior_actions: List<&2, O.Action>,
  generic: ({
    O.launch(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.EvaluationCleanupScope{operation, origin, context, permission},
      handle
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
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.EvaluationCleanupScope{operation, origin, context, permission},
      handle
    )
    : O.Step
  } & {
    O.launch_nested(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{operation, origin, context, permission},
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.Parent{inv, generation, request},
      handle
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
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.Parent{inv, generation, request},
      handle
    )
    : O.Step
  })
) -> Laws.family_cycle(
    O.State{canon, next, next_lease, rest},
    O.Child{
      O.EvaluationCleanupScope{operation, origin, context, permission},
      inv,
      epoch,
      old_handle,
      phase,
      pending,
      held,
      ancestor
    },
    inv,
    generation,
    lease,
    request,
    handle,
    result,
    prior_outputs,
    prior_actions
  ):
  match generic:
    case (launch, nested):
      (
        P.cleanup_install_entry_exact(
          canon,
          next,
          next_lease,
          rest,
          operation,
          context,
          permission,
          origin,
          jev,
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          ancestor,
          generation,
          handle,
          request
        ),
        (
          P.cleanup_provider_start_entry_exact(
            canon,
            next,
            next_lease,
            rest,
            operation,
            context,
            permission,
            origin,
            jev,
            inv,
            epoch,
            old_handle,
            phase,
            pending,
            held,
            ancestor,
            generation,
            handle,
            request
          ),
          (
            P.cleanup_provider_live_entry_exact(
              canon,
              next,
              next_lease,
              rest,
              operation,
              context,
              permission,
              origin,
              jev,
              inv,
              epoch,
              old_handle,
              phase,
              pending,
              held,
              ancestor,
              generation,
              lease,
              request
            ),
            (
              P.cleanup_provider_completed_entry_exact(
                canon,
                next,
                next_lease,
                rest,
                operation,
                context,
                permission,
                origin,
                jev,
                inv,
                epoch,
                old_handle,
                phase,
                pending,
                held,
                ancestor,
                lease,
                request,
                result
              ),
              (
                P.cleanup_cancel_entry_exact(
                  canon,
                  next,
                  next_lease,
                  rest,
                  operation,
                  context,
                  permission,
                  origin,
                  jev,
                  inv,
                  epoch,
                  old_handle,
                  phase,
                  pending,
                  held,
                  ancestor
                ),
                (
                  P.cleanup_terminal_entry_exact(
                    canon,
                    next,
                    next_lease,
                    rest,
                    operation,
                    context,
                    permission,
                    origin,
                    jev,
                    inv,
                    epoch,
                    old_handle,
                    phase,
                    pending,
                    held,
                    ancestor,
                    generation,
                    result
                  ),
                  (
                    launch,
                    (
                      nested,
                      (
                        P.live_from_scope_exact(
                          O.State{
                            canon,
                            next,
                            next_lease,
                            O.Child{
                              O.EvaluationCleanupScope{operation, origin, context, permission},
                              inv,
                              epoch,
                              old_handle,
                              phase,
                              pending,
                              held,
                              ancestor
                            } <> rest
                          },
                          O.Child{
                            O.EvaluationCleanupScope{operation, origin, context, permission},
                            inv,
                            epoch,
                            old_handle,
                            phase,
                            pending,
                            held,
                            ancestor
                          },
                          P.cleanup_scope_live_exact(
                            O.State{
                              canon,
                              next,
                              next_lease,
                              O.Child{
                                O.EvaluationCleanupScope{operation, origin, context, permission},
                                inv,
                                epoch,
                                old_handle,
                                phase,
                                pending,
                                held,
                                ancestor
                              } <> rest
                            },
                            operation,
                            context,
                            permission,
                            origin,
                            jev,
                            inv,
                            epoch,
                            old_handle,
                            phase,
                            pending,
                            held,
                            ancestor
                          )
                        ),
                        (
                          P.invalidate_exact(
                            O.State{
                              canon,
                              next,
                              next_lease,
                              O.Child{
                                O.EvaluationCleanupScope{operation, origin, context, permission},
                                inv,
                                epoch,
                                old_handle,
                                phase,
                                pending,
                                held,
                                ancestor
                              } <> rest
                            },
                            O.Child{
                              O.EvaluationCleanupScope{operation, origin, context, permission},
                              inv,
                              epoch,
                              old_handle,
                              phase,
                              pending,
                              held,
                              ancestor
                            }
                          ),
                          P.reconcile_advanced_exact(
                            O.State{
                              canon,
                              next,
                              next_lease,
                              O.Child{
                                O.EvaluationCleanupScope{operation, origin, context, permission},
                                inv,
                                epoch,
                                old_handle,
                                phase,
                                pending,
                                held,
                                ancestor
                              } <> rest
                            },
                            prior_outputs,
                            prior_actions
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )

def dispatch_family_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +operation: Nat,
  +context: O.EvaluationContext,
  +permission: O.EvaluationPermission,
  +origin: Nat,
  +jev: Nat,
  +inv: Nat,
  +epoch: Nat,
  +old_handle: Nat,
  +phase: O.Phase,
  +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>,
  +ancestor: Maybe<&2, O.Parent>,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +handle: Nat,
  +result: Nat,
  +prior_outputs: List<&2, C.Output>,
  +prior_actions: List<&2, O.Action>,
  generic: ({
    O.launch(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, jev},
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.EvaluationDispatchScope{operation, context, jev},
      handle
    )
    == S.launch(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, jev},
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.EvaluationDispatchScope{operation, context, jev},
      handle
    )
    : O.Step
  } & {
    O.launch_nested(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, jev},
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.Parent{inv, generation, request},
      handle
    )
    == S.launch_nested(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationDispatchScope{operation, context, jev},
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      O.Parent{inv, generation, request},
      handle
    )
    : O.Step
  })
) -> Laws.family_cycle(
    O.State{canon, next, next_lease, rest},
    O.Child{
      O.EvaluationDispatchScope{operation, context, jev},
      inv,
      epoch,
      old_handle,
      phase,
      pending,
      held,
      ancestor
    },
    inv,
    generation,
    lease,
    request,
    handle,
    result,
    prior_outputs,
    prior_actions
  ):
  match generic:
    case (launch, nested):
      (
        P.dispatch_install_entry_exact(
          canon,
          next,
          next_lease,
          rest,
          operation,
          context,
          permission,
          origin,
          jev,
          inv,
          epoch,
          old_handle,
          phase,
          pending,
          held,
          ancestor,
          generation,
          handle,
          request
        ),
        (
          P.dispatch_provider_start_entry_exact(
            canon,
            next,
            next_lease,
            rest,
            operation,
            context,
            permission,
            origin,
            jev,
            inv,
            epoch,
            old_handle,
            phase,
            pending,
            held,
            ancestor,
            generation,
            handle,
            request
          ),
          (
            P.dispatch_provider_live_entry_exact(
              canon,
              next,
              next_lease,
              rest,
              operation,
              context,
              permission,
              origin,
              jev,
              inv,
              epoch,
              old_handle,
              phase,
              pending,
              held,
              ancestor,
              generation,
              lease,
              request
            ),
            (
              P.dispatch_provider_completed_entry_exact(
                canon,
                next,
                next_lease,
                rest,
                operation,
                context,
                permission,
                origin,
                jev,
                inv,
                epoch,
                old_handle,
                phase,
                pending,
                held,
                ancestor,
                lease,
                request,
                result
              ),
              (
                P.dispatch_cancel_entry_exact(
                  canon,
                  next,
                  next_lease,
                  rest,
                  operation,
                  context,
                  permission,
                  origin,
                  jev,
                  inv,
                  epoch,
                  old_handle,
                  phase,
                  pending,
                  held,
                  ancestor
                ),
                (
                  P.dispatch_terminal_entry_exact(
                    canon,
                    next,
                    next_lease,
                    rest,
                    operation,
                    context,
                    permission,
                    origin,
                    jev,
                    inv,
                    epoch,
                    old_handle,
                    phase,
                    pending,
                    held,
                    ancestor,
                    generation,
                    result
                  ),
                  (
                    launch,
                    (
                      nested,
                      (
                        P.live_from_scope_exact(
                          O.State{
                            canon,
                            next,
                            next_lease,
                            O.Child{
                              O.EvaluationDispatchScope{operation, context, jev},
                              inv,
                              epoch,
                              old_handle,
                              phase,
                              pending,
                              held,
                              ancestor
                            } <> rest
                          },
                          O.Child{
                            O.EvaluationDispatchScope{operation, context, jev},
                            inv,
                            epoch,
                            old_handle,
                            phase,
                            pending,
                            held,
                            ancestor
                          },
                          P.dispatch_scope_live_exact(
                            O.State{
                              canon,
                              next,
                              next_lease,
                              O.Child{
                                O.EvaluationDispatchScope{operation, context, jev},
                                inv,
                                epoch,
                                old_handle,
                                phase,
                                pending,
                                held,
                                ancestor
                              } <> rest
                            },
                            operation,
                            context,
                            permission,
                            origin,
                            jev,
                            inv,
                            epoch,
                            old_handle,
                            phase,
                            pending,
                            held,
                            ancestor
                          )
                        ),
                        (
                          P.invalidate_exact(
                            O.State{
                              canon,
                              next,
                              next_lease,
                              O.Child{
                                O.EvaluationDispatchScope{operation, context, jev},
                                inv,
                                epoch,
                                old_handle,
                                phase,
                                pending,
                                held,
                                ancestor
                              } <> rest
                            },
                            O.Child{
                              O.EvaluationDispatchScope{operation, context, jev},
                              inv,
                              epoch,
                              old_handle,
                              phase,
                              pending,
                              held,
                              ancestor
                            }
                          ),
                          P.reconcile_advanced_exact(
                            O.State{
                              canon,
                              next,
                              next_lease,
                              O.Child{
                                O.EvaluationDispatchScope{operation, context, jev},
                                inv,
                                epoch,
                                old_handle,
                                phase,
                                pending,
                                held,
                                ancestor
                              } <> rest
                            },
                            prior_outputs,
                            prior_actions
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )

def Laws.evaluation_owner_exact(
  state,
  context,
  parent,
  operation,
  origin,
  permission,
  jev,
  invocation,
  epoch,
  old_handle,
  phase,
  pending,
  held_lease,
  ancestor,
  generation,
  lease,
  request,
  handle,
  result,
  facts,
  outcome,
  current,
  success,
  prior_outputs,
  prior_actions
):
  match state:
    case O.State{canon, next, next_lease, rest}:
      (
        specific_exact(
          state,
          context,
          parent,
          invocation,
          generation,
          lease,
          request,
          handle,
          result,
          facts,
          outcome,
          current,
          success,
          origin
        ),
        (
          root_family_exact(
            canon,
            next,
            next_lease,
            rest,
            operation,
            context,
            permission,
            origin,
            jev,
            invocation,
            epoch,
            old_handle,
            phase,
            pending,
            held_lease,
            ancestor,
            generation,
            lease,
            request,
            handle,
            result,
            prior_outputs,
            prior_actions,
            P.root_generic_refusals_exact(
              canon,
              next,
              next_lease,
              rest,
              operation,
              context,
              permission,
              origin,
              jev,
              invocation,
              epoch,
              old_handle,
              phase,
              pending,
              held_lease,
              ancestor,
              generation,
              request,
              handle
            )
          ),
          (
            cleanup_family_exact(
              canon,
              next,
              next_lease,
              rest,
              operation,
              context,
              permission,
              origin,
              jev,
              invocation,
              epoch,
              old_handle,
              phase,
              pending,
              held_lease,
              ancestor,
              generation,
              lease,
              request,
              handle,
              result,
              prior_outputs,
              prior_actions,
              P.cleanup_generic_refusals_exact(
                canon,
                next,
                next_lease,
                rest,
                operation,
                context,
                permission,
                origin,
                jev,
                invocation,
                epoch,
                old_handle,
                phase,
                pending,
                held_lease,
                ancestor,
                generation,
                request,
                handle
              )
            ),
            dispatch_family_exact(
              canon,
              next,
              next_lease,
              rest,
              operation,
              context,
              permission,
              origin,
              jev,
              invocation,
              epoch,
              old_handle,
              phase,
              pending,
              held_lease,
              ancestor,
              generation,
              lease,
              request,
              handle,
              result,
              prior_outputs,
              prior_actions,
              P.dispatch_generic_refusals_exact(
                canon,
                next,
                next_lease,
                rest,
                operation,
                context,
                permission,
                origin,
                jev,
                invocation,
                epoch,
                old_handle,
                phase,
                pending,
                held_lease,
                ancestor,
                generation,
                request,
                handle
              )
            )
          )
        )
      )

def main() -> Unit:
  Unit{}
