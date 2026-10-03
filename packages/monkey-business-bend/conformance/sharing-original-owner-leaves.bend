import Base
import ./sharing-original-inputs.bend as Inputs
import ./sharing-observed-wire.bend as Sharing
import ./callback-native-codec.bend as Codec

# Independent original inputs; no captured public trace is fed to native.
def json() -> String:
  Codec.render(Codec.sharing_scenarios([Sharing.original(Inputs.original_case(Inputs.OwnerLeaves{}))],[]))

def main() -> IO(Unit):
  IO.print(json())
