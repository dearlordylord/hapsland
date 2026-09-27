import Base

# A ticket reports the eventual outcome of a Claude collection request. The
# native adapter supplies credential authority and live advice/notice facts;
# these ordered terminal decisions belong to Bend.
type Reason is Data:
  Backend{}
  Credential{}
  Capacity{}
  Stale{}
  Lost{}
  Expired{}

type Phase is Data:
  Preparing{failure: Maybe<&2, Reason>}
  Closed{}
  Failed{reason: Reason}

type Facts is Data:
  Facts{expired: Bool, credential_valid: Bool,
    pending_units: Nat, live_advice: Bool, pending_notice: Bool,
    unit_failure: Maybe<&2, Reason>, finding_units: Nat,
    undelivered_findings: Nat, total_units: Nat}

type Outcome is Data:
  Pending{}
  Unavailable{reason: Reason}
  Delivered{}
  Clear{}
  NoWork{}

def initial() -> Phase:
  Preparing{None{}}

def fail.previous(previous: Maybe<&2, Reason>, reason: Reason) -> Phase:
  match previous:
    case None{}:
      Preparing{Some{reason}}
    case Some{earlier}:
      Preparing{Some{earlier}}

def fail(phase: Phase, reason: Reason) -> Phase:
  match phase:
    case Preparing{previous}:
      fail.previous(previous, reason)
    case _:
      phase

def close(phase: Phase) -> Phase:
  match phase:
    case Preparing{failure}:
      match failure:
        case None{}:
          Closed{}
        case Some{reason}:
          Failed{reason}
    case _:
      phase

def terminal.findings(finding_units: Nat, undelivered: Nat, total: Nat) -> Outcome:
  Bool.pick(Outcome, Nat.is_gt(finding_units, 0n),
    Bool.pick(Outcome, Nat.is_eq(undelivered, 0n), Delivered{}, Unavailable{Lost{}}),
    Bool.pick(Outcome, Nat.is_gt(total, 0n), Clear{}, NoWork{}))

def terminal.unit(failure: Maybe<&2, Reason>, finding_units: Nat,
    undelivered: Nat, total: Nat) -> Outcome:
  match failure:
    case Some{reason}:
      Unavailable{reason}
    case None{}:
      terminal.findings(finding_units, undelivered, total)

def terminal.phase(state: Phase, failure: Maybe<&2, Reason>, finding_units: Nat,
    undelivered: Nat, total: Nat) -> Outcome:
  match state:
    case Failed{reason}:
      Unavailable{reason}
    case _:
      terminal.unit(failure, finding_units, undelivered, total)

def is_preparing(state: Phase) -> Bool:
  match state:
    case Preparing{_}:
      True{}
    case _:
      False{}

def terminal.pending(+state: Phase, facts: Facts) -> Outcome:
  match facts:
    case Facts{_, _, pending_units, live_advice, pending_notice,
        unit_failure, finding_units, undelivered, total}:
      Bool.pick(Outcome, Bool.or(is_preparing(state),
          Bool.or(Nat.is_gt(pending_units, 0n), Bool.or(live_advice, pending_notice))),
        Pending{}, terminal.phase(state, unit_failure, finding_units, undelivered, total))

def terminal(+state: Phase, +facts: Facts) -> Outcome:
  match facts:
    case Facts{expired, credential_valid, _, _, _, _, _, _, _}:
      Bool.pick(Outcome, expired, Unavailable{Expired{}},
        Bool.pick(Outcome, Bool.not(credential_valid), Unavailable{Credential{}},
          terminal.pending(state, facts)))

def main() -> Outcome:
  terminal(Closed{}, Facts{False{}, True{}, 0n, False{}, False{}, None{}, 0n, 0n, 1n})
