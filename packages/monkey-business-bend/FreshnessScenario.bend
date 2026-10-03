import Base
import ./Driver.bend as Driver
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/CollectionState.bend as Collection

# Captured source-free identities, not another revision decision model.
# The edge interns source labels; Canonical alone accepts replacement/reuse.
type Source is Data:
  Source{subject: Nat, input: Nat}
type Scope is Data:
  Scope{partition: Nat, lifetime: Nat, round: Nat, operation: Nat}
type Binding is Data:
  Binding{scope: Scope, source: Source, generation: Nat}
type State is Data:
  State{bindings: List<&2, Binding>}

def initial() -> State:
  State{[]}

def same(left: Scope, right: Scope) -> Bool:
  match left right:
    case Scope{p, l, r, op} Scope{other_p, other_l, other_r, other_op}:
      Nat.is_eq(p, other_p) && Nat.is_eq(l, other_l) && Nat.is_eq(r, other_r) && Nat.is_eq(op, other_op)

def found(equal: Bool, binding: Binding, rest: Maybe<&2, Binding>) -> Maybe<&2, Binding>:
  match equal:
    case True{}: Some{binding}
    case False{}: rest

def lookup(bindings: List<&2, Binding>, +scope: Scope) -> Maybe<&2, Binding>:
  match bindings:
    case Nil{}: None{}
    case Binding{+owner, +source, +generation} <> tail:
      found(same(owner, scope), Binding{owner, source, generation}, lookup(tail, scope))

def kept(equal: Bool, binding: Binding, rest: List<&2, Binding>) -> List<&2, Binding>:
  match equal:
    case True{}: rest
    case False{}: binding <> rest

def remove(bindings: List<&2, Binding>, +scope: Scope) -> List<&2, Binding>:
  match bindings:
    case Nil{}: []
    case Binding{+owner, +source, +generation} <> tail:
      kept(same(owner, scope), Binding{owner, source, generation}, remove(tail, scope))

def retain(state: State, +scope: Scope, source: Source, generation: Nat) -> State:
  match state:
    case State{bindings}: State{Binding{scope, source, generation} <> remove(bindings, scope)}

def registration(source: Source) -> Driver.Action:
  match source:
    case Source{subject, input}: Driver.immediate(Canonical.RevisionRegister{subject, input, False{}}, False{})

# Call only with the command emitted by this actual registration transition;
# rejected admission must never publish registration or change these captures.
def registered(state: State, scope: Scope, source: Source, command: Canonical.Command) -> State:
  match command:
    case Canonical.RevisionReused{generation}: retain(state, scope, source, generation)
    case Canonical.RevisionReplaced{generation}: retain(state, scope, source, generation)
    case _: state

def inherit(state: State, child: Scope, parent: Maybe<&2, Binding>) -> State:
  match parent:
    case None{}: state
    case Some{Binding{_, source, generation}}: retain(state, child, source, generation)

# Unit facts inherit the admitted parent's captured generation, even if another
# edit replaced the subject while preparation was still physically in flight.
def unit(+state: State, +parent: Scope, command: Canonical.Command) -> State:
  match state parent command:
    case State{+bindings} Scope{+p, +l, +r, +operation} Canonical.UnitAdmitted{child, _, _, _, _}:
      inherit(state, Scope{p, l, r, child}, lookup(bindings, Scope{p, l, r, operation}))
    case _ _ _: state

def check_found(binding: Maybe<&2, Binding>) -> List<&2, Driver.Action>:
  match binding:
    case None{}: []
    case Some{Binding{_, Source{subject, input}, generation}}:
      [Driver.immediate(Canonical.RevisionCurrentCheck{subject, input, generation}, False{})]

def checks(state: State, scope: Scope) -> List<&2, Driver.Action>:
  match state:
    case State{bindings}: check_found(lookup(bindings, scope))

def current_binding(canonical: Canonical.State, binding: Maybe<&2, Binding>) -> Maybe<&2, Bool>:
  match canonical binding:
    case Canonical.State{_, _, _, _, _, _, _, collection, _}
      Some{Binding{_, Source{subject, input}, generation}}:
      Some{Collection.revision_current(collection, subject, input, generation)}
    case _ None{}: None{}

# None means no captured revision input, not permission or refusal. The caller
# supplies the ordinary non-revision environmental fact for that separate path.
def current(state: State, canonical: Canonical.State, scope: Scope) -> Maybe<&2, Bool>:
  match state:
    case State{bindings}: current_binding(canonical, lookup(bindings, scope))

def retired(state: State, scope: Scope) -> State:
  match state:
    case State{bindings}: State{remove(bindings, scope)}
