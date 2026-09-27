import Base

type CleanupFacts is Data:
  CleanupFacts{active: Bool, dispatcher_idle: Bool, no_advice: Bool,
    no_notices: Bool, no_pending_evaluations: Bool, no_current_work: Bool,
    no_cooldowns: Bool, connection_count_ok: Bool, cache_matches_ledger: Bool}

type CleanupGate is Data:
  CleanupBusy{}
  CleanupReady{}

type TicketRetention is Data:
  KeepTickets{}
  EvictOldest{}

type DiscardScope is Data:
  NamedOnly{}
  AllUnfinished{}

def cleanup_gate(facts: CleanupFacts) -> CleanupGate:
  match facts:
    case CleanupFacts{active, dispatcher_idle, no_advice, no_notices,
        no_pending_evaluations, no_current_work, no_cooldowns,
        connection_count_ok, cache_matches_ledger}:
      Bool.pick(CleanupGate, Bool.and(active, Bool.and(dispatcher_idle,
        Bool.and(no_advice, Bool.and(no_notices,
        Bool.and(no_pending_evaluations, Bool.and(no_current_work,
        Bool.and(no_cooldowns, Bool.and(connection_count_ok, cache_matches_ledger)))))))),
        CleanupReady{}, CleanupBusy{})

def cleanup_commit(ledger_empty: Bool) -> CleanupGate:
  Bool.pick(CleanupGate, ledger_empty, CleanupReady{}, CleanupBusy{})

def ticket_retention(count: Nat, limit: Nat, has_oldest: Bool) -> TicketRetention:
  Bool.pick(TicketRetention, Bool.and(Nat.is_gt(count, limit), has_oldest),
    EvictOldest{}, KeepTickets{})

def discard_scope(named_count: Nat, cancelled_count: Nat,
    has_unnamed: Bool) -> DiscardScope:
  Bool.pick(DiscardScope, Bool.and(Nat.is_eq(named_count, cancelled_count),
    Bool.not(has_unnamed)), NamedOnly{}, AllUnfinished{})

def main() -> CleanupGate:
  cleanup_gate(CleanupFacts{True{}, True{}, True{}, True{}, True{}, True{},
    True{}, True{}, True{}})
