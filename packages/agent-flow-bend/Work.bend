import Base
import ./Flow.bend as Flow

type PreparedOffer is Data:
  SkipPrepared{}
  AdmitPrepared{}
  RejectPreparedCapacity{}

type EmptyPrepared is Data:
  NoEmptyFailure{}
  FailEmptyLost{}

type EvaluatedDisposition is Data:
  RetainFinding{}
  SettleClear{}
  SettleStaleClear{}
  RetireStaleFinding{}

type FailureDisposition is Data:
  NoFailure{}
  BackendUnavailable{}
  CredentialUnavailable{}
  LostUnavailable{}

def prepared_offer(ready: Bool, within_frame: Bool) -> PreparedOffer:
  Bool.pick(PreparedOffer, Bool.not(ready), SkipPrepared{},
    Bool.pick(PreparedOffer, within_frame, AdmitPrepared{}, RejectPreparedCapacity{}))

def empty_prepared(ready_count: Nat, has_non_skipped: Bool,
    ticketed: Bool) -> EmptyPrepared:
  Bool.pick(EmptyPrepared, Bool.and(Nat.is_eq(ready_count, 0n),
    Bool.and(has_non_skipped, ticketed)), FailEmptyLost{}, NoEmptyFailure{})

def evaluated_disposition(has_findings: Bool, +current_work: Bool) -> EvaluatedDisposition:
  Bool.pick(EvaluatedDisposition, has_findings,
    Bool.pick(EvaluatedDisposition, current_work, RetainFinding{}, RetireStaleFinding{}),
    Bool.pick(EvaluatedDisposition, current_work, SettleClear{}, SettleStaleClear{}))

def failure_disposition(backend_or_timeout: Bool, credential: Bool,
    missing: Bool) -> FailureDisposition:
  Bool.pick(FailureDisposition, backend_or_timeout, BackendUnavailable{},
    Bool.pick(FailureDisposition, credential, CredentialUnavailable{},
      Bool.pick(FailureDisposition, missing, LostUnavailable{}, NoFailure{})))

type ObservationStage is Data:
  SourceQueued{}
  SourceReading{}

type UnitStage is Data:
  ReviewQueued{}
  AtJev{}
  PendingFinding{}
  ClearResult{}
  UnavailableResult{}
  InterruptedResult{}
  DiscardedResult{}

type Observation is Data:
  Observation{id: Nat, stage: ObservationStage}

type ReviewUnit is Data:
  ReviewUnit{id: Nat, observation: Nat, stage: UnitStage, findings: Nat, bytes: Nat}

type Work is Data:
  Work{
    next_observation: Nat, next_unit: Nat,
    source_capacity: Flow.Capacity, review_capacity: Flow.Capacity,
    observations: List<&2, Observation>, units: List<&2, ReviewUnit>
  }

type WorkRejection is Data:
  MissingObservation{}
  SourceNotReading{}
  TooManyUnits{}
  MissingUnit{}
  UnitNotAtJev{}
  InvalidCapacity{}
  InvalidFinding{}
  UnitStillUnfinished{}

type WorkStep is Data:
  Accepted{state: Work, admitted: List<&2, Nat>}
  Rejected{state: Work, reason: WorkRejection}

type CloseResult is Data:
  Closed{state: Work, cancelled_source: List<&2, Nat>, cancelled_jev: List<&2, Nat>,
    discarded_findings: List<&2, Nat>}

type CancelResult is Data:
  Cancelled{state: Work, cancelled_source: List<&2, Nat>, cancelled_jev: List<&2, Nat>}

def initial() -> Work:
  Work{1n, 1n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{}, Nil{}}

def is_source_reading(stage: ObservationStage) -> Bool:
  match stage:
    case SourceQueued{}:
      False{}
    case SourceReading{}:
      True{}

def is_at_jev(stage: UnitStage) -> Bool:
  match stage:
    case AtJev{}:
      True{}
    case _:
      False{}

def is_unit_unfinished(stage: UnitStage) -> Bool:
  match stage:
    case ReviewQueued{}:
      True{}
    case AtJev{}:
      True{}
    case _:
      False{}

def reading_count(observations: List<&2, Observation>) -> Nat:
  match observations:
    case Nil{}:
      0n
    case Observation{_, stage} <> rest:
      (Bool.pick(Nat, is_source_reading(stage), 1n, 0n) + reading_count(rest) : Nat)

