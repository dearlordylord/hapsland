import Base
import ./DefenseRulePolicy.bend as P
import ./DefenseRuleTypes.bend as R
import ../../packages/monkey-business-bend/Session.bend as Session

def require(on: Bool,label: String) -> IO(Unit):
  match on:
    case True{}: IO.print("PASS " ++ label)
    case False{}: IO.die(Unit,1,"FAIL " ++ label)
def profiles(n: Nat,+p: U32,+seed: U32) -> Bool:
  match n:
    case 0n: True{}
    case 1n++k:
      +value = P.profile(U32.from_nat((k + 1n : Nat)),p)
      +found = P.results(True{},value,seed)
      +clear = P.results(False{},value,seed)
      Nat.is_eq(List.length(&2,Bool,found),U32.to_nat(P.checks(value))) &&
        Nat.is_gt(P.count(found),0n) && Nat.is_le(P.count(found),U32.to_nat(P.checks(value))) &&
        Nat.is_eq(List.length(&2,Bool,clear),U32.to_nat(P.checks(value))) && Nat.is_eq(P.count(clear),0n) && profiles(k,p,seed)
def seeds(n: Nat) -> Bool:
  match n:
    case 0n: True{}
    case 1n++k:
      +seed = Session.seed_hash([U32.from_nat(k),114,117,108,101,115],152)
      profiles(16n,0,seed) && profiles(16n,10,seed) && profiles(16n,50,seed) && profiles(16n,100,seed) && seeds(k)
def same(a: List<&2,Bool>,b: List<&2,Bool>) -> Bool:
  match a b:
    case Nil{} Nil{}: True{}
    case True{} <> at True{} <> bt: same(at,bt)
    case False{} <> at False{} <> bt: same(at,bt)
    case _ _: False{}
def main() -> IO(Unit):
  +value = P.profile(8,100)
  +mixed = P.profile(8,50)
  do IO<Unit>:
    require(U32.is_eq(P.checks(value),8) && U32.is_eq(P.percent(value),100),"default eight checks at 100 percent")
    require(Nat.is_eq(P.count(P.results(True{},value,152)),8n),"100 percent finding produces eight findings")
    require(Nat.is_eq(P.none(P.profile(8,0)),1000000n) && Nat.is_eq(P.count(P.results(False{},P.profile(8,0),152)),0n),"zero percent has no findings")
    require(Nat.is_eq(P.none(value),0n) && Nat.is_eq(P.none(mixed),3906n),"aggregate clear probability uses all checks and six decimal precision")
    require(U32.is_eq(P.checks(P.profile(0,100)),1) && U32.is_eq(P.checks(P.profile(999,100)),16) && U32.is_eq(P.percent(P.profile(8,999)),100),"profile bounds one to sixteen checks and zero to one hundred percent")
    require(same(P.results(True{},mixed,152),P.results(True{},mixed,152)),"identical request seed replays every rule result")
    require(seeds(32n),"2048 profiles conserve check count and agree with forced aggregate finding or clear")
