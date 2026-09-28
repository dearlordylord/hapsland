import Base
import ./Ticket.bend as Ticket

# Admissions retain identity only. Each review unit names its admission.
# Collection status is derived from live work, advice, and activity facts.
type TicketUnit is Data:
  TicketUnit{id: Nat, admission: Nat, stage: Ticket.UnitStage,
    reason: Maybe<&2, Ticket.Reason>}

type Record is Data:
  Record{id: Nat}

type State is Data:
  State{records: List<&2, Record>, units: List<&2, TicketUnit>}

type Decision is Data:
  Granted{state: State}
  Refused{state: State}

type Retention is Data:
  Kept{state: State}
  Evicted{state: State, id: Nat}

def initial() -> State:
  State{Nil{}, Nil{}}

def record_id(record: Record) -> Nat:
  match record:
    case Record{id}: id

def unit_id(unit: TicketUnit) -> Nat:
  match unit:
    case TicketUnit{id, _, _, _}: id

def unit_admission(unit: TicketUnit) -> Nat:
  match unit:
    case TicketUnit{_, admission, _, _}: admission

def find_record(+id: Nat, records: List<&2, Record>) -> Maybe<&2, Record>:
  match records:
    case Nil{}: None{}
    case +record <> rest:
      Bool.pick(Maybe<&2, Record>, Nat.is_eq(id, record_id(record)),
        Some{record}, find_record(id, rest))

def find_unit(+id: Nat, units: List<&2, TicketUnit>) -> Maybe<&2, TicketUnit>:
  match units:
    case Nil{}: None{}
    case +unit <> rest:
      Bool.pick(Maybe<&2, TicketUnit>, Nat.is_eq(id, unit_id(unit)),
        Some{unit}, find_unit(id, rest))

def owned_unit(found: Maybe<&2, TicketUnit>, admission: Nat) -> Maybe<&2, TicketUnit>:
  match found:
    case None{}: None{}
    case Some{+unit}:
      Bool.pick(Maybe<&2, TicketUnit>, Nat.is_eq(unit_admission(unit), admission),
        Some{unit}, None{})

def unit_snapshot(state: State, admission: Nat, unit: Nat) -> Maybe<&2, TicketUnit>:
  match state:
    case State{_, units}: owned_unit(find_unit(unit, units), admission)

def keep_record(record: Record, tail: List<&2, Record>, remove: Bool) -> List<&2, Record>:
  match remove:
    case True{}: tail
    case False{}: record <> tail

def without_record(+id: Nat, records: List<&2, Record>) -> List<&2, Record>:
  match records:
    case Nil{}: Nil{}
    case +record <> rest:
      keep_record(record, without_record(id, rest), Nat.is_eq(id, record_id(record)))

def keep_unit(unit: TicketUnit, tail: List<&2, TicketUnit>, remove: Bool) -> List<&2, TicketUnit>:
  match remove:
    case True{}: tail
    case False{}: unit <> tail

def without_admission(+admission: Nat, units: List<&2, TicketUnit>) -> List<&2, TicketUnit>:
  match units:
    case Nil{}: Nil{}
    case +unit <> rest:
      keep_unit(unit, without_admission(admission, rest),
        Nat.is_eq(admission, unit_admission(unit)))

def replace_unit_choice(item: TicketUnit, tail: List<&2, TicketUnit>,
    replacement: TicketUnit, matches: Bool) -> List<&2, TicketUnit>:
  match matches:
    case True{}: replacement <> tail
    case False{}: item <> tail

def replace_unit(+id: Nat, +replacement: TicketUnit,
    units: List<&2, TicketUnit>) -> List<&2, TicketUnit>:
  match units:
    case Nil{}: Nil{}
    case +item <> rest:
      replace_unit_choice(item, replace_unit(id, replacement, rest), replacement,
        Nat.is_eq(id, unit_id(item)))

def opened(state: State, id: Nat, found: Maybe<&2, Record>) -> Decision:
  match state found:
    case State{records, units} None{}:
      Granted{State{Record{id} <> records, units}}
    case _ _:
      Refused{state}

def open(+state: State, +id: Nat) -> Decision:
  match state:
    case State{records, _}: opened(state, id, find_record(id, records))

def forgotten(state: State, +id: Nat, found: Maybe<&2, Record>) -> Decision:
  match state found:
    case State{records, units} Some{_}:
      Granted{State{without_record(id, records), without_admission(id, units)}}
    case _ _:
      Refused{state}

def forget(+state: State, +id: Nat) -> Decision:
  match state:
    case State{records, _}: forgotten(state, id, find_record(id, records))

