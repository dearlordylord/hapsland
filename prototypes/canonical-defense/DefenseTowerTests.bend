# Actual game controls, observed through the shared simulator boundary.
import Base
import ./DefenseConsumer.bend as Consumer
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/monkey-business-bend/Callbacks.bend as Callbacks
import ./DefenseMechanics.bend as Mechanics
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def jev_delay(state: T.State) -> Nat:
  match state:
    case T.State{_,_,_,_,_,T.Environment{delay,_,_,_,_,_,_,_,_,_,_,_,_,_},_,_,_,_,_}: delay
def output_delay(state: T.State) -> Nat:
  match state:
    case T.State{_,_,_,_,_,T.Environment{_,_,_,_,_,_,delay,_,_,_,_,_,_,_},_,_,_,_,_}: delay
def callbacks(state: T.State) -> List<&2,T.RetainedCallback>:
  match state:
    case T.State{_,_,_,_,_,_,_,_,_,_,T.HostFacts{_,items,_}}: items
def issued_delay(items: List<&2,T.RetainedCallback>) -> Nat:
  match items:
    case Nil{}: 0n
    case T.RetainedCallback{_,issued,due,_,Callbacks.Fact{Callbacks.Target{_,Callbacks.JevSettled{_},_},_,_,_}} <> _: (due - issued : Nat)
    case _ <> rest: issued_delay(rest)
def request(fuel: Nat,+world: M.World) -> M.World:
  match fuel:
    case 0n: world
    case 1n+n:
      Bool.pick(M.World,(issued_delay(callbacks(M.engine(world))) > 0n : Nat),world,request(n,H.tick(world)))
def forced_environment(env: T.Environment) -> T.Environment:
  match env:
    case T.Environment{a,_,c,d,e,f,g,h,i,j,k,l,m,n}:
      T.Environment{a,Some{C.RequestClear{}},c,d,e,f,g,h,i,j,k,l,m,n}
def forced_config(config: T.Config) -> T.Config:
  match config:
    case T.Config{a,b,env,d}: T.Config{a,b,forced_environment(env),d}
def forced_clear(state: T.State) -> Bool:
  match state:
    case T.State{_,_,_,_,_,T.Environment{_,Some{C.RequestClear{}},_,_,_,_,_,_,_,_,_,_,_,_},_,_,_,_,_}: True{}
    case _: False{}
def inaccessible(+world: M.World) -> M.World:
  M.with_engine(world,Mechanics.applied(Run.control(M.engine(world),T.EnvironmentControl{True{},False{},1n,False{}})))
def access_ready(state: T.State) -> Bool:
  match state:
    case T.State{_,_,_,_,_,T.Environment{_,_,_,_,_,_,_,_,_,ready,_,readable,_,_},_,_,_,_,_}: ready && readable
def repair_is_one_shot() -> Bool:
  +repaired = H.build(inaccessible(H.initial()),424,232,2)
  access_ready(M.engine(repaired)) && Bool.not(access_ready(M.engine(H.build(inaccessible(repaired),424,392,0)))) && Bool.not(access_ready(M.engine(H.build(inaccessible(repaired),424,392,2))))
def world_value(items: List<&2,M.World>) -> M.World:
  match items:
    case world <> _: world
    case _: H.initial()
def main() -> IO(Unit):
  +world: List<&2,M.World> = [H.build(H.initial(),424,392,0)]
  +late: List<&2,M.World> = [request(200n,H.start(H.initial()))]
  +early: List<&2,M.World> = [request(200n,H.start(world_value(world)))]
  do IO<Unit>:
    require(U32.is_eq(Mechanics.max_level(2),1),"access repair has no fictional speed upgrades")
    require(repair_is_one_shot(),"repair restores access once and another purchase cannot silently repair again")
    require(forced_clear(M.engine(H.build(H.initial_config(forced_config(Consumer.config()),152n),424,392,0))),"delay-only service preserves an explicitly forced clear outcome")
    require(Nat.is_eq(jev_delay(M.engine(world_value(world))),1600n),"connected Jev service changes the real future request profile from3200 to1600ms")
    require(Nat.is_eq(jev_delay(M.engine(H.build(H.initial(),424,232,0))),3200n),"out-of-range placement spends gold but has no simulator effect")
    require(Nat.is_eq(output_delay(M.engine(H.build(H.initial(),152,392,1))),400n),"connected delivery relay changes the real future output delay from800 to400ms")
    require(Nat.is_eq(issued_delay(callbacks(M.engine(world_value(early)))),1600n),"building before issuance captures a1600ms request deadline")
    require(Nat.is_eq(issued_delay(callbacks(M.engine(world_value(late)))),3200n) && Nat.is_eq(issued_delay(callbacks(M.engine(H.build(world_value(late),424,392,0)))),3200n),"building after issuance preserves the already captured3200ms request deadline")
