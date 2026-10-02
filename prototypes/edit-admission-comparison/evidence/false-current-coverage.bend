import Base
import ../core.bend as C
# Actual edit without PRE: current cannot guarantee accepting every edit.
def false_coverage() -> {C.count(C.run([C.NativeStart{2n,1n},C.NativeComplete{2n,2n},C.Post{1n,1n,2n,3n}],C.Current{},C.initial())) == 1n : Nat}:
  {==}