def at_jev_count(units: List<&2, ReviewUnit>) -> Nat:
  match units:
    case Nil{}:
      0n
    case ReviewUnit{_, _, stage, _, _} <> rest:
      (Bool.pick(Nat, is_at_jev(stage), 1n, 0n) + at_jev_count(rest) : Nat)

def unfinished_observations(observations: List<&2, Observation>) -> Nat:
  List.length(&2, Observation, observations)

def unfinished_units(units: List<&2, ReviewUnit>) -> Nat:
  match units:
    case Nil{}:
      0n
    case ReviewUnit{_, _, stage, _, _} <> rest:
      (Bool.pick(Nat, is_unit_unfinished(stage), 1n, 0n) + unfinished_units(rest) : Nat)

def unfinished(work: Work) -> Nat:
  match work:
    case Work{_, _, _, _, observations, units}:
      (unfinished_observations(observations) + unfinished_units(units) : Nat)

# The resident reports live dispatcher and writer counts at the finish barrier.
# A spent continuation budget cannot hold a native Stop hook open.
def finish_wait(unfinished: Nat, deadline_reached: Bool, continuation_budget: Bool) -> Bool:
  Bool.and(continuation_budget,
    Bool.and(Bool.not(deadline_reached), Nat.is_gt(unfinished, 0n)))

def pending_findings_in(units: List<&2, ReviewUnit>) -> Nat:
  match units:
    case Nil{}:
      0n
    case ReviewUnit{_, _, stage, findings, _} <> rest:
      match stage:
        case PendingFinding{}:
          (findings + pending_findings_in(rest) : Nat)
        case _:
          pending_findings_in(rest)

def pending_findings(work: Work) -> Nat:
  match work:
    case Work{_, _, _, _, _, units}:
      pending_findings_in(units)

def fill_source(observations: List<&2, Observation>, +capacity: Flow.Capacity, +occupied: Nat) -> List<&2, Observation>:
  match observations:
    case Nil{}:
      Nil{}
    case Observation{id, stage} <> rest:
      match stage:
        case SourceQueued{}:
          +room = Flow.has_room(occupied, capacity)
          next_stage = Bool.pick(ObservationStage, room, SourceReading{}, SourceQueued{})
          Observation{id, next_stage} <> fill_source(rest, capacity, (occupied + Bool.pick(Nat, room, 1n, 0n) : Nat))
        case SourceReading{}:
          Observation{id, SourceReading{}} <> fill_source(rest, capacity, occupied)

def fill_review(units: List<&2, ReviewUnit>, +capacity: Flow.Capacity, +occupied: Nat) -> List<&2, ReviewUnit>:
  match units:
    case Nil{}:
      Nil{}
    case ReviewUnit{id, observation, stage, findings, bytes} <> rest:
      match stage:
        case ReviewQueued{}:
          +room = Flow.has_room(occupied, capacity)
          next_stage = Bool.pick(UnitStage, room, AtJev{}, ReviewQueued{})
          ReviewUnit{id, observation, next_stage, findings, bytes} <> fill_review(rest, capacity, (occupied + Bool.pick(Nat, room, 1n, 0n) : Nat))
        case _:
          ReviewUnit{id, observation, stage, findings, bytes} <> fill_review(rest, capacity, occupied)

def settle(work: Work) -> Work:
  match work:
    case Work{next_observation, next_unit, +source_capacity, +review_capacity, +observations, +units}:
      Work{next_observation, next_unit, source_capacity, review_capacity,
        fill_source(observations, source_capacity, reading_count(observations)),
        fill_review(units, review_capacity, at_jev_count(units))}

def admit(work: Work) -> WorkStep:
  match work:
    case Work{+next_observation, next_unit, source_capacity, review_capacity, observations, units}:
      Accepted{settle(Work{(next_observation + 1n : Nat), next_unit, source_capacity, review_capacity,
        List.append(&2, Observation, observations, Observation{next_observation, SourceQueued{}} <> Nil{}), units}),
        next_observation <> Nil{}}

def find_observation.pick(observation: Observation, fallback: Maybe<&2, Observation>, hit: Bool) -> Maybe<&2, Observation>:
  match hit:
    case True{}:
      Some{observation}
    case False{}:
      fallback

def find_observation(+id: Nat, observations: List<&2, Observation>) -> Maybe<&2, Observation>:
  match observations:
    case Nil{}:
      None{}
    case +observation <> rest:
      match observation:
        case Observation{current, _}:
          find_observation.pick(observation, find_observation(id, rest), Nat.is_eq(current, id))

