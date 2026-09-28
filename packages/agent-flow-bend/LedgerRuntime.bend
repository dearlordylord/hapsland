import Base
import ./Ledger.bend as Ledger

type Smoke is Data:
  Smoke{initial: Ledger.Ledger, reserved: Ledger.LedgerResult,
    released: Ledger.LedgerResult, resized: Ledger.LedgerResult,
    cleared: Ledger.Ledger, total: Ledger.Usage, local: Ledger.Usage}

def sample() -> Ledger.Ledger:
  Ledger.Ledger{Ledger.Limits{4n, 100n, 2n, 60n}, 2n,
    Ledger.Charge{1n, 1n, 20n, Ledger.ReviewUnit{}} <> Nil{}}

def main() -> Smoke:
  Smoke{
    Ledger.initial(Ledger.Limits{4n, 100n, 2n, 60n}),
    Ledger.reserve(sample(), 1n, 40n),
    Ledger.release(sample(), 1n),
    Ledger.resize(sample(), 1n, 30n),
    Ledger.clear(sample()),
    Ledger.total(Ledger.Charge{1n, 1n, 20n, Ledger.ReviewUnit{}} <> Nil{}),
    Ledger.partition_usage(Ledger.Charge{1n, 1n, 20n, Ledger.ReviewUnit{}} <> Nil{}, 1n)
  }
