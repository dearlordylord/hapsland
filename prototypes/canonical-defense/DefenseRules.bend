# Game host interprets actual request receipts; shared NativeRun stays authoritative.
import Base
import ./DefenseRuleTypes.bend as R
import ./DefenseRulePolicy.bend as Policy
import ./DefenseMotionTypes.bend as V
import ./DefenseMotion.bend as Motion
import ./DefenseMap.bend as Map
import ./DefenseModel.bend as M
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/Driver.bend as Driver
import ../../packages/monkey-business-bend/Session.bend as Session
import ../../packages/agent-flow-bend/Canonical.bend as C

def profile(state: R.State) -> R.Profile:
  match state:
    case R.State{value,_}: value
def groups(state: R.State) -> List<&2,R.Group>:
  match state:
    case R.State{_,items}: items
def owner(group: R.Group) -> V.WorkIdentity:
  match group:
    case R.Group{k,_,_,_,_,_,_,_}: k
def results(group: R.Group) -> List<&2,Bool>:
  match group:
    case R.Group{_,_,_,items,_,_,_,_}: items
def group_profile(group: R.Group) -> R.Profile:
  match group:
    case R.Group{_,_,value,_,_,_,_,_}: value
def split(group: R.Group) -> Bool:
  match group:
    case R.Group{_,_,_,_,value,_,_,_}: value
def fragments(group: R.Group) -> List<&2,R.Fragment>:
  match group:
    case R.Group{_,_,_,_,_,items,_,_}: items
def retired(group: R.Group) -> Bool:
  match group:
    case R.Group{_,_,_,_,_,_,value,_}: value
def sent(group: R.Group) -> U32:
  match group:
    case R.Group{_,_,_,_,_,_,_,value}: value
def find(+key: V.WorkIdentity,items: List<&2,R.Group>) -> Maybe<&2,R.Group>:
  match items:
    case Nil{}: None{}
    case +head <> tail: Bool.pick(Maybe<&2,R.Group>,Motion.same(key,owner(head)),Some{head},find(key,tail))
def seed(key: V.WorkIdentity,request: Nat) -> U32:
  match key:
    case V.WorkIdentity{p,l,r,o}:
      Session.seed_hash([M.number(p),M.number(l),M.number(r),M.number(o),M.number(request)],152)
def unique_group(found: Maybe<&2,R.Group>,group: R.Group,items: List<&2,R.Group>) -> List<&2,R.Group>:
  match found:
    case None{}: group <> items
    case Some{_}: items
def captured(receipt: Maybe<&2,Driver.OutcomeReceipt>,+value: R.Profile,+items: List<&2,R.Group>) -> List<&2,R.Group>:
  match receipt:
    case Some{Driver.OutcomeReceipt{+p,+l,+r,+o,+request,C.RequestFinding{},_,_,_,_}}:
      unique_group(find(V.WorkIdentity{p,l,r,o},items),R.Group{V.WorkIdentity{p,l,r,o},request,value,Policy.results(True{},value,seed(V.WorkIdentity{p,l,r,o},request)),False{},[],False{},0},items)
    case Some{Driver.OutcomeReceipt{+p,+l,+r,+o,+request,C.RequestClear{},_,_,_,_}}:
      unique_group(find(V.WorkIdentity{p,l,r,o},items),R.Group{V.WorkIdentity{p,l,r,o},request,value,Policy.results(False{},value,seed(V.WorkIdentity{p,l,r,o},request)),False{},[],False{},0},items)
    case _: items
def contexts(items: List<&2,T.EmissionContext>,+value: R.Profile,groups: List<&2,R.Group>) -> List<&2,R.Group>:
  match items:
    case Nil{}: groups
    case T.EmissionContext{_,receipt} <> tail: contexts(tail,value,captured(receipt,value,groups))
def details(details: T.FrameDetails,value: R.Profile,items: List<&2,R.Group>) -> List<&2,R.Group>:
  match details:
    case T.FrameDetails{_,_,prepared,_,_,_,_,_,_,_}: contexts(prepared,value,items)
def frame(frame: T.Frame,+state: R.State) -> R.State:
  match frame state:
    case T.ProductFrame{_,_,_,_,_,_,None{},detail} R.State{value,items}: R.State{value,details(detail,value,items)}
    case _ _: state
def ingest(frames: List<&2,T.Frame>,state: R.State) -> R.State:
  match frames:
    case Nil{}: state
    case head <> tail: ingest(tail,frame(head,state))
def finding_count(found: Maybe<&2,R.Group>) -> Nat:
  match found:
    case Some{group}: Policy.count(results(group))
    case _: 0n
