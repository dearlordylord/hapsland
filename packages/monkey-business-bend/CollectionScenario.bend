import Base
import ../agent-flow-bend/Handoff.bend as Handoff
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/CollectionState.bend as CollectionState
import ./Driver.bend as Driver
import ./CredentialFacts.bend as CredentialFacts
import ./Advicees.bend as Advicees
import ../agent-flow-bend/Collection.bend as Collection

# Synthetic response facts; Canonical remains the only eligibility authority.
# Scope is captured at issuance and must never be reconstructed from a new round.
type Response is Data:
  Response{partition: Nat, lifetime: Nat, round: Nat, started: Nat,
    deadline: Nat, admitted_block: Bool}

type FindingFacts is Data:
  FindingFacts{unit: Nat, partition: Nat, round: Nat, snapshot: Nat,
    current_snapshot: Nat, credential: Nat, current_credential: Nat,
    age_ms: Nat, solo_bytes: Nat, ready: Bool, selected_count: Nat,
    prospective_bytes: Nat}

def gate(response: Response, now: Nat, credential_valid: Bool) -> Canonical.CanonicalEvent:
  match response:
    case Response{_, _, _, _, deadline, _}:
      Canonical.CollectorGateCheck{Nat.is_ge(now, deadline), credential_valid}

def final_authority(response: Response, current_block: Bool) -> Canonical.CanonicalEvent:
  match response:
    case Response{_, _, _, _, _, admitted_block}:
      Canonical.CollectorFinalAuthorityCheck{admitted_block, current_block}

def finding(response: Response, facts: FindingFacts) -> Canonical.CanonicalEvent:
  match response facts:
    case Response{p, _, r, _, _, _} FindingFacts{unit, owner, round, snapshot,
        current_snapshot, credential, current_credential, age, bytes, ready, count, prospective}:
      Canonical.CollectionFindingCheck{p, r, unit, owner, round, snapshot,
        current_snapshot, credential, current_credential, age, bytes, ready, count, prospective}

def order(left_sequence: Nat, right_sequence: Nat) -> Canonical.CanonicalEvent:
  Canonical.CollectionOrderCheck{left_sequence, right_sequence}

def candidate(same_partition: Bool, unleased: Bool, has_unsuppressed: Bool,
    authority_owns: Bool) -> Canonical.CanonicalEvent:
  Canonical.CollectionCandidateCheck{same_partition, unleased, has_unsuppressed, authority_owns}

# Live original response contexts overlap. Identity is minted once by this
# namespace; ended contexts are discarded, not archived or replaced by advicee.
type Identity is Data:
  Identity{id: Nat, partition: Nat, lifetime: Nat, round: Nat}

type Phase is Data:
  Idle{}
  Gating{current_block: Bool}
  Selecting{}

type Selection is Data:
  Selection{advice: Nat, token: Nat}

type Context is Data:
  Context{identity: Identity, response: Response, credential: Nat,
    phase: Phase, selections: List<&2, Selection>}

type Scope is Data:
  Scope{partition: Nat, lifetime: Nat, round: Nat}

type State is Data:
  State{next_identity: Nat, contexts: List<&2, Context>, controlled: List<&2, Scope>}

type Applicability is Data:
  Applied{}
  Missing{}
  WrongScope{}
  AlreadyAttempting{}
  IdentityExhausted{}
  ContextBound{}

type Change is Data:
  Change{
    state: State,
    result: Applicability,
    issued: Maybe<&2, Identity>,
    actions: List<&2, Driver.Action>
  }

def initial() -> State:
  State{1n, [], []}

def identity_same(a: Identity, b: Identity) -> Bool:
  match a b:
    case Identity{id, p, l, r} Identity{other, owner, life, round}:
      Nat.is_eq(id, other) && Nat.is_eq(p, owner) && Nat.is_eq(l, life) && Nat.is_eq(r, round)

