import Base

# A virtual round can retire after a continuous observed quiet interval.
# Native effects supply measured idle facts; Bend owns the clock decision.
type Facts is Data:
  Facts{native_work_idle: Bool, advice_empty: Bool, handoff_idle: Bool,
    stop_absent: Bool}

type Decision is Data:
  Busy{}
  Waiting{since: Nat}
  Expired{since: Nat}

def facts_quiet(facts: Facts) -> Bool:
  match facts:
    case Facts{work, advice, handoff, stop}:
      Bool.and(work, Bool.and(advice, Bool.and(handoff, stop)))

def decide_started(+since: Nat, now: Nat, window: Nat) -> Decision:
  Bool.pick(Decision, Nat.is_ge(now, (since + window : Nat)),
    Expired{since}, Waiting{since})

def decide_quiet(since: Maybe<&2, Nat>, +now: Nat, window: Nat) -> Decision:
  match since:
    case None{}: Waiting{now}
    case Some{+start}:
      Bool.pick(Decision, Nat.is_ge(now, start),
        decide_started(start, now, window), Waiting{now})

def decide(since: Maybe<&2, Nat>, now: Nat, window: Nat, quiet: Bool) -> Decision:
  match quiet:
    case False{}: Busy{}
    case True{}: decide_quiet(since, now, window)
