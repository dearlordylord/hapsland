import Base
import ./LAWS.bend as Laws
import ./core.bend as Core
import ../Dispatch.bend as Dispatch
import ../Handoff.bend as Handoff
import ../Canonical.bend as Canonical

# ---- shared ----
def nat_eq_self(+n: Nat) -> {True{} == Nat.is_eq(n, n) : Bool}:
  match n:
    case 0n: {==}
    case 1n+p: nat_eq_self(p)

def request_matches_self(+partition: Nat, +lifetime: Nat, +round: Nat, +operation: Nat, +request: Nat, +started: Bool, +interrupted: Bool) -> {True{} == Dispatch.request_matches(Dispatch.Request{partition, lifetime, round, operation, request, started, interrupted}, partition, lifetime, round, operation, request) : Bool}:
  %nat_eq_self(partition) : {True{} == Bool.and(_, Bool.and(Nat.is_eq(lifetime, lifetime), Bool.and(Nat.is_eq(round, round), Bool.and(Nat.is_eq(operation, operation), Nat.is_eq(request, request))))) : Bool}
  %nat_eq_self(lifetime) : {True{} == Bool.and(_, Bool.and(Nat.is_eq(round, round), Bool.and(Nat.is_eq(operation, operation), Nat.is_eq(request, request)))) : Bool}
  %nat_eq_self(round) : {True{} == Bool.and(_, Bool.and(Nat.is_eq(operation, operation), Nat.is_eq(request, request))) : Bool}
  %nat_eq_self(operation) : {True{} == Bool.and(_, Nat.is_eq(request, request)) : Bool}
  %nat_eq_self(request) : {True{} == _ : Bool}
  {==}

def request_head_phase(+rest: List<&2, Dispatch.Request>, +partition: Nat, +lifetime: Nat, +round: Nat, +operation: Nat, +request: Nat, +started: Bool, +interrupted: Bool) -> {Some{Dispatch.Request{partition, lifetime, round, operation, request, started, interrupted}} ==
  Dispatch.request_phase(Dispatch.Request{partition, lifetime, round, operation, request, started, interrupted} <> rest, partition, lifetime, round, operation, request) : Maybe<&2, Dispatch.Request>}:
  %request_matches_self(partition, lifetime, round, operation, request, started, interrupted) : {Some{Dispatch.Request{partition, lifetime, round, operation, request, started, interrupted}} ==
    Bool.pick(Maybe<&2, Dispatch.Request>, _, Some{Dispatch.Request{partition, lifetime, round, operation, request, started, interrupted}},
      Dispatch.request_phase(rest, partition, lifetime, round, operation, request)) : Maybe<&2, Dispatch.Request>}
  {==}

def request_head_remove(+rest: List<&2, Dispatch.Request>, +partition: Nat, +lifetime: Nat, +round: Nat, +operation: Nat, +request: Nat, +started: Bool, +interrupted: Bool) -> {rest ==
  Dispatch.request_remove(Dispatch.Request{partition, lifetime, round, operation, request, started, interrupted} <> rest, partition, lifetime, round, operation, request) : List<&2, Dispatch.Request>}:
  %request_matches_self(partition, lifetime, round, operation, request, started, interrupted) : {rest ==
    Bool.pick(List<&2, Dispatch.Request>, _, rest,
      Dispatch.Request{partition, lifetime, round, operation, request, started, interrupted} <> Dispatch.request_remove(rest, partition, lifetime, round, operation, request)) : List<&2, Dispatch.Request>}
  {==}

