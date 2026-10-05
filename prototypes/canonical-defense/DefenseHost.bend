# Native continuous consumer. All business transitions are owned by shared NativeRun.
import Base
import ./DefenseMechanics.bend as Mechanics
import ./DefenseMotion.bend as Motion
import ./DefenseAuto.bend as A
import ./DefenseCues.bend as Cues
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseEffects.bend as E
import ./DefenseMap.bend as Map
import ./DefenseOutput.bend as O
import ./DefenseConsumer.bend as Consumer
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/Workload.bend as Workload
import ../../packages/monkey-business-bend/Numeric.bend as Numeric
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ../../packages/agent-flow-bend/CollectionState.bend as Collection

def initial_config(+config: T.Config,seed: Nat) -> M.World:
  M.World{[Run.create(config,seed)],0,False{},0,0,160,100,[],[],False{},0,0,0,0,
    [M.with_settings(M.initial_control(),M.config_settings(config))],0,0,0,0,0}
def initial() -> M.World: initial_config(Consumer.config(),Consumer.seed())
def tower_cost(kind: U32) -> U32:
  Mechanics.cost(kind)
def tower_name(kind: U32) -> String:
  Mechanics.name(kind)
def tower_detail(kind: U32) -> String:
  Mechanics.detail(kind)
def tower_range(kind: U32, level: U32) -> U32:
  Mechanics.range(kind, level)
def tower_power(kind: U32, level: U32) -> U32:
  E.power(kind, level)
def tower_cooldown(kind: U32) -> U32:
  E.cooldown(kind)
def upgrade_cost(level: U32) -> U32:
  E.upgrade_cost(level)
def timer_age(id: Nat, phase: U32, timers: List<&2, M.Timer>) -> U32:
  E.age(id, phase, timers)
def request_for(+operation: Nat, requests: List<&2, Dispatch.Request>) -> Nat:
  match requests:
    case Nil{}: 0n
    case Dispatch.Request{_, _, _, op, id, _, _} <> rest:
      Bool.pick(Nat, Nat.is_eq(operation, op), id, request_for(operation, rest))
def requests(state: Dispatch.State) -> List<&2, Dispatch.Request>:
  E.requests(state)
def pending_units(items: List<&2, C.Work>) -> U32:
  match items:
    case Nil{}: 0
    case C.Work{_, _, _, _, _, C.PendingFinding{_}, _} <> rest: (1 + pending_units(rest) : U32)
    case _ <> rest: pending_units(rest)
def unfinished_sibling(parent: Nat, items: List<&2, C.Work>) -> Bool:
  E.pending_sibling(parent, items)
def has_operation(+id: Nat, items: List<&2, C.Work>) -> Bool:
  Bool.not(Nat.is_eq(E.id_found(id, items), 0n))
def has_preparation(+parent: Nat, items: List<&2, C.Work>) -> Bool:
  match items:
    case Nil{}: False{}
    case C.Work{_, _, _, _, _, C.Preparing{}, owner} <> rest:
      Bool.or(Nat.is_eq(parent, owner), has_preparation(parent, rest))
    case _ <> rest: has_preparation(parent, rest)
def preparation_running(core: C.State, part: Nat, life: Nat, round: Nat, id: Nat) -> Bool:
  Dispatch.contains(E.running(M.dispatch(core)), part, life, round, id)
def source_owned(items: List<&2, C.Work>) -> U32:
  match items:
    case Nil{}: 0
    case C.Work{_, _, _, _, _, C.SourceReading{}, _} <> rest: (1 + source_owned(rest) : U32)
    case _ <> rest: source_owned(rest)
def source_permits(+world: M.World) -> U32:
  U32.max(E.permits(world, 1), E.permits(world, 2))
def inside_found(world: M.World,found: Maybe<&2,C.Work>) -> Bool:
  match found:
    case None{}: False{}
    case Some{work}: E.inside_world(world,work)
def in_building(+world: M.World,token: P.Token) -> Bool:
  inside_found(world,E.find_work(U32.to_nat(P.id(token)),M.work(M.core(world))))
def inside_bytes(items: List<&2, C.Work>, +world: M.World, +seen: List<&2, Nat>, +phase: U32) -> Nat:
  match items:
    case Nil{}: 0n
    case +work <> rest:
      match work:
        case C.Work{_, _, _, _, +charge, _, _}:
          +counted = Bool.and(Bool.and(E.inside_world(world, work), Bool.or(U32.is_eq(phase, 255), U32.is_eq(phase, E.kind(work)))), Bool.not(Collection.contains(charge, seen)))
          (Bool.pick(Nat, counted, E.bytes(world, work), 0n) + inside_bytes(rest, world, Bool.pick(List<&2, Nat>, counted, charge <> seen, seen), phase) : Nat)
