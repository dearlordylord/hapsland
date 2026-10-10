import Base

def internal_reverse_go_go(a, -A: Kind(a), xs: List<a, A>, -acc: List<a, A>) -> {List.reverse.go(a, A, List.reverse.go(a, A, xs, acc), Nil{}) == List.reverse.go(a, A, acc, xs) : List<a, A>}:
  match xs:
    case Nil{}:
      {==}
    case h <> t:
      internal_reverse_go_go(a, A, t, h <> acc)

# Reversing twice gives the list back.
law reverse_reverse:
  for -a: Quant
  for -A: Kind(a)
  for xs: List<a, A>
  {List.reverse(a, A, List.reverse(a, A, xs)) == xs : List<a, A>}

def reverse_reverse(a, A, xs):
  internal_reverse_go_go(a, A, xs, Nil{})

