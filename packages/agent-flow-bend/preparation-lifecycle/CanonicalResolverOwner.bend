import Base
import ../Canonical.bend as C
import ../Ledger.bend as Ledger
import ../Dispatch.bend as Dispatch

# Child execution composition with the actual Canonical state. No source/session types.
# A preparation operation owns multiple independently fenced resolver invocations.
type AdvicePermission is Data:
  TailNew{}
  TailBarrier{}
  TailActive{}
  TailPublish{}
  TailRecord{}
  TailRemove{}
type SourcePermission is Data:
  SourceNew{}
  SourceStartPolicy{}
  SourceStartObservation{}
  SourceGate{}
  SourceEarlyRelease{}
  SourceCandidate{}
  SourceActivity{}
  SourcePolicy{}
  SourceObservation{}
type AfterSourcePermission is Data:
  AfterNewBarrier{}
  AfterBarrier{}
  AfterRecoveryAnalytics{}
  AfterRecoveryRelease{}
  AfterRecoveryRuntime{}
  AfterRecoveryActivity{}
# Delivery request/selection bindings are immutable custody metadata, not a
# second advice or lease ledger. Current eligibility remains in Canonical.
type DeliveryContext is Data:
  DeliveryContext{request: Nat, recipient: String, partition: Maybe<&2, Nat>, lifetime: Nat,
    round: Maybe<&2, Nat>, local_delivery: Bool}
type DeliverySelection is Data:
  NoDeliverySelection{}
  DeliverySelection{token: Nat, advice: List<&2, Nat>, notices: List<&2, Nat>}
type DeliveryPermission is Data:
  CollectDelivery{}
  PrepareDeliveryIssued{selection: DeliverySelection}
  PrepareDelivery{selection: DeliverySelection}
  FinalizeDeliveryIssued{selection: DeliverySelection}
  FinalizeDelivery{selection: DeliverySelection}
type DeliveryReceipt is Data:
  DeliveryReceipt{invocation: Nat, generation: Nat, origin: Nat,
    context: DeliveryContext, permission: DeliveryPermission, input_handle: Nat}
type EvaluationContext is Data:
  EvaluationContext{partition: Nat, lifetime: Nat, round: Nat, operation: Nat}
type EvaluationPermission is Data:
  EvaluationUnissued{}
  EvaluationIssued{request: Nat}
  EvaluationAtProvider{request: Nat, parent: Parent}
  EvaluationSettled{}
type EvaluationFacts is Data:
  EvaluationFacts{root_valid: Bool, configuration_valid: Bool, credential_ready: Bool,
    selected: Bool, current_work: Bool, physical_available: Bool}

# Admission starts before any round. Held resources belong to this invocation;
# transferred resources belong to the independent dispatcher, even after cancel.
type AdmissionPermission is Data:
  AdmissionUnreserved{}
  AdmissionHeld{receipt: Nat, partition: Nat, lifetime: Nat, charge: Nat}
  AdmissionTransferred{
    receipt: Nat,
    partition: Nat,
    lifetime: Nat,
    round: Nat,
    observation: Nat,
    charge: Nat
  }

type Scope is Data:
  AdmissionScope{operation: Nat, permission: AdmissionPermission}
  EvaluationCleanupScope{
    operation: Nat,
    origin: Nat,
    context: EvaluationContext,
    permission: EvaluationPermission
  }
  EvaluationDispatchScope{operation: Nat, context: EvaluationContext, request: Nat}
  EvaluationScope{operation: Nat, context: EvaluationContext, permission: EvaluationPermission}
  DeliveryScope{operation: Nat, origin: Nat, context: DeliveryContext,
    permission: DeliveryPermission, input_handle: Nat}
  SettingsScope{operation: Nat}
  FreshnessScope{operation: Nat}
  Scope{partition: Nat, lifetime: Nat, round: Nat, preparation: Nat}
  SourceScope{
    partition: Nat,
    lifetime: Nat,
    round: Nat,
    observation: Nat,
    permission: SourcePermission
  }
  AfterSourceScope{
    partition: Nat,
    lifetime: Nat,
    round: Nat,
    observation: Nat,
    barrier_request: Nat,
    barrier_generation: Nat,
    permission: AfterSourcePermission
  }
  PreparationScope{partition: Nat, lifetime: Nat, round: Nat, preparation: Nat}
  RetainingScope{partition: Nat, lifetime: Nat, round: Nat, observation: Nat, origin: Nat}
  AdviceTailScope{
    partition: Nat,
    lifetime: Nat,
    round: Nat,
    operation: Nat,
    origin: Nat,
    permission: AdvicePermission
  }
type Phase is Data:
  ChildInstalling{}
  ChildReady{}
  ChildAwaiting{}
  ChildResuming{}
  ChildAccepted{}
  ChildCancelled{}
type Lease is Data:
  Lease{id: Nat, request: Nat}
type Parent is Data:
  Parent{invocation: Nat, generation: Nat, request: Nat}
type Child is Data:
  Child{scope: Scope, invocation: Nat, generation: Nat, handle: Nat,
    phase: Phase, request: Maybe<&2, Nat>, lease: Maybe<&2, Lease>, parent: Maybe<&2, Parent>}
type State is Data:
  State{canonical: C.State, next_invocation: Nat, next_lease: Nat, children: List<&2, Child>}
type Action is Data:
  IssueDeliveryHandoff{invocation: Nat, receipt: DeliveryReceipt}
  Launch{invocation: Nat, input_handle: Nat}
  LaunchPostPreparation{
    invocation: Nat,
    preparation_invocation: Nat,
    result_handle: Nat,
    scope: Scope
  }
  LaunchAdviceTail{invocation: Nat, origin: Nat, operation: Nat, input_handle: Nat}
  ExecuteProvider{invocation: Nat, lease: Nat, request: Nat, state_handle: Nat}
  Resume{invocation: Nat, generation: Nat, state_handle: Nat, reply_handle: Nat}
  RetireHandle{invocation: Nat, state_handle: Nat}
  CancelChild{invocation: Nat, state_handle: Nat}
  CleanupProvider{invocation: Nat, lease: Nat}
  AcceptResult{scope: Scope, invocation: Nat, result_handle: Nat}
type Refusal is Data:
  NotPreparing{}
  UnknownInvocation{}
  WrongGeneration{}
  WrongPhase{}
  WrongLease{}
  CanonicalRejected{reason: C.Reason}
type Step is Data:
  Advanced{state: State, outputs: List<&2, C.Output>, actions: List<&2, Action>}
  Rejected{state: State, refusal: Refusal}
type ChildUpdate is Data:
  ChildUpdate{child: Child, actions: List<&2, Action>}

# Canonical-produced Preparing work and its original observation must both exist.
def observation_live(found: Maybe<&2, C.Work>) -> Bool:
  match found:
    case Some{C.Work{_, _, _, _, _, C.SourceReading{}, _}}: True{}
    case _: False{}

def preparing_live(
  canonical: C.State,
  +scope: Scope,
  found: Maybe<&2, C.Work>,
  current: Maybe<&2, C.Round>
) -> Bool:
  match canonical scope found current:
    case C.State{_, _, work, _, _, _, _, _, _} Scope{+partition, +lifetime, +round, _}
        Some{C.Work{_, _, _, _, _, C.Preparing{}, observation}} Some{current}:
      Bool.and(C.same_round(partition, lifetime, round, current),
        observation_live(C.find_work(partition, lifetime, round, observation, work)))
    case _ _ _ _: False{}

def resolver_scope(scope: Scope) -> Scope:
  match scope:
    case AdmissionScope{_, _}: scope
    case EvaluationCleanupScope{_, _, _, _}: scope
    case EvaluationDispatchScope{_, _, _}: scope
    case EvaluationScope{_, _, _}: scope
    case DeliveryScope{_, _, _, _, _}: scope
    case SettingsScope{operation}: SettingsScope{operation}
    case FreshnessScope{operation}: FreshnessScope{operation}
    case Scope{partition, lifetime, round, preparation}: Scope{
      partition,
      lifetime,
      round,
      preparation
    }
    case PreparationScope{partition, lifetime, round, preparation}: Scope{
      partition,
      lifetime,
      round,
      preparation
    }
    case RetainingScope{partition, lifetime, round, _, _}: Scope{partition, lifetime, round, 0n}
    case SourceScope{partition, lifetime, round, _, _}: Scope{partition, lifetime, round, 0n}
    case AfterSourceScope{partition, lifetime, round, _, _, _, _}: Scope{
      partition,
      lifetime,
      round,
      0n
    }
    case AdviceTailScope{partition, lifetime, round, _, _, _}: Scope{partition, lifetime, round, 0n}

def source_live(
  current: Maybe<&2, C.Round>,
  partition: Nat,
  lifetime: Nat,
  round: Nat,
  found: Maybe<&2, C.Work>
) -> Bool:
  match current:
    case Some{value}: Bool.and(
      C.same_round(partition, lifetime, round, value),
      observation_live(found)
    )
    case None{}: False{}

def live_preparing(+canonical: C.State, +scope: Scope) -> Bool:
  match canonical scope:
    case C.State{_, rounds, work, _, _, _, _, _, _} Scope{
      +partition,
      +lifetime,
      +round,
      preparation
    }:
      preparing_live(
        canonical,
        scope,
        C.find_work(partition, lifetime, round, preparation, work),
        C.find_round(partition, rounds)
      )
    case _ _: False{}

def source_pending_permission(permission: SourcePermission) -> Bool:
  match permission:
    case SourceNew{}: True{}
    case SourceStartPolicy{}: True{}
    case SourceStartObservation{}: True{}
    case SourceEarlyRelease{}: True{}
    case _: False{}

def source_stage_live(permission: SourcePermission, found: Maybe<&2, C.Work>) -> Bool:
  match found:
    case Some{C.Work{_, _, _, _, 0n, C.AwaitingSourceRead{}, _}}: source_pending_permission(
      permission
    )
    case Some{C.Work{_, _, _, _, 0n, C.SourceReading{}, _}}: True{}
    case _: False{}

def source_scope_live(
  current: Maybe<&2, C.Round>,
  p: Nat,
  l: Nat,
  r: Nat,
  permission: SourcePermission,
  found: Maybe<&2, C.Work>
) -> Bool:
  match current:
    case Some{value}: Bool.and(C.same_round(p, l, r, value), source_stage_live(permission, found))
    case None{}: False{}

def live(+canonical: C.State, scope: Scope) -> Bool:
  match canonical scope:
    case _ AdmissionScope{_, _}: False{}
    case _ EvaluationDispatchScope{_, _, _}: False{}
    case _ EvaluationCleanupScope{_, _, _, _}: False{}
    case _ EvaluationScope{_, _, _}: False{}
    case _ DeliveryScope{_, _, _, _, _}: False{}
    case _ SettingsScope{_}: False{}
    case _ FreshnessScope{_}: False{}
    case _ AdviceTailScope{_, _, _, _, _, _}: True{}
    case _ AfterSourceScope{_, _, _, _, _, _, _}: True{}
    case C.State{_, rounds, work, _, _, _, _, _, _} SourceScope{
      +partition,
      +lifetime,
      +round,
      observation,
      permission
    }:
      source_scope_live(
        C.find_round(partition, rounds),
        partition,
        lifetime,
        round,
        permission,
        C.find_work(partition, lifetime, round, observation, work)
      )
    case C.State{_, rounds, work, _, _, _, _, _, _} RetainingScope{
      +partition,
      +lifetime,
      +round,
      observation,
      _
    }:
      source_live(
        C.find_round(partition, rounds),
        partition,
        lifetime,
        round,
        C.find_work(partition, lifetime, round, observation, work)
      )
    case _ other: live_preparing(canonical, resolver_scope(other))

def active(phase: Phase) -> Bool:
  match phase:
    case ChildInstalling{}: True{}
    case ChildReady{}: True{}
    case ChildAwaiting{}: True{}
    case ChildResuming{}: True{}
    case _: False{}

def child_invocation(child: Child) -> Nat:
  match child:
    case Child{_, invocation, _, _, _, _, _, _}: invocation

def find(+invocation: Nat, children: List<&2, Child>) -> Maybe<&2, Child>:
  match children:
    case Nil{}: None{}
    case +child <> rest: Bool.pick(Maybe<&2, Child>, Nat.is_eq(invocation, child_invocation(child)),
      Some{child}, find(invocation, rest))

def replace_pick(hit: Bool, old: Child, child: Child, rest: List<&2, Child>) -> List<&2, Child>:
  match hit:
    case True{}: child <> rest
    case False{}: old <> rest

def replace(+invocation: Nat, children: List<&2, Child>, +child: Child) -> List<&2, Child>:
  match children:
    case Nil{}: Nil{}
    case +old <> rest: replace_pick(Nat.is_eq(invocation, child_invocation(old)), old, child,
      replace(invocation, rest, child))

def updated(state: State, update: ChildUpdate) -> Step:
  match state update:
    case State{canonical, next_invocation, next_lease, children} ChildUpdate{+child, actions}:
      Advanced{State{canonical, next_invocation, next_lease,
        replace(child_invocation(child), children, child)}, Nil{}, actions}

def retire(+invocation: Nat, handle: Nat) -> List<&2, Action>:
  match handle:
    case 0n: Nil{}
    case 1n++value: RetireHandle{invocation, Nat.add(value, 1n)} <> Nil{}

def cancel_child(child: Child) -> ChildUpdate:
  match child:
    case Child{scope, +invocation, generation, +handle, phase, _, lease, parent}:
      ChildUpdate{Child{scope, invocation, generation, 0n, ChildCancelled{}, None{}, lease, parent},
        Bool.pick(List<&2, Action>, active(phase),
          CancelChild{invocation, handle} <> retire(invocation, handle), Nil{})}

def invalidate_live(valid: Bool, child: Child) -> ChildUpdate:
  match valid:
    case True{}: ChildUpdate{child, Nil{}}
    case False{}: cancel_child(child)

def parent_invocation(parent: Parent) -> Nat:
  match parent:
    case Parent{invocation, _, _}: invocation

def child_scope_value(child: Child) -> Scope:
  match child:
    case Child{scope, _, _, _, _, _, _, _}: scope

def parent_matches(parent: Parent, found: Maybe<&2, Child>) -> Bool:
  match parent found:
    case Parent{invocation, generation, request} Some{
      Child{_, actual, current, _, ChildAwaiting{}, Some{+pending}, Some{Lease{_, leased}}, _}
    }:
      Bool.and(
        Nat.is_eq(invocation, actual),
        Bool.and(
          Nat.is_eq(generation, current),
          Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased))
        )
      )
    case _ _: False{}

def found_parent(found: Maybe<&2, Child>) -> Maybe<&2, Parent>:
  match found:
    case Some{Child{_, _, _, _, _, _, _, parent}}: parent
    case None{}: None{}