def building_pressure_bytes(+world: M.World) -> U32:
  P.ledger_bytes(world)
def building_bytes(+world: M.World, phase: U32) -> U32:
  M.number(inside_bytes(M.work(M.core(world)), world, Nil{}, phase))
def damage_flash(world: M.World) -> Bool:
  (M.damage_flash(world) > 0 : U32)

def support_site(+world: M.World,+tower: M.Tower) -> U32:
  Bool.pick(U32,Mechanics.connected(world,tower),Mechanics.site(M.tkind(tower)),255)
# Health measures actual occupied ledger pressure, independently of geometry and playback.
def pressure_buffer() -> U32: 80
def pressure_hot(raw: U32) -> Bool: (raw > pressure_buffer() : U32)
def damage_work(raw: U32) -> U32: ((200 * M.sub(raw,pressure_buffer())) / 80 : U32)
def residual_damage(world: M.World) -> U32: damage_work(P.ledger_bytes(world))
def damage(+world: M.World) -> M.World:
  match world:
    case M.World{core,t,p,l,c,g,+h,towers,timers,a,o,r,cl,d,auto,x,y,selected,+work,+flash}:
      +total = (work + residual_damage(world) : U32)
      +hit = (total >= 10000 : U32) && (h > 0 : U32)
      M.World{core,t,p,l,c,g,M.sub(h,Bool.to_u32(hit)),towers,timers,a,o,r,cl,d,auto,x,y,selected,
        (total % 10000 : U32),Bool.pick(U32,hit,10,M.sub(flash,1))}

def drained(+world: M.World) -> Bool:
  Nat.is_eq(List.length(&2,C.Work,M.work(M.core(world))),0n) &&
    U32.is_eq(P.requests(world),0) && U32.is_eq(P.writes(world),0) && U32.is_eq(P.leases(world),0)
def run_status(+world: M.World) -> U32:
  Bool.pick(U32,U32.is_eq(M.hp(world),0),3,Bool.pick(U32,M.auto(world),1,0))
def clock_active(+world: M.World) -> Bool: M.active(world) && Bool.not(M.paused(world)) && (M.hp(world) > 0 : U32)
def controlled(world: M.World, result: T.Controlled) -> M.World:
  match result:
    case T.Controlled{state,_}: M.with_engine(world,state)
def action(+world: M.World, control: T.Control) -> M.World:
  controlled(world,Run.control(M.engine(world),control))
def pick_world(selected: Bool, yes: M.World, no: M.World) -> M.World:
  match selected:
    case True{}: yes
    case False{}: no
def started(world: M.World) -> M.World:
  match world:
    case M.World{core,t,p,l,c,g,h,ts,ms,_,o,r,cl,d,auto,x,y,selected,work,flash}:
      M.World{core,t,p,l,c,g,h,ts,ms,True{},o,r,cl,d,auto,x,y,selected,work,flash}
def burst_controlled(world: M.World,result: T.Controlled) -> M.World:
  match result:
    case T.Controlled{state,True{}}: Cues.burst(M.with_engine(started(world),state))
    case T.Controlled{_,False{}}: world
def burst(+world: M.World,count: U32) -> M.World:
  burst_controlled(world,Run.control(M.engine(world),T.WorkloadControl{Some{1n},Workload.Burst{U32.to_nat(count)}}))
def start(+world: M.World) -> M.World: burst(world,M.burst_size(M.settings(world)))
def next_burst(size: U32) -> U32:
  match size:
    case 1: 5
    case 5: 10
    case 10: 20
    case _: 1
def cycle_burst(+world: M.World) -> M.World:
  M.with_control(world,M.with_settings(M.control(world),M.with_burst(M.settings(world),next_burst(M.burst_size(M.settings(world))))))
def frame_counts(commands: List<&2,C.Command>, +kind: U32) -> U32:
  match commands:
    case Nil{}: 0
    case C.FinishRecorded{C.Acknowledged{}} <> rest: (Bool.to_u32(U32.is_eq(kind,0)) + frame_counts(rest,kind) : U32)
    case _ <> rest: frame_counts(rest,kind)
