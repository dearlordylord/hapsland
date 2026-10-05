import Base
import ./shared-resident.bend as Resident
import ./minimal-scenario.bend as Minimal

# Separate bounded compiler entrypoint; the original-input scenario and actual
# driver adapter remain owned once in Resident, with no second command policy.
def main() -> IO(Unit):
  IO.print(Minimal.bracket(Minimal.show_rows(Resident.cancellation())))
