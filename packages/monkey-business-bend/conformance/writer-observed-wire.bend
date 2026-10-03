import Base
import ./writer-original-inputs.bend as Inputs
import ./writer-observed-program.bend as Writer

# Only a family envelope. ONE generated codec recursively visits the real
# Edge/Engine State, queued original capsules and every observed frame field.
type Envelope is Data:
  Envelope{input: Inputs.Scenario, trace: Writer.Trace}

def observed(+input: Inputs.Scenario) -> Envelope:
  Envelope{input,Writer.scenario(input)}
