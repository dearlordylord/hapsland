# Synthetic latency and quality effects; no product queue state is defined here.
import Base
import ./DefenseModel.bend as M
import ./DefenseMap.bend as Map
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ./DefenseProjection.bend as P

def cost(kind: U32) -> U32:
  match kind:
    case 0: 35
    case 1: 55
    case 2: 45
    case 3: 70
    case 4: 35
    case 5: 60
    case _: 50
def name(kind: U32) -> String:
  match kind:
    case 0: "RAPID"
    case 1: "REFINER"
    case 2: "RELAY"
    case 3: "PARALLELIZER"
    case 4: "COORDINATOR"
    case 5: "PACKAGER"
    case _: "SHIELD"
def detail(kind: U32) -> String:
  match kind:
    case 0: "ROAD OR ACTIVE WORK -12 / 8 TICKS"
    case 1: "RISK -15% OF CURRENT / FLOOR60%"
    case 2: "LONG RANGE ROAD / ACTIVE WORK -6 / 12 TICKS"
    case 3: "LOCAL HOST PERMITS +1 WITHIN CORE MAX8"
    case 4: "UNFINISHED SIBLING WORK -9 / 8 TICKS"
    case 5: "REAL NEXT OUTPUT BATCH TARGET +1"
    case _: "FINITE240 CHARGE / HALF PRESSURE MAX"
def range(+kind: U32, level: U32) -> U32:
  (Bool.pick(U32, U32.is_eq(kind, 0), 96,
    Bool.pick(U32, U32.is_eq(kind, 1), 110,
      Bool.pick(U32, U32.is_eq(kind, 2), 150, 112))) + level * 10 : U32)
def power(kind: U32, level: U32) -> U32:
  match kind:
    case 0: (8 + level * 4 : U32)
    case 1: (10 + level * 5 : U32)
    case 2: (4 + level * 2 : U32)
    case 4: (6 + level * 3 : U32)
    case _: 0
# Synthetic balance: irreducible findings remain; repeated prevention has diminishing returns.
def risk_floor() -> U32: 60
def risk_reduction(+risk: U32,power: U32) -> U32:
  U32.min(M.sub(risk,risk_floor()),((risk * power) / 100 : U32))
def cooldown(kind: U32) -> U32:
  match kind:
    case 1: 90
    case 2: 12
    case _: 8
def upgrade_cost(level: U32) -> U32:
  (20 + level * 20 : U32)

def pick_timer(found: Bool, current: M.Timer, fallback: M.Timer) -> M.Timer:
  match found:
    case True{}: current
    case False{}: fallback

def find_timer(+id: Nat, items: List<&2, M.Timer>) -> M.Timer:
  match items:
    case Nil{}: M.Timer{id, 0, 0, id, 100, 1, 0}
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
def duration(+world: M.World, +work: C.Work) -> U32:
  match work:
    case C.Work{_, _, _, _, _, C.AwaitingSourceRead{}, _}: Map.path_length(Map.source_route(M.layout(world)))
    case C.Work{_, _, _, _, _, C.SourceReading{}, _}: 60
    case C.Work{_, _, _, _, _, C.Preparing{}, _}: 176
    case C.Work{_, _, _, _, _, C.Reviewing{}, _}: Map.path_length(Map.review_route(M.layout(world), lane(world, work)))
    case C.Work{_, _, _, _, _, C.AtJev{}, _}: Bool.pick(U32, U32.is_eq(lane(world, work), 0), 160, 240)
    case C.Work{_, _, _, _, _, C.PendingFinding{_}, _}:
      (Map.path_length(Map.retained_route(M.layout(world))) + Map.path_length(Map.room_route(M.layout(world),5,0)) : U32)
    case _: 0

# Road progress and service effort share the same permanent acceleration.
def progress(+world: M.World, +work: C.Work) -> U32:
  (age(id(work), kind(work), M.timers(world)) + M.timer_boost(find_timer(id(work), M.timers(world))) : U32)
def effort(+world: M.World, +work: C.Work) -> U32:
  M.sub(progress(world, work), Bool.pick(U32, U32.is_eq(kind(work), 2), Map.path_length(Map.preparation_route(M.layout(world))), 0))
