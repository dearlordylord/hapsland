# Startup and movement regression after the continuous NativeRun migration.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseMap.bend as Map
import ./DefenseEffects.bend as E
import ./DefenseConsumerTests.bend as ConsumerTests

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def at_entrance(+world: M.World,items: List<&2,P.Token>) -> Bool:
  match items:
    case Nil{}: False{}
    case +token <> _:
      U32.is_eq(P.phase(token),0) && Map.in_range(H.unit_point(world,token),Map.path_position(Map.source_route(M.layout(world)),0),2)
def first_visible(fuel: Nat,+world: M.World) -> Bool:
  match fuel:
    case 0n: False{}
    case 1n+n:
      Bool.pick(Bool,Nat.is_eq(List.length(&2,P.Token,P.tokens(world)),0n),first_visible(n,H.tick(world)),at_entrance(world,P.tokens(world)))
def find_token(+operation: U32,items: List<&2,P.Token>) -> Maybe<&2,P.Token>:
  match items:
    case Nil{}: None{}
    case +token <> rest:
      Bool.pick(Maybe<&2,P.Token>,U32.is_eq(operation,P.id(token)),Some{token},find_token(operation,rest))
def nearby(+world: M.World,next: M.World,token: P.Token,found: Maybe<&2,P.Token>) -> Bool:
  match found:
    case None{}: True{}
    case Some{other}: Map.in_range(H.unit_point(world,token),H.unit_point(next,other),16)
def continuous(items: List<&2,P.Token>,+world: M.World,+next: M.World) -> Bool:
  match items:
    case Nil{}: True{}
    case +token <> rest:
      nearby(world,next,token,find_token(P.id(token),P.tokens(next))) && continuous(rest,world,next)
def route_check(fuel: Nat,+world: M.World) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n:
      +next = H.tick(world)
      E.transition_ready(world,M.core(next)) && continuous(P.tokens(world),world,next) && route_check(n,next)
def jev_age(items: List<&2,P.Token>,+world: M.World) -> U32:
  match items:
    case Nil{}: 0
    case +token <> rest:
      U32.max(Bool.pick(U32,U32.is_eq(P.phase(token),4),E.age(U32.to_nat(P.id(token)),4,M.timers(world)),0),jev_age(rest,world))
def peak_jev_age(fuel: Nat,+world: M.World,+oldest: U32) -> U32:
  match fuel:
    case 0n: oldest
    case 1n+n:
      peak_jev_age(n,ConsumerTests.run(100n,world),U32.max(oldest,jev_age(P.tokens(world),world)))
def main() -> IO(Unit):
  +origin = H.initial()
  +idle = ConsumerTests.run(100n,origin)
  +built = H.build(origin,424,232,1)
  +built_idle = ConsumerTests.run(100n,built)
  do IO<Unit>:
    require(U32.is_eq(M.time(idle),0) && U32.is_eq(M.offered(idle),0) && Nat.is_eq(List.length(&2,P.Token,P.tokens(idle)),0n),"startup waits for N/Enter without advancing or spawning")
    require(U32.is_eq(M.time(built_idle),0) && U32.is_eq(M.offered(built_idle),0) && U32.is_eq(M.gold(built_idle),105),"building before N/Enter does not start the workload")
    require(first_visible(100n,H.key(origin,110)),"N starts with the first visible mob at the entrance")
    require(first_visible(100n,H.key(origin,13)),"Enter also starts with the first visible mob at the entrance")
    require(U32.is_eq(M.time(ConsumerTests.run(100n,H.key(H.key(origin,110),114))),0),"restart returns to construction before N/Enter")
    require(route_check(1600n,H.key(origin,110)),"stage changes and child spawns wait for exits; surviving mobs move at most16 pixels per tick")
    require((M.time(ConsumerTests.run(1600n,H.key(origin,110))) >= 1600 : U32),"route check advances the game instead of freezing")
    require((P.count(ConsumerTests.run(1600n,H.key(origin,110)),4) > 0 : U32),"mobs reach Jev through earlier stages instead of remaining at the entrance")
    require((peak_jev_age(120n,H.key(origin,110),0) < 1000 : U32),"recurring workload cannot strand mobs in AtJev for1000 ticks over12000 ticks")
    IO.print("GAME STARTUP regression checks complete")
