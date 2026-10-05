# Every accepted frame contributes to the path, including intermediate stages.
import Base
import ../../packages/agent-flow-bend/CollectionState.bend as Collection
import ../../packages/agent-flow-bend/DeliveryState.bend as Delivery
import ../../packages/agent-flow-bend/SubmissionState.bend as Submission
import ./DefensePresentation.bend as Display
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ./DefenseMotionTypes.bend as V
import ./DefenseMap.bend as Map
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def key(work: C.Work) -> V.WorkIdentity:
  match work:
    case C.Work{p,l,r,o,_,_,_}: V.WorkIdentity{p,l,r,o}
def same(a: V.WorkIdentity,b: V.WorkIdentity) -> Bool:
  match a b:
    case V.WorkIdentity{ap,al,ar,ao} V.WorkIdentity{bp,bl,br,bo}:
      Nat.is_eq(ap,bp) && Nat.is_eq(al,bl) && Nat.is_eq(ar,br) && Nat.is_eq(ao,bo)
def phase(work: C.Work) -> U32:
  match work:
    case C.Work{_,_,_,_,_,C.AwaitingSourceRead{},_}: 0
    case C.Work{_,_,_,_,_,C.SourceReading{},_}: 1
    case C.Work{_,_,_,_,_,C.Preparing{},_}: 2
    case C.Work{_,_,_,_,_,C.Reviewing{},_}: 3
    case C.Work{_,_,_,_,_,C.AtJev{},_}: 4
    case _: 5
def family(work: C.Work) -> Nat:
  match work:
    case C.Work{_,_,_,+id,_,_,+parent}: Bool.pick(Nat,Nat.is_eq(parent,0n),id,parent)
def parent(work: C.Work) -> List<&2,V.WorkIdentity>:
  match work:
    case C.Work{p,l,r,_,_,_,+owner}:
      Bool.pick(List<&2,V.WorkIdentity>,Nat.is_eq(owner,0n),[],[V.WorkIdentity{p,l,r,owner}])
def actor_key(actor: V.Actor) -> V.WorkIdentity:
  match actor:
    case V.Actor{k,_,_,_,_,_,_,_,_,_,_,_,released}: k
def point(actor: V.Actor) -> Map.Point:
  match actor:
    case V.Actor{_,_,_,x,y,_,_,_,_,_,_,_,released}: Map.Point{x,y}
def visible_phase(actor: V.Actor) -> U32:
  match actor:
    case V.Actor{_,_,_,_,_,p,_,_,_,_,_,_,released}: p
def observed_phase(actor: V.Actor) -> U32:
  match actor:
    case V.Actor{_,_,_,_,_,_,p,_,_,_,_,_,released}: p
def actor_family(actor: V.Actor) -> Nat:
  match actor:
    case V.Actor{_,f,_,_,_,_,_,_,_,_,_,_,released}: f
def operation(k: V.WorkIdentity) -> Nat:
  match k:
    case V.WorkIdentity{_,_,_,o}: o
def terminal(actor: V.Actor) -> U32:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,_,t,_,_,_,released}: t
def path(actor: V.Actor) -> List<&2,V.Waypoint>:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,p,_,_,_,_,released}: p
def waypoints(points: List<&2,Map.Point>,+p: U32,+at: Nat) -> List<&2,V.Waypoint>:
  match points:
    case Nil{}: []
    case Map.Point{x,y} <> rest: V.Waypoint{x,y,p,at} <> waypoints(rest,p,at)
def route(+layout: U32,p: U32,+lane: U32) -> List<&2,Map.Point>:
  match p:
    case 0: Map.source_route(layout)
    case 1: Map.room_route(layout,1,lane)
    case 2: List.append(&2,Map.Point,Map.preparation_route(layout),Map.room_route(layout,2,lane))
    case 3: Map.review_route(layout,lane)
    case 4: List.append(&2,Map.Point,Map.entry_channel(Map.center(layout,4,lane),Map.entry_side(layout,4,lane)),Map.snake(Map.center(layout,4,lane)))
    case _: List.append(&2,Map.Point,Map.retained_route(layout),Map.room_route(layout,5,lane))
def present(+id: V.WorkIdentity,items: List<&2,C.Work>) -> Bool:
  match items:
    case Nil{}: False{}
    case work <> rest: same(id,key(work)) || present(id,rest)
def work(items: List<&2,C.State>) -> List<&2,C.Work>:
  match items:
    case C.State{_,_,items,_,_,_,_,_,_} <> _: items
    case _: []
