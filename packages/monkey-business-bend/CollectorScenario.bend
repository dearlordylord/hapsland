import Base
import ./Driver.bend as Driver
import ../agent-flow-bend/Canonical.bend as C
import ../agent-flow-bend/CollectionState.bend as Collection
import ../agent-flow-bend/Handoff.bend as Handoff

# Optional original background collector configuration. Canonical remains the
# authority for claim capacity, leases, candidate acceptance and expiry.
type Profile is Data:
  Profile{capacity: Nat, lifetime: Nat}
type Candidate is Data:
  Candidate{partition: Nat, lifetime: Nat, round: Nat, advice: Nat, token: Nat}
type State is Data:
  State{profile: Maybe<&2, Profile>, candidates: List<&2, Candidate>}
type Changed is Data:
  Changed{state: State, handled: Driver.Handled}

def initial() -> State:
  State{None{}, []}

def capacity(profile: Profile) -> Nat:
  match profile:
    case Profile{value, _}: value

def profile_valid(profile: Maybe<&2, Profile>) -> Bool:
  match profile:
    case None{}: True{}
    case Some{Profile{+capacity, +lifetime}}:
      Nat.is_gt(capacity, 0n) && Nat.is_le(capacity, Nat.add(Nat.mul(65536n, 4294967295n), 65535n)) &&
        Nat.is_gt(lifetime, 0n) && Nat.is_le(
          lifetime,
          Nat.add(Nat.mul(65536n, 4294967295n), 65535n)
        )

def configured(state: State) -> Bool:
  match state:
    case State{Some{_}, _}: True{}
    case State{None{}, _}: False{}

def configure(state: State, profile: Maybe<&2, Profile>) -> State:
  match state:
    case State{_, candidates}: State{profile, candidates}

def candidate_token(candidate: Candidate) -> Nat:
  match candidate:
    case Candidate{_, _, _, _, token}: token

def select_candidate(
  found: Bool,
  head: Candidate,
  rest: Maybe<&2, Candidate>
) -> Maybe<&2, Candidate>:
  match found:
    case True{}: Some{head}
    case False{}: rest

def lookup(candidates: List<&2, Candidate>, +token: Nat) -> Maybe<&2, Candidate>:
  match candidates:
    case Nil{}: None{}
    case +head <> tail: select_candidate(
      Nat.is_eq(candidate_token(head), token),
      head,
      lookup(tail, token)
    )

def insert_selected(found: Bool, head: Candidate, tail: List<&2, Candidate>, candidate: Candidate,
    rest: List<&2, Candidate>) -> List<&2, Candidate>:
  match found:
    case True{}: candidate <> tail
    case False{}: head <> rest

# Replacement preserves registration order, matching the original finite map.
def insert(items: List<&2, Candidate>, +candidate: Candidate) -> List<&2, Candidate>:
  match items:
    case Nil{}: [candidate]
    case +head <> +tail:
      insert_selected(
        Nat.is_eq(candidate_token(head), candidate_token(candidate)),
        head,
        tail,
        candidate,
        insert(tail, candidate)
      )

def keep_candidate(
  keep: Bool,
  candidate: Candidate,
  tail: List<&2, Candidate>
) -> List<&2, Candidate>:
  match keep:
    case True{}: candidate <> tail
    case False{}: tail

def remove(items: List<&2, Candidate>, +token: Nat) -> List<&2, Candidate>:
  match items:
    case Nil{}: []
    case +head <> tail:
      keep_candidate(Bool.not(Nat.is_eq(candidate_token(head), token)), head, remove(tail, token))

def claim(+p: Nat, token: Nat, capacity: Nat) -> Driver.Action:
  Driver.immediate(C.CollectionClaimBackground{p, token, True{}, capacity}, False{})

def registered(stop: Bool, +p: Nat, l: Nat, r: Nat, +advice: Nat, +profile: Profile,
    candidates: List<&2, Candidate>) -> Changed:
  match stop profile:
    case True{} _: Changed{State{Some{profile}, candidates}, Driver.Handled{True{}, []}}
    case False{} Profile{capacity, _}:
      Changed{State{Some{profile}, insert(candidates, Candidate{p, l, r, advice, advice})},
        Driver.Handled{True{}, [claim(p, advice, capacity)]}}

