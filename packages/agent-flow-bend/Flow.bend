import Base

# One advicee's virtual round. Runtime identity and native hook proof remain at
# the adapter boundary; every admitted packet has exactly one primary location.
type Place is Data:
  EditQueue{}
  Preparation{}
  ReviewQueue{}
  Jev{}
  AdviceStore{}
  AdvicePolicy{}

type Packet is Data:
  Packet{id: Nat, at: Place}

type Surface is Data:
  Background{}
  Stop{}

# Each limb stays within Bend's immediate Nat range. JS safe integers use at
# most a 48-bit low limb and a 5-bit high limb.
type Capacity is Data:
  Capacity{low: Nat, high: Nat}

def capacity_valid(capacity: Capacity) -> Bool:
  match capacity:
    case Capacity{low, high}:
      Bool.or(Nat.is_gt(high, 0n), Nat.is_gt(low, 0n))

def has_room(occupied: Nat, capacity: Capacity) -> Bool:
  match capacity:
    case Capacity{low, high}:
      Bool.or(Nat.is_gt(high, 0n), Nat.is_lt(occupied, low))

type Flow is Data:
  Flow{
    packets: List<&2, Packet>, next_id: Nat,
    source_capacity: Capacity, review_capacity: Capacity,
    round_id: Nat, active: Bool, continuations: Nat, waiting: Bool,
    background_available: Bool, lease: Maybe<&2, Surface>, leased_id: Maybe<&2, Nat>,
    last_surface: Maybe<&2, Surface>, last_id: Maybe<&2, Nat>,
    background_submitted: List<&2, Nat>
  }

type FlowEvent is Data:
  EditObserved{}
  ReviewUnitPrepared{}
  JevFindingReceived{}
  JevClearReceived{}
  JevUnavailable{}
  StopHookFired{}
  FinishDecisionDeadlineReached{}
  FinishDecisionAllWorkSettled{}
  FinishDecisionBudgetExhausted{}
  AdviceLeasedByBackground{}
  AdviceLeasedByStop{}
  AdviceReofferedAtStop{}
  HostOutputSubmitted{}
  SourceCapacitySet{capacity: Capacity}
  ReviewCapacitySet{capacity: Capacity}
  IngressStarted{}
  UnitDispatched{}
  JevRequestSent{}
  BackgroundWaitStarted{}
  StopAllowed{}
  FinishResponseRequested{}

type Rejection is Data:
  VirtualRoundClosed{}
  StopNotWaiting{}
  UnexpectedControl{}
  BackgroundAlreadySubmitted{}
  BackgroundNotRequested{}
  StopNotRequested{}
  FinishDecisionAlreadyOpen{}
  ContinuationBudgetExhausted{}
  ReofferNeedsBackground{}
  StopNeedsFreshAdvice{}
  LeaseBusy{}
  NoLease{}
  MissingPacket{}
  DispatchCapacityReached{}
  QueueOrder{}
  InvalidCapacity{}
  InternalEvent{}
  WorkStillPending{}

type Decision is Data:
  NoDecision{}
  ContinueWithAdvice{ids: List<&2, Nat>, discarded: List<&2, Nat>, cancelled_source: List<&2, Nat>, cancelled_jev: List<&2, Nat>}
  AllowFinish{discarded: List<&2, Nat>, cancelled_source: List<&2, Nat>, cancelled_jev: List<&2, Nat>}

# Stable route metadata is part of the Bend domain, not a second TS table.
type Node is Data:
  AgentEditNode{}
  EditQueueNode{}
  PreparationNode{}
  ReviewQueueNode{}
  JevDispatchNode{}
  JevNode{}
  AdviceStoreNode{}
  AdvicePolicyNode{}
  ResponseCommandNode{}
  ObservedWriteNode{}
  DeliveryStateNode{}
  OutcomeStoreNode{}

type Flavor is Data:
  EditObservation{}
  CaptureJob{}
  ReviewWorkItem{}
  DecisionRequest{}
  NetworkRequest{}
  Advice{}
  LeasedBatch{}
  RuntimeSubmission{}
  ReviewStatus{}

type Signal is Data:
  BackgroundSignal{}
  StopSignal{}
  SettledSignal{}
  DeadlineSignal{}
  AllowSignal{}
  ResponseSignal{}

type Route is Data:
  DataRoute{from: Node, to: Node, input: Flavor, output: Flavor, copy: Bool}
  ControlRoute{from: Node, to: Node, signal: Signal}

