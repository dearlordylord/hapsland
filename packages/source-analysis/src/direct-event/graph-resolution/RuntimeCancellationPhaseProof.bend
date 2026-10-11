import Base
import ./RuntimeModel.bend as R
import ./RuntimeInvariant.bend as I
import ./RuntimeNatProof.bend as N
import ./Environment.bend as E
import ./WholeObservation.bend as O
import ./Loop.bend as L

# Exact existing bool.bend internal_true_ne_false eliminator.
# No new lifecycle assumption: contradictory invalid phases are impossible
# under the already-approved valid-state premise.
def true_ne_false(e: {True{} == False{} : Bool}) -> Empty:
  %e : Bool.pick(Type, _, Unit, Empty)
  Unit{}

def frozen_cancellation(~World: Data, +state: R.State<World>,
    valid: {True{} == I.valid(World, state) : Bool}) -> {
  True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool
}:
  match state:
    case R.State{_, R.RuntimeOpen{}, R.RuntimeReady{_}, None{}, _, E.WorldState{_, _}, _}:
      {==}
    case R.State{_, R.RuntimeOpen{}, R.RuntimeReady{_}, Some{_}, _, E.WorldState{_, _}, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        true_ne_false(valid)
      )
    case R.State{_, R.RuntimeOpen{}, R.RuntimeWaiting{_}, None{}, _, E.WorldState{_, _}, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        true_ne_false(valid)
      )
    case R.State{_, R.RuntimeOpen{}, R.RuntimeWaiting{_}, Some{_}, _, E.WorldState{_, _}, _}:
      {==}
    case R.State{_, R.RuntimeOpen{}, R.RuntimeReturned{_, _}, None{}, _, E.WorldState{_, _}, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        true_ne_false(valid)
      )
    case R.State{_, R.RuntimeOpen{}, R.RuntimeReturned{_, _}, Some{_}, _, E.WorldState{_, _}, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        true_ne_false(valid)
      )
    case R.State{_, R.RuntimeOpen{}, R.RuntimeCancelled{_}, None{}, _, E.WorldState{_, _}, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        true_ne_false(valid)
      )
    case R.State{_, R.RuntimeOpen{}, R.RuntimeCancelled{_}, Some{_}, _, E.WorldState{_, _}, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        true_ne_false(valid)
      )
    case R.State{_, R.RuntimeClosed{}, R.RuntimeReady{_}, None{}, _, E.WorldState{_, _}, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        true_ne_false(valid)
      )
    case R.State{_, R.RuntimeClosed{}, R.RuntimeReady{_}, Some{_}, _, E.WorldState{_, _}, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        true_ne_false(valid)
      )
    case R.State{_, R.RuntimeClosed{}, R.RuntimeWaiting{_}, None{}, _, E.WorldState{_, _}, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        true_ne_false(valid)
      )
    case R.State{_, R.RuntimeClosed{}, R.RuntimeWaiting{_}, Some{_}, _, E.WorldState{_, _}, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        true_ne_false(valid)
      )
    case R.State{_, R.RuntimeClosed{}, R.RuntimeReturned{_, _}, None{}, _, E.WorldState{_, _}, _}:
      {==}
    case R.State{_, R.RuntimeClosed{}, R.RuntimeReturned{_, _}, Some{_}, _, E.WorldState{_, _}, _}:
      Empty.absurd(
        {True{} == I.frozen(World, R.cancellation(World, True{}, state)) : Bool},
        true_ne_false(valid)
      )
    case R.State{_, R.RuntimeClosed{}, R.RuntimeCancelled{_}, None{}, _, E.WorldState{_, _}, _}:
      {==}
    case R.State{_, R.RuntimeClosed{}, R.RuntimeCancelled{_}, Some{_}, _, E.WorldState{_, _}, _}:
      {==}

def matching_cancel_frozen(~World: Data, +state: R.State<World>,
    valid: {True{} == I.valid(World, state) : Bool}) -> {
  True{} == I.frozen(World, R.cancel(World, state, I.invocation(World, state))) : Bool
}:
  match state:
    case R.State{+invocation, _, _, _, _, _, _}:
      %Equal.sym(Bool, Nat.is_eq(invocation, invocation), True{}, N.is_eq_refl(invocation)) : {
        True{} == I.frozen(World, R.cancellation(World, _, state)) : Bool
      }
      frozen_cancellation(~World, state, valid)

def main() -> Unit:
  Unit{}
