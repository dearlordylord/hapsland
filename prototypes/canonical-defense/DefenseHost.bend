# Native continuous consumer. All business transitions are owned by shared NativeRun.
import Base
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
import ./DefenseMechanics.bend as Mechanics
import ../../packages/monkey-business-bend/OutputScenario.bend as OutputScenario
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ../../packages/agent-flow-bend/CollectionState.bend as Collection

type Protected is Data:
  Protected{site: U32, bytes: U32}
type Shielded is Data:
  Shielded{towers: List<&2, M.Tower>, protected: U32}
def initial() -> M.World:
  M.World{[Consumer.initial()],0,False{},0,0,160,100,[],[],False{},0,0,0,0,[M.initial_control()],0,0,0,0,0}
def tower_cost(kind: U32) -> U32:
  E.cost(kind)
def tower_name(kind: U32) -> String:
  E.name(kind)
def tower_detail(kind: U32) -> String:
  E.detail(kind)
def tower_range(kind: U32, level: U32) -> U32:
  E.range(kind, level)
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
  M.number(inside_bytes(M.work(M.core(world)), world, Nil{}, 255))
def building_bytes(+world: M.World, phase: U32) -> U32:
  M.number(inside_bytes(M.work(M.core(world)), world, Nil{}, phase))
def damage_flash(world: M.World) -> Bool:
  (M.damage_flash(world) > 0 : U32)

def site_scan(+world: M.World, +tower: M.Tower, sites: List<&2, U32>, best: U32, +distance: U32) -> U32:
  match sites:
    case Nil{}: best
    case +phase <> rest:
      +point = Map.center(M.layout(world), phase, 0)
      +d = (Map.distance(M.tx(tower), Map.px(point)) + Map.distance(M.ty(tower), Map.py(point)) : U32)
      +valid = Bool.and(E.supports(world, tower, phase), (d < distance : U32))
      site_scan(world, tower, rest, Bool.pick(U32, valid, phase, best), Bool.pick(U32, valid, d, distance))
def support_site(+world: M.World, +tower: M.Tower) -> U32:
  +kind = M.tkind(tower)
  site_scan(world, tower,
    Bool.pick(List<&2, U32>, U32.is_eq(kind, 5), 5 <> Nil{},
      Bool.pick(List<&2, U32>, U32.is_eq(kind, 3), 1 <> 2 <> 4 <> Nil{},
        Bool.pick(List<&2, U32>, U32.is_eq(kind, 4), 4 <> Nil{},
          Bool.pick(List<&2, U32>, U32.is_eq(kind, 6), 1 <> 2 <> 4 <> 5 <> Nil{}, 1 <> 2 <> 4 <> Nil{})))), 255, 4294967295)

def protected_at(+site: U32, items: List<&2, Protected>) -> U32:
  match items:
    case Nil{}: 0
    case Protected{p, bytes} <> rest: (Bool.pick(U32, U32.is_eq(p, site), bytes, 0) + protected_at(site, rest) : U32)
def shield_towers(result: Shielded) -> List<&2, M.Tower>:
  match result:
    case Shielded{items, _}: items
def shield_bytes(result: Shielded) -> U32:
  match result:
    case Shielded{_, bytes}: bytes
def shield_spent(tower: M.Tower, spend: Bool) -> M.Tower:
  match tower:
    case M.Tower{x, y, k, l, cd, flash, aim, charge}:
      M.Tower{x, y, k, l, cd, flash, aim, M.sub(charge, Bool.to_u32(spend))}
def shields(items: List<&2, M.Tower>, +world: M.World, +spent: List<&2, Protected>, +hot: Bool) -> Shielded:
  match items:
    case Nil{}: Shielded{Nil{}, 0}
    case +tower <> rest:
      +site = support_site(world, tower)
      +budget = M.sub((building_bytes(world, site) / 2 : U32), protected_at(site, spent))
      +covered = Bool.and(hot, Bool.and(U32.is_eq(M.tkind(tower), 6), Bool.and((M.charges(tower) > 0 : U32), Bool.not(U32.is_eq(site, 255)))))
      +amount = Bool.pick(U32, covered, U32.min(budget, (40 * M.level(tower) : U32)), 0)
      +next = shields(rest, world, Protected{site, amount} <> spent, hot)
      Shielded{shield_spent(tower, (amount > 0 : U32)) <> shield_towers(next), (amount + shield_bytes(next) : U32)}
