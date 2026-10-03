import Base
import ./sharing-original-inputs.bend as Inputs
import ./sharing-observed-wire.bend as Sharing
import ./callback-native-codec.bend as Codec

# Aggregate convenience entrypoint. Mandatory conformance runs each of these
# seven full original envelopes from its own fresh finite native root.
def original(value: Inputs.Case) -> String:
  Codec.render(Codec.sharing_scenarios([Sharing.original(Inputs.original_case(value))],[]))

def json() -> String:
  String.concat(["[",original(Inputs.Baseline{}),",",original(Inputs.JoinedLeaves{}),",",
    original(Inputs.OwnerLeaves{}),",",original(Inputs.OtherPartition{}),",",
    original(Inputs.AllLeave{}),",",original(Inputs.JoinAdvice{}),",",
    original(Inputs.SupersededMember{}),"]"])

def main() -> IO(Unit):
  IO.print(json())
