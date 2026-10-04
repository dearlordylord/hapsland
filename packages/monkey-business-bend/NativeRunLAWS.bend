# Candidate proposals under #176; owner acceptance remains pending. These laws
# pin bounded public-boundary preservation, not liveness or full driver parity.
import Base
import ./NativeRun.bend as Run
import ./NativeRunTypes.bend as T
import ./Types.bend as EngineTypes
import ./Numeric.bend as Numeric

def controlled_state(result: T.Controlled) -> T.State:
  match result:
    case T.Controlled{state, _}: state

# Every state and valid numeric endpoint (including current clock); public input
# validation precedes the zero-budget branch, as it does at the host boundary.
# Unproved proposal (outside the checked law family): for state and endpoint
# satisfying True == Run.advance_input_supported(state, 0n, endpoint),
# Run.advance(state, 0n, endpoint) == T.Advanced{state, [], []}.
# The concrete zero-budget instance remains in the proposal evidence runner.

# Every original and proposed state; refusal rolls back the entire owner.
law refused_control_is_atomic:
  for original: T.State
  for proposed: T.State
  {Run.atomic_control(False{}, original, proposed) == T.Controlled{original, False{}} : T.Controlled}

# Every state, delay, and raw-weight list. This low-level update has no policy
# premise; public control validates delay/weights separately before invoking it.
law future_jev_profile_preserves_engine:
  for state: T.State
  for delay: Nat
  for weights: List<&2, Numeric.Words>
  {Run.core(controlled_state(Run.jev_control(state, delay, weights))) == Run.core(state) : EngineTypes.State}