def count_event(+event: C.CanonicalEvent,+state: R.State) -> List<&2,C.CanonicalEvent>:
  match event:
    case C.JevRequestSettled{p,l,r,o,_,C.RequestFinding{},True{}}:
      [C.FindingCountUpdated{p,l,r,o,finding_count(find(V.WorkIdentity{p,l,r,o},groups(state)))}]
    case _: []
def count_frames(frames: List<&2,T.Frame>,+state: R.State) -> List<&2,C.CanonicalEvent>:
  match frames:
    case Nil{}: []
    case T.ProductFrame{_,_,event,_,_,_,None{},_} <> tail:
      List.append(&2,C.CanonicalEvent,count_event(event,state),count_frames(tail,state))
    case _ <> tail: count_frames(tail,state)
def count_supported(event: C.CanonicalEvent,+work: List<&2,C.Work>) -> Bool:
  match event work:
    case C.FindingCountUpdated{+p,+l,+r,+o,+n} C.Work{wp,wl,wr,wo,_,C.PendingFinding{_},_} <> tail:
      (Nat.is_gt(n,0n) && Motion.same(V.WorkIdentity{p,l,r,o},V.WorkIdentity{wp,wl,wr,wo})) || count_supported(event,tail)
    case _ _ <> tail: count_supported(event,tail)
    case _ Nil{}: False{}
def enqueue_count(supported: Bool,+state: T.State,event: C.CanonicalEvent) -> T.State:
  match supported:
    case True{}: Run.enqueue(state,Run.clock(state),T.Event{Driver.Action{event,0n,None{},False{},None{}},None{},None{},None{}})
    case False{}: state
def enqueue_counts(events: List<&2,C.CanonicalEvent>,+state: T.State) -> T.State:
  match events:
    case Nil{}: state
    case +event <> tail:
      enqueue_counts(tail,enqueue_count(count_supported(event,M.work(M.canonical(Run.observe(state)))),state,event))
def append_advance(frames: List<&2,T.Frame>,physical: List<&2,T.PhysicalDelivery>,advanced: T.Advanced) -> T.Advanced:
  match advanced:
    case T.Advanced{state,extra,later}:
      T.Advanced{state,List.append(&2,T.Frame,frames,extra),List.append(&2,T.PhysicalDelivery,physical,later)}

def count_advance(events: List<&2,C.CanonicalEvent>,advanced: T.Advanced) -> T.Advanced:
  match events advanced:
    case Nil{} value: value
    case items T.Advanced{+state,frames,physical}:
      append_advance(frames,physical,Run.advance(enqueue_counts(items,state),32n,Run.clock(state)))
def apply_counts(+advanced: T.Advanced,rules: R.State) -> T.Advanced:
  match advanced:
    case T.Advanced{_,frames,_}: count_advance(count_frames(frames,rules),advanced)

# Compact translated formation follows a single request's path and clock.
def formation(+point: Map.Point,+rule: U32,+total: U32) -> Map.Point:
  +columns = U32.min(4,total)
  +rows = ((total + 3) / 4 : U32)
  Map.Point{M.sub((Map.px(point) + (rule % 4 : U32) * 8 : U32),((columns - 1) * 4 : U32)),
    M.sub((Map.py(point) + (rule / 4 : U32) * 8 : U32),((rows - 1) * 4 : U32))}
def next_phase(steps: List<&2,V.Waypoint>) -> U32:
  match steps:
    case V.Waypoint{_,_,p,_} <> _: p
    case _: 255
def fork_ready(+actor: V.Actor) -> Bool:
  U32.is_eq(Motion.visible_phase(actor),4) && Bool.not(U32.is_eq(next_phase(Motion.path(actor)),4)) &&
    (U32.is_eq(next_phase(Motion.path(actor)),5) || U32.is_eq(Motion.outcome(actor),2))
def fragment_path(hit: Bool,+actor: V.Actor,+layout: U32) -> List<&2,V.Waypoint>:
  match hit:
    case True{}: Motion.path(actor)
    case False{}: Motion.waypoints(Motion.end_route(layout,2),6,Motion.shown_time(actor))
def born_fragments(items: List<&2,Bool>,+actor: V.Actor,+layout: U32,+total: U32,+index: U32) -> List<&2,R.Fragment>:
  match items:
    case Nil{}: []
    case +hit <> tail:
      +point = formation(Motion.point(actor),index,total)
      R.Fragment{index,hit,Map.px(point),Map.py(point),fragment_path(hit,actor,layout)} <>
        born_fragments(tail,actor,layout,total,(index + 1 : U32))
