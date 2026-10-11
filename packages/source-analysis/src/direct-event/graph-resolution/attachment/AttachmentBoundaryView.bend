import Base
import ./AttachmentFrameView.bend as V
import ./AttachmentPhaseView.bend as Phase
import ../Types.bend as T

# A successful projection identifies a real next observable boundary.
# Unsupported/internal states return None in the projectors; equality of two
# projection failures is never the transaction law's conclusion.
type Continuation is Data:
  CheckingIteration{capsule: Phase.Capsule}
  MeasuringCompletion{capsule: Phase.Capsule, measured_product: T.ProductValue}

type Boundary is Data:
  Failed{failure: T.TechnicalFailure}
  Finished{product: Maybe<&2, T.ProductValue>, final_frame: V.Frame}
  Selected{request: T.Request, frame: V.Frame, continuation: Continuation}

def main() -> Unit:
  Unit{}