# Game pressure, not a ledger capacity: smooth excess avoids an all-or-nothing safe cliff.
def pressure_buffer() -> U32: 80
def pressure_hot(raw: U32) -> Bool: (raw > pressure_buffer() : U32)
def damage_work(raw: U32) -> U32: ((200 * M.sub(raw,pressure_buffer())) / 80 : U32)
def shield_allocation(+world: M.World) -> Shielded:
  +result = shields(List.reverse(&2, M.Tower, M.towers(world)), world, Nil{}, pressure_hot(building_pressure_bytes(world)))
  Shielded{List.reverse(&2, M.Tower, shield_towers(result)), shield_bytes(result)}
def residual_damage(+world: M.World) -> U32:
  +raw = building_pressure_bytes(world)
  +result = shield_allocation(world)
  M.sub(damage_work(raw), ((damage_work(raw) * shield_bytes(result)) / U32.max(1, raw) : U32))
def damage(+world: M.World) -> M.World:
  match world:
    case M.World{core, t, p, l, c, g, +h, towers, timers, a, o, r, cl, d, auto, x, y, selected, +work, +flash}:
      +raw = building_pressure_bytes(world)
      +guard = shield_allocation(world)
      +pulse = M.sub(damage_work(raw), ((damage_work(raw) * shield_bytes(guard)) / U32.max(1, raw) : U32))
      +total = (work + pulse : U32)
      +hit = Bool.and((total >= 10000 : U32), (h > 0 : U32))
      M.World{core, t, p, l, c, g, M.sub(h, Bool.to_u32(hit)), shield_towers(guard), timers, a, o, r, cl, d, auto, x, y, selected,
        (total % 10000 : U32), Bool.pick(U32, hit, 10, M.sub(flash, 1))}

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
def start(+world: M.World) -> M.World:
  burst_controlled(world,Run.control(M.engine(world),T.WorkloadControl{Some{1n},Workload.Burst{1n}}))
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
# A Refiner shot changes only future sampled Jev outcomes. Issued facts stay intact.
def refiner_fired(items: List<&2,M.Tower>) -> Bool:
  match items:
    case Nil{}: False{}
    case M.Tower{_,_,kind,_,_,flash,_,_} <> rest:
      (U32.is_eq(kind,1) && U32.is_eq(flash,5)) || refiner_fired(rest)
def output_outcome(value: U32) -> OutputScenario.Outcome:
  match value:
    case 0: OutputScenario.Certain{}
    case 1: OutputScenario.Uncertain{}
    case _: OutputScenario.Failed{}
def mapped_action(world: M.World, mapped: Mechanics.Action) -> M.World:
  match mapped:
    case Mechanics.Unsupported{}: world
    case Mechanics.OutputTiming{outcome,delay,lease}:
      action(world,T.OutputProfileControl{output_outcome(outcome),delay,lease})
    case Mechanics.FutureReview{delay,weights}:
      action(world,T.JevProfile{delay,weights})
def mechanism(world: M.World, ability: Mechanics.Ability) -> M.World:
  mapped_action(world,Mechanics.translate(ability))
def refinement(+world: M.World) -> M.World:
  pick_world(refiner_fired(M.towers(world)),mechanism(world,Mechanics.Refinement{}),world)
type TickObserved is Data:
  TickObserved{world: M.World, frames: List<&2,T.Frame>, physical: List<&2,T.PhysicalDelivery>}
def tick_applied(world: M.World, advanced: T.Advanced) -> TickObserved:
  match advanced:
    case T.Advanced{state,+frames,+physical}:
      TickObserved{damage(refinement(E.shoot_world(consumed(world,T.Advanced{state,frames,physical})))),frames,physical}
# Consume one actual engine input at a time. A pure candidate which moves or
# retires owned work waits until its current road/service animation completes.
# Discarding a candidate has no IO effect and never reports phantom frames.
def presented_advance(ready: Bool,world: M.World,advanced: T.Advanced) -> T.Advanced:
  match ready:
    case True{}: advanced
    case False{}: T.Advanced{M.engine(world),Nil{},Nil{}}
def advancing_observed(+world: M.World,+advanced: T.Advanced) -> TickObserved:
  match advanced:
    case T.Advanced{+state,frames,physical}:
      tick_applied(world,presented_advance(E.transition_ready(world,M.canonical(Run.observe(state))),world,T.Advanced{state,frames,physical}))
def ticking_observed(+world: M.World) -> TickObserved:
  advancing_observed(world,Run.advance(M.engine(world),1n,(U32.to_nat(M.time(world)) * 20n + 20n : Nat)))
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
        M.World{core, t, p, l, c, M.sub(g, upgrade_cost(M.level(tower))), h, upgrade_items(ts, selected), ms, a, o, r, cl, d, auto, x, y, selected, work, flash}, world)
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
      +choose = (code >= 49 : U32) && (code <= 55 : U32)
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
      pick_world(Bool.and(placement_valid(world, x, y), Bool.and((g >= tower_cost(kind) : U32), Bool.and((kind < 7 : U32), (h > 0 : U32)))),
        M.World{core, t, p, l, c, M.sub(g, tower_cost(kind)), h, M.Tower{snap(x), snap(y), kind, 1, 0, 0, 0n, 240} <> ts,
          ms, a, o, r, cl, d, auto, mx, my, 0, work, flash}, world)
