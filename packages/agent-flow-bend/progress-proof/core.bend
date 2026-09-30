import Base
import ../Dispatch.bend as Dispatch
import ../Handoff.bend as Handoff
import ../Canonical.bend as Canonical

# Proof drivers call the production transitions. They assume matching native
# responses, not successful IO. No clocks, promises or agent receipt live here.
def resolved(result: Dispatch.RequestResult,
    next: Dispatch.State -> Dispatch.RequestResult) -> Dispatch.RequestResult:
  match result:
    case Dispatch.RequestAccepted{state}: next(state)
    case Dispatch.RequestDenied{state}: Dispatch.RequestDenied{state}

# The response list is a finite cohort, with one matching settlement per entry.
# Closure is preserved: shutdown cannot silently reopen through resolution.
def resolve_requests(remaining: List<&2, Dispatch.Request>,
    state: Dispatch.State) -> Dispatch.RequestResult:
  match remaining:
    case Nil{}: Dispatch.RequestAccepted{state}
    case Dispatch.Request{+partition, +lifetime, +round, +operation, +request, _, _} <> rest:
      resolved(Dispatch.request_update(state, partition, lifetime, round,
        operation, request, False{}, False{}, True{}),
        next => resolve_requests(rest, next))

# A settled failure cohort cannot poison admission of a fresh request. All
# dispatch metadata and running jobs are preserved; only request permits drain.
def recover_result(partition: Nat, lifetime: Nat, round: Nat,
    operation: Nat, request: Nat, result: Dispatch.RequestResult) -> Dispatch.RequestResult:
  match result:
    case Dispatch.RequestAccepted{state}:
      Dispatch.reserve_request(state, partition, lifetime, round, operation, request)
    case Dispatch.RequestDenied{state}: Dispatch.RequestDenied{state}

def recover_requests(remaining: List<&2, Dispatch.Request>, state: Dispatch.State,
    partition: Nat, lifetime: Nat, round: Nat, operation: Nat,
    request: Nat) -> Dispatch.RequestResult:
  recover_result(partition, lifetime, round, operation, request,
    resolve_requests(remaining, state))

# A responsive writer supplies authorization and then a certain terminal fact.
def acknowledge(result: Handoff.LeaseResult, +round: Nat, +token: Nat) -> Handoff.LeaseResult:
  match result:
    case Handoff.Granted{state}:
      Handoff.lease.terminal(state, round, token, True{})
    case Handoff.Denied{state}: Handoff.Denied{state}

def authorize(result: Handoff.LeaseResult, +round: Nat, +token: Nat) -> Handoff.LeaseResult:
  match result:
    case Handoff.Granted{state}:
      acknowledge(Handoff.lease.authorize(state, round, token), round, token)
    case Handoff.Denied{state}: Handoff.Denied{state}

def deliver(+lease: Handoff.Lease, +token: Nat, surface: Handoff.Surface) -> Handoff.LeaseResult:
  match lease:
    case Handoff.Lease{_, +round, _, _, _}:
      authorize(Handoff.lease.offer(lease, round, token, surface, True{}), round, token)

# Synthetic callback phase facts must satisfy Canonical's production predicate.
def request_started(outcome: Canonical.RequestOutcome) -> Bool:
  match outcome:
    case Canonical.NeverSent{}: False{}
    case _: True{}

def request_interrupted(outcome: Canonical.RequestOutcome) -> Bool:
  match outcome:
    case Canonical.RequestInterrupted{}: True{}
    case _: False{}

# Existing checked writers are runnable too; matching tokens are read from their
# lease. A spent uncertain write remains terminal, rather than inventing retries.
def handoff_runnable(lease: Handoff.Lease) -> Bool:
  match lease:
    case Handoff.Lease{_, _, True{}, _, _}: False{}
    case Handoff.Lease{_, _, False{}, _, Handoff.Available{}}: True{}
    case Handoff.Lease{_, _, False{}, _, Handoff.Reserved{_, _}}: True{}
    case Handoff.Lease{_, _, False{}, _, Handoff.Authorized{_, _}}: True{}
    case Handoff.Lease{_, _, False{}, _, Handoff.Submitted{_}}: True{}
    case Handoff.Lease{_, _, False{}, False{}, Handoff.Uncertain{Handoff.Background{}}}: True{}
    case _: False{}

def resume(+lease: Handoff.Lease, token: Nat, surface: Handoff.Surface) -> Handoff.LeaseResult:
  match lease:
    case Handoff.Lease{_, _, True{}, _, _}: Handoff.Denied{lease}
    case Handoff.Lease{_, _, False{}, _, Handoff.Available{}}:
      deliver(lease, token, surface)
    case Handoff.Lease{_, +round, False{}, _, Handoff.Reserved{+own_token, _}}:
      acknowledge(Handoff.lease.authorize(lease, round, own_token), round, own_token)
    case Handoff.Lease{_, round, False{}, _, Handoff.Authorized{own_token, _}}:
      Handoff.lease.terminal(lease, round, own_token, True{})
    case Handoff.Lease{_, _, False{}, _, Handoff.Submitted{_}}:
      Handoff.Granted{lease}
    case Handoff.Lease{_, _, False{}, False{}, Handoff.Uncertain{Handoff.Background{}}}:
      deliver(lease, token, Handoff.Stop{})
    case _: Handoff.Denied{lease}

def handoff_complete(result: Handoff.LeaseResult) -> Bool:
  match result:
    case Handoff.Granted{Handoff.Lease{_, _, _, _, Handoff.Submitted{_}}}: True{}
    case _: False{}

# Arbitrary completion order for a fixed finite cohort. The law's Responsive
# premise checks every identity against the then-current request pool.
def scheduled_requests(responses: List<&2, Dispatch.Request>,
    requests: List<&2, Dispatch.Request>) -> List<&2, Dispatch.Request>:
  match responses:
    case Nil{}: requests
    case Dispatch.Request{partition, lifetime, round, operation, request, _, _} <> rest:
      scheduled_requests(rest, Dispatch.request_remove(requests, partition,
        lifetime, round, operation, request))
