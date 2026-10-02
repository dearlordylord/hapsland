# Approved: a pending PRE cannot let its delayed POST reopen a successfully closed round.
import Base
import ../core.bend as C
import ./spec.bend as D

law delayed_post_after_close:
  for +state: C.State
  for history: List<&2,C.TraceEvent>
  for reached: {state == C.run(history,C.Current{},C.initial()) : C.State}
  for +tool: Nat
  for +closed_at: Nat
  for +post_at: Nat
  for round_active: {C.active(state) == True{} : Bool}
  for admission_active: {D.permit_active(C.get_permit(state)) == True{} : Bool}
  for pending_pre: {D.pending(tool,state) == True{} : Bool}
  for valid_close: {Nat.is_ge(closed_at,C.fence(C.get_permit(state))) == True{} : Bool}
  for pre_before_close: {Nat.is_ge(closed_at,D.pre_start(tool,state)) == True{} : Bool}
  for post_after_close: {Nat.is_ge(post_at,closed_at) == True{} : Bool}
  {D.outcome(C.post(C.Current{},C.close(state,closed_at),C.owner(C.get_permit(state)),C.lifetime(C.get_permit(state)),tool,post_at)) ==
    D.Outcome{C.count(state),C.round(state),False{}} : D.Outcome}
