import Base
import ../agent-flow-bend/Canonical.bend as C
import ../agent-flow-bend/CollectionState.bend as Collection
import ./CollectionScenario.bend as Response
import ./Driver.bend as Driver
import ../agent-flow-bend/Handoff.bend as Handoff

# Background membership is the actual Canonical claim, not a second FIFO queue.
# This list retains original source-free attribution and response/clock captures
# only for accepted claims. A refused trigger acquires no waiter or advice lease.
type Target is Data:
  Target{partition: Nat, lifetime: Nat, round: Nat, token: Nat}
# Original trigger facts carry no caller-chosen response authority. Engine
# captures credential provenance before queueing this immutable pending fact.
type ClaimFacts is Data:
  ClaimFacts{target: Target, claim_started: Nat, claim_lifetime: Nat,
    capacity: Nat, response: Response.Response}
type Pending is Data:
  Pending{facts: ClaimFacts, credential: Nat}

# Derived only from actual accepted Canonical claim feedback and Engine's
# freshly issued response identity. response_id is never a public input field.
type Capture is Data:
  Capture{target: Target, claim_started: Nat, claim_lifetime: Nat,
    capacity: Nat, response_id: Nat, response: Response.Response}
type State is Data:
  State{writers: List<&2, Capture>, managed: List<&2, Response.Scope>}

def initial() -> State:
  State{[], []}

def same_target(left: Target, right: Target) -> Bool:
  match left right:
    case Target{p, l, r, t} Target{owner, generation, round, token}:
      Nat.is_eq(p, owner) && Nat.is_eq(l, generation) &&
        Nat.is_eq(r, round) && Nat.is_eq(t, token)

def target(capture: Capture) -> Target:
  match capture:
    case Capture{target, _, _, _, _, _}: target

def choose_capture(hit: Bool, capture: Capture,
    rest: Maybe<&2, Capture>) -> Maybe<&2, Capture>:
  match hit:
    case True{}: Some{capture}
    case False{}: rest

def find(writers: List<&2, Capture>, +identity: Target) -> Maybe<&2, Capture>:
  match writers:
    case []: None{}
    case +head <> tail:
      choose_capture(same_target(target(head), identity), head, find(tail, identity))

def lookup(state: State, identity: Target) -> Maybe<&2, Capture>:
  match state:
    case State{writers, _}: find(writers, identity)

def granted(outputs: List<&2, C.Output>) -> Bool:
  match outputs:
    case []: False{}
    case C.EventEstablished{C.CollectionBackgroundClaimed{}} <> _: True{}
    case _ <> tail: granted(tail)

def retain(state: State, capture: Capture, accepted: Bool) -> State:
  match state accepted:
    case State{writers, managed} True{}: State{
      List.append(&2, Capture, writers, [capture]),
      managed
    }
    case _ False{}: state

def release_capture(found: Maybe<&2, Capture>) -> List<&2, C.CanonicalEvent>:
  match found:
    case None{}: []
    case Some{Capture{Target{partition, _, _, token}, _, _, _, _, _}}:
      [C.CollectionReleaseBackground{partition, token}]

# A wrong lifetime/round/token produces no release event and cannot unlock an
# identically numbered claim under a newer incarnation.
def release(state: State, identity: Target) -> List<&2, C.CanonicalEvent>:
  release_capture(lookup(state, identity))

def expire_capture(found: Maybe<&2, Capture>, now: Nat) -> List<&2, C.CanonicalEvent>:
  match found:
    case None{}: []
    case Some{Capture{Target{partition, _, _, token}, started, lifetime, _, _, _}}:
      [C.CollectionExpireBackground{partition, token, (now - started : Nat), lifetime}]

def expire(state: State, identity: Target, now: Nat) -> List<&2, C.CanonicalEvent>:
  expire_capture(lookup(state, identity), now)

def keep_capture(hit: Bool, head: Capture, tail: List<&2, Capture>) -> List<&2, Capture>:
  match hit:
    case True{}: tail
    case False{}: head <> tail

def without(writers: List<&2, Capture>, +identity: Target) -> List<&2, Capture>:
  match writers:
    case []: []
    case +head <> tail:
      keep_capture(same_target(target(head), identity), head, without(tail, identity))

