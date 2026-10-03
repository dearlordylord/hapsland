import Base
import ./writer-original-cases.bend as Inputs
import ./writer-observed-wire.bend as Writer
import ./callback-native-codec.bend as Codec

def json() -> String:
  Codec.render(Codec.writer_scenarios([Writer.observed(Inputs.original(9n))],[]))
def main() -> IO(Unit):
  IO.print(json())