def request_head_resolves(+queued: List<&2, Dispatch.Entry>, +running: List<&2, Dispatch.Entry>,
    +sequence: Nat, +closed: Bool, +rest: List<&2, Dispatch.Request>,
    +partition: Nat, +lifetime: Nat, +round: Nat, +operation: Nat, +request: Nat, +started: Bool, +interrupted: Bool) -> {Dispatch.RequestAccepted{Dispatch.State{queued, running,
        sequence, closed, rest}} ==
      Dispatch.request_update(Dispatch.State{queued, running,
        sequence, closed, Dispatch.Request{partition, lifetime, round, operation, request, started, interrupted} <> rest},
        partition, lifetime, round, operation, request, False{}, False{}, True{}) : Dispatch.RequestResult}:
  %request_head_phase(rest, partition, lifetime, round, operation, request, started, interrupted) : {Dispatch.RequestAccepted{Dispatch.State{queued, running,
      sequence, closed, rest}} ==
    Dispatch.request_update_found(Dispatch.State{queued, running,
      sequence, closed, Dispatch.Request{partition, lifetime, round, operation, request, started, interrupted} <> rest},
      partition, lifetime, round, operation, request, False{}, False{}, True{}, _) : Dispatch.RequestResult}
  %request_head_remove(rest, partition, lifetime, round, operation, request, started, interrupted) : {Dispatch.RequestAccepted{Dispatch.State{queued, running, sequence, closed, rest}} ==
    Dispatch.RequestAccepted{Dispatch.State{queued, running,
      sequence, closed, _}} : Dispatch.RequestResult}
  {==}

def offer_available(+item: Nat, +round: Nat, +reoffered: Bool, +token: Nat,
    +surface: Handoff.Surface) -> {Handoff.Granted{Handoff.Lease{item, round, False{}, reoffered, Handoff.Reserved{token, surface}}} == Handoff.lease.offer(Handoff.Lease{item, round, False{}, reoffered, Handoff.Available{}}, round, token, surface, True{}) : Handoff.LeaseResult}:
  %nat_eq_self(round) : {Handoff.Granted{Handoff.Lease{item, round, False{}, reoffered, Handoff.Reserved{token, surface}}} == Handoff.lease.reserve.guard(Handoff.Lease{item, round, False{}, reoffered, Handoff.Available{}}, token, surface,
    Bool.and(_, True{})) : Handoff.LeaseResult}
  {==}

def authorize_reserved(+item: Nat, +round: Nat, +reoffered: Bool, +token: Nat,
    +surface: Handoff.Surface) -> {Handoff.Granted{Handoff.Lease{item, round, False{}, reoffered, Handoff.Authorized{token, surface}}} == Handoff.lease.authorize(Handoff.Lease{item, round, False{}, reoffered, Handoff.Reserved{token, surface}}, round, token) : Handoff.LeaseResult}:
  %nat_eq_self(round) : {Handoff.Granted{Handoff.Lease{item, round, False{}, reoffered, Handoff.Authorized{token, surface}}} == Handoff.lease.authorize.guard(Handoff.Lease{item, round, False{}, reoffered, Handoff.Reserved{token, surface}}, token,
    Bool.and(_, True{})) : Handoff.LeaseResult}
  %nat_eq_self(token) : {Handoff.Granted{Handoff.Lease{item, round, False{}, reoffered, Handoff.Authorized{token, surface}}} == Handoff.lease.authorize.match(item, round, False{}, reoffered,
    token, surface, _) : Handoff.LeaseResult}
  {==}

def terminal_authorized(+item: Nat, +round: Nat, +reoffered: Bool, +token: Nat,
    +surface: Handoff.Surface) -> {Handoff.Granted{Handoff.Lease{item, round, False{}, reoffered, Handoff.Submitted{surface}}} == Handoff.lease.terminal(Handoff.Lease{item, round, False{}, reoffered, Handoff.Authorized{token, surface}}, round, token, True{}) : Handoff.LeaseResult}:
  %nat_eq_self(round) : {Handoff.Granted{Handoff.Lease{item, round, False{}, reoffered, Handoff.Submitted{surface}}} == Handoff.lease.terminal.guard(Handoff.Lease{item, round, False{}, reoffered, Handoff.Authorized{token, surface}}, token, True{},
    Bool.and(_, True{})) : Handoff.LeaseResult}
  %nat_eq_self(token) : {Handoff.Granted{Handoff.Lease{item, round, False{}, reoffered, Handoff.Submitted{surface}}} == Handoff.lease.terminal.match(item, round, False{}, reoffered,
    token, surface, _, True{}) : Handoff.LeaseResult}
  {==}