def start_observation.read(observation: Observation, tail: List<&2, Observation>) -> List<&2, Observation>:
  match observation:
    case Observation{id, _}:
      Observation{id, SourceReading{}} <> tail

def start_observation.pick(observation: Observation, tail: List<&2, Observation>, hit: Bool) -> List<&2, Observation>:
  match hit:
    case True{}:
      start_observation.read(observation, tail)
    case False{}:
      observation <> tail

def start_observation(+id: Nat, observations: List<&2, Observation>) -> List<&2, Observation>:
  match observations:
    case Nil{}:
      Nil{}
    case +observation <> rest:
      match observation:
        case Observation{current, _}:
          start_observation.pick(observation, start_observation(id, rest), Nat.is_eq(current, id))

def start_source.apply(work: Work, id: Nat) -> WorkStep:
  match work:
    case Work{next_observation, next_unit, source_capacity, review_capacity, observations, units}:
      Accepted{Work{next_observation, next_unit, source_capacity, review_capacity,
        start_observation(id, observations), units}, Nil{}}

def start_source.found(work: Work, id: Nat, found: Maybe<&2, Observation>) -> WorkStep:
  match found:
    case None{}:
      Rejected{work, MissingObservation{}}
    case Some{_}:
      start_source.apply(work, id)

def start_source(+work: Work, +id: Nat) -> WorkStep:
  match work:
    case Work{_, _, _, _, observations, _}:
      start_source.found(work, id, find_observation(id, observations))

def remove_observation.pick(observation: Observation, tail: List<&2, Observation>, hit: Bool) -> List<&2, Observation>:
  match hit:
    case True{}:
      tail
    case False{}:
      observation <> tail

# ReviewUnit count is bounded by the resident's per-partition item ceiling. A zero
# count means source analysis completed quietly without inventing review work.
def remove_observation(+id: Nat, observations: List<&2, Observation>) -> List<&2, Observation>:
  match observations:
    case Nil{}:
      Nil{}
    case +observation <> rest:
      match observation:
        case Observation{current, _}:
          remove_observation.pick(observation, remove_observation(id, rest), Nat.is_eq(current, id))

def make_units(count: Nat, +observation: Nat, +next_id: Nat) -> List<&2, ReviewUnit>:
  match count:
    case 0n:
      Nil{}
    case 1n+rest:
      ReviewUnit{next_id, observation, ReviewQueued{}, 0n, 0n} <>
        make_units(rest, observation, (next_id + 1n : Nat))

def unit_ids(units: List<&2, ReviewUnit>) -> List<&2, Nat>:
  match units:
    case Nil{}:
      Nil{}
    case ReviewUnit{id, _, _, _, _} <> rest:
      id <> unit_ids(rest)

def prepare.apply(work: Work, +observation: Nat, +count: Nat) -> WorkStep:
  match work:
    case Work{next_observation, +next_unit, source_capacity, review_capacity, observations, units}:
      +new_units = make_units(count, observation, next_unit)
      Accepted{settle(Work{next_observation, (next_unit + count : Nat), source_capacity, review_capacity,
        remove_observation(observation, observations), List.append(&2, ReviewUnit, units, new_units)}), unit_ids(new_units)}

def prepare.count(work: Work, observation: Nat, count: Nat, within_limit: Bool) -> WorkStep:
  match within_limit:
    case False{}:
      Rejected{work, TooManyUnits{}}
    case True{}:
      prepare.apply(work, observation, count)

def prepare.stage(work: Work, observation: Nat, +count: Nat, stage: ObservationStage) -> WorkStep:
  match stage:
    case SourceQueued{}:
      Rejected{work, SourceNotReading{}}
    case SourceReading{}:
      prepare.count(work, observation, count, Nat.is_le(count, 16n))

def prepare.found(work: Work, observation: Nat, count: Nat, found: Maybe<&2, Observation>) -> WorkStep:
  match found:
    case None{}:
      Rejected{work, MissingObservation{}}
    case Some{Observation{_, stage}}:
      prepare.stage(work, observation, count, stage)

def prepare(+work: Work, +observation: Nat, count: Nat) -> WorkStep:
  match work:
    case Work{_, _, _, _, observations, _}:
      prepare.found(work, observation, count, find_observation(observation, observations))

