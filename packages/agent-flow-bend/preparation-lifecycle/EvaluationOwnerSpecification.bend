import Base
import ./CanonicalResolverOwner.bend as O
import ../Canonical.bend as C
import ../Dispatch.bend as D

# Draft complete Evaluation-family Owner public relation, not approved laws or
# proofs. Generic entries are scoped to Evaluation/Dispatch/cleanup children.
# Existing State/Child/Scope are the only representation. Canonical C.step,
# first-match lookups, mechanical replacement, bounded cross-family parent
# ancestry and non-Evaluation invalidation are explicit shared primitives. Evaluation
# admission, permissions, lease fences, dispatch-parent identity, completion and
# cleanup decisions are independently stated here. Native pointers/IO, physical
# drain and atomic publication remain actual-consumer obligations.
# Maintain with this Owner API; transfer current guarantees and delete obsolete
# specification/equations/proofs when replaced. No arbitrary-state global ID
# uniqueness or provider termination claim is made.

def children(state: O.State) -> List<&2, O.Child>:
  match state:
    case O.State{_, _, _, values}: values

def canonical(state: O.State) -> C.State:
  match state:
    case O.State{value, _, _, _}: value

def next_id(state: O.State) -> Nat:
  match state:
    case O.State{_, value, _, _}: value

def active(phase: O.Phase) -> Bool:
  match phase:
    case O.ChildInstalling{}: True{}
    case O.ChildReady{}: True{}
    case O.ChildAwaiting{}: True{}
    case O.ChildResuming{}: True{}
    case _: False{}

def install_phase(phase: O.Phase) -> Bool:
  match phase:
    case O.ChildInstalling{}: True{}
    case O.ChildResuming{}: True{}
    case _: False{}

def free(id: Nat, found: Maybe<&2, O.Child>) -> Bool:
  match id found:
    case 0n _: False{}
    case _ None{}: True{}
    case _ _: False{}

def same_context(left: O.EvaluationContext, right: O.EvaluationContext) -> Bool:
  match left right:
    case O.EvaluationContext{p, l, r, o} O.EvaluationContext{q, m, s, t}:
      Bool.and(
        Nat.is_eq(p, q),
        Bool.and(Nat.is_eq(l, m), Bool.and(Nat.is_eq(r, s), Nat.is_eq(o, t)))
      )

def same_parent(left: O.Parent, right: O.Parent) -> Bool:
  match left right:
    case O.Parent{i, g, r} O.Parent{j, h, s}:
      Bool.and(Nat.is_eq(i, j), Bool.and(Nat.is_eq(g, h), Nat.is_eq(r, s)))

def parent_id(parent: O.Parent) -> Nat:
  match parent:
    case O.Parent{value, _, _}: value

def parent_matches(parent: O.Parent, found: Maybe<&2, O.Child>) -> Bool:
  match parent found:
    case O.Parent{i, g, r} Some{
      O.Child{_, j, h, _, O.ChildAwaiting{}, Some{+pending}, Some{O.Lease{_, leased}}, _}
    }:
      Bool.and(
        Nat.is_eq(i, j),
        Bool.and(Nat.is_eq(g, h), Bool.and(Nat.is_eq(r, pending), Nat.is_eq(pending, leased)))
      )
    case _ _: False{}

def parent_used(+parent: O.Parent, rest: List<&2, O.Child>) -> Bool:
  match rest:
    case Nil{}: False{}
    case O.Child{_, _, _, _, _, _, _, Some{other}} <> tail:
      Bool.or(same_parent(parent, other), parent_used(parent, tail))
    case _ <> tail: parent_used(parent, tail)

def request(canon: C.State, context: O.EvaluationContext, id: Nat) -> Maybe<&2, D.Request>:
  match canon context:
    case C.State{_, _, _, _, _, _, D.State{_, _, _, _, values}, _, _} O.EvaluationContext{
      p,
      l,
      r,
      o
    }:
      D.request_phase(values, p, l, r, o, id)

def started(found: Maybe<&2, D.Request>) -> Bool:
  match found:
    case Some{D.Request{_, _, _, _, _, value, _}}: value
    case _: False{}

def unstarted(found: Maybe<&2, D.Request>) -> Bool:
  match found:
    case Some{D.Request{_, _, _, _, _, False{}, False{}}}: True{}
    case _: False{}

