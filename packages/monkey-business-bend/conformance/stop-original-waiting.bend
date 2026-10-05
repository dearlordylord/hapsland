import Base
import ./stop-observed-driver.bend as Driver
import ./stop-observed-wire.bend as Wire
import ./callback-native-codec.bend as Codec

# Full original input, actual common observer, and unchanged boundary budgets.
# This family is generated from Wire.Envelope, not a hand-written projection.
def trace() -> List<&2,Nat>:
  Codec.stop_scenarios([Wire.Envelope{[Driver.first()]}],[])

def json() -> String:
  Codec.render(trace())

def main() -> IO(Unit):
  IO.print(json())