# A source observation can emit review units a candidate at a time while the
# source callback remains active. The resident must not retain all candidates
# until the final one has been analyzed.
def spawn.apply(work: Work, +observation: Nat, +count: Nat) -> WorkStep:
  match work:
    case Work{next_observation, +next_unit, source_capacity, review_capacity, observations, units}:
      +new_units = make_units(count, observation, next_unit)
      Accepted{settle(Work{next_observation, (next_unit + count : Nat), source_capacity, review_capacity,
        observations, List.append(&2, ReviewUnit, units, new_units)}), unit_ids(new_units)}

def spawn.count(work: Work, observation: Nat, count: Nat, valid: Bool) -> WorkStep:
  match valid:
    case False{}:
      Rejected{work, TooManyUnits{}}
    case True{}:
      spawn.apply(work, observation, count)

def spawn.found(work: Work, observation: Nat, +count: Nat, found: Maybe<&2, Observation>) -> WorkStep:
  match found:
    case None{}:
      Rejected{work, MissingObservation{}}
    case Some{Observation{_, stage}}:
      match stage:
        case SourceQueued{}:
          Rejected{work, SourceNotReading{}}
        case SourceReading{}:
          spawn.count(work, observation, count, Nat.is_le(count, 16n))

def spawn(+work: Work, +observation: Nat, +count: Nat) -> WorkStep:
  match work:
    case Work{_, _, _, _, observations, _}:
      spawn.found(work, observation, count, find_observation(observation, observations))

def find_unit.pick(unit: ReviewUnit, fallback: Maybe<&2, ReviewUnit>, hit: Bool) -> Maybe<&2, ReviewUnit>:
  match hit:
    case True{}:
      Some{unit}
    case False{}:
      fallback

def find_unit(+id: Nat, units: List<&2, ReviewUnit>) -> Maybe<&2, ReviewUnit>:
  match units:
    case Nil{}:
      None{}
    case +unit <> rest:
      match unit:
        case ReviewUnit{current, _, _, _, _}:
          find_unit.pick(unit, find_unit(id, rest), Nat.is_eq(current, id))

def pending_for.found(found: Maybe<&2, ReviewUnit>) -> Nat:
  match found:
    case None{}:
      0n
    case Some{ReviewUnit{_, _, stage, findings, _}}:
      match stage:
        case PendingFinding{}:
          findings
        case _:
          0n

def pending_for(work: Work, id: Nat) -> Nat:
  match work:
    case Work{_, _, _, _, _, units}:
      pending_for.found(find_unit(id, units))

def replace_unit.pick(unit: ReviewUnit, replacement: ReviewUnit, tail: List<&2, ReviewUnit>, hit: Bool) -> List<&2, ReviewUnit>:
  match hit:
    case True{}:
      replacement <> tail
    case False{}:
      unit <> tail

type Outcome is Data:
  Finding{count: Nat, bytes: Nat}
  Clear{}
  Unavailable{}

def replace_unit(+id: Nat, +replacement: ReviewUnit, units: List<&2, ReviewUnit>) -> List<&2, ReviewUnit>:
  match units:
    case Nil{}:
      Nil{}
    case +unit <> rest:
      match unit:
        case ReviewUnit{current, _, _, _, _}:
          replace_unit.pick(unit, replacement, replace_unit(id, replacement, rest), Nat.is_eq(current, id))

def outcome.apply(work: Work, +unit: ReviewUnit) -> WorkStep:
  match work:
    case Work{next_observation, next_unit, source_capacity, review_capacity, observations, units}:
      match unit:
        case ReviewUnit{+id, _, _, _, _}:
          Accepted{settle(Work{next_observation, next_unit, source_capacity, review_capacity,
            observations, replace_unit(id, unit, units)}), Nil{}}

def start_unit.apply(work: Work, id: Nat, observation: Nat) -> WorkStep:
  outcome.apply(work, ReviewUnit{id, observation, AtJev{}, 0n, 0n})

def start_unit.stage(work: Work, id: Nat, observation: Nat, stage: UnitStage) -> WorkStep:
  match stage:
    case ReviewQueued{}:
      start_unit.apply(work, id, observation)
    case AtJev{}:
      Accepted{work, Nil{}}
    case _:
      Rejected{work, UnitNotAtJev{}}

def start_unit.found(work: Work, id: Nat, found: Maybe<&2, ReviewUnit>) -> WorkStep:
  match found:
    case None{}:
      Rejected{work, MissingUnit{}}
    case Some{ReviewUnit{_, observation, stage, _, _}}:
      start_unit.stage(work, id, observation, stage)

