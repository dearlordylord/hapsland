import Base

# Verbatim transitive existing proof dependency extraction.
# Source vendor/bendlib/packages/bend-mathlib/nat.bend SHA256 445fb22805af3d01f9c9a08cefcf0e5d02f2ac750a424aeb1e0f0b6836f87991
# No theorem domains or bodies changed; selected for the original String graph gate.

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

def le(a: Nat, b: Nat) -> Data:
  {Nat.is_le(a, b) == True{} : Bool}

def lt(a: Nat, b: Nat) -> Data:
  {Nat.is_lt(a, b) == True{} : Bool}

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

law lt_trans:
  for a: Nat
  for b: Nat
  for c: Nat
  for ab: lt(a, b)
  for bc: lt(b, c)
  lt(a, c)

def lt_trans(a, b, c, ab, bc):
  match a b c:
    case 0n 0n _:
      Empty.absurd(lt(0n, c), internal_false_ne_true(ab))
    case 0n 1n+q 0n:
      Empty.absurd(lt(0n, 0n), internal_false_ne_true(bc))
    case 0n 1n+q 1n+r:
      {==}
    case 1n+p 0n _:
      Empty.absurd(lt(1n+p, c), internal_false_ne_true(ab))
    case 1n+p 1n+q 0n:
      Empty.absurd(lt(1n+p, 0n), internal_false_ne_true(bc))
    case 1n+p 1n+q 1n+r:
      lt_trans(p, q, r, ab, bc)

law le_of_lt:
  for a: Nat
  for b: Nat
  for h: lt(a, b)
  le(a, b)

def le_of_lt(a, b, h):
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      {==}
    case 1n+p 0n:
      Empty.absurd(le(1n+p, 0n), internal_false_ne_true(h))
    case 1n+p 1n+q:
      le_of_lt(p, q, h)

law sub_zero:
  for n: Nat
  {Nat.sub(n, 0n) == n : Nat}

def sub_zero(n):
  match n:
    case 0n:
      {==}
    case 1n+p:
      {==}

law sub_self:
  for n: Nat
  {Nat.sub(n, n) == 0n : Nat}

def sub_self(n):
  match n:
    case 0n:
      {==}
    case 1n+p:
      sub_self(p)

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

law sub_le:
  for n: Nat
  for m: Nat
  le(Nat.sub(n, m), n)

def sub_le(n, m):
  match n m:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      {==}
    case 1n+p 0n:
      le_refl(1n+p)
    case 1n++p 1n++q:
      le_trans(Nat.sub(p, q), p, 1n+p, sub_le(p, q), le_succ(p))

def internal_div_wit_succ(+ap: Nat, +bq: Nat, w: &k:Nat -> {Nat.add(ap, k) == bq : Nat}) -> &k:Nat -> {Nat.add(1n+ap, k) == 1n+bq : Nat}:
  match w:
    case (k, e):
      (k, Equal.cong(Nat, Nat, x => 1n+x, Nat.add(ap, k), bq, e))

def internal_div_le_wit(a: Nat, b: Nat, h: {Nat.is_le(a, b) == True{} : Bool}) -> &k:Nat -> {Nat.add(a, k) == b : Nat}:
  match a b:
    case 0n y:
      (y, {==})
    case 1n+ap 0n:
      Empty.absurd(&k:Nat -> {Nat.add(1n+ap, k) == 0n : Nat}, internal_false_ne_true(h))
    case 1n++ap 1n++bq:
      internal_div_wit_succ(ap, bq, internal_div_le_wit(ap, bq, h))

def internal_div_go_small(n: Nat, +k: Nat, +d: Nat, r: Nat) -> {d == Pair.fst(Nat, Nat, Nat.divmod.go(n, Nat.add(n, k), d, r)) : Nat}:
  match n:
    case 0n:
      {==}
    case 1n+np:
      internal_div_go_small(np, k, d, 1n+r)

