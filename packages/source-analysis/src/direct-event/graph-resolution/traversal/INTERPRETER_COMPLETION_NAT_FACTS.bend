import Base

# Exact transitive pinned Nat proof extraction for the approved full interpreter completion.
# Source SHA256 445fb22805af3d01f9c9a08cefcf0e5d02f2ac750a424aeb1e0f0b6836f87991
# Existing statements and proof bodies are preserved verbatim.

law add_zero:
  for x: Nat
  {Nat.add(x, 0n) == x : Nat}

def add_zero(x):
  match x:
    case 0n:
      {==}
    case 1n+p:
      %add_zero(p) : {1n+Nat.add(p, 0n) == 1n+_ : Nat}
      {==}

law add_succ:
  for n: Nat
  for -m: Nat
  {Nat.add(n, 1n+m) == 1n+Nat.add(n, m) : Nat}

def add_succ(n, m):
  match n:
    case 0n:
      {==}
    case 1n+p:
      %add_succ(p, m) : {1n+Nat.add(p, 1n+m) == 1n+_ : Nat}
      {==}

law add_comm:
  for n: Nat
  for m: Nat
  {Nat.add(n, m) == Nat.add(m, n) : Nat}

def add_comm(n, m):
  match n m:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      %add_zero(q) : {1n+_ == 1n+Nat.add(q, 0n) : Nat}
      {==}
    case 1n+p 0n:
      %add_zero(p) : {1n+Nat.add(p, 0n) == 1n+_ : Nat}
      {==}
    case 1n++p 1n++q:
      %Equal.sym(Nat, Nat.add(p, 1n+q), 1n+Nat.add(p, q), add_succ(p, q)) : {1n+_ == 1n+Nat.add(q, 1n+p) : Nat}
      %Equal.sym(Nat, Nat.add(q, 1n+p), 1n+Nat.add(q, p), add_succ(q, p)) : {2n+Nat.add(p, q) == 1n+_ : Nat}
      %add_comm(p, q) : {2n+Nat.add(p, q) == 2n+_ : Nat}
      {==}

law add_assoc:
  for a: Nat
  for -b: Nat
  for -c: Nat
  {Nat.add(Nat.add(a, b), c) == Nat.add(a, Nat.add(b, c)) : Nat}

def add_assoc(a, b, c):
  match a:
    case 0n:
      {==}
    case 1n+p:
      %add_assoc(p, b, c) : {1n+Nat.add(Nat.add(p, b), c) == 1n+_ : Nat}
      {==}

law add_left_comm:
  for a: Nat
  for b: Nat
  for -c: Nat
  {Nat.add(a, Nat.add(b, c)) == Nat.add(b, Nat.add(a, c)) : Nat}

def add_left_comm(a, b, c):
  match a:
    case 0n:
      {==}
    case 1n+p:
      +b = b
      %Equal.sym(Nat, Nat.add(b, 1n+Nat.add(p, c)), 1n+Nat.add(b, Nat.add(p, c)), add_succ(b, Nat.add(p, c))) : {1n+Nat.add(p, Nat.add(b, c)) == _ : Nat}
      %add_left_comm(p, b, c) : {1n+Nat.add(p, Nat.add(b, c)) == 1n+_ : Nat}
      {==}

law add_add_add_comm:
  for a: Nat
  for b: Nat
  for c: Nat
  for -d: Nat
  {Nat.add(Nat.add(a, b), Nat.add(c, d)) == Nat.add(Nat.add(a, c), Nat.add(b, d)) : Nat}

def add_add_add_comm(a, b, c, d):
  match a:
    case 0n:
      add_left_comm(b, c, d)
    case 1n+p:
      %add_add_add_comm(p, b, c, d) : {1n+Nat.add(Nat.add(p, b), Nat.add(c, d)) == 1n+_ : Nat}
      {==}

law mul_zero:
  for x: Nat
  {Nat.mul(x, 0n) == 0n : Nat}

def mul_zero(x):
  match x:
    case 0n:
      {==}
    case 1n+p:
      mul_zero(p)

law mul_one:
  for x: Nat
  {Nat.mul(x, 1n) == x : Nat}

def mul_one(x):
  match x:
    case 0n:
      {==}
    case 1n+p:
      %mul_one(p) : {1n+Nat.mul(p, 1n) == 1n+_ : Nat}
      {==}

law mul_succ:
  for n: Nat
  for m: Nat
  {Nat.mul(n, 1n+m) == Nat.add(Nat.mul(n, m), n) : Nat}

def mul_succ(n, m):
  match n:
    case 0n:
      {==}
    case 1n++p:
      +m = m
      %Equal.sym(Nat, Nat.add(Nat.add(m, Nat.mul(p, m)), 1n+p), 1n+Nat.add(Nat.add(m, Nat.mul(p, m)), p), add_succ(Nat.add(m, Nat.mul(p, m)), p)) : {1n+Nat.add(m, Nat.mul(p, 1n+m)) == _ : Nat}
      %Equal.sym(Nat, Nat.add(Nat.add(m, Nat.mul(p, m)), p), Nat.add(m, Nat.add(Nat.mul(p, m), p)), add_assoc(m, Nat.mul(p, m), p)) : {1n+Nat.add(m, Nat.mul(p, 1n+m)) == 1n+_ : Nat}
      %mul_succ(p, m) : {1n+Nat.add(m, Nat.mul(p, 1n+m)) == 1n+Nat.add(m, _) : Nat}
      {==}

