import Base
import ../Callbacks.bend as Callbacks

# SOURCE-ONLY #182 integration gap: Callbacks/Engine registry and queue receipt
# APIs are not in the frozen baseline. The live target MUST come from actual
# issuance, not this script inventing a valid receipt or synthesizing a result.
type Script is Data:
  Script{target: Callbacks.Target, controls: List<&2, Callbacks.Control>}

def delayed_original(target: Callbacks.Target) -> Script:
  Script{target, [Callbacks.Hold{}, Callbacks.Release{}, Callbacks.Duplicate{}]}

# Independent stage accounting for source/units10/[5] with changed edit at3,
# old result held after issuance2, fresh finding settled/delivered10, then the
# ORIGINAL fulltuple callback released at10 and duplicated from its receipt.
# [global items,bytes,physical requests,pending findings,delivered memberships]
def held_old_fresh_delivered() -> List<&2, Nat>:
  [2n, 10n, 1n, 1n, 1n]

def old_released_without_delivery() -> List<&2, Nat>:
  [1n, 5n, 0n, 1n, 1n]

def repeated_old_is_stale() -> List<&2, Nat>:
  [1n, 5n, 0n, 1n, 1n]