def scope_current(found: Maybe<&2, Canonical.Round>, scope: Scope) -> Bool:
  match found scope:
    case Some{Canonical.Round{owner, life, round, _, _, _, _, _}} Scope{p, l, r}:
      Nat.is_eq(owner, p) && Nat.is_eq(life, l) && Nat.is_eq(round, r)
    case None{} _: False{}

def current(canonical: Canonical.State, +scope: Scope) -> Bool:
  match canonical scope:
    case Canonical.State{_, rounds, _, _, _, _, _, _, _} Scope{+p, _, _}:
      scope_current(Canonical.find_round(p, rounds), scope)

def scope(response: Response) -> Scope:
  match response:
    case Response{p, l, r, _, _, _}: Scope{p, l, r}

def context_identity(context: Context) -> Identity:
  match context:
    case Context{identity, _, _, _, _}: identity

def context_response(context: Context) -> Response:
  match context:
    case Context{_, response, _, _, _}: response

def lookup_hit(found: Bool, context: Context, rest: Maybe<&2, Context>) -> Maybe<&2, Context>:
  match found:
    case True{}: Some{context}
    case False{}: rest

def lookup(contexts: List<&2, Context>, +target: Identity) -> Maybe<&2, Context>:
  match contexts:
    case Nil{}: None{}
    case +head <> tail: lookup_hit(
      identity_same(context_identity(head), target),
      head,
      lookup(tail, target)
    )

def scope_equal(a: Scope, b: Scope) -> Bool:
  match a b:
    case Scope{p, l, r} Scope{other, life, round}: Nat.is_eq(p, other) && Nat.is_eq(l, life) && Nat.is_eq(
      r,
      round
    )

def scope_known(scopes: List<&2, Scope>, +target: Scope) -> Bool:
  match scopes:
    case Nil{}: False{}
    case head <> tail: scope_equal(head, target) || scope_known(tail, target)

def registered(found: Bool, scopes: List<&2, Scope>, target: Scope) -> List<&2, Scope>:
  match found:
    case True{}: scopes
    case False{}: target <> scopes

def register(+scopes: List<&2, Scope>, +target: Scope) -> List<&2, Scope>:
  registered(scope_known(scopes, target), scopes, target)

def minted(state: State, response: Response, credential: Nat, valid: Bool) -> Change:
  match state response valid:
    case State{+next, contexts, controlled} Response{+p, +l, +r, +started, +deadline, +admitted} True{}:
      +identity: Identity = Identity{next, p, l, r}
      Change{
        State{
          Nat.add(next, 1n),
          Context{
            identity,
            Response{p, l, r, started, deadline, admitted},
            credential,
            Idle{},
            []
          } <> contexts,
          register(controlled, Scope{p, l, r})
        },
        Applied{},
        Some{identity},
        []
      }
    case _ _ False{}: Change{state, WrongScope{}, None{}, []}

def issuance_time(response: Response, +now: Nat) -> Bool:
  match response:
    case Response{_, _, _, started, deadline, _}: Nat.is_eq(started, now) && Nat.is_lt(
      now,
      deadline
    )

def issued_with_room(
  room: Bool,
  +state: State,
  +response: Response,
  credential: Nat,
  canonical: Canonical.State
) -> Change:
  match room:
    case True{}: minted(state, response, credential, current(canonical, scope(response)))
    case False{}: Change{state, IdentityExhausted{}, None{}, []}

# The shared logical-list ABI already bounds vectors at 2048. This is the
# physical representation bound, not a collector concurrency/eligibility limit.
def context_room(contexts: List<&2, Context>) -> Bool:
  Nat.is_lt(List.length(&2, Context, contexts), 2048n)

def issued_with_context_room(
  room: Bool,
  state: State,
  response: Response,
  credential: Nat,
  canonical: Canonical.State
) -> Change:
  match room state:
    case True{} State{+next, contexts, controlled}:
      issued_with_room(
        Nat.is_lt(next, Advicees.maximum()),
        State{next, contexts, controlled},
        response,
        credential,
        canonical
      )
    case False{} _: Change{state, ContextBound{}, None{}, []}

