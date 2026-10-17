import Base
import ./CanonicalResolverOwner.bend as O
import ../Canonical.bend as C

# Draft Evaluation -> Advice public handoff/cancellation relation, not an
# approved contract or proof. Domain: the selected child's scope is Evaluation
# or EvaluationCleanup; other families retain their own entry contracts.
# Shared primitives: nominal data, O.find/C.find_work first-match lookup,
# O.updated mechanical replacement, O.reconcile_cancel cross-family invalidation.
# All Evaluation lease/permission/work/claim decisions and tail birth are here.
# No arbitrary-State allocator uniqueness claim: the stored counter is used.
# Atomic native advice/receipt publication and pointer custody remain IO duties.
# Maintain with this Owner API; on replacement transfer current guarantees and
# delete superseded equations/specification/proofs.

def running(phase: O.Phase) -> Bool:
  match phase:
    case O.ChildInstalling{}: True{}
    case O.ChildReady{}: True{}
    case O.ChildAwaiting{}: True{}
    case O.ChildResuming{}: True{}
    case _: False{}

def children(state: O.State) -> List<&2, O.Child>:
  match state:
    case O.State{_, _, _, values}: values

def permit(invocation: Nat, generation: Nat, lease: Nat, request: Nat,
  found: Maybe<&2, O.Child>) -> Bool:
  match found:
    case Some{O.Child{O.EvaluationScope{operation, _, _}, +actual, epoch, _,
      O.ChildAwaiting{}, Some{+pending}, Some{O.Lease{id, leased}}, None{}}}:
      Bool.and(Nat.is_eq(invocation, actual), Bool.and(Nat.is_eq(operation, actual),
        Bool.and(Nat.is_eq(generation, epoch), Bool.and(Nat.is_eq(lease, id),
          Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased))))))
    case Some{O.Child{O.EvaluationCleanupScope{operation, _, _, _}, +actual, epoch, _,
      O.ChildAwaiting{}, Some{+pending}, Some{O.Lease{id, leased}}, None{}}}:
      Bool.and(Nat.is_eq(invocation, actual), Bool.and(Nat.is_eq(operation, actual),
        Bool.and(Nat.is_eq(generation, epoch), Bool.and(Nat.is_eq(lease, id),
          Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased))))))
    case _: False{}

def pending(found: Maybe<&2, C.Work>) -> Bool:
  match found:
    case Some{C.Work{_, _, _, _, _, C.PendingFinding{_}, _}}: True{}
    case _: False{}

def pending_work(state: O.State, p: Nat, l: Nat, r: Nat, operation: Nat) -> Bool:
  match state:
    case O.State{C.State{_, _, work, _, _, _, _, _, _}, _, _, _}:
      pending(C.find_work(p, l, r, operation, work))

def claimed(+p: Nat, +l: Nat, +r: Nat, +operation: Nat, rest: List<&2, O.Child>) -> Bool:
  match rest:
    case Nil{}: False{}
    case O.Child{O.AdviceTailScope{q, m, t, other, _, _}, _, _, _, _, _, _, _} <> tail:
      Bool.or(Bool.and(Nat.is_eq(p, q), Bool.and(Nat.is_eq(l, m),
        Bool.and(Nat.is_eq(r, t), Nat.is_eq(operation, other)))), claimed(p, l, r, operation, tail))
    case _ <> tail: claimed(p, l, r, operation, tail)

def birth(valid: Bool, state: O.State, p: Nat, l: Nat, r: Nat,
  +origin: Nat, +operation: Nat, input: Nat) -> O.Step:
  match valid state:
    case True{} O.State{canonical, +next, lease, rest}:
      O.Advanced{
        O.State{canonical, Nat.add(next, 1n), lease,
          O.Child{O.AdviceTailScope{p, l, r, operation, origin, O.TailNew{}},
            next, 0n, 0n, O.ChildInstalling{}, None{}, None{}, None{}} <> rest},
        Nil{}, [O.LaunchAdviceTail{next, origin, operation, input}]}
    case _ _: O.Rejected{state, O.WrongPhase{}}

def selected(+state: O.State, found: Maybe<&2, O.Child>, +operation: Nat, input: Nat) -> O.Step:
  match found:
    case Some{O.Child{O.EvaluationScope{_, O.EvaluationContext{+p, +l, +r, own},
      O.EvaluationSettled{}}, origin, _, _, O.ChildAwaiting{}, _, Some{_}, _}}:
      birth(
        Bool.and(
          Nat.is_eq(own, operation),
          Bool.and(
            pending_work(state, p, l, r, operation),
            Bool.not(claimed(p, l, r, operation, children(state)))
          )
        ),
        state,
        p,
        l,
        r,
        origin,
        operation,
        input
      )
    case _: O.Rejected{state, O.WrongPhase{}}

def allowed(valid: Bool, +state: O.State, invocation: Nat, operation: Nat, input: Nat) -> O.Step:
  match valid:
    case True{}: selected(state, O.find(invocation, children(state)), operation, input)
    case False{}: O.Rejected{state, O.WrongLease{}}

def handoff_evaluation(+state: O.State, +invocation: Nat, generation: Nat, lease: Nat,
  request: Nat, operation: Nat, input: Nat) -> O.Step:
  allowed(permit(invocation, generation, lease, request, O.find(invocation, children(state))),
    state, invocation, operation, input)

def retire(+invocation: Nat, handle: Nat) -> List<&2, O.Action>:
  match handle:
    case 0n: Nil{}
    case _: [O.RetireHandle{invocation, handle}]

def cancelled(valid: Bool, state: O.State, child: O.Child) -> O.Step:
  match valid child:
    case True{} O.Child{scope, +invocation, generation, +handle, _, _, lease, parent}:
      O.reconcile_cancel(O.updated(state, O.ChildUpdate{
        O.Child{scope, invocation, generation, 0n, O.ChildCancelled{}, None{}, lease, parent},
        O.CancelChild{invocation, handle} <> retire(invocation, handle)}))
    case _ _: O.Rejected{state, O.WrongPhase{}}

def cancel_child(state: O.State, +child: O.Child) -> O.Step:
  match child:
    case O.Child{O.EvaluationScope{_, _, _}, _, _, _, phase, _, _, _}:
      cancelled(running(phase), state, child)
    case O.Child{O.EvaluationCleanupScope{_, _, _, _}, _, _, _, phase, _, _, _}:
      cancelled(running(phase), state, child)
    case _: O.Rejected{state, O.WrongPhase{}}

def cancel_found(state: O.State, found: Maybe<&2, O.Child>) -> O.Step:
  match found:
    case Some{+child}: cancel_child(state, child)
    case None{}: O.Rejected{state, O.UnknownInvocation{}}

def cancel_evaluation(+state: O.State, invocation: Nat) -> O.Step:
  cancel_found(state, O.find(invocation, children(state)))

def main() -> Unit:
  Unit{}
