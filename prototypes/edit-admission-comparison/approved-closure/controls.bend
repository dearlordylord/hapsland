import Base
import ../core.bend as C
import ./spec.bend as D

# These are excluded controls, not successful closure instances of the approved law.
def inactive_close_is_rejected() -> {C.close(C.initial(),5n) == C.initial() : C.State}:
  {==}

def active_with_new_pending() -> C.State:
  C.run([C.Pre{1n,1n,1n,1n,20n,1n},C.Post{1n,1n,1n,4n},C.RoundClose{5n},
    C.Pre{1n,1n,2n,6n,30n,6n},C.Post{1n,1n,2n,7n},C.Pre{1n,1n,3n,8n,30n,8n}],C.Current{},C.initial())

def backward_close_has_invalid_premise() -> {Nat.is_ge(4n,C.fence(C.get_permit(active_with_new_pending()))) == False{} : Bool}:
  {==}

def backward_close_is_rejected() -> {C.close(active_with_new_pending(),4n) == active_with_new_pending() : C.State}:
  {==}