def click(+world: M.World, +x: U32, +y: U32) -> M.World:
  +index = tower_hit(M.towers(world), x, y, 1)
  pick_world((index > 0 : U32), select(move(world, x, y), index), build(move(world, x, y), x, y, M.choice(world)))
def road_site(+world: M.World,+tower: M.Tower,+fallback: U32) -> U32:
  +point: Map.Point = Map.Point{M.tx(tower),M.ty(tower)}
  +radius = E.range(M.tkind(tower),M.level(tower))
  Bool.pick(U32,(M.tkind(tower) < 3 : U32),
    Bool.pick(U32,Map.on_path(point,Map.source_route(M.layout(world)),radius),1,
      Bool.pick(U32,Map.on_path(point,Map.preparation_route(M.layout(world)),radius),2,
        Bool.pick(U32,Map.on_path(point,Map.review_route(M.layout(world),0),radius) ||
          Map.on_path(point,Map.review_route(M.layout(world),1),radius),4,fallback))),fallback)
def preview_site_found(+world: M.World,+tower: M.Tower,found: Maybe<&2,C.Work>) -> U32:
  match found:
    case Some{+work}: Bool.pick(U32,U32.is_eq(E.kind(work),0),1,Bool.pick(U32,U32.is_eq(E.kind(work),3),4,E.kind(work)))
    case None{}: road_site(world,tower,support_site(world,tower))
def preview_site(+world: M.World, x: U32, y: U32, kind: U32) -> U32:
  +tower: M.Tower = M.Tower{snap(x), snap(y), kind, 1, 0, 0, 0n, 240}
  preview_site_found(world,tower,E.find_work(E.target(world,tower),M.work(M.core(world))))
def preview_target(+world: M.World, x: U32, y: U32, kind: U32) -> Nat:
  E.target(world, M.Tower{snap(x), snap(y), kind, 1, 0, 0, 0n, 240})
def target_remaining(world: M.World, found: Maybe<&2, C.Work>) -> U32:
  match found:
    case Some{work}: E.remaining(world, work)
    case None{}: 0
def preview_before(+world: M.World, +x: U32, +y: U32, +kind: U32) -> U32:
  +site = preview_site(world, x, y, kind)
  Bool.pick(U32, U32.is_eq(kind, 1), M.timer_risk(E.find_timer(preview_target(world, x, y, kind), M.timers(world))),
    Bool.pick(U32, U32.is_eq(kind, 3), Bool.pick(U32, U32.is_eq(site, 4), E.permits(world, 4), source_permits(world)),
      Bool.pick(U32, U32.is_eq(kind, 5), O.batch_target(world),
        Bool.pick(U32, U32.is_eq(kind, 6), residual_damage(world),
          target_remaining(world, E.find_work(preview_target(world, x, y, kind), M.work(M.core(world))))))))
def hypothetical(+world: M.World, x: U32, y: U32, kind: U32) -> M.World:
  M.with_effects(world, M.Tower{snap(x), snap(y), kind, 1, 0, 0, 0n, 240} <> M.towers(world), M.timers(world))
def preview_gain(+world: M.World, +x: U32, +y: U32, +kind: U32) -> U32:
  +before = preview_before(world, x, y, kind)
  +after = hypothetical(world, x, y, kind)
  +site = preview_site(world, x, y, kind)
  Bool.pick(U32, U32.is_eq(site, 255), 0,
    Bool.pick(U32, U32.is_eq(kind, 3), M.sub(preview_before(after, x, y, kind), before),
      Bool.pick(U32, U32.is_eq(kind, 5), M.sub(O.batch_target(after), before),
        Bool.pick(U32, U32.is_eq(kind, 6), M.sub(before, residual_damage(after)),
          Bool.pick(U32, Nat.is_eq(preview_target(world, x, y, kind), 0n), 0, Bool.pick(U32,U32.is_eq(kind,1),E.risk_reduction(before,tower_power(kind,1)),U32.min(before,tower_power(kind,1))))))))
def preview_secondary_before(world: M.World, x: U32, y: U32, kind: U32) -> U32:
  Bool.pick(U32, U32.is_eq(kind, 5), O.item_work(world), 0)
def preview_secondary_delta(+world: M.World, x: U32, y: U32, +kind: U32) -> U32:
  Bool.pick(U32, U32.is_eq(kind, 5), M.sub(O.item_work(world), O.item_work(hypothetical(world, x, y, kind))), 0)

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
