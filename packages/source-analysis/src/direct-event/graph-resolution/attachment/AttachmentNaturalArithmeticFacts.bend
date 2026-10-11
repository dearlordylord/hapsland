import Base
import ../traversal/INTERPRETER_NAT_FACTS.bend as Shared

# Verbatim transitive proof dependency selection from pinned bend-mathlib/nat.bend.
# Numeric algorithms and every selected law/proof body are unchanged.

law add_zero:
  for x: Nat
  {Nat.add(x, 0n) == x : Nat}

def add_zero(x):
  Shared.add_zero(x)

law add_succ:
  for n: Nat
  for -m: Nat
  {Nat.add(n, 1n+m) == 1n+Nat.add(n, m) : Nat}

def add_succ(n, m):
  Shared.add_succ(n, m)

law add_comm:
  for n: Nat
  for m: Nat
  {Nat.add(n, m) == Nat.add(m, n) : Nat}

def add_comm(n, m):
  Shared.add_comm(n, m)

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

# Left commutativity of addition: a + (b + c) = b + (a + c).
def internal_pred(n: Nat) -> Nat:
  match n:
    case 0n:
      0n
    case 1n+p:
      p

# The successor function is injective: a + 1 = b + 1 implies a = b.
law succ_inj:
  for -a: Nat
  for -b: Nat
  for e: {1n+a == 1n+b : Nat}
  {a == b : Nat}

def succ_inj(a, b, e):
  %e : {a == internal_pred(_) : Nat}
  {==}

def internal_succ_ne_zero(-n: Nat, e: {1n+n == 0n : Nat}) -> Empty:
  %e : Bool.pick(Type, Nat.is_eq(_, 0n), Empty, Unit)
  Unit{}

# A successor is not zero.
law succ_ne_zero:
  for -n: Nat
  {1n+n != 0n : Nat}

def succ_ne_zero(n):
  e => internal_succ_ne_zero(n, e)

# Addition cancels on the left: a + b = a + c implies b = c.
law mul_zero:
  for x: Nat
  {Nat.mul(x, 0n) == 0n : Nat}

def mul_zero(x):
  match x:
    case 0n:
      {==}
    case 1n+p:
      mul_zero(p)

# Zero absorbs multiplication on the left: 0 * x = 0.
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

# One is a left identity for multiplication: 1 * x = x.
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

# Multiplying by a successor on the left: (n + 1) * m = n * m + m.
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

# Multiplication distributes over addition on the right: (a + b) * c = a * c + b * c.
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

# Multiplication distributes over addition on the left: a * (b + c) = a * b + a * c.
def le(a: Nat, b: Nat) -> Data:
  {Nat.is_le(a, b) == True{} : Bool}

# The strict order a < b on naturals, as a reusable proposition.
def lt(a: Nat, b: Nat) -> Data:
  {Nat.is_lt(a, b) == True{} : Bool}

# The order a >= b on naturals, as a reusable proposition.
def internal_false_ne_true(e: {False{} == True{} : Bool}) -> Empty:
  %e : Bool.pick(Type, _, Empty, Unit)
  Unit{}

# Every natural is at most itself: a <= a.
law zero_le:
  for b: Nat
  le(0n, b)

def zero_le(b):
  Shared.zero_le(b)

law le_succ:
  for n: Nat
  le(n, 1n+n)

def le_succ(n):
  Shared.le_succ(n)

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

# The order is transitive: a <= b and b <= c imply a <= c.
law le_of_lt:
  for a: Nat
  for b: Nat
  for h: lt(a, b)
  le(a, b)

def le_of_lt(a, b, h):
  Shared.le_of_lt(a, b, h)

law sub_add_cancel:
  for n: Nat
  for m: Nat
  for h: le(m, n)
  {Nat.add(Nat.sub(n, m), m) == n : Nat}

def sub_add_cancel(n, m, h):
  Shared.sub_add_cancel(n, m, h)

def internal_div_add_zero_r(a: Nat) -> {a == Nat.add(a, 0n) : Nat}:
  Equal.sym(Nat, Nat.add(a, 0n), a, add_zero(a))

def internal_div_block_start(-bp: Nat, +r: Nat, h: {bp == Nat.add(r, 0n) : Nat}) -> {bp == r : Nat}:
  %add_zero(r) : {bp == _ : Nat}
  h

def internal_div_block_step(-bp: Nat, r: Nat, -mp: Nat, h: {bp == Nat.add(r, 1n+mp) : Nat}) -> {bp == 1n+Nat.add(r, mp) : Nat}:
  %add_succ(r, mp) : {bp == _ : Nat}
  h