def internal_div_zero_of_wit(+a: Nat, +b: Nat, w: &k:Nat -> {Nat.add(a, k) == b : Nat}) -> {Nat.div(a, 1n+b) == 0n : Nat}:
  match w:
    case (+k, e):
      %e : {Nat.div(a, 1n+_) == 0n : Nat}
      Equal.sym(Nat, 0n, Pair.fst(Nat, Nat, Nat.divmod.go(a, Nat.add(a, k), 0n, 0n)), internal_div_go_small(a, k, 0n, 0n))

law div_eq_zero_of_le:
  for +a: Nat
  for +b: Nat
  for h: le(a, b)
  {Nat.div(a, 1n+b) == 0n : Nat}

def div_eq_zero_of_le(a, b, h):
  internal_div_zero_of_wit(a, b, internal_div_le_wit(a, b, h))

def internal_div_go_run(m: Nat, +a: Nat, +d: Nat, +r: Nat) -> {Nat.divmod.go(a, Nat.add(m, r), 1n+d, 0n) == Nat.divmod.go(Nat.add(1n+m, a), m, d, r) : Nat & Nat}:
  match m:
    case 0n:
      {==}
    case 1n++mp:
      %add_succ(mp, r) : {Nat.divmod.go(a, _, 1n+d, 0n) == Nat.divmod.go(1n+Nat.add(mp, a), mp, d, 1n+r) : Nat & Nat}
      internal_div_go_run(mp, a, d, 1n+r)

law eq_of_is_eq:
  for a: Nat
  for b: Nat
  for h: {Nat.is_eq(a, b) == True{} : Bool}
  {a == b : Nat}

def eq_of_is_eq(a, b, h):
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      Empty.absurd({0n == 1n+q : Nat}, internal_false_ne_true(h))
    case 1n+p 0n:
      Empty.absurd({1n+p == 0n : Nat}, internal_false_ne_true(h))
    case 1n++p 1n++q:
      %eq_of_is_eq(p, q, h) : {1n+p == 1n+_ : Nat}
      {==}

law is_lt_eq_succ_le:
  for a: Nat
  for b: Nat
  {Nat.is_lt(a, b) == Nat.is_le(1n+a, b) : Bool}

def is_lt_eq_succ_le(a, b):
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      match q:
        case 0n:
          {==}
        case 1n+r:
          {==}
    case 1n+p 0n:
      {==}
    case 1n+p 1n+q:
      is_lt_eq_succ_le(p, q)

law lt_succ_self:
  for n: Nat
  lt(n, 1n+n)

def lt_succ_self(n):
  match n:
    case 0n:
      {==}
    case 1n+p:
      lt_succ_self(p)

law succ_le_succ:
  for -a: Nat
  for -b: Nat
  for h: le(a, b)
  le(1n+a, 1n+b)

def succ_le_succ(a, b, h):
  h

law lt_of_lt_of_le:
  for a: Nat
  for b: Nat
  for c: Nat
  for ab: lt(a, b)
  for bc: le(b, c)
  lt(a, c)

def lt_of_lt_of_le(a, b, c, ab, bc):
  match a b c:
    case 0n 0n _:
      Empty.absurd(lt(0n, c), internal_false_ne_true(ab))
    case 0n 1n+q 0n:
      Empty.absurd(lt(0n, 0n), internal_false_ne_true(bc))
    case 0n 1n+q 1n+r:
      {==}
    case 1n+p 0n _:
      Empty.absurd(lt(1n+p, c), internal_false_ne_true(ab))
    case 1n+p 1n+q 0n:
      Empty.absurd(lt(1n+p, 0n), internal_false_ne_true(bc))
    case 1n+p 1n+q 1n+r:
      lt_of_lt_of_le(p, q, r, ab, bc)

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

law le_and_le_sub_iff_add_le:
  for a: Nat
  for -b: Nat
  for c: Nat
  {Bool.and(Nat.is_le(a, c), Nat.is_le(b, Nat.sub(c, a))) == Nat.is_le(Nat.add(a, b), c) : Bool}

def le_and_le_sub_iff_add_le(a, b, c):
  match a c:
    case 0n 0n:
      {==}
    case 0n 1n+j:
      {==}
    case 1n+i 0n:
      {==}
    case 1n+i 1n+j:
      le_and_le_sub_iff_add_le(i, b, j)