def start_unit(+work: Work, +id: Nat) -> WorkStep:
  match work:
    case Work{_, _, _, _, _, units}:
      start_unit.found(work, id, find_unit(id, units))

def outcome.finding(work: Work, id: Nat, observation: Nat, count: Nat, bytes: Nat, positive: Bool) -> WorkStep:
  match positive:
    case False{}:
      Rejected{work, InvalidFinding{}}
    case True{}:
      outcome.apply(work, ReviewUnit{id, observation, PendingFinding{}, count, bytes})

def outcome.kind(work: Work, id: Nat, observation: Nat, result: Outcome) -> WorkStep:
  match result:
    case Finding{+count, bytes}:
      outcome.finding(work, id, observation, count, bytes, Nat.is_gt(count, 0n))
    case Clear{}:
      outcome.apply(work, ReviewUnit{id, observation, ClearResult{}, 0n, 0n})
    case Unavailable{}:
      outcome.apply(work, ReviewUnit{id, observation, UnavailableResult{}, 0n, 0n})

def outcome.stage(work: Work, id: Nat, observation: Nat, stage: UnitStage, result: Outcome) -> WorkStep:
  match stage:
    case AtJev{}:
      outcome.kind(work, id, observation, result)
    case _:
      Rejected{work, UnitNotAtJev{}}

def outcome.found(work: Work, id: Nat, result: Outcome, found: Maybe<&2, ReviewUnit>) -> WorkStep:
  match found:
    case None{}:
      Rejected{work, MissingUnit{}}
    case Some{ReviewUnit{_, observation, stage, _, _}}:
      outcome.stage(work, id, observation, stage, result)

def outcome(+work: Work, +id: Nat, result: Outcome) -> WorkStep:
  match work:
    case Work{_, _, _, _, _, units}:
      outcome.found(work, id, result, find_unit(id, units))

def revise_finding.valid(work: Work, id: Nat, observation: Nat, count: Nat, bytes: Nat,
    valid: Bool) -> WorkStep:
  match valid:
    case False{}:
      Rejected{work, InvalidFinding{}}
    case True{}:
      outcome.apply(work, ReviewUnit{id, observation, PendingFinding{}, count, bytes})

def revise_finding.stage(work: Work, id: Nat, observation: Nat, stage: UnitStage,
    +count: Nat, bytes: Nat) -> WorkStep:
  match stage:
    case PendingFinding{}:
      revise_finding.valid(work, id, observation, count, bytes, Nat.is_gt(count, 0n))
    case _:
      Rejected{work, UnitNotAtJev{}}

def revise_finding.found(work: Work, id: Nat, count: Nat, bytes: Nat,
    found: Maybe<&2, ReviewUnit>) -> WorkStep:
  match found:
    case None{}:
      Rejected{work, MissingUnit{}}
    case Some{ReviewUnit{_, observation, stage, _, _}}:
      revise_finding.stage(work, id, observation, stage, count, bytes)

def revise_finding(+work: Work, +id: Nat, count: Nat, bytes: Nat) -> WorkStep:
  match work:
    case Work{_, _, _, _, _, units}:
      revise_finding.found(work, id, count, bytes, find_unit(id, units))

def interrupt_unit.stage(work: Work, id: Nat, observation: Nat, stage: UnitStage) -> WorkStep:
  match stage:
    case AtJev{}:
      outcome.apply(work, ReviewUnit{id, observation, InterruptedResult{}, 0n, 0n})
    case ReviewQueued{}:
      outcome.apply(work, ReviewUnit{id, observation, InterruptedResult{}, 0n, 0n})
    case _:
      Rejected{work, UnitNotAtJev{}}

def interrupt_unit.found(work: Work, id: Nat, found: Maybe<&2, ReviewUnit>) -> WorkStep:
  match found:
    case None{}:
      Rejected{work, MissingUnit{}}
    case Some{ReviewUnit{_, observation, stage, _, _}}:
      interrupt_unit.stage(work, id, observation, stage)

def interrupt_unit(+work: Work, +id: Nat) -> WorkStep:
  match work:
    case Work{_, _, _, _, _, units}:
      interrupt_unit.found(work, id, find_unit(id, units))

