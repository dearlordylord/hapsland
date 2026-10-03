import Base
import ./Advicees.bend as Advicees
import ./AdviceeLifecycle.bend as Lifecycle

# This private capture fences generated arrivals. It is not a Canonical lifetime:
# an accepted advanced OpenRound can change that lifetime without replacing the
# generated activity incarnation. Only a successful resume replaces this capture.
type Scope is Data:
  Scope{partition: Nat, incarnation: Nat}

def lookup(scopes: List<&2, Scope>, +partition: Nat) -> Maybe<&2, Nat>:
  match scopes:
    case Nil{}: None{}
    case Scope{owner, incarnation} <> tail:
      match Nat.is_eq(owner, partition):
        case True{}: Some{incarnation}
        case False{}: lookup(tail, partition)

def register_found(found: Maybe<&2, Nat>, scopes: List<&2, Scope>, partition: Nat) -> List<&2, Scope>:
  match found:
    case Some{_}: scopes
    case None{}: List.append(&2, Scope, scopes, [Scope{partition, 1n}])

def register(+scopes: List<&2, Scope>, +partition: Nat) -> List<&2, Scope>:
  register_found(lookup(scopes, partition), scopes, partition)

def captured_valid(found: Maybe<&2, Nat>, incarnation: Nat) -> Bool:
  match found:
    case None{}: False{}
    case Some{current}: Nat.is_eq(current, incarnation)

def active(entry: Maybe<&2, Lifecycle.Entry>) -> Bool:
  match entry:
    case None{}: False{}
    case Some{entry}: Lifecycle.entry_active(entry)

def valid(scopes: List<&2, Scope>, entries: List<&2, Lifecycle.Entry>, +partition: Nat, incarnation: Nat) -> Bool:
  captured_valid(lookup(scopes, partition), incarnation) && active(Lifecycle.lookup(entries, partition))

def resumed(scopes: List<&2, Scope>, +partition: Nat) -> List<&2, Scope>:
  match scopes:
    case Nil{}: Nil{}
    case Scope{owner, incarnation} <> tail:
      match Nat.is_eq(owner, partition) && Advicees.bounded(incarnation + 1n):
        case True{}: Scope{owner, incarnation + 1n} <> resumed(tail, partition)
        case False{}: Scope{owner, incarnation} <> resumed(tail, partition)
