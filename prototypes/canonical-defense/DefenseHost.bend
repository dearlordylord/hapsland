# Native teaching-game host facts. Canonical.step is the sole product-state authority.
import Base
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseEffects.bend as E
import ./DefenseMap.bend as Map
import ./DefenseOutput.bend as O
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ../../packages/agent-flow-bend/CollectionState.bend as Collection

type Protected is Data:
  Protected{site: U32, bytes: U32}
type Shielded is Data:
  Shielded{towers: List<&2, M.Tower>, protected: U32}
def apply(result: C.Step) -> C.State:
  match result:
    case C.Advanced{state, _}: state
    case C.Rejected{state, _}: state
def event(state: C.State, fact: C.CanonicalEvent) -> C.State:
  apply(C.step(state, fact))
def initial() -> M.World:
  M.World{event(C.initial(Ledger.Limits{32n, 480n, 32n, 480n}), C.OpenRound{1n, 1n}),
    0, False{}, 0, 0, 160, 100, Nil{}, Nil{}, False{}, 0, 0, 0, 0,
    M.Output{0, 0n, 999n, Nil{}, 0, 0}, False{}, 0, 0, 0, 0, 0}
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
def outcome(id: Nat, timers: List<&2, M.Timer>) -> C.RequestOutcome:
  +timer = E.find_timer(id, timers)
  Bool.pick(C.RequestOutcome, (M.timer_seed(timer) < M.timer_risk(timer) : U32), C.RequestFinding{}, C.RequestClear{})
def preparation_after(+state: C.State, +part: Nat, +life: Nat, +round: Nat,
    +id: Nat, +parent: Nat) -> C.State:
  Bool.pick(C.State, Bool.not(has_preparation(parent, M.work(state))),
    event(event(state, C.CompleteObservation{part, life, round, parent}), C.DispatchSettled{part, life, round, parent}), state)
def preparation_finished(state: C.State, +part: Nat, +life: Nat, +round: Nat, +id: Nat, parent: Nat) -> C.State:
  preparation_after(event(state, C.PreparationCompleted{part, life, round, id, 10n <> 20n <> Nil{}}), part, life, round, id, parent)
def progress_kind(+state: C.State, +world: M.World, +work: C.Work, kind: C.WorkKind) -> C.State:
  match work kind:
    case C.Work{part, life, round, +id, _, _, _} C.AwaitingSourceRead{}:
      +arrived = (E.effort(world, work) >= E.duration(world, work) : U32)
      +queued = Bool.pick(C.State, arrived, event(state, C.QueueDispatch{part, life, round, id}), state)
      Bool.pick(C.State, Bool.and(arrived, Bool.and((source_owned(M.work(queued)) < source_permits(world) : U32),
        preparation_running(queued, part, life, round, id))), event(queued, C.StartObservation{part, life, round, id}), queued)
    case C.Work{part, life, round, +id, _, _, _} C.SourceReading{}:
      Bool.pick(C.State, Bool.and((E.effort(world, work) >= E.duration(world, work) : U32),
        Bool.not(has_preparation(id, M.work(state)))), event(state, C.BeginObservedPreparation{part, life, round, id, 40n}), state)
    case C.Work{part, life, round, +id, _, _, parent} C.Preparing{}:
      Bool.pick(C.State, Bool.and((E.effort(world, work) >= E.duration(world, work) : U32),
        preparation_running(state, part, life, round, parent)), preparation_finished(state, part, life, round, id, parent), state)
    case C.Work{part, life, round, +id, _, _, _} C.Reviewing{}:
      +arrived = (E.effort(world, work) >= E.duration(world, work) : U32)
      +queued = Bool.pick(C.State, arrived, event(state, C.QueueDispatch{part, life, round, id}), state)
      Bool.pick(C.State, Bool.and(Bool.and(arrived, preparation_running(queued, part, life, round, id)),
        Bool.and((M.number(List.length(&2, Dispatch.Request, requests(M.dispatch(queued)))) < E.permits(world, 4) : U32),
          Nat.is_lt(List.length(&2, Dispatch.Request, requests(M.dispatch(queued))), Dispatch.max_requests()))),
        event(queued, C.JevRequestReady{part, life, round, id, True{}, True{}, True{}, True{}, True{}, True{}}), queued)
    case C.Work{part, life, round, +id, _, _, _} C.AtJev{}:
      +request = request_for(id, requests(M.dispatch(state)))
      Bool.pick(C.State, (E.effort(world, work) >= E.duration(world, work) : U32),
        event(event(state, C.JevRequestSettled{part, life, round, id, request, outcome(id, M.timers(world)), True{}}),
          C.DispatchSettled{part, life, round, id}), event(state, C.JevRequestStarted{part, life, round, id, request}))
    case C.Work{part, life, round, +id, _, _, parent} C.PendingFinding{_}:
      Bool.pick(C.State, (E.age(id, 5, M.timers(world)) >= (Map.path_length(Map.retained_route(M.layout(world))) + 90 : U32) : U32),
        event(state, C.CollectionReady{id, part, life, round, parent, False{}}), state)
    case _ _: state