def removed(state: State, identity: Target, accepted: Bool) -> State:
  match state accepted:
    case State{writers, managed} True{}: State{without(writers, identity), managed}
    case _ False{}: state

def claims(collection: Collection.State) -> List<&2, Collection.Claim>:
  match collection:
    case Collection.State{_, _, claims, _, _, _, _}: claims

def owned(canonical: C.State, capture: Capture) -> Bool:
  match capture:
    case Capture{Target{partition, _, _, token}, _, _, _, _, _}:
      Collection.claim_owned(partition, token, claims(C.collection_of(canonical)))

# Accepted contract: one waiter per advicee, no lease while waiting (250-257).
# This source owner captures the same original p/l/r as #192 (232-237).
def facts_target(facts: ClaimFacts) -> Target:
  match facts:
    case ClaimFacts{target, _, _, _, _}: target

def facts_response(facts: ClaimFacts) -> Response.Response:
  match facts:
    case ClaimFacts{_, _, _, _, response}: response

def target_scope(target: Target) -> Response.Scope:
  match target:
    case Target{p, l, r, _}: Response.Scope{p, l, r}

def facts_scope_same(facts: ClaimFacts) -> Bool:
  match facts:
    case ClaimFacts{target, _, _, _, response}: Response.scope_equal(
      target_scope(target),
      Response.scope(response)
    )

def facts_writer_live(facts: ClaimFacts, +now: Nat) -> Bool:
  match facts:
    case ClaimFacts{_, +started, lifetime, _, _}:
      Nat.is_le(started, now) && Nat.is_lt((now - started : Nat), lifetime)

def facts_live(+facts: ClaimFacts, +canonical: C.State, +now: Nat) -> Bool:
  facts_scope_same(facts) && Response.current(canonical, target_scope(facts_target(facts))) &&
    facts_writer_live(facts, now) && Response.deadline_live(facts_response(facts), now)

def claim_facts(+facts: ClaimFacts, canonical: C.State, now: Nat) -> C.CanonicalEvent:
  match facts:
    case ClaimFacts{Target{p, _, _, token}, _, _, capacity, _}:
      C.CollectionClaimBackground{p, token, facts_live(facts, canonical, now), capacity}

def pending_claim(pending: Pending, canonical: C.State, now: Nat) -> C.CanonicalEvent:
  match pending:
    case Pending{facts, _}: claim_facts(facts, canonical, now)

# The gate above is factual lifetime/clock ownership, not a new capacity rule.
# Canonical still applies exclusive claim/capacity policy and emits the grant.
def issued_capture(facts: ClaimFacts, identity: Response.Identity) -> Capture:
  match facts identity:
    case ClaimFacts{target, started, lifetime, capacity, response} Response.Identity{id, _, _, _}:
      Capture{target, started, lifetime, capacity, id, response}

def response_identity(capture: Capture) -> Response.Identity:
  match capture:
    case Capture{Target{p, l, r, _}, _, _, _, id, _}: Response.Identity{id, p, l, r}

def capture_live(+capture: Capture, +canonical: C.State, now: Nat) -> Bool:
  match capture:
    case Capture{target, started, lifetime, capacity, _, response}:
      owned(canonical, capture) && facts_live(
        ClaimFacts{target, started, lifetime, capacity, response},
        canonical,
        now
      )

# Exact report after the original claim event; forged/different group/token
# feedback must not create this original response capability.
def claim_event_same(event: C.CanonicalEvent, facts: ClaimFacts) -> Bool:
  match event facts:
    case C.CollectionClaimBackground{p, token, True{}, capacity} ClaimFacts{
      Target{owner, _, _, original},
      _,
      _,
      original_capacity,
      _
    }:
      Nat.is_eq(p, owner) && Nat.is_eq(token, original) && Nat.is_eq(capacity, original_capacity)
    case _ _: False{}

def facts_owned(canonical: C.State, facts: ClaimFacts) -> Bool:
  match facts:
    case ClaimFacts{Target{p, _, _, token}, _, _, _, _}:
      Collection.claim_owned(p, token, claims(C.collection_of(canonical)))

