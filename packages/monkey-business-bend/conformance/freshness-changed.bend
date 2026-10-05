import Base
import ./freshness-originals.bend as Originals
import ./freshness-native-driver.bend as Driver
import ./minimal-scenario.bend as Minimal

def trace() -> List<&2, List<&2, Nat>>:
  Driver.rows(Driver.run(Originals.changed()))

def main() -> IO(Unit):
  IO.print(Minimal.bracket(Minimal.show_rows(trace())))