def offer_uncertain(+item: Nat, +round: Nat, +token: Nat) -> {Handoff.Granted{Handoff.Lease{item, round, False{}, True{},
    Handoff.Reserved{token, Handoff.Stop{}}}} ==
  Handoff.lease.offer(Handoff.Lease{item, round, False{}, False{},
    Handoff.Uncertain{Handoff.Background{}}}, round, token, Handoff.Stop{}, True{}) : Handoff.LeaseResult}:
  %nat_eq_self(round) : {Handoff.Granted{Handoff.Lease{item, round, False{},
      True{}, Handoff.Reserved{token, Handoff.Stop{}}}} == Handoff.lease.reoffer.guard(Handoff.Lease{item, round,
    False{}, False{}, Handoff.Uncertain{Handoff.Background{}}}, token,
    Bool.and(_, True{})) : Handoff.LeaseResult}
  {==}

def FalseTag(b: Bool) -> Type:
  match b:
    case False{}: Empty
    case True{}: Unit

def true_false_absurd(e: {True{} == False{} : Bool}) -> Empty:
  %e : FalseTag(_)
  Unit{}

# ---- request_cohort_resolves ----
def Laws.request_cohort_resolves(queued, running, sequence, closed, requests):
  match requests:
    case Nil{}: {==}
    case Dispatch.Request{partition, lifetime, round, operation, request, started, interrupted} <> rest:
      %request_head_resolves(queued, running, sequence, closed, rest,
        partition, lifetime, round, operation, request, started, interrupted) : {Dispatch.RequestAccepted{Dispatch.State{queued, running,
            sequence, closed, Nil{}}} ==
          Core.resolved(_, next => Core.resolve_requests(rest, next)) : Dispatch.RequestResult}
      Laws.request_cohort_resolves(queued, running, sequence, closed, rest)

# ---- settled_failures_allow_fresh_request ----
def Laws.settled_failures_allow_fresh_request(queued, running, sequence,
    requests, partition, lifetime, round, operation, request):
  %Laws.request_cohort_resolves(queued, running, sequence, False{}, requests) : {
    Core.recover_result(partition, lifetime, round, operation, request, _) ==
    Dispatch.RequestAccepted{Dispatch.State{queued, running,
      sequence, False{}, Dispatch.Request{partition, lifetime, round,
        operation, request, False{}, False{}} <> Nil{}}} : Dispatch.RequestResult}
  {==}

# ---- eligible_advice_reaches_handoff ----
def Laws.eligible_advice_reaches_handoff(item, round, reoffered, token, surface):
  %offer_available(item, round, reoffered, token, surface) : {Handoff.Granted{Handoff.Lease{item, round, False{}, reoffered, Handoff.Submitted{surface}}} == Core.authorize(_, round, token) : Handoff.LeaseResult}
  %authorize_reserved(item, round, reoffered, token, surface) : {Handoff.Granted{Handoff.Lease{item, round, False{}, reoffered, Handoff.Submitted{surface}}} ==
    Core.acknowledge(_, round, token) : Handoff.LeaseResult}
  terminal_authorized(item, round, reoffered, token, surface)

# ---- uncertain_background_reaches_stop_handoff ----
def Laws.uncertain_background_reaches_stop_handoff(item, round, token):
  %offer_uncertain(item, round, token) : {Handoff.Granted{Handoff.Lease{item, round, False{}, True{}, Handoff.Submitted{Handoff.Stop{}}}} == Core.authorize(_, round, token) : Handoff.LeaseResult}
  %authorize_reserved(item, round, True{}, token, Handoff.Stop{}) : {Handoff.Granted{Handoff.Lease{item, round, False{}, True{}, Handoff.Submitted{Handoff.Stop{}}}} ==
    Core.acknowledge(_, round, token) : Handoff.LeaseResult}
  terminal_authorized(item, round, True{}, token, Handoff.Stop{})

