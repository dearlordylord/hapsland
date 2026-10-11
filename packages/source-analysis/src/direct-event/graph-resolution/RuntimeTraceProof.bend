import Base

# Exact existing theorem and proof extracted from
# vendor/bendlib/packages/bend-mathlib/list.bend, append_assoc.
# Source SHA256: 4023402c30e91c8066b7d53e5104886635004f1f0e13db3235902fbaca381d7a
# Astra approved exact Quant/Kind scope reuse, 2026-10-10.
# Base-only closure avoids checking unrelated mathlib facts for runtime traces.

# Append is associative: (xs ++ ys) ++ zs = xs ++ (ys ++ zs).
law append_assoc:
  for -a: Quant
  for -A: Kind(a)
  for xs: List<a, A>
  for -ys: List<a, A>
  for -zs: List<a, A>
  {
    List.append(a, A, List.append(a, A, xs, ys), zs)
    == List.append(a, A, xs, List.append(a, A, ys, zs))
    : List<a, A>
  }

def append_assoc(a, A, xs, ys, zs):
  match xs:
    case Nil{}:
      {==}
    case h <> t:
      %append_assoc(a, A, t, ys, zs) : {
        h <> List.append(a, A, List.append(a, A, t, ys), zs)
        == h <> _
        : List<a, A>
      }
      {==}

# Exact append_nil reuse approved by Astra, 2026-10-10.
# The empty list is a right identity for append: xs ++ [] = xs.
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

def main() -> Unit:
  Unit{}
