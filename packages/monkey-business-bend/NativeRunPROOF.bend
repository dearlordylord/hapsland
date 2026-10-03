# Proofs of proposals only. Quantifiers and limitations live in NativeRunLAWS.
import Base
import ./NativeRunLAWS.bend as Laws
import ./NativeRunTypes.bend as T

# zero_budget_preserves_state remains an unproved candidate. Expanding the exact
# public numeric-input premise exceeded the installed checker's machine stack;
# no proof or mathematical-validity claim is made for that candidate.

def Laws.refused_control_is_atomic(original, proposed):
  {==}

def Laws.future_jev_profile_preserves_engine(state, delay, weights):
  match state:
    case T.State{_, _, _, _, _, T.Environment{_, _, _, _, _, _, _, _, _, _, _, _, _}, _, _}: {==}
