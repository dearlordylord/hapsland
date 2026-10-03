import Base
import ./permit-generated-driver.bend as Driver
import ../PermitScenario.bend as Permit
import ../../agent-flow-bend/Canonical.bend as Canonical
import ./minimal-scenario.bend as Minimal

def main() -> IO(Unit):
  IO.print(Minimal.bracket(Minimal.show_traces([
    Driver.run(Permit.Successful{},5n,Canonical.RequestFinding{}),
    Driver.run(Permit.Successful{},5n,Canonical.RequestClear{}),
    Driver.run(Permit.Failed{},5n,Canonical.RequestFinding{}),
    Driver.run(Permit.Successful{},11n,Canonical.RequestFinding{})])))
