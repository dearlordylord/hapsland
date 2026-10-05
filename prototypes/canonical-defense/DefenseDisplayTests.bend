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

def cue_live(items: List<&2,M.Cue>,+kind: U32) -> Bool:
  match items:
    case Nil{}: False{}
    case cue <> tail: U32.is_eq(M.cue_kind(cue),kind) || cue_live(tail,kind)
def main() -> IO(Unit):
  +start = H.burst(H.initial(),6)
  +clear = H.key(H.start(H.initial_config(Towers.forced_config(Consumer.config()),152n)),97)
  +business_done = Tests.run(300n,clear)
  +shown = Tests.run(1600n,business_done)
  do IO<Unit>:
    Tests.require(cue_live(M.cues(start),0) && U32.is_eq(M.offered(start),0),"manual release confirms queued edits before actual admission")
    Tests.require(cue_live(M.cues(H.tick(start)),1),"actual admission has a separate observable cue")
    Tests.require(H.drained(business_done) && (List.length(&2,V.Actor,M.actors(business_done)) > 0n : Nat),"business completion retains unfinished visual paths")
    Tests.require(Nat.is_eq(List.length(&2,V.Actor,M.actors(shown)),0n),"completed work disappears only after its path and terminal cue finish")
    Tests.require(Startup.route_check(1000n,start),"six-edit fan-out preserves continuous surviving actor positions")
    Tests.require((List.length(&2,M.Cue,M.cues(H.burst(start,20))) <= 2n : Nat),"rapid release feedback remains bounded to two notifications")
