import Base
import ./Lifecycle.bend as Lifecycle

def main() -> Lifecycle.LifecycleResult:
  Lifecycle.apply(Lifecycle.initial(1n, 1n), 1n, 1n, 0n,
    Lifecycle.Issue{2n, 1n, 5n, 1n})