def observed_count(frame: T.Frame, kind: U32) -> U32:
  match frame:
    case T.ProductFrame{_,_,C.AdmitObservation{_,_,_},_,_,_,None{},_}: Bool.to_u32(U32.is_eq(kind,1))
    case T.ProductFrame{_,_,C.JevRequestSettled{_,_,_,_,_,C.RequestClear{},_},_,_,_,None{},_}: Bool.to_u32(U32.is_eq(kind,2))
    case T.ProductFrame{_,_,_,_,_,commands,None{},_}: frame_counts(commands,kind)
    case _: 0
def count_frames(frames: List<&2,T.Frame>, +kind: U32) -> U32:
  match frames:
    case Nil{}: 0
    case frame <> rest: (observed_count(frame,kind) + count_frames(rest,kind) : U32)
def consumed(+world: M.World, advanced: T.Advanced) -> M.World:
  match world advanced:
    case M.World{_,+t,p,l,c,+g,h,ts,_,a,+o,r,+cl,+d,auto,x,y,selected,work,flash} T.Advanced{+state,+frames,_}:
      +delivered = count_frames(frames,0)
      +next = M.with_engine(world,state)
      Cues.tick(world,M.World{[state],(t + 1 : U32),p,l,c,(g + delivered * 5 : U32),h,ts,E.refresh(next,M.core(next),(o + count_frames(frames,1) : U32)),a,
        (o + count_frames(frames,1) : U32),r,(cl + count_frames(frames,2) : U32),(d + delivered : U32),auto,x,y,selected,work,flash},frames)
type TickObserved is Data:
  TickObserved{world: M.World, frames: List<&2,T.Frame>, physical: List<&2,T.PhysicalDelivery>}
def presented(+before: M.World,after: M.World,frames: List<&2,T.Frame>) -> M.World:
  M.with_actors(after,Motion.step(Motion.ingest(frames,M.actors(before),M.layout(before))))
def tick_applied(+world: M.World, advanced: T.Advanced) -> TickObserved:
  match advanced:
    case T.Advanced{state,+frames,+physical}:
      TickObserved{damage(presented(world,consumed(world,T.Advanced{state,frames,physical}),frames)),frames,physical}
def ticking_observed(+world: M.World) -> TickObserved:
  tick_applied(world,Run.advance(M.engine(world),256n,(U32.to_nat(M.time(world)) * 20n + 20n : Nat)))
def tick_when(active: Bool,world: M.World) -> TickObserved:
  match active:
    case True{}: ticking_observed(world)
    case False{}: TickObserved{world,Nil{},Nil{}}
def tick_observed(+world: M.World) -> TickObserved:
  tick_when(clock_active(world),world)
def tick_world(observed: TickObserved) -> M.World:
  match observed:
    case TickObserved{world,_,_}: world
def ticking(world: M.World) -> M.World:
  tick_world(ticking_observed(world))
def tick(world: M.World) -> M.World:
  tick_world(tick_observed(world))
def move(world: M.World, x: U32, y: U32) -> M.World:
  match world:
    case M.World{core, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, auto, _, _, selected, work, flash}:
      M.World{core, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, auto, x, y, selected, work, flash}
def map_free(+world: M.World) -> Bool:
  Bool.and(Nat.is_eq(List.length(&2,M.Tower,M.towers(world)),0n), Bool.and(Nat.is_eq(List.length(&2, C.Work, M.work(M.core(world))), 0n), U32.is_eq(P.writes(world), 0)))
def selected_tower(items: List<&2, M.Tower>, index: U32) -> Maybe<&2, M.Tower>:
  match items index:
    case Nil{} _: None{}
    case tower <> _ 1: Some{tower}
    case _ <> rest _: selected_tower(rest, M.sub(index, 1))
def upgrade_items(items: List<&2, M.Tower>, index: U32) -> List<&2, M.Tower>:
  match items index:
    case Nil{} _: Nil{}
    case M.Tower{x, y, k, l, cd, flash, aim, charge} <> rest 1:
      M.Tower{x, y, k, (l + 1 : U32), cd, flash, aim, charge} <> rest
    case tower <> rest _: tower <> upgrade_items(rest, M.sub(index, 1))
def upgrade_found(+world: M.World, found: Maybe<&2, M.Tower>) -> M.World:
  match world found:
    case M.World{core, t, p, l, c, +g, h, +ts, ms, a, o, r, cl, d, auto, x, y, +selected, work, flash} Some{+tower}:
      pick_world(Bool.and((M.level(tower) < 3 : U32), (g >= upgrade_cost(M.level(tower)) : U32)),
        Mechanics.profiles(M.World{core, t, p, l, c, M.sub(g, upgrade_cost(M.level(tower))), h, upgrade_items(ts, selected), ms, a, o, r, cl, d, auto, x, y, selected, work, flash}), world)
    case _ _: world
