import Base
import ./core.bend as Core
import ../Dispatch.bend as Dispatch
import ../Handoff.bend as Handoff
import ../Canonical.bend as Canonical

# Matching settlement must free a permit regardless of start/interruption flags.
# An arbitrary finite cohort resolves under one matching response per request.
law request_cohort_resolves:
  for +queued: List<&2, Dispatch.Entry>
  for +running: List<&2, Dispatch.Entry>
  for +sequence: Nat
  for +closed: Bool
  for +requests: List<&2, Dispatch.Request>
  {Dispatch.RequestAccepted{Dispatch.State{queued, running,
    sequence, closed, Nil{}}} == Core.resolve_requests(requests,
      Dispatch.State{queued, running, sequence, closed, requests}) : Dispatch.RequestResult}

# Recovery applies to open dispatchers; deliberate shutdown stays closed.
law settled_failures_allow_fresh_request:
  for +queued: List<&2, Dispatch.Entry>
  for +running: List<&2, Dispatch.Entry>
  for +sequence: Nat
  for +requests: List<&2, Dispatch.Request>
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +operation: Nat
  for +request: Nat
  {Core.recover_requests(requests, Dispatch.State{queued, running,
    sequence, False{}, requests}, partition, lifetime, round, operation,
    request) == Dispatch.RequestAccepted{Dispatch.State{queued, running,
      sequence, False{}, Dispatch.Request{partition, lifetime, round,
        operation, request, False{}, False{}} <> Nil{}}} : Dispatch.RequestResult}

# A continuously eligible, unleased finding reaches recorded handoff under a
# responsive writer. These are real lease transitions, not an agent receipt.
law eligible_advice_reaches_handoff:
  for +item: Nat
  for +round: Nat
  for +reoffered: Bool
  for +token: Nat
  for +surface: Handoff.Surface
  {Handoff.Granted{
      Handoff.Lease{item, round, False{}, reoffered, Handoff.Submitted{surface}}} == Core.deliver(Handoff.Lease{item, round, False{}, reoffered,
    Handoff.Available{}}, token, surface) : Handoff.LeaseResult}

# The contract's one permitted uncertain background reoffer also progresses.
law uncertain_background_reaches_stop_handoff:
  for +item: Nat
  for +round: Nat
  for +token: Nat
  {Handoff.Granted{
      Handoff.Lease{item, round, False{}, True{}, Handoff.Submitted{Handoff.Stop{}}}} == Core.deliver(Handoff.Lease{item, round, False{}, False{},
    Handoff.Uncertain{Handoff.Background{}}}, token, Handoff.Stop{}) : Handoff.LeaseResult}

# A supplied outcome must come with a valid request lifecycle, for every variant.
law supplied_outcome_has_valid_phase:
  for +outcome: Canonical.RequestOutcome
  {Canonical.request_outcome_valid(outcome, Core.request_started(outcome),
    Core.request_interrupted(outcome)) == True{} : Bool}

# From every runnable lease phase, matching authorization/completion facts reach
# handoff. Continuous freshness/authorization and a responsive writer are host
# obligations; closed or spent uncertain leases are deliberately not runnable.
law runnable_advice_reaches_handoff:
  for +lease: Handoff.Lease
  for +token: Nat
  for +surface: Handoff.Surface
  for eligible: {True{} == Core.handoff_runnable(lease) : Bool}
  {Core.handoff_complete(Core.resume(lease, token, surface)) == True{} : Bool}

# The progress measure decreases for any matching completion order, not only
# the cohort order used by the responsive proof driver.
law matching_completion_decreases_request_count:
  for +requests: List<&2, Dispatch.Request>
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +operation: Nat
  for +request: Nat
  for known: {True{} == Dispatch.request_known(requests, partition, lifetime,
    round, operation, request) : Bool}
  {List.length(&2, Dispatch.Request, requests) == (1n + List.length(&2, Dispatch.Request, Dispatch.request_remove(requests,
      partition, lifetime, round, operation, request)) : Nat) : Nat}

# No terminal conclusion is assumed here. Each response must name live work;
# the separate count premise requires one response per initial permit.
def Responsive(responses: List<&2, Dispatch.Request>,
    +requests: List<&2, Dispatch.Request>) -> Type:
  match responses:
    case Nil{}: Unit
    case Dispatch.Request{+partition, +lifetime, +round, +operation, +request, _, _} <> rest:
      {True{} == Dispatch.request_known(requests, partition, lifetime,
        round, operation, request) : Bool} & Responsive(rest,
          Dispatch.request_remove(requests, partition, lifetime, round, operation, request))

# Every responsive completion permutation drains the cohort. Finite host waits
# are omitted from this trace; nonresponse and new admissions are not premises.
law every_responsive_completion_order_resolves:
  for +responses: List<&2, Dispatch.Request>
  for +requests: List<&2, Dispatch.Request>
  for responsive: Responsive(responses, requests)
  for count: {List.length(&2, Dispatch.Request, responses) ==
    List.length(&2, Dispatch.Request, requests) : Nat}
  {Core.scheduled_requests(responses, requests) == Nil{} : List<&2, Dispatch.Request>}
