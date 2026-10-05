# Actual Host seam: presentation cannot postpone accepted simulator work.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def state(value: T.Advanced) -> T.State:
  match value:
    case T.Advanced{result,_,_}: result
def same(a: T.Observation,b: T.Observation) -> Bool:
  match a b:
    case T.Observation{at,ac,_,_,aq,av,_} T.Observation{bt,bc,_,_,bq,bv,_}:
      Nat.is_eq(at,bt) && Nat.is_eq(ac,bc) && Nat.is_eq(aq,bq) && av && bv
def world_value(items: List<&2,M.World>) -> M.World:
  match items:
    case world <> _: world
    case _: H.initial()
def state_value(items: List<&2,T.State>) -> T.State:
  match items:
    case state <> _: state
    case _: M.engine(H.initial())
def main() -> IO(Unit):
  +origin: List<&2,M.World> = [H.start(H.initial())]
  +first: List<&2,M.World> = [H.tick(world_value(origin))]
  +reference: List<&2,T.State> = [state(Run.advance(M.engine(world_value(origin)),256n,20n))]
  do IO<Unit>:
    require(same(Run.observe(M.engine(world_value(first))),Run.observe(state_value(reference))),"first tick consumes actual engine transitions without a visual gate")
    require(same(Run.observe(M.engine(H.tick(world_value(first)))),Run.observe(state(Run.advance(state_value(reference),256n,40n)))),"unfinished road movement cannot block the next business transition")
