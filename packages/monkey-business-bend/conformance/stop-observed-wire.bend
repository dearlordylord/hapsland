import Base
import ./stop-original-inputs.bend as Inputs
import ./advicee-lifecycle-driver.bend as Edge
import ../StopScenario.bend as Stop

# Structural evidence only. Each state/queue below is a snapshot from the
# actual common observer, never a projection reconstructed from an endpoint.
type Frame is Data:
  Observed{frame: Edge.ObservedFrame, original_finish: Maybe<&2,Stop.Finish>}
  Boundary{input: Inputs.Boundary, consumed: Nat, runtime: List<&2,Edge.Runtime>}
  InvalidTransport{runtime: List<&2,Edge.Runtime>}
type Trace is Data:
  Trace{input: Inputs.Scenario, frames: List<&2,Frame>, endpoint: List<&2,Edge.Runtime>, valid: Bool}
type Envelope is Data:
  Envelope{traces: List<&2,Trace>}
