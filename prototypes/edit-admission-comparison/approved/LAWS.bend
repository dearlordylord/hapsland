# Approved first family only. Remaining prototype laws are unapproved.
import Base
import ../core.bend as C
import ../spec.bend as S

law current_fence_witness:
  for +history: List<&2, C.TraceEvent>
  for +partition: Nat
  for +live: Nat
  for +tool: Nat
  for +now: Nat
  {Bool.or(Nat.is_eq(C.count(C.post(C.Current{}, C.run(history, C.Current{}, C.initial()), partition, live, tool, now)), C.count(C.run(history, C.Current{}, C.initial()))),
    S.fresh_witness(C.run(history, C.Current{}, C.initial()), partition, live, tool)) == True{} : Bool}