def route_of(event: FlowEvent) -> Route:
  match event:
    case EditObserved{}:
      DataRoute{AgentEditNode{}, EditQueueNode{}, EditObservation{}, CaptureJob{}, False{}}
    case IngressStarted{}:
      DataRoute{EditQueueNode{}, PreparationNode{}, CaptureJob{}, CaptureJob{}, False{}}
    case ReviewUnitPrepared{}:
      DataRoute{PreparationNode{}, ReviewQueueNode{}, CaptureJob{}, ReviewWorkItem{}, False{}}
    case UnitDispatched{}:
      DataRoute{ReviewQueueNode{}, JevDispatchNode{}, ReviewWorkItem{}, DecisionRequest{}, False{}}
    case JevRequestSent{}:
      DataRoute{JevDispatchNode{}, JevNode{}, DecisionRequest{}, NetworkRequest{}, False{}}
    case JevFindingReceived{}:
      DataRoute{JevNode{}, AdviceStoreNode{}, NetworkRequest{}, Advice{}, False{}}
    case JevClearReceived{}:
      DataRoute{JevNode{}, OutcomeStoreNode{}, NetworkRequest{}, ReviewStatus{}, False{}}
    case JevUnavailable{}:
      DataRoute{JevNode{}, OutcomeStoreNode{}, NetworkRequest{}, ReviewStatus{}, False{}}
    case BackgroundWaitStarted{}:
      ControlRoute{AgentEditNode{}, AdvicePolicyNode{}, BackgroundSignal{}}
    case StopHookFired{}:
      ControlRoute{AgentEditNode{}, AdvicePolicyNode{}, StopSignal{}}
    case FinishDecisionAllWorkSettled{}:
      ControlRoute{DeliveryStateNode{}, AdvicePolicyNode{}, SettledSignal{}}
    case FinishDecisionDeadlineReached{}:
      ControlRoute{DeliveryStateNode{}, AdvicePolicyNode{}, DeadlineSignal{}}
    case FinishDecisionBudgetExhausted{}:
      ControlRoute{DeliveryStateNode{}, AdvicePolicyNode{}, AllowSignal{}}
    case AdviceLeasedByBackground{}:
      DataRoute{AdviceStoreNode{}, AdvicePolicyNode{}, Advice{}, LeasedBatch{}, True{}}
    case AdviceLeasedByStop{}:
      DataRoute{AdviceStoreNode{}, AdvicePolicyNode{}, Advice{}, LeasedBatch{}, True{}}
    case AdviceReofferedAtStop{}:
      DataRoute{AdviceStoreNode{}, AdvicePolicyNode{}, Advice{}, LeasedBatch{}, True{}}
    case HostOutputSubmitted{}:
      DataRoute{AdvicePolicyNode{}, ObservedWriteNode{}, LeasedBatch{}, RuntimeSubmission{}, False{}}
    case StopAllowed{}:
      ControlRoute{AdvicePolicyNode{}, DeliveryStateNode{}, AllowSignal{}}
    case FinishResponseRequested{}:
      ControlRoute{AdvicePolicyNode{}, ResponseCommandNode{}, ResponseSignal{}}
    case SourceCapacitySet{_}:
      ControlRoute{AdvicePolicyNode{}, AdvicePolicyNode{}, AllowSignal{}}
    case ReviewCapacitySet{_}:
      ControlRoute{AdvicePolicyNode{}, AdvicePolicyNode{}, AllowSignal{}}

type FlowChange is Data:
  Transition{event: FlowEvent, route: Route, item: Maybe<&2, Nat>}
  CapacityChanged{source: Bool, before: Capacity, after: Capacity}
  RoundOpened{id: Nat}
  RoundClosed{id: Nat, discarded: Nat}
  Emitted{event: FlowEvent, at: Node, item: Nat}
  FinishDecision{decision: Decision}

type Step is Data:
  Accepted{state: Flow, decision: Decision, settled: Flow}
  Rejected{state: Flow, reason: Rejection}

def initial() -> Flow:
  Flow{Nil{}, 1n, Capacity{3n, 0n}, Capacity{3n, 0n}, 0n, False{}, 0n, False{}, False{}, None{}, None{}, None{}, None{}, Nil{}}

def same_place(a: Place, b: Place) -> Bool:
  match a b:
    case EditQueue{} EditQueue{}:
      True{}
    case Preparation{} Preparation{}:
      True{}
    case ReviewQueue{} ReviewQueue{}:
      True{}
    case Jev{} Jev{}:
      True{}
    case AdviceStore{} AdviceStore{}:
      True{}
    case AdvicePolicy{} AdvicePolicy{}:
      True{}
    case _ _:
      False{}

def at(place: Place, packet: Packet) -> Bool:
  match packet:
    case Packet{_, location}:
      same_place(location, place)

def count(+place: Place, packets: List<&2, Packet>) -> Nat:
  match packets:
    case Nil{}:
      0n
    case p <> rest:
      (Bool.pick(Nat, at(place, p), 1n, 0n) + count(place, rest) : Nat)

def ids.pick(id: Nat, rest: List<&2, Nat>, hit: Bool) -> List<&2, Nat>:
  match hit:
    case True{}:
      id <> rest
    case False{}:
      rest

def ids(+place: Place, packets: List<&2, Packet>) -> List<&2, Nat>:
  match packets:
    case Nil{}:
      Nil{}
    case Packet{+id, +location} <> rest:
      ids.pick(id, ids(place, rest), same_place(location, place))

def contains(+id: Nat, xs: List<&2, Nat>) -> Bool:
  match xs:
    case Nil{}:
      False{}
    case +x <> rest:
      Bool.or(Nat.is_eq(x, id), contains(id, rest))

def unfinished(packets: List<&2, Packet>) -> Bool:
  match packets:
    case Nil{}:
      False{}
    case Packet{_, place} <> rest:
      match place:
        case EditQueue{}:
          True{}
        case Preparation{}:
          True{}
        case ReviewQueue{}:
          True{}
        case Jev{}:
          True{}
        case _:
          unfinished(rest)

def find.id_match(id: Nat, fallback: Maybe<&2, Nat>, hit: Bool) -> Maybe<&2, Nat>:
  match hit:
    case True{}:
      Some{id}
    case False{}:
      fallback

def find.pick(+id: Nat, +selected: Maybe<&2, Nat>, fallback: Maybe<&2, Nat>, same_place: Bool) -> Maybe<&2, Nat>:
  match selected same_place:
    case _ False{}:
      fallback
    case None{} True{}:
      Some{id}
    case Some{wanted} True{}:
      find.id_match(id, fallback, Nat.is_eq(wanted, id))

def find(+place: Place, +selected: Maybe<&2, Nat>, packets: List<&2, Packet>) -> Maybe<&2, Nat>:
  match packets:
    case Nil{}:
      None{}
    case Packet{+id, +location} <> rest:
      find.pick(id, selected, find(place, selected, rest), same_place(location, place))