def eligible(event: C.CanonicalEvent, +state: State, stop: Bool) -> Changed:
  match event state:
    case C.CollectionReady{advice, p, l, r, _, _} State{Some{profile}, candidates}:
      registered(stop, p, l, r, advice, profile, candidates)
    case _ _: Changed{state, Driver.Handled{False{}, []}}

def validate(candidate: Maybe<&2, Candidate>, context: Driver.Context) -> List<&2, Driver.Action>:
  match candidate context:
    case Some{Candidate{p, _, r, +advice, token}}
      Driver.Context{
        _,
        _,
        _,
        _,
        _,
        _,
        _,
        current,
        credential,
        generation,
        readable,
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
      [
        Driver.candidate_action(
          C.FinalCandidateCheck{
            True{},
            generation,
            credential,
            False{},
            current && readable,
            True{}
          },
          Driver.Candidate{p, advice, r, token, Handoff.Background{}, False{}}
        )
      ]
    case None{} _: []

def claimed(event: C.CanonicalEvent, +state: State, context: Driver.Context) -> Changed:
  match event state:
    case C.CollectionClaimBackground{+p, +token, _, _} State{
      Some{Profile{_, +lifetime}},
      candidates
    }:
      Changed{
        state,
        Driver.Handled{
          True{},
          List.append(
            &2,
            Driver.Action,
            validate(lookup(candidates, token), context),
            [
              Driver.Action{
                C.CollectionExpireBackground{p, token, lifetime, lifetime},
                lifetime,
                None{},
                False{},
                None{}
              }
            ]
          )
        }
      }
    case _ _: Changed{state, Driver.Handled{False{}, []}}

def retry_live(
  work: Maybe<&2, C.Work>,
  candidate: Candidate,
  capacity: Nat
) -> List<&2, Driver.Action>:
  match work candidate:
    case Some{C.Work{+p, l, r, _, _, C.PendingFinding{_}, _}} Candidate{cp, cl, cr, _, token}:
      Bool.pick(List<&2, Driver.Action>, Nat.is_eq(p, cp) && Nat.is_eq(l, cl) && Nat.is_eq(r, cr),
        [claim(p, token, capacity)], [])
    case _ _: []

def retry(
  candidates: List<&2, Candidate>,
  +work: List<&2, C.Work>,
  +capacity: Nat
) -> List<&2, Driver.Action>:
  match candidates:
    case Nil{}: []
    case +head <> tail:
      List.append(
        &2,
        Driver.Action,
        retry_live(Driver.find_operation(work, candidate_token(head)), head, capacity),
        retry(tail, work, capacity)
      )

def exists(work: Maybe<&2, C.Work>) -> Bool:
  match work:
    case Some{_}: True{}
    case None{}: False{}

def retain(candidates: List<&2, Candidate>, +work: List<&2, C.Work>) -> List<&2, Candidate>:
  match candidates:
    case Nil{}: []
    case +head <> tail:
      keep_candidate(
        exists(Driver.find_operation(work, candidate_token(head))),
        head,
        retain(tail, work)
      )

def released(state: State, +canonical: C.State) -> Changed:
  match state:
    case State{Some{+profile}, +candidates}:
      Changed{State{Some{profile}, retain(candidates, Driver.work_list(canonical))},
        Driver.Handled{True{}, retry(candidates, Driver.work_list(canonical), capacity(profile))}}
    case State{None{}, candidates}: Changed{State{None{}, candidates}, Driver.Handled{False{}, []}}

def claims(canonical: C.State) -> List<&2, Collection.Claim>:
  match canonical:
    case C.State{_, _, _, _, _, _, _, Collection.State{_, _, claims, _, _, _, _}, _}: claims

def release_matching(
  found: Bool,
  group: Nat,
  token: Nat,
  rest: List<&2, Driver.Action>
) -> List<&2, Driver.Action>:
  match found:
    case True{}: [Driver.immediate(C.CollectionReleaseBackground{group, token}, False{})]
    case False{}: rest

def release_claim(items: List<&2, Collection.Claim>, +token: Nat) -> List<&2, Driver.Action>:
  match items:
    case Nil{}: []
    case Collection.Claim{group, owner} <> tail:
      release_matching(Nat.is_eq(owner, token), group, token, release_claim(tail, token))

def release_group_matching(
  found: Bool,
  group: Nat,
  token: Nat,
  rest: List<&2, Driver.Action>
) -> List<&2, Driver.Action>:
  match found:
    case True{}: [Driver.immediate(C.CollectionReleaseBackground{group, token}, False{})]
    case False{}: rest

def release_group(
  items: List<&2, Collection.Claim>,
  +group: Nat,
  +token: Nat
) -> List<&2, Driver.Action>:
  match items:
    case Nil{}: []
    case Collection.Claim{p, owner} <> tail:
      release_group_matching(
        Nat.is_eq(p, group) && Nat.is_eq(owner, token),
        group,
        token,
        release_group(tail, group, token)
      )

def limited(+state: State, canonical: C.State, context: Driver.Context) -> Changed:
  match state context:
    case State{profile, candidates} Driver.Context{
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
      Some{Driver.Candidate{p, _, _, +token, _, _}},
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      Changed{
        State{profile, remove(candidates, token)},
        Driver.Handled{True{}, release_group(claims(canonical), p, token)}
      }
    case _ _: Changed{state, Driver.Handled{False{}, []}}

# Invoked only for the actual accepted command, in its original command order.
def handle(+state: State, event: C.CanonicalEvent, command: C.Output,
    canonical: C.State, context: Driver.Context, stop: Bool) -> Changed:
  match command:
    case C.PolicyDecided{C.CollectionLimited{}}: limited(state, canonical, context)
    case C.EventEstablished{C.CollectionEligible{}}: eligible(event, state, stop)
    case C.EventEstablished{C.CollectionBackgroundClaimed{}}: claimed(event, state, context)
    case C.EventEstablished{C.CollectionBackgroundReleased{}}: released(state, canonical)
    case _: Changed{state, Driver.Handled{False{}, []}}

def completed_token(+state: State, canonical: C.State, +token: Nat) -> Changed:
  match state:
    case State{Some{profile}, candidates}:
      Changed{State{Some{profile}, remove(candidates, token)},
        Driver.Handled{True{}, release_claim(claims(canonical), token)}}
    case State{None{}, _}: Changed{state, Driver.Handled{False{}, []}}

def after(state: State, canonical: C.State, event: C.CanonicalEvent) -> Changed:
  match event:
    case C.SubmissionTerminal{_, token, _}: completed_token(state, canonical, token)
    case C.SubmissionRelease{_, token}: completed_token(state, canonical, token)
    case C.CollectionRetireAdvice{advice}: completed_token(state, canonical, advice)
    case _: Changed{state, Driver.Handled{False{}, []}}

def with_candidate(candidate: Maybe<&2, Candidate>, context: Driver.Context) -> Driver.Context:
  match candidate context:
    case Some{Candidate{+p, _, +r, advice, token}}
      Driver.Context{
        _,
        l,
        _,
        bytes,
        job,
        delay,
        outcome,
        current,
        credential,
        generation,
        readable,
        lifetime,
        _,
        collection,
        review,
        output,
        certain,
        output_delay,
        lease,
        background,
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
        Some{Driver.Candidate{p, advice, r, token, Handoff.Background{}, False{}}},
        collection,
        review,
        output,
        certain,
        output_delay,
        lease,
        background,
        dispatch
      }
    case None{} context: context

def candidate_context(
  state: State,
  event: C.CanonicalEvent,
  context: Driver.Context
) -> Driver.Context:
  match state event:
    case State{_, candidates} C.CollectionClaimBackground{_, token, _, _}: with_candidate(
      lookup(candidates, token),
      context
    )
    case _ _: context
