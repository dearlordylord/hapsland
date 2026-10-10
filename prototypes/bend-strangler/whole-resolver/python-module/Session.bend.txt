import Base
import ../Types.bend as T

# Python language-session authority owns membership, accounting, root discovery,
# ordered dependencies and capture transfers. Host stores physical resources.
type Bound is Data:
  Nonnegative{value: Nat}
  Negative{magnitude: Nat}
type Remaining is Data:
  Remaining{files: Bound, read_bytes: Bound, work: Bound}
type Usage is Data:
  Usage{files: Nat, read_bytes: Nat, work: Nat}
type Membership is Data:
  Membership{path: String, observation: T.PathMembership}
type Authority is Data:
  Authority{path: String, capture: T.CaptureToken, bytes: Nat}
type Session is Data:
  Session{
    available: Bool,
    remaining: Remaining,
    source_cap: Nat,
    depth: Nat,
    work: Nat,
    membership: List<&2, Membership>,
    authority: List<&2, Authority>,
    failed: List<&2, String>,
    canonical: List<&2, String>,
    dependencies: List<&2, String>,
    roots: List<&2, String>,
    roots_attempted: Bool
  }

def available(value: Session) -> Bool:
  match value:
    case Session{available, _, _, _, _, _, _, _, _, _, _, _}: available

def with_available(value: Session, replacement: Bool) -> Session:
  match value:
    case Session{_, remaining, source_cap, depth, work, membership, authority, failed, canonical, dependencies, roots, roots_attempted}:
      Session{replacement, remaining, source_cap, depth, work, membership, authority, failed, canonical, dependencies, roots, roots_attempted}

def remaining(value: Session) -> Remaining:
  match value:
    case Session{_, remaining, _, _, _, _, _, _, _, _, _, _}: remaining

def with_remaining(value: Session, replacement: Remaining) -> Session:
  match value:
    case Session{available, _, source_cap, depth, work, membership, authority, failed, canonical, dependencies, roots, roots_attempted}:
      Session{available, replacement, source_cap, depth, work, membership, authority, failed, canonical, dependencies, roots, roots_attempted}

def source_cap(value: Session) -> Nat:
  match value:
    case Session{_, _, source_cap, _, _, _, _, _, _, _, _, _}: source_cap

def with_source_cap(value: Session, replacement: Nat) -> Session:
  match value:
    case Session{available, remaining, _, depth, work, membership, authority, failed, canonical, dependencies, roots, roots_attempted}:
      Session{available, remaining, replacement, depth, work, membership, authority, failed, canonical, dependencies, roots, roots_attempted}

def depth(value: Session) -> Nat:
  match value:
    case Session{_, _, _, depth, _, _, _, _, _, _, _, _}: depth

def with_depth(value: Session, replacement: Nat) -> Session:
  match value:
    case Session{available, remaining, source_cap, _, work, membership, authority, failed, canonical, dependencies, roots, roots_attempted}:
      Session{available, remaining, source_cap, replacement, work, membership, authority, failed, canonical, dependencies, roots, roots_attempted}

def work(value: Session) -> Nat:
  match value:
    case Session{_, _, _, _, work, _, _, _, _, _, _, _}: work

def with_work(value: Session, replacement: Nat) -> Session:
  match value:
    case Session{available, remaining, source_cap, depth, _, membership, authority, failed, canonical, dependencies, roots, roots_attempted}:
      Session{available, remaining, source_cap, depth, replacement, membership, authority, failed, canonical, dependencies, roots, roots_attempted}

def membership(value: Session) -> List<&2, Membership>:
  match value:
    case Session{_, _, _, _, _, membership, _, _, _, _, _, _}: membership

def with_membership(value: Session, replacement: List<&2, Membership>) -> Session:
  match value:
    case Session{available, remaining, source_cap, depth, work, _, authority, failed, canonical, dependencies, roots, roots_attempted}:
      Session{available, remaining, source_cap, depth, work, replacement, authority, failed, canonical, dependencies, roots, roots_attempted}

def authority(value: Session) -> List<&2, Authority>:
  match value:
    case Session{_, _, _, _, _, _, authority, _, _, _, _, _}: authority

def with_authority(value: Session, replacement: List<&2, Authority>) -> Session:
  match value:
    case Session{available, remaining, source_cap, depth, work, membership, _, failed, canonical, dependencies, roots, roots_attempted}:
      Session{available, remaining, source_cap, depth, work, membership, replacement, failed, canonical, dependencies, roots, roots_attempted}