def move_one.pick(+pid: Nat, location: Place, tail: List<&2, Packet>, target: Place, copy: Bool, hit: Bool) -> List<&2, Packet>:
  match copy hit:
    case True{} True{}:
      Packet{pid, location} <> List.append(&2, Packet, tail, Packet{pid, target} <> Nil{})
    case False{} True{}:
      List.append(&2, Packet, tail, Packet{pid, target} <> Nil{})
    case _ False{}:
      Packet{pid, location} <> tail

def move_one(+id: Nat, +source: Place, +target: Place, +copy: Bool, packets: List<&2, Packet>) -> List<&2, Packet>:
  match packets:
    case Nil{}:
      Nil{}
    case Packet{+pid, +location} <> rest:
      hit = Bool.and(Nat.is_eq(pid, id), same_place(location, source))
      tail = move_one(id, source, target, copy, rest)
      move_one.pick(pid, location, tail, target, copy, hit)

def remove_one.pick(pid: Nat, location: Place, tail: List<&2, Packet>, hit: Bool) -> List<&2, Packet>:
  match hit:
    case True{}:
      tail
    case False{}:
      Packet{pid, location} <> tail

def remove_one(+id: Nat, +source: Place, packets: List<&2, Packet>) -> List<&2, Packet>:
  match packets:
    case Nil{}:
      Nil{}
    case Packet{+pid, +location} <> rest:
      hit = Bool.and(Nat.is_eq(pid, id), same_place(location, source))
      remove_one.pick(pid, location, remove_one(id, source, rest), hit)

# Walk each queue in insertion order. Lowering a capacity never evicts active work.
def fill_source(packets: List<&2, Packet>, +capacity: Capacity, +occupied: Nat) -> List<&2, Packet>:
  match packets:
    case Nil{}:
      Nil{}
    case Packet{+id, +location} <> rest:
      match location:
        case EditQueue{}:
          +room = has_room(occupied, capacity)
          new_place = Bool.pick(Place, room, Preparation{}, EditQueue{})
          new_occupied = (occupied + Bool.pick(Nat, room, 1n, 0n) : Nat)
          Packet{id, new_place} <> fill_source(rest, capacity, new_occupied)
        case _:
          Packet{id, location} <> fill_source(rest, capacity, occupied)

def fill_jev(packets: List<&2, Packet>, +capacity: Capacity, +occupied: Nat) -> List<&2, Packet>:
  match packets:
    case Nil{}:
      Nil{}
    case Packet{+id, +location} <> rest:
      match location:
        case ReviewQueue{}:
          +room = has_room(occupied, capacity)
          new_place = Bool.pick(Place, room, Jev{}, ReviewQueue{})
          new_occupied = (occupied + Bool.pick(Nat, room, 1n, 0n) : Nat)
          Packet{id, new_place} <> fill_jev(rest, capacity, new_occupied)
        case _:
          Packet{id, location} <> fill_jev(rest, capacity, occupied)

def settle(flow: Flow) -> Flow:
  match flow:
    case Flow{+packets, next_id, +source_capacity, +review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, background_submitted}:
      match active:
        case False{}:
          Flow{packets, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, background_submitted}
        case True{}:
          +started = fill_source(packets, source_capacity, count(Preparation{}, packets))
          Flow{fill_jev(started, review_capacity, count(Jev{}, started)), next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, background_submitted}

def replace_packets(flow: Flow, new_packets: List<&2, Packet>) -> Flow:
  match flow:
    case Flow{_, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, background_submitted}:
      Flow{new_packets, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, background_submitted}

def has_lease(lease: Maybe<&2, Surface>) -> Bool:
  match lease:
    case None{}:
      False{}
    case Some{_}:
      True{}

def work_pending(flow: Flow) -> Bool:
  match flow:
    case Flow{packets, _, _, _, _, _, _, _, _, lease, _, _, _, _}:
      Bool.or(unfinished(packets), has_lease(lease))

def distinct.pick(id: Nat, tail: List<&2, Nat>, known: Bool) -> List<&2, Nat>:
  match known:
    case True{}:
      tail
    case False{}:
      id <> tail

def distinct(xs: List<&2, Nat>, +seen: List<&2, Nat>) -> List<&2, Nat>:
  match xs:
    case Nil{}:
      Nil{}
    case +id <> rest:
      distinct.pick(id, distinct(rest, id <> seen), contains(id, seen))

def all_ids(packets: List<&2, Packet>) -> List<&2, Nat>:
  match packets:
    case Nil{}:
      Nil{}
    case Packet{id, _} <> rest:
      id <> all_ids(rest)

def discarded.pick(id: Nat, tail: List<&2, Nat>, keep: Bool) -> List<&2, Nat>:
  match keep:
    case True{}:
      tail
    case False{}:
      id <> tail

def discarded(ids_all: List<&2, Nat>, +advice: List<&2, Nat>, +keep_advice: Bool) -> List<&2, Nat>:
  match ids_all:
    case Nil{}:
      Nil{}
    case +id <> rest:
      discarded.pick(id, discarded(rest, advice, keep_advice), Bool.and(keep_advice, contains(id, advice)))