def issue(+state: State, response: Response, credential: Nat, canonical: Canonical.State) -> Change:
  match state:
    case State{next, +contexts, controlled}: issued_with_context_room(
      context_room(contexts),
      State{next, contexts, controlled},
      response,
      credential,
      canonical
    )

def replace_hit(
  found: Bool,
  original: Context,
  next: Context,
  rest: List<&2, Context>
) -> List<&2, Context>:
  match found:
    case True{}: next <> rest
    case False{}: original <> rest

def replace(contexts: List<&2, Context>, +target: Identity, +next: Context) -> List<&2, Context>:
  match contexts:
    case Nil{}: []
    case +head <> tail: replace_hit(
      identity_same(context_identity(head), target),
      head,
      next,
      replace(tail, target, next)
    )

def updated(state: State, +context: Context) -> State:
  match state:
    case State{next, contexts, controlled}: State{
      next,
      replace(contexts, context_identity(context), context),
      controlled
    }

def release_provisional(selections: List<&2, Selection>) -> List<&2, Driver.Action>:
  match selections:
    case Nil{}: []
    case Selection{advice, token} <> tail:
      Driver.immediate(Canonical.CollectionReleaseLease{advice, token}, False{}) <> release_provisional(
        tail
      )

def remove_hit(remove: Bool, original: Context, tail: List<&2, Context>) -> List<&2, Context>:
  match remove:
    case True{}: tail
    case False{}: original <> tail

def remove(contexts: List<&2, Context>, +target: Identity) -> List<&2, Context>:
  match contexts:
    case Nil{}: []
    case +head <> tail: remove_hit(
      identity_same(context_identity(head), target),
      head,
      remove(tail, target)
    )

def closed(found: Maybe<&2, Context>, state: State, target: Identity) -> Change:
  match found state:
    case Some{Context{_, _, _, _, selections}} State{next, contexts, controlled}:
      Change{
        State{next, remove(contexts, target), controlled},
        Applied{},
        None{},
        release_provisional(selections)
      }
    case None{} _: Change{state, Missing{}, None{}, []}

def close(+state: State, +target: Identity) -> Change:
  match state:
    case State{next, +contexts, controlled}: closed(
      lookup(contexts, target),
      State{next, contexts, controlled},
      target
    )

def attempted_phase(
  context: Context,
  state: State,
  now: Nat,
  current_block: Bool,
  credential: Bool
) -> Change:
  match context:
    case Context{identity, +response, generation, Idle{}, selections}:
      Change{
        updated(state, Context{identity, response, generation, Gating{current_block}, selections}),
        Applied{},
        None{},
        [Driver.immediate(gate(response, now, credential), False{})]
      }
    case _: Change{state, AlreadyAttempting{}, None{}, []}

def attempted_valid(
  valid: Bool,
  context: Context,
  state: State,
  now: Nat,
  current_block: Bool,
  credential: Bool
) -> Change:
  match valid:
    case True{}: attempted_phase(context, state, now, current_block, credential)
    case False{}: Change{state, WrongScope{}, None{}, []}

def attempted(
  found: Maybe<&2, Context>,
  +state: State,
  canonical: Canonical.State,
  now: Nat,
  current_block: Bool,
  credentials: CredentialFacts.State
) -> Change:
  match found:
    case Some{Context{identity, +response, +generation, phase, selections}}:
      attempted_valid(
        current(canonical, scope(response)),
        Context{identity, response, generation, phase, selections},
        state,
        now,
        current_block,
        CredentialFacts.authorized(credentials, generation)
      )
    case None{}: Change{state, Missing{}, None{}, []}

def attempt(
  +state: State,
  +target: Identity,
  canonical: Canonical.State,
  now: Nat,
  current_block: Bool,
  credentials: CredentialFacts.State
) -> Change:
  match state:
    case State{next, +contexts, controlled}: attempted(
      lookup(contexts, target),
      State{next, contexts, controlled},
      canonical,
      now,
      current_block,
      credentials
    )

