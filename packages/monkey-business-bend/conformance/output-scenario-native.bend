import Base
import ./output-scenario-driver.bend as Driver
import ../OutputScenario.bend as Output
import ./callback-native-codec.bend as Codec

def trace() -> List<&2,Nat>:
  Codec.output_scenarios([Driver.Envelope{[
    Driver.run(Output.Certain{},5n,10n), Driver.run(Output.Uncertain{},5n,10n),
    Driver.run(Output.Failed{},5n,10n), Driver.run(Output.Certain{},10n,10n),
    Driver.run(Output.Certain{},11n,10n)]}],[])

def json() -> String:
  Codec.render(trace())

def main() -> IO(Unit):
  IO.print(json())