def upgrade(+world: M.World) -> M.World:
  upgrade_found(world, selected_tower(M.towers(world), M.selected(world)))
def reset_found(world: M.World, layout: U32) -> M.World:
  match world:
    case M.World{core, t, p, _, c, g, h, ts, ms, a, o, r, cl, d, auto, x, y, selected, work, flash}:
      M.World{core, t, p, layout, c, g, h, ts, ms, a, o, r, cl, d, auto, x, y, selected, work, flash}

def reset_layout(layout: U32) -> M.World:
  match layout:
    case +l:
      world: M.World = initial()
      reset_found(world, l)
def pacing(+world: M.World,faster: Bool) -> M.World:
  +pace = Bool.pick(U32,faster,U32.max(20,M.sub(M.arrival_interval(world),100)),U32.min(60000,(M.arrival_interval(world) + 100 : U32)))
  action(M.with_control(world,M.control_with_pace(M.control(world),pace)),T.WorkloadControl{Some{1n},Workload.Pace{pace}})
def key_result(world: M.World, code: U32) -> M.World:
  match code:
    case 114: reset_layout(M.layout(world))
    case 117: upgrade(world)
    case 98: cycle_burst(world)
    case 91: pacing(world,False{})
    case 93: pacing(world,True{})
    case 110: start(world)
    case 13: start(world)
    case _: world

def key_schedule(+world: M.World, code: U32) -> A.State:
  match code:
    case 97: A.toggle(M.schedule(world))
    case _: M.schedule(world)
def key_map(+world: M.World, code: U32) -> U32:
  Bool.pick(U32, U32.is_eq(code, 9) && map_free(world), ((M.layout(world) + 1) % 3 : U32), M.layout(world))
def key_fields(world: M.World, +code: U32, layout: U32, schedule: A.State) -> M.World:
  match world:
    case M.World{core, t, +p, _, +c, g, h, ts, ms, a, o, r, cl, d, auto, x, y, +selected, work, flash}:
      +choose = (code >= 49 : U32) && (code <= 51 : U32)
      M.World{core, t, Bool.pick(Bool, (U32.is_eq(code, 32) || U32.is_eq(code,112)), Bool.not(p), p), layout,
        Bool.pick(U32, choose, (code - 49 : U32), c), g, h, ts, ms, a, o, r, cl, d, [M.control_with_schedule(M.control_value(auto),schedule)], x, y,
        Bool.pick(U32, choose, 0, selected), work, flash}
def key_workload(+world: M.World, code: U32) -> M.World:
  match code:
    case 97: action(world,T.WorkloadControl{Some{1n},Workload.Suspend{Bool.not(M.auto(world))}})
    case _: world
def key(+world: M.World, +code: U32) -> M.World:
  key_result(key_workload(key_fields(world,code,key_map(world,code),key_schedule(world,code)),code),code)

def snap(value: U32) -> U32:
  ((value / 16) * 16 + 8 : U32)
def tower_hit(items: List<&2, M.Tower>, +x: U32, +y: U32, +index: U32) -> U32:
  match items:
    case Nil{}: 0
    case +tower <> rest:
      Bool.pick(U32, Map.in_range(Map.Point{x, y}, Map.Point{M.tx(tower), M.ty(tower)}, 14), index,
        tower_hit(rest, x, y, (index + 1 : U32)))
def tower_clear(items: List<&2, M.Tower>, +x: U32, +y: U32) -> Bool:
  match items:
    case Nil{}: True{}
    case +tower <> rest:
      Bool.and(Bool.not(Map.in_range(Map.Point{x, y}, Map.Point{M.tx(tower), M.ty(tower)}, 28)), tower_clear(rest, x, y))
def placement_valid(+world: M.World, +x: U32, +y: U32) -> Bool:
  Bool.and(Bool.and(Bool.and((snap(x) >= 24 : U32), (snap(x) <= 776 : U32)), Bool.and((snap(y) >= 116 : U32), (snap(y) <= 644 : U32))),
    Bool.and(Map.placement_ground(M.layout(world), Map.Point{snap(x), snap(y)}), tower_clear(M.towers(world), snap(x), snap(y))))
def select(world: M.World, index: U32) -> M.World:
  match world:
    case M.World{core, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, auto, x, y, _, work, flash}:
      M.World{core, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, auto, x, y, index, work, flash}
