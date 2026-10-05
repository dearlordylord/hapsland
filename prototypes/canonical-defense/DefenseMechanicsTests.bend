# Independent literals for the shared game mapping; these are examples, not universal laws.
import Base
import ./DefenseMechanics.bend as Mechanics
import ../../packages/monkey-business-bend/Numeric.bend as Numeric

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def unsupported(action: Mechanics.Action) -> Bool:
  match action:
    case Mechanics.Unsupported{}: True{}
    case _: False{}
def output(action: Mechanics.Action) -> Bool:
  match action:
    case Mechanics.OutputTiming{outcome,delay,lease}:
      U32.is_eq(outcome,1) && Nat.is_eq(delay,2n) && Nat.is_eq(lease,100n)
    case _: False{}
def weights(values: List<&2,Numeric.Words>) -> Bool:
  match values:
    case Numeric.Words{0n,0n} <> Numeric.Words{finding,0n} <> Numeric.Words{clear,0n} <> Numeric.Words{0n,0n} <> Numeric.Words{0n,0n} <> Numeric.Words{0n,0n} <> Nil{}:
      Nat.is_eq(finding,1071644672n) && Nat.is_eq(clear,1072693248n)
    case _: False{}
def refinement(action: Mechanics.Action) -> Bool:
  match action:
    case Mechanics.FutureReview{delay,values}: Nat.is_eq(delay,3200n) && weights(values)
    case _: False{}
def main() -> IO(Unit):
  do IO<Unit>:
    require(unsupported(Mechanics.translate(Mechanics.DependencyAcceleration{})),"Coordinator unsupported")
    require(unsupported(Mechanics.translate(Mechanics.FutureBatching{})),"Packager unsupported")
    require(unsupported(Mechanics.translate(Mechanics.LaunchPacing{})),"Parallelizer unsupported")
    require(output(Mechanics.translate(Mechanics.OutputLatency{1,2n,100n})),"Output timing preserves certainty and deadlines")
    require(refinement(Mechanics.translate(Mechanics.Refinement{})),"Refiner future profile")
