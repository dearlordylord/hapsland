import Base
import ./INTERPRETER_NAT_FACTS.bend as MNat
import ./INTERPRETER_BOOL_FACTS.bend as MBool

# Verbatim transitive existing proof dependency extraction.
# Source vendor/bendlib/packages/bend-mathlib/string.bend SHA256 0d6778e7ec17c04b9c8e985360fa7b3c44d751420613290f4c49ac0458ca07a8
# No theorem domains or bodies changed; selected for the original String graph gate.

def internal_false_ne_true(e: {False{} == True{} : Bool}) -> Empty:
  %e : Bool.pick(Type, _, Empty, Unit)
  Unit{}

def internal_word_cmp_refl(n: Nat, w: Word(n)) -> {EQ{} == Word.cmp(n, w, w) : Cmp}:
  match n:
    case 0n:
      {==}
    case 1n+p:
      match w:
        case WCon{ab, at}:
          %internal_word_cmp_refl(p, at) : {EQ{} == Word.cmp.fin(ab, ab, _) : Cmp}
          %Equal.sym(Cmp, Bool.cmp(ab, ab), EQ{}, MBool.cmp_refl(ab)) : {EQ{} == _ : Cmp}
          {==}

def internal_u32_cmp_refl(x: U32) -> {EQ{} == U32.cmp(x, x) : Cmp}:
  match x:
    case U32{w}:
      %internal_word_cmp_refl(32n, w) : {EQ{} == _ : Cmp}
      {==}

law u32_cmp_refl:
  for x: U32
  {U32.cmp(x, x) == EQ{} : Cmp}

def u32_cmp_refl(x):
  Equal.sym(Cmp, EQ{}, U32.cmp(x, x), internal_u32_cmp_refl(x))

def internal_cmp_refl(s: String) -> {((s, s), EQ{}) == String.cmp(s, s) : (String & String) & Cmp}:
  match s:
    case SNil{}:
      {==}
    case SCon{h, t}:
      match h:
        case Chr{x}:
          %internal_u32_cmp_refl(x) : {((SCon{Chr{x}, t}, SCon{Chr{x}, t}), EQ{}) == String.cmp.fin(t, t, ((Chr{x}, Chr{x}), _)) : (String & String) & Cmp}
          %internal_cmp_refl(t) : {((SCon{Chr{x}, t}, SCon{Chr{x}, t}), EQ{}) == String.cmp.rec(Chr{x}, Chr{x}, _) : (String & String) & Cmp}
          {==}

law eq_refl:
  for s: String
  {String.eq(s, s) == True{} : Bool}

def eq_refl(s):
  %internal_cmp_refl(s) : {Cmp.is_eq(Pair.snd(String & String, Cmp, _)) == True{} : Bool}
  {==}

def internal_fin_head(ab: Bool, bb: Bool, c: Cmp, h: {Cmp.is_eq(Word.cmp.fin(ab, bb, c)) == True{} : Bool}) -> {ab == bb : Bool}:
  match c:
    case LT{}:
      Empty.absurd({ab == bb : Bool}, internal_false_ne_true(h))
    case EQ{}:
      MBool.eq_of_cmp_eq(ab, bb, h)
    case GT{}:
      Empty.absurd({ab == bb : Bool}, internal_false_ne_true(h))

def internal_fin_tail(ab: Bool, bb: Bool, c: Cmp, h: {Cmp.is_eq(Word.cmp.fin(ab, bb, c)) == True{} : Bool}) -> {Cmp.is_eq(c) == True{} : Bool}:
  match c:
    case LT{}:
      Empty.absurd({Cmp.is_eq(LT{}) == True{} : Bool}, internal_false_ne_true(h))
    case EQ{}:
      {==}
    case GT{}:
      Empty.absurd({Cmp.is_eq(GT{}) == True{} : Bool}, internal_false_ne_true(h))