def build(+world: M.World, +x: U32, +y: U32, +kind: U32) -> M.World:
  match world:
    case M.World{core, t, p, l, c, +g, +h, ts, ms, a, o, r, cl, d, auto, mx, my, _, work, flash}:
      pick_world(Bool.and(placement_valid(world, x, y), Bool.and((g >= tower_cost(kind) : U32), Bool.and((kind < 3 : U32), (h > 0 : U32)))),
        Mechanics.profiles(M.World{core, t, p, l, c, M.sub(g, tower_cost(kind)), h, M.Tower{snap(x), snap(y), kind, 1, 0, 0, 0n, 240} <> ts,
          ms, a, o, r, cl, d, auto, mx, my, 0, work, flash}), world)
def click(+world: M.World, +x: U32, +y: U32) -> M.World:
  +index = tower_hit(M.towers(world), x, y, 1)
  pick_world((index > 0 : U32), select(move(world, x, y), index), build(move(world, x, y), x, y, M.choice(world)))
def preview_site(+world: M.World,x: U32,y: U32,kind: U32) -> U32:
  support_site(world,M.Tower{snap(x),snap(y),kind,1,0,0,0n,0})
def preview_target(world: M.World,x: U32,y: U32,kind: U32) -> Nat: 0n
def target_remaining(world: M.World,found: Maybe<&2,C.Work>) -> U32:
  match found:
    case Some{work}: E.remaining(world,work)
    case None{}: 0
def profile_delay(+world: M.World,kind: U32) -> U32:
  M.number(Mechanics.current_delay(Mechanics.current_environment(M.engine(world)),kind))
def preview_before(+world: M.World,x: U32,y: U32,+kind: U32) -> U32:
  Bool.pick(U32,(kind < 2 : U32),profile_delay(world,kind),0)
def hypothetical(+world: M.World,x: U32,y: U32,kind: U32) -> M.World:
  M.with_effects(world,M.Tower{snap(x),snap(y),kind,1,0,0,0n,0} <> M.towers(world),M.timers(world))
def preview_gain(+world: M.World,+x: U32,+y: U32,+kind: U32) -> U32:
  +next = hypothetical(world,x,y,kind)
  +base = Bool.pick(Nat,U32.is_eq(kind,0),M.base_jev(M.settings(world)),M.base_output(M.settings(world)))
  Bool.pick(U32,U32.is_eq(preview_site(world,x,y,kind),255) || (kind >= 2 : U32),0,
    M.sub(profile_delay(world,kind),M.number(Mechanics.delay(base,Mechanics.strength(next,kind)))))
def preview_secondary_before(world: M.World,x: U32,y: U32,kind: U32) -> U32: 0
def preview_secondary_delta(world: M.World,x: U32,y: U32,kind: U32) -> U32: 0

def duration_found(world: M.World, found: Maybe<&2, C.Work>) -> U32:
  match found:
    case Some{work}: E.duration(world, work)
    case None{}: 0
def duration(+world: M.World, token: P.Token) -> U32:
  duration_found(world, E.find_work(U32.to_nat(P.id(token)), M.work(M.core(world))))
def remaining(+world: M.World, token: P.Token) -> U32:
  target_remaining(world, E.find_work(U32.to_nat(P.id(token)), M.work(M.core(world))))
def risk(world: M.World, token: P.Token) -> U32:
  M.timer_risk(E.find_timer(U32.to_nat(P.id(token)), M.timers(world)))
def travel_ticks(+world: M.World, phase: U32, lane: U32) -> U32:
  match phase:
    case 0: Map.path_length(Map.source_route(M.layout(world)))
    case 1: Map.path_length(Map.preparation_route(M.layout(world)))
    case 2: Map.path_length(Map.preparation_route(M.layout(world)))
    case 3: Map.path_length(Map.review_route(M.layout(world), lane))
    case 5: Map.path_length(Map.retained_route(M.layout(world)))
    case _: 0

def lane_found(world: M.World, found: Maybe<&2, C.Work>) -> U32:
  match found:
    case Some{work}: E.lane(world, work)
    case None{}: 0
def unit_lane(+world: M.World, token: P.Token) -> U32:
  lane_found(world, E.find_work(U32.to_nat(P.id(token)), M.work(M.core(world))))
def point_work(world: M.World,work: C.Work) -> Map.Point:
  E.point_work(world,work)
def point_found(world: M.World, found: Maybe<&2, C.Work>) -> Map.Point:
  match found:
    case Some{work}: point_work(world, work)
    case None{}: Map.Point{24, 100}
def unit_point(+world: M.World, token: P.Token) -> Map.Point:
  point_found(world, E.find_work(U32.to_nat(P.id(token)), M.work(M.core(world))))
