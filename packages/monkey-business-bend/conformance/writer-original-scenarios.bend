import Base
import ./writer-original-cases.bend as Inputs
import ./writer-observed-wire.bend as Writer
import ./callback-native-codec.bend as Codec

def json() -> String:
  Codec.render(Codec.writer_scenarios([
    Writer.observed(Inputs.original(0n)),
    Writer.observed(Inputs.original(1n)),
    Writer.observed(Inputs.original(2n)),
    Writer.observed(Inputs.original(3n)),
    Writer.observed(Inputs.original(4n)),
    Writer.observed(Inputs.original(5n)),
    Writer.observed(Inputs.original(6n)),
    Writer.observed(Inputs.original(7n)),
    Writer.observed(Inputs.original(8n)),
    Writer.observed(Inputs.original(9n)),
    Writer.observed(Inputs.original(10n)),
    Writer.observed(Inputs.original(11n)),
    Writer.observed(Inputs.original(12n))
  ],[]))
def main() -> IO(Unit):
  IO.print(json())
