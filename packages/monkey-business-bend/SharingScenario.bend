import Base
import ../agent-flow-bend/Canonical.bend as C
import ../agent-flow-bend/Reuse.bend as Reuse
import ../agent-flow-bend/CollectionState.bend as Collection
import ./FreshnessScenario.bend as Freshness

# The edge interns the complete prepared.identity label bijectively. Partition
# pairing, membership and physical callback attribution live in this shared
# core. No claim authorizes cross-partition sharing or another output attempt.
type Key is Data:
  Key{partition: Nat, prepared: Nat}
type Member is Data:
  Member{scope: Freshness.Scope, source: Freshness.Source, generation: Nat}
type Physical is Data:
  Physical{partition: Nat, lifetime: Nat, round: Nat, operation: Nat, request: Nat}
type Evaluation is Data:
  Evaluation{id: Nat, key: Key, members: List<&2,Member>,
    physical: Maybe<&2,Physical>, advice: Maybe<&2,Freshness.Scope>}
type State is Data:
  State{evaluations: List<&2,Evaluation>, next_id: Nat}
type Registration is Data:
  Registration{state: State, id: Maybe<&2,Nat>}

def initial() -> State:
  State{[],1n}

def same_key(left: Key, right: Key) -> Bool:
  match left right:
    case Key{p,input} Key{owner,prepared}:
      Nat.is_eq(p,owner) && Nat.is_eq(input,prepared)

def same_member(left: Member, right: Member) -> Bool:
  match left right:
    case Member{scope,_,_} Member{other,_,_}: Freshness.same(scope,other)

def member_partition(member: Member) -> Nat:
  match member:
    case Member{Freshness.Scope{partition,_,_,_},_,_}: partition

def key_partition(key: Key) -> Nat:
  match key:
    case Key{partition,_}: partition

def id(evaluation: Evaluation) -> Nat:
  match evaluation:
    case Evaluation{id,_,_,_,_}: id

def key(evaluation: Evaluation) -> Key:
  match evaluation:
    case Evaluation{_,key,_,_,_}: key

def members(evaluation: Evaluation) -> List<&2,Member>:
  match evaluation:
    case Evaluation{_,_,members,_,_}: members

def present(items: List<&2,Member>) -> Bool:
  match items:
    case []: False{}
    case _ <> _: True{}

def choose(found: Bool, evaluation: Evaluation,
    rest: Maybe<&2,Evaluation>) -> Maybe<&2,Evaluation>:
  match found:
    case True{}: Some{evaluation}
    case False{}: rest

def find(items: List<&2,Evaluation>, +evaluation_id: Nat) -> Maybe<&2,Evaluation>:
  match items:
    case []: None{}
    case +head <> tail: choose(Nat.is_eq(id(head),evaluation_id),head,find(tail,evaluation_id))

def lookup(state: State, evaluation_id: Nat) -> Maybe<&2,Evaluation>:
  match state:
    case State{items,_}: find(items,evaluation_id)

# A fully departed evaluation's original physical callback may remain live.
# New work must not join that retired claim or steal its callback attribution.
def find_live_key(items: List<&2,Evaluation>, +requested: Key) -> Maybe<&2,Evaluation>:
  match items:
    case []: None{}
    case +head <> tail:
      choose(same_key(key(head),requested) && present(members(head)),head,find_live_key(tail,requested))

def allocate(state: State, key: Key, member: Member, allowed: Bool) -> Registration:
  match state allowed:
    case State{items,+next} True{}:
      Registration{State{Evaluation{next,key,[member],None{},None{}} <> items,(next+1n:Nat)},Some{next}}
    case _ False{}: Registration{state,None{}}

def existing(+state: State, +key: Key, +member: Member,
    found: Maybe<&2,Evaluation>) -> Registration:
  match state found:
    case State{_,+next} None{}:
      allocate(state,key,member,Nat.is_lt(next,281474976710655n))
    case _ Some{evaluation}: Registration{state,Some{id(evaluation)}}

def scoped(state: State, +key: Key, member: Member, allowed: Bool) -> Registration:
  match state allowed:
    case State{+items,next} True{}:
      existing(State{items,next},key,member,find_live_key(items,key))
    case _ False{}: Registration{state,None{}}