def finish.choose(+original: Flow, +packets: List<&2, Packet>, +next_id: Nat, +source_capacity: Capacity, +review_capacity: Capacity, +round_id: Nat, +continuations: Nat, submitted: List<&2, Nat>, +advice: List<&2, Nat>, can_continue: Bool) -> Step:
  match can_continue:
    case True{}:
      dropped = discarded(distinct(all_ids(packets), Nil{}), advice, True{})
      decision = {ContinueWithAdvice{advice, dropped, ids(Preparation{}, packets), ids(Jev{}, packets)} : Decision}
      Accepted{Flow{Nil{}, next_id, source_capacity, review_capacity, round_id, True{}, (continuations + 1n : Nat), False{}, False{}, None{}, None{}, None{}, None{}, Nil{}}, decision, original}
    case False{}:
      decision = {AllowFinish{distinct(all_ids(packets), Nil{}), ids(Preparation{}, packets), ids(Jev{}, packets)} : Decision}
      Accepted{Flow{Nil{}, next_id, source_capacity, review_capacity, round_id, False{}, continuations, False{}, False{}, None{}, None{}, None{}, None{}, Nil{}}, decision, original}

def finish(+flow: Flow) -> Step:
  match flow:
    case Flow{+packets, next_id, source_capacity, review_capacity, round_id, _, +continuations, _, _, _, _, _, _, +submitted}:
      +advice = ids(AdviceStore{}, packets)
      can_continue = Bool.and(Bool.not(List.is_empty(&2, Nat, advice)), Nat.is_lt(continuations, 4n))
      finish.choose(flow, packets, next_id, source_capacity, review_capacity, round_id, continuations, submitted, advice, can_continue)

def ready_to_finish(+flow: Flow) -> Bool:
  match flow:
    case Flow{_, _, _, _, _, _, _, +waiting, _, _, _, _, _, _}:
      Bool.and(waiting, Bool.not(work_pending(flow)))

def accept.after(+flow: Flow, ready: Bool) -> Step:
  match ready:
    case True{}:
      finish(flow)
    case False{}:
      Accepted{flow, NoDecision{}, flow}

def accept(flow: Flow) -> Step:
  +settled = settle(flow)
  accept.after(settled, ready_to_finish(settled))

def reject(flow: Flow, reason: Rejection) -> Step:
  Rejected{flow, reason}

def edit.open(packets: List<&2, Packet>, +next_id: Nat, source_capacity: Capacity, review_capacity: Capacity, round_id: Nat, active: Bool, continuations: Nat, waiting: Bool, lease: Maybe<&2, Surface>, leased_id: Maybe<&2, Nat>, last_surface: Maybe<&2, Surface>, last_id: Maybe<&2, Nat>, background_submitted: List<&2, Nat>) -> Step:
  match active:
    case True{}:
      accept(Flow{List.append(&2, Packet, packets, Packet{next_id, EditQueue{}} <> Nil{}), (next_id + 1n : Nat), source_capacity, review_capacity, round_id, True{}, continuations, waiting, True{}, lease, leased_id, last_surface, last_id, background_submitted})
    case False{}:
      accept(Flow{Packet{next_id, EditQueue{}} <> Nil{}, (next_id + 1n : Nat), source_capacity, review_capacity, (round_id + 1n : Nat), True{}, 0n, False{}, True{}, None{}, None{}, None{}, None{}, Nil{}})

def edit(flow: Flow) -> Step:
  match flow:
    case Flow{packets, +next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, _, lease, leased_id, last_surface, last_id, background_submitted}:
      edit.open(packets, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, lease, leased_id, last_surface, last_id, background_submitted)

def set_capacity.valid(flow: Flow, capacity: Capacity, source: Bool) -> Step:
  match flow source:
    case Flow{packets, next_id, _, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, background_submitted} True{}:
      accept(Flow{packets, next_id, capacity, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, background_submitted})
    case Flow{packets, next_id, source_capacity, _, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, background_submitted} False{}:
      accept(Flow{packets, next_id, source_capacity, capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, background_submitted})

def set_capacity.choose(flow: Flow, capacity: Capacity, source: Bool, valid: Bool) -> Step:
  match valid:
    case False{}:
      reject(flow, InvalidCapacity{})
    case True{}:
      set_capacity.valid(flow, capacity, source)

def set_capacity(flow: Flow, +capacity: Capacity, source: Bool) -> Step:
  set_capacity.choose(flow, capacity, source, capacity_valid(capacity))

def stop.budget(packets: List<&2, Packet>, next_id: Nat, source_capacity: Capacity, review_capacity: Capacity, round_id: Nat, active: Bool, continuations: Nat, background_available: Bool, lease: Maybe<&2, Surface>, leased_id: Maybe<&2, Nat>, last_surface: Maybe<&2, Surface>, last_id: Maybe<&2, Nat>, background_submitted: List<&2, Nat>, under_budget: Bool) -> Step:
  match under_budget:
    case True{}:
      accept(Flow{packets, next_id, source_capacity, review_capacity, round_id, active, continuations, True{}, background_available, lease, leased_id, last_surface, last_id, background_submitted})
    case False{}:
      finish(Flow{packets, next_id, source_capacity, review_capacity, round_id, active, continuations, True{}, background_available, lease, leased_id, last_surface, last_id, background_submitted})
def stop.choose(packets: List<&2, Packet>, next_id: Nat, source_capacity: Capacity, review_capacity: Capacity, round_id: Nat, active: Bool, +continuations: Nat, waiting: Bool, background_available: Bool, lease: Maybe<&2, Surface>, leased_id: Maybe<&2, Nat>, last_surface: Maybe<&2, Surface>, last_id: Maybe<&2, Nat>, background_submitted: List<&2, Nat>) -> Step:
  match waiting:
    case True{}:
      reject(Flow{packets, next_id, source_capacity, review_capacity, round_id, active, continuations, True{}, background_available, lease, leased_id, last_surface, last_id, background_submitted}, FinishDecisionAlreadyOpen{})
    case False{}:
      stop.budget(packets, next_id, source_capacity, review_capacity, round_id, active, continuations, background_available, lease, leased_id, last_surface, last_id, background_submitted, Nat.is_lt(continuations, 4n))

