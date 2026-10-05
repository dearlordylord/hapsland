# Startup and continuous playback at the actual game Host boundary.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseMotion.bend as Motion
import ./DefenseMotionTypes.bend as V
import ./DefenseMap.bend as Map
import ./DefenseProjection.bend as P
import ./DefenseConsumerTests.bend as ConsumerTests

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def at_entrance(+world: M.World,items: List<&2,V.Actor>) -> Bool:
  match items:
    case Nil{}: False{}
    case +actor <> rest:
      (U32.is_eq(Motion.visible_phase(actor),0) && Map.in_range(Motion.point(actor),Map.first(Map.source_route(M.layout(world))),4)) || at_entrance(world,rest)
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
# Pairwise checks carry only visible entrance coordinates, not full actor histories.
def entrance_keep(on: Bool,actor: V.Actor,rest: List<&2,Map.Point>) -> List<&2,Map.Point>:
  match on:
    case True{}: Motion.point(actor) <> rest
    case False{}: rest
def entrance_at(phase: U32,+actor: V.Actor,all: List<&2,V.Actor>,rest: List<&2,Map.Point>) -> List<&2,Map.Point>:
  match phase:
    case 0: entrance_keep(Motion.drawable(actor,all),actor,rest)
    case _: rest
def entrance_points(items: List<&2,V.Actor>,+all: List<&2,V.Actor>) -> List<&2,Map.Point>:
  match items:
    case Nil{}: []
    case +actor <> rest: entrance_at(Motion.visible_phase(actor),actor,all,entrance_points(rest,all))
def point_separated(+point: Map.Point,items: List<&2,Map.Point>) -> Bool:
  match items:
    case Nil{}: True{}
    case other <> rest: (Map.segment_length(point,other) >= 24 : U32) && point_separated(point,rest)
def points_separated(items: List<&2,Map.Point>) -> Bool:
  match items:
    case Nil{}: True{}
    case point <> +rest: point_separated(point,rest) && points_separated(rest)
def separated(items: List<&2,V.Actor>,all: List<&2,V.Actor>) -> Bool:
  points_separated(entrance_points(items,all))
def burst_check(fuel: Nat,+world: M.World) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n:
      separated(M.actors(world),M.actors(world)) && burst_check(n,H.tick(world))
def world_value(items: List<&2,M.World>) -> M.World:
  match items:
    case world <> _: world
    case _: H.initial()
def main() -> IO(Unit):
  +origin: List<&2,M.World> = [H.initial()]
  +idle: List<&2,M.World> = [ConsumerTests.run(100n,world_value(origin))]
  +built: List<&2,M.World> = [H.build(world_value(origin),424,392,0)]
  +six: List<&2,M.World> = [H.burst(world_value(origin),6)]
  +queued: List<&2,M.World> = [H.tick(world_value(six))]
  do IO<Unit>:
    require(U32.is_eq(M.time(world_value(idle)),0) && U32.is_eq(M.offered(world_value(idle)),0),"startup waits for N/Enter without advancing or spawning")
    require(U32.is_eq(M.time(ConsumerTests.run(100n,world_value(built))),0) && U32.is_eq(M.gold(world_value(built)),100),"building before N does not start the workload")
    require(at_entrance(H.tick(H.key(world_value(origin),110)),M.actors(H.tick(H.key(world_value(origin),110)))) && at_entrance(H.tick(H.key(world_value(origin),13)),M.actors(H.tick(H.key(world_value(origin),13)))),"N and Enter start visible playback at the entrance")
    require(route_check(1000n,H.start(world_value(origin))),"accepted stage changes preserve every surviving visible actor within4 pixels per tick")
    require((M.offered(world_value(queued)) >= 6 : U32) && (Motion.queued(M.actors(world_value(queued)),M.actors(world_value(queued))) >= 5 : U32),"manual burst is accepted immediately while its visual bodies queue separately")
    require(burst_check(140n,world_value(six)),"six simultaneous edits preserve24 pixel entrance spacing without delaying business admission")
    require(U32.is_eq(M.burst_size(M.settings(H.key(H.key(world_value(origin),98),98))),10),"B selects a batch of10 edits for the next manual release")
