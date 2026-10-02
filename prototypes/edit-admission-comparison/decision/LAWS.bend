# DRAFT decision candidates only. No approval or universal proof.
import Base
import ../core.bend as C
import ../spec.bend as S
import ./spec.bend as D

# No hidden chronology can distinguish A's old and fresh observable-equivalent POST.
law receipt_native_erasure:
  for +history: List<&2,C.TraceEvent>
  {C.run(history,C.Receipt{},C.initial()) == C.run(D.observable(history),C.Receipt{},C.initial()) : C.State}

# Host ordering is an EXTERNAL premise, not an assertion about actual runtime IO.
law current_native_fresh_under_host_order:
  for +history: List<&2,C.TraceEvent>
  for +partition: Nat
  for +live: Nat
  for +tool: Nat
  for +now: Nat
  for +native_start: Nat
  {Bool.or(Nat.is_eq(C.count(C.post(C.Current{},C.run(history,C.Current{},C.initial()),partition,live,tool,now)),C.count(C.run(history,C.Current{},C.initial()))),
    Bool.or(Bool.not(Nat.is_ge(native_start,D.correlated_start(C.run(history,C.Current{},C.initial()),tool))),
      Nat.is_gt(native_start,C.fence(C.get_permit(C.run(history,C.Current{},C.initial())))))) == True{} : Bool}

# A's candidate policy: accepted POST joins active or opens successor; refusal changes neither.
law receipt_round_boundary:
  for +history: List<&2,C.TraceEvent>
  for +partition: Nat
  for +live: Nat
  for +tool: Nat
  for +now: Nat
  {D.Boundary{C.round(C.post(C.Receipt{},C.run(history,C.Receipt{},C.initial()),partition,live,tool,now)),C.active(C.post(C.Receipt{},C.run(history,C.Receipt{},C.initial()),partition,live,tool,now))} ==
    D.Boundary{S.expected_round(C.run(history,C.Receipt{},C.initial()),S.eligible(C.Receipt{},C.run(history,C.Receipt{},C.initial()),partition,live,tool,now)),
      Bool.or(C.active(C.run(history,C.Receipt{},C.initial())),S.eligible(C.Receipt{},C.run(history,C.Receipt{},C.initial()),partition,live,tool,now))} : D.Boundary}
