import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseRules.bend as Rules
import ./DefenseRuleTypes.bend as R
import ./DefenseRulePolicy.bend as P
import ./DefenseMotion.bend as Motion
import ./DefenseMotionTypes.bend as V
import ./DefenseTestSupport.bend as Tests
import ./DefenseMap.bend as Map
import ../../packages/agent-flow-bend/Canonical.bend as C

def counts(items: List<&2,C.Work>,+expected: Nat) -> Bool:
  match items:
    case Nil{}: True{}
    case C.Work{_,_,_,_,_,C.PendingFinding{n},_} <> tail: Nat.is_eq(n,expected) && counts(tail,expected)
    case _ <> tail: counts(tail,expected)
def group_checks(items: List<&2,R.Group>,+expected: U32) -> Bool:
  match items:
    case Nil{}: True{}
    case +group <> tail: U32.is_eq(P.checks(Rules.group_profile(group)),expected) && group_checks(tail,expected)
def fragment_count(items: List<&2,R.Group>) -> Nat:
  match items:
    case Nil{}: 0n
    case +group <> tail: (List.length(&2,R.Fragment,Rules.fragments(group)) + fragment_count(tail) : Nat)
def branched(items: List<&2,R.Group>) -> Bool:
  match items:
    case Nil{}: True{}
    case +group <> tail: Rules.split(group) && branched(tail)
def equal_motion(+a: Map.Point,+b: Map.Point,+rule: U32) -> Bool:
  +pa = Rules.formation(a,rule,4)
  +pb = Rules.formation(b,rule,4)
  U32.is_eq(Map.distance(Map.px(pa),Map.px(pb)),4) && U32.is_eq(Map.py(pa),Map.py(pb))
def checks_move(n: Nat) -> Bool:
  match n:
    case 0n: True{}
    case 1n++k: equal_motion(Map.Point{380,444},Map.Point{384,444},U32.from_nat(k)) && checks_move(k)
def mixed_counts(items: List<&2,R.Group>) -> Bool:
  match items:
    case Nil{}: False{}
    case +group <> tail:
      (Nat.is_gt(P.count(Rules.results(group)),0n) && Nat.is_lt(P.count(Rules.results(group)),4n)) || mixed_counts(tail)
def results_match(items: List<&2,C.Work>,+groups: List<&2,R.Group>) -> Bool:
  match items:
    case Nil{}: True{}
    case +work <> tail:
      match work:
        case C.Work{_,_,_,_,_,C.PendingFinding{count},_}:
          Nat.is_eq(count,Rules.finding_count(Rules.find(Motion.key(work),groups))) && results_match(tail,groups)
        case _: results_match(tail,groups)
def distinct_from(+item: R.Fragment,+key: V.WorkIdentity,+group: R.Group,items: List<&2,R.Fragment>) -> Bool:
  match items:
    case Nil{}: True{}
    case +other <> tail:
      (Motion.same(key,Rules.owner(group)) && U32.is_eq(Rules.fragment_rule(item),Rules.fragment_rule(other)) ||
        Bool.not(Map.same(Rules.fragment_point(item),Rules.fragment_point(other)))) && distinct_from(item,key,group,tail)
def distinct_groups(+item: R.Fragment,+key: V.WorkIdentity,groups: List<&2,R.Group>) -> Bool:
  match groups:
    case Nil{}: True{}
    case +group <> tail: distinct_from(item,key,group,Rules.fragments(group)) && distinct_groups(item,key,tail)
def distinct_fragments(items: List<&2,R.Fragment>,+key: V.WorkIdentity,+all: List<&2,R.Group>) -> Bool:
  match items:
    case Nil{}: True{}
    case +item <> tail: distinct_groups(item,key,all) && distinct_fragments(tail,key,all)
def distinct_all(items: List<&2,R.Group>,+all: List<&2,R.Group>) -> Bool:
  match items:
    case Nil{}: True{}
    case +group <> tail: distinct_fragments(Rules.fragments(group),Rules.owner(group),all) && distinct_all(tail,all)
def no_stack(fuel: Nat,+world: M.World) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n: distinct_all(Rules.groups(M.rules(world)),Rules.groups(M.rules(world))) && no_stack(n,H.tick(world))
def inside_check(found: Maybe<&2,V.Actor>) -> Bool:
  match found:
    case Some{actor}: U32.is_eq(Motion.visible_phase(actor),4)
    case None{}: False{}
def checking_count(items: List<&2,R.Group>,+actors: List<&2,V.Actor>) -> Nat:
  match items:
    case Nil{}: 0n
    case +group <> tail:
      (Bool.pick(Nat,Bool.not(Rules.split(group)) && inside_check(Rules.find_actor(Rules.owner(group),actors)),1n,0n) + checking_count(tail,actors) : Nat)
def seat_distinct(+group: R.Group,items: List<&2,R.Group>,+world: M.World) -> Bool:
  match items:
    case Nil{}: True{}
    case +other <> tail:
      (Motion.same(Rules.owner(group),Rules.owner(other)) || Bool.not(Rules.occupies(other,M.actors(world),M.layout(world))) ||
        Bool.not(U32.is_eq(Rules.seat(group),Rules.seat(other)))) && seat_distinct(group,tail,world)
