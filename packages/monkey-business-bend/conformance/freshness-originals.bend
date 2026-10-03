import Base
import ../FreshnessScenario.bend as Freshness

# Literal ORIGINAL source-free facts, not a JavaScript event recording. All
# scripts use one advicee, preparation2, Jev5, source/units10/[5], findings and
# the shared Minimal/NativeStep declared two-file graph facts.
type Edit is Data:
  Edit{at: Nat, source: Freshness.Source}
type Script is Data:
  Script{edits: List<&2, Edit>, until: Nat}

def same() -> Script:
  Script{[Edit{0n, Freshness.Source{1n, 1n}}, Edit{3n, Freshness.Source{1n, 1n}}], 12n}

def changed() -> Script:
  Script{[Edit{0n, Freshness.Source{1n, 1n}}, Edit{3n, Freshness.Source{1n, 2n}}], 12n}

# Independent expected milestones. Outcome2=finding; terminal membership is
# constrained separately by actual advice identity in the public comparator.
def changed_milestones() -> List<&2, List<&2, Nat>>:
  [[12n, 7n, 1n, 1n, 1n, 3n, 1n, 0n],
   [12n, 10n, 1n, 1n, 1n, 6n, 2n, 1n],
   [18n, 10n], [32n, 10n, 1n, 5n, 0n, 0n, 0n]]

def same_milestones() -> List<&2, List<&2, Nat>>:
  [[12n, 7n, 1n, 1n, 1n, 3n, 1n, 1n],
   [12n, 10n, 1n, 1n, 1n, 6n, 2n, 1n],
   [18n, 7n], [18n, 10n], [32n, 10n, 2n, 10n, 0n, 0n, 0n]]
