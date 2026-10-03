# Approved positive reopening only; duplicate POST and refusal policy are separate.
import Base
import ../core.bend as C
import ./spec.bend as D
import ../approved-closure/spec.bend as O

law fresh_registered_post_reopens:
  for +state: C.State
  for history: List<&2,C.TraceEvent>
  for reached: {state == C.run(history,C.Current{},C.initial()) : C.State}
  for completed_round: {Nat.is_gt(C.round(state),0n) == True{} : Bool}
  for closed: {D.closed(state) == True{} : Bool}
  for +tool: Nat
  for +start: Nat
  for +deadline: Nat
  for +issued_at: Nat
  for +post_at: Nat
  for unseen: {C.seen(tool,C.completed(state)) == False{} : Bool}
  for fresh_start: {Nat.is_gt(start,C.fence(C.get_permit(state))) == True{} : Bool}
  for start_before_issue: {Nat.is_le(start,issued_at) == True{} : Bool}
  for issue_window: {Nat.is_lt(issued_at,(start + 5n : Nat)) == True{} : Bool}
  for issue_deadline: {Nat.is_le(issued_at,deadline) == True{} : Bool}
  for issue_before_post: {Nat.is_le(issued_at,post_at) == True{} : Bool}
  for start_before_post: {Nat.is_le(start,post_at) == True{} : Bool}
  for timely_post: {Nat.is_lt(post_at,deadline) == True{} : Bool}
  for +registered: C.State
  for actual_pre: {registered == C.pre(C.Current{},state,C.owner(C.get_permit(state)),C.lifetime(C.get_permit(state)),tool,start,deadline,issued_at) : C.State}
  for created_permit: {registered == D.created(state,tool,start,deadline) : C.State}
  {O.outcome(C.post(C.Current{},registered,C.owner(C.get_permit(state)),C.lifetime(C.get_permit(state)),tool,post_at)) ==
    O.Outcome{(C.count(state) + 1n : Nat),(C.round(state) + 1n : Nat),True{}} : O.Outcome}