def current_round(context: O.EvaluationContext, found: Maybe<&2, C.Round>) -> Bool:
  match context found:
    case O.EvaluationContext{p, l, r, _} Some{C.Round{q, m, s, _, _, _, _, _}}:
      Bool.and(Nat.is_eq(p, q), Bool.and(Nat.is_eq(l, m), Nat.is_eq(r, s)))
    case _ _: False{}

def work_kind(reviewing: Bool, found: Maybe<&2, C.Work>) -> Bool:
  match reviewing found:
    case True{} Some{C.Work{_, _, _, _, _, C.Reviewing{}, _}}: True{}
    case False{} Some{C.Work{_, _, _, _, _, C.AtJev{}, _}}: True{}
    case _ _: False{}

def current_work(canon: C.State, +context: O.EvaluationContext, reviewing: Bool) -> Bool:
  match canon context:
    case C.State{_, rounds, work, _, _, _, _, _, _} O.EvaluationContext{+p, l, r, o}:
      Bool.and(
        current_round(context, C.find_round(p, rounds)),
        work_kind(reviewing, C.find_work(p, l, r, o, work))
      )

def pending_dispatch(+canon: C.State, +context: O.EvaluationContext, id: Nat) -> Bool:
  Bool.and(current_work(canon, context, False{}), unstarted(request(canon, context, id)))

def current_root(+operation: Nat, +inv: Nat, generation: Nat, found: Maybe<&2, O.Child>) -> Bool:
  match found:
    case Some{O.Child{O.EvaluationScope{actual, _, _}, current, epoch, _, phase, _, _, None{}}}:
      Bool.and(
        Nat.is_eq(operation, inv),
        Bool.and(
          Nat.is_eq(operation, actual),
          Bool.and(Nat.is_eq(inv, current), Bool.and(Nat.is_eq(generation, epoch), active(phase)))
        )
      )
    case Some{
      O.Child{O.EvaluationCleanupScope{actual, _, _, _}, current, epoch, _, phase, _, _, None{}}
    }:
      Bool.and(
        Nat.is_eq(operation, inv),
        Bool.and(
          Nat.is_eq(operation, actual),
          Bool.and(Nat.is_eq(inv, current), Bool.and(Nat.is_eq(generation, epoch), active(phase)))
        )
      )
    case _: False{}

def current_dispatch(
  +operation: Nat,
  +inv: Nat,
  generation: Nat,
  found: Maybe<&2, O.Child>
) -> Bool:
  match found:
    case Some{
      O.Child{O.EvaluationDispatchScope{actual, _, _}, current, epoch, _, phase, _, _, Some{_}}
    }:
      Bool.and(
        Nat.is_eq(operation, inv),
        Bool.and(
          Nat.is_eq(operation, actual),
          Bool.and(Nat.is_eq(inv, current), Bool.and(Nat.is_eq(generation, epoch), active(phase)))
        )
      )
    case _: False{}

def scope_live(+state: O.State, child: O.Child) -> Bool:
  match child:
    case O.Child{O.EvaluationScope{operation, _, _}, +inv, generation, _, _, _, _, _}:
      current_root(operation, inv, generation, O.find(inv, children(state)))
    case O.Child{O.EvaluationCleanupScope{operation, _, _, _}, +inv, generation, _, _, _, _, _}:
      current_root(operation, inv, generation, O.find(inv, children(state)))
    case O.Child{
      O.EvaluationDispatchScope{operation, +context, +id},
      +inv,
      generation,
      _,
      _,
      _,
      _,
      _
    }:
      Bool.and(
        current_dispatch(operation, inv, generation, O.find(inv, children(state))),
        Bool.or(
          started(request(canonical(state), context, id)),
          pending_dispatch(canonical(state), context, id)
        )
      )
    case _: False{}

def live(+state: O.State, +child: O.Child) -> Bool:
  match child:
    case O.Child{_, _, _, _, _, _, _, parent}:
      Bool.and(scope_live(state, child), O.parent_live(parent, children(state)))

def retire(+inv: Nat, handle: Nat) -> List<&2, O.Action>:
  match handle:
    case 0n: Nil{}
    case _: [O.RetireHandle{inv, handle}]

def cancel_update(child: O.Child) -> O.ChildUpdate:
  match child:
    case O.Child{scope, +inv, generation, +handle, phase, _, lease, parent}:
      O.ChildUpdate{
        O.Child{scope, inv, generation, 0n, O.ChildCancelled{}, None{}, lease, parent},
        Bool.pick(
          List<&2, O.Action>,
          active(phase),
          O.CancelChild{inv, handle} <> retire(inv, handle),
          Nil{}
        )
      }