def register(state: State, +key: Key, +member: Member) -> Registration:
  scoped(state,key,member,Nat.is_eq(key_partition(key),member_partition(member)))

def keep_eval(hit: Bool, head: Evaluation, tail: List<&2,Evaluation>) -> List<&2,Evaluation>:
  match hit:
    case True{}: tail
    case False{}: head <> tail

def without(items: List<&2,Evaluation>, +evaluation_id: Nat) -> List<&2,Evaluation>:
  match items:
    case []: []
    case +head <> tail: keep_eval(Nat.is_eq(id(head),evaluation_id),head,without(tail,evaluation_id))

def replace(state: State, +evaluation: Evaluation) -> State:
  match state:
    case State{items,next}: State{evaluation <> without(items,id(evaluation)),next}

def member_known(items: List<&2,Member>, +member: Member) -> Bool:
  match items:
    case []: False{}
    case head <> tail: same_member(head,member) || member_known(tail,member)

def append_member(evaluation: Evaluation, +member: Member, duplicate: Bool) -> Evaluation:
  match evaluation duplicate:
    case Evaluation{id,key,members,physical,advice} False{}:
      Evaluation{id,key,List.append(&2,Member,members,[member]),physical,advice}
    case _ True{}: evaluation

def joined(state: State, found: Maybe<&2,Evaluation>, +member: Member,
    accepted: Bool) -> State:
  match found accepted:
    case Some{+evaluation} True{}:
      replace(state,append_member(evaluation,member,member_known(members(evaluation),member)))
    case _ _: state

def join_command(commands: List<&2,C.Command>) -> Bool:
  match commands:
    case []: False{}
    case C.ReuseJoinAdvice{} <> _: True{}
    case C.ReuseJoinPending{} <> _: True{}
    case C.ReuseJoinClaimed{} <> _: True{}
    case _ <> tail: join_command(tail)

# Capture a joined member only after actual Canonical routing. Registration
# already captured the first member; cached-result handling belongs to #189.
def routed(+state: State, evaluation_id: Nat, member: Member,
    commands: List<&2,C.Command>) -> State:
  joined(state,lookup(state,evaluation_id),member,join_command(commands))

def pending_advice(items: List<&2,C.Work>, +scope: Freshness.Scope) -> Bool:
  match items scope:
    case [] _: False{}
    case C.Work{p,l,r,operation,_,C.PendingFinding{_},_} <> tail
        Freshness.Scope{+owner,+generation,+round,+advice}:
      (Nat.is_eq(p,owner) && Nat.is_eq(l,generation) && Nat.is_eq(r,round) && Nat.is_eq(operation,advice)) ||
        pending_advice(tail,Freshness.Scope{owner,generation,round,advice})
    case _ <> tail _: pending_advice(tail,scope)

def work(canonical: C.State) -> List<&2,C.Work>:
  match canonical:
    case C.State{_,_,work,_,_,_,_,_,_}: work

def current_advice(canonical: C.State, +scope: Freshness.Scope, current: Maybe<&2,Bool>) -> Bool:
  match current:
    case Some{True{}}: pending_advice(work(canonical),scope)
    case _: False{}

def live_advice(+canonical: C.State, freshness: Freshness.State, scope: Maybe<&2,Freshness.Scope>) -> Bool:
  match scope:
    case None{}: False{}
    case Some{+scope}: current_advice(canonical,scope,Freshness.current(freshness,canonical,scope))

def route_found(canonical: C.State, freshness: Freshness.State, found: Maybe<&2,Evaluation>) -> List<&2,C.CanonicalEvent>:
  match found:
    case None{}: []
    case Some{Evaluation{id,_,_,_,advice}}:
      [C.ReuseRoute{id,live_advice(canonical,freshness,advice)}]

def route(canonical: C.State, freshness: Freshness.State, state: State, evaluation_id: Nat) -> List<&2,C.CanonicalEvent>:
  route_found(canonical,freshness,lookup(state,evaluation_id))

def keep_member(hit: Bool, head: Member, tail: List<&2,Member>) -> List<&2,Member>:
  match hit:
    case True{}: tail
    case False{}: head <> tail