# Walk the closed ancestor chain with a structural child-list bound. A malformed
# cyclic ancestry never yields authority, and cancellation reaches every depth
# in the same reconciliation rather than one generation of parents per commit.
def parent_chain_live(
  fuel: List<&2, Child>,
  parent: Maybe<&2, Parent>,
  +children: List<&2, Child>
) -> Bool:
  match fuel parent:
    case _ None{}: True{}
    case Nil{} Some{_}: False{}
    case _ <> rest Some{+link}:
      Bool.and(parent_matches(link, find(parent_invocation(link), children)),
        parent_chain_live(rest, found_parent(find(parent_invocation(link), children)), children))

def parent_live(parent: Maybe<&2, Parent>, +children: List<&2, Child>) -> Bool:
  parent_chain_live(children, parent, children)

def child_parent(child: Child) -> Maybe<&2, Parent>:
  match child:
    case Child{_, _, _, _, _, _, _, parent}: parent

# Settings operations are issued with their child by launch_settings. A supplied
# Scope alone is not authority; only the matching current active child is live.
def settings_current(
  +operation: Nat,
  +invocation: Nat,
  generation: Nat,
  found: Maybe<&2, Child>
) -> Bool:
  match found:
    case Some{Child{SettingsScope{actual}, current, epoch, _, phase, _, _, None{}}}:
      Bool.and(
        Nat.is_eq(operation, invocation),
        Bool.and(
          Nat.is_eq(operation, actual),
          Bool.and(
            Nat.is_eq(invocation, current),
            Bool.and(Nat.is_eq(generation, epoch), active(phase))
          )
        )
      )
    case _: False{}

# An admission capability is issued with its root child. Resource progression
# never changes its invocation, generation, lease or parent identity.
def admission_current(+operation: Nat, +invocation: Nat, generation: Nat,
    found: Maybe<&2, Child>) -> Bool:
  match found:
    case Some{Child{AdmissionScope{actual, _}, current, epoch, _, phase, _, _, None{}}}:
      Bool.and(Nat.is_eq(operation, invocation),
        Bool.and(Nat.is_eq(operation, actual),
          Bool.and(Nat.is_eq(invocation, current),
            Bool.and(Nat.is_eq(generation, epoch), active(phase)))))
    case _: False{}

# A freshness operation is its own Canonical-issued invocation, never a
# manufactured settings or source preparation scope.
def freshness_current(
  +operation: Nat,
  +invocation: Nat,
  generation: Nat,
  found: Maybe<&2, Child>
) -> Bool:
  match found:
    case Some{Child{FreshnessScope{actual}, current, epoch, _, phase, _, _, None{}}}:
      Bool.and(
        Nat.is_eq(operation, invocation),
        Bool.and(
          Nat.is_eq(operation, actual),
          Bool.and(
            Nat.is_eq(invocation, current),
            Bool.and(Nat.is_eq(generation, epoch), active(phase))
          )
        )
      )
    case _: False{}

def delivery_current(+operation: Nat, +invocation: Nat, generation: Nat,
    found: Maybe<&2, Child>) -> Bool:
  match found:
    case Some{Child{DeliveryScope{actual, _, _, _, _}, current, epoch, _, phase, _, _, None{}}}:
      Bool.and(
        Nat.is_eq(operation, invocation),
        Bool.and(
          Nat.is_eq(operation, actual),
          Bool.and(
            Nat.is_eq(invocation, current),
            Bool.and(Nat.is_eq(generation, epoch), active(phase))
          )
        )
      )
    case _: False{}

def evaluation_context_equal(left: EvaluationContext, right: EvaluationContext) -> Bool:
  match left right:
    case EvaluationContext{p, l, r, o} EvaluationContext{q, m, s, t}:
      Bool.and(
        Nat.is_eq(p, q),
        Bool.and(Nat.is_eq(l, m), Bool.and(Nat.is_eq(r, s), Nat.is_eq(o, t)))
      )

# Like delivery, this is issued invocation custody, not permission to start or
# retain work. Request issuance still checks Reviewing; after invalidation only
# the exact already-issued request may be accounted for by evaluation_settle.
def evaluation_current(+operation: Nat, +invocation: Nat, generation: Nat,
    found: Maybe<&2, Child>) -> Bool:
  match found:
    case Some{Child{EvaluationScope{actual, _, _}, current, epoch, _, phase, _, _, None{}}}:
      Bool.and(
        Nat.is_eq(operation, invocation),
        Bool.and(
          Nat.is_eq(operation, actual),
          Bool.and(
            Nat.is_eq(invocation, current),
            Bool.and(Nat.is_eq(generation, epoch), active(phase))
          )
        )
      )
    case Some{
      Child{EvaluationCleanupScope{actual, _, _, _}, current, epoch, _, phase, _, _, None{}}
    }:
      Bool.and(
        Nat.is_eq(operation, invocation),
        Bool.and(
          Nat.is_eq(operation, actual),
          Bool.and(
            Nat.is_eq(invocation, current),
            Bool.and(Nat.is_eq(generation, epoch), active(phase))
          )
        )
      )
    case _: False{}

def evaluation_at_jev(
  context: EvaluationContext,
  work: Maybe<&2, C.Work>,
  current: Maybe<&2, C.Round>
) -> Bool:
  match context work current:
    case EvaluationContext{p, l, r, _} Some{C.Work{_, _, _, _, _, C.AtJev{}, _}} Some{actual}:
      C.same_round(p, l, r, actual)
    case _ _ _: False{}

def evaluation_request_work(canonical: C.State, +context: EvaluationContext) -> Bool:
  match canonical context:
    case C.State{_, rounds, work, _, _, _, _, _, _} EvaluationContext{+p, l, r, o}:
      evaluation_at_jev(context, C.find_work(p, l, r, o, work), C.find_round(p, rounds))

def evaluation_request(
  canonical: C.State,
  context: EvaluationContext,
  request: Nat
) -> Maybe<&2, Dispatch.Request>:
  match canonical context:
    case C.State{_, _, _, _, _, _, Dispatch.State{_, _, _, _, requests}, _, _} EvaluationContext{
      p,
      l,
      r,
      o
    }:
      Dispatch.request_phase(requests, p, l, r, o, request)

def evaluation_request_started(found: Maybe<&2, Dispatch.Request>) -> Bool:
  match found:
    case Some{Dispatch.Request{_, _, _, _, _, started, _}}: started
    case _: False{}

def evaluation_request_unstarted(found: Maybe<&2, Dispatch.Request>) -> Bool:
  match found:
    case Some{Dispatch.Request{_, _, _, _, _, False{}, False{}}}: True{}
    case _: False{}

def evaluation_dispatch_pending(
  +canonical: C.State,
  +context: EvaluationContext,
  request: Nat
) -> Bool:
  Bool.and(evaluation_request_work(canonical, context),
    evaluation_request_unstarted(evaluation_request(canonical, context, request)))

def evaluation_dispatch_custody(
  +canonical: C.State,
  +context: EvaluationContext,
  +request: Nat
) -> Bool:
  Bool.or(evaluation_request_started(evaluation_request(canonical, context, request)),
    evaluation_dispatch_pending(canonical, context, request))

def evaluation_dispatch_current(+operation: Nat, +invocation: Nat, generation: Nat,
    found: Maybe<&2, Child>) -> Bool:
  match found:
    case Some{
      Child{EvaluationDispatchScope{actual, _, _}, current, epoch, _, phase, _, _, Some{_}}
    }:
      Bool.and(
        Nat.is_eq(operation, invocation),
        Bool.and(
          Nat.is_eq(operation, actual),
          Bool.and(
            Nat.is_eq(invocation, current),
            Bool.and(Nat.is_eq(generation, epoch), active(phase))
          )
        )
      )
    case _: False{}

def child_scope_live(+canonical: C.State, +children: List<&2, Child>, child: Child) -> Bool:
  match child:
    case Child{AdmissionScope{operation, _}, +invocation, generation, _, _, _, _, _}:
      admission_current(operation, invocation, generation, find(invocation, children))
    case Child{
      EvaluationDispatchScope{operation, context, request},
      +invocation,
      generation,
      _,
      _,
      _,
      _,
      _
    }:
      Bool.and(
        evaluation_dispatch_current(operation, invocation, generation, find(invocation, children)),
        evaluation_dispatch_custody(canonical, context, request)
      )
    case Child{EvaluationCleanupScope{operation, _, _, _}, +invocation, generation, _, _, _, _, _}:
      evaluation_current(operation, invocation, generation, find(invocation, children))
    case Child{EvaluationScope{operation, _, _}, +invocation, generation, _, _, _, _, _}:
      evaluation_current(operation, invocation, generation, find(invocation, children))
    case Child{DeliveryScope{operation, _, _, _, _}, +invocation, generation, _, _, _, _, _}:
      delivery_current(operation, invocation, generation, find(invocation, children))
    case Child{SettingsScope{operation}, +invocation, generation, _, _, _, _, _}:
      settings_current(operation, invocation, generation, find(invocation, children))
    case Child{FreshnessScope{operation}, +invocation, generation, _, _, _, _, _}:
      freshness_current(operation, invocation, generation, find(invocation, children))
    case other: live(canonical, child_scope_value(other))

def child_live(+canonical: C.State, +children: List<&2, Child>, +child: Child) -> Bool:
  Bool.and(child_scope_live(canonical, children, child), parent_live(child_parent(child), children))

# A provider permit authorizes only its exact current await and generation.
# This predicate is evaluated against the resident draft inside its mutation commit.
def provider_permit_matches(
  invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat,
  child: Child
) -> Bool:
  match child:
    case Child{_, actual, current, _, ChildAwaiting{}, Some{+pending}, Some{Lease{id, leased}}, _}:
      Bool.and(
        Nat.is_eq(invocation, actual),
        Bool.and(
          Nat.is_eq(generation, current),
          Bool.and(
            Nat.is_eq(lease, id),
            Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased))
          )
        )
      )
    case _: False{}

def provider_permit_found(
  +canonical: C.State,
  +children: List<&2, Child>,
  invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat,
  found: Maybe<&2, Child>
) -> Bool:
  match found:
    case Some{+child}: Bool.and(
      provider_permit_matches(invocation, generation, lease, request, child),
      child_live(canonical, children, child)
    )
    case None{}: False{}

def provider_live(
  +state: State,
  +invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat
) -> Bool:
  match state:
    case State{canonical, _, _, +children}:
      provider_permit_found(
        canonical,
        children,
        invocation,
        generation,
        lease,
        request,
        find(invocation, children)
      )

def preparation_scope_kind(scope: Scope) -> Bool:
  match scope:
    case PreparationScope{_, _, _, _}: True{}
    case _: False{}

def validity_needed(phase: Phase, scope: Scope) -> Bool:
  match phase:
    case ChildAccepted{}: preparation_scope_kind(scope)
    case other: active(other)

def invalidate(+canonical: C.State, +children: List<&2, Child>, +child: Child) -> ChildUpdate:
  match child:
    case Child{scope, _, _, _, +phase, _, _, _}: invalidate_live(
      Bool.or(Bool.not(validity_needed(phase, scope)), child_live(canonical, children, child)),
      child
    )

type Invalidated is Data:
  Invalidated{children: List<&2, Child>, actions: List<&2, Action>}

def invalidate_join(head: ChildUpdate, tail: Invalidated) -> Invalidated:
  match head tail:
    case ChildUpdate{child, actions} Invalidated{children, remaining}:
      Invalidated{child <> children, List.append(&2, Action, actions, remaining)}

def invalidate_scan(
  +canonical: C.State,
  +all: List<&2, Child>,
  children: List<&2, Child>
) -> Invalidated:
  match children:
    case Nil{}: Invalidated{Nil{}, Nil{}}
    case child <> rest: invalidate_join(
      invalidate(canonical, all, child),
      invalidate_scan(canonical, all, rest)
    )

def invalidate_all(canonical: C.State, +children: List<&2, Child>) -> Invalidated:
  invalidate_scan(canonical, children, children)

def state_children(state: State) -> List<&2, Child>:
  match state:
    case State{_, _, _, children}: children

def state_canonical(state: State) -> C.State:
  match state:
    case State{canonical, _, _, _}: canonical

# Native allocates each receipt once for an exact object. Charge numbers can be
# reused after clear; receipt handles cannot. Canonical owns the progression,
# while the closed native boundary establishes pointer identity and physical IO.
def admission_charge(canonical: C.State, charge: Nat) -> Maybe<&2, Ledger.Charge>:
  match canonical:
    case C.State{Ledger.Ledger{_, _, charges}, _, _, _, _, _, _, _, _}:
      Ledger.find(charge, charges)

def admission_charge_matches(found: Maybe<&2, Ledger.Charge>, +partition: Nat,
    +charge: Nat) -> Bool:
  match found:
    case Some{Ledger.Charge{id, owner, _, Ledger.ObservationDispatch{}}}:
      Bool.and(Nat.is_eq(id, charge), Nat.is_eq(owner, partition))
    case _: False{}