law mul_comm:
  for n: Nat
  for m: Nat
  {Nat.mul(n, m) == Nat.mul(m, n) : Nat}

def mul_comm(n, m):
  match n:
    case 0n:
      %mul_zero(m) : {_ == Nat.mul(m, 0n) : Nat}
      {==}
    case 1n++p:
      +m = m
      %Equal.sym(Nat, Nat.mul(m, 1n+p), Nat.add(Nat.mul(m, p), m), mul_succ(m, p)) : {Nat.add(m, Nat.mul(p, m)) == _ : Nat}
      %mul_comm(p, m) : {Nat.add(m, Nat.mul(p, m)) == Nat.add(_, m) : Nat}
      add_comm(m, Nat.mul(p, m))

law add_mul:
  for a: Nat
  for -b: Nat
  for c: Nat
  {Nat.mul(Nat.add(a, b), c) == Nat.add(Nat.mul(a, c), Nat.mul(b, c)) : Nat}

def add_mul(a, b, c):
  match a:
    case 0n:
      {==}
    case 1n+p:
      +c = c
      %Equal.sym(Nat, Nat.add(Nat.add(c, Nat.mul(p, c)), Nat.mul(b, c)), Nat.add(c, Nat.add(Nat.mul(p, c), Nat.mul(b, c))), add_assoc(c, Nat.mul(p, c), Nat.mul(b, c))) : {Nat.add(c, Nat.mul(Nat.add(p, b), c)) == _ : Nat}
      %add_mul(p, b, c) : {Nat.add(c, Nat.mul(Nat.add(p, b), c)) == Nat.add(c, _) : Nat}
      {==}

law mul_add:
  for a: Nat
  for b: Nat
  for c: Nat
  {Nat.mul(a, Nat.add(b, c)) == Nat.add(Nat.mul(a, b), Nat.mul(a, c)) : Nat}

def mul_add(a, b, c):
  match a:
    case 0n:
      {==}
    case 1n++p:
      +b = b
      +c = c
      %Equal.sym(Nat, Nat.mul(p, Nat.add(b, c)), Nat.add(Nat.mul(p, b), Nat.mul(p, c)), mul_add(p, b, c)) : {Nat.add(Nat.add(b, c), _) == Nat.add(Nat.add(b, Nat.mul(p, b)), Nat.add(c, Nat.mul(p, c))) : Nat}
      add_add_add_comm(b, c, Nat.mul(p, b), Nat.mul(p, c))

def le(a: Nat, b: Nat) -> Data:
  {Nat.is_le(a, b) == True{} : Bool}

def internal_false_ne_true(e: {False{} == True{} : Bool}) -> Empty:
  %e : Bool.pick(Type, _, Empty, Unit)
  Unit{}

law le_refl:
  for a: Nat
  le(a, a)

def le_refl(a):
  match a:
    case 0n:
      {==}
    case 1n+p:
      le_refl(p)

law zero_le:
  for b: Nat
  le(0n, b)

def zero_le(b):
  match b:
    case 0n:
      {==}
    case 1n+p:
      {==}

law le_succ:
  for n: Nat
  le(n, 1n+n)

def le_succ(n):
  match n:
    case 0n:
      {==}
    case 1n+p:
      le_succ(p)

law le_add_right:
  for n: Nat
  for k: Nat
  le(n, Nat.add(n, k))

def le_add_right(n, k):
  match n:
    case 0n:
      zero_le(k)
    case 1n+p:
      le_add_right(p, k)

law le_trans:
  for a: Nat
  for b: Nat
  for c: Nat
  for ab: le(a, b)
  for bc: le(b, c)
  le(a, c)

def le_trans(a, b, c, ab, bc):
  match a b c:
    case 0n _ 0n:
      {==}
    case 0n _ 1n+r:
      {==}
    case 1n+p 0n _:
      Empty.absurd(le(1n+p, c), internal_false_ne_true(ab))
    case 1n+p 1n+q 0n:
      Empty.absurd(le(1n+p, 0n), internal_false_ne_true(bc))
    case 1n+p 1n+q 1n+r:
      le_trans(p, q, r, ab, bc)

law sub_add_cancel:
  for n: Nat
  for m: Nat
  for h: le(m, n)
  {Nat.add(Nat.sub(n, m), m) == n : Nat}

def sub_add_cancel(n, m, h):
  match n m:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      Empty.absurd({1n+q == 0n : Nat}, internal_false_ne_true(h))
    case 1n++p 0n:
      %add_zero(p) : {1n+Nat.add(p, 0n) == 1n+_ : Nat}
      {==}
    case 1n++p 1n++q:
      %Equal.sym(Nat, Nat.add(Nat.sub(p, q), 1n+q), 1n+Nat.add(Nat.sub(p, q), q), add_succ(Nat.sub(p, q), q)) : {_ == 1n+p : Nat}
      %Equal.sym(Nat, Nat.add(Nat.sub(p, q), q), p, sub_add_cancel(p, q, h)) : {1n+_ == 1n+p : Nat}
      {==}

