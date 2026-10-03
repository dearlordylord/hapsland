import Base
import ./sharing-native-driver.bend as Sharing
import ./minimal-scenario.bend as Minimal

# Original deterministic scenarios; no recorded JavaScript output is imported.
# Central sharing_edit_attempt / sharing_leave / sharing_leave_all are explicit
# missing TDD prerequisites, not bypassed by test-owned routing or settlement.
def main() -> IO(Unit):
  IO.print("[" ++ Minimal.show_traces([Sharing.run(0n),Sharing.run(1n),Sharing.run(2n),Sharing.run(3n),Sharing.run(4n),Sharing.run(5n)]) ++ "]")