def find_actor(+key: V.WorkIdentity,actors: List<&2,V.Actor>) -> Maybe<&2,V.Actor>:
  match actors:
    case Nil{}: None{}
    case +actor <> tail: Bool.pick(Maybe<&2,V.Actor>,Motion.same(key,Motion.actor_key(actor)),Some{actor},find_actor(key,tail))
def fragment_rule(item: R.Fragment) -> U32:
  match item:
    case R.Fragment{rule,_,_,_,_}: rule
def fragment_hit(item: R.Fragment) -> Bool:
  match item:
    case R.Fragment{_,hit,_,_,_}: hit
def fragment_point(item: R.Fragment) -> Map.Point:
  match item:
    case R.Fragment{_,_,x,y,_}: Map.Point{x,y}
def fragment_steps(item: R.Fragment) -> List<&2,V.Waypoint>:
  match item:
    case R.Fragment{_,_,_,_,steps}: steps
def fragment_speed(+rule: U32) -> U32: (2 + rule % 4 : U32)
def fragment_move(item: R.Fragment) -> R.Fragment:
  match item:
    case R.Fragment{+rule,hit,+x,+y,V.Waypoint{+tx,+ty,p,at} <> +tail}:
      +nx = Bool.pick(U32,U32.is_eq(x,tx),x,Map.travel_coordinate(x,tx,fragment_speed(rule)))
      +ny = Bool.pick(U32,U32.is_eq(x,tx),Map.travel_coordinate(y,ty,fragment_speed(rule)),y)
      R.Fragment{rule,hit,nx,ny,Bool.pick(List<&2,V.Waypoint>,U32.is_eq(nx,tx) && U32.is_eq(ny,ty),tail,V.Waypoint{tx,ty,p,at} <> tail)}
    case value: value
def keep_fragment(+item: R.Fragment,retired: Bool) -> Bool:
  Bool.not(Motion.empty(fragment_steps(item))) || (fragment_hit(item) && Bool.not(retired))
def fragment_when(keep: Bool,item: R.Fragment,tail: List<&2,R.Fragment>) -> List<&2,R.Fragment>:
  match keep:
    case True{}: item <> tail
    case False{}: tail
def remaining_distance(+item: R.Fragment,steps: List<&2,V.Waypoint>) -> U32:
  match steps:
    case V.Waypoint{x,y,_,_} <> _: Map.segment_length(fragment_point(item),Map.Point{x,y})
    case _: 0
def leads(+item: R.Fragment,+key: V.WorkIdentity,+other: R.Fragment,+other_key: V.WorkIdentity) -> Bool:
  +left = List.length(&2,V.Waypoint,fragment_steps(other))
  +right = List.length(&2,V.Waypoint,fragment_steps(item))
  +ld = remaining_distance(other,fragment_steps(other))
  +rd = remaining_distance(item,fragment_steps(item))
  (left < right : Nat) || (Nat.is_eq(left,right) && ((ld < rd : U32) || (U32.is_eq(ld,rd) &&
    (Motion.before(other_key,key) || (Motion.same(other_key,key) && (fragment_rule(other) < fragment_rule(item) : U32))))))
def fragment_blocked(+item: R.Fragment,+key: V.WorkIdentity,+other: R.Group,items: List<&2,R.Fragment>) -> Bool:
  match items:
    case Nil{}: False{}
    case +head <> tail:
      (leads(item,key,head,owner(other)) &&
        ((fragment_hit(head) && fragment_hit(item)) || (Bool.not(fragment_hit(head)) && Bool.not(fragment_hit(item)))) &&
        ((Map.segment_length(fragment_point(fragment_move(item)),fragment_point(head)) < 8 : U32) ||
         (Map.segment_length(fragment_point(fragment_move(item)),fragment_point(fragment_move(head))) < 8 : U32))) || fragment_blocked(item,key,other,tail)
def blocked(+item: R.Fragment,+key: V.WorkIdentity,items: List<&2,R.Group>) -> Bool:
  match items:
    case Nil{}: False{}
    case +group <> tail: fragment_blocked(item,key,group,fragments(group)) || blocked(item,key,tail)
def move_fragment(allowed: Bool,item: R.Fragment) -> R.Fragment:
  match allowed:
    case True{}: fragment_move(item)
    case False{}: item
def tick_fragments(items: List<&2,R.Fragment>,+retired: Bool,+key: V.WorkIdentity,+all: List<&2,R.Group>) -> List<&2,R.Fragment>:
  match items:
    case Nil{}: []
    case +head <> tail:
      +next = move_fragment(Bool.not(blocked(head,key,all)),head)
      fragment_when(keep_fragment(next,retired),next,tick_fragments(tail,retired,key,all))