def invalidated(valid: Bool, child: O.Child) -> O.ChildUpdate:
  match valid:
    case True{}: O.ChildUpdate{child, Nil{}}
    case False{}: cancel_update(child)

def invalidate(+state: O.State, +child: O.Child) -> O.ChildUpdate:
  match child:
    case O.Child{O.EvaluationScope{_, _, _}, _, _, _, phase, _, _, _}:
      invalidated(Bool.or(Bool.not(active(phase)), live(state, child)), child)
    case O.Child{O.EvaluationCleanupScope{_, _, _, _}, _, _, _, phase, _, _, _}:
      invalidated(Bool.or(Bool.not(active(phase)), live(state, child)), child)
    case O.Child{O.EvaluationDispatchScope{_, _, _}, _, _, _, phase, _, _, _}:
      invalidated(Bool.or(Bool.not(active(phase)), live(state, child)), child)
    case _: O.invalidate(canonical(state), children(state), child)

def invalidation_join(head: O.ChildUpdate, tail: O.Invalidated) -> O.Invalidated:
  match head tail:
    case O.ChildUpdate{child, actions} O.Invalidated{rest, later}:
      O.Invalidated{child <> rest, List.append(&2, O.Action, actions, later)}

def invalidation_scan(+state: O.State, rest: List<&2, O.Child>) -> O.Invalidated:
  match rest:
    case Nil{}: O.Invalidated{Nil{}, Nil{}}
    case child <> tail: invalidation_join(invalidate(state, child), invalidation_scan(state, tail))

def reconciled(
  state: O.State,
  outputs: List<&2, C.Output>,
  actions: List<&2, O.Action>,
  invalidated: O.Invalidated
) -> O.Step:
  match state invalidated:
    case O.State{canon, next, lease, _} O.Invalidated{rest, additional}:
      O.Advanced{
        O.State{canon, next, lease, rest},
        outputs,
        List.append(&2, O.Action, actions, additional)
      }

def reconcile(step: O.Step) -> O.Step:
  match step:
    case O.Advanced{+state, outputs, actions}: reconciled(
      state,
      outputs,
      actions,
      invalidation_scan(state, children(state))
    )
    case _: step

def permit_child(
  invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat,
  child: O.Child
) -> Bool:
  match child:
    case O.Child{
      _,
      actual,
      epoch,
      _,
      O.ChildAwaiting{},
      Some{+pending},
      Some{O.Lease{id, leased}},
      _
    }:
      Bool.and(
        Nat.is_eq(invocation, actual),
        Bool.and(
          Nat.is_eq(generation, epoch),
          Bool.and(
            Nat.is_eq(lease, id),
            Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased))
          )
        )
      )
    case _: False{}

def permitted(
  +state: O.State,
  invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat,
  found: Maybe<&2, O.Child>
) -> Bool:
  match found:
    case Some{+child}: Bool.and(
      permit_child(invocation, generation, lease, request, child),
      live(state, child)
    )
    case _: False{}

def provider_live(
  +state: O.State,
  +invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat
) -> Bool:
  permitted(state, invocation, generation, lease, request, O.find(invocation, children(state)))

def claimed(+context: O.EvaluationContext, rest: List<&2, O.Child>) -> Bool:
  match rest:
    case Nil{}: False{}
    case O.Child{O.EvaluationScope{_, other, _}, _, _, _, _, _, _, _} <> tail:
      Bool.or(same_context(context, other), claimed(context, tail))
    case _ <> tail: claimed(context, tail)

def birth(
  valid: Bool,
  state: O.State,
  scope: O.Scope,
  parent: Maybe<&2, O.Parent>,
  input: Nat,
  refusal: O.Refusal
) -> O.Step:
  match valid state:
    case True{} O.State{canon, +next, lease, rest}:
      O.Advanced{
        O.State{
          canon,
          Nat.add(next, 1n),
          lease,
          O.Child{scope, next, 0n, 0n, O.ChildInstalling{}, None{}, None{}, parent} <> rest
        },
        Nil{},
        [O.Launch{next, input}]
      }
    case False{} _: O.Rejected{state, refusal}

def launch_evaluation(+state: O.State, +context: O.EvaluationContext, input: Nat) -> O.Step:
  birth(
    Bool.and(
      free(next_id(state), O.find(next_id(state), children(state))),
      Bool.and(
        current_work(canonical(state), context, True{}),
        Bool.not(claimed(context, children(state)))
      )
    ),
    state,
    O.EvaluationScope{next_id(state), context, O.EvaluationUnissued{}},
    None{},
    input,
    O.NotPreparing{}
  )

