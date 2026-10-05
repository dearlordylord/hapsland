import Base
import ../../agent-flow-bend/Canonical.bend as C
import ./sharing-original-inputs.bend as Shared
import ./writer-observed-driver.bend as Writer
import ../AdviceeLifecycle.bend as Lifecycle
import ./writer-intersection-controls.bend as Intersection

# Original public configuration and ordered controls, never a captured public
# event trace. Engine allocates response IDs; input contains no response ID.
type Boundary is Data:
  Advance{endpoint: Nat, budget: Nat}
  WriterControl{input: Writer.Control}
  IntersectionControl{input: Intersection.Control}
  Departure{agent: String, partition: Nat, action: Lifecycle.Action}
type Scenario is Data:
  Scenario{configuration: Shared.Configuration, edits: List<&2,Edit>, jev_delay: Nat, boundaries: List<&2,Boundary>}
type Edit is Data:
  Edit{agent: String, at: Nat, bytes: Nat, units: List<&2,Nat>, outcome: Maybe<&2,C.RequestOutcome>}
  SharedEdit{original: Shared.Edit}

def plain(edit: Edit) -> Edit:
  match edit:
    case SharedEdit{Shared.Edit{agent,at,bytes,units,_,_,_,+outcome}}: Edit{agent,at,bytes,units,outcome}
    case edit: edit
