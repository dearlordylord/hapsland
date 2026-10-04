import Base
import ./jev-recovery.bend as Scenario
import ./minimal-scenario.bend as Minimal
import ../../agent-flow-bend/Canonical.bend as Canonical

def json() -> String:
  Minimal.bracket(Minimal.show_traces([Scenario.scenario(Canonical.NeverSent{}), Scenario.scenario(Canonical.RequestBackendFailure{}), Scenario.scenario(Canonical.RequestTimeout{}), Scenario.scenario(Canonical.RequestInterrupted{})]))

def main() -> IO(Unit):
  IO.print(json())