def actor_sent(+actor: V.Actor,previous: U32) -> U32:
  Bool.pick(U32,U32.is_eq(Motion.outcome(actor),10) || U32.is_eq(Motion.outcome(actor),11),Motion.outcome(actor),previous)
def update_group(group: R.Group,found: Maybe<&2,V.Actor>,layout: U32,+all: List<&2,R.Group>) -> R.Group:
  match group found:
    case R.Group{k,request,+value,+items,False{},_,+dead,status} Some{+actor}:
      R.Group{k,request,value,items,fork_ready(actor),Bool.pick(List<&2,R.Fragment>,fork_ready(actor),born_fragments(items,actor,layout,Policy.checks(value),0),[]),dead,actor_sent(actor,status)}
    case R.Group{+k,request,value,items,True{},fragments,+dead,status} Some{+actor}:
      R.Group{k,request,value,items,True{},tick_fragments(fragments,dead,k,all),dead,actor_sent(actor,status)}
    case R.Group{+k,request,value,items,on,fragments,_,status} None{}:
      R.Group{k,request,value,items,on,tick_fragments(fragments,True{},k,all),True{},status}
def keep_group(+group: R.Group) -> Bool:
  Bool.not(retired(group)) || Nat.is_gt(List.length(&2,R.Fragment,fragments(group)),0n)
def group_when(keep: Bool,group: R.Group,tail: List<&2,R.Group>) -> List<&2,R.Group>:
  match keep:
    case True{}: group <> tail
    case False{}: tail
def tick_groups(items: List<&2,R.Group>,+actors: List<&2,V.Actor>,+layout: U32,+all: List<&2,R.Group>) -> List<&2,R.Group>:
  match items:
    case Nil{}: []
    case +group <> tail:
      +next = update_group(group,find_actor(owner(group),actors),layout,all)
      group_when(keep_group(next),next,tick_groups(tail,actors,layout,all))
def tick(+world: M.World) -> M.World:
  M.with_rules(world,R.State{profile(M.rules(world)),tick_groups(groups(M.rules(world)),M.actors(world),M.layout(world),groups(M.rules(world)))})
def fragments_inside(items: List<&2,R.Fragment>,+center: Map.Point) -> Bool:
  match items:
    case Nil{}: False{}
    case item <> tail: Map.in_building_rect(fragment_point(item),center) || fragments_inside(tail,center)
def room_busy(items: List<&2,R.Group>,+key: V.WorkIdentity,+center: Map.Point) -> Bool:
  match items:
    case Nil{}: False{}
    case +group <> tail:
      (Bool.not(Motion.same(key,owner(group))) && split(group) && fragments_inside(fragments(group),center)) || room_busy(tail,key,center)
def actors_in_jev(items: List<&2,V.Actor>,+key: V.WorkIdentity) -> Bool:
  match items:
    case Nil{}: False{}
    case +actor <> tail:
      (Bool.not(Motion.same(key,Motion.actor_key(actor))) && U32.is_eq(Motion.visible_phase(actor),4)) || actors_in_jev(tail,key)
def can_move_actor(+actor: V.Actor,+world: M.World) -> Bool:
  Bool.not(U32.is_eq(Motion.visible_phase(actor),3) && U32.is_eq(next_phase(Motion.path(actor)),4) &&
    (room_busy(groups(M.rules(world)),Motion.actor_key(actor),Map.center(M.layout(world),4,0)) || actors_in_jev(M.actors(world),Motion.actor_key(actor))))
def actor_steps(items: List<&2,V.Actor>,+world: M.World,+all: List<&2,V.Actor>) -> List<&2,V.Actor>:
  match items:
    case Nil{}: []
    case +actor <> tail:
      +next = Motion.move_when(Motion.can_play(actor,all) && can_move_actor(actor,world),actor)
      Motion.alive_keep(Motion.alive(next),next,actor_steps(tail,world,all))
def step_actors(+world: M.World) -> M.World:
  M.with_actors(world,actor_steps(M.actors(world),world,M.actors(world)))
def controlled(world: M.World,result: T.Controlled) -> M.World:
  match result:
    case T.Controlled{state,_}: M.with_engine(world,state)
def configured(+world: M.World,+value: R.Profile) -> M.World:
  M.with_engine(M.with_rules(world,R.State{value,groups(M.rules(world))}),
    M.engine(controlled(world,Run.control(M.engine(world),T.JevProfile{M.base_jev(M.settings(world)),Policy.weights(value)}))))