def changed(+actor: V.Actor,+item: C.Work,+layout: U32,at: Nat) -> V.Actor:
  match actor:
    case V.Actor{k,f,+lane,x,y,p,seen,steps,t,parent,shown,cause,released}:
      +next = phase(item)
      V.Actor{k,f,lane,x,y,p,next,List.append(&2,V.Waypoint,steps,
        Bool.pick(List<&2,V.Waypoint>,U32.is_eq(seen,next),[],waypoints(List.append(&2,Map.Point,Bool.pick(List<&2,Map.Point>,U32.is_eq(seen,4) && U32.is_eq(next,5),Map.exit_channel(Map.center(layout,4,0),Map.exit_side(layout,4)),[]),route(layout,next,lane)),next,at))),t,parent,shown,cause,released}
def update_one(+actor: V.Actor,items: List<&2,C.Work>,+layout: U32,+at: Nat) -> V.Actor:
  match items:
    case Nil{}: actor
    case +item <> rest:
      Bool.pick(V.Actor,same(actor_key(actor),key(item)),changed(actor,item,layout,at),update_one(actor,rest,layout,at))
# Only positive evidence selects a success exit. Unknown retirement is neutral.
def end_route(+layout: U32,cause: U32) -> List<&2,Map.Point>:
  match cause:
    case 2: List.append(&2,Map.Point,Map.exit_channel(Map.center(layout,4,0),Map.clear_side(layout)),Map.clear_route(layout))
    case 3: Map.delivery_route(layout)
    case _: []
def outcome(actor: V.Actor) -> U32:
  Display.outcome(actor)
def with_outcome(actor: V.Actor,cause: U32) -> V.Actor:
  match actor:
    case V.Actor{k,f,l,x,y,p,seen,steps,t,parent,shown,_,released}:
      V.Actor{k,f,l,x,y,p,seen,steps,t,parent,shown,cause,released}
def member(+id: Nat,items: List<&2,Nat>) -> Bool:
  match items:
    case Nil{}: False{}
    case item <> rest: Nat.is_eq(id,item) || member(id,rest)
def acknowledged(items: List<&2,C.Command>) -> Bool:
  match items:
    case Nil{}: False{}
    case C.FinishRecorded{C.Acknowledged{}} <> _: True{}
    case _ <> rest: acknowledged(rest)
def refused(items: List<&2,C.Command>) -> Bool:
  match items:
    case Nil{}: False{}
    case C.PreparationRefused{} <> _: True{}
    case _ <> rest: refused(rest)
def request_outcome(value: C.RequestOutcome) -> U32:
  match value:
    case C.RequestClear{}: 2
    case C.RequestFinding{}: 0
    case C.RequestTimeout{}: 7
    case C.RequestInterrupted{}: 8
    case C.NeverSent{}: 9
    case _: 4
def finish_matches(k: V.WorkIdentity,group: Nat,round: Nat,selected: List<&2,Nat>) -> Bool:
  match k:
    case V.WorkIdentity{p,_,r,o}: Nat.is_eq(p,group) && Nat.is_eq(r,round) && member(o,selected)
def submission_recorded(items: List<&2,C.Command>) -> Bool:
  match items:
    case Nil{}: False{}
    case C.SubmissionRecorded{} <> _: True{}
    case _ <> rest: submission_recorded(rest)
def witnessed(event: C.CanonicalEvent,commands: List<&2,C.Command>,+actor: V.Actor) -> V.Actor:
  match event:
    case C.JevRequestSettled{p,l,r,o,_,result,_}:
      Bool.pick(V.Actor,same(actor_key(actor),V.WorkIdentity{p,l,r,o}),with_outcome(actor,request_outcome(result)),actor)
    case C.BeginObservedPreparation{p,l,r,o,_}:
      Bool.pick(V.Actor,same(actor_key(actor),V.WorkIdentity{p,l,r,o}),with_outcome(actor,Bool.pick(U32,refused(commands),5,6)),actor)
    case C.PreparationCompleted{p,l,r,o,_}:
      Bool.pick(V.Actor,same(actor_key(actor),V.WorkIdentity{p,l,r,o}),with_outcome(actor,6),actor)
    case C.RetireReview{p,l,r,o}:
      Bool.pick(V.Actor,same(actor_key(actor),V.WorkIdentity{p,l,r,o}),with_outcome(actor,Display.retirement_outcome(outcome(actor))),actor)
    case C.FinishTerminal{group,round,_,_,selected,C.Acknowledged{}}:
      Bool.pick(V.Actor,acknowledged(commands) && finish_matches(actor_key(actor),group,round,selected),with_outcome(actor,3),actor)
    case _: actor
