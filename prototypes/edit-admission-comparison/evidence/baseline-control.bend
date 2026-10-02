import Base
import ../core.bend as C
import ../spec.bend as S
def planted_control() -> {C.count(C.post(C.Receipt{},C.initial(),1n,1n,9n,1n)) == 1n : Nat}:
  {==}