def seats_safe(items: List<&2,R.Group>,+world: M.World) -> Bool:
  match items:
    case Nil{}: True{}
    case +group <> +tail:
      (Bool.not(Rules.occupies(group,M.actors(world),M.layout(world))) || seat_distinct(group,tail,world)) && seats_safe(tail,world)
def queued_request(items: List<&2,R.Group>,+actors: List<&2,V.Actor>) -> Bool:
  match items:
    case Nil{}: False{}
    case +group <> tail:
      (U32.is_eq(Rules.seat(group),255) && Rules.waiting_for_seat(Rules.find_actor(Rules.owner(group),actors))) || queued_request(tail,actors)
def room_trace(fuel: Nat,+world: M.World,+saw_three: Bool,+saw_queue: Bool) -> Bool:
  match fuel:
    case 0n: saw_three && saw_queue
    case 1n+n:
      +count = checking_count(Rules.groups(M.rules(world)),M.actors(world))
      Nat.is_le(count,3n) && seats_safe(Rules.groups(M.rules(world)),world) &&
        room_trace(n,H.tick(world),saw_three || Nat.is_eq(count,3n),saw_queue || queued_request(Rules.groups(M.rules(world)),M.actors(world)))
def main() -> IO(Unit):
  +burst = H.burst(H.initial(),4)
  +issued = Tests.run(45n,H.start(H.initial()))
  +changed = H.configure_rules(issued,1,0)
  +settled = Tests.run(155n,changed)
  +playback = Tests.run(650n,settled)
  +zero = Tests.run(240n,H.start(H.configure_rules(H.initial(),4,0)))
  +expired = Tests.run(2300n,H.key(H.start(H.initial()),97))
  +mixed_burst = H.burst(H.configure_rules(H.initial(),4,50),4)
  +mixed = Tests.run(700n,H.start(H.configure_rules(H.initial(),4,50)))
  +short: R.Fragment = R.Fragment{0,True{},100,100,[V.Waypoint{120,100,5,0n}]}
  +fast: R.Fragment = R.Fragment{3,True{},100,100,[V.Waypoint{120,100,5,0n}]}
  do IO<Unit>:
    Tests.require(Nat.is_eq(List.length(&2,R.Group,Rules.groups(M.rules(issued))),2n),"two prepared review units issue two requests, each with a rule receipt")
    Tests.require(group_checks(Rules.groups(M.rules(changed)),4) && U32.is_eq(P.checks(Rules.profile(M.rules(changed))),1),"profile changes preserve four captured checks in both started requests")
    Tests.require(Nat.is_eq(List.length(&2,C.Work,M.work(M.core(settled))),2n) && counts(M.work(M.core(settled)),4n),"four findings update each existing result rather than creating four requests")
    Tests.require(branched(Rules.groups(M.rules(playback))) && Nat.is_eq(fragment_count(Rules.groups(M.rules(playback))),8n),"two requests visually fork into eight separate findings")
    Tests.require(no_stack(650n,settled),"separate finding bodies never stack through the Jev fork and retained-room queues")
    Tests.require(U32.is_eq(M.clear(zero),2) && Nat.is_eq(List.length(&2,C.Work,M.work(M.core(zero))),0n),"zero percent sends both actual requests to clear without advice")
    Tests.require(mixed_counts(Rules.groups(M.rules(mixed))) && results_match(M.work(M.core(mixed)),Rules.groups(M.rules(mixed))),"mixed checks choose both branches and canonical finding counts match the captured per-rule results")
    Tests.require(room_trace(1100n,burst,False{},False{}),"eight requests from four edits reach exactly three checking lanes; a fourth queues and no lane is shared")
    Tests.require(no_stack(850n,Tests.run(200n,burst)),"four-edit burst keeps individual finding bodies separate through parallel forks and common output routes")
    Tests.require(no_stack(850n,Tests.run(200n,mixed_burst)),"mixed four-edit burst keeps Clear and Finding bodies distinct after parallel forks")
    Tests.require(Nat.is_eq(List.length(&2,R.Group,Rules.groups(M.rules(Tests.run(2600n,H.key(burst,97))))),0n) && Nat.is_eq(List.length(&2,R.Group,Rules.groups(M.rules(Tests.run(2600n,H.key(mixed_burst,97))))),0n),"all eight requests eventually drain their histories in finding-only and mixed bursts")
    Tests.require(checks_move(4n),"all four checks translate by the same distance inside Jev")
    Tests.require(U32.is_eq(Map.px(Rules.fragment_point(Rules.fragment_move(short))),102) && U32.is_eq(Map.px(Rules.fragment_point(Rules.fragment_move(fast))),105),"finding bodies have independent speeds after the fork")
    Tests.require(Nat.is_eq(List.length(&2,R.Group,Rules.groups(M.rules(expired))),0n),"retired results drain all visual findings and leave no rule-history ghosts")
    Tests.require(Bool.not(Rules.keep_fragment(R.Fragment{0,False{},100,100,[]},False{})) && Rules.keep_fragment(R.Fragment{0,True{},100,100,[]},False{}) && Bool.not(Rules.keep_fragment(R.Fragment{0,True{},100,100,[]},True{})),"clear bodies leave while finding records persist until retirement")
