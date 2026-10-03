import Base
import ./callback-original-programs.bend as Program
import ./callback-native-codec.bend as Codec

# One original program per mandatory fresh native fixture. No aggregate IO root.
def json() -> String:
  Codec.render(Codec.scenario_window(Program.reverse_order(),1000n))

def main() -> IO(Unit):
  IO.print(json())