def progress(items: List<&2, C.Work>, state: C.State, +world: M.World) -> C.State:
  match items:
    case Nil{}: state
    case +work <> rest: progress(rest, progress_kind(state, world, work, E.work_kind(work)), world)
def clear_completed(items: List<&2, C.Work>, +before: M.World, +after: C.State) -> U32:
  match items:
    case Nil{}: 0
    case C.Work{_, _, _, +id, _, C.AtJev{}, _} <> rest:
      (Bool.to_u32(Bool.and(Bool.not(has_operation(id, M.work(after))),
        Bool.not((M.timer_seed(E.find_timer(id, M.timers(before))) < M.timer_risk(E.find_timer(id, M.timers(before))) : U32)))) + clear_completed(rest, before, after) : U32)
    case _ <> rest: clear_completed(rest, before, after)
def inside_for(+world: M.World, +id: U32, items: List<&2, C.Work>) -> Bool:
  match items:
    case Nil{}: False{}
    case +work <> rest: Bool.or(Bool.and(U32.is_eq(M.number(E.id(work)), id), E.inside_world(world, work)), inside_for(world, id, rest))
def in_building(+world: M.World, token: P.Token) -> Bool:
  inside_for(world, P.id(token), M.work(M.core(world)))
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
def shield_allocation(+world: M.World) -> Shielded:
  +result = shields(List.reverse(&2, M.Tower, M.towers(world)), world, Nil{}, (building_pressure_bytes(world) >= 160 : U32))
  Shielded{List.reverse(&2, M.Tower, shield_towers(result)), shield_bytes(result)}
def residual_damage(+world: M.World) -> U32:
  +raw = building_pressure_bytes(world)
  +result = shield_allocation(world)
  Bool.pick(U32, (raw >= 160 : U32), M.sub(200, ((200 * shield_bytes(result)) / U32.max(1, raw) : U32)), 0)
def damage(+world: M.World) -> M.World:
  match world:
    case M.World{core, t, p, l, c, g, +h, towers, timers, a, o, r, cl, d, out, auto, x, y, selected, +work, +flash}:
      +raw = building_pressure_bytes(world)
      +guard = shield_allocation(world)
      +pulse = Bool.pick(U32, (raw >= 160 : U32), M.sub(200, ((200 * shield_bytes(guard)) / U32.max(1, raw) : U32)), 0)
      +total = (work + pulse : U32)
      +hit = Bool.and((total >= 10000 : U32), (h > 0 : U32))
      M.World{core, t, p, l, c, g, M.sub(h, Bool.to_u32(hit)), shield_towers(guard), timers, a, o, r, cl, d, out, auto, x, y, selected,
        (total % 10000 : U32), Bool.pick(U32, hit, 10, M.sub(flash, 1))}

def start(world: M.World) -> M.World:
  match world:
    case M.World{core, _, p, l, c, g, h, towers, timers, _, _, r, cl, d, out, auto, x, y, selected, work, flash}:
      M.World{core, 0, p, l, c, g, h, towers, timers, True{}, 0, r, cl, d, out, auto, x, y, selected, work, flash}
def finish_active(+world: M.World) -> M.World:
  match world:
    case M.World{core, t, p, l, c, g, h, ts, ms, +a, +o, r, cl, d, out, auto, x, y, selected, work, flash}:
      M.World{core, t, p, l, c, g, h, ts, ms,
        Bool.and(a, Bool.not(Bool.and((o >= 8 : U32), Bool.and(Nat.is_eq(List.length(&2, C.Work, M.work(core)), 0n), Bool.and(U32.is_eq(P.writes(world), 0), U32.is_eq(P.leases(world), 0)))))),
        o, r, cl, d, out, auto, x, y, selected, work, flash}
