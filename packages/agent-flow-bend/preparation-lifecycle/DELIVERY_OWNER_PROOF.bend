import Base
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
