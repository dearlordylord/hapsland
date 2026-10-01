# Synthetic source/backend latency; authoritative product state is imported, never reimplemented.
import Base
import ./DefenseModel.bend as M
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ../../packages/agent-flow-bend/Handoff.bend as Handoff
import ./DefenseProjection.bend as P
import ../../packages/agent-flow-bend/CollectionState.bend as Collection

def apply(result: C.Step) -> C.State:
  match result:
    case C.Advanced{state, _}: state
    case C.Rejected{state, _}: state

def event(state: C.State, fact: C.CanonicalEvent) -> C.State:
  apply(C.step(state, fact))

def initial() -> M.World:
  M.World{event(C.initial(Ledger.Limits{18n, 240n, 18n, 240n}), C.OpenRound{1n, 1n}),
    0, False{}, 0, 0, 120, 100, Nil{}, Nil{}, False{}, 0, 0, 0, 0, 0, False{}}

def owned(+kind: U32, towers: List<&2, M.Tower>) -> Bool:
  match towers:
    case Nil{}: False{}
    case M.Tower{_, _, k} <> rest: Bool.or(U32.is_eq(kind, k), owned(kind, rest))

def timer_age(+id: Nat, +phase: U32, timers: List<&2, M.Timer>) -> U32:
  match timers:
    case Nil{}: 0
    case M.Timer{candidate, p, age} <> rest:
      Bool.pick(U32, Bool.and(Nat.is_eq(id, candidate), U32.is_eq(phase, p)), age,
        timer_age(id, phase, rest))

def refresh(items: List<&2, C.Work>, +timers: List<&2, M.Timer>) -> List<&2, M.Timer>:
  match items:
    case Nil{}: Nil{}
    case C.Work{_, _, _, +id, _, +kind, _} <> rest:
      M.Timer{id, M.phase(kind), (timer_age(id, M.phase(kind), timers) + 1 : U32)} <> refresh(rest, timers)

def has_preparation(+parent: Nat, items: List<&2, C.Work>) -> Bool:
  match items:
    case Nil{}: False{}
    case C.Work{_, _, _, _, _, C.Preparing{}, owner} <> rest:
      Bool.or(Nat.is_eq(parent, owner), has_preparation(parent, rest))
    case _ <> rest: has_preparation(parent, rest)

def unfinished_sibling(+parent: Nat, items: List<&2, C.Work>) -> Bool:
  match items:
    case Nil{}: False{}
    case C.Work{_, _, _, _, _, C.PendingFinding{_}, owner} <> rest:
      Bool.or(Nat.is_eq(parent, owner), unfinished_sibling(parent, rest))
    case _ <> rest: unfinished_sibling(parent, rest)

def request_for(+operation: Nat, requests: List<&2, Dispatch.Request>) -> Nat:
  match requests:
    case Nil{}: 0n
    case Dispatch.Request{_, _, _, op, id, _, _} <> rest:
      Bool.pick(Nat, Nat.is_eq(operation, op), id, request_for(operation, rest))

def requests(state: Dispatch.State) -> List<&2, Dispatch.Request>:
  match state:
    case Dispatch.State{_, _, _, _, items}: items

# Fixture outcome is stable by authored unit size, independent of scheduling IDs.
def unit_bytes(+id: Nat, items: List<&2, C.Work>, +ledger: Ledger.Ledger) -> Nat:
  match items:
    case Nil{}: 0n
    case C.Work{_, _, _, candidate, charge, _, _} <> rest:
      Bool.pick(Nat, Nat.is_eq(id, candidate), P.charge_bytes(charge, P.charges(ledger)), unit_bytes(id, rest, ledger))
def outcome(+state: C.State, id: Nat) -> C.RequestOutcome:
  Bool.pick(C.RequestOutcome, Nat.is_eq(unit_bytes(id, M.work(state), P.ledger(state)), 10n), C.RequestClear{}, C.RequestFinding{})

def running_entries(state: Dispatch.State) -> List<&2, Dispatch.Entry>:
  match state:
    case Dispatch.State{_, entries, _, _, _}: entries

