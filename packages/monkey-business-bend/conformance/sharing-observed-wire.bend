import Base
import ./sharing-original-inputs.bend as Inputs
import ./sharing-observed-driver.bend as Run

# Family-specific envelope only. The common generated prefix codec visits the
# actual owner types recursively, retaining every State/Graph/Cache/receipt field.
type Envelope is Data:
  Envelope{input: Inputs.Scenario, trace: Run.Trace}

def original(+input: Inputs.Scenario) -> Envelope:
  Envelope{input,Run.scenario(input)}