def failed(value: Session) -> List<&2, String>:
  match value:
    case Session{_, _, _, _, _, _, _, failed, _, _, _, _}: failed

def with_failed(value: Session, replacement: List<&2, String>) -> Session:
  match value:
    case Session{available, remaining, source_cap, depth, work, membership, authority, _, canonical, dependencies, roots, roots_attempted}:
      Session{available, remaining, source_cap, depth, work, membership, authority, replacement, canonical, dependencies, roots, roots_attempted}

def canonical(value: Session) -> List<&2, String>:
  match value:
    case Session{_, _, _, _, _, _, _, _, canonical, _, _, _}: canonical

def with_canonical(value: Session, replacement: List<&2, String>) -> Session:
  match value:
    case Session{available, remaining, source_cap, depth, work, membership, authority, failed, _, dependencies, roots, roots_attempted}:
      Session{available, remaining, source_cap, depth, work, membership, authority, failed, replacement, dependencies, roots, roots_attempted}

def dependencies(value: Session) -> List<&2, String>:
  match value:
    case Session{_, _, _, _, _, _, _, _, _, dependencies, _, _}: dependencies

def with_dependencies(value: Session, replacement: List<&2, String>) -> Session:
  match value:
    case Session{available, remaining, source_cap, depth, work, membership, authority, failed, canonical, _, roots, roots_attempted}:
      Session{available, remaining, source_cap, depth, work, membership, authority, failed, canonical, replacement, roots, roots_attempted}

def roots(value: Session) -> List<&2, String>:
  match value:
    case Session{_, _, _, _, _, _, _, _, _, _, roots, _}: roots

def with_roots(value: Session, replacement: List<&2, String>) -> Session:
  match value:
    case Session{available, remaining, source_cap, depth, work, membership, authority, failed, canonical, dependencies, _, roots_attempted}:
      Session{available, remaining, source_cap, depth, work, membership, authority, failed, canonical, dependencies, replacement, roots_attempted}

def roots_attempted(value: Session) -> Bool:
  match value:
    case Session{_, _, _, _, _, _, _, _, _, _, _, roots_attempted}: roots_attempted

def with_roots_attempted(value: Session, replacement: Bool) -> Session:
  match value:
    case Session{available, remaining, source_cap, depth, work, membership, authority, failed, canonical, dependencies, roots, _}:
      Session{available, remaining, source_cap, depth, work, membership, authority, failed, canonical, dependencies, roots, replacement}

def initial(root_path: String, source_cap: Nat, depth: Nat, remaining: Remaining) -> Session:
  Session{True{}, remaining, source_cap, depth, 0n, [], [], [], root_path <> [], [], [], False{}}

def contains(values: List<&2, String>, +name: String) -> Bool:
  match values:
    case []: False{}
    case head <> tail: Bool.or(String.eq(head, name), contains(tail, name))

def append_new(+values: List<&2, String>, +name: String) -> List<&2, String>:
  Bool.pick(List<&2, String>, contains(values, name), values,
    List.append(&2, String, values, name <> []))

def authority_bytes(values: List<&2, Authority>) -> Nat:
  match values:
    case []: 0n
    case Authority{_, _, bytes} <> tail: Nat.add(bytes, authority_bytes(tail))

def usage(+state: Session) -> Usage:
  Usage{
    Nat.add(List.length(&2, Authority, authority(state)), List.length(&2, String, failed(state))),
    Nat.add(authority_bytes(authority(state)), Nat.mul(List.length(&2, String, failed(state)), source_cap(state))),
    work(state)
  }

def within_bound(used: Nat, bound: Bound) -> Bool:
  match bound:
    case Nonnegative{cap}: Nat.is_le(used, cap)
    case Negative{0n}: Nat.is_eq(used, 0n)
    case Negative{1n++rest}: False{}

def below_bound(used: Nat, bound: Bound) -> Bool:
  match bound:
    case Nonnegative{cap}: Nat.is_lt(used, cap)
    case Negative{_}: False{}

def difference_sign(nonnegative: Bool, +cap: Nat, +used: Nat) -> Bound:
  match nonnegative:
    case True{}: Nonnegative{Nat.sub(cap, used)}
    case False{}: Negative{Nat.sub(used, cap)}

def difference(+cap: Nat, +used: Nat) -> Bound:
  difference_sign(Nat.is_ge(cap, used), cap, used)