def remaining(+world: M.World, +work: C.Work) -> U32:
  M.sub((duration(world, work) + Bool.pick(U32, U32.is_eq(kind(work), 2), Map.path_length(Map.preparation_route(M.layout(world))), 0) : U32), progress(world, work))
def inside_world(+world: M.World, +work: C.Work) -> Bool:
  Bool.and(inside(M.core(world), work),
    Bool.pick(Bool, U32.is_eq(kind(work), 1), (effort(world, work) < duration(world,work) : U32),
      Bool.pick(Bool, U32.is_eq(kind(work), 2), (progress(world, work) >= Map.path_length(Map.preparation_route(M.layout(world))) : U32),
        Bool.pick(Bool, U32.is_eq(kind(work), 5), (age(id(work), 5, M.timers(world)) >= Map.path_length(Map.retained_route(M.layout(world))) : U32), True{}))))

def service_point(+world: M.World,+work: C.Work) -> Map.Point:
  +room = Map.room_route(M.layout(world),kind(work),lane(world,work))
  +duration = duration(world,work)
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
def jev_point(inside: Bool,+world: M.World,+work: C.Work) -> Map.Point:
  match inside:
    case True{}: service_point(world,work)
    case False{}:
      +anchor = anchor(world,work)
      Map.Point{(Map.px(anchor) + 32 : U32),Map.py(anchor)}
def review_waiting(+world: M.World,+work: C.Work) -> Bool:
  U32.is_eq(kind(work),3) && U32.is_eq(remaining(world,work),0)
def id_of(work: C.Work) -> Nat: id(work)
def review_rank(items: List<&2,C.Work>,+world: M.World,+id: Nat,+side: U32) -> U32:
  match items:
    case Nil{}: 0
    case +other <> rest:
      (Bool.to_u32((M.number(id_of(other)) < M.number(id) : U32) && U32.is_eq(lane(world,other),side) && review_waiting(world,other)) + review_rank(rest,world,id,side) : U32)
def point_phase(phase: U32,+world: M.World,+work: C.Work,+age: U32) -> Map.Point:
  match phase:
    case 0: Map.path_position(Map.source_route(M.layout(world)),age)
    case 2: service_or_road((age >= Map.path_length(Map.preparation_route(M.layout(world))) : U32),world,work,Map.preparation_route(M.layout(world)),age)
    case 3: Map.path_position(Map.review_route(M.layout(world),lane(world,work)),Bool.pick(U32,review_waiting(world,work),M.sub(duration(world,work),(review_rank(M.work(M.core(world)),world,id(work),lane(world,work)) * 12 : U32)),age))
    case 4: jev_point(inside_world(world,work),world,work)
    case 5: retained_point((age < Map.path_length(Map.retained_route(M.layout(world))) : U32),world,Map.retained_route(M.layout(world)),age)
    case _: service_point(world,work)
def point_work(+world: M.World,+work: C.Work) -> Map.Point:
  point_phase(kind(work),world,work,progress(world,work))

def supports(+world: M.World, +tower: M.Tower, phase: U32) -> Bool:
  Map.in_range(Map.Point{M.tx(tower), M.ty(tower)}, Map.center(M.layout(world), phase, 0), range(M.tkind(tower), M.level(tower)))
def covered(+world: M.World, +tower: M.Tower, +work: C.Work) -> Bool:
  Map.in_range(Map.Point{M.tx(tower), M.ty(tower)}, point_work(world, work), range(M.tkind(tower), M.level(tower)))
def levels(items: List<&2, M.Tower>, +world: M.World, +kind: U32, +phase: U32) -> U32:
  match items:
    case Nil{}: 0
    case +tower <> rest:
      (Bool.pick(U32, Bool.and(U32.is_eq(M.tkind(tower), kind), supports(world, tower, phase)), M.level(tower), 0) + levels(rest, world, kind, phase) : U32)
def permits(+world: M.World, phase: U32) -> U32:
  U32.min(8, (2 + levels(M.towers(world), world, 3, phase) : U32))
def batch_target(+world: M.World) -> U32:
  U32.min(8, (4 + levels(M.towers(world), world, 5, 5) : U32))