def batches(states: List<&2,C.State>) -> List<&2,Submission.Batch>:
  match states:
    case C.State{_,_,_,_,_,_,_,Collection.State{_,_,_,Delivery.State{_,_,Submission.State{_,items}},_,_,_},_} <> _: items
    case _: []
def submission_matches(k: V.WorkIdentity,+advice: Nat,+token: Nat,items: List<&2,Submission.Batch>) -> Bool:
  match k items:
    case +key Con{Submission.Batch{+a,p,r,+t,_,_,_,_},rest}:
      (Nat.is_eq(a,advice) && Nat.is_eq(t,token) && finish_matches(key,p,r,[a])) || submission_matches(key,advice,token,rest)
    case _ _: False{}
def witnessed_submission(event: C.CanonicalEvent,+commands: List<&2,C.Command>,+actor: V.Actor,before: List<&2,C.State>) -> V.Actor:
  match event:
    case C.SubmissionTerminal{advice,token,certain}:
      Bool.pick(V.Actor,submission_recorded(commands) && submission_matches(actor_key(actor),advice,token,batches(before)),
        with_outcome(actor,Bool.pick(U32,certain,10,11)),actor)
    case _: witnessed(event,commands,actor)
def witnessed_all(+event: C.CanonicalEvent,+commands: List<&2,C.Command>,actors: List<&2,V.Actor>,+before: List<&2,C.Work>,+states: List<&2,C.State>) -> List<&2,V.Actor>:
  match actors:
    case Nil{}: []
    case +actor <> rest:
      Bool.pick(V.Actor,present(actor_key(actor),before),witnessed_submission(event,commands,actor,states),actor) <> witnessed_all(event,commands,rest,before,states)
def retire(actor: V.Actor,layout: U32,at: Nat) -> V.Actor:
  match actor:
    case V.Actor{k,f,l,x,y,p,seen,steps,+t,parent,shown,+cause,released}:
      V.Actor{k,f,l,x,y,p,seen,List.append(&2,V.Waypoint,steps,
        Bool.pick(List<&2,V.Waypoint>,U32.is_eq(t,0),waypoints(end_route(layout,cause),6,at),[])),Bool.pick(U32,U32.is_eq(t,0),30,t),parent,shown,cause,released}
def update(+items: List<&2,C.Work>,actors: List<&2,V.Actor>,+layout: U32,+at: Nat) -> List<&2,V.Actor>:
  match actors:
    case Nil{}: []
    case +actor <> rest:
      Bool.pick(V.Actor,present(actor_key(actor),items),update_one(actor,items,layout,at),retire(actor,layout,at)) <> update(items,rest,layout,at)
def contains(+id: V.WorkIdentity,actors: List<&2,V.Actor>) -> Bool:
  match actors:
    case Nil{}: False{}
    case actor <> rest: same(id,actor_key(actor)) || contains(id,rest)
def birth_point(+layout: U32,p: U32,lane: U32) -> Map.Point:
  match p:
    case 0: Map.first(Map.source_route(layout))
    case 1: Map.entry_port(layout,1,lane)
    case 2: Map.exit_port(layout,1)
    case 3: Map.exit_port(layout,2)
    case 4: Map.entry_port(layout,4,lane)
    case _: Map.entry_port(layout,5,lane)
def birth_actor(+item: C.Work,+layout: U32,+at: Nat,+lane: U32,predecessor: List<&2,V.WorkIdentity>) -> V.Actor:
  +p = phase(item)
  +start = birth_point(layout,p,lane)
  V.Actor{key(item),family(item),lane,Map.px(start),Map.py(start),p,p,waypoints(route(layout,p,lane),p,at),0,predecessor,at,0,False{}}
def born(+item: C.Work,layout: U32,at: Nat) -> V.Actor:
  birth_actor(item,layout,at,0,parent(item))
def charge_bytes(+id: Nat,items: List<&2,Ledger.Charge>) -> Nat:
  match items:
    case Nil{}: 0n
    case Ledger.Charge{charge,_,bytes,_} <> rest:
      Bool.pick(Nat,Nat.is_eq(id,charge),bytes,charge_bytes(id,rest))
