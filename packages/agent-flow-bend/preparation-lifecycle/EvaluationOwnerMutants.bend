import Base
import ./CanonicalResolverOwner.bend as O
import ../Canonical.bend as C

# Typed negative witnesses for whole Evaluation ownership. Never production.
# Maintain with these entry contracts; delete on replacement. Production
# primitives are deliberately reused only to isolate the omitted authority fence.
def callback_parent_unfenced(
  +state: O.State,
  +parent: O.Parent,
  +child: O.Child,
  input: Nat
) -> O.Step:
  match state child:
    case O.State{+canonical, +next, _, +children}
      O.Child{O.EvaluationScope{_, +context, O.EvaluationAtProvider{+jev, _}}, _, _, _, _, _, _, _}:
      O.launched_nested(
        Bool.and(
          O.settings_next_free(next, O.find(next, children)),
          Bool.and(
            Bool.not(O.parent_used(parent, children)),
            Bool.and(
              O.parent_matches(parent, Some{child}),
              Bool.and(
                O.child_live(canonical, children, child),
                O.evaluation_dispatch_pending(canonical, context, jev)
              )
            )
          )
        ),
        state,
        parent,
        O.EvaluationDispatchScope{next, context, jev},
        input
      )
    case _ _: O.Rejected{state, O.WrongPhase{}}

def cleanup_can_settle_success(+state: O.State, child: O.Child, context: O.EvaluationContext,
  request: Nat, outcome: C.RequestOutcome) -> O.Step:
  O.evaluation_commit(state, child, O.EvaluationSettled{},
    C.step(O.state_canonical(state), O.evaluation_settle_event(context, request, outcome, False{})))

def main() -> Unit:
  Unit{}
