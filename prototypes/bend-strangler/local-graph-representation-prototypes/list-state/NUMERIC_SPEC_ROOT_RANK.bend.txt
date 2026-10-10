import Base
import ./Own.bend as Own
import ./core.bend as Core

# Explicit selected-head/suffix projection of the actual raw dictionary lookup.
def lookup_step(found: Bool, head: Maybe<&2, Core.Declaration>,
    rest: Own.Dictionary<Maybe<&2, Core.Declaration>>, key: Nat) -> Maybe<&2, Core.Declaration>:
  match found:
    case True{}: head
    case False{}: Own.lookup(Maybe<&2, Core.Declaration>, None{}, rest, key)