# ---- supplied_outcome_has_valid_phase ----
def Laws.supplied_outcome_has_valid_phase(outcome):
  match outcome:
    case Canonical.NeverSent{}: {==}
    case Canonical.RequestFinding{}: {==}
    case Canonical.RequestClear{}: {==}
    case Canonical.RequestBackendFailure{}: {==}
    case Canonical.RequestTimeout{}: {==}
    case Canonical.RequestInterrupted{}: {==}

# ---- runnable_advice_reaches_handoff ----
def Laws.runnable_advice_reaches_handoff(lease, token, surface, eligible):
  match lease:
    case Handoff.Lease{_, _, True{}, _, _}:
      Empty.absurd({Core.handoff_complete(Core.resume(lease, token, surface)) == True{} : Bool},
        true_false_absurd(eligible))
    case Handoff.Lease{item, round, False{}, reoffered, Handoff.Available{}}:
      %Laws.eligible_advice_reaches_handoff(item, round, reoffered, token, surface) : {
        Core.handoff_complete(_) == True{} : Bool}
      {==}
    case Handoff.Lease{item, round, False{}, reoffered, Handoff.Reserved{own_token, own_surface}}:
      %authorize_reserved(item, round, reoffered, own_token, own_surface) : {
        Core.handoff_complete(Core.acknowledge(_, round, own_token)) == True{} : Bool}
      %terminal_authorized(item, round, reoffered, own_token, own_surface) : {
        Core.handoff_complete(_) == True{} : Bool}
      {==}
    case Handoff.Lease{item, round, False{}, reoffered, Handoff.Authorized{own_token, own_surface}}:
      %terminal_authorized(item, round, reoffered, own_token, own_surface) : {
        Core.handoff_complete(_) == True{} : Bool}
      {==}
    case Handoff.Lease{_, _, False{}, _, Handoff.Submitted{_}}:
      {==}
    case Handoff.Lease{item, round, False{}, False{}, Handoff.Uncertain{Handoff.Background{}}}:
      %Laws.uncertain_background_reaches_stop_handoff(item, round, token) : {
        Core.handoff_complete(_) == True{} : Bool}
      {==}
    case Handoff.Lease{_, _, False{}, True{}, Handoff.Uncertain{Handoff.Background{}}}:
      Empty.absurd({Core.handoff_complete(Core.resume(lease, token, surface)) == True{} : Bool},
        true_false_absurd(eligible))
    case Handoff.Lease{_, _, False{}, _, Handoff.Uncertain{Handoff.Edit{}}}:
      Empty.absurd({Core.handoff_complete(Core.resume(lease, token, surface)) == True{} : Bool},
        true_false_absurd(eligible))
    case Handoff.Lease{_, _, False{}, _, Handoff.Uncertain{Handoff.Stop{}}}:
      Empty.absurd({Core.handoff_complete(Core.resume(lease, token, surface)) == True{} : Bool},
        true_false_absurd(eligible))

# ---- matching_completion_decreases_request_count ----
def known_tail(+head: Bool, +tail: Bool, no_head: {False{} == head : Bool},
    known: {True{} == Bool.or(head, tail) : Bool}) -> {True{} == tail : Bool}:
  Equal.trans(Bool, True{}, Bool.or(head, tail), tail, known,
    Equal.cong(Bool, Bool, value => Bool.or(value, tail), head, False{},
      Equal.sym(Bool, False{}, head, no_head)))

def duplicate_equation(+a: Bool, +b: Bool, e: {a == b : Bool}) ->
    {a == b : Bool} & {a == b : Bool}:
  %Equal.sym(Bool, a, b, e) : {_ == b : Bool} & {_ == b : Bool}
  ({==}, {==})