def contexts(state: State) -> List<&2, Context>:
  match state:
    case State{_, contexts, _}: contexts

def retained_scope(valid: Bool, head: Scope, tail: List<&2, Scope>) -> List<&2, Scope>:
  match valid:
    case True{}: head <> tail
    case False{}: tail

def retain_scopes(scopes: List<&2, Scope>, +canonical: Canonical.State) -> List<&2, Scope>:
  match scopes:
    case Nil{}: []
    case +head <> tail: retained_scope(
      current(canonical, head),
      head,
      retain_scopes(tail, canonical)
    )

def lease_owned(canonical: Canonical.State, selection: Selection) -> Bool:
  match canonical selection:
    case Canonical.State{_, _, _, _, _, _, _, collection, _} Selection{advice, token}: CollectionState.owns_lease(
      collection,
      advice,
      token
    )

def retain_selection(
  owned: Bool,
  selection: Selection,
  tail: List<&2, Selection>
) -> List<&2, Selection>:
  match owned:
    case True{}: selection <> tail
    case False{}: tail

def retain_selections(
  selections: List<&2, Selection>,
  +canonical: Canonical.State
) -> List<&2, Selection>:
  match selections:
    case Nil{}: []
    case +head <> tail: retain_selection(
      lease_owned(canonical, head),
      head,
      retain_selections(tail, canonical)
    )

def retain_context_selections(context: Context, canonical: Canonical.State) -> Context:
  match context:
    case Context{identity, response, credential, phase, selections}: Context{
      identity,
      response,
      credential,
      phase,
      retain_selections(selections, canonical)
    }

def retained_context(
  valid: Bool,
  head: Context,
  canonical: Canonical.State,
  tail: List<&2, Context>
) -> List<&2, Context>:
  match valid:
    case True{}:
      retain_context_selections(head, canonical) <> tail
    case False{}: tail

def retain_contexts(contexts: List<&2, Context>, +canonical: Canonical.State) -> List<&2, Context>:
  match contexts:
    case Nil{}: []
    case +head <> tail: retained_context(
      current(canonical, scope(context_response(head))),
      head,
      canonical,
      retain_contexts(tail, canonical)
    )

def retain(state: State, +canonical: Canonical.State) -> State:
  match state:
    case State{next, contexts, controlled}: State{
      next,
      retain_contexts(contexts, canonical),
      retain_scopes(controlled, canonical)
    }

def controlled(scopes: List<&2, Scope>, +partition: Nat) -> Bool:
  match scopes:
    case Nil{}: False{}
    case Scope{owner, _, _} <> tail: Nat.is_eq(owner, partition) || controlled(tail, partition)

def automatic(state: State, partition: Nat) -> Bool:
  match state:
    case State{_, _, scopes}: Bool.not(controlled(scopes, partition))

def deadline_live(response: Response, +now: Nat) -> Bool:
  match response:
    case Response{_, _, _, started, deadline, _}: Nat.is_le(started, now) && Nat.is_lt(
      now,
      deadline
    )

def valid_context(
  found: Maybe<&2, Context>,
  canonical: Canonical.State,
  now: Nat,
  credentials: CredentialFacts.State
) -> Bool:
  match found:
    case Some{Context{_, +response, generation, _, _}}:
      current(canonical, scope(response)) && deadline_live(response, now) && CredentialFacts.authorized(
        credentials,
        generation
      )
    case None{}: False{}

def valid(
  +state: State,
  target: Identity,
  canonical: Canonical.State,
  now: Nat,
  credentials: CredentialFacts.State
) -> Bool:
  valid_context(lookup(contexts(state), target), canonical, now, credentials)

