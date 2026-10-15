import Base

# Combined materialization preflight commands and decisions. Native handles and
# ordinary JS numbers remain invocation-local to its existing Canonical lease.
type Operation is Data:
  Push{value: Nat}
  MeasureArtifact{function_slot: Nat}
  ObserveSites{function_slot: Nat}
  MeasureRawSite{function_slot: Nat, site_slot: Nat}
  MeasureRawPath{}
  Add{}
  Multiply{}
  ReadTypeBytes{}
  Swap{}
  ObserveRootImports{}
  ReadTypeImports{}
  InspectGo{}

type Decision is Data:
  Unavailable{}
  RetainBound{}
  MeasuredEmpty{imports: Bool}
  Measured{declarations: Nat, imports: Bool}

type Plan is Data:
  Plan{decision: Decision, operations: List<&2, Operation>}

def main() -> Unit:
  Unit{}