def permitted_usage(value: Usage, cap: Remaining, reserve_files: Nat, reserve_bytes: Nat) -> Bool:
  match value cap:
    case Usage{files, bytes, used_work} Remaining{file_cap, byte_cap, work_cap}:
      Bool.and(within_bound(Nat.add(files, reserve_files), file_cap),
        Bool.and(within_bound(Nat.add(bytes, reserve_bytes), byte_cap), within_bound(used_work, work_cap)))

def permit(+state: Session, expired: Bool, reserve_files: Nat, reserve_bytes: Nat) -> Bool:
  Bool.and(available(state), Bool.and(Bool.not(expired),
    permitted_usage(usage(state), remaining(state), reserve_files, reserve_bytes)))

def find_membership(values: List<&2, Membership>, +path: String) -> Maybe<&2, T.PathMembership>:
  match values:
    case []: None{}
    case Membership{+name, observation} <> tail:
      Bool.pick(Maybe<&2, T.PathMembership>, String.eq(name, path),
        Some{observation}, find_membership(tail, path))

def put_membership(values: List<&2, Membership>, +path: String, +observation: T.PathMembership) -> List<&2, Membership>:
  match values:
    case []: Membership{path, observation} <> []
    case Membership{+name, old} <> +tail:
      Bool.pick(List<&2, Membership>, String.eq(name, path),
        Membership{path, observation} <> tail,
        Membership{name, old} <> put_membership(tail, path, observation))

# An absent signature is independent of the source representation of failures.
def signature(observation: T.PathMembership) -> String:
  match observation:
    case T.MembershipAbsent{}: "absent"
    case T.MembershipFailed{}: "absent"
    case T.MembershipPresent{_, _, _, signature}: signature

def usable_observation(observation: T.PathMembership) -> Bool:
  match observation:
    case T.MembershipFailed{}: False{}
    case T.MembershipPresent{_, _, symlink, _}: Bool.not(symlink)
    case T.MembershipAbsent{}: True{}

def unchanged(previous: Maybe<&2, T.PathMembership>, +current: T.PathMembership) -> Bool:
  match previous:
    case None{}: True{}
    case Some{old}: String.eq(signature(old), signature(current))

def observed(+state: Session, +path: String, +observation: T.PathMembership) -> Session:
  with_membership(
    with_available(state, Bool.and(available(state), Bool.and(usable_observation(observation),
      unchanged(find_membership(membership(state), path), observation)))),
    put_membership(membership(state), path, observation))

def remaining_work(value: Remaining) -> Bound:
  match value:
    case Remaining{_, _, work}: work

type ObservationPlan is Data:
  KnownMembership{state: Session, observation: T.PathMembership}
  ProbeMembership{state: Session, path: String}
  MembershipUnavailable{state: Session}

def admit_observation(admitted: Bool, +state: Session, path: String) -> ObservationPlan:
  match admitted:
    case False{}: MembershipUnavailable{with_available(state, False{})}
    case True{}: ProbeMembership{with_work(state, Nat.add(work(state), 1n)), path}

def fresh_observation(+state: Session, +path: String, within: Bool, expired: Bool) -> ObservationPlan:
  admit_observation(Bool.and(within, Bool.and(permit(state, expired, 0n, 0n),
    below_bound(work(state), remaining_work(remaining(state))))), state, path)

def observation_known(known: Maybe<&2, T.PathMembership>, state: Session, path: String,
    within: Bool, expired: Bool) -> ObservationPlan:
  match known:
    case Some{observation}: KnownMembership{state, observation}
    case None{}: fresh_observation(state, path, within, expired)

def plan_observation(+state: Session, +path: String, refresh: Bool, within: Bool, expired: Bool) -> ObservationPlan:
  match refresh:
    case True{}: fresh_observation(state, path, within, expired)
    case False{}: observation_known(find_membership(membership(state), path), state, path, within, expired)

def find_authority(values: List<&2, Authority>, +path: String) -> Maybe<&2, Authority>:
  match values:
    case []: None{}
    case Authority{+name, capture, bytes} <> +tail:
      Bool.pick(Maybe<&2, Authority>, String.eq(name, path),
        Some{Authority{name, capture, bytes}}, find_authority(tail, path))

def remove_authority(values: List<&2, Authority>, +path: String) -> List<&2, Authority>:
  match values:
    case []: []
    case Authority{+name, capture, bytes} <> +tail:
      Bool.pick(List<&2, Authority>, String.eq(name, path), tail,
        Authority{name, capture, bytes} <> remove_authority(tail, path))

def remove_path(values: List<&2, String>, +path: String) -> List<&2, String>:
  match values:
    case []: []
    case +head <> +tail:
      Bool.pick(List<&2, String>, String.eq(head, path), tail,
        head <> remove_path(tail, path))

