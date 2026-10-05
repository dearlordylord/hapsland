# Read-only work facts and geometry. Tower interventions belong to DefenseMechanics.
import Base
import ./DefenseMechanics.bend as Mechanics
import ./DefenseModel.bend as M
import ./DefenseMap.bend as Map
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ./DefenseProjection.bend as P

def cost(kind: U32) -> U32: Mechanics.cost(kind)
def name(kind: U32) -> String: Mechanics.name(kind)
def detail(kind: U32) -> String: Mechanics.detail(kind)
def range(kind: U32,level: U32) -> U32: Mechanics.range(kind,level)
def power(kind: U32,level: U32) -> U32: level
def cooldown(kind: U32) -> U32: 0
def upgrade_cost(level: U32) -> U32: (20 + level * 20 : U32)

def pick_timer(found: Bool, current: M.Timer, fallback: M.Timer) -> M.Timer:
  match found:
    case True{}: current
    case False{}: fallback

def find_timer(+id: Nat, items: List<&2, M.Timer>) -> M.Timer:
  match items:
    case Nil{}: M.Timer{id, 0, 0, id, 100, 1, 0, 0, 0}
    case +item <> rest:
      pick_timer(Nat.is_eq(id, M.timer_id(item)), item, find_timer(id, rest))
def age(+id: Nat, +phase: U32, items: List<&2, M.Timer>) -> U32:
  +timer = find_timer(id, items)
  Bool.pick(U32, U32.is_eq(M.timer_phase(timer), phase), M.timer_age(timer), 0)
def family(work: C.Work) -> Nat:
  match work:
    case C.Work{_, _, _, id, _, _, +parent}:
      Bool.pick(Nat, Nat.is_eq(parent, 0n), id, parent)
def id(work: C.Work) -> Nat:
  match work:
    case C.Work{_, _, _, id, _, _, _}: id
def kind(work: C.Work) -> U32:
  match work:
    case C.Work{_, _, _, _, _, kind, _}: M.phase(kind)
def queued(state: Dispatch.State) -> List<&2, Dispatch.Entry>:
  match state:
    case Dispatch.State{items, _, _, _, _}: items
def running(state: Dispatch.State) -> List<&2, Dispatch.Entry>:
  match state:
    case Dispatch.State{_, items, _, _, _}: items
def requests(state: Dispatch.State) -> List<&2, Dispatch.Request>:
  match state:
    case Dispatch.State{_, _, _, _, items}: items
def started(+id: Nat, items: List<&2, Dispatch.Request>) -> Bool:
  match items:
    case Nil{}: False{}
    case Dispatch.Request{_, _, _, op, _, start, _} <> rest:
      Bool.or(Bool.and(Nat.is_eq(id, op), start), started(id, rest))
def active_kind(+core: C.State, +part: Nat, +life: Nat, +round: Nat,
    +id: Nat, parent: Nat, kind: C.WorkKind) -> Bool:
  match kind:
    case C.SourceReading{}: Dispatch.contains(running(M.dispatch(core)), part, life, round, id)
    case C.Preparing{}: Dispatch.contains(running(M.dispatch(core)), part, life, round, parent)
    case C.AtJev{}: started(id, requests(M.dispatch(core)))
    case C.PendingFinding{_}: True{}
    case _: False{}
def inside(+core: C.State, work: C.Work) -> Bool:
  match work:
    case C.Work{+part, +life, +round, +id, _, +kind, +parent}:
      Bool.and(active_kind(core, part, life, round, id, parent, kind),
        Bool.not(Bool.or(Dispatch.contains(queued(M.dispatch(core)), part, life, round, id),
          Dispatch.contains(queued(M.dispatch(core)), part, life, round, parent))))

def bytes(+world: M.World, work: C.Work) -> Nat:
  match work:
    case C.Work{_, _, _, _, charge, _, _}: P.charge_bytes(charge, P.charges(P.ledger(M.core(world))))
def lane(+world: M.World, work: C.Work) -> U32:
  Bool.pick(U32, Nat.is_eq(bytes(world, work), 20n), 1, 0)
def anchor(+world: M.World, +work: C.Work) -> Map.Point:
  Map.center(M.layout(world), kind(work), lane(world, work))
def id_of(work: C.Work) -> Nat: id(work)
def review_rank(items: List<&2,C.Work>,+world: M.World,+id: Nat,+side: U32) -> U32:
  match items:
    case Nil{}: 0
    case +other <> rest:
      (Bool.to_u32((M.number(id_of(other)) < M.number(id) : U32) && (Bool.not(U32.is_eq(M.layout(world),1)) || U32.is_eq(lane(world,other),side)) && (U32.is_eq(kind(other),3) || U32.is_eq(kind(other),4))) + review_rank(rest,world,id,side) : U32)

