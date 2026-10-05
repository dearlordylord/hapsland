# Shared fixture helpers only: no independent test executable is imported by another.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseMotion.bend as Motion
import ./DefenseMotionTypes.bend as V
import ./DefenseMap.bend as Map
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/agent-flow-bend/Canonical.bend as C

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def tick_boxed(worlds: List<&2,M.World>, rest: List<&2,M.World> -> List<&2,M.World>) -> List<&2,M.World>:
  match worlds:
    case world <> Nil{}: rest([H.tick(world)])
    case _: []
def run_boxed(fuel: Nat,worlds: List<&2,M.World>) -> List<&2,M.World>:
  match fuel:
    case 0n: worlds
    case 1n+n: tick_boxed(worlds,next => run_boxed(n,next))
def run_result(worlds: List<&2,M.World>,original: M.World) -> M.World:
  match worlds:
    case world <> Nil{}: world
    case _: original
def run(fuel: Nat,+world: M.World) -> M.World:
  run_result(run_boxed(fuel,[world]),world)
def forced_environment(env: T.Environment) -> T.Environment:
  match env:
    case T.Environment{a,_,c,d,e,f,g,h,i,j,k,l,m,n}:
      T.Environment{a,Some{C.RequestClear{}},c,d,e,f,g,h,i,j,k,l,m,n}
def forced_config(config: T.Config) -> T.Config:
  match config:
    case T.Config{a,b,env,d}: T.Config{a,b,forced_environment(env),d}
def find(+id: V.WorkIdentity,items: List<&2,V.Actor>) -> Maybe<&2,V.Actor>:
  match items:
    case Nil{}: None{}
    case +actor <> rest: Bool.pick(Maybe<&2,V.Actor>,Motion.same(id,Motion.actor_key(actor)),Some{actor},find(id,rest))
def nearby(before: V.Actor,after: Maybe<&2,V.Actor>) -> Bool:
  match after:
    case None{}: True{}
    case Some{next}: (Map.segment_length(Motion.point(before),Motion.point(next)) <= 4 : U32)
def continuous(items: List<&2,V.Actor>,+next: List<&2,V.Actor>) -> Bool:
  match items:
    case Nil{}: True{}
    case +actor <> rest: nearby(actor,find(Motion.actor_key(actor),next)) && continuous(rest,next)
def route_check(fuel: Nat,+world: M.World) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n:
      +next = H.tick(world)
      continuous(M.actors(world),M.actors(next)) && route_check(n,next)
def single(items: List<&2,V.Actor>) -> V.Actor:
  match items:
    case actor <> _: actor
    case _: V.Actor{V.WorkIdentity{0n,0n,0n,0n},0n,0,0,0,0,0,[],0,[],0n,0,False{}}
