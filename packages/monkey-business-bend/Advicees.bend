import Base

# Opaque interned identities. Runtime names and parent/child relationships stay
# at the edge; all scopes share the containing Engine resident and scheduler.
type Scope is Data:
  Scope{identity: Nat, partition: Nat, seed: Nat}
type Registry is Data:
  Registry{next: Nat, scopes: List<&2, Scope>}
type Declared is Data:
  Declared{registry: Registry, scope: Maybe<&2, Scope>, valid: Bool}
type Targeted is Data:
  Targeted{scopes: List<&2, Scope>, valid: Bool}

def initial() -> Registry:
  Registry{1n, []}

def maximum() -> Nat:
  Nat.add(Nat.mul(65536n, U32.to_nat(4294967295)), 65535n)

def bounded(+identity: Nat) -> Bool:
  Nat.is_gt(identity, 0n) && Nat.is_le(identity, maximum())

def scope_identity(scope: Scope) -> Nat:
  match scope:
    case Scope{identity, _, _}: identity

def scope_partition(scope: Scope) -> Nat:
  match scope:
    case Scope{_, partition, _}: partition

def found(equal: Bool, scope: Scope, other: Maybe<&2, Scope>) -> Maybe<&2, Scope>:
  match equal:
    case True{}: Some{scope}
    case False{}: other

def find_identity(scopes: List<&2, Scope>, +identity: Nat) -> Maybe<&2, Scope>:
  match scopes:
    case Nil{}: None{}
    case +head <> tail: found(Nat.is_eq(scope_identity(head), identity), head, find_identity(tail, identity))

def find_partition(scopes: List<&2, Scope>, +partition: Nat) -> Maybe<&2, Scope>:
  match scopes:
    case Nil{}: None{}
    case +head <> tail: found(Nat.is_eq(scope_partition(head), partition), head, find_partition(tail, partition))

def lookup_identity(registry: Registry, identity: Nat) -> Maybe<&2, Scope>:
  match registry:
    case Registry{_, scopes}: find_identity(scopes, identity)

def lookup_partition(registry: Registry, partition: Nat) -> Maybe<&2, Scope>:
  match registry:
    case Registry{_, scopes}: find_partition(scopes, partition)

def absent(scope: Maybe<&2, Scope>) -> Bool:
  match scope:
    case None{}: True{}
    case Some{_}: False{}

def declaration(valid: Bool, +registry: Registry, identity: Nat, seed: Nat) -> Declared:
  match valid registry:
    case True{} Registry{+next, scopes}:
      +scope = {Scope{identity, next, seed} : Scope}
      Declared{Registry{Nat.add(next, 1n), List.append(&2, Scope, scopes, [scope])}, Some{scope}, True{}}
    case False{} registry: Declared{registry, None{}, False{}}

def declare(+registry: Registry, +identity: Nat, seed: Nat) -> Declared:
  match registry:
    case Registry{+next, +scopes}:
      declaration(bounded(identity) && bounded(next) && absent(find_identity(scopes, identity)),
        Registry{next, scopes}, identity, seed)

def targeted(scope: Maybe<&2, Scope>) -> Targeted:
  match scope:
    case None{}: Targeted{[], False{}}
    case Some{scope}: Targeted{[scope], True{}}

def targets(registry: Registry, identity: Maybe<&2, Nat>) -> Targeted:
  match registry identity:
    case Registry{_, scopes} None{}: Targeted{scopes, True{}}
    case Registry{_, scopes} Some{identity}: targeted(find_identity(scopes, identity))
