import Base
import ./core.bend as Core
import ./RANK_SUPPORT_LAWS.bend as Weight
import ./NUMERIC_SPEC_RANK.bend as Measure

# Case transport of the approved declaration partition through its visited Bool.
law seen_weight_partition:
  for +seen: Bool
  for +references: List<&2, Core.Reference>
  {
    (Weight.weight(
      seen,
      List.length(&2, Core.Reference, references)
    ) + Measure.reentry_if(seen, references) : Nat)
    == List.length(&2, Core.Reference, references)
    : Nat
  }