def stop(flow: Flow) -> Step:
  match flow:
    case Flow{packets, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, background_submitted}:
      stop.choose(packets, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, background_submitted)


def is_active(flow: Flow) -> Bool:
  match flow:
    case Flow{_, _, _, _, _, active, _, _, _, _, _, _, _, _}:
      active

def apply_move.do(flow: Flow, source: Place, target: Place, copy: Bool, terminal: Bool, id: Nat) -> Step:
  match flow terminal:
    case Flow{packets, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, submitted} True{}:
      accept(Flow{remove_one(id, source, packets), next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, submitted})
    case Flow{packets, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, submitted} False{}:
      accept(Flow{move_one(id, source, target, copy, packets), next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, background_available, lease, leased_id, last_surface, last_id, submitted})

def apply_move.found(flow: Flow, source: Place, target: Place, copy: Bool, terminal: Bool, found: Maybe<&2, Nat>) -> Step:
  match found:
    case None{}:
      reject(flow, MissingPacket{})
    case Some{id}:
      apply_move.do(flow, source, target, copy, terminal, id)

def apply_move(+flow: Flow, +source: Place, target: Place, copy: Bool, terminal: Bool, selected: Maybe<&2, Nat>) -> Step:
  match flow:
    case Flow{packets, _, _, _, _, _, _, _, _, _, _, _, _, _}:
      apply_move.found(flow, source, target, copy, terminal, find(source, selected, packets))

def deadline.settled(flow: Flow, pending: Bool) -> Step:
  match pending:
    case True{}:
      reject(flow, WorkStillPending{})
    case False{}:
      finish(flow)

def deadline.budget(flow: Flow, under_budget: Bool) -> Step:
  match under_budget:
    case True{}:
      reject(flow, UnexpectedControl{})
    case False{}:
      finish(flow)

def deadline.kind(+flow: Flow, kind: FlowEvent, continuations: Nat) -> Step:
  match kind:
    case FinishDecisionAllWorkSettled{}:
      deadline.settled(flow, work_pending(flow))
    case FinishDecisionBudgetExhausted{}:
      deadline.budget(flow, Nat.is_lt(continuations, 4n))
    case _:
      finish(flow)

def deadline.wait(flow: Flow, kind: FlowEvent, continuations: Nat, waiting: Bool) -> Step:
  match waiting:
    case False{}:
      reject(flow, StopNotWaiting{})
    case True{}:
      deadline.kind(flow, kind, continuations)

def deadline(+flow: Flow, kind: FlowEvent) -> Step:
  match flow:
    case Flow{_, _, _, _, _, _, continuations, waiting, _, _, _, _, _, _}:
      deadline.wait(flow, kind, continuations, waiting)

def lease_apply.surface(packets: List<&2, Packet>, next_id: Nat, source_capacity: Capacity, review_capacity: Capacity, round_id: Nat, active: Bool, continuations: Nat, waiting: Bool, available: Bool, last_surface: Maybe<&2, Surface>, last_id: Maybe<&2, Nat>, submitted: List<&2, Nat>, surface: Surface, +id: Nat) -> Step:
  match surface:
    case Background{}:
      accept(Flow{move_one(id, AdviceStore{}, AdvicePolicy{}, True{}, packets), next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, available, Some{Background{}}, Some{id}, last_surface, last_id, submitted})
    case Stop{}:
      accept(Flow{move_one(id, AdviceStore{}, AdvicePolicy{}, True{}, packets), next_id, source_capacity, review_capacity, round_id, active, (continuations + 1n : Nat), waiting, available, Some{Stop{}}, Some{id}, last_surface, last_id, submitted})

def lease_apply(flow: Flow, surface: Surface, +id: Nat) -> Step:
  match flow:
    case Flow{packets, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, available, _, _, last_surface, last_id, submitted}:
      lease_apply.surface(packets, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, available, last_surface, last_id, submitted, surface, id)

def lease_check.submitted(flow: Flow, surface: Surface, id: Nat, submitted: Bool) -> Step:
  match surface submitted:
    case Background{} True{}:
      reject(flow, BackgroundAlreadySubmitted{})
    case Background{} False{}:
      lease_apply(flow, Background{}, id)
    case Stop{} _:
      lease_apply(flow, Stop{}, id)

def lease_check(flow: Flow, surface: Surface, +id: Nat) -> Step:
  match flow:
    case Flow{_, _, _, _, _, _, _, _, _, _, _, _, _, +submitted}:
      lease_check.submitted(flow, surface, id, contains(id, submitted))

def lease_found(flow: Flow, surface: Surface, found: Maybe<&2, Nat>) -> Step:
  match found:
    case None{}:
      reject(flow, MissingPacket{})
    case Some{id}:
      lease_check(flow, surface, id)

def lease_find(+flow: Flow, selected: Maybe<&2, Nat>, surface: Surface) -> Step:
  match flow:
    case Flow{packets, _, _, _, _, _, _, _, _, _, _, _, _, _}:
      lease_found(flow, surface, find(AdviceStore{}, selected, packets))

def lease_background.guard(flow: Flow, selected: Maybe<&2, Nat>, available: Bool, busy: Bool) -> Step:
  match available busy:
    case False{} _:
      reject(flow, BackgroundNotRequested{})
    case True{} True{}:
      reject(flow, LeaseBusy{})
    case True{} False{}:
      lease_find(flow, selected, Background{})

