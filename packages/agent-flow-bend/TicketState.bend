import Base
import ./Ticket.bend as Ticket

# Only numeric ticket and unit identities, phase, and failure category live here.
# Source, credentials, advice payload, clocks, and host output stay native.
type TicketUnit is Data:
  TicketUnit{id: Nat, stage: Ticket.UnitStage, reason: Maybe<&2, Ticket.Reason>}

type Record is Data:
  Record{id: Nat, phase: Ticket.Phase, units: List<&2, TicketUnit>}

type State is Data:
  State{records: List<&2, Record>}

type Decision is Data:
  Granted{state: State}
  Refused{state: State}

type Retention is Data:
  Kept{state: State}
  Evicted{state: State, id: Nat}

def initial() -> State:
  State{Nil{}}

def record_id(record: Record) -> Nat:
  match record:
    case Record{id, _, _}: id

def unit_id(unit: TicketUnit) -> Nat:
  match unit:
    case TicketUnit{id, _, _}: id

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

def unit_in_record(found: Maybe<&2, Record>, unit: Nat) -> Maybe<&2, TicketUnit>:
  match found:
    case Some{Record{_, _, units}}: find_unit(unit, units)
    case None{}: None{}

def unit_snapshot(state: State, ticket: Nat, unit: Nat) -> Maybe<&2, TicketUnit>:
  match state:
    case State{records}: unit_in_record(find_record(ticket, records), unit)

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

def without_unit(+id: Nat, units: List<&2, TicketUnit>) -> List<&2, TicketUnit>:
  match units:
    case Nil{}: Nil{}
    case +unit <> rest:
      keep_unit(unit, without_unit(id, rest), Nat.is_eq(id, unit_id(unit)))

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
    case State{records} None{}:
      Granted{State{Record{id, Ticket.initial(), Nil{}} <> records}}
    case _ _:
      Refused{state}

def open(+state: State, +id: Nat) -> Decision:
  match state:
    case State{records}:
      opened(state, id, find_record(id, records))

def forgotten(state: State, id: Nat, found: Maybe<&2, Record>) -> Decision:
  match state found:
    case State{records} Some{_}:
      Granted{State{without_record(id, records)}}
    case _ _:
      Refused{state}

def forget(+state: State, +id: Nat) -> Decision:
  match state:
    case State{records}:
      forgotten(state, id, find_record(id, records))

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
    case State{records} Some{+id}:
      Evicted{State{without_record(id, records)}, id}
    case _ None{}: Kept{state}

def retention(+state: State, limit: Nat) -> Retention:
  match state:
    case State{records}:
      Bool.pick(Retention, Nat.is_gt(List.length(&2, Record, records), limit),
        evict_found(state, oldest(records)), Kept{state})

def failure_result(state: State, +id: Nat, reason: Ticket.Reason,
    found: Maybe<&2, Record>) -> Decision:
  match state found:
    case State{records} Some{Record{_, phase, units}}:
      Granted{State{Record{id, Ticket.fail(phase, reason), units} <>
        without_record(id, records)}}
    case _ _:
      Refused{state}

def fail(+state: State, +id: Nat, reason: Ticket.Reason) -> Decision:
  match state:
    case State{records}:
      failure_result(state, id, reason, find_record(id, records))

def close_result(state: State, +id: Nat, found: Maybe<&2, Record>) -> Decision:
  match state found:
    case State{records} Some{Record{_, phase, units}}:
      Granted{State{Record{id, Ticket.close(phase), units} <>
        without_record(id, records)}}
    case _ _:
      Refused{state}

def close(+state: State, +id: Nat) -> Decision:
  match state:
    case State{records}:
      close_result(state, id, find_record(id, records))

def add_unit_found(+state: State, +ticket: Nat, +unit: Nat,
    found: Maybe<&2, Record>) -> Decision:
  match state found:
    case State{+records} Some{Record{_, phase, +units}}:
      Bool.pick(Decision, Bool.and(Nat.is_gt(unit, 0n),
        Maybe.is_none(&2, TicketUnit, find_unit(unit, units))),
        Granted{State{Record{ticket, phase, List.append(&2, TicketUnit, units,
          TicketUnit{unit, Ticket.unit.initial(), None{}} <> Nil{})} <>
          without_record(ticket, records)}}, Refused{state})
    case _ _:
      Refused{state}

def add_unit(+state: State, +ticket: Nat, unit: Nat) -> Decision:
  match state:
    case State{records}:
      add_unit_found(state, ticket, unit, find_record(ticket, records))

def reason_after(event: Ticket.UnitEvent, reason: Ticket.Reason,
    previous: Maybe<&2, Ticket.Reason>) -> Maybe<&2, Ticket.Reason>:
  match event:
    case Ticket.FailUnit{}: Some{reason}
    case _: previous

