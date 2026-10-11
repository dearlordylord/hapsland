import Base
import ../../../../../source-analysis/src/direct-event/graph-resolution/Types.bend as T
import ../../../../../source-analysis/src/direct-event/graph-resolution/Facts.bend as Actual
import ../../../../../source-analysis/src/direct-event/graph-resolution/SourceValidationSpecification.bend as Reference

def actual(source: T.SourceFacts, next: Nat) -> Bool:
  Maybe.is_some(&2, Actual.PreparedFacts, Actual.prepare(source, next))

def expected(source: T.SourceFacts) -> Bool:
  Reference.source(source)

def main() -> Unit:
  Unit{}
