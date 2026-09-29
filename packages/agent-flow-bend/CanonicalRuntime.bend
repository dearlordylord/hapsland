import Base
import ./Canonical.bend as Canonical
import ./Ledger.bend as Ledger

def main() -> Canonical.Step & List<&2, Ledger.InventoryEntry>:
  (Canonical.step(Canonical.initial(Ledger.Limits{4n, 100n, 2n, 60n}),
    Canonical.OpenRound{1n, 1n}),
    Ledger.inventory(Ledger.Limits{4n, 100n, 2n, 60n}))