# Transferred receipts are replay tombstones, not retained resource ownership.
def admission_claimed(items: List<&2, Child>, +receipt: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case Child{AdmissionScope{_, AdmissionHeld{id, _, _, _}}, _, _, _, _, _, _, _} <> rest:
      Bool.or(Nat.is_eq(id, receipt), admission_claimed(rest, receipt))
    case Child{AdmissionScope{_, AdmissionTransferred{id, _, _, _, _, _}}, _, _, _, _, _, _, _} <> rest:
      Bool.or(Nat.is_eq(id, receipt), admission_claimed(rest, receipt))
    case _ <> rest: admission_claimed(rest, receipt)

def admission_changed(valid: Bool, state: State, child: Child,
    permission: AdmissionPermission) -> Step:
  match valid state child:
    case True{} State{canonical, next, lease, children}
        Child{
          AdmissionScope{operation, _},
          +invocation,
          generation,
          handle,
          phase,
          request,
          permit,
          parent
        }:
      Advanced{State{canonical, next, lease,
        replace(invocation, children,
          Child{AdmissionScope{operation, permission}, invocation, generation, handle,
            phase, request, permit, parent})}, Nil{}, Nil{}}
    case _ _ _: Rejected{state, NotPreparing{}}

def admission_unreserved(child: Child) -> Bool:
  match child:
    case Child{AdmissionScope{_, AdmissionUnreserved{}}, _, _, _, _, _, _, _}: True{}
    case _: False{}

def admission_held(child: Child) -> Maybe<&2, AdmissionPermission>:
  match child:
    case Child{
      AdmissionScope{_, AdmissionHeld{receipt, partition, lifetime, charge}},
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      Some{AdmissionHeld{receipt, partition, lifetime, charge}}
    case _: None{}

def admission_hold_found(+state: State, found: Maybe<&2, Child>, valid: Bool,
    +partition: Nat, +lifetime: Nat, +charge: Nat, +receipt: Nat) -> Step:
  match found:
    case Some{+child}:
      admission_changed(
        Bool.and(
          Bool.and(valid, admission_unreserved(child)),
          Bool.and(
            Bool.and(Nat.is_eq(lifetime, 1n), Nat.is_lt(0n, receipt)),
            Bool.and(
              admission_charge_matches(
                admission_charge(state_canonical(state), charge),
                partition,
                charge
              ),
              Bool.not(admission_claimed(state_children(state), receipt))
            )
          )
        ),
        state,
        child,
        AdmissionHeld{receipt, partition, lifetime, charge}
      )
    case _: Rejected{state, NotPreparing{}}

def hold_admission(+state: State, +invocation: Nat, generation: Nat, lease: Nat,
    request: Nat, partition: Nat, lifetime: Nat, charge: Nat, receipt: Nat) -> Step:
  admission_hold_found(
    state,
    find(invocation, state_children(state)),
    provider_live(state, invocation, generation, lease, request),
    partition,
    lifetime,
    charge,
    receipt
  )

# This is an acknowledgment of the closed native release of exactly this
# receipt. Numeric charge absence cannot establish that fact across clear/reuse.
def admission_release_held(state: State, child: Child, valid: Bool, receipt: Nat,
    held: Maybe<&2, AdmissionPermission>) -> Step:
  match held:
    case Some{AdmissionHeld{expected, _, _, _}}:
      admission_changed(
        Bool.and(valid, Nat.is_eq(receipt, expected)),
        state,
        child,
        AdmissionUnreserved{}
      )
    case _: Rejected{state, NotPreparing{}}

def admission_release_found(
  state: State,
  found: Maybe<&2, Child>,
  valid: Bool,
  receipt: Nat
) -> Step:
  match found:
    case Some{+child}: admission_release_held(state, child, valid, receipt, admission_held(child))
    case _: Rejected{state, NotPreparing{}}

def release_admission(+state: State, +invocation: Nat, generation: Nat, lease: Nat,
    request: Nat, receipt: Nat) -> Step:
  admission_release_found(state, find(invocation, state_children(state)),
    provider_live(state, invocation, generation, lease, request), receipt)

def admission_cancelled_generation(child: Child, generation: Nat) -> Bool:
  match child:
    case Child{_, _, epoch, _, ChildCancelled{}, _, None{}, _}: Nat.is_eq(generation, epoch)
    case _: False{}

# Cancel alone is not physical drain. The retained provider lease must first be
# cleared by actual provider completion, then native releases this exact receipt.
def admission_cleanup_found(
  state: State,
  found: Maybe<&2, Child>,
  generation: Nat,
  receipt: Nat
) -> Step:
  match found:
    case Some{+child}:
      admission_release_held(state, child, admission_cancelled_generation(child, generation),
        receipt, admission_held(child))
    case _: Rejected{state, NotPreparing{}}

def cleanup_admission(+state: State, invocation: Nat, generation: Nat, receipt: Nat) -> Step:
  admission_cleanup_found(state, find(invocation, state_children(state)), generation, receipt)

def admission_published(canonical: C.State, +partition: Nat, +lifetime: Nat,
    +round: Nat, +observation: Nat) -> Bool:
  match canonical:
    case C.State{_, _, work, _, _, _, dispatch, _, _}:
      Bool.and(C.dispatch_preparation(C.find_work(partition, lifetime, round, observation, work)),
        Dispatch.known(dispatch, partition, lifetime, round, observation))

def admission_transfer_held(+state: State, child: Child, valid: Bool,
    +round: Nat, +observation: Nat, held: Maybe<&2, AdmissionPermission>) -> Step:
  match held:
    case Some{AdmissionHeld{receipt, +partition, +lifetime, +charge}}:
      admission_changed(
        Bool.and(
          valid,
          Bool.and(
            admission_charge_matches(
              admission_charge(state_canonical(state), charge),
              partition,
              charge
            ),
            admission_published(state_canonical(state), partition, lifetime, round, observation)
          )
        ),
        state,
        child,
        AdmissionTransferred{receipt, partition, lifetime, round, observation, charge}
      )
    case _: Rejected{state, NotPreparing{}}

def admission_transfer_found(state: State, found: Maybe<&2, Child>, valid: Bool,
    round: Nat, observation: Nat) -> Step:
  match found:
    case Some{+child}: admission_transfer_held(
      state,
      child,
      valid,
      round,
      observation,
      admission_held(child)
    )
    case _: Rejected{state, NotPreparing{}}

def transfer_admission(+state: State, +invocation: Nat, generation: Nat, lease: Nat,
    request: Nat, round: Nat, observation: Nat) -> Step:
  admission_transfer_found(state, find(invocation, state_children(state)),
    provider_live(state, invocation, generation, lease, request), round, observation)

def installed_canonical(
  state: State,
  canonical: C.State,
  outputs: List<&2, C.Output>,
  invalidated: Invalidated
) -> Step:
  match state invalidated:
    case State{_, next_invocation, next_lease, _} Invalidated{children, actions}:
      Advanced{State{canonical, next_invocation, next_lease, children}, outputs, actions}

def canonical_result(+state: State, result: C.Step) -> Step:
  match result:
    case C.Advanced{+canonical, outputs}: installed_canonical(state, canonical, outputs,
      invalidate_all(canonical, state_children(state)))
    case C.Rejected{_, reason}: Rejected{state, CanonicalRejected{reason}}

def canonical_event(+state: State, event: C.CanonicalEvent) -> Step:
  canonical_result(state, C.step(state_canonical(state), event))

def source_completed_result(+state: State, child: Child, result: C.Step) -> Step:
  match state child result:
    case State{_, next_invocation, next_lease, children} Child{
      SourceScope{p, l, r, o, SourceObservation{}},
      +invocation,
      +generation,
      handle,
      phase,
      Some{+request},
      lease,
      parent
    } C.Advanced{+canonical, outputs}:
      +continued = replace(
        invocation,
        children,
        Child{
          AfterSourceScope{
            p,
            l,
            r,
            o,
            Nat.add(request, 1n),
            Nat.add(generation, 1n),
            AfterNewBarrier{}
          },
          invocation,
          generation,
          handle,
          phase,
          Some{request},
          lease,
          parent
        }
      )
      installed_canonical(
        State{canonical, next_invocation, next_lease, continued},
        canonical,
        outputs,
        invalidate_all(canonical, continued)
      )
    case _ _ C.Rejected{_, reason}: Rejected{state, CanonicalRejected{reason}}
    case _ _ _: Rejected{state, WrongPhase{}}

def source_completed_allowed(valid: Bool, +state: State, +child: Child) -> Step:
  match valid child:
    case True{} Child{SourceScope{p, l, r, o, SourceObservation{}}, _, _, _, _, _, _, _}:
      source_completed_result(
        state,
        child,
        C.step(state_canonical(state), C.CompleteObservation{p, l, r, o})
      )
    case _ _: Rejected{state, WrongPhase{}}

def source_completed_found(valid: Bool, state: State, found: Maybe<&2, Child>) -> Step:
  match found:
    case Some{child}: source_completed_allowed(valid, state, child)
    case None{}: Rejected{state, UnknownInvocation{}}

def complete_source_observation(
  +state: State,
  +invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat
) -> Step:
  source_completed_found(
    provider_live(state, invocation, generation, lease, request),
    state,
    find(invocation, state_children(state))
  )

def source_started_result(+state: State, child: Child, result: C.Step) -> Step:
  match state child result:
    case State{_, next_invocation, next_lease, children} Child{
      SourceScope{p, l, r, o, SourceStartObservation{}},
      +invocation,
      generation,
      handle,
      phase,
      request,
      lease,
      parent
    } C.Advanced{+canonical, outputs}:
      +continued = replace(
        invocation,
        children,
        Child{
          SourceScope{p, l, r, o, SourceGate{}},
          invocation,
          generation,
          handle,
          phase,
          request,
          lease,
          parent
        }
      )
      installed_canonical(
        State{canonical, next_invocation, next_lease, continued},
        canonical,
        outputs,
        invalidate_all(canonical, continued)
      )
    case _ _ C.Rejected{_, reason}: Rejected{state, CanonicalRejected{reason}}
    case _ _ _: Rejected{state, WrongPhase{}}

def source_started_allowed(valid: Bool, +state: State, +child: Child) -> Step:
  match valid child:
    case True{} Child{SourceScope{p, l, r, o, SourceStartObservation{}}, _, _, _, _, _, _, _}:
      source_started_result(
        state,
        child,
        C.step(state_canonical(state), C.StartObservation{p, l, r, o})
      )
    case _ _: Rejected{state, WrongPhase{}}

def source_started_found(valid: Bool, state: State, found: Maybe<&2, Child>) -> Step:
  match found:
    case Some{child}: source_started_allowed(valid, state, child)
    case None{}: Rejected{state, UnknownInvocation{}}

def start_source_observation(
  +state: State,
  +invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat
) -> Step:
  source_started_found(
    provider_live(state, invocation, generation, lease, request),
    state,
    find(invocation, state_children(state))
  )

def launched(valid: Bool, state: State, scope: Scope, input_handle: Nat) -> Step:
  match valid state:
    case True{} State{canonical, +next_invocation, next_lease, children}:
      Advanced{
        State{
          canonical,
          Nat.add(next_invocation, 1n),
          next_lease,
          Child{
            scope,
            next_invocation,
            0n,
            0n,
            ChildInstalling{},
            None{},
            None{},
            None{}
          } <> children
        },
        Nil{},
        Launch{next_invocation, input_handle} <> Nil{}
      }
    case False{} _: Rejected{state, NotPreparing{}}

def settings_next_free(next: Nat, found: Maybe<&2, Child>) -> Bool:
  match next found:
    case 0n _: False{}
    case _ None{}: True{}
    case _ Some{_}: False{}

# One transition issues both operation and invocation. No host-supplied operation
# ID and no observation/preparation work is manufactured for settings resolution.
def launch_settings(+state: State, input_handle: Nat) -> Step:
  match state:
    case State{_, +next_invocation, _, +children}:
      launched(settings_next_free(next_invocation, find(next_invocation, children)), state,
        SettingsScope{next_invocation}, input_handle)

def launch_admission(+state: State, input_handle: Nat) -> Step:
  match state:
    case State{_, +next_invocation, _, +children}:
      launched(settings_next_free(next_invocation, find(next_invocation, children)), state,
        AdmissionScope{next_invocation, AdmissionUnreserved{}}, input_handle)

# Issue the independent freshness operation and root child in one transition.
def launch_freshness(+state: State, input_handle: Nat) -> Step:
  match state:
    case State{_, +next_invocation, _, +children}:
      launched(settings_next_free(next_invocation, find(next_invocation, children)), state,
        FreshnessScope{next_invocation}, input_handle)

# This entry issues the operation itself. A manufactured DeliveryScope cannot
# acquire authority through the ordinary launch entry.
def launch_collection(+state: State, context: DeliveryContext, +input_handle: Nat) -> Step:
  match state:
    case State{_, +next_invocation, _, +children}:
      launched(
        settings_next_free(next_invocation, find(next_invocation, children)),
        state,
        DeliveryScope{next_invocation, next_invocation, context, CollectDelivery{}, input_handle},
        input_handle
      )

def launch(+state: State, +scope: Scope, input_handle: Nat) -> Step:
  match scope:
    case Scope{_, _, _, _}: launched(
      live(state_canonical(state), scope),
      state,
      scope,
      input_handle
    )
    case _: Rejected{state, NotPreparing{}}

def same_preparation(left: Scope, right: Scope) -> Bool:
  match left right:
    case PreparationScope{p, l, r, operation} PreparationScope{q, m, s, other}:
      Bool.and(
        Nat.is_eq(p, q),
        Bool.and(Nat.is_eq(l, m), Bool.and(Nat.is_eq(r, s), Nat.is_eq(operation, other)))
      )
    case _ _: False{}

def preparation_claimed(phase: Phase) -> Bool:
  match phase:
    case _: True{}

def claimed_child(+scope: Scope, child: Child) -> Bool:
  match child:
    case Child{other, _, _, _, phase, _, _, _}: Bool.and(
      same_preparation(scope, other),
      preparation_claimed(phase)
    )

def claimed_preparation(+scope: Scope, children: List<&2, Child>) -> Bool:
  match children:
    case Nil{}: False{}
    case child <> rest: Bool.or(claimed_child(scope, child), claimed_preparation(scope, rest))

def launch_preparation_scope(+state: State, +scope: Scope, input_handle: Nat) -> Step:
  launched(
    Bool.and(
      live(state_canonical(state), scope),
      Bool.not(claimed_preparation(scope, state_children(state)))
    ),
    state,
    scope,
    input_handle
  )

def launch_preparation(+state: State, scope: Scope, input_handle: Nat) -> Step:
  match scope:
    case Scope{partition, lifetime, round, preparation}: launch_preparation_scope(
      state,
      PreparationScope{partition, lifetime, round, preparation},
      input_handle
    )
    case _: Rejected{state, NotPreparing{}}

def same_source(left: Scope, right: Scope) -> Bool:
  match left right:
    case SourceScope{p, l, r, o, _} SourceScope{q, m, s, other, _}:
      Bool.and(
        Nat.is_eq(p, q),
        Bool.and(Nat.is_eq(l, m), Bool.and(Nat.is_eq(r, s), Nat.is_eq(o, other)))
      )
    case SourceScope{p, l, r, o, _} AfterSourceScope{q, m, s, other, _, _, _}:
      Bool.and(
        Nat.is_eq(p, q),
        Bool.and(Nat.is_eq(l, m), Bool.and(Nat.is_eq(r, s), Nat.is_eq(o, other)))
      )
    case _ _: False{}

def source_claimed_child(scope: Scope, child: Child) -> Bool:
  match child:
    case Child{other, _, _, _, _, _, _, _}: same_source(scope, other)

def source_claimed(+scope: Scope, children: List<&2, Child>) -> Bool:
  match children:
    case Nil{}: False{}
    case child <> rest: Bool.or(source_claimed_child(scope, child), source_claimed(scope, rest))

def launch_source(+state: State, +scope: Scope, input_handle: Nat) -> Step:
  match scope:
    case SourceScope{_, _, _, _, SourceNew{}}: launched(
      Bool.and(
        live(state_canonical(state), scope),
        Bool.not(source_claimed(scope, state_children(state)))
      ),
      state,
      scope,
      input_handle
    )
    case _: Rejected{state, NotPreparing{}}

def launched_nested(
  valid: Bool,
  state: State,
  parent: Parent,
  scope: Scope,
  input_handle: Nat
) -> Step:
  match valid state:
    case True{} State{canonical, +next_invocation, next_lease, children}:
      Advanced{
        State{
          canonical,
          Nat.add(next_invocation, 1n),
          next_lease,
          Child{
            scope,
            next_invocation,
            0n,
            0n,
            ChildInstalling{},
            None{},
            None{},
            Some{parent}
          } <> children
        },
        Nil{},
        Launch{next_invocation, input_handle} <> Nil{}
      }
    case False{} _: Rejected{state, WrongPhase{}}

def parent_equal(left: Parent, right: Parent) -> Bool:
  match left right:
    case Parent{invocation, generation, request} Parent{other, current, pending}:
      Bool.and(
        Nat.is_eq(invocation, other),
        Bool.and(Nat.is_eq(generation, current), Nat.is_eq(request, pending))
      )

def owns_parent(parent: Parent, child: Child) -> Bool:
  match child:
    case Child{_, _, _, _, _, _, _, Some{other}}: parent_equal(parent, other)
    case _: False{}

def parent_used(+parent: Parent, children: List<&2, Child>) -> Bool:
  match children:
    case Nil{}: False{}
    case child <> rest: Bool.or(owns_parent(parent, child), parent_used(parent, rest))

def resolver_parent_role(child: Child) -> Bool:
  match child:
    case Child{PreparationScope{_, _, _, _}, _, _, _, _, _, _, _}: True{}
    case Child{Scope{_, _, _, _}, _, _, _, _, _, _, None{}}: True{}
    case _: False{}

def nested_found(
  +state: State,
  +parent: Parent,
  found: Maybe<&2, Child>,
  input_handle: Nat
) -> Step:
  match found:
    case None{}: Rejected{state, UnknownInvocation{}}
    case Some{+child}: launched_nested(
      Bool.and(
        Bool.not(parent_used(parent, state_children(state))),
        Bool.and(
          Bool.and(resolver_parent_role(child), parent_matches(parent, Some{child})),
          Bool.and(
            live_preparing(state_canonical(state), resolver_scope(child_scope_value(child))),
            child_live(state_canonical(state), state_children(state), child)
          )
        )
      ),
      state,
      parent,
      resolver_scope(child_scope_value(child)),
      input_handle
    )

def launch_nested(+state: State, +parent: Parent, input_handle: Nat) -> Step:
  nested_found(state, parent, find(parent_invocation(parent), state_children(state)), input_handle)

def installing(phase: Phase) -> Bool:
  match phase:
    case ChildInstalling{}: True{}
    case ChildResuming{}: True{}
    case _: False{}

def install_allowed(valid: Bool, state: State, child: Child, handle: Nat, request: Nat) -> Step:
  match valid child:
    case True{} Child{scope, invocation, generation, _, _, _, _, parent}:
      updated(
        state,
        ChildUpdate{
          Child{scope, invocation, generation, handle, ChildReady{}, Some{request}, None{}, parent},
          Nil{}
        }
      )
    case False{} _: Rejected{state, WrongGeneration{}}

def child_scope(child: Child) -> Scope:
  match child:
    case Child{scope, _, _, _, _, _, _, parent}: scope

def install_matches(child: Child, generation: Nat) -> Bool:
  match child:
    case Child{_, _, current, _, phase, _, None{}, _}: Bool.and(
      Nat.is_eq(current, generation),
      installing(phase)
    )
    case _: False{}

def delivery_installable(permission: DeliveryPermission) -> Bool:
  match permission:
    case CollectDelivery{}: True{}
    case PrepareDelivery{_}: True{}
    case FinalizeDelivery{_}: True{}
    case _: False{}

def ordinary_scope(scope: Scope) -> Bool:
  match scope:
    case DeliveryScope{_, _, _, permission, _}: delivery_installable(permission)
    case AdviceTailScope{_, _, _, _, _, _}: False{}
    case SourceScope{_, _, _, _, _}: False{}
    case AfterSourceScope{_, _, _, _, _, _, _}: False{}
    case _: True{}

def scope_request(scope: Scope, generation: Nat, request: Nat) -> Bool:
  match scope:
    case AfterSourceScope{_, _, _, _, expected, current, _}: Bool.and(
      Nat.is_eq(expected, request),
      Nat.is_eq(current, generation)
    )
    case _: True{}

def install_found(
  +state: State,
  found: Maybe<&2, Child>,
  +generation: Nat,
  +handle: Nat,
  +request: Nat
) -> Step:
  match found:
    case None{}: Rejected{state, UnknownInvocation{}}
    case Some{+child}: install_allowed(
      Bool.and(
        child_live(state_canonical(state), state_children(state), child),
        Bool.and(
          scope_request(child_scope_value(child), generation, request),
          Bool.and(ordinary_scope(child_scope_value(child)), install_matches(child, generation))
        )
      ),
      state,
      child,
      handle,
      request
    )

def install(+state: State, invocation: Nat, generation: Nat, handle: Nat, request: Nat) -> Step:
  install_found(state, find(invocation, state_children(state)), generation, handle, request)

def source_permission_transition(old: SourcePermission, next: SourcePermission) -> Bool:
  match old next:
    case SourceNew{} SourceStartPolicy{}: True{}
    case SourceNew{} SourceStartObservation{}: True{}
    case SourceStartPolicy{} SourceStartObservation{}: True{}
    case SourceStartPolicy{} SourceEarlyRelease{}: True{}
    case SourceStartObservation{} SourceEarlyRelease{}: True{}
    case SourceEarlyRelease{} SourceEarlyRelease{}: True{}
    case SourceEarlyRelease{} SourceGate{}: True{}
    case SourceStartPolicy{} SourceStartPolicy{}: True{}
    case SourceGate{} SourceGate{}: True{}
    case SourceGate{} SourceEarlyRelease{}: True{}
    case SourceCandidate{} SourceEarlyRelease{}: True{}
    case SourceActivity{} SourceEarlyRelease{}: True{}
    case SourcePolicy{} SourceEarlyRelease{}: True{}
    case SourceObservation{} SourceEarlyRelease{}: True{}
    case SourceGate{} SourceCandidate{}: True{}
    case SourceGate{} SourceActivity{}: True{}
    case SourceNew{} SourceCandidate{}: True{}
    case SourceCandidate{} SourceCandidate{}: True{}
    case SourceNew{} SourceActivity{}: True{}
    case SourceCandidate{} SourceActivity{}: True{}
    case SourceActivity{} SourceActivity{}: True{}
    case SourceActivity{} SourcePolicy{}: True{}
    case SourceActivity{} SourceObservation{}: True{}
    case SourcePolicy{} SourceObservation{}: True{}
    case _ _: False{}

def source_install_allowed(
  valid: Bool,
  state: State,
  child: Child,
  handle: Nat,
  request: Nat,
  permission: SourcePermission
) -> Step:
  match valid child:
    case True{} Child{SourceScope{p, l, r, o, _}, invocation, generation, _, _, _, _, parent}:
      updated(
        state,
        ChildUpdate{
          Child{
            SourceScope{p, l, r, o, permission},
            invocation,
            generation,
            handle,
            ChildReady{},
            Some{request},
            None{},
            parent
          },
          Nil{}
        }
      )
    case _ _: Rejected{state, WrongPhase{}}

def source_install_found(
  +state: State,
  found: Maybe<&2, Child>,
  +generation: Nat,
  handle: Nat,
  request: Nat,
  +permission: SourcePermission
) -> Step:
  match found:
    case Some{+child}:
      match child:
        case Child{SourceScope{_, _, _, _, old}, _, _, _, _, _, _, _}:
          source_install_allowed(
            Bool.and(
              child_live(state_canonical(state), state_children(state), child),
              Bool.and(
                install_matches(child, generation),
                source_permission_transition(old, permission)
              )
            ),
            state,
            child,
            handle,
            request,
            permission
          )
        case _: Rejected{state, WrongPhase{}}
    case None{}: Rejected{state, UnknownInvocation{}}

def install_source(
  +state: State,
  invocation: Nat,
  generation: Nat,
  handle: Nat,
  request: Nat,
  permission: SourcePermission
) -> Step:
  source_install_found(
    state,
    find(invocation, state_children(state)),
    generation,
    handle,
    request,
    permission
  )

def after_source_transition(old: AfterSourcePermission, next: AfterSourcePermission) -> Bool:
  match old next:
    case AfterNewBarrier{} AfterBarrier{}: True{}
    case AfterNewBarrier{} AfterRecoveryAnalytics{}: True{}
    case AfterBarrier{} AfterRecoveryAnalytics{}: True{}
    case AfterRecoveryAnalytics{} AfterRecoveryRelease{}: True{}
    case AfterRecoveryRelease{} AfterRecoveryRuntime{}: True{}
    case AfterRecoveryRuntime{} AfterRecoveryActivity{}: True{}
    case _ _: False{}

def after_source_install_allowed(
  valid: Bool,
  state: State,
  child: Child,
  handle: Nat,
  +request: Nat,
  permission: AfterSourcePermission
) -> Step:
  match valid child:
    case True{} Child{
      AfterSourceScope{p, l, r, o, _, _, _},
      invocation,
      +generation,
      _,
      _,
      _,
      _,
      parent
    }:
      updated(
        state,
        ChildUpdate{
          Child{
            AfterSourceScope{p, l, r, o, Nat.add(request, 1n), Nat.add(generation, 1n), permission},
            invocation,
            generation,
            handle,
            ChildReady{},
            Some{request},
            None{},
            parent
          },
          Nil{}
        }
      )
    case _ _: Rejected{state, WrongPhase{}}

def after_source_install_found(
  +state: State,
  found: Maybe<&2, Child>,
  +generation: Nat,
  handle: Nat,
  +request: Nat,
  +permission: AfterSourcePermission
) -> Step:
  match found:
    case Some{+child}:
      match child:
        case Child{+scope, _, _, _, _, _, _, _}:
          match scope:
            case AfterSourceScope{_, _, _, _, _, _, old}:
              after_source_install_allowed(
                Bool.and(
                  scope_request(scope, generation, request),
                  Bool.and(
                    install_matches(child, generation),
                    after_source_transition(old, permission)
                  )
                ),
                state,
                child,
                handle,
                request,
                permission
              )
            case _: Rejected{state, WrongPhase{}}
    case None{}: Rejected{state, UnknownInvocation{}}

def install_after_source(
  +state: State,
  invocation: Nat,
  generation: Nat,
  handle: Nat,
  request: Nat,
  permission: AfterSourcePermission
) -> Step:
  after_source_install_found(
    state,
    find(invocation, state_children(state)),
    generation,
    handle,
    request,
    permission
  )

def provider_allowed(valid: Bool, state: State, child: Child) -> Step:
  match valid state child:
    case True{} State{canonical, next_invocation, +next_lease, children}
        Child{
          scope,
          +invocation,
          generation,
          +handle,
          ChildReady{},
          Some{+request},
          None{},
          parent
        }:
      Advanced{State{canonical, next_invocation, Nat.add(next_lease, 1n),
        replace(invocation, children, Child{scope, invocation, generation, handle, ChildAwaiting{},
          Some{request}, Some{Lease{next_lease, request}}, parent})}, Nil{},
        ExecuteProvider{invocation, next_lease, request, handle} <> Nil{}}
    case _ _ _: Rejected{state, WrongPhase{}}

def provider_found(+state: State, found: Maybe<&2, Child>) -> Step:
  match found:
    case None{}: Rejected{state, UnknownInvocation{}}
    case Some{+child}: provider_allowed(
      child_live(state_canonical(state), state_children(state), child),
      state,
      child
    )

def provider_start(+state: State, invocation: Nat) -> Step:
  provider_found(state, find(invocation, state_children(state)))

def reconcile_cancel_join(
  state: State,
  outputs: List<&2, C.Output>,
  actions: List<&2, Action>,
  invalidated: Invalidated
) -> Step:
  match state invalidated:
    case State{canonical, next_invocation, next_lease, _} Invalidated{children, additional}:
      Advanced{
        State{canonical, next_invocation, next_lease, children},
        outputs,
        List.append(&2, Action, actions, additional)
      }

def reconcile_cancel(step: Step) -> Step:
  match step:
    case Advanced{+state, outputs, actions}: reconcile_cancel_join(
      state,
      outputs,
      actions,
      invalidate_all(state_canonical(state), state_children(state))
    )
    case _: step

def completion_active(valid: Bool, state: State, child: Child, reply_handle: Nat) -> Step:
  match valid child:
    case True{} Child{
      scope,
      +invocation,
      generation,
      +handle,
      ChildAwaiting{},
      _,
      Some{Lease{lease, _}},
      parent
    }:
      +next = Nat.add(generation, 1n)
      updated(
        state,
        ChildUpdate{
          Child{scope, invocation, next, 0n, ChildResuming{}, None{}, None{}, parent},
          Resume{
            invocation,
            next,
            handle,
            reply_handle
          } <> List.append(
            &2,
            Action,
            retire(invocation, handle),
            CleanupProvider{invocation, lease} <> Nil{}
          )
        }
      )
    case _ Child{scope, +invocation, generation, +handle, _, _, Some{Lease{lease, _}}, parent}:
      updated(
        state,
        ChildUpdate{
          Child{scope, invocation, generation, 0n, ChildCancelled{}, None{}, None{}, parent},
          CleanupProvider{invocation, lease} <> retire(invocation, handle)
        }
      )
    case _ _: Rejected{state, WrongLease{}}

def lease_matches(child: Child, lease: Nat, request: Nat) -> Bool:
  match child:
    case Child{_, _, _, _, _, _, Some{Lease{id, expected}}, _}:
      Bool.and(Nat.is_eq(id, lease), Nat.is_eq(expected, request))
    case _: False{}

def completion_matched(matches: Bool, +state: State, +child: Child, reply_handle: Nat) -> Step:
  match matches:
    case False{}: Rejected{state, WrongLease{}}
    case True{}: reconcile_cancel(
      completion_active(
        child_live(state_canonical(state), state_children(state), child),
        state,
        child,
        reply_handle
      )
    )

def completion_found(
  state: State,
  found: Maybe<&2, Child>,
  lease: Nat,
  request: Nat,
  reply_handle: Nat
) -> Step:
  match found:
    case None{}: Rejected{state, UnknownInvocation{}}
    case Some{+child}: completion_matched(
      lease_matches(child, lease, request),
      state,
      child,
      reply_handle
    )

def provider_completed(
  +state: State,
  invocation: Nat,
  lease: Nat,
  request: Nat,
  reply_handle: Nat
) -> Step:
  completion_found(state, find(invocation, state_children(state)), lease, request, reply_handle)

# Source interruption and its custody transition share one Canonical publication.
# Absence discharges only this custody; it does not fabricate an interrupt event.
def source_interrupt_result(original: State, transition: Step, result: C.Step) -> Step:
  match transition result:
    case Advanced{State{_, next_invocation, next_lease, children}, prior_outputs, actions} C.Advanced{
      canonical,
      outputs
    }:
      reconcile_cancel(Advanced{State{canonical, next_invocation, next_lease, children},
        List.append(&2, C.Output, prior_outputs, outputs), actions})
    case _ C.Rejected{_, reason}: Rejected{original, CanonicalRejected{reason}}
    case _ _: transition

def source_interrupt_found(
  +state: State,
  transition: Step,
  scope: Scope,
  found: Maybe<&2, C.Work>
) -> Step:
  match scope found:
    case SourceScope{_, _, _, _, _} None{}: reconcile_cancel(transition)
    case SourceScope{p, l, r, o, _} Some{_}:
      source_interrupt_result(
        state,
        transition,
        C.step(state_canonical(state), C.InterruptObservation{p, l, r, o})
      )
    case _ _: Rejected{state, WrongPhase{}}

def source_canonical_work(canonical: C.State) -> List<&2, C.Work>:
  match canonical:
    case C.State{_, _, work, _, _, _, _, _, _}: work

def source_interrupt(+state: State, transition: Step, +scope: Scope) -> Step:
  match scope:
    case SourceScope{+p, +l, +r, o, _}:
      source_interrupt_found(
        state,
        transition,
        scope,
        C.find_work(p, l, r, o, source_canonical_work(state_canonical(state)))
      )
    case _: Rejected{state, WrongPhase{}}

def source_cancel_allowed(valid: Bool, +state: State, +child: Child) -> Step:
  match valid:
    case True{}: source_interrupt(
      state,
      updated(state, cancel_child(child)),
      child_scope_value(child)
    )
    case False{}: Rejected{state, WrongPhase{}}

def cancel_allowed(valid: Bool, state: State, child: Child) -> Step:
  match valid:
    case True{}: reconcile_cancel(updated(state, cancel_child(child)))
    case False{}: Rejected{state, WrongPhase{}}

def child_active(child: Child) -> Bool:
  match child:
    case Child{_, _, _, _, phase, _, _, _}: active(phase)

type ActiveReader is Type:
  ActiveReader{query: Nat -> Maybe<&2, Bool>}

def active_observed(child: Maybe<&2, Child>) -> Maybe<&2, Bool>:
  match child:
    case None{}: None{}
    case Some{child}: Some{child_active(child)}

def active_reader(+children: List<&2, Child>) -> ActiveReader:
  ActiveReader{invocation => active_observed(find(invocation, children))}

def active_query(reader: ActiveReader, invocation: Nat) -> Maybe<&2, Bool>:
  match reader:
    case ActiveReader{query}: query(invocation)

def active_reader_exact(+children: List<&2, Child>, +invocation: Nat) -> {
  active_query(active_reader(children), invocation)
  == active_observed(find(invocation, children))
  : Maybe<&2, Bool>
}:
  {==}

def advice_cleanup_allowed(valid: Bool, state: State, child: Child) -> Step:
  match valid child:
    case True{} Child{
      AdviceTailScope{p, l, r, operation, origin, _},
      invocation,
      generation,
      handle,
      phase,
      pending,
      lease,
      parent
    }:
      updated(
        state,
        ChildUpdate{
          Child{
            AdviceTailScope{p, l, r, operation, origin, TailRemove{}},
            invocation,
            generation,
            handle,
            phase,
            pending,
            lease,
            parent
          },
          Nil{}
        }
      )
    case _ _: Rejected{state, WrongPhase{}}

def cancel_scope(state: State, +child: Child, scope: Scope) -> Step:
  match scope:
    case AdviceTailScope{_, _, _, _, _, _}: advice_cleanup_allowed(
      child_active(child),
      state,
      child
    )
    case SourceScope{_, _, _, _, _}: source_cancel_allowed(child_active(child), state, child)
    case _: cancel_allowed(child_active(child), state, child)

def cancel_found(state: State, found: Maybe<&2, Child>) -> Step:
  match found:
    case None{}: Rejected{state, UnknownInvocation{}}
    case Some{+child}: cancel_scope(state, child, child_scope_value(child))

def cancel(+state: State, invocation: Nat) -> Step:
  cancel_found(state, find(invocation, state_children(state)))

def terminal_allowed(valid: Bool, state: State, child: Child, result_handle: Nat) -> Step:
  match valid child:
    case True{} Child{+scope, +invocation, generation, handle, _, _, None{}, parent}:
      updated(
        state,
        ChildUpdate{
          Child{scope, invocation, generation, 0n, ChildAccepted{}, None{}, None{}, parent},
          AcceptResult{scope, invocation, result_handle} <> retire(invocation, handle)
        }
      )
    case _ _: Rejected{state, WrongPhase{}}

def source_failure_allowed(valid: Bool, +state: State, +child: Child, result_handle: Nat) -> Step:
  match valid child:
    case True{} Child{SourceScope{_, _, _, _, _}, _, _, _, _, _, None{}, _}:
      source_interrupt(
        state,
        terminal_allowed(True{}, state, child, result_handle),
        child_scope_value(child)
      )
    case _ _: Rejected{state, WrongPhase{}}

def source_failure_found(
  +state: State,
  found: Maybe<&2, Child>,
  generation: Nat,
  result_handle: Nat
) -> Step:
  match found:
    case Some{+child}: source_failure_allowed(
      Bool.and(child_active(child), install_matches(child, generation)),
      state,
      child,
      result_handle
    )
    case None{}: Rejected{state, UnknownInvocation{}}

def terminal_source_failed(
  +state: State,
  invocation: Nat,
  generation: Nat,
  result_handle: Nat
) -> Step:
  source_failure_found(state, find(invocation, state_children(state)), generation, result_handle)

def terminal_scope(scope: Scope) -> Bool:
  match scope:
    case AdmissionScope{_, AdmissionHeld{_, _, _, _}}: False{}
    case EvaluationCleanupScope{_, _, _, _}: False{}
    case EvaluationDispatchScope{_, _, _}: False{}
    case EvaluationScope{_, _, EvaluationSettled{}}: True{}
    case EvaluationScope{_, _, _}: False{}
    case DeliveryScope{_, _, _, _, _}: False{}
    case PreparationScope{_, _, _, _}: False{}
    case SourceScope{_, _, _, _, _}: False{}
    case AdviceTailScope{_, _, _, _, _, TailActive{}}: True{}
    case AdviceTailScope{_, _, _, _, _, TailRecord{}}: True{}
    case AdviceTailScope{_, _, _, _, _, TailRemove{}}: True{}
    case AdviceTailScope{_, _, _, _, _, _}: False{}
    case _: True{}

def terminal_found(
  +state: State,
  found: Maybe<&2, Child>,
  generation: Nat,
  result_handle: Nat
) -> Step:
  match found:
    case None{}: Rejected{state, UnknownInvocation{}}
    case Some{+child}: terminal_allowed(
      Bool.and(
        terminal_scope(child_scope_value(child)),
        Bool.and(
          child_live(state_canonical(state), state_children(state), child),
          install_matches(child, generation)
        )
      ),
      state,
      child,
      result_handle
    )

def unused_advice(child: Child) -> Bool:
  match child:
    case Child{
      AdviceTailScope{_, _, _, _, _, TailNew{}},
      _,
      _,
      _,
      ChildInstalling{},
      None{},
      None{},
      None{}
    }: True{}
    case _: False{}

def preserved_advice_found(
  +state: State,
  found: Maybe<&2, Child>,
  generation: Nat,
  result_handle: Nat
) -> Step:
  match found:
    case Some{+child}: terminal_allowed(
      Bool.and(
        unused_advice(child),
        Bool.and(
          child_live(state_canonical(state), state_children(state), child),
          install_matches(child, generation)
        )
      ),
      state,
      child,
      result_handle
    )
    case None{}: Rejected{state, UnknownInvocation{}}

def terminal_advice_preserved(
  +state: State,
  invocation: Nat,
  generation: Nat,
  result_handle: Nat
) -> Step:
  preserved_advice_found(state, find(invocation, state_children(state)), generation, result_handle)

def terminal(+state: State, invocation: Nat, generation: Nat, result_handle: Nat) -> Step:
  terminal_found(state, find(invocation, state_children(state)), generation, result_handle)

def preparation_failure_found(
  +state: State,
  found: Maybe<&2, Child>,
  generation: Nat,
  result_handle: Nat
) -> Step:
  match found:
    case None{}: Rejected{state, UnknownInvocation{}}
    case Some{+child}: terminal_allowed(
      Bool.and(
        preparation_scope_kind(child_scope_value(child)),
        Bool.and(
          child_live(state_canonical(state), state_children(state), child),
          install_matches(child, generation)
        )
      ),
      state,
      child,
      result_handle
    )

def terminal_preparation_failed(
  +state: State,
  invocation: Nat,
  generation: Nat,
  result_handle: Nat
) -> Step:
  preparation_failure_found(
    state,
    find(invocation, state_children(state)),
    generation,
    result_handle
  )

def preparation_parent(found: Maybe<&2, C.Work>) -> Maybe<&2, Nat>:
  match found:
    case Some{C.Work{_, _, _, _, _, C.Preparing{}, observation}}: Some{observation}
    case _: None{}

def preparation_observation(canonical: C.State, scope: Scope) -> Maybe<&2, Nat>:
  match canonical scope:
    case C.State{_, _, work, _, _, _, _, _, _} PreparationScope{
      partition,
      lifetime,
      round,
      preparation
    }:
      preparation_parent(C.find_work(partition, lifetime, round, preparation, work))
    case _ _: None{}

def source_preparation_scope(
  source: Scope,
  preparation: Scope,
  observation: Maybe<&2, Nat>
) -> Bool:
  match source preparation observation:
    case SourceScope{p, l, r, o, SourceCandidate{}} PreparationScope{q, m, s, _} Some{other}:
      Bool.and(
        Nat.is_eq(p, q),
        Bool.and(Nat.is_eq(l, m), Bool.and(Nat.is_eq(r, s), Nat.is_eq(o, other)))
      )
    case _ _ _: False{}

def source_preparation_found(
  +state: State,
  +parent: Parent,
  found: Maybe<&2, Child>,
  +scope: Scope,
  input_handle: Nat
) -> Step:
  match found:
    case Some{+child}: launched_nested(
      Bool.and(
        parent_matches(parent, Some{child}),
        Bool.and(
          child_live(state_canonical(state), state_children(state), child),
          Bool.and(
            source_preparation_scope(
              child_scope_value(child),
              scope,
              preparation_observation(state_canonical(state), scope)
            ),
            Bool.and(
              Bool.not(parent_used(parent, state_children(state))),
              Bool.not(claimed_preparation(scope, state_children(state)))
            )
          )
        )
      ),
      state,
      parent,
      scope,
      input_handle
    )
    case None{}: Rejected{state, UnknownInvocation{}}

def launch_source_preparation(
  +state: State,
  +parent: Parent,
  scope: Scope,
  input_handle: Nat
) -> Step:
  source_preparation_found(
    state,
    parent,
    find(parent_invocation(parent), state_children(state)),
    scope,
    input_handle
  )

def handoff(state: State, child: Child, result_handle: Nat, observation: Maybe<&2, Nat>) -> Step:
  match state child observation:
    case State{canonical, +next_invocation, next_lease, children}
        Child{
          PreparationScope{+partition, +lifetime, +round, +preparation},
          +invocation,
          generation,
          handle,
          _,
          _,
          None{},
          +parent
        } Some{+observation}:
      Advanced{
        State{
          canonical,
          Nat.add(next_invocation, 1n),
          next_lease,
          Child{
            RetainingScope{partition, lifetime, round, observation, invocation},
            next_invocation,
            0n,
            0n,
            ChildInstalling{},
            None{},
            None{},
            parent
          } <> replace(
            invocation,
            children,
            Child{
              PreparationScope{partition, lifetime, round, preparation},
              invocation,
              generation,
              0n,
              ChildAccepted{},
              None{},
              None{},
              parent
            }
          )
        },
        Nil{},
        LaunchPostPreparation{
          next_invocation,
          invocation,
          result_handle,
          RetainingScope{partition, lifetime, round, observation, invocation}
        } <> retire(invocation, handle)
      }
    case _ _ _: Rejected{state, WrongPhase{}}

def preparation_terminal_allowed(
  valid: Bool,
  +state: State,
  +child: Child,
  result_handle: Nat
) -> Step:
  match valid:
    case True{}: handoff(
      state,
      child,
      result_handle,
      preparation_observation(state_canonical(state), child_scope_value(child))
    )
    case False{}: Rejected{state, WrongPhase{}}

def terminal_preparation_found(
  +state: State,
  found: Maybe<&2, Child>,
  generation: Nat,
  result_handle: Nat
) -> Step:
  match found:
    case None{}: Rejected{state, UnknownInvocation{}}
    case Some{+child}: preparation_terminal_allowed(
      Bool.and(
        child_live(state_canonical(state), state_children(state), child),
        install_matches(child, generation)
      ),
      state,
      child,
      result_handle
    )

def terminal_preparation(
  +state: State,
  invocation: Nat,
  generation: Nat,
  result_handle: Nat
) -> Step:
  terminal_preparation_found(
    state,
    find(invocation, state_children(state)),
    generation,
    result_handle
  )

def delivery_nats_equal(left: List<&2, Nat>, right: List<&2, Nat>) -> Bool:
  match left right:
    case Nil{} Nil{}: True{}
    case x <> xs y <> ys: Bool.and(Nat.is_eq(x, y), delivery_nats_equal(xs, ys))
    case _ _: False{}

def delivery_round_equal(left: Maybe<&2, Nat>, right: Maybe<&2, Nat>) -> Bool:
  match left right:
    case None{} None{}: True{}
    case Some{x} Some{y}: Nat.is_eq(x, y)
    case _ _: False{}

def delivery_bool_equal(left: Bool, right: Bool) -> Bool:
  match left right:
    case True{} True{}: True{}
    case False{} False{}: True{}
    case _ _: False{}

def delivery_context_equal(left: DeliveryContext, right: DeliveryContext) -> Bool:
  match left right:
    case DeliveryContext{a, b, c, d, e, f} DeliveryContext{g, h, i, j, k, l}:
      Bool.and(
        Nat.is_eq(a, g),
        Bool.and(
          String.eq(b, h),
          Bool.and(
            delivery_round_equal(c, i),
            Bool.and(
              Nat.is_eq(d, j),
              Bool.and(delivery_round_equal(e, k), delivery_bool_equal(f, l))
            )
          )
        )
      )

def delivery_selection_equal(left: DeliverySelection, right: DeliverySelection) -> Bool:
  match left right:
    case NoDeliverySelection{} NoDeliverySelection{}: True{}
    case DeliverySelection{a, b, c} DeliverySelection{d, e, f}:
      Bool.and(Nat.is_eq(a, d), Bool.and(delivery_nats_equal(b, e), delivery_nats_equal(c, f)))
    case _ _: False{}

def delivery_permission_equal(left: DeliveryPermission, right: DeliveryPermission) -> Bool:
  match left right:
    case CollectDelivery{} CollectDelivery{}: True{}
    case PrepareDeliveryIssued{a} PrepareDeliveryIssued{b}: delivery_selection_equal(a, b)
    case PrepareDelivery{a} PrepareDelivery{b}: delivery_selection_equal(a, b)
    case FinalizeDeliveryIssued{a} FinalizeDeliveryIssued{b}: delivery_selection_equal(a, b)
    case FinalizeDelivery{a} FinalizeDelivery{b}: delivery_selection_equal(a, b)
    case _ _: False{}

def delivery_claim_permission(permission: DeliveryPermission) -> Maybe<&2, DeliveryPermission>:
  match permission:
    case PrepareDeliveryIssued{selection}: Some{PrepareDelivery{selection}}
    case FinalizeDeliveryIssued{selection}: Some{FinalizeDelivery{selection}}
    case _: None{}

def delivery_receipt_matches(child: Child, receipt: DeliveryReceipt) -> Bool:
  match child receipt:
    case Child{DeliveryScope{operation, origin, context, permission, input}, invocation, generation,
        _, ChildInstalling{}, None{}, None{}, None{}}
        DeliveryReceipt{
          +actual,
          epoch,
          expected_origin,
          expected_context,
          expected_permission,
          expected_input
        }:
      Bool.and(
        Nat.is_eq(operation, actual),
        Bool.and(
          Nat.is_eq(invocation, actual),
          Bool.and(
            Nat.is_eq(generation, epoch),
            Bool.and(
              Nat.is_eq(origin, expected_origin),
              Bool.and(
                delivery_context_equal(context, expected_context),
                Bool.and(
                  delivery_permission_equal(permission, expected_permission),
                  Nat.is_eq(input, expected_input)
                )
              )
            )
          )
        )
      )
    case _ _: False{}

def claim_delivery_permission(
  state: State,
  child: Child,
  permission: Maybe<&2, DeliveryPermission>
) -> Step:
  match child permission:
    case Child{DeliveryScope{operation, origin, context, _, +input}, +invocation, generation,
        _, _, _, _, parent} Some{permission}:
      updated(state, ChildUpdate{
        Child{DeliveryScope{operation, origin, context, permission, input}, invocation, generation,
          0n, ChildInstalling{}, None{}, None{}, parent},
        Launch{invocation, input} <> Nil{}})
    case _ _: Rejected{state, WrongPhase{}}

def claim_delivery_allowed(valid: Bool, state: State, +child: Child) -> Step:
  match valid child:
    case True{} Child{DeliveryScope{_, _, _, permission, _}, _, _, _, _, _, _, _}:
      claim_delivery_permission(state, child, delivery_claim_permission(permission))
    case _ _: Rejected{state, WrongPhase{}}

def claim_delivery_found(state: State, found: Maybe<&2, Child>, +receipt: DeliveryReceipt) -> Step:
  match found:
    case None{}: Rejected{state, UnknownInvocation{}}
    case Some{+child}: claim_delivery_allowed(
      delivery_receipt_matches(child, receipt),
      state,
      child
    )

def claim_delivery(+state: State, +receipt: DeliveryReceipt) -> Step:
  match receipt:
    case DeliveryReceipt{invocation, _, _, _, _, _}:
      claim_delivery_found(state, find(invocation, state_children(state)), receipt)

# Acceptance creates a pending next child and its immutable receipt in one
# publication. It does not launch freshness across the caller/transport gap.
def issue_delivery(
  state: State,
  child: Child,
  +result_handle: Nat,
  +permission: DeliveryPermission
) -> Step:
  match state child:
    case State{canonical, +next_invocation, next_lease, children}
        Child{DeliveryScope{_, +origin, +context, +old_permission, +input}, +invocation,
          generation, handle, _, _, None{}, None{}}:
      Advanced{
        State{
          canonical,
          Nat.add(next_invocation, 1n),
          next_lease,
          Child{
            DeliveryScope{next_invocation, origin, context, permission, result_handle},
            next_invocation,
            0n,
            0n,
            ChildInstalling{},
            None{},
            None{},
            None{}
          } <> replace(
            invocation,
            children,
            Child{
              DeliveryScope{invocation, origin, context, old_permission, input},
              invocation,
              generation,
              0n,
              ChildAccepted{},
              None{},
              None{},
              None{}
            }
          )
        },
        Nil{},
        IssueDeliveryHandoff{
          invocation,
          DeliveryReceipt{next_invocation, 0n, origin, context, permission, result_handle}
        } <> retire(invocation, handle)
      }
    case _ _: Rejected{state, WrongPhase{}}

def complete_collection_selection(
  state: State,
  child: Child,
  result_handle: Nat,
  selection: DeliverySelection
) -> Step:
  issue_delivery(state, child, result_handle, PrepareDeliveryIssued{selection})

def complete_delivery_permission(
  state: State,
  +child: Child,
  result_handle: Nat,
  selection: DeliverySelection
) -> Step:
  match child:
    case Child{DeliveryScope{_, _, _, CollectDelivery{}, _}, _, _, _, _, _, _, _}:
      complete_collection_selection(state, child, result_handle, selection)
    case Child{DeliveryScope{_, _, _, PrepareDelivery{original}, _}, _, _, _, _, _, _, _}:
      issue_delivery(state, child, result_handle, FinalizeDeliveryIssued{original})
    case Child{DeliveryScope{_, _, _, FinalizeDelivery{_}, _}, _, _, _, _, _, _, _}:
      terminal_allowed(True{}, state, child, result_handle)
    case _: Rejected{state, WrongPhase{}}

def complete_delivery_allowed(valid: Bool, state: State, child: Child, result_handle: Nat,
    selection: DeliverySelection) -> Step:
  match valid:
    case True{}: complete_delivery_permission(state, child, result_handle, selection)
    case False{}: Rejected{state, WrongPhase{}}

def complete_delivery_found(+state: State, found: Maybe<&2, Child>, generation: Nat,
    result_handle: Nat, selection: DeliverySelection) -> Step:
  match found:
    case None{}: Rejected{state, UnknownInvocation{}}
    case Some{+child}: complete_delivery_allowed(
      Bool.and(
        child_live(state_canonical(state), state_children(state), child),
        install_matches(child, generation)
      ),
      state,
      child,
      result_handle,
      selection
    )

def complete_delivery(+state: State, invocation: Nat, generation: Nat, result_handle: Nat,
    selection: DeliverySelection) -> Step:
  complete_delivery_found(
    state,
    find(invocation, state_children(state)),
    generation,
    result_handle,
    selection
  )

# Advice-tail lifetime is issued only at a checked PendingFinding birth. It
# survives source/round cutoff; explicit lifetime shutdown enters cleanup-only.
# The runtime binding additionally fences the exact native capability pointer.
def advice_birth(found: Maybe<&2, C.Work>) -> Bool:
  match found:
    case Some{C.Work{_, _, _, _, _, C.PendingFinding{_}, _}}: True{}
    case _: False{}

def advice_claimed(+operation: Nat, +origin_scope: Scope, children: List<&2, Child>) -> Bool:
  match origin_scope children:
    case _ Nil{}: False{}
    case RetainingScope{+p, +l, +r, +o, +origin} Child{
      AdviceTailScope{q, m, s, other, _, _},
      _,
      _,
      _,
      _,
      _,
      _,
      _
    } <> rest:
      Bool.or(
        Bool.and(
          Nat.is_eq(p, q),
          Bool.and(Nat.is_eq(l, m), Bool.and(Nat.is_eq(r, s), Nat.is_eq(operation, other)))
        ),
        advice_claimed(operation, RetainingScope{p, l, r, o, origin}, rest)
      )
    case EvaluationScope{invocation, EvaluationContext{+p, +l, +r, own}, permission} Child{
      AdviceTailScope{q, m, t, other, _, _},
      _,
      _,
      _,
      _,
      _,
      _,
      _
    } <> rest:
      Bool.or(
        Bool.and(
          Nat.is_eq(p, q),
          Bool.and(Nat.is_eq(l, m), Bool.and(Nat.is_eq(r, t), Nat.is_eq(operation, other)))
        ),
        advice_claimed(
          operation,
          EvaluationScope{invocation, EvaluationContext{p, l, r, own}, permission},
          rest
        )
      )
    case +scope _ <> rest: advice_claimed(operation, scope, rest)

def advice_operation_live(
  canonical: C.State,
  partition: Nat,
  lifetime: Nat,
  round: Nat,
  operation: Nat
) -> Bool:
  match canonical:
    case C.State{_, _, work, _, _, _, _, _, _}: advice_birth(
      C.find_work(partition, lifetime, round, operation, work)
    )

def advice_handoff_allowed(
  valid: Bool,
  state: State,
  partition: Nat,
  lifetime: Nat,
  round: Nat,
  +origin: Nat,
  +operation: Nat,
  input_handle: Nat
) -> Step:
  match valid state:
    case True{} State{canonical, +next_invocation, next_lease, children}:
      Advanced{
        State{
          canonical,
          Nat.add(next_invocation, 1n),
          next_lease,
          Child{
            AdviceTailScope{partition, lifetime, round, operation, origin, TailNew{}},
            next_invocation,
            0n,
            0n,
            ChildInstalling{},
            None{},
            None{},
            None{}
          } <> children
        },
        Nil{},
        LaunchAdviceTail{next_invocation, origin, operation, input_handle} <> Nil{}
      }
    case _ _: Rejected{state, WrongPhase{}}

def evaluation_advice_handoff(
  +state: State,
  +origin: Nat,
  +context: EvaluationContext,
  +operation: Nat,
  input_handle: Nat
) -> Step:
  match context:
    case EvaluationContext{+p, +l, +r, own}:
      advice_handoff_allowed(
        Bool.and(
          Nat.is_eq(own, operation),
          Bool.and(
            advice_operation_live(state_canonical(state), p, l, r, operation),
            Bool.not(
              advice_claimed(
                operation,
                EvaluationScope{origin, context, EvaluationSettled{}},
                state_children(state)
              )
            )
          )
        ),
        state,
        p,
        l,
        r,
        origin,
        operation,
        input_handle
      )

def advice_handoff_child(
  +state: State,
  child: Maybe<&2, Child>,
  +operation: Nat,
  input_handle: Nat
) -> Step:
  match child:
    case Some{
      Child{
        EvaluationScope{_, context, EvaluationSettled{}},
        origin,
        _,
        _,
        ChildAwaiting{},
        _,
        Some{_},
        _
      }
    }:
      evaluation_advice_handoff(state, origin, context, operation, input_handle)
    case Some{
      Child{
        RetainingScope{+p, +l, +r, observation, preparation_origin},
        origin,
        _,
        _,
        ChildAwaiting{},
        _,
        Some{_},
        _
      }
    }:
      advice_handoff_allowed(
        Bool.and(
          advice_operation_live(state_canonical(state), p, l, r, operation),
          Bool.not(
            advice_claimed(
              operation,
              RetainingScope{p, l, r, observation, preparation_origin},
              state_children(state)
            )
          )
        ),
        state,
        p,
        l,
        r,
        origin,
        operation,
        input_handle
      )
    case _: Rejected{state, WrongPhase{}}

def handoff_advice_checked(
  valid: Bool,
  +state: State,
  +invocation: Nat,
  operation: Nat,
  input_handle: Nat
) -> Step:
  match valid:
    case True{}: advice_handoff_child(
      state,
      find(invocation, state_children(state)),
      operation,
      input_handle
    )
    case False{}: Rejected{state, WrongLease{}}

def handoff_advice(
  +state: State,
  +invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat,
  operation: Nat,
  input_handle: Nat
) -> Step:
  handoff_advice_checked(
    provider_live(state, invocation, generation, lease, request),
    state,
    invocation,
    operation,
    input_handle
  )

def advice_progress(previous: AdvicePermission, next: AdvicePermission) -> Bool:
  match previous next:
    case TailNew{} TailBarrier{}: True{}
    case TailBarrier{} TailActive{}: True{}
    case TailActive{} TailPublish{}: True{}
    case TailPublish{} TailRecord{}: True{}
    case TailNew{} TailRemove{}: True{}
    case _ TailRemove{}: True{}
    case _ _: False{}

def advice_install_child(
  +state: State,
  found: Maybe<&2, Child>,
  +generation: Nat,
  handle: Nat,
  request: Nat,
  +permission: AdvicePermission
) -> Step:
  match found:
    case Some{+child}:
      match child:
        case Child{
          AdviceTailScope{p, l, r, operation, origin, previous},
          invocation,
          current,
          _,
          phase,
          pending,
          lease,
          parent
        }:
          install_allowed(
            Bool.and(install_matches(child, generation), advice_progress(previous, permission)),
            state,
            Child{
              AdviceTailScope{p, l, r, operation, origin, permission},
              invocation,
              current,
              0n,
              phase,
              pending,
              lease,
              parent
            },
            handle,
            request
          )
        case _: Rejected{state, WrongPhase{}}
    case None{}: Rejected{state, UnknownInvocation{}}

def install_advice(
  +state: State,
  invocation: Nat,
  generation: Nat,
  handle: Nat,
  request: Nat,
  permission: AdvicePermission
) -> Step:
  advice_install_child(
    state,
    find(invocation, state_children(state)),
    generation,
    handle,
    request,
    permission
  )

def advice_cleanup_found(state: State, found: Maybe<&2, Child>) -> Step:
  match found:
    case Some{+child}: advice_cleanup_allowed(child_active(child), state, child)
    case _: Rejected{state, WrongPhase{}}

def advice_cleanup_only(+state: State, invocation: Nat) -> Step:
  advice_cleanup_found(state, find(invocation, state_children(state)))

def advice_mutation(scope: Scope, kind: AdvicePermission) -> Bool:
  match scope kind:
    case AdviceTailScope{_, _, _, _, _, TailPublish{}} TailPublish{}: True{}
    case AdviceTailScope{_, _, _, _, _, TailRemove{}} TailRemove{}: True{}
    case _ _: False{}

def advice_provider_found(valid: Bool, found: Maybe<&2, Child>, kind: AdvicePermission) -> Bool:
  match found:
    case Some{child}: Bool.and(valid, advice_mutation(child_scope_value(child), kind))
    case None{}: False{}

def advice_provider_allowed(
  +state: State,
  +invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat,
  kind: AdvicePermission
) -> Bool:
  advice_provider_found(
    provider_live(state, invocation, generation, lease, request),
    find(invocation, state_children(state)),
    kind
  )

def initial(canonical: C.State) -> State:
  State{canonical, 1n, 1n, Nil{}}

def initial_limits(
  global_items: Nat,
  global_bytes: Nat,
  partition_items: Nat,
  partition_bytes: Nat
) -> State:
  initial(C.initial(Ledger.Limits{global_items, global_bytes, partition_items, partition_bytes}))

# Resident stores only this custody beside its sole Canonical state. State above
# is an ephemeral call value, never a second mutable Canonical authority.
# Private public-host entry: its publication hook only records outputs.
# Reentrant publication hooks require interleaved owner continuation instead.
# Public preparation uses the same event sequence as the former host workflow.
# A refused suffix retains the already advanced state; no atomic rollback.
def public_preparation_begin_started(
  +result: Step,
  partition: Nat,
  lifetime: Nat,
  round: Nat,
  observation: Nat,
  bytes: Nat
) -> List<&2, Step>:
  match result:
    case Advanced{state, _, _}:
      result <> canonical_event(
        state,
        C.BeginObservedPreparation{partition, lifetime, round, observation, bytes}
      ) <> Nil{}
    case _: result <> Nil{}

def public_preparation_begin_observed(
  state: State,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  bytes: Nat,
  outputs: List<&2, C.Output>
) -> List<&2, Step>:
  match outputs:
    case C.EventEstablished{C.ObservationAdmitted{+observation}} <> _:
      public_preparation_begin_started(
        canonical_event(state, C.StartObservation{partition, lifetime, round, observation}),
        partition,
        lifetime,
        round,
        observation,
        bytes
      )
    case _ <> rest:
      public_preparation_begin_observed(state, partition, lifetime, round, bytes, rest)
    case Nil{}: Rejected{state, WrongPhase{}} <> Nil{}

def public_preparation_begin_admitted(
  +result: Step,
  partition: Nat,
  lifetime: Nat,
  round: Nat,
  bytes: Nat
) -> List<&2, Step>:
  match result:
    case Advanced{state, outputs, _}:
      result <> public_preparation_begin_observed(state, partition, lifetime, round, bytes, outputs)
    case _: result <> Nil{}

def begin_public_preparation(
  +state: State,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  +bytes: Nat
) -> List<&2, Step>:
  public_preparation_begin_admitted(
    canonical_event(state, C.AdmitObservation{partition, lifetime, round}),
    partition,
    lifetime,
    round,
    bytes
  )

def public_preparation_complete_prepared(
  +result: Step,
  partition: Nat,
  lifetime: Nat,
  round: Nat,
  observation: Nat
) -> List<&2, Step>:
  match result:
    case Advanced{state, _, _}:
      result <> canonical_event(
        state,
        C.CompleteObservation{partition, lifetime, round, observation}
      ) <> Nil{}
    case _: result <> Nil{}

def complete_public_preparation(
  +state: State,
  +partition: Nat,
  +lifetime: Nat,
  +round: Nat,
  operation: Nat,
  observation: Nat
) -> List<&2, Step>:
  public_preparation_complete_prepared(
    canonical_event(state, C.PreparationCompleted{partition, lifetime, round, operation, Nil{}}),
    partition,
    lifetime,
    round,
    observation
  )

# Evaluation remains attached to its exact request through physical settlement.
# This does not keep cancelled work eligible for another request or retention.
def evaluation_claimed(+context: EvaluationContext, children: List<&2, Child>) -> Bool:
  match children:
    case Nil{}: False{}
    case Child{EvaluationScope{_, actual, _}, _, _, _, _, _, _, _} <> rest:
      Bool.or(evaluation_context_equal(context, actual), evaluation_claimed(context, rest))
    case _ <> rest: evaluation_claimed(context, rest)

def evaluation_reviewing(context: EvaluationContext, found: Maybe<&2, C.Work>,
    current: Maybe<&2, C.Round>) -> Bool:
  match context found current:
    case EvaluationContext{p, l, r, _} Some{C.Work{_, _, _, _, _, C.Reviewing{}, _}} Some{actual}:
      C.same_round(p, l, r, actual)
    case _ _ _: False{}

def evaluation_admissible(canonical: C.State, +context: EvaluationContext) -> Bool:
  match canonical context:
    case C.State{_, rounds, work, _, _, _, _, _, _} EvaluationContext{+p, l, r, o}:
      evaluation_reviewing(context, C.find_work(p, l, r, o, work), C.find_round(p, rounds))

def launch_evaluation(+state: State, +context: EvaluationContext, +input_handle: Nat) -> Step:
  match state:
    case State{canonical, +next, _, +children}:
      launched(
        Bool.and(
          settings_next_free(next, find(next, children)),
          Bool.and(
            evaluation_admissible(canonical, context),
            Bool.not(evaluation_claimed(context, children))
          )
        ),
        state,
        EvaluationScope{next, context, EvaluationUnissued{}},
        input_handle
      )

def evaluation_ready_event(context: EvaluationContext, facts: EvaluationFacts) -> C.CanonicalEvent:
  match context facts:
    case EvaluationContext{p, l, r, o} EvaluationFacts{
      root,
      config,
      credential,
      selected,
      current,
      available
    }:
      C.JevRequestReady{p, l, r, o, root, config, credential, selected, current, available}

def evaluation_ready_permission(outputs: List<&2, C.Output>) -> EvaluationPermission:
  match outputs:
    case Nil{}: EvaluationSettled{}
    case C.EventEstablished{C.JevRequestIssued{_, _, _, _, request}} <> _:
      EvaluationIssued{request}
    case _ <> rest: evaluation_ready_permission(rest)

def evaluation_permission_scope(scope: Scope, permission: EvaluationPermission) -> Scope:
  match scope:
    case EvaluationScope{operation, context, _}: EvaluationScope{operation, context, permission}
    case EvaluationCleanupScope{operation, origin, context, _}:
      EvaluationCleanupScope{operation, origin, context, permission}
    case other: other

def evaluation_commit(
  +state: State,
  child: Child,
  permission: EvaluationPermission,
  result: C.Step
) -> Step:
  match state child result:
    case State{_, next_invocation, next_lease, children}
        Child{
          scope,
          +invocation,
          generation,
          handle,
          phase,
          request,
          lease,
          parent
        }
        C.Advanced{canonical, outputs}:
      reconcile_cancel(
        Advanced{
          State{
            canonical,
            next_invocation,
            next_lease,
            replace(
              invocation,
              children,
              Child{
                evaluation_permission_scope(scope, permission),
                invocation,
                generation,
                handle,
                phase,
                request,
                lease,
                parent
              }
            )
          },
          outputs,
          Nil{}
        }
      )
    case _ _ C.Rejected{_, reason}: Rejected{state, CanonicalRejected{reason}}
    case _ _ _: Rejected{state, WrongPhase{}}

def evaluation_ready_result(state: State, child: Child, +result: C.Step) -> Step:
  match result:
    case C.Advanced{_, outputs}: evaluation_commit(
      state,
      child,
      evaluation_ready_permission(outputs),
      result
    )
    case C.Rejected{_, reason}: Rejected{state, CanonicalRejected{reason}}

def evaluation_cleanup_denial(
  +state: State,
  child: Child,
  context: EvaluationContext,
  facts: EvaluationFacts
) -> Step:
  match facts:
    case EvaluationFacts{False{}, False{}, False{}, False{}, False{}, False{}}:
      evaluation_ready_result(
        state,
        child,
        C.step(state_canonical(state), evaluation_ready_event(context, facts))
      )
    case _: Rejected{state, WrongPhase{}}

def evaluation_ready_child(+state: State, +child: Child, facts: EvaluationFacts) -> Step:
  match child:
    case Child{EvaluationCleanupScope{_, _, context, EvaluationUnissued{}}, _, _, _, _, _, _, _}:
      evaluation_cleanup_denial(state, child, context, facts)
    case Child{EvaluationScope{_, context, EvaluationUnissued{}}, _, _, _, _, _, _, _}:
      evaluation_ready_result(
        state,
        child,
        C.step(state_canonical(state), evaluation_ready_event(context, facts))
      )
    case _: Rejected{state, WrongPhase{}}

def evaluation_ready_found(
  valid: Bool,
  state: State,
  found: Maybe<&2, Child>,
  facts: EvaluationFacts
) -> Step:
  match valid found:
    case True{} Some{child}: evaluation_ready_child(state, child, facts)
    case _ _: Rejected{state, WrongPhase{}}

def evaluation_ready(+state: State, +invocation: Nat, generation: Nat, lease: Nat, request: Nat,
    facts: EvaluationFacts) -> Step:
  evaluation_ready_found(provider_live(state, invocation, generation, lease, request), state,
    find(invocation, state_children(state)), facts)

def evaluation_settle_event(context: EvaluationContext, request: Nat, outcome: C.RequestOutcome,
    current: Bool) -> C.CanonicalEvent:
  match context:
    case EvaluationContext{p, l, r, o}: C.JevRequestSettled{p, l, r, o, request, outcome, current}

def evaluation_cleanup_settle(
  +state: State,
  child: Child,
  context: EvaluationContext,
  request: Nat,
  +outcome: C.RequestOutcome
) -> Step:
  match outcome:
    case C.RequestFinding{}: Rejected{state, WrongPhase{}}
    case C.RequestClear{}: Rejected{state, WrongPhase{}}
    case _: evaluation_commit(
      state,
      child,
      EvaluationSettled{},
      C.step(state_canonical(state), evaluation_settle_event(context, request, outcome, False{}))
    )

def evaluation_settle_child(
  +state: State,
  +child: Child,
  outcome: C.RequestOutcome,
  current: Bool
) -> Step:
  match child:
    case Child{
      EvaluationCleanupScope{_, _, context, EvaluationIssued{request}},
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      evaluation_cleanup_settle(state, child, context, request, outcome)
    case Child{EvaluationScope{_, context, EvaluationIssued{request}}, _, _, _, _, _, _, _}:
      evaluation_commit(state, child, EvaluationSettled{}, C.step(state_canonical(state),
        evaluation_settle_event(context, request, outcome, current)))
    case Child{EvaluationScope{_, context, EvaluationAtProvider{request, _}}, _, _, _, _, _, _, _}:
      evaluation_commit(state, child, EvaluationSettled{}, C.step(state_canonical(state),
        evaluation_settle_event(context, request, outcome, current)))
    case _: Rejected{state, WrongPhase{}}

def evaluation_settle_found(
  valid: Bool,
  state: State,
  found: Maybe<&2, Child>,
  outcome: C.RequestOutcome,
  current: Bool
) -> Step:
  match valid found:
    case True{} Some{child}: evaluation_settle_child(state, child, outcome, current)
    case _ _: Rejected{state, WrongPhase{}}

def evaluation_settle(+state: State, +invocation: Nat, generation: Nat, lease: Nat, request: Nat,
    outcome: C.RequestOutcome, current: Bool) -> Step:
  evaluation_settle_found(provider_live(state, invocation, generation, lease, request), state,
    find(invocation, state_children(state)), outcome, current)

def evaluation_provider_child(
  +state: State,
  +child: Child,
  +generation: Nat,
  handle: Nat,
  +request: Nat
) -> Step:
  match child:
    case Child{
      EvaluationScope{operation, +context, EvaluationIssued{+jev}},
      +invocation,
      epoch,
      old_handle,
      phase,
      pending,
      lease,
      parent
    }:
      install_allowed(
        Bool.and(
          install_matches(child, generation),
          Bool.and(
            child_live(state_canonical(state), state_children(state), child),
            evaluation_dispatch_pending(state_canonical(state), context, jev)
          )
        ),
        state,
        Child{
          EvaluationScope{
            operation,
            context,
            EvaluationAtProvider{jev, Parent{invocation, generation, request}}
          },
          invocation,
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
    case _: Rejected{state, WrongPhase{}}

def evaluation_provider_found(
  state: State,
  found: Maybe<&2, Child>,
  generation: Nat,
  handle: Nat,
  request: Nat
) -> Step:
  match found:
    case Some{child}: evaluation_provider_child(state, child, generation, handle, request)
    case None{}: Rejected{state, UnknownInvocation{}}

def install_evaluation_provider(
  +state: State,
  +invocation: Nat,
  generation: Nat,
  handle: Nat,
  request: Nat
) -> Step:
  evaluation_provider_found(
    state,
    find(invocation, state_children(state)),
    generation,
    handle,
    request
  )

def evaluation_dispatch_parent(
  +state: State,
  +parent: Parent,
  +child: Child,
  input_handle: Nat
) -> Step:
  match state child:
    case State{+canonical, +next, _, +children}
        Child{
          EvaluationScope{_, +context, EvaluationAtProvider{+jev, expected}},
          _,
          _,
          _,
          _,
          _,
          _,
          _
        }:
      launched_nested(
        Bool.and(
          settings_next_free(next, find(next, children)),
          Bool.and(
            Bool.not(parent_used(parent, children)),
            Bool.and(
              Bool.and(parent_equal(parent, expected), parent_matches(parent, Some{child})),
              Bool.and(
                child_live(canonical, children, child),
                evaluation_dispatch_pending(canonical, context, jev)
              )
            )
          )
        ),
        state,
        parent,
        EvaluationDispatchScope{next, context, jev},
        input_handle
      )
    case _ _: Rejected{state, WrongPhase{}}

def evaluation_dispatch_found(
  state: State,
  parent: Parent,
  found: Maybe<&2, Child>,
  input_handle: Nat
) -> Step:
  match found:
    case Some{child}: evaluation_dispatch_parent(state, parent, child, input_handle)
    case None{}: Rejected{state, UnknownInvocation{}}

def launch_evaluation_dispatch(+state: State, +parent: Parent, input_handle: Nat) -> Step:
  evaluation_dispatch_found(
    state,
    parent,
    find(parent_invocation(parent), state_children(state)),
    input_handle
  )

def evaluation_start_event(context: EvaluationContext, request: Nat) -> C.CanonicalEvent:
  match context:
    case EvaluationContext{p, l, r, o}: C.JevRequestStarted{p, l, r, o, request}

def evaluation_start_pending(
  valid: Bool,
  state: State,
  context: EvaluationContext,
  request: Nat
) -> Step:
  match valid:
    case True{}: canonical_event(state, evaluation_start_event(context, request))
    case False{}: Rejected{state, WrongPhase{}}

def evaluation_start_child(valid: Bool, +state: State, child: Child) -> Step:
  match valid child:
    case True{} Child{EvaluationDispatchScope{_, +context, +jev}, _, _, _, _, _, _, _}:
      evaluation_start_pending(evaluation_dispatch_pending(state_canonical(state), context, jev),
        state, context, jev)
    case _ _: Rejected{state, WrongPhase{}}

def evaluation_start_found(valid: Bool, state: State, found: Maybe<&2, Child>) -> Step:
  match found:
    case Some{child}: evaluation_start_child(valid, state, child)
    case None{}: Rejected{state, UnknownInvocation{}}

def evaluation_start_request(
  +state: State,
  +invocation: Nat,
  generation: Nat,
  lease: Nat,
  request: Nat
) -> Step:
  evaluation_start_found(provider_live(state, invocation, generation, lease, request), state,
    find(invocation, state_children(state)))

def evaluation_dispatch_terminal_child(
  +state: State,
  +child: Child,
  generation: Nat,
  result: Nat,
  success: Bool
) -> Step:
  match child:
    case Child{EvaluationDispatchScope{_, context, jev}, _, _, _, _, _, _, _}:
      terminal_allowed(Bool.and(child_live(state_canonical(state), state_children(state), child),
        Bool.and(install_matches(child, generation), Bool.or(Bool.not(success),
          evaluation_request_started(evaluation_request(state_canonical(state), context, jev))))),
        state, child, result)
    case _: Rejected{state, WrongPhase{}}

def evaluation_dispatch_terminal_found(state: State, found: Maybe<&2, Child>, generation: Nat,
    result: Nat, success: Bool) -> Step:
  match found:
    case Some{child}: evaluation_dispatch_terminal_child(state, child, generation, result, success)
    case None{}: Rejected{state, UnknownInvocation{}}

def complete_evaluation_dispatch(
  +state: State,
  +invocation: Nat,
  generation: Nat,
  result: Nat,
  success: Bool
) -> Step:
  evaluation_dispatch_terminal_found(
    state,
    find(invocation, state_children(state)),
    generation,
    result,
    success
  )

type Custody is Data:
  Custody{next_invocation: Nat, next_lease: Nat, children: List<&2, Child>}
# Independent accounting custody survives the cancelled parent. It cannot issue
# a provider request or hand off fresh advice; native cleanup retries may launch
# another cursor only after the previous cleanup child has stopped.
def evaluation_cleanup_claimed(+origin: Nat, children: List<&2, Child>) -> Bool:
  match children:
    case Nil{}: False{}
    case Child{EvaluationCleanupScope{_, actual, _, _}, _, _, _, phase, _, _, _} <> rest:
      Bool.or(
        Bool.and(Nat.is_eq(origin, actual), active(phase)),
        evaluation_cleanup_claimed(origin, rest)
      )
    case _ <> rest: evaluation_cleanup_claimed(origin, rest)

def evaluation_cleanup_pending(
  request: Nat,
  found: Maybe<&2, Dispatch.Request>
) -> EvaluationPermission:
  match found:
    case Some{_}: EvaluationIssued{request}
    case None{}: EvaluationSettled{}

def evaluation_cleanup_permission(
  canonical: C.State,
  context: EvaluationContext,
  permission: EvaluationPermission
) -> EvaluationPermission:
  match permission:
    case EvaluationAtProvider{+request, _}: evaluation_cleanup_pending(
      request,
      evaluation_request(canonical, context, request)
    )
    case EvaluationIssued{+request}: evaluation_cleanup_pending(
      request,
      evaluation_request(canonical, context, request)
    )
    case other: other

def evaluation_next(state: State) -> Nat:
  match state:
    case State{_, next, _, _}: next

def evaluation_cleanup_found(
  +state: State,
  +origin: Nat,
  input_handle: Nat,
  found: Maybe<&2, Child>
) -> Step:
  match found:
    case Some{Child{EvaluationScope{_, +context, permission}, _, _, _, ChildCancelled{}, _, _, _}}:
      launched(
        Bool.and(
          settings_next_free(
            evaluation_next(state),
            find(evaluation_next(state), state_children(state))
          ),
          Bool.not(evaluation_cleanup_claimed(origin, state_children(state)))
        ),
        state,
        EvaluationCleanupScope{
          evaluation_next(state),
          origin,
          context,
          evaluation_cleanup_permission(state_canonical(state), context, permission)
        },
        input_handle
      )
    case _: Rejected{state, WrongPhase{}}

def launch_evaluation_cleanup(+state: State, +origin: Nat, input_handle: Nat) -> Step:
  evaluation_cleanup_found(state, origin, input_handle, find(origin, state_children(state)))

def evaluation_no_work(found: Maybe<&2, C.Work>) -> Bool:
  match found:
    case None{}: True{}
    case Some{_}: False{}

def evaluation_idle(canonical: C.State, context: EvaluationContext) -> Bool:
  match canonical context:
    case C.State{_, _, work, _, _, _, Dispatch.State{_, _, _, _, requests}, _, _} EvaluationContext{
      p,
      l,
      r,
      +o
    }:
      Bool.and(
        Bool.not(Dispatch.request_for_work(requests, o)),
        evaluation_no_work(C.find_work(p, l, r, o, work))
      )

def evaluation_complete_scope(canonical: C.State, scope: Scope) -> Bool:
  match scope:
    case EvaluationScope{_, _, EvaluationSettled{}}: True{}
    case EvaluationCleanupScope{_, _, _, EvaluationSettled{}}: True{}
    case EvaluationScope{_, context, EvaluationUnissued{}}: evaluation_idle(canonical, context)
    case EvaluationCleanupScope{_, _, context, EvaluationUnissued{}}: evaluation_idle(
      canonical,
      context
    )
    case _: False{}

def complete_evaluation_found(
  +state: State,
  found: Maybe<&2, Child>,
  generation: Nat,
  result_handle: Nat
) -> Step:
  match found:
    case Some{+child}: terminal_allowed(
      Bool.and(
        evaluation_complete_scope(state_canonical(state), child_scope_value(child)),
        Bool.and(
          child_live(state_canonical(state), state_children(state), child),
          install_matches(child, generation)
        )
      ),
      state,
      child,
      result_handle
    )
    case None{}: Rejected{state, UnknownInvocation{}}

def complete_evaluation(
  +state: State,
  +invocation: Nat,
  generation: Nat,
  result_handle: Nat
) -> Step:
  complete_evaluation_found(
    state,
    find(invocation, state_children(state)),
    generation,
    result_handle
  )

type ResidentEvent is Data:
  LaunchEvaluationCleanupEvent{origin: Nat, input_handle: Nat}
  CompleteEvaluationEvent{invocation: Nat, generation: Nat, result_handle: Nat}
  InstallEvaluationProviderEvent{invocation: Nat, generation: Nat, handle: Nat, request: Nat}
  LaunchEvaluationDispatchEvent{parent: Parent, input_handle: Nat}
  EvaluationStartRequestEvent{invocation: Nat, generation: Nat, lease: Nat, request: Nat}
  CompleteEvaluationDispatchEvent{invocation: Nat, generation: Nat, result: Nat, success: Bool}
  LaunchEvaluationEvent{context: EvaluationContext, input_handle: Nat}
  EvaluationReadyEvent{
    invocation: Nat,
    generation: Nat,
    lease: Nat,
    request: Nat,
    facts: EvaluationFacts
  }
  EvaluationSettleEvent{invocation: Nat, generation: Nat, lease: Nat, request: Nat,
    outcome: C.RequestOutcome, current: Bool}
  CanonicalEvent{event: C.CanonicalEvent}
  CleanupAdmissionEvent{invocation: Nat, generation: Nat, receipt: Nat}
  LaunchAdmissionEvent{input_handle: Nat}
  HoldAdmissionEvent{invocation: Nat, generation: Nat, lease: Nat, request: Nat,
    partition: Nat, lifetime: Nat, charge: Nat, receipt: Nat}
  ReleaseAdmissionEvent{invocation: Nat, generation: Nat, lease: Nat, request: Nat, receipt: Nat}
  TransferAdmissionEvent{invocation: Nat, generation: Nat, lease: Nat, request: Nat,
    round: Nat, observation: Nat}
  LaunchSettingsEvent{input_handle: Nat}
  LaunchFreshnessEvent{input_handle: Nat}
  LaunchCollectionEvent{context: DeliveryContext, input_handle: Nat}
  ClaimDeliveryEvent{receipt: DeliveryReceipt}
  CompleteDeliveryEvent{
    invocation: Nat,
    generation: Nat,
    result_handle: Nat,
    selection: DeliverySelection
  }
  LaunchEvent{scope: Scope, input_handle: Nat}
  LaunchSourceEvent{scope: Scope, input_handle: Nat}
  LaunchSourcePreparationEvent{parent: Parent, scope: Scope, input_handle: Nat}
  StartSourceObservationEvent{invocation: Nat, generation: Nat, lease: Nat, request: Nat}
  CompleteSourceObservationEvent{invocation: Nat, generation: Nat, lease: Nat, request: Nat}
  LaunchPreparationEvent{scope: Scope, input_handle: Nat}
  LaunchNestedEvent{parent: Parent, input_handle: Nat}
  HandoffAdviceEvent{
    invocation: Nat,
    generation: Nat,
    lease: Nat,
    request: Nat,
    operation: Nat,
    input_handle: Nat
  }
  AdviceCleanupOnlyEvent{invocation: Nat}
  InstallAfterSourceEvent{
    invocation: Nat,
    generation: Nat,
    handle: Nat,
    request: Nat,
    permission: AfterSourcePermission
  }
  InstallSourceEvent{
    invocation: Nat,
    generation: Nat,
    handle: Nat,
    request: Nat,
    permission: SourcePermission
  }
  InstallAdviceEvent{
    invocation: Nat,
    generation: Nat,
    handle: Nat,
    request: Nat,
    permission: AdvicePermission
  }
  InstallEvent{invocation: Nat, generation: Nat, handle: Nat, request: Nat}
  ProviderStartEvent{invocation: Nat}
  ProviderCompletedEvent{invocation: Nat, lease: Nat, request: Nat, reply_handle: Nat}
  CancelEvent{invocation: Nat}
  TerminalSourceFailedEvent{invocation: Nat, generation: Nat, result_handle: Nat}
  TerminalPreparationFailedEvent{invocation: Nat, generation: Nat, result_handle: Nat}
  TerminalPreparationEvent{invocation: Nat, generation: Nat, result_handle: Nat}
  TerminalAdvicePreservedEvent{invocation: Nat, generation: Nat, result_handle: Nat}
  TerminalEvent{invocation: Nat, generation: Nat, result_handle: Nat}
type Publication is Data:
  Published{
    canonical: C.State,
    custody: Custody,
    outputs: List<&2, C.Output>,
    actions: List<&2, Action>
  }
  Refused{refusal: Refusal}

def initial_custody() -> Custody:
  Custody{1n, 1n, Nil{}}

def assembled(canonical: C.State, custody: Custody) -> State:
  match custody:
    case Custody{next_invocation, next_lease, children}:
      State{canonical, next_invocation, next_lease, children}

def publish(step: Step) -> Publication:
  match step:
    case Advanced{State{canonical, next_invocation, next_lease, children}, outputs, actions}:
      Published{canonical, Custody{next_invocation, next_lease, children}, outputs, actions}
    case Rejected{_, refusal}: Refused{refusal}

def resident_event(state: State, event: ResidentEvent) -> Step:
  match event:
    case LaunchEvaluationCleanupEvent{origin, input_handle}: launch_evaluation_cleanup(
      state,
      origin,
      input_handle
    )
    case CompleteEvaluationEvent{invocation, generation, result_handle}: complete_evaluation(
      state,
      invocation,
      generation,
      result_handle
    )
    case InstallEvaluationProviderEvent{invocation, generation, handle, request}:
      install_evaluation_provider(state, invocation, generation, handle, request)
    case LaunchEvaluationDispatchEvent{parent, input_handle}: launch_evaluation_dispatch(
      state,
      parent,
      input_handle
    )
    case EvaluationStartRequestEvent{invocation, generation, lease, request}:
      evaluation_start_request(state, invocation, generation, lease, request)
    case CompleteEvaluationDispatchEvent{invocation, generation, result, success}:
      complete_evaluation_dispatch(state, invocation, generation, result, success)
    case LaunchEvaluationEvent{context, input_handle}: launch_evaluation(
      state,
      context,
      input_handle
    )
    case EvaluationReadyEvent{invocation, generation, lease, request, facts}:
      evaluation_ready(state, invocation, generation, lease, request, facts)
    case EvaluationSettleEvent{invocation, generation, lease, request, outcome, current}:
      evaluation_settle(state, invocation, generation, lease, request, outcome, current)
    case CanonicalEvent{event}: canonical_event(state, event)
    case CleanupAdmissionEvent{invocation, generation, receipt}: cleanup_admission(
      state,
      invocation,
      generation,
      receipt
    )
    case LaunchAdmissionEvent{input_handle}: launch_admission(state, input_handle)
    case HoldAdmissionEvent{
      invocation,
      generation,
      lease,
      request,
      partition,
      lifetime,
      charge,
      receipt
    }:
      hold_admission(
        state,
        invocation,
        generation,
        lease,
        request,
        partition,
        lifetime,
        charge,
        receipt
      )
    case ReleaseAdmissionEvent{invocation, generation, lease, request, receipt}:
      release_admission(state, invocation, generation, lease, request, receipt)
    case TransferAdmissionEvent{invocation, generation, lease, request, round, observation}:
      transfer_admission(state, invocation, generation, lease, request, round, observation)
    case LaunchSettingsEvent{input_handle}: launch_settings(state, input_handle)
    case LaunchFreshnessEvent{input_handle}: launch_freshness(state, input_handle)
    case LaunchCollectionEvent{context, input_handle}: launch_collection(
      state,
      context,
      input_handle
    )
    case ClaimDeliveryEvent{receipt}: claim_delivery(state, receipt)
    case CompleteDeliveryEvent{invocation, generation, result_handle, selection}:
      complete_delivery(state, invocation, generation, result_handle, selection)
    case LaunchEvent{scope, input_handle}: launch(state, scope, input_handle)
    case LaunchSourceEvent{scope, input_handle}: launch_source(state, scope, input_handle)
    case LaunchSourcePreparationEvent{parent, scope, input_handle}: launch_source_preparation(
      state,
      parent,
      scope,
      input_handle
    )
    case StartSourceObservationEvent{invocation, generation, lease, request}: start_source_observation(
      state,
      invocation,
      generation,
      lease,
      request
    )
    case CompleteSourceObservationEvent{invocation, generation, lease, request}: complete_source_observation(
      state,
      invocation,
      generation,
      lease,
      request
    )
    case LaunchPreparationEvent{scope, input_handle}: launch_preparation(state, scope, input_handle)
    case LaunchNestedEvent{parent, input_handle}: launch_nested(state, parent, input_handle)
    case HandoffAdviceEvent{invocation, generation, lease, request, operation, input_handle}: handoff_advice(
      state,
      invocation,
      generation,
      lease,
      request,
      operation,
      input_handle
    )
    case AdviceCleanupOnlyEvent{invocation}: advice_cleanup_only(state, invocation)
    case InstallAfterSourceEvent{invocation, generation, handle, request, permission}: install_after_source(
      state,
      invocation,
      generation,
      handle,
      request,
      permission
    )
    case InstallSourceEvent{invocation, generation, handle, request, permission}: install_source(
      state,
      invocation,
      generation,
      handle,
      request,
      permission
    )
    case InstallAdviceEvent{invocation, generation, handle, request, permission}: install_advice(
      state,
      invocation,
      generation,
      handle,
      request,
      permission
    )
    case InstallEvent{invocation, generation, handle, request}: install(
      state,
      invocation,
      generation,
      handle,
      request
    )
    case ProviderStartEvent{invocation}: provider_start(state, invocation)
    case ProviderCompletedEvent{invocation, lease, request, reply_handle}:
      provider_completed(state, invocation, lease, request, reply_handle)
    case CancelEvent{invocation}: cancel(state, invocation)
    case TerminalSourceFailedEvent{invocation, generation, result_handle}: terminal_source_failed(
      state,
      invocation,
      generation,
      result_handle
    )
    case TerminalPreparationFailedEvent{invocation, generation, result_handle}: terminal_preparation_failed(
      state,
      invocation,
      generation,
      result_handle
    )
    case TerminalPreparationEvent{invocation, generation, result_handle}: terminal_preparation(
      state,
      invocation,
      generation,
      result_handle
    )
    case TerminalAdvicePreservedEvent{invocation, generation, result_handle}: terminal_advice_preserved(
      state,
      invocation,
      generation,
      result_handle
    )
    case TerminalEvent{invocation, generation, result_handle}: terminal(
      state,
      invocation,
      generation,
      result_handle
    )

def resident_step(canonical: C.State, custody: Custody, event: ResidentEvent) -> Publication:
  publish(resident_event(assembled(canonical, custody), event))

# Transitional seam for existing native capacity operations: reconcile their
# final Canonical state inside the same transaction, without stepping it twice.
def reconcile_join(canonical: C.State, custody: Custody, invalidated: Invalidated) -> Publication:
  match custody invalidated:
    case Custody{next_invocation, next_lease, _} Invalidated{children, actions}:
      Published{canonical, Custody{next_invocation, next_lease, children}, Nil{}, actions}

def custody_children(custody: Custody) -> List<&2, Child>:
  match custody:
    case Custody{_, _, children}: children

def resident_reconcile(+canonical: C.State, +custody: Custody) -> Publication:
  reconcile_join(canonical, custody, invalidate_all(canonical, custody_children(custody)))

def main() -> Unit:
  Unit{}
