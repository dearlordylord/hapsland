# Actual Host playback drains after business completion and preserves cue distinctions.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseCues.bend as Cues
import ./DefenseConsumerTests.bend as Tests
import ./DefenseConsumer.bend as Consumer
import ./DefenseTowerTests.bend as Towers
import ./DefenseStartupTests.bend as Startup
import ./DefenseMotionTypes.bend as V
import ./DefenseMotionTests.bend as MotionTests
import ./DefenseMotion.bend as Motion
import ./DefenseMap.bend as Map

def cue_live(items: List<&2,M.Cue>,+kind: U32) -> Bool:
  match items:
    case Nil{}: False{}
    case cue <> tail: U32.is_eq(M.cue_kind(cue),kind) || cue_live(tail,kind)
def defeated(world: M.World) -> M.World:
  match world:
    case M.World{a,b,c,d,e,f,_,h,i,j,k,l,m,n,o,p,q,r,s,t}:
      M.World{a,b,c,d,e,f,0,h,i,j,k,l,m,n,o,p,q,r,s,t}
def first_visible(items: List<&2,V.Actor>,+all: List<&2,V.Actor>) -> V.Actor:
  match items:
    case Nil{}: MotionTests.single([])
    case +actor <> rest: Bool.pick(V.Actor,Motion.drawable(actor,all),actor,first_visible(rest,all))
def defeat_playback() -> Bool:
  +before = defeated(H.tick(H.start(H.initial())))
  +after = H.tick(before)
  U32.is_eq(M.time(before),M.time(after)) && Bool.not(Map.same(Motion.point(first_visible(M.actors(before),M.actors(before))),Motion.point(first_visible(M.actors(after),M.actors(after)))))
def world_value(items: List<&2,M.World>) -> M.World:
  match items:
    case world <> _: world
    case _: H.initial()
def main() -> IO(Unit):
  +start: List<&2,M.World> = [H.burst(H.initial(),6)]
  +clear: List<&2,M.World> = [H.key(H.start(H.initial_config(Towers.forced_config(Consumer.config()),152n)),97)]
  +business_done: List<&2,M.World> = [Tests.run(300n,world_value(clear))]
  +shown: List<&2,M.World> = [Tests.run(1600n,world_value(business_done))]
  do IO<Unit>:
    Tests.require(defeat_playback(),"defeat stops business time while accepted visual paths keep moving")
    Tests.require(cue_live(M.cues(world_value(start)),0) && U32.is_eq(M.offered(world_value(start)),0),"manual release confirms queued edits before actual admission")
    Tests.require(cue_live(M.cues(H.tick(world_value(start))),1),"actual admission has a separate observable cue")
    Tests.require(H.drained(world_value(business_done)) && (List.length(&2,V.Actor,M.actors(world_value(business_done))) > 0n : Nat),"business completion retains unfinished visual paths")
    Tests.require(Nat.is_eq(List.length(&2,V.Actor,M.actors(world_value(shown))),0n),"completed work disappears only after its path and terminal cue finish")
    Tests.require(Startup.route_check(1000n,world_value(start)),"six-edit fan-out preserves continuous surviving actor positions")
    Tests.require((List.length(&2,M.Cue,M.cues(H.burst(world_value(start),20))) <= 2n : Nat),"rapid release feedback remains bounded to two notifications")
