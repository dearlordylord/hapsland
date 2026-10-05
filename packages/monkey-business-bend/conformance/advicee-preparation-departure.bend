import Base
import ./advicee-lifecycle-driver.bend as Driver
import ../AdviceeLifecycle.bend as Lifecycle
import ./minimal-scenario.bend as Minimal

# Original source-free configuration and ordered lifecycle controls; no JS trace.
def json() -> String:
  Minimal.bracket(Minimal.show_rows(Driver.run(Lifecycle.Disconnect{}, 0n, 1n)))

def main() -> IO(Unit):
  IO.print(json())
