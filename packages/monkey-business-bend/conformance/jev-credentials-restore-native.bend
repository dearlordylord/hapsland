import Base
import ./jev-credential-restore.bend as Scenario
import ./minimal-scenario.bend as Minimal

def main() -> IO(Unit):
  IO.print(Minimal.bracket(Minimal.show_rows(Scenario.scenario())))