def proceed(outputs: List<&2, Canonical.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case Canonical.PolicyDecided{Canonical.CollectorProceed{}} <> _: True{}
    case _ <> tail: proceed(tail)

def final_proceed(outputs: List<&2, Canonical.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case Canonical.PolicyDecided{Canonical.CollectorFinalProceed{}} <> _: True{}
    case _ <> tail: final_proceed(tail)

def reset(context: Context) -> Context:
  match context:
    case Context{identity, response, credential, _, selections}: Context{
      identity,
      response,
      credential,
      Idle{},
      selections
    }

def gated(allowed: Bool, context: Context, state: State, current_block: Bool) -> Change:
  match allowed context:
    case True{} Context{identity, +response, credential, _, selections}:
      Change{
        updated(state, Context{identity, response, credential, Selecting{}, selections}),
        Applied{},
        None{},
        [Driver.immediate(final_authority(response, current_block), False{})]
      }
    case False{} _: Change{updated(state, reset(context)), Applied{}, None{}, []}

def work_operation(work: Canonical.Work) -> Nat:
  match work:
    case Canonical.Work{_, _, _, operation, _, _, _}: operation

def sorted_pick(
  before: Collection.Order,
  head: Canonical.Work,
  next: Canonical.Work,
  tail: List<&2, Canonical.Work>,
  rest: List<&2, Canonical.Work>
) -> List<&2, Canonical.Work>:
  match before:
    case Collection.After{}: head <> rest
    case _: next <> head <> tail

def insert_work(items: List<&2, Canonical.Work>, +next: Canonical.Work) -> List<&2, Canonical.Work>:
  match items:
    case Nil{}: [next]
    case +head <> +tail: sorted_pick(
      Collection.order(work_operation(next), work_operation(head)),
      head,
      next,
      tail,
      insert_work(tail, next)
    )

def sorted_work(items: List<&2, Canonical.Work>) -> List<&2, Canonical.Work>:
  match items:
    case Nil{}: []
    case head <> tail: insert_work(sorted_work(tail), head)

def candidate_owned(
  owned: Bool,
  p: Nat,
  l: Nat,
  r: Nat,
  operation: Nat,
  parent: Nat,
  rest: List<&2, Driver.Action>
) -> List<&2, Driver.Action>:
  match owned:
    case True{}: Driver.immediate(
      Canonical.CollectionReady{operation, p, l, r, parent, False{}},
      False{}
    ) <> rest
    case False{}: rest

def candidate_work(items: List<&2, Canonical.Work>, +response: Response) -> List<&2, Driver.Action>:
  match items response:
    case Nil{} _: []
    case Canonical.Work{+p, +l, +r, +operation, _, Canonical.PendingFinding{_}, +parent} <> tail Response{
      owner,
      life,
      round,
      started,
      deadline,
      admitted
    }:
      candidate_owned(
        Nat.is_eq(p, owner) && Nat.is_eq(l, life) && Nat.is_eq(r, round),
        p,
        l,
        r,
        operation,
        parent,
        candidate_work(tail, Response{owner, life, round, started, deadline, admitted})
      )
    case _ <> tail _: candidate_work(tail, response)

def final_selected(
  allowed: Bool,
  +context: Context,
  state: State,
  canonical: Canonical.State
) -> Change:
  match allowed:
    case True{}: Change{
      updated(state, reset(context)),
      Applied{},
      None{},
      candidate_work(sorted_work(Driver.work_list(canonical)), context_response(context))
    }
    case False{}: Change{updated(state, reset(context)), Applied{}, None{}, []}

def lease_reserved(outputs: List<&2, Canonical.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case Canonical.EventEstablished{Canonical.CollectionLeaseReserved{}} <> _: True{}
    case _ <> tail: lease_reserved(tail)

def submission_begun(outputs: List<&2, Canonical.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case Canonical.EventEstablished{Canonical.SubmissionBegun{}} <> _: True{}
    case Canonical.EventEstablished{Canonical.SubmissionAuthorized{}} <> _: True{}
    case _ <> tail: submission_begun(tail)

def selection_removed(
  remove: Bool,
  selection: Selection,
  tail: List<&2, Selection>
) -> List<&2, Selection>:
  match remove:
    case True{}: tail
    case False{}: selection <> tail

def selection_mark(items: List<&2, Selection>, +advice: Nat, +token: Nat) -> List<&2, Selection>:
  match items:
    case Nil{}: []
    case Selection{+candidate, +owner} <> tail:
      selection_removed(
        Nat.is_eq(advice, candidate) && Nat.is_eq(token, owner),
        Selection{candidate, owner},
        selection_mark(tail, advice, token)
      )

def selected_lease(
  accepted: Bool,
  context: Context,
  state: State,
  advice: Nat,
  token: Nat
) -> Change:
  match accepted context:
    case True{} Context{identity, response, credential, phase, selections}:
      Change{
        updated(
          state,
          Context{identity, response, credential, phase, Selection{advice, token} <> selections}
        ),
        Applied{},
        None{},
        []
      }
    case False{} _: Change{state, Applied{}, None{}, []}

def selected_authorized(
  accepted: Bool,
  context: Context,
  state: State,
  advice: Nat,
  token: Nat
) -> Change:
  match accepted context:
    case True{} Context{identity, response, credential, phase, selections}:
      Change{
        updated(
          state,
          Context{identity, response, credential, phase, selection_mark(selections, advice, token)}
        ),
        Applied{},
        None{},
        []
      }
    case False{} _: Change{state, Applied{}, None{}, []}

def after_context(
  context: Context,
  state: State,
  event: Canonical.CanonicalEvent,
  outputs: List<&2, Canonical.Output>,
  canonical: Canonical.State
) -> Change:
  match context event:
    case Context{identity, response, credential, Gating{+current_block}, selections} Canonical.CollectorGateCheck{
      _,
      _
    }:
      gated(
        proceed(outputs),
        Context{identity, response, credential, Gating{current_block}, selections},
        state,
        current_block
      )
    case Context{identity, response, credential, Selecting{}, selections} Canonical.CollectorFinalAuthorityCheck{
      _,
      _
    }:
      final_selected(
        final_proceed(outputs),
        Context{identity, response, credential, Selecting{}, selections},
        state,
        canonical
      )
    case context Canonical.CollectionReserveLease{advice, token}:
      selected_lease(lease_reserved(outputs), context, state, advice, token)
    case context Canonical.SubmissionBegin{advice, _, _, token, _, _, _, _}:
      selected_authorized(submission_begun(outputs), context, state, advice, token)
    case context Canonical.SubmissionTerminal{_, _, _}:
      Change{updated(state, reset(context)), Applied{}, None{}, []}
    case _ _: Change{state, Applied{}, None{}, []}

def after_found(
  found: Maybe<&2, Context>,
  state: State,
  event: Canonical.CanonicalEvent,
  outputs: List<&2, Canonical.Output>,
  canonical: Canonical.State
) -> Change:
  match found:
    case Some{context}: after_context(context, state, event, outputs, canonical)
    case None{}: Change{state, Missing{}, None{}, []}

def after(
  +state: State,
  target: Identity,
  event: Canonical.CanonicalEvent,
  outputs: List<&2, Canonical.Output>,
  canonical: Canonical.State
) -> Change:
  after_found(lookup(contexts(state), target), state, event, outputs, canonical)

# Only the explicitly response-backed Edit route changes automatic collection.
# Background and Stop retain their existing independent authority paths.
def driver_context(state: State, context: Driver.Context, response_owned: Bool) -> Driver.Context:
  match context:
    case Driver.Context{
      +p,
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
        response_owned || (automatic_collection && (background || automatic(state, p))),
        review,
        output,
        certain,
        output_delay,
        lease,
        background,
        dispatch
      }

# A managed Edit command is handled even when it schedules no automatic action.
# This prevents the ordinary host fallback from issuing a second collection path.
def managed_handled(automatic: Bool, original: Driver.Handled) -> Driver.Handled:
  match automatic:
    case True{}: original
    case False{}: Driver.Handled{True{}, []}

def handled(
  state: State,
  command: Canonical.Output,
  context: Driver.Context,
  original: Driver.Handled
) -> Driver.Handled:
  match command context:
    case Canonical.EventEstablished{Canonical.CollectionEligible{}} Driver.Context{
      p,
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
      _,
      False{},
      _
    }:
      managed_handled(automatic(state, p), original)
    case _ _: original

def context_deadline(context: Context) -> Nat:
  match context:
    case Context{_, Response{_, _, _, _, deadline, _}, _, _, _}: deadline

def expired_context(
  expired: Bool,
  context: Context,
  contexts: List<&2, Context>,
  releases: List<&2, Driver.Action>
) -> List<&2, Context> & List<&2, Driver.Action>:
  match expired context:
    case True{} Context{_, _, _, _, selections}: (
      contexts,
      List.append(&2, Driver.Action, release_provisional(selections), releases)
    )
    case False{} _: (context <> contexts, releases)

def expired_tail(
  +context: Context,
  now: Nat,
  rest: List<&2, Context> & List<&2, Driver.Action>
) -> List<&2, Context> & List<&2, Driver.Action>:
  match rest:
    case (contexts, releases): expired_context(
      Nat.is_ge(now, context_deadline(context)),
      context,
      contexts,
      releases
    )

def expire_contexts(
  contexts: List<&2, Context>,
  +now: Nat
) -> List<&2, Context> & List<&2, Driver.Action>:
  match contexts:
    case Nil{}: ([], [])
    case +head <> tail: expired_tail(head, now, expire_contexts(tail, now))

def expired_changed(
  next: Nat,
  controlled: List<&2, Scope>,
  expired: List<&2, Context> & List<&2, Driver.Action>
) -> Change:
  match expired:
    case (contexts, releases): Change{
      State{next, contexts, controlled},
      Applied{},
      None{},
      releases
    }

def expire(state: State, now: Nat) -> Change:
  match state:
    case State{next, contexts, controlled}: expired_changed(
      next,
      controlled,
      expire_contexts(contexts, now)
    )

# Candidate, not an accepted product law: every immutable response capture and
# every now/credential fact produce the exact production gate event. This pins
# expiry equality; it does not prove response ownership or compiler correctness.
law exact_response_gate:
  for p: Nat
  for l: Nat
  for r: Nat
  for started: Nat
  for +deadline: Nat
  for admitted: Bool
  for +now: Nat
  for +credential: Bool
  {
    gate(Response{p, l, r, started, deadline, admitted}, now, credential)
    == Canonical.CollectorGateCheck{Nat.is_ge(now, deadline), credential}
    : Canonical.CanonicalEvent
  }

# Response-backed output reserves only after actual suppression permission, and
# begins only after its exact lease was granted. The ordinary driver's combined
# reserve/begin batch cannot grant overlapping contexts ownership of one item.
def reserve_candidate(candidate: Maybe<&2, Driver.Candidate>, token: Nat) -> Driver.Handled:
  match candidate:
    case Some{Driver.Candidate{_, advice, _, _, _, _}}:
      Driver.Handled{
        True{},
        [Driver.immediate(Canonical.CollectionReserveLease{advice, token}, False{})]
      }
    case None{}: Driver.Handled{True{}, []}

def candidate_token(
  candidate: Maybe<&2, Driver.Candidate>,
  token: Nat
) -> Maybe<&2, Driver.Candidate>:
  match candidate:
    case Some{Driver.Candidate{p, advice, r, _, surface, selected}}:
      Some{Driver.Candidate{p, advice, r, token, surface, selected}}
    case None{}: None{}

def response_actions(actions: List<&2, Driver.Action>, +token: Nat) -> List<&2, Driver.Action>:
  match actions:
    case Nil{}: []
    case Driver.Action{event, delay, candidate, job, expiry} <> tail:
      Driver.Action{event, delay, candidate_token(candidate, token), job, expiry} <> response_actions(
        tail,
        token
      )

def response_handled(handled: Driver.Handled, token: Nat) -> Driver.Handled:
  match handled:
    case Driver.Handled{handled, actions}: Driver.Handled{handled, response_actions(actions, token)}

def lease_begin(event: Canonical.CanonicalEvent, target: Identity) -> Driver.Handled:
  match event target:
    case Canonical.CollectionReserveLease{+advice, +token} Identity{_, p, _, r}:
      Driver.Handled{
        True{},
        [
          Driver.immediate(
            Canonical.SubmissionBegin{
              advice,
              p,
              r,
              token,
              Handoff.Edit{},
              True{},
              [advice],
              [advice]
            },
            False{}
          )
        ]
      }
    case _ _: Driver.Handled{True{}, []}

def handle_response(
  +state: Canonical.State,
  +event: Canonical.CanonicalEvent,
  +command: Canonical.Output,
  +context: Driver.Context,
  +target: Identity
) -> Driver.Handled:
  match command context target:
    case Canonical.PolicyDecided{Canonical.SubmissionUnsuppressed{}} Driver.Context{
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
      candidate,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _
    } Identity{id, _, _, _}:
      reserve_candidate(candidate, id)
    case Canonical.EventEstablished{Canonical.CollectionLeaseReserved{}} _ _:
      lease_begin(event, target)
    case _ _ Identity{id, _, _, _}:
      response_handled(Driver.handle(state, event, command, context), id)


def delivery_context(found: Maybe<&2, Context>, canonical: Canonical.State) -> Bool:
  match found:
    case Some{context}: current(canonical, scope(context_response(context)))
    case None{}: False{}

def delivery_valid(
  +state: State,
  +target: Identity,
  +canonical: Canonical.State,
  now: Nat,
  credentials: CredentialFacts.State,
  event: Canonical.CanonicalEvent
) -> Bool:
  match event:
    case Canonical.CollectorGateCheck{_, _}: delivery_context(
      lookup(contexts(state), target),
      canonical
    )
    case _: valid(state, target, canonical, now, credentials)

def automatic_candidate(
  state: State,
  candidate: Maybe<&2, Driver.Candidate>,
  background: Bool
) -> Bool:
  match candidate:
    case None{}: True{}
    case Some{Driver.Candidate{p, _, _, _, _, _}}: background || automatic(state, p)

def retain_action(
  allowed: Bool,
  action: Driver.Action,
  tail: List<&2, Driver.Action>
) -> List<&2, Driver.Action>:
  match allowed:
    case True{}: action <> tail
    case False{}: tail

def automatic_actions(
  actions: List<&2, Driver.Action>,
  +state: State,
  +background: Bool
) -> List<&2, Driver.Action>:
  match actions:
    case Nil{}: []
    case Driver.Action{event, delay, +candidate, job, expiry} <> tail:
      retain_action(
        automatic_candidate(state, candidate, background),
        Driver.Action{event, delay, candidate, job, expiry},
        automatic_actions(tail, state, background)
      )

def revalidated(
  actions: List<&2, Driver.Action>,
  state: State,
  context: Driver.Context
) -> List<&2, Driver.Action>:
  match context:
    case Driver.Context{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, background, _}: automatic_actions(
      actions,
      state,
      background
    )


def exact_response_gate(p, l, r, started, deadline, admitted, now, credential):
  {==}

# Candidate proposal: representation refusal is atomic for every possible live
# context vector. It creates no capability and does not advance its namespace.
law context_bound_refuses_atomically:
  for +next: Nat
  for +contexts: List<&2, Context>
  for +controlled: List<&2, Scope>
  for response: Response
  for credential: Nat
  for canonical: Canonical.State
  {
    issued_with_context_room(
      False{},
      State{next, contexts, controlled},
      response,
      credential,
      canonical
    )
    == Change{State{next, contexts, controlled}, ContextBound{}, None{}, []}
    : Change
  }

def context_bound_refuses_atomically(next, contexts, controlled, response, credential, canonical):
  {==}
