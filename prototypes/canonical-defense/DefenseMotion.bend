# Every accepted frame contributes to the path, including intermediate stages.
import Base
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
    case V.Actor{k,_,_,_,_,_,_,_,_,_,_}: k
def point(actor: V.Actor) -> Map.Point:
  match actor:
    case V.Actor{_,_,_,x,y,_,_,_,_,_,_}: Map.Point{x,y}
def visible_phase(actor: V.Actor) -> U32:
  match actor:
    case V.Actor{_,_,_,_,_,p,_,_,_,_,_}: p
def observed_phase(actor: V.Actor) -> U32:
  match actor:
    case V.Actor{_,_,_,_,_,_,p,_,_,_,_}: p
def actor_family(actor: V.Actor) -> Nat:
  match actor:
    case V.Actor{_,f,_,_,_,_,_,_,_,_,_}: f
def operation(k: V.WorkIdentity) -> Nat:
  match k:
    case V.WorkIdentity{_,_,_,o}: o
def terminal(actor: V.Actor) -> U32:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,_,t,_,_}: t
def path(actor: V.Actor) -> List<&2,V.Waypoint>:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,p,_,_,_}: p
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
    case 4: Map.room_route(layout,4,lane)
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
    case V.Actor{k,f,+lane,x,y,p,seen,steps,t,parent,shown}:
      +next = phase(item)
      V.Actor{k,f,lane,x,y,p,next,List.append(&2,V.Waypoint,steps,
        Bool.pick(List<&2,V.Waypoint>,U32.is_eq(seen,next),[],waypoints(route(layout,next,lane),next,at))),t,parent,shown}
def update_one(+actor: V.Actor,items: List<&2,C.Work>,+layout: U32,+at: Nat) -> V.Actor:
  match items:
    case Nil{}: actor
    case +item <> rest:
      Bool.pick(V.Actor,same(actor_key(actor),key(item)),changed(actor,item,layout,at),update_one(actor,rest,layout,at))
def end_route(+layout: U32,p: U32) -> List<&2,Map.Point>:
  match p:
    case 4: Map.clear_route(layout)
    case 5: Map.delivery_route(layout)
    case _: []
def retire(actor: V.Actor,layout: U32,at: Nat) -> V.Actor:
  match actor:
    case V.Actor{k,f,l,x,y,p,+seen,steps,+t,parent,shown}:
      V.Actor{k,f,l,x,y,p,seen,List.append(&2,V.Waypoint,steps,
        Bool.pick(List<&2,V.Waypoint>,U32.is_eq(t,0),waypoints(end_route(layout,seen),6,at),[])),Bool.pick(U32,U32.is_eq(t,0),30,t),parent,shown}
def update(+items: List<&2,C.Work>,actors: List<&2,V.Actor>,+layout: U32,+at: Nat) -> List<&2,V.Actor>:
  match actors:
    case Nil{}: []
    case +actor <> rest:
      Bool.pick(V.Actor,present(actor_key(actor),items),update_one(actor,items,layout,at),retire(actor,layout,at)) <> update(items,rest,layout,at)
def contains(+id: V.WorkIdentity,actors: List<&2,V.Actor>) -> Bool:
  match actors:
    case Nil{}: False{}
    case actor <> rest: same(id,actor_key(actor)) || contains(id,rest)
def born(+item: C.Work,+layout: U32,+at: Nat) -> V.Actor:
  +p = phase(item)
  +start = Bool.pick(Map.Point,U32.is_eq(p,0),Map.first(Map.source_route(layout)),Map.exit_port(layout,1))
  V.Actor{key(item),family(item),0,Map.px(start),Map.py(start),p,p,waypoints(route(layout,p,0),p,at),0,parent(item),at}
def births(items: List<&2,C.Work>,+actors: List<&2,V.Actor>,+layout: U32,+at: Nat) -> List<&2,V.Actor>:
  match items:
    case Nil{}: actors
    case +item <> rest:
      births(rest,Bool.pick(List<&2,V.Actor>,contains(key(item),actors),actors,born(item,layout,at) <> actors),layout,at)