def ticking(+world: M.World) -> M.World:
  match world:
    case M.World{+core, +t, p, l, c, g, h, towers, timers, +a, +offered, r, +cl, d, out, auto, x, y, selected, work, flash}:
      +armed = E.shoot_world(world)
      +next = progress(M.work(core), core, armed)
      +clear = clear_completed(M.work(core), armed, next)
      +offer = Bool.and(a, Bool.and((offered < 8 : U32), U32.is_eq((t % 200 : U32), 0)))
      +next = Bool.pick(C.State, offer, event(next, C.AdmitObservation{1n, 1n, 1n}), next)
      +next = Bool.pick(C.State, Bool.and(a, Bool.and((offered >= 8 : U32), U32.is_eq(P.deciding(M.with_core(world, next)), 0))),
        event(next, C.StopPolled{1n, 1n, 1n, (t >= 5000 : U32)}), next)
      +updated: M.World = M.World{next, (t + 1 : U32), p, l, c, g, h, M.towers(armed), E.refresh(armed, next, (offered + Bool.to_u32(offer) : U32)),
        a, (offered + Bool.to_u32(offer) : U32), r, (cl + clear : U32), d, out, auto, x, y, selected, work, flash}
      +delivered = O.tick(updated)
      finish_active(damage(delivered))
def tick(+world: M.World) -> M.World:
  +ready = Bool.pick(M.World, Bool.and(M.auto(world), Bool.and(Bool.not(M.active(world)), Bool.and(U32.is_eq(M.offered(world), 0), (M.time(world) >= 150 : U32)))), start(world), world)
  Bool.pick(M.World, M.paused(world), world, ticking(ready))
def move(world: M.World, x: U32, y: U32) -> M.World:
  match world:
    case M.World{core, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, out, auto, _, _, selected, work, flash}:
      M.World{core, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, out, auto, x, y, selected, work, flash}
def map_free(+world: M.World) -> Bool:
  Bool.and(Bool.and(Bool.not(M.active(world)), Nat.is_eq(List.length(&2, M.Tower, M.towers(world)), 0n)), Bool.and(Nat.is_eq(List.length(&2, C.Work, M.work(M.core(world))), 0n), U32.is_eq(P.writes(world), 0)))
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
    case M.World{core, t, p, l, c, +g, h, +ts, ms, a, o, r, cl, d, out, auto, x, y, +selected, work, flash} Some{+tower}:
      Bool.pick(M.World, Bool.and((M.level(tower) < 3 : U32), (g >= upgrade_cost(M.level(tower)) : U32)),
        M.World{core, t, p, l, c, M.sub(g, upgrade_cost(M.level(tower))), h, upgrade_items(ts, selected), ms, a, o, r, cl, d, out, auto, x, y, selected, work, flash}, world)
    case _ _: world
def upgrade(+world: M.World) -> M.World:
  upgrade_found(world, selected_tower(M.towers(world), M.selected(world)))
def reset_found(world: M.World, layout: U32) -> M.World:
  match world:
    case M.World{core, t, p, _, c, g, h, ts, ms, a, o, r, cl, d, out, auto, x, y, selected, work, flash}:
      M.World{core, t, p, layout, c, g, h, ts, ms, a, o, r, cl, d, out, auto, x, y, selected, work, flash}

def reset_layout(layout: U32) -> M.World:
  match layout:
    case +l:
      world: M.World = initial()
      reset_found(world, l)