def pending_sibling(+parent: Nat, items: List<&2, C.Work>) -> Bool:
  match items:
    case Nil{}: False{}
    case C.Work{_, _, _, _, _, C.PendingFinding{_}, owner} <> rest:
      Bool.or(Nat.is_eq(parent, owner), pending_sibling(parent, rest))
    case _ <> rest: pending_sibling(parent, rest)
def eligible(+world: M.World, +tower: M.Tower, +work: C.Work) -> Bool:
  +phase = kind(work)
  # Waiting on a road is targetable; acquiring a worker still uses core permits.
  +active = Bool.or(inside_world(world, work), Bool.or(U32.is_eq(phase, 0),
    Bool.or(U32.is_eq(phase, 3), Bool.and(U32.is_eq(phase, 2), inside(M.core(world), work)))))
  +processable = (phase <= 4 : U32)
  +risk = M.timer_risk(find_timer(id(work), M.timers(world)))
  Bool.and(covered(world, tower, work), Bool.and(active, Bool.and(Bool.and(processable, Bool.or(U32.is_eq(M.tkind(tower), 1), (remaining(world, work) > 0 : U32))),
    Bool.pick(Bool, U32.is_eq(M.tkind(tower), 1), (risk > risk_floor() : U32),
      Bool.pick(Bool, U32.is_eq(M.tkind(tower), 4),
        Bool.and(U32.is_eq(phase, 4), pending_sibling(family(work), M.work(M.core(world)))),
        Bool.or(U32.is_eq(M.tkind(tower), 0), U32.is_eq(M.tkind(tower), 2)))))))
def target_scan(items: List<&2, C.Work>, +world: M.World, +tower: M.Tower, best: Nat) -> Nat:
  match items:
    case Nil{}: best
    case +work <> rest:
      target_scan(rest, world, tower, Bool.pick(Nat, eligible(world, tower, work), id(work), best))
def target(+world: M.World, tower: M.Tower) -> Nat:
  target_scan(M.work(M.core(world)), world, tower, 0n)
def find_work(+operation: Nat, items: List<&2, C.Work>) -> Maybe<&2, C.Work>:
  match items:
    case Nil{}: None{}
    case +work <> rest:
      Bool.pick(Maybe<&2, C.Work>, Nat.is_eq(operation, id(work)), Some{work}, find_work(operation, rest))

# Presentation backpressure belongs to the game, not the shared engine. Keep
# the actual owned work at its current stage until it reaches that stage's exit.
def existing_ready(+world: M.World,+before: C.Work,after: Maybe<&2,C.Work>) -> Bool:
  match after:
    case Some{work}: U32.is_eq(kind(before),kind(work)) || U32.is_eq(remaining(world,before),0)
    case None{}: U32.is_eq(remaining(world,before),0)
def changed_ready(items: List<&2,C.Work>,+world: M.World,+after: List<&2,C.Work>) -> Bool:
  match items:
    case Nil{}: True{}
    case +work <> rest:
      existing_ready(world,work,find_work(id(work),after)) && changed_ready(rest,world,after)
def parent_ready(world: M.World,parent: Maybe<&2,C.Work>) -> Bool:
  match parent:
    case Some{work}: U32.is_eq(remaining(world,work),0)
    case None{}: True{}
def birth_ready(known: Maybe<&2,C.Work>,+world: M.World,work: C.Work) -> Bool:
  match known:
    case Some{_}: True{}
    case None{}: parent_ready(world,find_work(family(work),M.work(M.core(world))))
def births_ready(items: List<&2,C.Work>,+world: M.World) -> Bool:
  match items:
    case Nil{}: True{}
    case +work <> rest:
      birth_ready(find_work(id(work),M.work(M.core(world))),world,work) && births_ready(rest,world)
def transition_ready(+world: M.World,+after: C.State) -> Bool:
  changed_ready(M.work(M.core(world)),world,M.work(after)) && births_ready(M.work(after),world)

def has_timer(+id: Nat, items: List<&2, M.Timer>) -> Bool:
  match items:
    case Nil{}: False{}
    case M.Timer{candidate, _, _, _, _, _, _} <> rest:
      Bool.or(Nat.is_eq(id, candidate), has_timer(id, rest))
