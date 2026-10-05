# Observable presentation behavior; fixed examples, not universal proofs.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseMotion.bend as Motion
import ./DefenseMotionTypes.bend as V
import ./DefenseMap.bend as Map
import ../../packages/agent-flow-bend/Canonical.bend as C

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def single(items: List<&2,V.Actor>) -> V.Actor:
  match items:
    case actor <> _: actor
    case _: V.Actor{V.WorkIdentity{0n,0n,0n,0n},0n,0,0,0,0,0,[],0,[],0n}
def moved(+before: V.Actor,+after: V.Actor) -> Bool:
  (Map.segment_length(Motion.point(before),Motion.point(after)) <= 4 : U32)
def continuous(fuel: Nat,+actor: V.Actor) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n:
      +next = single(Motion.step([actor]))
      moved(actor,next) && continuous(n,next)
def history(+layout: U32) -> V.Actor:
  +initial = Motion.born(C.Work{1n,1n,1n,1n,1n,C.AwaitingSourceRead{},0n},layout,0n)
  +source = Motion.changed(initial,C.Work{1n,1n,1n,1n,1n,C.SourceReading{},0n},layout,1n)
  Motion.changed(source,C.Work{1n,1n,1n,1n,1n,C.Preparing{},0n},layout,2n)
def retained_at_same_pose(+layout: U32) -> Bool:
  +initial = Motion.born(C.Work{1n,1n,1n,1n,1n,C.AwaitingSourceRead{},0n},layout,0n)
  +next = history(layout)
  Map.same(Motion.point(initial),Motion.point(next)) && (List.length(&2,V.Waypoint,Motion.path(next)) > 10n : Nat)
def visible_after_first_tick() -> Bool:
  (List.length(&2,V.Actor,M.actors(H.tick(H.start(H.initial())))) > 0n : Nat)
def main() -> IO(Unit):
  do IO<Unit>:
    require(retained_at_same_pose(0) && retained_at_same_pose(1) && retained_at_same_pose(2),"rapid stage changes append history without replacing the current pose")
    require(continuous(200n,history(0)) && continuous(200n,history(1)) && continuous(200n,history(2)),"all maps preserve bounded continuous movement through queued stages")
    require(Bool.not(Motion.same(V.WorkIdentity{1n,1n,1n,7n},V.WorkIdentity{2n,1n,1n,7n})),"equal operation numbers in different partitions remain distinct actors")
    require(visible_after_first_tick(),"actual Host accepted frames produce visible presentation actors")