# The failed reservation is recorded before physical capture. A failed physical
# read continues to consume its source-cap charge; a successful read replaces it.
def reserve_capture(+state: Session, path: String) -> Session:
  with_failed(state, append_new(failed(state), path))

def capture_succeeded(+state: Session, path: String) -> Session:
  with_failed(state, remove_path(failed(state), path))

def adopt_capture(+state: Session, +path: String, capture: T.CaptureToken, bytes: Nat) -> Session:
  with_dependencies(with_authority(state,
    List.append(&2, Authority, authority(state), Authority{path, capture, bytes} <> [])),
    append_new(dependencies(state), path))

def transfer_to_canonical(+state: Session, +path: String) -> Session:
  with_canonical(with_authority(state, remove_authority(authority(state), path)),
    append_new(canonical(state), path))

type AuthorityPlan is Data:
  ReuseAuthority{state: Session, authority: Authority}
  ReuseCanonical{state: Session, capture: Maybe<&2, T.CaptureToken>}
  AccessAuthority{state: Session, path: String, cached: T.CacheOutcome}
  AuthorityUnavailable{state: Session}

def admitted_authority(allowed: Bool, state: Session, path: String, cached: T.CacheOutcome) -> AuthorityPlan:
  match allowed:
    case True{}: AccessAuthority{state, path, cached}
    case False{}: AuthorityUnavailable{state}

def reserve_authority(cached: T.CacheOutcome, +state: Session, +path: String, expired: Bool) -> AuthorityPlan:
  match cached:
    case T.CacheAbsent{}: admitted_authority(permit(state, expired, 1n, source_cap(state)),
      state, path, T.CacheAbsent{})
    case T.CachePresent{capture, +bytes}: admitted_authority(permit(state, expired, 1n, bytes),
      state, path, T.CachePresent{capture, bytes})

def canonical_allowed(allowed: Bool, state: Session, cached: T.CacheOutcome) -> AuthorityPlan:
  match allowed cached:
    case False{} _: AuthorityUnavailable{state}
    case True{} T.CacheAbsent{}: ReuseCanonical{state, None{}}
    case True{} T.CachePresent{capture, _}: ReuseCanonical{state, Some{capture}}

def canonical_authority(is_canonical: Bool, +state: Session, path: String,
    cached: T.CacheOutcome, expired: Bool) -> AuthorityPlan:
  match is_canonical:
    case True{}: canonical_allowed(permit(state, expired, 0n, 0n), state, cached)
    case False{}: reserve_authority(cached, state, path, expired)

def failed_authority(is_failed: Bool, +state: Session, +path: String,
    cached: T.CacheOutcome, expired: Bool) -> AuthorityPlan:
  match is_failed:
    case True{}: AuthorityUnavailable{state}
    case False{}: canonical_authority(contains(canonical(state), path), state, path, cached, expired)

def known_authority(known: Maybe<&2, Authority>, +state: Session, +path: String,
    cached: T.CacheOutcome, expired: Bool) -> AuthorityPlan:
  match known:
    case Some{authority}: ReuseAuthority{state, authority}
    case None{}: failed_authority(contains(failed(state), path), state, path, cached, expired)

def plan_authority(+state: Session, +path: String, cached: T.CacheOutcome, expired: Bool) -> AuthorityPlan:
  known_authority(find_authority(authority(state), path), state, path, cached, expired)

type AuthorityResult is Data:
  AuthorityAccepted{state: Session, capture: T.CaptureToken}
  AuthorityRefused{state: Session}

def admit_capture(admitted: Bool, state: Session, path: String, +capture: T.CaptureToken, bytes: Nat) -> AuthorityResult:
  match admitted:
    case True{}: AuthorityAccepted{adopt_capture(state, path, capture, bytes), capture}
    case False{}: AuthorityRefused{state}

# Called after physical success removes the failed reservation and the host
# cache store has completed. Rejection preserves that physical cached capture.
def finish_capture(+state: Session, path: String, capture: T.CaptureToken, +bytes: Nat, expired: Bool) -> AuthorityResult:
  admit_capture(Bool.and(Nat.is_le(bytes, source_cap(state)), permit(state, expired, 1n, bytes)),
    state, path, capture, bytes)

def discovered_roots(+state: Session, roots: List<&2, String>) -> Session:
  with_roots(with_roots_attempted(state, True{}), roots)

def main() -> Unit:
  Unit{}