def internal_div_go_eq(n: Nat, m: Nat, +bp: Nat, +d: Nat, +r: Nat, +h: {bp == Nat.add(r, m) : Nat}) -> {Nat.add(Nat.mul(Pair.fst(Nat, Nat, Nat.divmod.go(n, m, d, r)), 1n+bp), Pair.snd(Nat, Nat, Nat.divmod.go(n, m, d, r))) == Nat.add(n, Nat.add(Nat.mul(d, 1n+bp), r)) : Nat}:
  match n m:
    case 0n _:
      {==}
    case 1n++np 0n:
      %add_succ(np, Nat.add(Nat.mul(d, 1n+bp), r)) : {Nat.add(Nat.mul(Pair.fst(Nat, Nat, Nat.divmod.go(np, r, 1n+d, 0n)), 1n+bp), Pair.snd(Nat, Nat, Nat.divmod.go(np, r, 1n+d, 0n))) == _ : Nat}
      %add_comm(r, Nat.mul(d, 1n+bp)) : {Nat.add(Nat.mul(Pair.fst(Nat, Nat, Nat.divmod.go(np, r, 1n+d, 0n)), 1n+bp), Pair.snd(Nat, Nat, Nat.divmod.go(np, r, 1n+d, 0n))) == Nat.add(np, 1n+_) : Nat}
      %internal_div_block_start(bp, r, h) : {Nat.add(Nat.mul(Pair.fst(Nat, Nat, Nat.divmod.go(np, r, 1n+d, 0n)), 1n+bp), Pair.snd(Nat, Nat, Nat.divmod.go(np, r, 1n+d, 0n))) == Nat.add(np, 1n+Nat.add(_, Nat.mul(d, 1n+bp))) : Nat}
      %add_zero(Nat.add(bp, Nat.mul(d, 1n+bp))) : {Nat.add(Nat.mul(Pair.fst(Nat, Nat, Nat.divmod.go(np, r, 1n+d, 0n)), 1n+bp), Pair.snd(Nat, Nat, Nat.divmod.go(np, r, 1n+d, 0n))) == Nat.add(np, 1n+_) : Nat}
      internal_div_go_eq(np, r, bp, 1n+d, 0n, internal_div_block_start(bp, r, h))
    case 1n++np 1n++mp:
      %add_succ(np, Nat.add(Nat.mul(d, 1n+bp), r)) : {Nat.add(Nat.mul(Pair.fst(Nat, Nat, Nat.divmod.go(np, mp, d, 1n+r)), 1n+bp), Pair.snd(Nat, Nat, Nat.divmod.go(np, mp, d, 1n+r))) == _ : Nat}
      %add_succ(Nat.mul(d, 1n+bp), r) : {Nat.add(Nat.mul(Pair.fst(Nat, Nat, Nat.divmod.go(np, mp, d, 1n+r)), 1n+bp), Pair.snd(Nat, Nat, Nat.divmod.go(np, mp, d, 1n+r))) == Nat.add(np, _) : Nat}
      internal_div_go_eq(np, mp, bp, d, 1n+r, internal_div_block_step(bp, r, mp, h))

# The division equation, for a positive divisor 1 + b: (a / (1 + b)) * (1 + b) + a % (1 + b) = a.
law div_mod_eq:
  for +a: Nat
  for +b: Nat
  {Nat.add(Nat.mul(Nat.div(a, 1n+b), 1n+b), Nat.mod(a, 1n+b)) == a : Nat}

def div_mod_eq(a, b):
  %add_zero(a) : {Nat.add(Nat.mul(Nat.div(a, 1n+b), 1n+b), Nat.mod(a, 1n+b)) == _ : Nat}
  internal_div_go_eq(a, b, b, 0n, 0n, {==})

law is_eq_refl:
  for n: Nat
  {Nat.is_eq(n, n) == True{} : Bool}

def is_eq_refl(n):
  match n:
    case 0n:
      {==}
    case 1n+p:
      is_eq_refl(p)

# The equality test is symmetric.
law is_eq_comm:
  for a: Nat
  for b: Nat
  {Nat.is_eq(a, b) == Nat.is_eq(b, a) : Bool}

def is_eq_comm(a, b):
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      {==}
    case 1n+p 0n:
      {==}
    case 1n++p 1n++q:
      %is_eq_comm(p, q) : {Nat.is_eq(p, q) == _ : Bool}
      {==}

# If the equality test says true, the naturals are equal.
law is_lt_eq_succ_le:
  for a: Nat
  for b: Nat
  {Nat.is_lt(a, b) == Nat.is_le(1n+a, b) : Bool}

def is_lt_eq_succ_le(a, b):
  Shared.is_lt_eq_succ_le(a, b)

law lt_of_lt_of_le:
  for a: Nat
  for b: Nat
  for c: Nat
  for ab: lt(a, b)
  for bc: le(b, c)
  lt(a, c)

def lt_of_lt_of_le(a, b, c, ab, bc):
  Shared.lt_of_lt_of_le(a, b, c, ab, bc)