def installable(child: O.Child, generation: Nat) -> Bool:
  match child:
    case O.Child{_, _, epoch, _, phase, _, None{}, _}:
      Bool.and(Nat.is_eq(generation, epoch), install_phase(phase))
    case _: False{}

def installed(valid: Bool, state: O.State, child: O.Child, handle: Nat, request: Nat) -> O.Step:
  match valid child:
    case True{} O.Child{scope, invocation, generation, _, _, _, _, parent}:
      O.updated(
        state,
        O.ChildUpdate{
          O.Child{
            scope,
            invocation,
            generation,
            handle,
            O.ChildReady{},
            Some{request},
            None{},
            parent
          },
          Nil{}
        }
      )
    case False{} _: O.Rejected{state, O.WrongGeneration{}}

def install_found(
  +state: O.State,
  found: Maybe<&2, O.Child>,
  generation: Nat,
  handle: Nat,
  request: Nat
) -> O.Step:
  match found:
    case Some{+child}: installed(
      Bool.and(live(state, child), installable(child, generation)),
      state,
      child,
      handle,
      request
    )
    case None{}: O.Rejected{state, O.UnknownInvocation{}}

def install(+state: O.State, invocation: Nat, generation: Nat, handle: Nat, request: Nat) -> O.Step:
  install_found(state, O.find(invocation, children(state)), generation, handle, request)

def provider_started(valid: Bool, state: O.State, child: O.Child) -> O.Step:
  match valid state child:
    case True{} O.State{canon, next, +lease, rest} O.Child{
      scope,
      +inv,
      generation,
      +handle,
      O.ChildReady{},
      Some{+request},
      None{},
      parent
    }:
      O.Advanced{
        O.State{
          canon,
          next,
          Nat.add(lease, 1n),
          O.replace(
            inv,
            rest,
            O.Child{
              scope,
              inv,
              generation,
              handle,
              O.ChildAwaiting{},
              Some{request},
              Some{O.Lease{lease, request}},
              parent
            }
          )
        },
        Nil{},
        [O.ExecuteProvider{inv, lease, request, handle}]
      }
    case _ _ _: O.Rejected{state, O.WrongPhase{}}

def provider_start_found(+state: O.State, found: Maybe<&2, O.Child>) -> O.Step:
  match found:
    case Some{+child}: provider_started(live(state, child), state, child)
    case None{}: O.Rejected{state, O.UnknownInvocation{}}

def provider_start(+state: O.State, invocation: Nat) -> O.Step:
  provider_start_found(state, O.find(invocation, children(state)))

def completed(valid: Bool, state: O.State, child: O.Child, reply: Nat) -> O.Step:
  match valid child:
    case True{} O.Child{
      scope,
      +inv,
      +generation,
      +handle,
      O.ChildAwaiting{},
      _,
      Some{O.Lease{lease, _}},
      parent
    }:
      O.updated(
        state,
        O.ChildUpdate{
          O.Child{
            scope,
            inv,
            Nat.add(generation, 1n),
            0n,
            O.ChildResuming{},
            None{},
            None{},
            parent
          },
          O.Resume{
            inv,
            Nat.add(generation, 1n),
            handle,
            reply
          } <> List.append(&2, O.Action, retire(inv, handle), [O.CleanupProvider{inv, lease}])
        }
      )
    case _ O.Child{scope, +inv, generation, +handle, _, _, Some{O.Lease{lease, _}}, parent}:
      O.updated(
        state,
        O.ChildUpdate{
          O.Child{scope, inv, generation, 0n, O.ChildCancelled{}, None{}, None{}, parent},
          O.CleanupProvider{inv, lease} <> retire(inv, handle)
        }
      )
    case _ _: O.Rejected{state, O.WrongLease{}}

def completion_selected(matches: Bool, +state: O.State, +child: O.Child, reply: Nat) -> O.Step:
  match matches:
    case True{}: reconcile(completed(live(state, child), state, child, reply))
    case False{}: O.Rejected{state, O.WrongLease{}}

def completion_found(
  +state: O.State,
  found: Maybe<&2, O.Child>,
  lease: Nat,
  request: Nat,
  reply: Nat
) -> O.Step:
  match found:
    case Some{+child}:
      match child:
        case O.Child{_, _, _, _, _, _, Some{O.Lease{id, expected}}, _}:
          completion_selected(
            Bool.and(Nat.is_eq(lease, id), Nat.is_eq(request, expected)),
            state,
            child,
            reply
          )
        case _: O.Rejected{state, O.WrongLease{}}
    case None{}: O.Rejected{state, O.UnknownInvocation{}}

