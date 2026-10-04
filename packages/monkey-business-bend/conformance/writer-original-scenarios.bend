import Base
import ./writer-original-cases.bend as Inputs
import ./writer-observed-wire.bend as Writer
import ./callback-native-codec.bend as Codec

# Accumulate complete envelopes without retaining flattened earlier heads.
def scenarios(modes: List<&2,Nat>, accumulated: List<&2,Writer.Envelope>) -> List<&2,Writer.Envelope>:
  match modes:
    case Nil{}: List.reverse(&2,Writer.Envelope,accumulated)
    case mode <> tail: scenarios(tail,Writer.observed(Inputs.original(mode)) <> accumulated)

def json() -> String:
  Codec.render(Codec.writer_scenarios(scenarios([0n,1n,2n,3n,4n,5n,6n,7n,8n,9n,10n,11n,12n],[]),[]))
def main() -> IO(Unit):
  IO.print(json())
