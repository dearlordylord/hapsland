import Base
import ../../../vendor/bendlib/packages/bend-mathlib/nat.bend as N
import ../../../vendor/bendlib/packages/bend-mathlib/bool.bend as B
import ./CanonicalResolverOwner.bend as O
import ./EvaluationOwnerSpecification.bend as S
import ../Canonical.bend as C

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

def main() -> Unit:
  Unit{}