def lease_background(+flow: Flow, selected: Maybe<&2, Nat>) -> Step:
  match flow:
    case Flow{_, _, _, _, _, _, _, _, available, lease, _, _, _, _}:
      lease_background.guard(flow, selected, available, has_lease(lease))

def lease_stop.eligible(flow: Flow, id: Nat, reoffer: Bool, submitted: Bool) -> Step:
  match reoffer submitted:
    case True{} False{}:
      reject(flow, ReofferNeedsBackground{})
    case False{} True{}:
      reject(flow, StopNeedsFreshAdvice{})
    case _ _:
      lease_apply(flow, Stop{}, id)

def lease_stop.check(+flow: Flow, reoffer: Bool, +id: Nat) -> Step:
  match flow:
    case Flow{_, _, _, _, _, _, _, _, _, _, _, _, _, +submitted}:
      lease_stop.eligible(flow, id, reoffer, contains(id, submitted))

def lease_stop.found(flow: Flow, reoffer: Bool, found: Maybe<&2, Nat>) -> Step:
  match found:
    case None{}:
      reject(flow, MissingPacket{})
    case Some{id}:
      lease_stop.check(flow, reoffer, id)

def lease_stop.find(+flow: Flow, selected: Maybe<&2, Nat>, reoffer: Bool) -> Step:
  match flow:
    case Flow{packets, _, _, _, _, _, _, _, _, _, _, _, _, _}:
      lease_stop.found(flow, reoffer, find(AdviceStore{}, selected, packets))

def lease_stop.budget(flow: Flow, selected: Maybe<&2, Nat>, reoffer: Bool, under_budget: Bool) -> Step:
  match under_budget:
    case False{}:
      reject(flow, ContinuationBudgetExhausted{})
    case True{}:
      lease_stop.find(flow, selected, reoffer)

def lease_stop.guard(flow: Flow, selected: Maybe<&2, Nat>, reoffer: Bool, continuations: Nat, waiting: Bool, busy: Bool) -> Step:
  match waiting busy:
    case False{} _:
      reject(flow, StopNotRequested{})
    case True{} True{}:
      reject(flow, LeaseBusy{})
    case True{} False{}:
      lease_stop.budget(flow, selected, reoffer, Nat.is_lt(continuations, 4n))

def lease_stop(+flow: Flow, selected: Maybe<&2, Nat>, reoffer: Bool) -> Step:
  match flow:
    case Flow{_, _, _, _, _, _, continuations, waiting, _, lease, _, _, _, _}:
      lease_stop.guard(flow, selected, reoffer, continuations, waiting, has_lease(lease))

def submit.surface(packets: List<&2, Packet>, next_id: Nat, source_capacity: Capacity, review_capacity: Capacity, round_id: Nat, active: Bool, continuations: Nat, waiting: Bool, available: Bool, submitted: List<&2, Nat>, surface: Surface, +id: Nat) -> Step:
  match surface:
    case Background{}:
      accept(Flow{remove_one(id, AdvicePolicy{}, packets), next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, False{}, None{}, None{}, Some{Background{}}, Some{id}, List.append(&2, Nat, submitted, id <> Nil{})})
    case Stop{}:
      next = remove_one(id, AdvicePolicy{}, packets)
      accept(Flow{remove_one(id, AdviceStore{}, next), next_id, source_capacity, review_capacity, round_id, active, continuations, False{}, available, None{}, None{}, Some{Stop{}}, Some{id}, submitted})
def submit.run(flow: Flow, surface: Surface, +id: Nat) -> Step:
  match flow:
    case Flow{packets, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, available, _, _, _, _, submitted}:
      submit.surface(packets, next_id, source_capacity, review_capacity, round_id, active, continuations, waiting, available, submitted, surface, id)

def submit.lease(flow: Flow, lease: Maybe<&2, Surface>, leased_id: Maybe<&2, Nat>) -> Step:
  match lease leased_id:
    case None{} _:
      reject(flow, NoLease{})
    case Some{surface} Some{id}:
      submit.run(flow, surface, id)
    case _ _:
      reject(flow, NoLease{})

def submit(+flow: Flow) -> Step:
  match flow:
    case Flow{_, _, _, _, _, _, _, _, _, lease, leased_id, _, _, _}:
      submit.lease(flow, lease, leased_id)


# item_id is optional exactly as in the sidecar: no ID selects the earliest
# packet at the event's source location.
def step.live(flow: Flow, event: FlowEvent, item_id: Maybe<&2, Nat>) -> Step:
  match event:
    case ReviewUnitPrepared{}:
      apply_move(flow, Preparation{}, ReviewQueue{}, False{}, False{}, item_id)
    case JevFindingReceived{}:
      apply_move(flow, Jev{}, AdviceStore{}, False{}, False{}, item_id)
    case JevClearReceived{}:
      apply_move(flow, Jev{}, Jev{}, False{}, True{}, item_id)
    case JevUnavailable{}:
      apply_move(flow, Jev{}, Jev{}, False{}, True{}, item_id)
    case StopHookFired{}:
      stop(flow)
    case FinishDecisionDeadlineReached{}:
      deadline(flow, FinishDecisionDeadlineReached{})
    case FinishDecisionAllWorkSettled{}:
      deadline(flow, FinishDecisionAllWorkSettled{})
    case FinishDecisionBudgetExhausted{}:
      deadline(flow, FinishDecisionBudgetExhausted{})
    case AdviceLeasedByBackground{}:
      lease_background(flow, item_id)
    case HostOutputSubmitted{}:
      submit(flow)
    case _:
      reject(flow, UnexpectedControl{})