def without_member(items: List<&2,Member>, +member: Member) -> List<&2,Member>:
  match items:
    case []: []
    case +head <> tail: keep_member(same_member(head,member),head,without_member(tail,member))

# Scope extraction names the precise revision-release input. Canonical alone
# decides whether that generation still has a retained membership.
def release_revision(member: Member) -> C.CanonicalEvent:
  match member:
    case Member{_,Freshness.Source{subject,_},generation}: C.RevisionRelease{subject,generation}

def remaining_after(found: Maybe<&2,Evaluation>, member: Member) -> List<&2,Member>:
  match found:
    case None{}: []
    case Some{Evaluation{_,_,members,_,_}}: without_member(members,member)

def release_claim(evaluation_id: Nat, remaining: Bool) -> List<&2,C.CanonicalEvent>:
  match remaining:
    case True{}: []
    case False{}: [C.ReuseRelease{evaluation_id}]

# Last-member intent releases only the logical reuse claim. Its physical Jev
# slot is left for the matching original terminal callback; no result invented.
def leave_events(found: Maybe<&2,Evaluation>, +member: Member) -> List<&2,C.CanonicalEvent>:
  match found:
    case None{}: []
    case Some{Evaluation{+id,_,+members,_,_}}:
      Bool.pick(List<&2,C.CanonicalEvent>,member_known(members,member),
        release_revision(member) <> release_claim(id,present(without_member(members,member))),[])

def leave(state: State, evaluation_id: Nat, member: Member) -> List<&2,C.CanonicalEvent>:
  leave_events(lookup(state,evaluation_id),member)

def removed_member(state: State, found: Maybe<&2,Evaluation>, member: Member,
    accepted: Bool) -> State:
  match found accepted:
    case Some{Evaluation{id,key,members,physical,advice}} True{}:
      replace(state,Evaluation{id,key,without_member(members,member),physical,advice})
    case _ _: state

# The engine calls this only after the exact member's RevisionReleased event,
# not after an unrelated revision command or a fabricated global cancellation.
def leave_feedback(+state: State, evaluation_id: Nat, member: Member,
    accepted: Bool) -> State:
  removed_member(state,lookup(state,evaluation_id),member,accepted)

def member_check(member: Member, joined: Reuse.JoinedState,
    stale_unavailable: Bool, has_advice: Bool) -> C.CanonicalEvent:
  match member:
    case Member{_,_,generation}:
      C.ReuseMemberCheck{joined,stale_unavailable,Nat.is_gt(generation,0n),has_advice}

def physical_same(left: Physical, right: Physical) -> Bool:
  match left right:
    case Physical{p,l,r,op,request} Physical{owner,generation,round,operation,id}:
      Nat.is_eq(p,owner) && Nat.is_eq(l,generation) && Nat.is_eq(r,round) &&
        Nat.is_eq(op,operation) && Nat.is_eq(request,id)

def physical_equal(found: Maybe<&2,Physical>, supplied: Physical) -> Bool:
  match found:
    case None{}: False{}
    case Some{physical}: physical_same(physical,supplied)

def original(found: Maybe<&2,Evaluation>, supplied: Physical) -> Bool:
  match found:
    case None{}: False{}
    case Some{Evaluation{_,_,_,physical,_}}: physical_equal(physical,supplied)

def callback_original(state: State, evaluation_id: Nat, supplied: Physical) -> Bool:
  original(lookup(state,evaluation_id),supplied)

def physical_record(state: State, found: Maybe<&2,Evaluation>, physical: Physical) -> State:
  match found:
    case Some{Evaluation{id,key,members,None{},advice}}:
      replace(state,Evaluation{id,key,members,Some{physical},advice})
    case _: state

# Call with the actual JevRequestIssued tuple, once. A later member is never
# substituted as the physical callback owner, even if the original member left.
def issued(+state: State, evaluation_id: Nat, physical: Physical) -> State:
  physical_record(state,lookup(state,evaluation_id),physical)

def advice_record(state: State, found: Maybe<&2,Evaluation>, advice: Freshness.Scope) -> State:
  match found:
    case Some{Evaluation{id,key,members,physical,_}}:
      replace(state,Evaluation{id,key,members,physical,Some{advice}})
    case _: state

