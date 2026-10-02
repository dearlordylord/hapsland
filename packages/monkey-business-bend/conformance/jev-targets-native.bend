import Base
import ./jev-recovery.bend as Scenario
import ./minimal-scenario.bend as Minimal

def main() -> IO(Unit):
  IO.print(Minimal.bracket(Minimal.show_traces(Scenario.target_scenarios())))