def interrupt_observation.found(work: Work, id: Nat, found: Maybe<&2, Observation>) -> WorkStep:
  match work:
    case Work{next_observation, next_unit, source_capacity, review_capacity, observations, units}:
      match found:
        case None{}:
          Rejected{Work{next_observation, next_unit, source_capacity, review_capacity, observations, units}, MissingObservation{}}
        case Some{_}:
          Accepted{settle(Work{next_observation, next_unit, source_capacity, review_capacity,
            remove_observation(id, observations), units}), Nil{}}

def interrupt_observation(+work: Work, +id: Nat) -> WorkStep:
  match work:
    case Work{_, _, _, _, observations, _}:
      interrupt_observation.found(work, id, find_observation(id, observations))

def complete_source.found(work: Work, id: Nat, found: Maybe<&2, Observation>) -> WorkStep:
  match found:
    case None{}:
      Rejected{work, MissingObservation{}}
    case Some{Observation{_, stage}}:
      match stage:
        case SourceQueued{}:
          Rejected{work, SourceNotReading{}}
        case SourceReading{}:
          interrupt_observation(work, id)

def complete_source(+work: Work, +id: Nat) -> WorkStep:
  match work:
    case Work{_, _, _, _, observations, _}:
      complete_source.found(work, id, find_observation(id, observations))

def cached_finding.apply(work: Work, observation: Nat, +count: Nat, +bytes: Nat) -> WorkStep:
  match work:
    case Work{next_observation, +next_unit, source_capacity, review_capacity, observations, units}:
      Accepted{Work{next_observation, (next_unit + 1n : Nat), source_capacity, review_capacity,
        observations, List.append(&2, ReviewUnit, units,
          ReviewUnit{next_unit, observation, PendingFinding{}, count, bytes} <> Nil{})}, next_unit <> Nil{}}

def cached_finding.count(work: Work, observation: Nat, count: Nat, bytes: Nat, valid: Bool) -> WorkStep:
  match valid:
    case False{}:
      Rejected{work, InvalidFinding{}}
    case True{}:
      cached_finding.apply(work, observation, count, bytes)

def cached_finding.found(work: Work, observation: Nat, +count: Nat, bytes: Nat,
    found: Maybe<&2, Observation>) -> WorkStep:
  match found:
    case None{}:
      Rejected{work, MissingObservation{}}
    case Some{Observation{_, stage}}:
      match stage:
        case SourceQueued{}:
          Rejected{work, SourceNotReading{}}
        case SourceReading{}:
          cached_finding.count(work, observation, count, bytes, Nat.is_gt(count, 0n))

def cached_finding(+work: Work, +observation: Nat, +count: Nat, +bytes: Nat) -> WorkStep:
  match work:
    case Work{_, _, _, _, observations, _}:
      cached_finding.found(work, observation, count, bytes,
        find_observation(observation, observations))

def remove_unit.pick(unit: ReviewUnit, tail: List<&2, ReviewUnit>, hit: Bool) -> List<&2, ReviewUnit>:
  match hit:
    case True{}:
      tail
    case False{}:
      unit <> tail

def remove_unit(+id: Nat, units: List<&2, ReviewUnit>) -> List<&2, ReviewUnit>:
  match units:
    case Nil{}:
      Nil{}
    case +unit <> rest:
      match unit:
        case ReviewUnit{current, _, _, _, _}:
          remove_unit.pick(unit, remove_unit(id, rest), Nat.is_eq(current, id))

def retire.apply(work: Work, id: Nat) -> WorkStep:
  match work:
    case Work{next_observation, next_unit, source_capacity, review_capacity, observations, units}:
      Accepted{Work{next_observation, next_unit, source_capacity, review_capacity,
        observations, remove_unit(id, units)}, Nil{}}

def retire.stage(work: Work, id: Nat, unfinished: Bool) -> WorkStep:
  match unfinished:
    case True{}:
      Rejected{work, UnitStillUnfinished{}}
    case False{}:
      retire.apply(work, id)

def retire.found(work: Work, id: Nat, found: Maybe<&2, ReviewUnit>) -> WorkStep:
  match found:
    case None{}:
      Rejected{work, MissingUnit{}}
    case Some{ReviewUnit{_, _, stage, _, _}}:
      retire.stage(work, id, is_unit_unfinished(stage))

def retire(+work: Work, +id: Nat) -> WorkStep:
  match work:
    case Work{_, _, _, _, _, units}:
      retire.found(work, id, find_unit(id, units))