def provider_completed(
  +state: O.State,
  invocation: Nat,
  lease: Nat,
  request: Nat,
  reply: Nat
) -> O.Step:
  completion_found(state, O.find(invocation, children(state)), lease, request, reply)

def cancelled(valid: Bool, state: O.State, child: O.Child) -> O.Step:
  match valid child:
    case True{} O.Child{scope, +inv, generation, +handle, _, _, lease, parent}:
      reconcile(
        O.updated(
          state,
          O.ChildUpdate{
            O.Child{scope, inv, generation, 0n, O.ChildCancelled{}, None{}, lease, parent},
            O.CancelChild{inv, handle} <> retire(inv, handle)
          }
        )
      )
    case _ _: O.Rejected{state, O.WrongPhase{}}

def cancel_found(state: O.State, found: Maybe<&2, O.Child>) -> O.Step:
  match found:
    case Some{O.Child{scope, inv, generation, handle, +phase, pending, lease, parent}}:
      cancelled(
        active(phase),
        state,
        O.Child{scope, inv, generation, handle, phase, pending, lease, parent}
      )
    case None{}: O.Rejected{state, O.UnknownInvocation{}}

def cancel(+state: O.State, invocation: Nat) -> O.Step:
  cancel_found(state, O.find(invocation, children(state)))

def permission_scope(scope: O.Scope, permission: O.EvaluationPermission) -> O.Scope:
  match scope:
    case O.EvaluationScope{operation, context, _}: O.EvaluationScope{operation, context, permission}
    case O.EvaluationCleanupScope{operation, origin, context, _}: O.EvaluationCleanupScope{
      operation,
      origin,
      context,
      permission
    }
    case other: other

def commit(
  state: O.State,
  child: O.Child,
  permission: O.EvaluationPermission,
  result: C.Step
) -> O.Step:
  match state child result:
    case O.State{_, next, next_lease, rest} O.Child{
      scope,
      +inv,
      generation,
      handle,
      phase,
      pending,
      lease,
      parent
    } C.Advanced{canon, outputs}:
      reconcile(
        O.Advanced{
          O.State{
            canon,
            next,
            next_lease,
            O.replace(
              inv,
              rest,
              O.Child{
                permission_scope(scope, permission),
                inv,
                generation,
                handle,
                phase,
                pending,
                lease,
                parent
              }
            )
          },
          outputs,
          Nil{}
        }
      )
    case _ _ C.Rejected{_, reason}: O.Rejected{state, O.CanonicalRejected{reason}}
    case _ _ _: O.Rejected{state, O.WrongPhase{}}

def ready_event(context: O.EvaluationContext, facts: O.EvaluationFacts) -> C.CanonicalEvent:
  match context facts:
    case O.EvaluationContext{p, l, r, o} O.EvaluationFacts{
      root,
      config,
      credential,
      selected,
      current,
      available
    }:
      C.JevRequestReady{p, l, r, o, root, config, credential, selected, current, available}

def ready_permission(outputs: List<&2, C.Output>) -> O.EvaluationPermission:
  match outputs:
    case Nil{}: O.EvaluationSettled{}
    case C.EventEstablished{C.JevRequestIssued{_, _, _, _, request}} <> _: O.EvaluationIssued{
      request
    }
    case _ <> tail: ready_permission(tail)

def ready_result(state: O.State, child: O.Child, +result: C.Step) -> O.Step:
  match result:
    case C.Advanced{_, outputs}: commit(state, child, ready_permission(outputs), result)
    case C.Rejected{_, reason}: O.Rejected{state, O.CanonicalRejected{reason}}

def ready_child(
  valid: Bool,
  +state: O.State,
  found: Maybe<&2, O.Child>,
  facts: O.EvaluationFacts
) -> O.Step:
  match valid found facts:
    case True{} Some{+child} _:
      match child facts:
        case O.Child{O.EvaluationScope{_, context, O.EvaluationUnissued{}}, _, _, _, _, _, _, _} _:
          ready_result(state, child, C.step(canonical(state), ready_event(context, facts)))
        case O.Child{
          O.EvaluationCleanupScope{_, _, context, O.EvaluationUnissued{}},
          _,
          _,
          _,
          _,
          _,
          _,
          _
        } O.EvaluationFacts{False{}, False{}, False{}, False{}, False{}, False{}}:
          ready_result(state, child, C.step(canonical(state), ready_event(context, facts)))
        case _ _: O.Rejected{state, O.WrongPhase{}}
    case _ _ _: O.Rejected{state, O.WrongPhase{}}