def remove_decreases_false(+rest: List<&2, Dispatch.Request>, +item: Dispatch.Request,
    +partition: Nat, +lifetime: Nat, +round: Nat, +operation: Nat, +request: Nat,
    proofs: {False{} == Dispatch.request_matches(item, partition, lifetime, round, operation, request) : Bool} &
      {False{} == Dispatch.request_matches(item, partition, lifetime, round, operation, request) : Bool},
    known: {True{} == Dispatch.request_known(item <> rest, partition, lifetime, round, operation, request) : Bool},
    next: {True{} == Dispatch.request_known(rest, partition, lifetime, round, operation, request) : Bool} ->
      {List.length(&2, Dispatch.Request, rest) == (1n + List.length(&2, Dispatch.Request,
        Dispatch.request_remove(rest, partition, lifetime, round, operation, request)) : Nat) : Nat}) -> {List.length(&2, Dispatch.Request, item <> rest) == (1n + List.length(&2, Dispatch.Request, Dispatch.request_remove(item <> rest,
        partition, lifetime, round, operation, request)) : Nat) : Nat}:
  match proofs:
    case (rewrite, tail_agrees):
      %rewrite : {(1n + List.length(&2, Dispatch.Request, rest) : Nat) == (1n + List.length(&2, Dispatch.Request, Bool.pick(List<&2, Dispatch.Request>, _, rest,
          item <> Dispatch.request_remove(rest, partition, lifetime, round, operation, request))) : Nat) : Nat}
      Equal.cong(Nat, Nat, value => (1n + value : Nat),
        List.length(&2, Dispatch.Request, rest),
        (1n + List.length(&2, Dispatch.Request, Dispatch.request_remove(rest,
          partition, lifetime, round, operation, request)) : Nat),
        next(known_tail(Dispatch.request_matches(item, partition, lifetime, round, operation, request),
          Dispatch.request_known(rest, partition, lifetime, round, operation, request), tail_agrees, known)))

def remove_decreases_decision(+rest: List<&2, Dispatch.Request>, +item: Dispatch.Request,
    +partition: Nat, +lifetime: Nat, +round: Nat, +operation: Nat, +request: Nat,
    +decision: Bool,
    agrees: {decision == Dispatch.request_matches(item, partition, lifetime, round, operation, request) : Bool},
    known: {True{} == Dispatch.request_known(item <> rest, partition, lifetime, round, operation, request) : Bool},
    next: {True{} == Dispatch.request_known(rest, partition, lifetime, round, operation, request) : Bool} ->
      {List.length(&2, Dispatch.Request, rest) == (1n + List.length(&2, Dispatch.Request,
        Dispatch.request_remove(rest, partition, lifetime, round, operation, request)) : Nat) : Nat}) -> {List.length(&2, Dispatch.Request, item <> rest) == (1n + List.length(&2, Dispatch.Request, Dispatch.request_remove(item <> rest,
        partition, lifetime, round, operation, request)) : Nat) : Nat}:
  match decision:
    case True{}:
      %agrees : {(1n + List.length(&2, Dispatch.Request, rest) : Nat) == (1n + List.length(&2, Dispatch.Request, Bool.pick(List<&2, Dispatch.Request>, _, rest,
          item <> Dispatch.request_remove(rest, partition, lifetime, round, operation, request))) : Nat) : Nat}
      {==}
    case False{}:
      remove_decreases_false(rest, item, partition, lifetime, round, operation, request,
        duplicate_equation(False{}, Dispatch.request_matches(item, partition, lifetime, round, operation, request), agrees),
        known, next)

def Laws.matching_completion_decreases_request_count(requests, partition, lifetime, round, operation, request, known):
  match requests:
    case Nil{}:
      Empty.absurd({0n == (1n + 0n : Nat) : Nat}, true_false_absurd(known))
    case +item <> +rest:
      remove_decreases_decision(rest, item, partition, lifetime, round, operation, request,
        Dispatch.request_matches(item, partition, lifetime, round, operation, request), {==}, known,
        tail_known => Laws.matching_completion_decreases_request_count(rest, partition, lifetime,
          round, operation, request, tail_known))

