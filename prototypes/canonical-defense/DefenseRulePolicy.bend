# Synthetic rule checks, conditioned on the shared request's actual aggregate.
# Six-decimal fixed point bounds the aggregate probability; outcomes are seeded.
import Base
import ./DefenseRuleTypes.bend as R
import ../../packages/monkey-business-bend/Session.bend as Session
import ../../packages/monkey-business-bend/Numeric.bend as Numeric

def profile(checks: U32,percent: U32) -> R.Profile:
  R.Profile{U32.max(1,U32.min(16,checks)),U32.min(100,percent)}
def initial() -> R.State: R.State{profile(8,100),[]}
def checks(value: R.Profile) -> U32:
  match value:
    case R.Profile{n,_}: n
def percent(value: R.Profile) -> U32:
  match value:
    case R.Profile{_,p}: p
def none_probability(n: Nat,+p: Nat,acc: Nat) -> Nat:
  match n:
    case 0n: acc
    case 1n+k: none_probability(k,p,(acc * (100n - p : Nat) / 100n : Nat))
def none(+value: R.Profile) -> Nat:
  none_probability(U32.to_nat(checks(value)),U32.to_nat(percent(value)),1000000n)
def weights(+value: R.Profile) -> List<&2,Numeric.Words>:
  +clear = none(value)
  [Numeric.Words{0n,0n},Numeric.draw((1000000n - clear : Nat)),Numeric.draw(clear),
    Numeric.Words{0n,0n},Numeric.Words{0n,0n},Numeric.Words{0n,0n}]
def roll(+random: U32,threshold: Nat) -> Bool:
  Nat.is_lt((U32.to_nat((random >> 8n : U32)) * 1000000n / 16777216n : Nat),threshold)
def threshold(+remaining: Nat,+p: Nat,has_finding: Bool) -> Nat:
  Bool.pick(Nat,has_finding,(p * 10000n : Nat),
    (p * 1000000n * 10000n / Nat.max(1n,(1000000n - none_probability(remaining,p,1000000n) : Nat)) : Nat))
def next_result(+random: U32,+remaining: Nat,+p: Nat,+seen: Bool) -> Bool:
  Bool.pick(Bool,Nat.is_eq(remaining,1n) && Bool.not(seen),True{},roll(random,threshold(remaining,p,seen)))
def positive(n: Nat,+p: Nat,+seen: Bool,random: U32) -> List<&2,Bool>:
  match n:
    case 0n: []
    case 1n++k:
      +next = Session.random_step(random)
      +hit = next_result(next,(1n + k : Nat),p,seen)
      hit <> positive(k,p,seen || hit,next)
def negative(n: Nat) -> List<&2,Bool>:
  match n:
    case 0n: []
    case 1n+k: False{} <> negative(k)
def results(finding: Bool,+value: R.Profile,seed: U32) -> List<&2,Bool>:
  match finding:
    case True{}: positive(U32.to_nat(checks(value)),U32.to_nat(percent(value)),False{},seed)
    case False{}: negative(U32.to_nat(checks(value)))
def count(items: List<&2,Bool>) -> Nat:
  match items:
    case Nil{}: 0n
    case hit <> tail: (Bool.pick(Nat,hit,1n,0n) + count(tail) : Nat)
