import Base
import ../core.bend as C
def planted_control() -> {C.count(C.post(C.Current{},C.pre(C.Current{},C.initial(),1n,1n,9n,1n,10n,1n),1n,1n,9n,2n)) == 1n : Nat}:
  {==}