law lt_zero:
  for n: Nat
  lt(n, 0n) -> Empty

def lt_zero(n):
  match n:
    case 0n:
      h => internal_false_ne_true(h)
    case 1n+p:
      h => internal_false_ne_true(h)

law le_of_not_lt:
  for a: Nat
  for b: Nat
  for h: {Nat.is_lt(a, b) == False{} : Bool}
  le(b, a)

def le_of_not_lt(a, b, h):
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      Empty.absurd(le(1n+q, 0n), internal_false_ne_true(Equal.sym(Bool, True{}, False{}, h)))
    case 1n+p 0n:
      {==}
    case 1n+p 1n+q:
      le_of_not_lt(p, q, h)

law succ_sub:
  for a: Nat
  for b: Nat
  for h: le(b, a)
  {Nat.sub(1n+a, b) == 1n+Nat.sub(a, b) : Nat}

def succ_sub(a, b, h):
  match a b:
    case 0n 0n:
      {==}
    case 1n+p 0n:
      {==}
    case 0n 1n+q:
      Empty.absurd({Nat.sub(1n, 1n+q) == 1n+Nat.sub(0n, 1n+q) : Nat}, internal_false_ne_true(h))
    case 1n+p 1n+q:
      succ_sub(p, q, h)

def internal_lt_sub_zero(a: Nat, p: Nat) -> {Nat.is_lt(a, Nat.sub(0n, 1n+p)) == Nat.is_lt(Nat.add(1n+p, a), 0n) : Bool}:
  match a:
    case 0n:
      {==}
    case 1n+x:
      {==}

law lt_sub_iff_add_lt:
  for a: Nat
  for b: Nat
  for c: Nat
  {Nat.is_lt(a, Nat.sub(c, b)) == Nat.is_lt(Nat.add(b, a), c) : Bool}

def lt_sub_iff_add_lt(a, b, c):
  match b c:
    case 0n 0n:
      {==}
    case 0n 1n+r:
      {==}
    case 1n+p 0n:
      internal_lt_sub_zero(a, p)
    case 1n+p 1n+r:
      lt_sub_iff_add_lt(a, p, r)

def internal_mod_go_small(n: Nat, -k: Nat, -d: Nat, +r: Nat) -> {Pair.snd(Nat, Nat, Nat.divmod.go(n, Nat.add(n, k), d, r)) == Nat.add(n, r) : Nat}:
  match n:
    case 0n:
      {==}
    case 1n++np:
      %add_succ(np, r) : {Pair.snd(Nat, Nat, Nat.divmod.go(np, Nat.add(np, k), d, 1n+r)) == _ : Nat}
      internal_mod_go_small(np, k, d, 1n+r)

def internal_mod_eq_of_wit(+a: Nat, +b: Nat, w: &k:Nat -> {Nat.add(a, k) == b : Nat}) -> {Nat.mod(a, 1n+b) == a : Nat}:
  match w:
    case (+k, e):
      %e : {Nat.mod(a, 1n+_) == a : Nat}
      Equal.trans(Nat, Nat.mod(a, 1n+Nat.add(a, k)), Nat.add(a, 0n), a, internal_mod_go_small(a, k, 0n, 0n), add_zero(a))

law mod_eq_of_lt:
  for a: Nat
  for b: Nat
  for h: lt(a, b)
  {Nat.mod(a, b) == a : Nat}

def mod_eq_of_lt(a, b, h):
  match b:
    case 0n:
      +a = a
      Empty.absurd({Nat.mod(a, 0n) == a : Nat}, lt_zero(a)(h))
    case 1n++bp:
      +a = a
      +bp = bp
      internal_mod_eq_of_wit(a, bp, internal_div_le_wit(a, bp, Equal.trans(Bool, Nat.is_le(1n+a, 1n+bp), Nat.is_lt(a, 1n+bp), True{}, Equal.sym(Bool, Nat.is_lt(a, 1n+bp), Nat.is_le(1n+a, 1n+bp), is_lt_eq_succ_le(a, 1n+bp)), h)))

law sub_sub_self:
  for n: Nat
  for m: Nat
  for h: le(m, n)
  {Nat.sub(n, Nat.sub(n, m)) == m : Nat}

