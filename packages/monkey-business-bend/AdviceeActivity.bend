import Base
import ./Advicees.bend as Advicees
import ./AdviceeLifecycle.bend as Lifecycle
import ../agent-flow-bend/Canonical.bend as Canonical

# This private capture fences generated arrivals. It is not a Canonical lifetime:
# an accepted advanced OpenRound can change that lifetime without replacing the
# generated activity incarnation. Only a successful resume replaces this capture.
type Scope is Data:
  Scope{partition: Nat, incarnation: Nat}

def lookup_found(found: Bool, incarnation: Nat, remaining: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match found:
    case True{}: Some{incarnation}
    case False{}: remaining

def lookup(scopes: List<&2, Scope>, +partition: Nat) -> Maybe<&2, Nat>:
  match scopes:
    case Nil{}: None{}
    case Scope{owner, incarnation} <> tail:
      lookup_found(Nat.is_eq(owner, partition), incarnation, lookup(tail, partition))

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

def resumed_head(valid: Bool, owner: Nat, incarnation: Nat) -> Scope:
  match valid:
    case True{}: Scope{owner, Nat.add(incarnation, 1n)}
    case False{}: Scope{owner, incarnation}

def resumed(scopes: List<&2, Scope>, +partition: Nat) -> List<&2, Scope>:
  match scopes:
    case Nil{}: Nil{}
    case Scope{+owner, +incarnation} <> tail:
      resumed_head(Nat.is_eq(owner, partition) && Advicees.bounded(Nat.add(incarnation, 1n)), owner, incarnation) <> resumed(tail, partition)

# Advanced raw facts retain their accepted Canonical identity. Departure snapshots
# that identity before cleanup; the private arrival incarnation is unchanged.
def synchronize_round(entries: List<&2, Lifecycle.Entry>, entry: Maybe<&2, Lifecycle.Entry>, round: Maybe<&2, Canonical.Round>) -> List<&2, Lifecycle.Entry>:
  match entry round:
    case Some{Lifecycle.Entry{owner, _, status}} Some{Canonical.Round{_, lifetime, _, _, _, _, _, _}}:
      Lifecycle.replace(entries, Lifecycle.Entry{owner, lifetime, status})
    case _ _: entries

def synchronize(+entries: List<&2, Lifecycle.Entry>, canonical: Canonical.State, +partition: Nat) -> List<&2, Lifecycle.Entry>:
  match canonical:
    case Canonical.State{_, rounds, _, _, _, _, _, _, _}:
      synchronize_round(entries, Lifecycle.lookup(entries, partition), Canonical.find_round(partition, rounds))

def actual_lifetime(found_entry: Maybe<&2, Lifecycle.Entry>, found_round: Maybe<&2, Canonical.Round>) -> Nat:
  match found_entry found_round:
    case _ Some{Canonical.Round{_, lifetime, _, _, _, _, _, _}}: lifetime
    case Some{Lifecycle.Entry{_, lifetime, _}} None{}: lifetime
    case None{} None{}: 0n

def lifetime(canonical: Canonical.State, entries: List<&2, Lifecycle.Entry>, +partition: Nat) -> Nat:
  match canonical:
    case Canonical.State{_, rounds, _, _, _, _, _, _, _}:
      actual_lifetime(Lifecycle.lookup(entries, partition), Canonical.find_round(partition, rounds))