law succ_le_succ:
  for -a: Nat
  for -b: Nat
  for h: le(a, b)
  le(1n+a, 1n+b)

def succ_le_succ(a, b, h):
  h

law le_of_succ_le_succ:
  for -a: Nat
  for -b: Nat
  for h: le(1n+a, 1n+b)
  le(a, b)

def le_of_succ_le_succ(a, b, h):
  h

law add_le_add_left:
  for -a: Nat
  for -b: Nat
  for k: Nat
  for h: le(a, b)
  le(Nat.add(k, a), Nat.add(k, b))

def add_le_add_left(a, b, k, h):
  match k:
    case 0n:
      h
    case 1n+p:
      add_le_add_left(a, b, p, h)

law add_le_add_right:
  for +a: Nat
  for +b: Nat
  for +k: Nat
  for h: le(a, b)
  le(Nat.add(a, k), Nat.add(b, k))

def add_le_add_right(a, b, k, h):
  %add_comm(k, a) : le(_, Nat.add(b, k))
  %add_comm(k, b) : le(Nat.add(k, a), _)
  add_le_add_left(a, b, k, h)

law add_le_add:
  for +a: Nat
  for +b: Nat
  for +c: Nat
  for +d: Nat
  for h1: le(a, c)
  for h2: le(b, d)
  le(Nat.add(a, b), Nat.add(c, d))

def add_le_add(a, b, c, d, h1, h2):
  le_trans(Nat.add(a, b), Nat.add(c, b), Nat.add(c, d), add_le_add_right(a, c, b, h1), add_le_add_left(b, d, c, h2))

law mul_le_mul_right:
  for +a: Nat
  for +b: Nat
  for +k: Nat
  for h: le(a, b)
  le(Nat.mul(a, k), Nat.mul(b, k))

def mul_le_mul_right(a, b, k, h):
  %sub_add_cancel(b, a, h) : {Nat.is_le(Nat.mul(a, k), Nat.mul(_, k)) == True{} : Bool}
  %Equal.sym(Nat, Nat.mul(Nat.add(Nat.sub(b, a), a), k), Nat.add(Nat.mul(Nat.sub(b, a), k), Nat.mul(a, k)), add_mul(Nat.sub(b, a), a, k)) : {Nat.is_le(Nat.mul(a, k), _) == True{} : Bool}
  %add_comm(Nat.mul(a, k), Nat.mul(Nat.sub(b, a), k)) : {Nat.is_le(Nat.mul(a, k), _) == True{} : Bool}
  le_add_right(Nat.mul(a, k), Nat.mul(Nat.sub(b, a), k))

law le_add_left:
  for n: Nat
  for m: Nat
  le(n, Nat.add(m, n))

def le_add_left(n, m):
  match m:
    case 0n:
      le_refl(n)
    case 1n++p:
      +n = n
      le_trans(n, Nat.add(p, n), 1n+Nat.add(p, n), le_add_left(n, p), le_succ(Nat.add(p, n)))

law mul_le_mul_left:
  for a: Nat
  for b: Nat
  for k: Nat
  for h: le(a, b)
  le(Nat.mul(k, a), Nat.mul(k, b))

def mul_le_mul_left(a, b, k, h):
  +a = a
  +b = b
  +k = k
  %mul_comm(a, k) : le(_, Nat.mul(k, b))
  %mul_comm(b, k) : le(Nat.mul(a, k), _)
  mul_le_mul_right(a, b, k, h)

law add_comm_sym:
  for n: Nat
  for m: Nat
  {Nat.add(m, n) == Nat.add(n, m) : Nat}

def add_comm_sym(n, m):
  Equal.sym(Nat, Nat.add(n, m), Nat.add(m, n), add_comm(n, m))

law add_assoc_sym:
  for a: Nat
  for -b: Nat
  for -c: Nat
  {Nat.add(a, Nat.add(b, c)) == Nat.add(Nat.add(a, b), c) : Nat}

def add_assoc_sym(a, b, c):
  Equal.sym(Nat, Nat.add(Nat.add(a, b), c), Nat.add(a, Nat.add(b, c)), add_assoc(a, b, c))

law mul_one_sym:
  for x: Nat
  {x == Nat.mul(x, 1n) : Nat}

def mul_one_sym(x):
  Equal.sym(Nat, Nat.mul(x, 1n), x, mul_one(x))

law mul_succ_sym:
  for n: Nat
  for m: Nat
  {Nat.add(Nat.mul(n, m), n) == Nat.mul(n, 1n+m) : Nat}

def mul_succ_sym(n, m):
  Equal.sym(Nat, Nat.mul(n, 1n+m), Nat.add(Nat.mul(n, m), n), mul_succ(n, m))
