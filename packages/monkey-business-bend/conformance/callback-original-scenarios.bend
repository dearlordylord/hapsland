import Base
import ./callback-original-programs.bend as Program
import ./callback-native-codec.bend as Codec

# Each original program retains its full existing singleton wire body. Only the
# outer case count changes; frames, retention and physical receipts do not.
def original(mode: Nat) -> List<&2,Nat>:
  match mode:
    case 0n: Codec.scenario_window(Program.wrong_stage(),1000n)
    case 1n: Codec.scenario_window(Program.reverse_order(),1000n)
    case 2n: Codec.scenario_window(Program.canceled(),1000n)
    case 3n: Codec.scenario_window(Program.dropped(),1000n)
    case 4n: Codec.scenario_window(Program.late_preparation(),1000n)
    case 5n: Codec.scenario_window(Program.late_preparation(),1n)
    case _: [999999n]

# Explicitly require the original singleton header before retaining its body.
def singleton_body(words: List<&2,Nat>) -> List<&2,Nat>:
  match words:
    case 1n <> body: body
    case _: [999999n]

def scenarios(modes: List<&2,Nat>, accumulated: List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match modes:
    case Nil{}: List.reverse(&2,List<&2,Nat>,accumulated)
    case mode <> tail: scenarios(tail,singleton_body(original(mode)) <> accumulated)

# Fold words without retaining a recursive call per word in emitted JavaScript.
def reverse_words(words: List<&2,Nat>, accumulated: List<&2,Nat>) -> List<&2,Nat>:
  match words:
    case Nil{}: accumulated
    case word <> tail: reverse_words(tail,word <> accumulated)

def joined(values: List<&2,List<&2,Nat>>, accumulated: List<&2,Nat>) -> List<&2,Nat>:
  match values:
    case Nil{}: List.reverse(&2,Nat,accumulated)
    case body <> tail: joined(tail,reverse_words(body,accumulated))

def json() -> String:
  Codec.render(6n <> joined(scenarios([0n,1n,2n,3n,4n,5n],[]),[]))

def main() -> IO(Unit):
  IO.print(json())