def pending_stage(stage: Ticket.UnitStage) -> Bool:
  match stage:
    case Ticket.UnitPending{}: True{}
    case _: False{}

def finding_stage(stage: Ticket.UnitStage) -> Bool:
  match stage:
    case Ticket.UnitFinding{_}: True{}
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

def unit_transition_result(state: State, +ticket: Nat, +unit: Nat,
    phase: Ticket.Phase, units: List<&2, TicketUnit>,
    event: Ticket.UnitEvent, reason: Ticket.Reason,
    previous_reason: Maybe<&2, Ticket.Reason>,
    result: Ticket.UnitStep) -> Decision:
  match state result:
    case State{records} Ticket.UnitGranted{replacement}:
      Granted{State{Record{ticket, phase,
        replace_unit(unit, TicketUnit{unit, replacement,
          reason_after(event, reason, previous_reason)}, units)} <>
          without_record(ticket, records)}}
    case _ Ticket.UnitDenied{_}:
      Refused{state}

def unit_step_result(+state: State, ticket: Nat, unit: Nat,
    +event: Ticket.UnitEvent, reason: Ticket.Reason,
    found_record: Maybe<&2, Record>, found_unit: Maybe<&2, TicketUnit>) -> Decision:
  match found_record found_unit:
    case Some{Record{_, phase, units}} Some{TicketUnit{_, +stage, previous_reason}}:
      Bool.pick(Decision, unit_allowed(stage, event),
        unit_transition_result(state, ticket, unit, phase, units, event, reason,
          previous_reason, Ticket.unit.step(stage, event)), Refused{state})
    case _ _:
      Refused{state}

def step_unit_found(state: State, +ticket: Nat, +unit: Nat,
    event: Ticket.UnitEvent, reason: Ticket.Reason,
    +found: Maybe<&2, Record>) -> Decision:
  match found:
    case Some{Record{_, _, units}}:
      unit_step_result(state, ticket, unit, event, reason, found, find_unit(unit, units))
    case None{}:
      Refused{state}

def step_unit(+state: State, +ticket: Nat, unit: Nat,
    event: Ticket.UnitEvent, reason: Ticket.Reason) -> Decision:
  match state:
    case State{records}:
      step_unit_found(state, ticket, unit, event, reason, find_record(ticket, records))

def pending_count(units: List<&2, TicketUnit>) -> Nat:
  match units:
    case Nil{}: 0n
    case TicketUnit{_, stage, _} <> rest:
      (pending_count(rest) + Bool.pick(Nat, pending_stage(stage), 1n, 0n) : Nat)

def finding_count(units: List<&2, TicketUnit>) -> Nat:
  match units:
    case Nil{}: 0n
    case TicketUnit{_, stage, _} <> rest:
      (finding_count(rest) + Bool.pick(Nat, finding_stage(stage), 1n, 0n) : Nat)

def undelivered_count(units: List<&2, TicketUnit>) -> Nat:
  match units:
    case Nil{}: 0n
    case TicketUnit{_, stage, _} <> rest:
      (undelivered_count(rest) + Bool.pick(Nat, undelivered_stage(stage), 1n, 0n) : Nat)

def first_failure(units: List<&2, TicketUnit>) -> Maybe<&2, Ticket.Reason>:
  match units:
    case Nil{}: None{}
    case TicketUnit{_, stage, reason} <> rest:
      match stage:
        case Ticket.UnitUnavailable{}:
          reason
        case _:
          first_failure(rest)

def terminal_record(record: Record, expired: Bool, credential_valid: Bool,
    live_advice: Bool, pending_notice: Bool) -> Ticket.Outcome:
  match record:
    case Record{_, phase, +units}:
      Ticket.terminal(phase, Ticket.Facts{expired, credential_valid,
        pending_count(units), live_advice, pending_notice,
        first_failure(units), finding_count(units),
        undelivered_count(units), List.length(&2, TicketUnit, units)})

def terminal_found(found: Maybe<&2, Record>, expired: Bool,
    credential_valid: Bool, live_advice: Bool, pending_notice: Bool) -> Maybe<&2, Ticket.Outcome>:
  match found:
    case Some{record}:
      Some{terminal_record(record, expired, credential_valid, live_advice, pending_notice)}
    case None{}:
      None{}

def terminal(state: State, ticket: Nat, expired: Bool,
    credential_valid: Bool, live_advice: Bool,
    pending_notice: Bool) -> Maybe<&2, Ticket.Outcome>:
  match state:
    case State{records}:
      terminal_found(find_record(ticket, records), expired, credential_valid,
        live_advice, pending_notice)
