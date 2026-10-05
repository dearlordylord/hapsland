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
def separated_from(+actor: V.Actor,others: List<&2,V.Actor>,+all: List<&2,V.Actor>) -> Bool:
  match others:
    case Nil{}: True{}
    case +other <> rest:
      Bool.not(U32.is_eq(Motion.visible_phase(actor),0) && U32.is_eq(Motion.visible_phase(other),0) &&
        Motion.drawable(actor,all) && Motion.drawable(other,all) && (Map.segment_length(Motion.point(actor),Motion.point(other)) < 24 : U32)) && separated_from(actor,rest,all)
def separated(items: List<&2,V.Actor>,+all: List<&2,V.Actor>) -> Bool:
  match items:
    case Nil{}: True{}
    case +actor <> +rest: separated_from(actor,rest,all) && separated(rest,all)
def burst_check(fuel: Nat,+world: M.World) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n:
      separated(M.actors(world),M.actors(world)) && burst_check(n,H.tick(world))
def main() -> IO(Unit):
  +origin = H.initial()
  +idle = ConsumerTests.run(100n,origin)
  +built = H.build(origin,424,392,0)
  +six = H.burst(origin,6)
  +queued = H.tick(six)
  do IO<Unit>:
    require(U32.is_eq(M.time(idle),0) && U32.is_eq(M.offered(idle),0),"startup waits for N/Enter without advancing or spawning")
    require(U32.is_eq(M.time(ConsumerTests.run(100n,built)),0) && U32.is_eq(M.gold(built),100),"building before N does not start the workload")
    require(at_entrance(H.tick(H.key(origin,110)),M.actors(H.tick(H.key(origin,110)))) && at_entrance(H.tick(H.key(origin,13)),M.actors(H.tick(H.key(origin,13)))),"N and Enter start visible playback at the entrance")
    require(route_check(1000n,H.start(origin)),"accepted stage changes preserve every surviving visible actor within4 pixels per tick")
    require((M.offered(queued) >= 6 : U32) && (Motion.queued(M.actors(queued),M.actors(queued)) >= 5 : U32),"manual burst is accepted immediately while its visual bodies queue separately")
    require(burst_check(140n,six),"six simultaneous edits preserve24 pixel entrance spacing without delaying business admission")
    require(U32.is_eq(M.burst_size(M.settings(H.key(H.key(origin,98),98))),10),"B selects a batch of10 edits for the next manual release")