def frame(frame: T.Frame,actors: List<&2,V.Actor>,+layout: U32) -> List<&2,V.Actor>:
  match frame:
    case T.ProductFrame{_,+at,_,_,after,_,None{},_}:
      +items = work(after)
      births(items,update(items,actors,layout,at),layout,at)
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
def move_to(actor: V.Actor,target: V.Waypoint,+rest: List<&2,V.Waypoint>) -> V.Actor:
  match actor target:
    case V.Actor{k,f,l,+x,+y,_,seen,_,t,_,shown} V.Waypoint{+tx,+ty,+p,+at}:
      +next = travel(Map.Point{x,y},Map.Point{tx,ty})
      +done = Map.same(next,Map.Point{tx,ty})
      V.Actor{k,f,l,Map.px(next),Map.py(next),p,seen,Bool.pick(List<&2,V.Waypoint>,done,rest,V.Waypoint{tx,ty,p,at} <> rest),t,[],Bool.pick(Nat,done,at,shown)}
def advance(actor: V.Actor,steps: List<&2,V.Waypoint>) -> V.Actor:
  match actor steps:
    case V.Actor{k,f,l,x,y,p,seen,_,+t,parent,shown} Nil{}:
      V.Actor{k,f,l,x,y,p,seen,[],Bool.pick(U32,U32.is_eq(t,0),0,U32.sub(t,1)),parent,shown}
    case value Con{next,rest}: move_to(value,next,rest)
def waiting(actor: V.Actor) -> List<&2,V.WorkIdentity>:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,_,_,parent,_}: parent
def alive(actor: V.Actor) -> Bool:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,steps,t,_,_}: Bool.not(U32.is_eq(t,1)) || Bool.not(empty(steps))
def before(a: V.WorkIdentity,b: V.WorkIdentity) -> Bool:
  match a b:
    case V.WorkIdentity{+ap,+al,+ar,ao} V.WorkIdentity{+bp,+bl,+br,bo}:
      (ap < bp : Nat) || (Nat.is_eq(ap,bp) && ((al < bl : Nat) || (Nat.is_eq(al,bl) && ((ar < br : Nat) || (Nat.is_eq(ar,br) && (ao < bo : Nat))))))
def entrance(actor: V.Actor) -> Bool:
  match actor:
    case V.Actor{+k,f,_,x,_,p,_,_,_,_,_}:
      Nat.is_eq(operation(k),f) && U32.is_eq(p,0)
def entrance_clear(+actor: V.Actor,others: List<&2,V.Actor>) -> Bool:
  match others:
    case Nil{}: True{}
    case +other <> rest:
      Bool.not(before(actor_key(other),actor_key(actor)) && entrance(other) &&
        (Map.segment_length(point(actor),point(other)) < 24 : U32)) && entrance_clear(actor,rest)
def can_play(+actor: V.Actor,+all: List<&2,V.Actor>) -> Bool:
  ready(waiting(actor),all) && (Bool.not(entrance(actor)) || entrance_clear(actor,all))
def drawable(+actor: V.Actor,all: List<&2,V.Actor>) -> Bool:
  can_play(actor,all)
def queued(items: List<&2,V.Actor>,+all: List<&2,V.Actor>) -> U32:
  match items:
    case Nil{}: 0
    case actor <> rest: (Bool.to_u32(Bool.not(drawable(actor,all))) + queued(rest,all) : U32)
def tick(actors: List<&2,V.Actor>,+all: List<&2,V.Actor>) -> List<&2,V.Actor>:
  match actors:
    case Nil{}: []
    case +actor <> +rest:
      +next = Bool.pick(V.Actor,can_play(actor,all),advance(actor,path(actor)),actor)
      Bool.pick(List<&2,V.Actor>,alive(next),next <> tick(rest,all),tick(rest,all))
def step(+actors: List<&2,V.Actor>) -> List<&2,V.Actor>: tick(actors,actors)
