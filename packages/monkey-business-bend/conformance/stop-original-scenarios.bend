import Base
import ./stop-observed-driver.bend as Driver
import ./stop-observed-wire.bend as Wire
import ./callback-native-codec.bend as Codec

# Complete original waiting/output-scope inputs, actual common observer and
# unchanged original budgets. The same maintained wire codec carries all frames.
def trace() -> List<&2,Nat>:
  Codec.stop_scenarios([Wire.Envelope{Driver.original_scenarios()}],[])

def json() -> String:
  Codec.render(trace())

def main() -> IO(Unit):
  IO.print(json())
