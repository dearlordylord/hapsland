import Base
import ../core.bend as C
import ../approved-closure/spec.bend as O
import ./spec.bend as D

# Concrete excluded cases only; no universal negative admission policy is approved.
def completed() -> C.State:
  C.run([C.Pre{1n,1n,1n,1n,20n,1n},C.Post{1n,1n,1n,2n},C.RoundClose{3n}],C.Current{},C.initial())

def original_deadline_boundary() ->
    {O.outcome(C.post(C.Current{},C.pre(C.Current{},completed(),1n,1n,2n,4n,12n,4n),1n,1n,2n,12n)) == O.Outcome{1n,1n,False{}} : O.Outcome}:
  {==}

def start_at_closure_fence() ->
    {C.pre(C.Current{},completed(),1n,1n,2n,3n,12n,3n) == completed() : C.State}:
  {==}

def prospective_window_boundary() ->
    {C.pre(C.Current{},completed(),1n,1n,2n,4n,12n,9n) == completed() : C.State}:
  {==}

def retained_duplicate_is_not_new() ->
    {C.pre(C.Current{},completed(),1n,1n,1n,4n,12n,4n) == completed() : C.State}:
  {==}

def original_deadline_before_issue() ->
    {C.pre(C.Current{},completed(),1n,1n,2n,4n,3n,4n) == completed() : C.State}:
  {==}
