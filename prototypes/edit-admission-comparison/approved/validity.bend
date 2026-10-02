import Base
import ../core.bend as C
import ../../../packages/agent-flow-bend/Admission.bend as P
import ./consume-facts.bend as F

# Necessary validity matching the owner's approved phrase "valid PRE".
# This is not the unapproved sound-and-complete exact_post requirement.
def strict_deadline(found: Maybe<&2,P.Permit>, now: Nat) -> Bool:
  match found:
    case None{}: False{}
    case Some{P.Permit{_,_,_,_,deadline}}: Nat.is_lt(now,deadline)

def valid_expired_state(+state: C.State, partition: Nat, live: Nat, +tool: Nat, +now: Nat) -> Bool:
  Bool.and(F.consume_guards(C.get_permit(state),partition,live,C.token(C.get_permit(state),tool),tool,now),
    strict_deadline(P.find_permit(C.token(C.get_permit(state),tool),C.get_pending(C.get_permit(state))),now))

def valid_pre(state: C.State, partition: Nat, live: Nat, tool: Nat, +now: Nat) -> Bool:
  valid_expired_state(C.expire_now(state,now),partition,live,tool,now)
