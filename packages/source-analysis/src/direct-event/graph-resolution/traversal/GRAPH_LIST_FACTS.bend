import Base

# Verbatim existing generic List facts required by full ordered graph equality.

law append_nil:
  for -a: Quant
  for -A: Kind(a)
  for xs: List<a, A>
  {List.append(a, A, xs, Nil{}) == xs : List<a, A>}

def append_nil(a, A, xs):
  match xs:
    case Nil{}:
      {==}
    case h <> t:
      %append_nil(a, A, t) : {h <> List.append(a, A, t, Nil{}) == h <> _ : List<a, A>}
      {==}

# The empty list is a left identity for append: [] ++ xs = xs.

law append_assoc:
  for -a: Quant
  for -A: Kind(a)
  for xs: List<a, A>
  for -ys: List<a, A>
  for -zs: List<a, A>
  {List.append(a, A, List.append(a, A, xs, ys), zs) == List.append(a, A, xs, List.append(a, A, ys, zs)) : List<a, A>}

def append_assoc(a, A, xs, ys, zs):
  match xs:
    case Nil{}:
      {==}
    case h <> t:
      %append_assoc(a, A, t, ys, zs) : {h <> List.append(a, A, List.append(a, A, t, ys), zs) == h <> _ : List<a, A>}
      {==}

# The length of an append is the sum of the lengths.

def internal_reverse_go_append(a, -A: Kind(a), xs: List<a, A>, -ys: List<a, A>, -acc: List<a, A>) -> {List.reverse.go(a, A, xs, List.append(a, A, ys, acc)) == List.append(a, A, List.reverse.go(a, A, xs, ys), acc) : List<a, A>}:
  match xs:
    case Nil{}:
      {==}
    case h <> t:
      internal_reverse_go_append(a, A, t, h <> ys, acc)

# The reverse accumulator loop appends the reversed list to the accumulator.

law reverse_go_spec:
  for -a: Quant
  for -A: Kind(a)
  for xs: List<a, A>
  for -acc: List<a, A>
  {List.reverse.go(a, A, xs, acc) == List.append(a, A, List.reverse(a, A, xs), acc) : List<a, A>}

def reverse_go_spec(a, A, xs, acc):
  match xs:
    case Nil{}:
      {==}
    case h <> t:
      internal_reverse_go_append(a, A, t, h <> Nil{}, acc)