def evaluation_ready(
  +state: O.State,
  +invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat,
  facts: O.EvaluationFacts
) -> O.Step:
  ready_child(
    provider_live(state, invocation, generation, lease, request),
    state,
    O.find(invocation, children(state)),
    facts
  )

def settle_event(
  context: O.EvaluationContext,
  request: Nat,
  outcome: C.RequestOutcome,
  current: Bool
) -> C.CanonicalEvent:
  match context:
    case O.EvaluationContext{p, l, r, o}: C.JevRequestSettled{p, l, r, o, request, outcome, current}

def cleanup_settle(
  +state: O.State,
  child: O.Child,
  context: O.EvaluationContext,
  request: Nat,
  +outcome: C.RequestOutcome
) -> O.Step:
  match outcome:
    case C.RequestFinding{}: O.Rejected{state, O.WrongPhase{}}
    case C.RequestClear{}: O.Rejected{state, O.WrongPhase{}}
    case _: commit(
      state,
      child,
      O.EvaluationSettled{},
      C.step(canonical(state), settle_event(context, request, outcome, False{}))
    )

def settle_child(
  valid: Bool,
  +state: O.State,
  found: Maybe<&2, O.Child>,
  outcome: C.RequestOutcome,
  current: Bool
) -> O.Step:
  match valid found:
    case True{} Some{+child}:
      match child:
        case O.Child{
          O.EvaluationScope{_, context, O.EvaluationIssued{request}},
          _,
          _,
          _,
          _,
          _,
          _,
          _
        }:
          commit(
            state,
            child,
            O.EvaluationSettled{},
            C.step(canonical(state), settle_event(context, request, outcome, current))
          )
        case O.Child{
          O.EvaluationScope{_, context, O.EvaluationAtProvider{request, _}},
          _,
          _,
          _,
          _,
          _,
          _,
          _
        }:
          commit(
            state,
            child,
            O.EvaluationSettled{},
            C.step(canonical(state), settle_event(context, request, outcome, current))
          )
        case O.Child{
          O.EvaluationCleanupScope{_, _, context, O.EvaluationIssued{request}},
          _,
          _,
          _,
          _,
          _,
          _,
          _
        }:
          cleanup_settle(state, child, context, request, outcome)
        case _: O.Rejected{state, O.WrongPhase{}}
    case _ _: O.Rejected{state, O.WrongPhase{}}

def evaluation_settle(
  +state: O.State,
  +invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat,
  outcome: C.RequestOutcome,
  current: Bool
) -> O.Step:
  settle_child(
    provider_live(state, invocation, generation, lease, request),
    state,
    O.find(invocation, children(state)),
    outcome,
    current
  )

def provider_install_found(
  +state: O.State,
  found: Maybe<&2, O.Child>,
  +generation: Nat,
  handle: Nat,
  +request: Nat
) -> O.Step:
  match found:
    case Some{+child}:
      match child:
        case O.Child{
          O.EvaluationScope{operation, +context, O.EvaluationIssued{+jev}},
          +inv,
          epoch,
          old_handle,
          phase,
          pending,
          lease,
          parent
        }:
          installed(
            Bool.and(
              installable(child, generation),
              Bool.and(live(state, child), pending_dispatch(canonical(state), context, jev))
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
              lease,
              parent
            },
            handle,
            request
          )
        case _: O.Rejected{state, O.WrongPhase{}}
    case None{}: O.Rejected{state, O.UnknownInvocation{}}

def install_evaluation_provider(
  +state: O.State,
  invocation: Nat,
  generation: Nat,
  handle: Nat,
  request: Nat
) -> O.Step:
  provider_install_found(state, O.find(invocation, children(state)), generation, handle, request)

def dispatch_found(
  +state: O.State,
  +parent: O.Parent,
  found: Maybe<&2, O.Child>,
  input: Nat
) -> O.Step:
  match found:
    case Some{+child}:
      match child:
        case O.Child{
          O.EvaluationScope{_, +context, O.EvaluationAtProvider{+jev, expected}},
          _,
          _,
          _,
          _,
          _,
          _,
          _
        }:
          birth(
            Bool.and(
              free(next_id(state), O.find(next_id(state), children(state))),
              Bool.and(
                Bool.not(parent_used(parent, children(state))),
                Bool.and(
                  Bool.and(same_parent(parent, expected), parent_matches(parent, Some{child})),
                  Bool.and(live(state, child), pending_dispatch(canonical(state), context, jev))
                )
              )
            ),
            state,
            O.EvaluationDispatchScope{next_id(state), context, jev},
            Some{parent},
            input,
            O.WrongPhase{}
          )
        case _: O.Rejected{state, O.WrongPhase{}}
    case None{}: O.Rejected{state, O.UnknownInvocation{}}