def unit_lane(item: C.Work,states: List<&2,C.State>) -> U32:
  match item states:
    case C.Work{_,_,_,_,charge,_,_} Con{C.State{Ledger.Ledger{_,_,charges},_,_,_,_,_,_,_,_},_}:
      Bool.to_u32(Nat.is_eq(charge_bytes(charge,charges),20n))
    case _ _: 0
def predecessor(event: C.CanonicalEvent,item: C.Work) -> List<&2,V.WorkIdentity>:
  match event:
    case C.BeginObservedPreparation{p,l,r,o,_}: [V.WorkIdentity{p,l,r,o}]
    case C.PreparationCompleted{p,l,r,o,_}: [V.WorkIdentity{p,l,r,o}]
    case _: parent(item)
def births(items: List<&2,C.Work>,+actors: List<&2,V.Actor>,+layout: U32,+at: Nat,+states: List<&2,C.State>,+event: C.CanonicalEvent) -> List<&2,V.Actor>:
  match items:
    case Nil{}: actors
    case +item <> rest:
      births(rest,Bool.pick(List<&2,V.Actor>,contains(key(item),actors),actors,
        birth_actor(item,layout,at,unit_lane(item,states),predecessor(event,item)) <> actors),layout,at,states,event)
def frame(frame: T.Frame,actors: List<&2,V.Actor>,+layout: U32) -> List<&2,V.Actor>:
  match frame:
    case T.ProductFrame{_,+at,+event,+before,+after,commands,None{},_}:
      +items = work(after)
      births(items,update(items,witnessed_all(event,commands,actors,work(before),before),layout,at),layout,at,after,event)
    case _: actors
def ingest(frames: List<&2,T.Frame>,actors: List<&2,V.Actor>,+layout: U32) -> List<&2,V.Actor>:
  match frames:
    case Nil{}: actors
    case next <> rest: ingest(rest,frame(next,actors,layout),layout)
def empty(items: List<&2,V.Waypoint>) -> Bool:
  match items:
    case Nil{}: True{}
    case _: False{}
def parent_ready(+owner: V.WorkIdentity,actors: List<&2,V.Actor>) -> Bool:
  match actors:
    case Nil{}: True{}
    case +actor <> rest:
      Bool.pick(Bool,same(owner,actor_key(actor)),empty(path(actor)),parent_ready(owner,rest))
def ready(parent: List<&2,V.WorkIdentity>,actors: List<&2,V.Actor>) -> Bool:
  match parent:
    case Nil{}: True{}
    case owner <> _: parent_ready(owner,actors)
def travel(+start: Map.Point,+target: Map.Point) -> Map.Point:
  Bool.pick(Map.Point,U32.is_eq(Map.px(start),Map.px(target)),
    Map.Point{Map.px(start),Map.travel_coordinate(Map.py(start),Map.py(target),4)},
    Map.Point{Map.travel_coordinate(Map.px(start),Map.px(target),4),Map.py(start)})
def shown_time(actor: V.Actor) -> Nat:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,_,_,_,shown,_,_}: shown
def move_to(actor: V.Actor,target: V.Waypoint,+rest: List<&2,V.Waypoint>) -> V.Actor:
  match actor target:
    case +value V.Waypoint{+tx,+ty,+p,+at}:
      +start = point(value)
      +x = Map.px(start)
      +y = Map.py(start)
      +next = travel(Map.Point{x,y},Map.Point{tx,ty})
      +done = Map.same(next,Map.Point{tx,ty})
      Display.repose(value,Map.px(next),Map.py(next),p,Bool.pick(List<&2,V.Waypoint>,done,rest,V.Waypoint{tx,ty,p,at} <> rest),Bool.pick(Nat,done,at,shown_time(value)))
def advance(actor: V.Actor,steps: List<&2,V.Waypoint>) -> V.Actor:
  match actor steps:
    case V.Actor{k,f,l,x,y,p,seen,_,+t,parent,shown,cause,released} Nil{}:
      V.Actor{k,f,l,x,y,p,seen,[],Bool.pick(U32,U32.is_eq(t,0),0,U32.sub(t,1)),parent,shown,cause,released}
    case value Con{next,rest}: move_to(value,next,rest)
def waiting(actor: V.Actor) -> List<&2,V.WorkIdentity>:
  Display.pending_parent(actor)
def alive(actor: V.Actor) -> Bool:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,steps,+t,_,_,cause,_}:
      Display.keep(Bool.not(empty(steps)),U32.is_eq(cause,6) && (t > 0 : U32),Bool.not(U32.is_eq(t,1)))
