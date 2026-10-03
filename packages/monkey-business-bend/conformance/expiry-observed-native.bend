import Base
import ./expiry-original-inputs.bend as Inputs
import ./callback-native-codec.bend as Codec

def json() -> String:
  Codec.render(Codec.expiry_scenarios(Inputs.all(),[]))

def main() -> IO(Unit):
  IO.print(json())