# Only an actually accepted retained-finding transition may publish this
# original advice scope. This enables the real live-advice route on later edits.
def retained(+state: State, evaluation_id: Nat, advice: Freshness.Scope) -> State:
  advice_record(state,lookup(state,evaluation_id),advice)

def terminal_record(state: State, found: Maybe<&2,Evaluation>, consumed: Bool) -> State:
  match found consumed:
    case Some{Evaluation{id,key,members,_,advice}} True{}:
      replace(state,Evaluation{id,key,members,None{},advice})
    case _ _: state

# Consume this capture only after the exact original terminal fact passed real
# Canonical authority. Membership results still use ReuseMemberCheck and each
# member's captured Freshness binding; this is not permission to emit advice.
def terminal_feedback(+state: State, evaluation_id: Nat, accepted_original: Bool) -> State:
  terminal_record(state,lookup(state,evaluation_id),accepted_original)

def scoped_member(member: Member, partition: Nat, lifetime: Nat) -> Bool:
  match member:
    case Member{Freshness.Scope{owner,generation,_,_},_,_}:
      Nat.is_eq(owner,partition) && Nat.is_eq(generation,lifetime)

def leave_all_members(items: List<&2,Member>, +partition: Nat,
    +lifetime: Nat) -> List<&2,C.CanonicalEvent>:
  match items:
    case []: []
    case +head <> tail:
      List.append(&2,C.CanonicalEvent,
        Bool.pick(List<&2,C.CanonicalEvent>,scoped_member(head,partition,lifetime),
          [release_revision(head)],[]),leave_all_members(tail,partition,lifetime))

def without_scope(items: List<&2,Member>, +partition: Nat,
    +lifetime: Nat) -> List<&2,Member>:
  match items:
    case []: []
    case +head <> tail:
      keep_member(scoped_member(head,partition,lifetime),head,without_scope(tail,partition,lifetime))

def has_scope(items: List<&2,Member>, +partition: Nat, +lifetime: Nat) -> Bool:
  match items:
    case []: False{}
    case head <> tail: scoped_member(head,partition,lifetime) || has_scope(tail,partition,lifetime)

def scoped_release(evaluation_id: Nat, members: List<&2,Member>, partition: Nat,
    lifetime: Nat, matched: Bool) -> List<&2,C.CanonicalEvent>:
  match matched:
    case False{}: []
    case True{}: release_claim(evaluation_id,present(without_scope(members,partition,lifetime)))

# Release only matching revision memberships and the logical reuse claim when
# that scoped departure truly leaves no member. Original physical facts remain.
def leave_all_evaluation(evaluation: Evaluation, +partition: Nat,
    +lifetime: Nat) -> List<&2,C.CanonicalEvent>:
  match evaluation:
    case Evaluation{id,_,+members,_,_}:
      List.append(&2,C.CanonicalEvent,leave_all_members(members,partition,lifetime),
        scoped_release(id,members,partition,lifetime,has_scope(members,partition,lifetime)))

# Forget an idle scoped key only after actual Canonical claim/cache ownership
# is absent and the original callback/advice captures have been consumed. The
# caller must first release each completed member's actual revision membership.
def idle(evaluation: Evaluation, canonical_owned: Bool) -> Bool:
  match evaluation:
    case Evaluation{_,_,[],None{},None{}}: Bool.not(canonical_owned)
    case _: False{}

def forget(state: State, +evaluation_id: Nat, allowed: Bool) -> State:
  match state allowed:
    case State{items,next} True{}: State{without(items,evaluation_id),next}
    case _ False{}: state

# Clearing an advice capture requires the actual Canonical retirement/forget
# outcome; it must not discard a still-live original callback capture.
def advice_retired(state: State, found: Maybe<&2,Evaluation>, accepted: Bool) -> State:
  match found accepted:
    case Some{Evaluation{id,key,members,physical,_}} True{}:
      replace(state,Evaluation{id,key,members,physical,None{}})
    case _ _: state

def retirement_feedback(+state: State, evaluation_id: Nat, accepted: Bool) -> State:
  advice_retired(state,lookup(state,evaluation_id),accepted)
