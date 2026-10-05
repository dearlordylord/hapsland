import Base
import ./sharing-original-inputs.bend as Inputs
import ./sharing-observed-wire.bend as Sharing
import ./callback-native-codec.bend as Codec

# Every member is the complete original singleton vector with its unchanged
# sharing_scenarios envelope. One native root owns the seven ordered cases.
def original(value: Inputs.Case) -> String:
  Codec.render(Codec.sharing_scenarios([Sharing.original(Inputs.original_case(value))],[]))

def scenario(mode: Nat) -> String:
  match mode:
    case 0n: original(Inputs.Baseline{})
    case 1n: original(Inputs.JoinedLeaves{})
    case 2n: original(Inputs.OwnerLeaves{})
    case 3n: original(Inputs.OtherPartition{})
    case 4n: original(Inputs.AllLeave{})
    case 5n: original(Inputs.JoinAdvice{})
    case 6n: original(Inputs.SupersededMember{})
    case _: "[999999]"

def scenarios(modes: List<&2,Nat>, accumulated: List<&2,String>) -> List<&2,String>:
  match modes:
    case Nil{}: List.reverse(&2,String,accumulated)
    case mode <> tail: scenarios(tail,scenario(mode) <> accumulated)

def json() -> String:
  String.concat(["[",String.join(scenarios([0n,1n,2n,3n,4n,5n,6n],[]),","),"]"])

def main() -> IO(Unit):
  IO.print(json())