def older(+candidate: Nat, current: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match current:
    case None{}: Some{candidate}
    case Some{+id}: Some{Bool.pick(Nat, Nat.is_lt(candidate, id), candidate, id)}

def oldest(records: List<&2, Record>) -> Maybe<&2, Nat>:
  match records:
    case Nil{}: None{}
    case record <> rest: older(record_id(record), oldest(rest))

def evict_found(state: State, found: Maybe<&2, Nat>) -> Retention:
  match state found:
    case State{records, units} Some{+id}:
      Evicted{State{without_record(id, records), without_admission(id, units)}, id}
    case _ None{}: Kept{state}

def retention(+state: State, limit: Nat) -> Retention:
  match state:
    case State{records, _}:
      Bool.pick(Retention, Nat.is_gt(List.length(&2, Record, records), limit),
        evict_found(state, oldest(records)), Kept{state})

def add_unit_found(+state: State, +admission: Nat, +unit: Nat,
    found: Maybe<&2, Record>) -> Decision:
  match state found:
    case State{records, +units} Some{_}:
      Bool.pick(Decision, Bool.and(Nat.is_gt(unit, 0n),
        Maybe.is_none(&2, TicketUnit, find_unit(unit, units))),
        Granted{State{records, List.append(&2, TicketUnit, units,
          TicketUnit{unit, admission, Ticket.unit.initial(), None{}} <> Nil{})}},
        Refused{state})
    case _ _:
      Refused{state}

def add_unit(+state: State, +admission: Nat, unit: Nat) -> Decision:
  match state:
    case State{records, _}:
      add_unit_found(state, admission, unit, find_record(admission, records))

def reason_after(event: Ticket.UnitEvent, reason: Ticket.Reason,
    previous: Maybe<&2, Ticket.Reason>) -> Maybe<&2, Ticket.Reason>:
  match event:
    case Ticket.FailUnit{}: Some{reason}
    case _: previous

def pending_stage(stage: Ticket.UnitStage) -> Bool:
  match stage:
    case Ticket.UnitPending{}: True{}
    case _: False{}

def undelivered_stage(stage: Ticket.UnitStage) -> Bool:
  match stage:
    case Ticket.UnitFinding{delivered}: Bool.not(delivered)
    case _: False{}

def unavailable_stage(stage: Ticket.UnitStage) -> Bool:
  match stage:
    case Ticket.UnitUnavailable{}: True{}
    case _: False{}

def unit_allowed(stage: Ticket.UnitStage, event: Ticket.UnitEvent) -> Bool:
  match event:
    case Ticket.Revise{}: pending_stage(stage)
    case Ticket.ClearResult{}: pending_stage(stage)
    case Ticket.FindingResult{}: pending_stage(stage)
    case Ticket.FailUnit{}: Bool.not(unavailable_stage(stage))
    case Ticket.MarkDelivered{}: undelivered_stage(stage)

def unit_transition_result(state: State, +admission: Nat, +unit: Nat,
    units: List<&2, TicketUnit>, event: Ticket.UnitEvent,
    reason: Ticket.Reason, previous_reason: Maybe<&2, Ticket.Reason>,
    result: Ticket.UnitStep) -> Decision:
  match state result:
    case State{records, _} Ticket.UnitGranted{replacement}:
      Granted{State{records, replace_unit(unit,
        TicketUnit{unit, admission, replacement,
          reason_after(event, reason, previous_reason)}, units)}}
    case _ Ticket.UnitDenied{_}: Refused{state}

def unit_step_owned(+state: State, +admission: Nat, unit: Nat,
    owner: Nat, +stage: Ticket.UnitStage,
    previous_reason: Maybe<&2, Ticket.Reason>,
    +event: Ticket.UnitEvent, reason: Ticket.Reason) -> Decision:
  match state:
    case State{_, units}:
      Bool.pick(Decision, Bool.and(Nat.is_eq(owner, admission), unit_allowed(stage, event)),
        unit_transition_result(state, admission, unit, units, event, reason,
          previous_reason, Ticket.unit.step(stage, event)),
        Refused{state})

def unit_step_found(+state: State, admission: Nat, unit: Nat,
    +event: Ticket.UnitEvent, reason: Ticket.Reason,
    found: Maybe<&2, TicketUnit>) -> Decision:
  match found:
    case Some{TicketUnit{_, owner, +stage, previous_reason}}:
      unit_step_owned(state, admission, unit, owner, stage, previous_reason,
        event, reason)
    case None{}: Refused{state}

def step_unit(+state: State, admission: Nat, +unit: Nat,
    event: Ticket.UnitEvent, reason: Ticket.Reason) -> Decision:
  match state:
    case State{_, units}:
      unit_step_found(state, admission, unit, event, reason, find_unit(unit, units))