# ---- every_responsive_completion_order_resolves ----
def predecessor(n: Nat) -> Nat:
  match n:
    case 0n: 0n
    case 1n+p: p

def successors_equal(+a: Nat, +b: Nat,
    e: {(1n + a : Nat) == (1n + b : Nat) : Nat}) -> {a == b : Nat}:
  Equal.cong(Nat, Nat, value => predecessor(value), (1n + a : Nat), (1n + b : Nat), e)

def ZeroTag(n: Nat) -> Type:
  match n:
    case 0n: Unit
    case 1n+_: Empty

def zero_successor_absurd(n: Nat, e: {0n == (1n + n : Nat) : Nat}) -> Empty:
  %e : ZeroTag(_)
  Unit{}

def zero_requests(requests: List<&2, Dispatch.Request>,
    empty: {0n == List.length(&2, Dispatch.Request, requests) : Nat}) ->
    {requests == Nil{} : List<&2, Dispatch.Request>}:
  match requests:
    case Nil{}: {==}
    case item <> rest:
      Empty.absurd({item <> rest == Nil{} : List<&2, Dispatch.Request>},
        zero_successor_absurd(List.length(&2, Dispatch.Request, rest), empty))

def schedule_more(+rest: List<&2, Dispatch.Request>, +requests: List<&2, Dispatch.Request>,
    +partition: Nat, +lifetime: Nat, +round: Nat, +operation: Nat, +request: Nat,
    responsive: {True{} == Dispatch.request_known(requests, partition, lifetime, round, operation, request) : Bool} &
      Laws.Responsive(rest, Dispatch.request_remove(requests, partition, lifetime, round, operation, request)),
    count: {(1n + List.length(&2, Dispatch.Request, rest) : Nat) == List.length(&2, Dispatch.Request, requests) : Nat},
    next: Laws.Responsive(rest, Dispatch.request_remove(requests, partition, lifetime, round, operation, request)) ->
      {List.length(&2, Dispatch.Request, rest) == List.length(&2, Dispatch.Request,
        Dispatch.request_remove(requests, partition, lifetime, round, operation, request)) : Nat} ->
      {Core.scheduled_requests(rest, Dispatch.request_remove(requests, partition, lifetime,
        round, operation, request)) == Nil{} : List<&2, Dispatch.Request>}) -> {
    Core.scheduled_requests(rest, Dispatch.request_remove(requests, partition, lifetime,
      round, operation, request)) == Nil{} : List<&2, Dispatch.Request>}:
  match responsive:
    case (known, tail):
      next(tail, successors_equal(List.length(&2, Dispatch.Request, rest),
        List.length(&2, Dispatch.Request, Dispatch.request_remove(requests, partition,
          lifetime, round, operation, request)),
        Equal.trans(Nat, (1n + List.length(&2, Dispatch.Request, rest) : Nat),
          List.length(&2, Dispatch.Request, requests),
          (1n + List.length(&2, Dispatch.Request, Dispatch.request_remove(requests,
            partition, lifetime, round, operation, request)) : Nat), count,
          Laws.matching_completion_decreases_request_count(requests,
            partition, lifetime, round, operation, request, known))))

def Laws.every_responsive_completion_order_resolves(responses, requests, responsive, count):
  match responses:
    case Nil{}:
      zero_requests(requests, count)
    case Dispatch.Request{partition, lifetime, round, operation, request, _, _} <> rest:
      schedule_more(rest, requests, partition, lifetime, round, operation, request,
        responsive, count, tail => remaining_count =>
          Laws.every_responsive_completion_order_resolves(rest,
            Dispatch.request_remove(requests, partition, lifetime, round, operation, request),
            tail, remaining_count))
