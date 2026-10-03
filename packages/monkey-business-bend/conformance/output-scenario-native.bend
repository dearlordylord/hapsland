import Base
import ./output-scenario-driver.bend as Driver
import ../OutputScenario.bend as Output
import ./minimal-scenario.bend as Minimal

def main() -> IO(Unit):
  IO.print(Minimal.bracket(Minimal.show_traces([
    Driver.run(Output.Certain{},5n,10n),
    Driver.run(Output.Uncertain{},5n,10n),
    Driver.run(Output.Failed{},5n,10n),
    Driver.run(Output.Certain{},10n,10n),
    Driver.run(Output.Certain{},11n,10n)])))