def preparation_running(+state: C.State, +part: Nat, +life: Nat, +round: Nat, +id: Nat) -> Bool:
  Dispatch.contains(running_entries(M.dispatch(state)), part, life, round, id)

def preparation_after(+state: C.State, +part: Nat, +life: Nat, +round: Nat,
    +id: Nat, +parent: Nat) -> C.State:
  Bool.pick(C.State, Bool.not(has_preparation(parent, M.work(state))),
    event(event(state, C.CompleteObservation{part, life, round, parent}), C.DispatchSettled{part, life, round, parent}), state)
def preparation_finished(state: C.State, +part: Nat, +life: Nat, +round: Nat, +id: Nat, parent: Nat) -> C.State:
  preparation_after(event(state, C.PreparationCompleted{part, life, round, id, 10n <> 20n <> Nil{}}),
    part, life, round, id, parent)

def progress_kind(+state: C.State, +part: Nat, +life: Nat, +round: Nat,
    +id: Nat, +parent: Nat, +age: U32, +towers: List<&2, M.Tower>, kind: C.WorkKind) -> C.State:
  match kind:
    case C.AwaitingSourceRead{}:
      +queued = event(state, C.QueueDispatch{part, life, round, id})
      Bool.pick(C.State, preparation_running(queued, part, life, round, id),
        event(queued, C.StartObservation{part, life, round, id}), queued)
    case C.SourceReading{}:
      Bool.pick(C.State, Bool.and((age >= 20 : U32), Bool.not(has_preparation(id, M.work(state)))),
        event(state, C.BeginObservedPreparation{part, life, round, id, 40n}), state)
    case C.Preparing{}:
      +queued = state
      duration = Bool.pick(U32, owned(0, towers), 35, 100)
      Bool.pick(C.State, Bool.and((age >= duration : U32), preparation_running(queued, part, life, round, parent)),
        preparation_finished(queued, part, life, round, id, parent), queued)
    case C.Reviewing{}:
      Bool.pick(C.State, Bool.and((age >= 20 : U32),
          Nat.is_lt(List.length(&2, Dispatch.Request, requests(M.dispatch(state))), Dispatch.max_requests())),
        event(state, C.JevRequestReady{part, life, round, id,
          True{}, True{}, True{}, True{}, True{}, True{}}), state)
    case C.AtJev{}:
      +request = request_for(id, requests(M.dispatch(state)))
      +base = Bool.pick(U32, owned(1, towers), 50, 160)
      +base = Bool.pick(U32, Nat.is_eq(unit_bytes(id, M.work(state), P.ledger(state)), 10n), (base * 2 : U32), base)
      duration = Bool.pick(U32, Bool.and(owned(2, towers), unfinished_sibling(parent, M.work(state))), 25, base)
      Bool.pick(C.State, (age >= duration : U32),
        event(state, C.JevRequestSettled{part, life, round, id, request, outcome(state, id), True{}}),
        event(state, C.JevRequestStarted{part, life, round, id, request}))
    case C.PendingFinding{_}:
      event(state, C.CollectionReady{id, part, life, round, parent, False{}})

def progress(items: List<&2, C.Work>, state: C.State, +timers: List<&2, M.Timer>, +towers: List<&2, M.Tower>) -> C.State:
  match items:
    case Nil{}: state
    case C.Work{part, life, round, +id, _, +kind, parent} <> rest:
      progress(rest, progress_kind(state, part, life, round, id, parent,
        timer_age(id, M.phase(kind), timers), towers, kind), timers, towers)

def tower_cost(kind: U32) -> U32:
  Bool.pick(U32, U32.is_eq(kind, 2), 40, 50)
def tower_name(kind: U32) -> String:
  match kind:
    case 0: "PREPARATION ENGINE"
    case 1: "BACKEND ENGINE"
    case _: "COORDINATOR"
def tower_detail(kind: U32) -> String:
  match kind:
    case 0: "SYNTHETIC PREP LATENCY 100 -> 35 TICKS"
    case 1: "BACKEND 160/320 -> 50/100 TICKS"
    case _: "BLOCKING SIBLING RESPONSE -> 25 TICKS"