def jev_delay(+world: M.World,+work: C.Work) -> U32:
  Bool.pick(U32,U32.is_eq(kind(work),4),(M.timer_gap(find_timer(id(work),M.timers(world))) / 8 : U32),0)
def duration(+world: M.World, +work: C.Work) -> U32:
  match work:
    case C.Work{_, _, _, _, _, C.AwaitingSourceRead{}, _}: Map.path_length(Map.source_route(M.layout(world)))
    case C.Work{_, _, _, _, _, C.SourceReading{}, _}: 60
    case C.Work{_, _, _, _, _, C.Preparing{}, _}: 176
    case C.Work{_, _, _, _, _, C.Reviewing{}, _}: Map.path_length(Map.review_route(M.layout(world), lane(world, work)))
    case C.Work{_, _, _, _, _, C.AtJev{}, _}: (Bool.pick(U32, U32.is_eq(lane(world, work), 0), 160, 240) + jev_delay(world,work) : U32)
    case C.Work{_, _, _, _, _, C.PendingFinding{_}, _}:
      (Map.path_length(Map.retained_route(M.layout(world))) + Map.path_length(Map.room_route(M.layout(world),5,0)) : U32)
    case _: 0

# Road progress and service effort share the same permanent acceleration.
def progress(+world: M.World, +work: C.Work) -> U32:
  (Bool.pick(U32,U32.is_eq(kind(work),4),M.timer_service_age(find_timer(id(work),M.timers(world))),age(id(work),kind(work),M.timers(world))) + M.timer_boost(find_timer(id(work), M.timers(world))) : U32)
def effort(+world: M.World, +work: C.Work) -> U32:
  M.sub(progress(world, work), Bool.pick(U32, U32.is_eq(kind(work), 2), Map.path_length(Map.preparation_route(M.layout(world))), jev_delay(world,work)))
def remaining(+world: M.World, +work: C.Work) -> U32:
  M.sub((duration(world, work) + Bool.pick(U32, U32.is_eq(kind(work), 2), Map.path_length(Map.preparation_route(M.layout(world))), 0) : U32), progress(world, work))
def inside_world(+world: M.World, +work: C.Work) -> Bool:
  Bool.and(inside(M.core(world), work),
    Bool.pick(Bool, U32.is_eq(kind(work), 1), (effort(world, work) < duration(world,work) : U32),
      Bool.pick(Bool, U32.is_eq(kind(work), 2), (progress(world, work) >= Map.path_length(Map.preparation_route(M.layout(world))) : U32),
        Bool.pick(Bool, U32.is_eq(kind(work), 5), (age(id(work), 5, M.timers(world)) >= Map.path_length(Map.retained_route(M.layout(world))) : U32), True{}))))

def service_point(+world: M.World,+work: C.Work) -> Map.Point:
  +room = Map.room_route(M.layout(world),kind(work),lane(world,work))
  +duration = M.sub(duration(world,work),jev_delay(world,work))
  Map.path_position(room,((U32.min(duration,effort(world,work)) * Map.path_length(room)) / U32.max(1,duration) : U32))
def service_or_road(inside: Bool,+world: M.World,+work: C.Work,road: List<&2,Map.Point>,age: U32) -> Map.Point:
  match inside:
    case True{}: service_point(world,work)
    case False{}: Map.path_position(road,age)
def retained_point(onRoad: Bool,+world: M.World,road: List<&2,Map.Point>,age: U32) -> Map.Point:
  match onRoad:
    case True{}: Map.path_position(road,age)
    case False{}:
      +room = Map.room_route(M.layout(world),5,0)
      Map.path_position(room,U32.min(Map.path_length(room),M.sub(age,Map.path_length(road))))
def jev_mode(+world: M.World,+work: C.Work) -> U32:
  Bool.pick(U32,U32.is_eq(kind(work),4),Bool.pick(U32,started(id(work),requests(M.dispatch(M.core(world)))),Bool.pick(U32,U32.is_eq(remaining(world,work),0),2,0),1),0)
def jev_wait_point(mode: U32,+world: M.World,+work: C.Work) -> Map.Point:
  match mode:
    case 0: service_point(world,work)
    case 1: Map.entry_port(M.layout(world),4,lane(world,work))
    case _: Map.exit_port(M.layout(world),4)
def jev_point(inside: Bool,+world: M.World,+work: C.Work) -> Map.Point:
  +gap = M.timer_gap(find_timer(id(work),M.timers(world)))
  +age = progress(world,work)
  +road = Map.review_route(M.layout(world),lane(world,work))
  Bool.pick(Map.Point,(age * 8 < gap : U32),Map.path_position(road,M.sub(Map.path_length(road),M.sub(gap,(age * 8 : U32)))),jev_wait_point(jev_mode(world,work),world,work))
