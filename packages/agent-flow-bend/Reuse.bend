import Base

# Reuse priority is per exact evaluation identity. The adapter owns source
# values and lookup maps; these are only source-free presence facts.
type Route is Data:
  JoinAdvice{}
  JoinPending{}
  JoinClaimed{}
  LookupCache{}

type CacheRoute is Data:
  Cached{}
  Own{}

def route(live_advice: Bool, attached_pending: Bool, claimed_pending: Bool) -> Route:
  match live_advice:
    case True{}:
      JoinAdvice{}
    case False{}:
      match attached_pending:
        case True{}:
          JoinPending{}
        case False{}:
          match claimed_pending:
            case True{}:
              JoinClaimed{}
            case False{}:
              LookupCache{}

def cache_route(hit: Bool) -> CacheRoute:
  match hit:
    case True{}:
      Cached{}
    case False{}:
      Own{}

type JoinedState is Data:
  JoinedPending{}
  JoinedClear{}
  JoinedFinding{}
  JoinedUnavailable{}

type JoinedDisposition is Data:
  KeepJoined{}
  SetJoinedClear{}
  SetJoinedFinding{}
  SetJoinedUnavailable{}
  SetJoinedLost{}

def joined.route(state: JoinedState, +has_revision: Bool,
    has_advice_id: Bool) -> JoinedDisposition:
  match state:
    case JoinedUnavailable{}:
      SetJoinedUnavailable{}
    case JoinedPending{}:
      Bool.pick(JoinedDisposition, has_revision, KeepJoined{}, SetJoinedLost{})
    case JoinedClear{}:
      Bool.pick(JoinedDisposition, has_revision, SetJoinedClear{}, SetJoinedLost{})
    case JoinedFinding{}:
      Bool.pick(JoinedDisposition, Bool.and(has_revision, has_advice_id),
        SetJoinedFinding{}, SetJoinedLost{})

def joined_disposition(state: JoinedState, stale_unavailable: Bool,
    has_revision: Bool, has_advice_id: Bool) -> JoinedDisposition:
  Bool.pick(JoinedDisposition, stale_unavailable, KeepJoined{},
    joined.route(state, has_revision, has_advice_id))

def main() -> Route:
  route(False{}, False{}, False{})