def sub_sub_self(n, m, h):
  match n m:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      Empty.absurd({Nat.sub(0n, Nat.sub(0n, 1n+q)) == 1n+q : Nat}, internal_false_ne_true(h))
    case 1n+p 0n:
      sub_self(p)
    case 1n++p 1n++q:
      Equal.trans(Nat, Nat.sub(1n+p, Nat.sub(p, q)), 1n+Nat.sub(p, Nat.sub(p, q)), 1n+q, succ_sub(p, Nat.sub(p, q), sub_le(p, q)), Equal.cong(Nat, Nat, x => 1n+x, Nat.sub(p, Nat.sub(p, q)), q, sub_sub_self(p, q, h)))

law lt_succ_iff:
  for m: Nat
  for n: Nat
  {Nat.is_lt(m, 1n+n) == Nat.is_le(m, n) : Bool}

def lt_succ_iff(m, n):
  is_lt_eq_succ_le(m, 1n+n)

law le_of_lt_succ:
  for m: Nat
  for n: Nat
  for h: lt(m, 1n+n)
  le(m, n)

def le_of_lt_succ(m, n, h):
  Equal.trans(Bool, Nat.is_le(m, n), Nat.is_lt(m, 1n+n), True{}, Equal.sym(Bool, Nat.is_lt(m, 1n+n), Nat.is_le(m, n), lt_succ_iff(m, n)), h)

law lt_succ_of_le:
  for m: Nat
  for n: Nat
  for h: le(m, n)
  lt(m, 1n+n)

def lt_succ_of_le(m, n, h):
  Equal.trans(Bool, Nat.is_lt(m, 1n+n), Nat.is_le(m, n), True{}, lt_succ_iff(m, n), h)

law succ_le_of_lt:
  for n: Nat
  for m: Nat
  for h: lt(n, m)
  le(1n+n, m)

def succ_le_of_lt(n, m, h):
  Equal.trans(Bool, Nat.is_le(1n+n, m), Nat.is_lt(n, m), True{}, Equal.sym(Bool, Nat.is_lt(n, m), Nat.is_le(1n+n, m), is_lt_eq_succ_le(n, m)), h)

law lt_of_succ_le:
  for n: Nat
  for m: Nat
  for h: le(1n+n, m)
  lt(n, m)

def lt_of_succ_le(n, m, h):
  Equal.trans(Bool, Nat.is_lt(n, m), Nat.is_le(1n+n, m), True{}, is_lt_eq_succ_le(n, m), h)

law lt_iff_le_and_ne:
  for a: Nat
  for b: Nat
  {Nat.is_lt(a, b) == Bool.and(Nat.is_le(a, b), Bool.not(Nat.is_eq(a, b))) : Bool}

def lt_iff_le_and_ne(a, b):
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      {==}
    case 1n+p 0n:
      {==}
    case 1n+p 1n+q:
      lt_iff_le_and_ne(p, q)

law sub_lt:
  for n: Nat
  for m: Nat
  lt(Nat.sub(1n+n, 1n+m), 1n+n)

def sub_lt(n, m):
  +n = n
  +m = m
  lt_succ_of_le(Nat.sub(n, m), n, sub_le(n, m))

law lt_sub_of_add_lt:
  for a: Nat
  for b: Nat
  for c: Nat
  for h: lt(Nat.add(a, b), c)
  lt(a, Nat.sub(c, b))

def lt_sub_of_add_lt(a, b, c, h):
  +a = a
  +b = b
  %Equal.sym(Bool, Nat.is_lt(a, Nat.sub(c, b)), Nat.is_lt(Nat.add(b, a), c), lt_sub_iff_add_lt(a, b, c)) : {_ == True{} : Bool}
  %add_comm(a, b) : {Nat.is_lt(_, c) == True{} : Bool}
  h

law sub_pos_of_lt:
  for m: Nat
  for n: Nat
  for h: lt(m, n)
  lt(0n, Nat.sub(n, m))

def sub_pos_of_lt(m, n, h):
  lt_sub_of_add_lt(0n, m, n, h)