def step.active(flow: Flow, event: FlowEvent, item_id: Maybe<&2, Nat>, active: Bool) -> Step:
  match active:
    case False{}:
      reject(flow, VirtualRoundClosed{})
    case True{}:
      step.live(flow, event, item_id)

def step(+flow: Flow, +event: FlowEvent, item_id: Maybe<&2, Nat>) -> Step:
  match event:
    case EditObserved{}:
      edit(flow)
    case SourceCapacitySet{capacity}:
      set_capacity(flow, capacity, True{})
    case ReviewCapacitySet{capacity}:
      set_capacity(flow, capacity, False{})
    case IngressStarted{}:
      reject(flow, InternalEvent{})
    case UnitDispatched{}:
      reject(flow, InternalEvent{})
    case JevRequestSent{}:
      reject(flow, InternalEvent{})
    case BackgroundWaitStarted{}:
      reject(flow, InternalEvent{})
    case AdviceLeasedByStop{}:
      reject(flow, InternalEvent{})
    case AdviceReofferedAtStop{}:
      reject(flow, InternalEvent{})
    case StopAllowed{}:
      reject(flow, InternalEvent{})
    case FinishResponseRequested{}:
      reject(flow, InternalEvent{})
    case _:
      step.active(flow, event, item_id, is_active(flow))


def main() -> Flow:
  initial()

def some(value: Maybe<&2, Nat>) -> Bool:
  match value:
    case None{}:
      False{}
    case Some{_}:
      True{}

