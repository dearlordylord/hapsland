# Owner-approved positive Receipt admission only. No Current or negative policy.
import Base
import ../core.bend as C
import ../spec.bend as S

law receipt_complete:
  for +history: List<&2,C.TraceEvent>
  for +partition: Nat
  for +live: Nat
  for +tool: Nat
  for +now: Nat
  for correct: {S.eligible(C.Receipt{},C.run(history,C.Receipt{},C.initial()),partition,live,tool,now) == True{} : Bool}
  {C.count(C.post(C.Receipt{},C.run(history,C.Receipt{},C.initial()),partition,live,tool,now)) ==
    (C.count(C.run(history,C.Receipt{},C.initial())) + 1n : Nat) : Nat}
