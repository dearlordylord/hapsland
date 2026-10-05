# Game-owned ability translation. Shared business state is neither accepted nor returned.
import Base
import ../../packages/monkey-business-bend/Numeric.bend as Numeric

type Ability is Data:
  DependencyAcceleration{}
  FutureBatching{}
  LaunchPacing{}
  OutputLatency{outcome: U32, delay: Nat, lease: Nat}
  Refinement{}

type Action is Data:
  Unsupported{}
  OutputTiming{outcome: U32, delay: Nat, lease: Nat}
  FutureReview{delay: Nat, weights: List<&2,Numeric.Words>}

def refined_weights() -> List<&2,Numeric.Words>:
  [Numeric.Words{0n,0n},Numeric.Words{1071644672n,0n},Numeric.Words{1072693248n,0n},Numeric.Words{0n,0n},Numeric.Words{0n,0n},Numeric.Words{0n,0n}]

def translate(ability: Ability) -> Action:
  match ability:
    case DependencyAcceleration{}: Unsupported{}
    case FutureBatching{}: Unsupported{}
    case LaunchPacing{}: Unsupported{}
    case OutputLatency{outcome,delay,lease}: OutputTiming{outcome,delay,lease}
    case Refinement{}: FutureReview{3200n,refined_weights()}