def event_item.pick(event: FlowEvent, selected: Maybe<&2, Nat>, packets: List<&2, Packet>, next_id: Nat, leased_id: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match event:
    case EditObserved{}:
      Some{next_id}
    case ReviewUnitPrepared{}:
      find(Preparation{}, selected, packets)
    case JevFindingReceived{}:
      find(Jev{}, selected, packets)
    case JevClearReceived{}:
      find(Jev{}, selected, packets)
    case JevUnavailable{}:
      find(Jev{}, selected, packets)
    case AdviceLeasedByBackground{}:
      find(AdviceStore{}, selected, packets)
    case HostOutputSubmitted{}:
      leased_id
    case _:
      None{}

def event_item(event: FlowEvent, selected: Maybe<&2, Nat>, before: Flow) -> Maybe<&2, Nat>:
  match before:
    case Flow{packets, next_id, _, _, _, _, _, _, _, _, leased_id, _, _, _}:
      event_item.pick(event, selected, packets, next_id, leased_id)

def own_change(+event: FlowEvent, before: Flow, item: Maybe<&2, Nat>) -> FlowChange:
  match event:
    case SourceCapacitySet{capacity}:
      match before:
        case Flow{_, _, previous, _, _, _, _, _, _, _, _, _, _, _}:
          CapacityChanged{True{}, previous, capacity}
    case ReviewCapacitySet{capacity}:
      match before:
        case Flow{_, _, _, previous, _, _, _, _, _, _, _, _, _, _}:
          CapacityChanged{False{}, previous, capacity}
    case _:
      Transition{event, route_of(event), item}

def opened(before_active: Bool, mid_active: Bool, round_id: Nat) -> List<&2, FlowChange>:
  match before_active mid_active:
    case False{} True{}:
      RoundOpened{round_id} <> Nil{}
    case _ _:
      Nil{}

def emission(event: FlowEvent, item: Maybe<&2, Nat>) -> List<&2, FlowChange>:
  match event item:
    case JevClearReceived{} Some{id}:
      Emitted{JevClearReceived{}, OutcomeStoreNode{}, id} <> Nil{}
    case JevUnavailable{} Some{id}:
      Emitted{JevUnavailable{}, OutcomeStoreNode{}, id} <> Nil{}
    case HostOutputSubmitted{} Some{id}:
      Emitted{HostOutputSubmitted{}, ObservedWriteNode{}, id} <> Nil{}
    case _ _:
      Nil{}

def is_edit(event: FlowEvent) -> Bool:
  match event:
    case EditObserved{}:
      True{}
    case _:
      False{}

def is_prepared(event: FlowEvent) -> Bool:
  match event:
    case ReviewUnitPrepared{}:
      True{}
    case _:
      False{}

def schedule_source.pick(id: Nat, tail: List<&2, FlowChange>, hit: Bool) -> List<&2, FlowChange>:
  match hit:
    case True{}:
      Transition{IngressStarted{}, route_of(IngressStarted{}), Some{id}} <> tail
    case False{}:
      tail

def schedule_source(+event: FlowEvent, +next_id: Nat, +old_edit_ids: List<&2, Nat>, packets: List<&2, Packet>) -> List<&2, FlowChange>:
  match packets:
    case Nil{}:
      Nil{}
    case Packet{+id, place} <> rest:
      hit = Bool.and(same_place(place, Preparation{}), Bool.or(contains(id, old_edit_ids), Bool.and(is_edit(event), Nat.is_eq(id, next_id))))
      schedule_source.pick(id, schedule_source(event, next_id, old_edit_ids, rest), hit)

def selected_is(id: Nat, selected: Maybe<&2, Nat>) -> Bool:
  match selected:
    case None{}:
      False{}
    case Some{wanted}:
      Nat.is_eq(id, wanted)

def schedule_review.pick(+id: Nat, tail: List<&2, FlowChange>, hit: Bool) -> List<&2, FlowChange>:
  match hit:
    case True{}:
      Transition{UnitDispatched{}, route_of(UnitDispatched{}), Some{id}} <> Transition{JevRequestSent{}, route_of(JevRequestSent{}), Some{id}} <> tail
    case False{}:
      tail

def schedule_review(+event: FlowEvent, +own_item: Maybe<&2, Nat>, +old_review_ids: List<&2, Nat>, packets: List<&2, Packet>) -> List<&2, FlowChange>:
  match packets:
    case Nil{}:
      Nil{}
    case Packet{+id, place} <> rest:
      hit = Bool.and(same_place(place, Jev{}), Bool.or(contains(id, old_review_ids), Bool.and(is_prepared(event), selected_is(id, own_item))))
      schedule_review.pick(id, schedule_review(event, own_item, old_review_ids, rest), hit)

def first_id(ids: List<&2, Nat>) -> Maybe<&2, Nat>:
  match ids:
    case Nil{}:
      None{}
    case id <> _:
      Some{id}

def finish_trigger.stop(under_budget: Bool) -> List<&2, FlowChange>:
  match under_budget:
    case True{}:
      Transition{FinishDecisionAllWorkSettled{}, route_of(FinishDecisionAllWorkSettled{}), None{}} <> Nil{}
    case False{}:
      Transition{FinishDecisionBudgetExhausted{}, route_of(FinishDecisionBudgetExhausted{}), None{}} <> Nil{}

def finish_trigger(event: FlowEvent, continuations: Nat) -> List<&2, FlowChange>:
  match event:
    case FinishDecisionDeadlineReached{}:
      Nil{}
    case FinishDecisionAllWorkSettled{}:
      Nil{}
    case FinishDecisionBudgetExhausted{}:
      Nil{}
    case StopHookFired{}:
      finish_trigger.stop(Nat.is_lt(continuations, 4n))
    case _:
      Transition{FinishDecisionAllWorkSettled{}, route_of(FinishDecisionAllWorkSettled{}), None{}} <> Nil{}

def finish_leases.pick(id: Nat, tail: List<&2, FlowChange>, reoffer: Bool) -> List<&2, FlowChange>:
  match reoffer:
    case True{}:
      Transition{AdviceReofferedAtStop{}, route_of(AdviceReofferedAtStop{}), Some{id}} <> tail
    case False{}:
      Transition{AdviceLeasedByStop{}, route_of(AdviceLeasedByStop{}), Some{id}} <> tail

def finish_leases(ids: List<&2, Nat>, +submitted: List<&2, Nat>) -> List<&2, FlowChange>:
  match ids:
    case Nil{}:
      Nil{}
    case +id <> rest:
      finish_leases.pick(id, finish_leases(rest, submitted), contains(id, submitted))

def finish_tail.pick(+decision: Decision, packets: List<&2, Packet>, round_id: Nat, submitted: List<&2, Nat>) -> List<&2, FlowChange>:
  match decision:
    case NoDecision{}:
      Nil{}
    case ContinueWithAdvice{+advice_ids, _, _, _}:
      List.append(&2, FlowChange, finish_leases(advice_ids, submitted),
        Transition{FinishResponseRequested{}, route_of(FinishResponseRequested{}), first_id(advice_ids)} <>
        FinishDecision{decision} <> Nil{})
    case AllowFinish{_, _, _}:
      Transition{StopAllowed{}, route_of(StopAllowed{}), None{}} <>
      Transition{FinishResponseRequested{}, route_of(FinishResponseRequested{}), None{}} <>
      FinishDecision{decision} <>
      RoundClosed{round_id, List.length(&2, Nat, distinct(all_ids(packets), Nil{}))} <> Nil{}

def finish_tail(decision: Decision, mid: Flow) -> List<&2, FlowChange>:
  match mid:
    case Flow{packets, _, _, _, round_id, _, _, _, _, _, _, _, _, submitted}:
      finish_tail.pick(decision, packets, round_id, submitted)

def finish_changes(event: FlowEvent, continuations: Nat, decision: Decision, mid: Flow) -> List<&2, FlowChange>:
  match decision:
    case NoDecision{}:
      Nil{}
    case _:
      List.append(&2, FlowChange, finish_trigger(event, continuations), finish_tail(decision, mid))

def background_start(event: FlowEvent, available: Bool, item: Maybe<&2, Nat>) -> List<&2, FlowChange>:
  match event available item:
    case EditObserved{} False{} Some{id}:
      Transition{BackgroundWaitStarted{}, route_of(BackgroundWaitStarted{}), Some{id}} <> Nil{}
    case _ _ _:
      Nil{}

def changes.accepted(+before: Flow, +event: FlowEvent, selected: Maybe<&2, Nat>, decision: Decision, +mid: Flow) -> List<&2, FlowChange>:
  match before mid:
    case Flow{+old_packets, +next_id, _, _, _, old_active, continuations, _, old_background, _, _, _, _, _} Flow{+mid_packets, _, _, _, round_id, mid_active, _, _, _, _, _, _, _, _}:
      +own_item = event_item(event, selected, before)
      own = own_change(event, before, own_item)
      opening = opened(old_active, mid_active, round_id)
      emitted = emission(event, own_item)
      started_source = schedule_source(event, next_id, ids(EditQueue{}, old_packets), mid_packets)
      started_review = schedule_review(event, own_item, ids(ReviewQueue{}, old_packets), mid_packets)
      finished = finish_changes(event, continuations, decision, mid)
      background = background_start(event, old_background, own_item)
      own <> List.append(&2, FlowChange, opening,
        List.append(&2, FlowChange, emitted,
          List.append(&2, FlowChange, started_source,
            List.append(&2, FlowChange, started_review,
              List.append(&2, FlowChange, finished, background)))))

def changes(before: Flow, event: FlowEvent, selected: Maybe<&2, Nat>, result: Step) -> List<&2, FlowChange>:
  match result:
    case Rejected{_, _}:
      Nil{}
    case Accepted{_, decision, mid}:
      changes.accepted(before, event, selected, decision, mid)
