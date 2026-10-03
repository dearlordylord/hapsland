import Base
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/CollectionState.bend as Collection
import ../agent-flow-bend/RevisionState.bend as Revision
import ./FreshnessScenario.bend as Freshness

# Labels are opaque edge facts. Pairing with the actual partition and allocating
# the canonical subject belongs to this owner, not a host serialization key.
type SubjectKey is Data:
  SubjectKey{partition: Nat, label: Nat, subject: Nat}
type State is Data:
  State{keys: List<&2,SubjectKey>, next: Nat}
type Resolved is Data:
  Resolved{state: State, source: Maybe<&2,Freshness.Source>}

def limit() -> Nat:
  Nat.add(Nat.mul(65536n,U32.to_nat(4294967295)),65535n)

def maximum(+left: Nat, +right: Nat) -> Nat:
  Bool.pick(Nat,Nat.is_lt(left,right),right,left)

def initial() -> State:
  State{[],1n}

def lookup(keys: List<&2,SubjectKey>, +partition: Nat, +label: Nat) -> Maybe<&2,Nat>:
  match keys:
    case Nil{}: None{}
    case SubjectKey{p,s,subject} <> tail:
      Bool.pick(Maybe<&2,Nat>,Nat.is_eq(p,partition) && Nat.is_eq(s,label),Some{subject},lookup(tail,partition,label))

def upper(entries: List<&2,Revision.Entry>) -> Nat:
  match entries:
    case Nil{}: 0n
    case Revision.Entry{subject,_,_,_} <> tail: maximum(subject,upper(tail))

def canonical_upper(canonical: Canonical.State) -> Nat:
  match canonical:
    case Canonical.State{_,_,_,_,_,_,_,Collection.State{_,_,_,_,Revision.State{entries,_},_,_},_}: upper(entries)

def allocated(+state: State, partition: Nat, label: Nat, input: Nat, +candidate: Nat) -> Resolved:
  match state:
    case State{keys,_}:
      Bool.pick(Resolved,Nat.is_lt(candidate,limit()),
        Resolved{State{SubjectKey{partition,label,candidate} <> keys,(candidate + 1n : Nat)},Some{Freshness.Source{candidate,input}}},
        Resolved{state,None{}})

def allocate_unseen(+state: State, +canonical: Canonical.State, partition: Nat, label: Nat, input: Nat) -> Resolved:
  match state:
    case State{_,next}:
      +upper = canonical_upper(canonical)
      Bool.pick(Resolved,Nat.is_lt(upper,limit()),
        allocated(state,partition,label,input,maximum(next,(upper + 1n : Nat))),Resolved{state,None{}})

def resolved(+state: State, canonical: Canonical.State, +partition: Nat, +label: Nat, +input: Nat, found: Maybe<&2,Nat>) -> Resolved:
  match found:
    case Some{subject}: Resolved{state,Some{Freshness.Source{subject,input}}}
    case None{}: allocate_unseen(state,canonical,partition,label,input)

def resolve(+state: State, canonical: Canonical.State, +partition: Nat, source: Freshness.Source) -> Resolved:
  match state source:
    case State{keys,_} Freshness.Source{+label,+input}:
      resolved(state,canonical,partition,label,input,lookup(keys,partition,label))

def captured_subject(bindings: List<&2,Freshness.Binding>, +subject: Nat) -> Bool:
  match bindings:
    case Nil{}: False{}
    case Freshness.Binding{_,Freshness.Source{candidate,_},_} <> tail:
      Nat.is_eq(subject,candidate) || captured_subject(tail,subject)

def present_found(found: Maybe<&2,Revision.Entry>) -> Bool:
  match found:
    case Some{_}: True{}
    case None{}: False{}

def present(canonical: Canonical.State, subject: Nat) -> Bool:
  match canonical:
    case Canonical.State{_,_,_,_,_,_,_,Collection.State{_,_,_,_,Revision.State{entries,_},_,_},_}:
      present_found(Revision.find(subject,entries))

def kept_key(keep: Bool, key: SubjectKey, rest: List<&2,SubjectKey>) -> List<&2,SubjectKey>:
  match keep:
    case True{}: key <> rest
    case False{}: rest

def retained_keys(keys: List<&2,SubjectKey>, +canonical: Canonical.State, +bindings: List<&2,Freshness.Binding>) -> List<&2,SubjectKey>:
  match keys:
    case Nil{}: []
    case SubjectKey{+p,+label,+subject} <> tail:
      kept_key(present(canonical,subject) || captured_subject(bindings,subject),
        SubjectKey{p,label,subject},retained_keys(tail,canonical,bindings))

def retain(state: State, canonical: Canonical.State, bindings: List<&2,Freshness.Binding>) -> State:
  match state:
    case State{keys,next}: State{retained_keys(keys,canonical,bindings),next}