law add_le_add_left:
  for -a: Nat
  for -b: Nat
  for k: Nat
  for h: le(a, b)
  le(Nat.add(k, a), Nat.add(k, b))

def add_le_add_left(a, b, k, h):
  Shared.add_le_add_left(a, b, k, h)

law le_zero_eq:
  for n: Nat
  for h: le(n, 0n)
  {n == 0n : Nat}

def le_zero_eq(n, h):
  match n:
    case 0n:
      {==}
    case 1n+p:
      Empty.absurd({1n+p == 0n : Nat}, internal_false_ne_true(h))

# No natural is less than zero.
law le_of_add_eq:
  for a: Nat
  for k: Nat
  for -b: Nat
  for e: {Nat.add(a, k) == b : Nat}
  le(a, b)

def le_of_add_eq(a, k, b, e):
  %e : {Nat.is_le(a, _) == True{} : Bool}
  le_add_right(a, k)

# Multiplying on the right preserves the order: a <= b implies a * k <= b * k.
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

# Zero divided by anything is zero: 0 / b = 0.
def internal_mod_go_le(n: Nat, m: Nat, -d: Nat, +r: Nat) -> le(Pair.snd(Nat, Nat, Nat.divmod.go(n, m, d, r)), Nat.add(r, m)):
  match n m:
    case 0n k:
      le_add_right(r, k)
    case 1n++np 0n:
      %internal_div_add_zero_r(r) : le(Pair.snd(Nat, Nat, Nat.divmod.go(np, r, 1n+d, 0n)), _)
      internal_mod_go_le(np, r, 1n+d, 0n)
    case 1n++np 1n++mp:
      %Equal.sym(Nat, Nat.add(r, 1n+mp), 1n+Nat.add(r, mp), add_succ(r, mp)) : le(Pair.snd(Nat, Nat, Nat.divmod.go(np, mp, d, 1n+r)), _)
      internal_mod_go_le(np, mp, d, 1n+r)

# A remainder is below its positive divisor: a % (1 + b) < 1 + b.
law mod_lt:
  for a: Nat
  for b: Nat
  lt(Nat.mod(a, 1n+b), 1n+b)

def mod_lt(a, b):
  +a = a
  +b = b
  %Equal.sym(Bool, Nat.is_lt(Nat.mod(a, 1n+b), 1n+b), Nat.is_le(1n+Nat.mod(a, 1n+b), 1n+b), is_lt_eq_succ_le(Nat.mod(a, 1n+b), 1n+b)) : {_ == True{} : Bool}
  internal_mod_go_le(a, b, 0n, 0n)

# A remainder never exceeds the dividend: a % b <= a.
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

# Multiplying two bounded factors stays bounded: a <= c and b <= d imply a * b <= c * d.
law lt_succ_iff:
  for m: Nat
  for n: Nat
  {Nat.is_lt(m, 1n+n) == Nat.is_le(m, n) : Bool}

def lt_succ_iff(m, n):
  Shared.lt_succ_iff(m, n)

law add_lt_add_left:
  for -a: Nat
  for -b: Nat
  for k: Nat
  for h: lt(a, b)
  lt(Nat.add(k, a), Nat.add(k, b))

def add_lt_add_left(a, b, k, h):
  match k:
    case 0n:
      h
    case 1n+p:
      add_lt_add_left(a, b, p, h)

# Adding on the right preserves the strict order: a < b implies a + k < b + k.
law add_lt_add_right:
  for a: Nat
  for b: Nat
  for k: Nat
  for h: lt(a, b)
  lt(Nat.add(a, k), Nat.add(b, k))

def add_lt_add_right(a, b, k, h):
  +a = a
  +b = b
  +k = k
  %add_comm(k, a) : lt(_, Nat.add(b, k))
  %add_comm(k, b) : lt(Nat.add(k, a), _)
  add_lt_add_left(a, b, k, h)

# Adding the same amount on the left does not change the strict order test: a < b tests as k + a < k + b.
law mul_lt_mul_of_pos_left:
  for a: Nat
  for b: Nat
  for k: Nat
  for h: lt(a, b)
  lt(Nat.mul(1n+k, a), Nat.mul(1n+k, b))

def mul_lt_mul_of_pos_left(a, b, k, h):
  +a = a
  +b = b
  +k = k
  +h = h
  lt_of_lt_of_le(Nat.add(a, Nat.mul(k, a)), Nat.add(b, Nat.mul(k, a)), Nat.add(b, Nat.mul(k, b)), add_lt_add_right(a, b, Nat.mul(k, a), h), add_le_add_left(Nat.mul(k, a), Nat.mul(k, b), b, mul_le_mul_left(a, b, k, le_of_lt(a, b, h))))

# Multiplying on the right by a positive factor preserves the strict order: a < b implies a * (1 + k) < b * (1 + k).