def before(a: V.WorkIdentity,b: V.WorkIdentity) -> Bool:
  match a b:
    case V.WorkIdentity{+ap,+al,+ar,ao} V.WorkIdentity{+bp,+bl,+br,bo}:
      (ap < bp : Nat) || (Nat.is_eq(ap,bp) && ((al < bl : Nat) || (Nat.is_eq(al,bl) && ((ar < br : Nat) || (Nat.is_eq(ar,br) && (ao < bo : Nat))))))
def entrance(actor: V.Actor) -> Bool:
  match actor:
    case V.Actor{+k,f,_,x,_,p,_,_,_,_,_,_,released}:
      Nat.is_eq(operation(k),f) && U32.is_eq(p,0)
def entrance_clear(+actor: V.Actor,others: List<&2,V.Actor>) -> Bool:
  match others:
    case Nil{}: True{}
    case +other <> rest:
      Bool.not(before(actor_key(other),actor_key(actor)) && entrance(other) &&
        (Map.segment_length(point(actor),point(other)) < 24 : U32)) && entrance_clear(actor,rest)
# Shared room paths need physical spacing even while Canonical has advanced ahead.
def shared_room(+actor: V.Actor,+other: V.Actor) -> Bool:
  +phase = visible_phase(actor)
  U32.is_eq(phase,visible_phase(other)) && (U32.is_eq(phase,1) || U32.is_eq(phase,2) || U32.is_eq(phase,4) || U32.is_eq(phase,5) || U32.is_eq(phase,3) || U32.is_eq(phase,6))
def branch_clear(+actor: V.Actor,others: List<&2,V.Actor>) -> Bool:
  match others:
    case Nil{}: True{}
    case +other <> rest:
      Bool.not(shared_room(actor,other) && before(actor_key(other),actor_key(actor)) && (Map.segment_length(point(actor),point(other)) < 28 : U32)) && branch_clear(actor,rest)
def can_play(+actor: V.Actor,+all: List<&2,V.Actor>) -> Bool:
  ready(waiting(actor),all) && branch_clear(actor,all) && (Bool.not(entrance(actor)) || entrance_clear(actor,all))
def spatial_blocker(+actor: V.Actor,others: List<&2,V.Actor>) -> List<&2,V.WorkIdentity>:
  match others:
    case Nil{}: []
    case +other <> rest:
      Bool.pick(List<&2,V.WorkIdentity>,before(actor_key(other),actor_key(actor)) &&
        ((shared_room(actor,other) && (Map.segment_length(point(actor),point(other)) < 28 : U32)) ||
         (entrance(actor) && entrance(other) && (Map.segment_length(point(actor),point(other)) < 24 : U32))),
        [actor_key(other)],spatial_blocker(actor,rest))
def wait_kind(+actor: V.Actor,+all: List<&2,V.Actor>) -> U32:
  Display.wait_kind(ready(waiting(actor),all),branch_clear(actor,all) && (Bool.not(entrance(actor)) || entrance_clear(actor,all)),
    Bool.not(empty(path(actor))),U32.is_eq(observed_phase(actor),5) && U32.is_eq(terminal(actor),0))
def released(actor: V.Actor) -> Bool:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,_,_,_,_,_,value}: value
def drawable(+actor: V.Actor,all: List<&2,V.Actor>) -> Bool:
  released(actor) || can_play(actor,all)
def queued(items: List<&2,V.Actor>,+all: List<&2,V.Actor>) -> U32:
  match items:
    case Nil{}: 0
    case actor <> rest: (Bool.to_u32(Bool.not(drawable(actor,all))) + queued(rest,all) : U32)
def move_when(active: Bool,+actor: V.Actor) -> V.Actor:
  match active:
    case True{}: advance(actor,path(actor))
    case False{}: actor
def alive_keep(active: Bool,actor: V.Actor,rest: List<&2,V.Actor>) -> List<&2,V.Actor>:
  match active:
    case True{}: actor <> rest
    case False{}: rest
# One recursive pass. Eager Bool.pick arguments must not duplicate the tail.
def tick(actors: List<&2,V.Actor>,+all: List<&2,V.Actor>) -> List<&2,V.Actor>:
  match actors:
    case Nil{}: []
    case +actor <> rest:
      +next = move_when(can_play(actor,all),actor)
      alive_keep(alive(next),next,tick(rest,all))
def step(+actors: List<&2,V.Actor>) -> List<&2,V.Actor>: tick(actors,actors)