def set_source_capacity.apply(work: Work, capacity: Flow.Capacity, valid: Bool) -> WorkStep:
  match work:
    case Work{next_observation, next_unit, source_capacity, review_capacity, observations, units}:
      match valid:
        case False{}:
          Rejected{Work{next_observation, next_unit, source_capacity, review_capacity, observations, units}, InvalidCapacity{}}
        case True{}:
          Accepted{settle(Work{next_observation, next_unit, capacity, review_capacity, observations, units}), Nil{}}

def set_source_capacity(work: Work, +capacity: Flow.Capacity) -> WorkStep:
  set_source_capacity.apply(work, capacity, Flow.capacity_valid(capacity))

def set_review_capacity.apply(work: Work, capacity: Flow.Capacity, valid: Bool) -> WorkStep:
  match work:
    case Work{next_observation, next_unit, source_capacity, review_capacity, observations, units}:
      match valid:
        case False{}:
          Rejected{Work{next_observation, next_unit, source_capacity, review_capacity, observations, units}, InvalidCapacity{}}
        case True{}:
          Accepted{settle(Work{next_observation, next_unit, source_capacity, capacity, observations, units}), Nil{}}

def set_review_capacity(work: Work, +capacity: Flow.Capacity) -> WorkStep:
  set_review_capacity.apply(work, capacity, Flow.capacity_valid(capacity))

def source_cancel_ids(observations: List<&2, Observation>) -> List<&2, Nat>:
  match observations:
    case Nil{}:
      Nil{}
    case Observation{id, stage} <> rest:
      match stage:
        case SourceReading{}:
          id <> source_cancel_ids(rest)
        case SourceQueued{}:
          source_cancel_ids(rest)

def observation_ids(observations: List<&2, Observation>) -> List<&2, Nat>:
  match observations:
    case Nil{}:
      Nil{}
    case Observation{id, _} <> rest:
      id <> observation_ids(rest)

def unfinished_unit_ids(units: List<&2, ReviewUnit>) -> List<&2, Nat>:
  match units:
    case Nil{}:
      Nil{}
    case ReviewUnit{id, _, stage, _, _} <> rest:
      match stage:
        case ReviewQueued{}:
          id <> unfinished_unit_ids(rest)
        case AtJev{}:
          id <> unfinished_unit_ids(rest)
        case _:
          unfinished_unit_ids(rest)

def keep_terminal.pick(unit: ReviewUnit, tail: List<&2, ReviewUnit>, unfinished: Bool) -> List<&2, ReviewUnit>:
  match unfinished:
    case True{}:
      tail
    case False{}:
      unit <> tail

def keep_terminal(units: List<&2, ReviewUnit>) -> List<&2, ReviewUnit>:
  match units:
    case Nil{}:
      Nil{}
    case +unit <> rest:
      match unit:
        case ReviewUnit{_, _, stage, _, _}:
          keep_terminal.pick(unit, keep_terminal(rest), is_unit_unfinished(stage))

def cancel_unfinished(work: Work) -> CancelResult:
  match work:
    case Work{next_observation, next_unit, source_capacity, review_capacity, +observations, +units}:
      Cancelled{Work{next_observation, next_unit, source_capacity, review_capacity,
        Nil{}, keep_terminal(units)}, observation_ids(observations), unfinished_unit_ids(units)}

def jev_cancel_ids(units: List<&2, ReviewUnit>) -> List<&2, Nat>:
  match units:
    case Nil{}:
      Nil{}
    case ReviewUnit{id, _, stage, _, _} <> rest:
      match stage:
        case AtJev{}:
          id <> jev_cancel_ids(rest)
        case _:
          jev_cancel_ids(rest)

def discarded_finding_ids(units: List<&2, ReviewUnit>) -> List<&2, Nat>:
  match units:
    case Nil{}:
      Nil{}
    case ReviewUnit{id, _, stage, _, _} <> rest:
      match stage:
        case PendingFinding{}:
          id <> discarded_finding_ids(rest)
        case _:
          discarded_finding_ids(rest)

def close(work: Work) -> CloseResult:
  match work:
    case Work{next_observation, next_unit, source_capacity, review_capacity, +observations, +units}:
      Closed{Work{next_observation, next_unit, source_capacity, review_capacity, Nil{}, Nil{}},
        source_cancel_ids(observations), jev_cancel_ids(units), discarded_finding_ids(units)}

def main() -> WorkStep:
  admit(initial())
