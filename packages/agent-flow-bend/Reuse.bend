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

def main() -> Route:
  route(False{}, False{}, False{})