def timer_next(+world: M.World, +work: C.Work, offered: U32) -> M.Timer:
  +current = find_timer(id(work), M.timers(world))
  +owner = find_timer(family(work), M.timers(world))
  +known = has_timer(id(work), M.timers(world))
  +seed = Bool.pick(U32, known, M.timer_seed(current),
    Bool.pick(U32, U32.is_eq(kind(work), 0), offered,
      Bool.pick(U32, U32.is_eq(kind(work), 3),
        ((M.timer_seed(owner) * 17 + (lane(world, work) + 1) * 47) % 100 : U32), M.timer_seed(owner))))
  M.Timer{id(work), kind(work), (age(id(work), kind(work), M.timers(world)) + 1 : U32), family(work),
    Bool.pick(U32, known, M.timer_risk(current), Bool.pick(U32, U32.is_eq(kind(work), 0), 100, M.timer_risk(owner))),
    seed, Bool.pick(U32, U32.is_eq(M.timer_phase(current), kind(work)), M.timer_boost(current), 0)}
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
def modify(items: List<&2, M.Timer>, +operation: Nat, +family: Nat, +group: Bool, +risk: Bool, +power: U32) -> List<&2, M.Timer>:
  match items:
    case Nil{}: Nil{}
    case M.Timer{+id, +phase, age, +owner, +r, seed, +boost} <> rest:
      +hit = Bool.or(Nat.is_eq(id, operation), Bool.and(group, Nat.is_eq(family, owner)))
      M.Timer{id, phase, age, owner, Bool.pick(U32, Bool.and(Bool.and(hit, risk), (phase <= 4 : U32)), M.sub(r, risk_reduction(r,power)), r), seed,
        Bool.pick(U32, Bool.and(hit, Bool.not(risk)), (boost + power : U32), boost)} <>
        modify(rest, operation, family, group, risk, power)

type Shot is Data:
  Shot{tower: M.Tower, timers: List<&2, M.Timer>}
def shot_tower(shot: Shot) -> M.Tower:
  match shot:
    case Shot{v, _}: v
def shot_timers(shot: Shot) -> List<&2, M.Timer>:
  match shot:
    case Shot{_, v}: v
def work_kind(work: C.Work) -> C.WorkKind:
  match work:
    case C.Work{_, _, _, _, _, kind, _}: kind
def shoot_found(+world: M.World, tower: M.Tower, found: Maybe<&2, C.Work>) -> Shot:
  match tower found:
    case M.Tower{x, y, +kind, +level, 0, _, _, charges} Some{+work}:
      +risk = U32.is_eq(kind, 1)
      +amount = Bool.pick(U32,risk,power(kind,level),U32.min(power(kind,level),remaining(world,work)))
      Shot{M.Tower{x, y, kind, level, M.sub(cooldown(kind), 1), 5, id(work), charges},
        modify(M.timers(world), id(work), family(work), (M.phase(work_kind(work)) <= 2 : U32), risk, amount)}
    case M.Tower{x, y, kind, level, cd, flash, aim, charges} _:
      Shot{M.Tower{x, y, kind, level, M.sub(cd, 1), M.sub(flash, 1), aim, charges}, M.timers(world)}
def shoot(+world: M.World, +tower: M.Tower) -> Shot:
  shoot_found(world, tower, find_work(target(world, tower), M.work(M.core(world))))
type ShotList is Data:
  ShotList{towers: List<&2, M.Tower>, timers: List<&2, M.Timer>}
def list_towers(value: ShotList) -> List<&2, M.Tower>:
  match value:
    case ShotList{v, _}: v
def list_timers(value: ShotList) -> List<&2, M.Timer>:
  match value:
    case ShotList{_, v}: v
def shoot_list(items: List<&2, M.Tower>, +world: M.World) -> ShotList:
  match items:
    case Nil{}: ShotList{Nil{}, M.timers(world)}
    case tower <> rest:
      +shot = shoot(world, tower)
      +tail = shoot_list(rest, M.with_effects(world, M.towers(world), shot_timers(shot)))
      ShotList{shot_tower(shot) <> list_towers(tail), list_timers(tail)}
def shoot_world(+world: M.World) -> M.World:
  +result = shoot_list(M.towers(world), world)
  M.with_effects(world, list_towers(result), list_timers(result))
