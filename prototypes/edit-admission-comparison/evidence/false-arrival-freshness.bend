import Base
import ../core.bend as C
import ./indistinguishable.bend as W
# Expected counterexample to the proposed stronger guarantee; not an approval law.
def false_freshness() -> {C.count(C.run(W.old(),C.Receipt{},C.initial())) == 1n : Nat}:
  {==}
