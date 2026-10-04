import Base
import ./DefenseConsumerObserved.bend as Observed
import ./DefenseConsumerBatches.bend as Batches
import ./DefenseConsumerCodec.bend as Codec

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
