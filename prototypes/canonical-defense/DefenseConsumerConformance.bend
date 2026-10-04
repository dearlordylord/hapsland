import Base
import ../../packages/monkey-business-bend/OutputScenario.bend as Output
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/Session.bend as Session
import ../../packages/monkey-business-bend/Workload.bend as Workload
import ../../packages/monkey-business-bend/Numeric.bend as Numeric
import ../../packages/monkey-business-bend/TreeFacts.bend as Tree
import ./DefenseConsumerObserved.bend as Observed
import ./DefenseConsumerBatches.bend as Batches
import ./DefenseConsumerCodec.bend as Codec
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ../../packages/agent-flow-bend/ImportGraph.bend as Graph

# Independent literal agreement target. Actual execution below uses the maintained
# game consumer's configuration; game-owned ConfigAgreement checks this literal.
def consumer_seed() -> Nat:
  152n

def consumer_weights() -> List<&2,Numeric.Words>:
  [Numeric.Words{0n,0n},Numeric.Words{1072693248n,0n},Numeric.Words{1072693248n,0n},
   Numeric.Words{0n,0n},Numeric.Words{0n,0n},Numeric.Words{0n,0n}]

def consumer_config() -> T.Config:
  T.Config{Ledger.Limits{32n, 480n, 16n, 480n},
    [T.Advicee{1n, 152n, Some{Workload.Profile{Session.Settings{1200, 200, 4, 3000, 0, 300}, 152,
      [97, 103, 101, 110, 116, 45, 49], 100n, [10n, 20n], None{}}}}],
    T.Environment{3200n, None{}, consumer_weights(), 800n,
      Tree.Profile{1n, 3n, 2n, 2n, 0n, 0n, 0n, 10n, 0n, 0n, 0n, 0n, 4n, 8n, 3n, 6n},
      Graph.Limits{1n, 262144n, 20480n, 8n, 1572864n, 16n, 4n, 128n},
      800n, 5000n, True{}, True{}, 1n, True{}, 20000n,T.OutputProfile{Output.Certain{},None{}}}, None{}}

# The sole generated owner codec needs the game_consumer family registration.
# No local schema or lossy row projection substitutes for that integration seam.
def publish(batches: List<&2,Batches.Batch>) -> IO(Unit):
  match batches:
    case Nil{}: IO.pure(Unit,Unit{})
    case head <> tail:
      IO.bind(Unit,Unit,IO.print(Codec.render(Codec.game_consumer([head],Nil{}))),
        _ => publish(tail))

def main() -> IO(Unit):
  publish(Batches.batches(Observed.all()))