def pending_granted(+pending: Pending, event: C.CanonicalEvent, outputs: List<&2, C.Output>,
    +canonical: C.State, now: Nat) -> Bool:
  match pending:
    case Pending{+facts, _}:
      claim_event_same(event, facts) && granted(outputs) && facts_owned(canonical, facts) && facts_live(
        facts,
        canonical,
        now
      )

# Waiting and issued physical output are independent: this action list only
# samples original claim expiry; it never fabricates a review or terminal fact.
def facts_expiry_action(facts: ClaimFacts, now: Nat) -> Driver.Action:
  match facts:
    case ClaimFacts{Target{p, _, _, token}, started, +lifetime, _, _}:
      Driver.Action{
        C.CollectionExpireBackground{p, token, lifetime, lifetime},
        (Nat.add(started, lifetime) - now : Nat),
        None{},
        False{},
        None{}
      }

def expiry_action(capture: Capture, now: Nat) -> Driver.Action:
  match capture:
    case Capture{target, started, lifetime, capacity, _, response}:
      facts_expiry_action(ClaimFacts{target, started, lifetime, capacity, response}, now)

def original_time(facts: ClaimFacts, +now: Nat) -> Bool:
  match facts:
    case ClaimFacts{_, started, _, _, response}:
      Nat.is_eq(started, now) && Response.issuance_time(response, now)


# Declaration is route configuration scoped to the actual original lifetime /
# round. Closing a waiter never resurrects automatic collection for that route.
def declared_scope(valid: Bool, state: State, scope: Response.Scope) -> State:
  match state:
    case State{writers, +managed}:
      State{
        writers,
        Bool.pick(List<&2, Response.Scope>, valid, Response.register(managed, scope), managed)
      }

def declare(+state: State, +facts: ClaimFacts, +canonical: C.State) -> State:
  declared_scope(
    facts_scope_same(facts) && Response.current(canonical, target_scope(facts_target(facts))),
    state,
    target_scope(facts_target(facts))
  )

def is_managed(state: State, partition: Nat) -> Bool:
  match state:
    case State{_, scopes}: Response.controlled(scopes, partition)

def has_response(found: Maybe<&2, Response.Context>) -> Bool:
  match found:
    case Some{_}: True{}
    case None{}: False{}

def retained_capture(valid: Bool, capture: Capture, tail: List<&2, Capture>) -> List<&2, Capture>:
  match valid:
    case True{}: capture <> tail
    case False{}: tail

# Removing metadata is safe only AFTER its original response context is gone.
# Claim disappearance alone does not turn a writer-owned response into Edit.
def retain_members(writers: List<&2, Capture>, +responses: Response.State) -> List<&2, Capture>:
  match writers:
    case Nil{}: []
    case +head <> tail:
      retained_capture(
        has_response(Response.lookup(Response.contexts(responses), response_identity(head))),
        head,
        retain_members(tail, responses)
      )

def retain_current(state: State, canonical: C.State, responses: Response.State) -> State:
  match state:
    case State{writers, managed}: State{
      retain_members(writers, responses),
      Response.retain_scopes(managed, canonical)
    }

type Reconciled is Data:
  Reconciled{state: State, responses: Response.State, actions: List<&2, Driver.Action>}

def removed_response(
  capture: Capture,
  writers: List<&2, Capture>,
  managed: List<&2, Response.Scope>,
  actions: List<&2, Driver.Action>,
  changed: Response.Change
) -> Reconciled:
  match changed:
    case Response.Change{responses, _, _, release}:
      Reconciled{
        State{writers, managed},
        responses,
        List.append(&2, Driver.Action, release, actions)
      }

def reconcile_head(valid: Bool, +capture: Capture, rest: Reconciled) -> Reconciled:
  match valid rest:
    case True{} Reconciled{State{writers, managed}, responses, actions}:
      Reconciled{State{capture <> writers, managed}, responses, actions}
    case False{} Reconciled{State{writers, managed}, responses, actions}:
      removed_response(
        capture,
        writers,
        managed,
        actions,
        Response.close(responses, response_identity(capture))
      )

