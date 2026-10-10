import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./NUMERIC_SPEC_ROOT_RANK.bend as Root

# Actual lookup at a raw cons equals the selected-head/suffix case projection.
law cons_lookup_projection_exact:
  for +head: Maybe<&2, Core.Declaration>
  for +rest: Own.Dictionary<Maybe<&2, Core.Declaration>>
  for +name: Nat
  for +count: Nat
  for +key: Nat
  {
    Own.lookup(Maybe<&2, Core.Declaration>, None{}, Own.DCon{name, head, rest, count}, key)
    == Root.lookup_step(Nat.is_eq(name, key), head, rest, key)
    : Maybe<&2, Core.Declaration>
  }

# Case transport for the computed equality test; its premise records the actual test.
law cons_lookup_projection_from_test:
  for +found: Bool
  for +head: Maybe<&2, Core.Declaration>
  for +rest: Own.Dictionary<Maybe<&2, Core.Declaration>>
  for +name: Nat
  for +count: Nat
  for +key: Nat
  for tested: {Nat.is_eq(name, key) == found : Bool}
  {
    Own.lookup(Maybe<&2, Core.Declaration>, None{}, Own.DCon{name, head, rest, count}, key)
    == Root.lookup_step(found, head, rest, key)
    : Maybe<&2, Core.Declaration>
  }