def key(+world: M.World, +code: U32) -> M.World:
  match world:
    case M.World{core, +t, +p, +l, +c, g, h, ts, ms, +a, +o, r, cl, d, out, +auto, x, y, +selected, work, flash}:
      +layout = Bool.pick(U32, Bool.and(U32.is_eq(code, 9), map_free(world)), ((l + 1) % 3 : U32), l)
      +choose = Bool.and((code >= 49 : U32), (code <= 55 : U32))
      +next: M.World = M.World{core, Bool.pick(U32, Bool.and(U32.is_eq(code, 97), Bool.not(auto)), 0, t),
        Bool.pick(Bool, U32.is_eq(code, 32), Bool.not(p), p), layout, Bool.pick(U32, choose, (code - 49 : U32), c), g, h, ts, ms,
        a, o, r, cl, d, out, Bool.pick(Bool, U32.is_eq(code, 97), Bool.not(auto), auto), x, y, Bool.pick(U32, choose, 0, selected), work, flash}
      Bool.pick(M.World, U32.is_eq(code, 114), reset_layout(layout),
        Bool.pick(M.World, U32.is_eq(code, 117), upgrade(next),
          Bool.pick(M.World, Bool.and(U32.is_eq(code, 110), Bool.and(Bool.not(a), U32.is_eq(o, 0))), start(next), next)))

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
    case M.World{core, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, out, auto, x, y, _, work, flash}:
      M.World{core, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, out, auto, x, y, index, work, flash}
def build(+world: M.World, +x: U32, +y: U32, +kind: U32) -> M.World:
  match world:
    case M.World{core, t, p, l, c, +g, +h, ts, ms, a, o, r, cl, d, out, auto, mx, my, _, work, flash}:
      Bool.pick(M.World, Bool.and(placement_valid(world, x, y), Bool.and((g >= tower_cost(kind) : U32), Bool.and((kind < 7 : U32), (h > 0 : U32)))),
        M.World{core, t, p, l, c, M.sub(g, tower_cost(kind)), h, M.Tower{snap(x), snap(y), kind, 1, 0, 0, 0n, 240} <> ts,
          ms, a, o, r, cl, d, out, auto, mx, my, 0, work, flash}, world)
def click(+world: M.World, +x: U32, +y: U32) -> M.World:
  +index = tower_hit(M.towers(world), x, y, 1)
  Bool.pick(M.World, (index > 0 : U32), select(move(world, x, y), index), build(move(world, x, y), x, y, M.choice(world)))
def preview_site(+world: M.World, x: U32, y: U32, kind: U32) -> U32:
  support_site(world, M.Tower{snap(x), snap(y), kind, 1, 0, 0, 0n, 240})
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
          Bool.pick(U32, Nat.is_eq(preview_target(world, x, y, kind), 0n), 0, U32.min(before, tower_power(kind, 1)))))))
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
def point_work(+world: M.World, +work: C.Work) -> Map.Point:
  +phase = E.kind(work)
  +age = E.age(E.id(work), phase, M.timers(world))
  +anchor = E.anchor(world, work)
  +effort = E.effort(world, work)
  +inside = Map.path_position(Map.micro_route(anchor),
    ((U32.min(E.duration(world, work), effort) * Map.path_length(Map.micro_route(anchor))) / U32.max(1, E.duration(world, work)) : U32))
  Bool.pick(Map.Point, U32.is_eq(phase, 0), Map.path_position(Map.source_route(M.layout(world)), age),
    Bool.pick(Map.Point, Bool.and(U32.is_eq(phase, 4), Bool.not(E.inside_world(world, work))), Map.Point{(Map.px(anchor) + 32 : U32), Map.py(anchor)},
    Bool.pick(Map.Point, U32.is_eq(phase, 3), Map.path_position(Map.review_route(M.layout(world), E.lane(world, work)), age),
      Bool.pick(Map.Point, U32.is_eq(phase, 2),
        Bool.pick(Map.Point, (age < travel_ticks(world, 2, 0) : U32), Map.path_position(Map.preparation_route(M.layout(world)), age), inside),
        Bool.pick(Map.Point, U32.is_eq(phase, 5),
          Bool.pick(Map.Point, (age < travel_ticks(world, 5, 0) : U32), Map.path_position(Map.retained_route(M.layout(world)), age), Map.path_position(Map.micro_route(anchor), U32.min(90, M.sub(age, travel_ticks(world, 5, 0))))), inside)))))
def point_found(world: M.World, found: Maybe<&2, C.Work>) -> Map.Point:
  match found:
    case Some{work}: point_work(world, work)
    case None{}: Map.Point{24, 100}
def unit_point(+world: M.World, token: P.Token) -> Map.Point:
  point_found(world, E.find_work(U32.to_nat(P.id(token)), M.work(M.core(world))))