def reconcile_members(writers: List<&2, Capture>, managed: List<&2, Response.Scope>,
    responses: Response.State, +canonical: C.State, +now: Nat) -> Reconciled:
  match writers:
    case Nil{}: Reconciled{State{[], managed}, responses, []}
    case +head <> tail:
      reconcile_head(
        capture_live(head, canonical, now),
        head,
        reconcile_members(tail, managed, responses, canonical, now)
      )

# Exact release/expiry/departure closes the original capability before retiring
# attribution. Only Response.close's original provisional lease actions leave.
def reconcile(state: State, responses: Response.State, +canonical: C.State, now: Nat) -> Reconciled:
  match state:
    case State{writers, managed}:
      reconcile_members(
        writers,
        Response.retain_scopes(managed, canonical),
        responses,
        canonical,
        now
      )

def identity_writer(writers: List<&2, Capture>, +identity: Response.Identity) -> Maybe<&2, Capture>:
  match writers:
    case Nil{}: None{}
    case +head <> tail:
      choose_capture(
        Response.identity_same(response_identity(head), identity),
        head,
        identity_writer(tail, identity)
      )

def response_writer(state: State, identity: Response.Identity) -> Maybe<&2, Capture>:
  match state:
    case State{writers, _}: identity_writer(writers, identity)

def fence_writer(found: Maybe<&2, Capture>, canonical: C.State, now: Nat) -> Bool:
  match found:
    case None{}: True{}
    case Some{capture}: capture_live(capture, canonical, now)

# Ordinary immutable Edit contexts have no writer binding. A bound writer can
# never bypass claim ownership by invoking the generic #192 control API.
def response_fence(state: State, identity: Response.Identity, canonical: C.State, now: Nat) -> Bool:
  fence_writer(response_writer(state, identity), canonical, now)

def managed_scope(scopes: List<&2, Response.Scope>, +scope: Response.Scope) -> Bool:
  match scopes:
    case Nil{}: False{}
    case head <> tail: Response.scope_equal(head, scope) || managed_scope(tail, scope)

def route_managed(state: State, p: Nat, l: Nat, r: Nat) -> Bool:
  match state:
    case State{_, scopes}: managed_scope(scopes, Response.Scope{p, l, r})

# This explicit original route suppresses ambient collection only. Live #192
# response delivery enters handle_response directly; Stop uses its own path.
def driver_context(state: State, context: Driver.Context) -> Driver.Context:
  match context:
    case Driver.Context{
      +p,
      +l,
      +r,
      bytes,
      job,
      delay,
      outcome,
      current,
      credential,
      generation,
      readable,
      lifetime,
      candidate,
      automatic_collection,
      review,
      output,
      certain,
      output_delay,
      lease,
      +background,
      dispatch
    }:
      Driver.Context{
        p,
        l,
        r,
        bytes,
        job,
        delay,
        outcome,
        current,
        credential,
        generation,
        readable,
        lifetime,
        candidate,
        automatic_collection && Bool.not(route_managed(state, p, l, r)),
        review,
        output,
        certain,
        output_delay,
        lease,
        background,
        dispatch
      }

def managed_handled(managed: Bool, original: Driver.Handled) -> Driver.Handled:
  match managed:
    case True{}: Driver.Handled{True{}, []}
    case False{}: original