def launch_evaluation_dispatch(+state: O.State, +parent: O.Parent, input: Nat) -> O.Step:
  dispatch_found(state, parent, O.find(parent_id(parent), children(state)), input)

def canonical_commit(state: O.State, result: C.Step) -> O.Step:
  match state result:
    case O.State{_, next, lease, rest} C.Advanced{+canon, outputs}:
      reconcile(O.Advanced{O.State{canon, next, lease, rest}, outputs, Nil{}})
    case _ C.Rejected{_, reason}: O.Rejected{state, O.CanonicalRejected{reason}}

def start_allowed(
  valid: Bool,
  +state: O.State,
  context: O.EvaluationContext,
  request: Nat
) -> O.Step:
  match valid context:
    case True{} O.EvaluationContext{p, l, r, o}:
      canonical_commit(state, C.step(canonical(state), C.JevRequestStarted{p, l, r, o, request}))
    case False{} _: O.Rejected{state, O.WrongPhase{}}

def start_child(valid: Bool, +state: O.State, found: Maybe<&2, O.Child>) -> O.Step:
  match found:
    case Some{O.Child{O.EvaluationDispatchScope{_, +context, +jev}, _, _, _, _, _, _, _}}:
      start_allowed(
        Bool.and(valid, pending_dispatch(canonical(state), context, jev)),
        state,
        context,
        jev
      )
    case Some{_}: O.Rejected{state, O.WrongPhase{}}
    case None{}: O.Rejected{state, O.UnknownInvocation{}}

def evaluation_start_request(
  +state: O.State,
  +invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat
) -> O.Step:
  start_child(
    provider_live(state, invocation, generation, lease, request),
    state,
    O.find(invocation, children(state))
  )

def accepted(valid: Bool, state: O.State, child: O.Child, result: Nat) -> O.Step:
  match valid child:
    case True{} O.Child{+scope, +inv, generation, handle, _, _, None{}, parent}:
      O.updated(
        state,
        O.ChildUpdate{
          O.Child{scope, inv, generation, 0n, O.ChildAccepted{}, None{}, None{}, parent},
          O.AcceptResult{scope, inv, result} <> retire(inv, handle)
        }
      )
    case _ _: O.Rejected{state, O.WrongPhase{}}

def dispatch_complete_found(
  +state: O.State,
  found: Maybe<&2, O.Child>,
  generation: Nat,
  result: Nat,
  success: Bool
) -> O.Step:
  match found:
    case Some{+child}:
      match child:
        case O.Child{O.EvaluationDispatchScope{_, context, jev}, _, _, _, _, _, _, _}:
          accepted(
            Bool.and(
              live(state, child),
              Bool.and(
                installable(child, generation),
                Bool.or(Bool.not(success), started(request(canonical(state), context, jev)))
              )
            ),
            state,
            child,
            result
          )
        case _: O.Rejected{state, O.WrongPhase{}}
    case None{}: O.Rejected{state, O.UnknownInvocation{}}

def complete_evaluation_dispatch(
  +state: O.State,
  invocation: Nat,
  generation: Nat,
  result: Nat,
  success: Bool
) -> O.Step:
  dispatch_complete_found(state, O.find(invocation, children(state)), generation, result, success)

def cleanup_claimed(+origin: Nat, rest: List<&2, O.Child>) -> Bool:
  match rest:
    case Nil{}: False{}
    case O.Child{O.EvaluationCleanupScope{_, other, _, _}, _, _, _, phase, _, _, _} <> tail:
      Bool.or(Bool.and(Nat.is_eq(origin, other), active(phase)), cleanup_claimed(origin, tail))
    case _ <> tail: cleanup_claimed(origin, tail)

def cleanup_issued(id: Nat, found: Maybe<&2, D.Request>) -> O.EvaluationPermission:
  match found:
    case Some{_}: O.EvaluationIssued{id}
    case None{}: O.EvaluationSettled{}

