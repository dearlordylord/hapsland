import Base
import ./Collection.bend as Collection

type Lease is Data:
  Lease{advice: Nat, owner: Nat}

type Claim is Data:
  Claim{group: Nat, owner: Nat}

type State is Data:
  State{ready: List<&2, Nat>, leases: List<&2, Lease>, claims: List<&2, Claim>}

type Decision is Data:
  Accepted{state: State}
  Refused{state: State}

def initial() -> State:
  State{Nil{}, Nil{}, Nil{}}

def contains(+id: Nat, items: List<&2, Nat>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case item <> rest:
      Bool.or(Nat.is_eq(id, item), contains(id, rest))

def lease_exists(+id: Nat, items: List<&2, Lease>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case Lease{advice, _} <> rest:
      Bool.or(Nat.is_eq(id, advice), lease_exists(id, rest))

def claim_exists(+group: Nat, items: List<&2, Claim>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case Claim{candidate_group, _} <> rest:
      Bool.or(Nat.is_eq(group, candidate_group), claim_exists(group, rest))

def keep_ready(item: Nat, tail: List<&2, Nat>, remove: Bool) -> List<&2, Nat>:
  match remove:
    case True{}:
      tail
    case False{}:
      item <> tail

def remove_ready(+id: Nat, items: List<&2, Nat>) -> List<&2, Nat>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      keep_ready(item, remove_ready(id, rest), Nat.is_eq(id, item))

def keep_lease(item: Lease, tail: List<&2, Lease>, remove: Bool) -> List<&2, Lease>:
  match remove:
    case True{}:
      tail
    case False{}:
      item <> tail

def remove_lease(+id: Nat, +token: Nat, items: List<&2, Lease>) -> List<&2, Lease>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Lease{advice, owner}:
          keep_lease(item, remove_lease(id, token, rest),
            Bool.and(Nat.is_eq(id, advice), Nat.is_eq(token, owner)))

def lease_owned(+id: Nat, +token: Nat, items: List<&2, Lease>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case Lease{advice, owner} <> rest:
      Bool.or(Bool.and(Nat.is_eq(id, advice), Nat.is_eq(token, owner)),
        lease_owned(id, token, rest))

def owns_lease(state: State, advice: Nat, token: Nat) -> Bool:
  match state:
    case State{_, leases, _}:
      lease_owned(advice, token, leases)

def remove_advice_lease(+id: Nat, items: List<&2, Lease>) -> List<&2, Lease>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Lease{advice, _}:
          keep_lease(item, remove_advice_lease(id, rest), Nat.is_eq(id, advice))

def keep_claim(item: Claim, tail: List<&2, Claim>, remove: Bool) -> List<&2, Claim>:
  match remove:
    case True{}:
      tail
    case False{}:
      item <> tail

def remove_claim(+group: Nat, +token: Nat, items: List<&2, Claim>) -> List<&2, Claim>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Claim{candidate_group, candidate_token}:
          keep_claim(item, remove_claim(group, token, rest),
            Bool.and(Nat.is_eq(group, candidate_group), Nat.is_eq(token, candidate_token)))

def claim_owned(+group: Nat, +token: Nat, items: List<&2, Claim>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case Claim{candidate_group, candidate_token} <> rest:
      Bool.or(Bool.and(Nat.is_eq(group, candidate_group), Nat.is_eq(token, candidate_token)),
        claim_owned(group, token, rest))

def mark_ready(+state: State, +advice: Nat, eligible_now: Bool) -> Decision:
  match state:
    case State{ready, leases, claims}:
      Bool.pick(Decision, Bool.and(Nat.is_gt(advice, 0n),
        Bool.or(eligible_now, contains(advice, ready))),
        Accepted{State{Bool.pick(List<&2, Nat>, contains(advice, ready), ready,
          advice <> ready), leases, claims}}, Refused{state})

def reserve(+state: State, +advice: Nat, +token: Nat) -> Decision:
  match state:
    case State{ready, leases, claims}:
      Bool.pick(Decision, Bool.and(Nat.is_gt(token, 0n),
          Bool.and(contains(advice, ready), Bool.not(lease_exists(advice, leases)))),
        Accepted{State{ready, Lease{advice, token} <> leases, claims}}, Refused{state})

def release(+state: State, +advice: Nat, +token: Nat) -> Decision:
  match state:
    case State{ready, leases, claims}:
      Bool.pick(Decision, lease_owned(advice, token, leases),
        Accepted{State{ready, remove_lease(advice, token, leases), claims}},
        Refused{state})

def retire(+state: State, +advice: Nat) -> State:
  match state:
    case State{ready, leases, claims}:
      State{remove_ready(advice, ready), remove_advice_lease(advice, leases), claims}

def claim(+state: State, +group: Nat, +token: Nat, active: Bool, capacity: Nat) -> Decision:
  match state:
    case State{ready, leases, claims}:
      Bool.pick(Decision, Bool.and(active, Bool.and(Nat.is_gt(token, 0n),
        Bool.and(Bool.not(claim_exists(group, claims)),
          Nat.is_lt(List.length(&2, Claim, claims), capacity)))),
        Accepted{State{ready, leases, Claim{group, token} <> claims}}, Refused{state})

def release_claim(+state: State, +group: Nat, +token: Nat) -> Decision:
  match state:
    case State{ready, leases, claims}:
      Bool.pick(Decision, claim_owned(group, token, claims),
        Accepted{State{ready, leases, remove_claim(group, token, claims)}},
        Refused{state})

def expire_claim(+state: State, group: Nat, token: Nat,
    elapsed: Nat, lifetime: Nat) -> Decision:
  Bool.pick(Decision, Collection.expired(elapsed, lifetime),
    release_claim(state, group, token), Refused{state})
