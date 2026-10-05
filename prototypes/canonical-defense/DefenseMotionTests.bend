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
    case _: V.Actor{V.WorkIdentity{0n,0n,0n,0n},0n,0,0,0,0,0,[],0,[],0n,0,False{}}
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
def settlement(+result: C.RequestOutcome) -> V.Actor:
  Motion.witnessed(C.JevRequestSettled{1n,1n,1n,7n,9n,result,True{}},[],
    Motion.born(C.Work{1n,1n,1n,7n,7n,C.AtJev{},1n},0,0n))
def neutral_retirement() -> Bool:
  +actor = Motion.born(C.Work{1n,1n,1n,7n,7n,C.PendingFinding{1n},1n},0,0n)
  +retired = Motion.retire(actor,0,10n)
  U32.is_eq(Motion.outcome(retired),0) && Nat.is_eq(List.length(&2,V.Waypoint,Motion.path(actor)),List.length(&2,V.Waypoint,Motion.path(retired)))
def predecessor_matches(items: List<&2,V.WorkIdentity>) -> Bool:
  match items:
    case owner <> _: Motion.same(owner,V.WorkIdentity{1n,1n,1n,5n})
    case _: False{}
def preparation_predecessor() -> Bool:
  predecessor_matches(Motion.predecessor(C.PreparationCompleted{1n,1n,1n,5n,[10n,20n]},C.Work{1n,1n,1n,7n,7n,C.Reviewing{},1n}))
def steps(fuel: Nat,actors: List<&2,V.Actor>) -> List<&2,V.Actor>:
  match fuel:
    case 0n: actors
    case 1n+n: steps(n,Motion.step(actors))
def separated_pair(+items: List<&2,V.Actor>) -> Bool:
  match items:
    case +a <> +b <> _:
      Motion.drawable(a,items) && Motion.drawable(b,items) && (Map.segment_length(Motion.point(a),Motion.point(b)) >= 24 : U32)
    case _: False{}
def siblings(+layout: U32) -> Bool:
  separated_pair(steps(30n,[Motion.birth_actor(C.Work{1n,1n,1n,7n,7n,C.Reviewing{},1n},layout,0n,0,[]),Motion.birth_actor(C.Work{1n,1n,1n,8n,8n,C.Reviewing{},1n},layout,0n,1,[])]))
def service_stays_inside(+layout: U32) -> Bool:
  Map.same(Map.last(Motion.route(layout,4,0)),Map.last(Map.snake(Map.center(layout,4,0))))
def blocked_stays_visible() -> Bool:
  +actor = single(Motion.step([Motion.birth_actor(C.Work{1n,1n,1n,7n,7n,C.Reviewing{},1n},0,0n,0,[])]))
  +leader = Motion.birth_actor(C.Work{1n,1n,1n,6n,6n,C.Reviewing{},1n},0,0n,0,[])
  Bool.not(Motion.can_play(actor,[leader,actor])) && Motion.drawable(actor,[leader,actor])
def edit_roads(+layout: U32) -> Bool:
  separated_pair(steps(30n,[Motion.birth_actor(C.Work{1n,1n,1n,7n,7n,C.Reviewing{},1n},layout,0n,0,[]),Motion.birth_actor(C.Work{1n,1n,1n,8n,8n,C.Reviewing{},2n},layout,0n,1,[])]))
def retained_queue() -> Bool:
  +leader: V.Actor = V.Actor{V.WorkIdentity{1n,1n,1n,7n},1n,0,116,476,5,5,[],0,[],0n,0,True{}}
  +follower: V.Actor = V.Actor{V.WorkIdentity{1n,1n,1n,8n},2n,0,116,504,5,5,[V.Waypoint{116,476,5,0n}],0,[],0n,0,True{}}
  separated_pair(steps(30n,[leader,follower]))
def main() -> IO(Unit):
  do IO<Unit>:
    require(retained_at_same_pose(0) && retained_at_same_pose(1) && retained_at_same_pose(2),"rapid stage changes append history without replacing the current pose")
    require(continuous(200n,history(0)) && continuous(200n,history(1)) && continuous(200n,history(2)),"all maps preserve bounded continuous movement through queued stages")
    require(Bool.not(Motion.same(V.WorkIdentity{1n,1n,1n,7n},V.WorkIdentity{2n,1n,1n,7n})),"equal operation numbers in different partitions remain distinct actors")
    require(U32.is_eq(Motion.outcome(settlement(C.RequestClear{})),2),"clear exit requires an explicit clear settlement")
    require(Bool.not(U32.is_eq(Motion.outcome(settlement(C.RequestBackendFailure{})),2)),"backend failure cannot become a clear exit")
    require(neutral_retirement(),"finding retirement without acknowledgement adds no delivery route")
    require(preparation_predecessor(),"review children follow preparation rather than source family identity")
    require(siblings(0) && siblings(1) && siblings(2),"two units of one edit remain separately visible after preparation on every map")
    require(service_stays_inside(0) && service_stays_inside(1) && service_stays_inside(2),"Jev service path stays inside until a finding or clear chooses its exit")
    require(blocked_stays_visible(),"an already visible child remains drawn while a sibling blocks movement")
    require(visible_after_first_tick(),"actual Host accepted frames produce visible presentation actors")
    require(retained_queue(),"retained findings from different edits queue visibly instead of stacking at the room exit")
    require(edit_roads(0) && edit_roads(1) && edit_roads(2),"units from different edits remain distinct on shared road segments on every map")