def ready_ids(state: C.State) -> List<&2, Nat>:
  match state:
    case C.State{_, _, _, _, _, _, _, Collection.State{ids, _, _, _, _, _, _, _}, _}: ids
def reserve_submissions(items: List<&2, Nat>, state: C.State) -> C.State:
  match items:
    case Nil{}: state
    case +id <> rest:
      reserve_submissions(rest, event(event(state, C.CollectionReserveLease{id, 999n}),
          C.SubmissionBegin{id, 1n, 1n, 999n, Handoff.Stop{}, False{}, id <> Nil{}, id <> Nil{}}))
def submission_recorded(commands: List<&2, C.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case C.SubmissionRecorded{} <> _: True{}
    case _ <> rest: submission_recorded(rest)
def retire_recorded(+id: Nat, result: C.Step) -> C.State:
  match result:
    case C.Advanced{+state, commands}:
      Bool.pick(C.State, submission_recorded(commands),
        event(event(state, C.RetireReview{1n, 1n, 1n, id}), C.CollectionRetireAdvice{id}), state)
    case C.Rejected{state, _}: state

def terminal_submissions(items: List<&2, Nat>, state: C.State) -> C.State:
  match items:
    case Nil{}: state
    case +id <> rest:
      terminal_submissions(rest, retire_recorded(id, C.step(state, C.SubmissionTerminal{id, 999n, True{}})))
def authorize_submissions(items: List<&2, Nat>, state: C.State) -> C.State:
  match items:
    case Nil{}: state
    case id <> rest: authorize_submissions(rest, event(state, C.SubmissionAuthorize{id, 999n}))
def authorized(commands: List<&2, C.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case C.FinishAuthorized{} <> _: True{}
    case _ <> rest: authorized(rest)
def authorize_recorded(selected: List<&2, Nat>, result: C.Step) -> C.State:
  match result:
    case C.Advanced{+state, commands}:
      Bool.pick(C.State, authorized(commands), authorize_submissions(selected, state), state)
    case C.Rejected{state, _}: state

def acknowledged(commands: List<&2, C.Command>) -> Bool:
  match commands:
    case Nil{}: False{}
    case C.FinishRecorded{C.Acknowledged{}} <> _: True{}
    case _ <> rest: acknowledged(rest)
def recorded_terminal(selected: List<&2, Nat>, result: C.Step) -> C.State:
  match result:
    case C.Advanced{+core, commands}:
      Bool.pick(C.State, acknowledged(commands),
        event(terminal_submissions(selected, core), C.FinishEnd{1n, 1n, 1n, 999n}), core)
    case C.Rejected{core, _}: core

def delivery(+state: C.State, age: U32) -> C.State:
  match age:
    case 1:
      +selected = ready_ids(state)
      reserve_submissions(selected,
        event(state, C.FinishReserve{1n, 1n, 1n, 1n, 999n, selected, False{}, False{}, True{}, True{}, False{}}))
    case 20:
      +selected = ready_ids(state)
      authorize_recorded(selected, C.step(state, C.FinishAuthorize{1n, 1n, 1n, 999n, selected}))
    case 90:
      +selected = ready_ids(state)
      recorded_terminal(selected, C.step(state,
        C.FinishTerminal{1n, 1n, 1n, 999n, selected, C.Acknowledged{}}))
    case _: state

def start(state: M.World) -> M.World:
  match state:
    case M.World{core, t, p, l, c, g, h, towers, timers, _, _, r, clear, d, age, auto}:
      M.World{core, 0, p, l, c, g, h, towers, timers, True{}, 0, r, clear, d, age, auto}

def has_operation(+id: Nat, items: List<&2, C.Work>) -> Bool:
  match items:
    case Nil{}: False{}
    case C.Work{_, _, _, candidate, _, _, _} <> rest:
      Bool.or(Nat.is_eq(id, candidate), has_operation(id, rest))
def clear_completed(items: List<&2, C.Work>, +before: C.State, +after: C.State) -> U32:
  match items:
    case Nil{}: 0
    case C.Work{_, _, _, +id, _, C.AtJev{}, _} <> rest:
      (Bool.to_u32(Bool.and(Nat.is_eq(unit_bytes(id, M.work(before), P.ledger(before)), 10n),
        Bool.not(has_operation(id, M.work(after))))) + clear_completed(rest, before, after) : U32)
    case _ <> rest: clear_completed(rest, before, after)

def pending_units(items: List<&2, C.Work>) -> U32:
  match items:
    case Nil{}: 0
    case C.Work{_, _, _, _, _, C.PendingFinding{_}, _} <> rest: (1 + pending_units(rest) : U32)
    case _ <> rest: pending_units(rest)
def retired_units(before: List<&2, C.Work>, after: List<&2, C.Work>) -> U32:
  U32.sub(pending_units(before), pending_units(after))

# Game pressure counts actual charged occupants inside buildings, never safe roads.
def queued_entries(state: Dispatch.State) -> List<&2, Dispatch.Entry>:
  match state:
    case Dispatch.State{entries, _, _, _, _}: entries

def request_started_for(+operation: Nat, items: List<&2, Dispatch.Request>) -> Bool:
  match items:
    case Nil{}: False{}
    case Dispatch.Request{_, _, _, id, _, started, _} <> rest:
      Bool.or(Bool.and(Nat.is_eq(operation, id), started), request_started_for(operation, rest))

def kind_inside(+core: C.State, +part: Nat, +life: Nat, +round: Nat,
    +id: Nat, +parent: Nat, kind: C.WorkKind) -> Bool:
  match kind:
    case C.AwaitingSourceRead{}: False{}
    case C.Reviewing{}: False{}
    case C.SourceReading{}: preparation_running(core, part, life, round, id)
    case C.Preparing{}: preparation_running(core, part, life, round, parent)
    case C.AtJev{}: request_started_for(id, requests(M.dispatch(core)))
    case C.PendingFinding{_}: True{}

def work_inside(+core: C.State, work: C.Work) -> Bool:
  match work:
    case C.Work{+part, +life, +round, +id, _, kind, +parent}:
      Bool.and(kind_inside(core, part, life, round, id, parent, kind),
        Bool.not(Bool.or(Dispatch.contains(queued_entries(M.dispatch(core)), part, life, round, id),
          Dispatch.contains(queued_entries(M.dispatch(core)), part, life, round, parent))))

def work_id(work: C.Work) -> U32:
  match work:
    case C.Work{_, _, _, id, _, _, _}: M.number(id)
def inside_for(+core: C.State, +id: U32, items: List<&2, C.Work>) -> Bool:
  match items:
    case Nil{}: False{}
    case +work <> rest:
      Bool.or(Bool.and(U32.is_eq(work_id(work), id), work_inside(core, work)),
        inside_for(core, id, rest))

def in_building(+world: M.World, token: P.Token) -> Bool:
  inside_for(M.core(world), P.id(token), M.work(M.core(world)))

def inside_bytes(items: List<&2, C.Work>, +core: C.State, +seen: List<&2, Nat>) -> Nat:
  match items:
    case Nil{}: 0n
    case +work <> rest:
      match work:
        case C.Work{_, _, _, _, +charge, _, _}:
          +counted = Bool.and(work_inside(core, work), Bool.not(Collection.contains(charge, seen)))
          (Bool.pick(Nat, counted, P.charge_bytes(charge, P.charges(P.ledger(core))), 0n) +
            inside_bytes(rest, core, Bool.pick(List<&2, Nat>, counted, charge <> seen, seen)) : Nat)

def building_pressure(+core: C.State) -> Nat:
  inside_bytes(M.work(core), core, Nil{})
def building_pressure_bytes(world: M.World) -> U32:
  M.number(building_pressure(M.core(world)))

def ticking(state: M.World) -> M.World:
  match state:
    case M.World{+core, +t, +p, +l, +c, +g, +h, +towers, +timers, +active, +offered, +rejected, +clear, +delivered, +deliveryAge, +auto}:
      +next = progress(M.work(core), core, timers, towers)
      +newClear = clear_completed(M.work(core), core, next)
      +demand = Bool.and(active, Bool.and((offered < 8 : U32), U32.is_eq((t % 45 : U32), 0)))
      +next = Bool.pick(C.State, demand, event(next, C.AdmitObservation{1n, 1n, 1n}), next)
      +next = Bool.pick(C.State, Bool.and(active, (offered >= 8 : U32)),
        event(next, C.StopPolled{1n, 1n, 1n, (t >= 1000 : U32)}), next)
      +view: M.World = M.World{next, t, p, l, c, g, h, towers, timers, active, offered, rejected, clear, delivered, deliveryAge, auto}
      +age = Bool.pick(U32, Bool.or(Bool.and(Bool.and((P.ready(view) > 0 : U32), (P.deciding(view) > 0 : U32)), U32.is_eq(P.ready(view), pending_units(M.work(next)))), (deliveryAge > 0 : U32)), (deliveryAge + 1 : U32), 0)
      +done = U32.is_eq(age, 90)
      +result = delivery(next, age)
      +pressure = Bool.and(U32.is_eq((t % 50 : U32), 0), Nat.is_ge(building_pressure(result), 160n))
      M.World{result, (t + 1 : U32), p, l, c, g,
        Bool.pick(U32, Bool.and(pressure, (h > 0 : U32)), (h - 1 : U32), h), towers, refresh(M.work(result), timers),
        Bool.and(active, Bool.not(Bool.and((age >= 90 : U32), Nat.is_eq(List.length(&2, C.Work, M.work(result)), 0n)))), (offered + Bool.to_u32(demand) : U32), rejected, (clear + newClear : U32),
        (delivered + retired_units(M.work(next), M.work(result)) : U32), age, auto}

def tick(+state: M.World) -> M.World:
  +prepared = Bool.pick(M.World,
    Bool.and(M.auto(state), Bool.and(Bool.not(M.active(state)), Bool.and(U32.is_eq(M.offered(state), 0), (M.time(state) >= 150 : U32)))),
    start(state), state)
  Bool.pick(M.World, M.paused(state), state, ticking(prepared))

def key(state: M.World, +code: U32) -> M.World:
  match state:
    case M.World{core, +t, +p, +l, +c, g, h, towers, timers, +active, +offered, r, clear, d, age, +auto}:
      l = Bool.pick(U32, U32.is_eq(code, 9), ((l + 1) % 3 : U32), l)
      p = Bool.pick(Bool, U32.is_eq(code, 32), Bool.not(p), p)
      c = Bool.pick(U32, Bool.and((code >= 49 : U32), (code <= 51 : U32)), (code - 49 : U32), c)
      t = Bool.pick(U32, Bool.and(U32.is_eq(code, 97), Bool.and(Bool.not(auto), Bool.and(Bool.not(active), U32.is_eq(offered, 0)))), 0, t)
      +s: M.World = M.World{core, t, p, l, c, g, h, towers, timers, active, offered, r, clear, d, age,
        Bool.pick(Bool, U32.is_eq(code, 97), Bool.not(auto), auto)}
      Bool.pick(M.World, U32.is_eq(code, 114), initial(),
        Bool.pick(M.World, Bool.and(U32.is_eq(code, 110), Bool.and(Bool.not(active), U32.is_eq(offered, 0))), start(s), s))

def buy(+state: M.World, +kind: U32) -> M.World:
  match state:
    case M.World{core, t, p, l, c, +g, h, +towers, timers, active, o, r, clear, d, age, auto}:
      +cost = tower_cost(kind)
      Bool.pick(M.World, Bool.and((g >= cost : U32), Bool.not(owned(kind, towers))),
        M.World{core, t, p, l, c, (g - cost : U32), h,
          M.Tower{908, (139 + kind * 68 : U32), kind} <> towers, timers, active, o, r, clear, d, age, auto},
        state)

def button(+x: U32, +y: U32, lo: U32, hi: U32) -> Bool:
  Bool.and(Bool.and((x >= 808 : U32), (x <= 1008 : U32)), Bool.and((y >= lo : U32), (y <= hi : U32)))
def click(+state: M.World, +x: U32, +y: U32) -> M.World:
  Bool.pick(M.World, button(x, y, 112, 166), buy(state, 0),
    Bool.pick(M.World, button(x, y, 180, 234), buy(state, 1),
      Bool.pick(M.World, button(x, y, 248, 302), buy(state, 2), state)))