def review_waiting(+world: M.World,+work: C.Work) -> Bool:
  U32.is_eq(kind(work),3) && (progress(world,work) >= M.sub(duration(world,work),M.timer_gap(find_timer(id(work),M.timers(world)))) : U32)
def point_phase(phase: U32,+world: M.World,+work: C.Work,+age: U32) -> Map.Point:
  match phase:
    case 0: Map.path_position(Map.source_route(M.layout(world)),age)
    case 2: service_or_road((age >= Map.path_length(Map.preparation_route(M.layout(world))) : U32),world,work,Map.preparation_route(M.layout(world)),age)
    case 3: Map.path_position(Map.review_route(M.layout(world),lane(world,work)),U32.min(age,M.sub(duration(world,work),M.timer_gap(find_timer(id(work),M.timers(world))))))
    case 4: jev_point(inside_world(world,work),world,work)
    case 5: retained_point((age < Map.path_length(Map.retained_route(M.layout(world))) : U32),world,Map.retained_route(M.layout(world)),age)
    case _: service_point(world,work)
def point_work(+world: M.World,+work: C.Work) -> Map.Point:
  point_phase(kind(work),world,work,progress(world,work))

def supports(+world: M.World,+tower: M.Tower,phase: U32) -> Bool:
  Mechanics.connected(world,tower) && U32.is_eq(phase,Mechanics.site(M.tkind(tower)))
def permits(world: M.World,phase: U32) -> U32: M.number(Dispatch.max_running())

def pending_sibling(+parent: Nat, items: List<&2, C.Work>) -> Bool:
  match items:
    case Nil{}: False{}
    case C.Work{_, _, _, _, _, C.PendingFinding{_}, owner} <> rest:
      Bool.or(Nat.is_eq(parent, owner), pending_sibling(parent, rest))
    case _ <> rest: pending_sibling(parent, rest)
def target(world: M.World,tower: M.Tower) -> Nat: 0n
def find_work(+operation: Nat, items: List<&2, C.Work>) -> Maybe<&2, C.Work>:
  match items:
    case Nil{}: None{}
    case +work <> rest:
      Bool.pick(Maybe<&2, C.Work>, Nat.is_eq(operation, id(work)), Some{work}, find_work(operation, rest))

def has_timer(+id: Nat, items: List<&2, M.Timer>) -> Bool:
  match items:
    case Nil{}: False{}
    case M.Timer{candidate, _, _, _, _, _, _, _, _} <> rest:
      Bool.or(Nat.is_eq(id, candidate), has_timer(id, rest))
def timer_next(+world: M.World, +work: C.Work, offered: U32) -> M.Timer:
  +current = find_timer(id(work), M.timers(world))
  +owner = find_timer(family(work), M.timers(world))
  +known = has_timer(id(work), M.timers(world))
  +seed = Bool.pick(U32, known, M.timer_seed(current),
    Bool.pick(U32, U32.is_eq(kind(work), 0), offered,
      Bool.pick(U32, U32.is_eq(kind(work), 3),
        ((M.timer_seed(owner) * 17 + (lane(world, work) + 1) * 47) % 100 : U32), M.timer_seed(owner))))
  +gap = Bool.pick(U32,U32.is_eq(kind(work),3) && Bool.not(known),(review_rank(M.work(M.core(world)),world,id(work),lane(world,work)) * 32 : U32),M.timer_gap(current))
  +service = Bool.pick(U32,U32.is_eq(kind(work),4) && started(id(work),requests(M.dispatch(M.core(world)))),(M.timer_service_age(current) + 1 : U32),0)
  M.Timer{id(work), kind(work), (age(id(work), kind(work), M.timers(world)) + 1 : U32), family(work),
    Bool.pick(U32, known, M.timer_risk(current), Bool.pick(U32, U32.is_eq(kind(work), 0), 100, M.timer_risk(owner))),
    seed, Bool.pick(U32, U32.is_eq(M.timer_phase(current), kind(work)), M.timer_boost(current), 0),gap,service}
def current_timers(items: List<&2, C.Work>, +world: M.World, +offered: U32) -> List<&2, M.Timer>:
  match items:
    case Nil{}: Nil{}
    case +work <> rest: timer_next(world, work, offered) <> current_timers(rest, world, offered)
def id_found(+operation: Nat, items: List<&2, C.Work>) -> Nat:
  match items:
    case Nil{}: 0n
    case C.Work{_, _, _, +id, _, _, _} <> rest: Bool.pick(Nat, Nat.is_eq(operation, id), id, id_found(operation, rest))
# New children copy risk/seed from the pre-event parent timer in current_timers.
# Once that refresh completes, no removed operation needs historical metadata.
def refresh(+world: M.World, +core: C.State, offered: U32) -> List<&2, M.Timer>:
  current_timers(M.work(core),world,offered)