def handled(
  state: State,
  command: C.Output,
  context: Driver.Context,
  original: Driver.Handled
) -> Driver.Handled:
  match command context:
    case C.EventEstablished{C.CollectionEligible{}} Driver.Context{
      p,
      l,
      r,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      managed_handled(route_managed(state, p, l, r), original)
    case _ _: original


# A writer's submission uses the existing Background business surface. Its
# advice/token came from the actual original reserve-lease event, not the host.
def background_lease_begin(event: C.CanonicalEvent, identity: Response.Identity) -> Driver.Handled:
  match event identity:
    case C.CollectionReserveLease{+advice, +token} Response.Identity{_, p, _, r}:
      Driver.Handled{
        True{},
        [
          Driver.immediate(
            C.SubmissionBegin{
              advice,
              p,
              r,
              token,
              Handoff.Background{},
              True{},
              [advice],
              [advice]
            },
            False{}
          )
        ]
      }
    case _ _: Driver.Handled{True{}, []}

def background_context(context: Driver.Context) -> Driver.Context:
  match context:
    case Driver.Context{
      p,
      l,
      r,
      bytes,
      job,
      delay,
      outcome,
      current,
      credential,
      generation,
      readable,
      lifetime,
      candidate,
      automatic,
      review,
      output,
      certain,
      output_delay,
      lease,
      _,
      dispatch
    }:
      Driver.Context{
        p,
        l,
        r,
        bytes,
        job,
        delay,
        outcome,
        current,
        credential,
        generation,
        readable,
        lifetime,
        candidate,
        automatic,
        review,
        output,
        certain,
        output_delay,
        lease,
        True{},
        dispatch
      }

def writer_handled(found: Maybe<&2, Capture>, +canonical: C.State, +event: C.CanonicalEvent,
    command: C.Output, context: Driver.Context, +identity: Response.Identity) -> Driver.Handled:
  match found command:
    case Some{_} C.EventEstablished{C.CollectionLeaseReserved{}}: background_lease_begin(
      event,
      identity
    )
    case Some{_} command: Response.handle_response(
      canonical,
      event,
      command,
      background_context(context),
      identity
    )
    case None{} command: Response.handle_response(canonical, event, command, context, identity)

def handle_response(state: State, canonical: C.State, event: C.CanonicalEvent,
    command: C.Output, context: Driver.Context, +identity: Response.Identity) -> Driver.Handled:
  writer_handled(response_writer(state, identity), canonical, event, command, context, identity)

# Physical release/expiry holds its original response identity even after the
# live context ends. A replacement with the same group/token cannot inherit it.
def original_round(found: Maybe<&2, C.Round>, capture: Capture) -> Bool:
  match found capture:
    case None{} _: True{}
    case Some{C.Round{p, l, r, _, _, _, _, _}} Capture{
      Target{owner, life, round, _},
      _,
      _,
      _,
      _,
      _
    }:
      Response.scope_equal(Response.Scope{p, l, r}, Response.Scope{owner, life, round})

def no_replacement(found: Maybe<&2, Capture>, original: Capture) -> Bool:
  match found:
    case None{}: True{}
    case Some{current}: Response.identity_same(
      response_identity(current),
      response_identity(original)
    )

def release_scope(state: State, +canonical: C.State, +capture: Capture) -> Bool:
  match canonical capture:
    case C.State{_, rounds, _, _, _, _, _, _, _} Capture{
      +identity,
      started,
      lifetime,
      capacity,
      id,
      response
    }:
      match identity:
        case Target{+p, +l, +r, +token}:
          +original: Capture = Capture{
            Target{p, l, r, token},
            started,
            lifetime,
            capacity,
            id,
            response
          }
          original_round(C.find_round(p, rounds), original) &&
            no_replacement(lookup(state, Target{p, l, r, token}), original) && owned(
              canonical,
              original
            )

def release_fact_same(event: C.CanonicalEvent, capture: Capture, +now: Nat) -> Bool:
  match event capture:
    case C.CollectionReleaseBackground{p, token} Capture{
      Target{owner, _, _, original},
      _,
      _,
      _,
      _,
      _
    }:
      Nat.is_eq(p, owner) && Nat.is_eq(token, original)
    case C.CollectionExpireBackground{p, token, elapsed, lifetime} Capture{
      Target{owner, _, _, original},
      +started,
      duration,
      _,
      _,
      _
    }:
      Nat.is_eq(p, owner) && Nat.is_eq(token, original) && Nat.is_eq(lifetime, duration) &&
        Nat.is_le(started, now) && Nat.is_le(elapsed, (now - started : Nat))
    case _ _: False{}

def release_allowed(valid: Bool, event: C.CanonicalEvent) -> Maybe<&2, C.CanonicalEvent>:
  match valid:
    case True{}: Some{event}
    case False{}: None{}

def release_delivery(
  state: State,
  +canonical: C.State,
  +capture: Capture,
  +event: C.CanonicalEvent,
  now: Nat
) -> Maybe<&2, C.CanonicalEvent>:
  release_allowed(
    release_scope(state, canonical, capture) && release_fact_same(event, capture, now),
    event
  )

# Departure is based on the actual successful original retirement transition,
# never a UI disconnect guess or the latest scope. The host retains each fact
# only while its original physical release is queued.
type PhysicalRelease is Data:
  PhysicalRelease{capture: Capture, event: C.CanonicalEvent}

def retired_capture(
  valid: Bool,
  capture: Capture,
  tail: List<&2, PhysicalRelease>
) -> List<&2, PhysicalRelease>:
  match valid capture:
    case True{} Capture{+identity, started, lifetime, capacity, id, response}:
      match identity:
        case Target{+p, +l, +r, +token}:
          PhysicalRelease{
            Capture{Target{p, l, r, token}, started, lifetime, capacity, id, response},
            C.CollectionReleaseBackground{p, token}
          } <> tail
    case False{} _: tail

def retired_members(writers: List<&2, Capture>, +before: C.State, +after: C.State,
    +event: C.CanonicalEvent) -> List<&2, PhysicalRelease>:
  match writers event:
    case Nil{} _: []
    case +head <> tail C.RetirePartition{+p, +l, +r}:
      retired_capture(
        Response.scope_equal(
          target_scope(target(head)),
          Response.Scope{p, l, r}
        ) && Response.current(
          before,
          Response.Scope{p, l, r}
        ) && Bool.not(Response.current(after, Response.Scope{p, l, r})),
        head,
        retired_members(tail, before, after, C.RetirePartition{p, l, r})
      )
    case _ _: []

def retired(
  state: State,
  before: C.State,
  after: C.State,
  event: C.CanonicalEvent
) -> List<&2, PhysicalRelease>:
  match state:
    case State{writers, _}: retired_members(writers, before, after, event)

# Close the original before-context to recover precisely its provisional lease
# releases when canonical retirement has already removed that context in retain.
def closed_actions(changed: Response.Change) -> List<&2, Driver.Action>:
  match changed:
    case Response.Change{_, _, _, actions}: actions

def departure_actions(
  facts: List<&2, PhysicalRelease>,
  +responses: Response.State
) -> List<&2, Driver.Action>:
  match facts:
    case Nil{}: []
    case PhysicalRelease{capture, _} <> tail:
      List.append(
        &2,
        Driver.Action,
        closed_actions(Response.close(responses, response_identity(capture))),
        departure_actions(tail, responses)
      )

def facts_round(found: Maybe<&2, C.Round>, facts: ClaimFacts) -> Bool:
  match found:
    case None{}: True{}
    case Some{C.Round{p, l, r, _, _, _, _, _}}:
      Response.scope_equal(Response.Scope{p, l, r}, target_scope(facts_target(facts)))

def unissued_scope_target(+canonical: C.State, +facts: ClaimFacts, identity: Target) -> Bool:
  match canonical identity:
    case C.State{_, rounds, _, _, _, _, _, _, _} Target{p, _, _, _}:
      facts_round(C.find_round(p, rounds), facts) && facts_owned(canonical, facts)

def unissued_scope(+canonical: C.State, +facts: ClaimFacts) -> Bool:
  unissued_scope_target(canonical, facts, facts_target(facts))

# A granted claim whose response storage refused issuance has no invented
# response identity. It releases its own original membership instead of holding
# a waiter that can never receive an advice capability.
def facts_release(facts: ClaimFacts) -> C.CanonicalEvent:
  match facts:
    case ClaimFacts{Target{p, _, _, token}, _, _, _, _}: C.CollectionReleaseBackground{p, token}

def unissued_found(
  found: Maybe<&2, Capture>,
  +canonical: C.State,
  +facts: ClaimFacts
) -> Maybe<&2, C.CanonicalEvent>:
  match found:
    case Some{_}: None{}
    case None{}: release_allowed(unissued_scope(canonical, facts), facts_release(facts))

def unissued_release(
  state: State,
  canonical: C.State,
  pending: Pending,
  now: Nat
) -> Maybe<&2, C.CanonicalEvent>:
  match pending:
    case Pending{+facts, _}: unissued_found(lookup(state, facts_target(facts)), canonical, facts)