def cleanup_permission(
  canon: C.State,
  context: O.EvaluationContext,
  permission: O.EvaluationPermission
) -> O.EvaluationPermission:
  match permission:
    case O.EvaluationIssued{+id}: cleanup_issued(id, request(canon, context, id))
    case O.EvaluationAtProvider{+id, _}: cleanup_issued(id, request(canon, context, id))
    case other: other

def cleanup_found(+state: O.State, +origin: Nat, input: Nat, found: Maybe<&2, O.Child>) -> O.Step:
  match found:
    case Some{
      O.Child{O.EvaluationScope{_, +context, permission}, _, _, _, O.ChildCancelled{}, _, _, _}
    }:
      birth(
        Bool.and(
          free(next_id(state), O.find(next_id(state), children(state))),
          Bool.not(cleanup_claimed(origin, children(state)))
        ),
        state,
        O.EvaluationCleanupScope{
          next_id(state),
          origin,
          context,
          cleanup_permission(canonical(state), context, permission)
        },
        None{},
        input,
        O.NotPreparing{}
      )
    case _: O.Rejected{state, O.WrongPhase{}}

def launch_evaluation_cleanup(+state: O.State, +origin: Nat, input: Nat) -> O.Step:
  cleanup_found(state, origin, input, O.find(origin, children(state)))

def no_work(found: Maybe<&2, C.Work>) -> Bool:
  match found:
    case None{}: True{}
    case Some{_}: False{}

def idle(canon: C.State, context: O.EvaluationContext) -> Bool:
  match canon context:
    case C.State{_, _, work, _, _, _, D.State{_, _, _, _, requests}, _, _} O.EvaluationContext{
      p,
      l,
      r,
      +o
    }:
      Bool.and(Bool.not(D.request_for_work(requests, o)), no_work(C.find_work(p, l, r, o, work)))

def complete_scope(canon: C.State, scope: O.Scope) -> Bool:
  match scope:
    case O.EvaluationScope{_, _, O.EvaluationSettled{}}: True{}
    case O.EvaluationCleanupScope{_, _, _, O.EvaluationSettled{}}: True{}
    case O.EvaluationScope{_, context, O.EvaluationUnissued{}}: idle(canon, context)
    case O.EvaluationCleanupScope{_, _, context, O.EvaluationUnissued{}}: idle(canon, context)
    case _: False{}

def complete_found(
  +state: O.State,
  found: Maybe<&2, O.Child>,
  generation: Nat,
  result: Nat
) -> O.Step:
  match found:
    case Some{+child}:
      match child:
        case O.Child{scope, _, _, _, _, _, _, _}:
          accepted(
            Bool.and(
              complete_scope(canonical(state), scope),
              Bool.and(live(state, child), installable(child, generation))
            ),
            state,
            child,
            result
          )
    case None{}: O.Rejected{state, O.UnknownInvocation{}}

def complete_evaluation(+state: O.State, invocation: Nat, generation: Nat, result: Nat) -> O.Step:
  complete_found(state, O.find(invocation, children(state)), generation, result)

def terminal_permission(scope: O.Scope) -> Bool:
  match scope:
    case O.EvaluationScope{_, _, O.EvaluationSettled{}}: True{}
    case _: False{}

def terminal_found(
  +state: O.State,
  found: Maybe<&2, O.Child>,
  generation: Nat,
  result: Nat
) -> O.Step:
  match found:
    case Some{+child}:
      match child:
        case O.Child{scope, _, _, _, _, _, _, _}:
          accepted(
            Bool.and(
              terminal_permission(scope),
              Bool.and(live(state, child), installable(child, generation))
            ),
            state,
            child,
            result
          )
    case None{}: O.Rejected{state, O.UnknownInvocation{}}

def terminal(+state: O.State, invocation: Nat, generation: Nat, result: Nat) -> O.Step:
  terminal_found(state, O.find(invocation, children(state)), generation, result)

# Generic root/nested launch cannot manufacture an Evaluation-family operation.
def launch(state: O.State, scope: O.Scope, input: Nat) -> O.Step:
  O.Rejected{state, O.NotPreparing{}}

def nested_refused(state: O.State, found: Maybe<&2, O.Child>) -> O.Step:
  match found:
    case None{}: O.Rejected{state, O.UnknownInvocation{}}
    case Some{_}: O.Rejected{state, O.WrongPhase{}}

def launch_nested(+state: O.State, parent: O.Parent, input: Nat) -> O.Step:
  nested_refused(state, O.find(parent_id(parent), children(state)))

def main() -> Unit:
  Unit{}
