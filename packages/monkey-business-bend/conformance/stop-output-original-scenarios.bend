import Base
import ./stop-observed-driver.bend as Driver
import ./stop-observed-wire.bend as Wire
import ./callback-native-codec.bend as Codec

# The existing stop_scenarios family encodes every complete original frame.
# ONE regeneration follows source changes; no alternate renderer or parser.
def trace() -> List<&2,Nat>:
  Codec.stop_scenarios([Wire.Envelope{Driver.output_scenarios()}],[])

def json() -> String:
  Codec.render(trace())

def main() -> IO(Unit):
  IO.print(json())