def internal_word_eq(n: Nat, a: Word(n), b: Word(n), +h: {Cmp.is_eq(Word.cmp(n, a, b)) == True{} : Bool}) -> {a == b : Word(n)}:
  match n:
    case 0n:
      match a b:
        case WNil{} WNil{}:
          {==}
    case 1n+ +p:
      match a b:
        case WCon{+ab, +at} WCon{+bb, +bt}:
          %internal_fin_head(ab, bb, Word.cmp(p, at, bt), h) : {WCon{ab, at} == WCon{_, bt} : Word(1n+p)}
          %internal_word_eq(p, at, bt, internal_fin_tail(ab, bb, Word.cmp(p, at, bt), h)) : {WCon{ab, at} == WCon{ab, _} : Word(1n+p)}
          {==}

law u32_eq_of_is_eq:
  for a: U32
  for b: U32
  for h: {U32.is_eq(a, b) == True{} : Bool}
  {a == b : U32}

def u32_eq_of_is_eq(a, b, h):
  match a b:
    case U32{x} U32{y}:
      %internal_word_eq(32n, x, y, h) : {U32{x} == U32{_} : U32}
      {==}

def internal_rec_is_eq(h1: Char, h2: Char, rr: (String & String) & Cmp) -> {Cmp.is_eq(Pair.snd(String & String, Cmp, String.cmp.rec(h1, h2, rr))) == Cmp.is_eq(Pair.snd(String & String, Cmp, rr)) : Bool}:
  match rr:
    case ((a, b), c):
      {==}

def internal_is_eq_of(c: Cmp, +d: Cmp, e: {c == d : Cmp}, h: {Cmp.is_eq(c) == True{} : Bool}) -> {Cmp.is_eq(d) == True{} : Bool}:
  %e : {Cmp.is_eq(_) == True{} : Bool}
  h

def internal_step(+x: U32, +y: U32, +t1: String, +t2: String, c: Cmp, ec: {c == U32.cmp(x, y) : Cmp}, h: {Cmp.is_eq(Pair.snd(String & String, Cmp, String.cmp.fin(t1, t2, ((Chr{x}, Chr{y}), c)))) == True{} : Bool}, ih: {String.eq(t1, t2) == True{} : Bool} -> {t1 == t2 : String}) -> {SCon{Chr{x}, t1} == SCon{Chr{y}, t2} : String}:
  match c:
    case LT{}:
      Empty.absurd({SCon{Chr{x}, t1} == SCon{Chr{y}, t2} : String}, internal_false_ne_true(h))
    case GT{}:
      Empty.absurd({SCon{Chr{x}, t1} == SCon{Chr{y}, t2} : String}, internal_false_ne_true(h))
    case EQ{}:
      %u32_eq_of_is_eq(x, y, internal_is_eq_of(EQ{}, U32.cmp(x, y), ec, {==})) : {SCon{Chr{x}, t1} == SCon{Chr{_}, t2} : String}
      %ih(Equal.trans(Bool, String.eq(t1, t2), Cmp.is_eq(Pair.snd(String & String, Cmp, String.cmp.rec(Chr{x}, Chr{y}, String.cmp(t1, t2)))), True{}, Equal.sym(Bool, Cmp.is_eq(Pair.snd(String & String, Cmp, String.cmp.rec(Chr{x}, Chr{y}, String.cmp(t1, t2)))), String.eq(t1, t2), internal_rec_is_eq(Chr{x}, Chr{y}, String.cmp(t1, t2))), h)) : {SCon{Chr{x}, t1} == SCon{Chr{x}, _} : String}
      {==}

law eq_of_eq_true:
  for a: String
  for b: String
  for h: {String.eq(a, b) == True{} : Bool}
  {a == b : String}

def eq_of_eq_true(a, b, h):
  match a b:
    case SNil{} SNil{}:
      {==}
    case SNil{} SCon{x, t}:
      Empty.absurd({SNil{} == SCon{x, t} : String}, internal_false_ne_true(h))
    case SCon{x, t} SNil{}:
      Empty.absurd({SCon{x, t} == SNil{} : String}, internal_false_ne_true(h))
    case SCon{Chr{+x}, +t1} SCon{Chr{+y}, +t2}:
      internal_step(x, y, t1, t2, U32.cmp(x, y), {==}, h, hh => eq_of_eq_true(t1, t2, hh))

law u32_cmp_refl_sym:
  for x: U32
  {EQ{} == U32.cmp(x, x) : Cmp}

def u32_cmp_refl_sym(x):
  Equal.sym(Cmp, U32.cmp(x, x), EQ{}, u32_cmp_refl(x))
