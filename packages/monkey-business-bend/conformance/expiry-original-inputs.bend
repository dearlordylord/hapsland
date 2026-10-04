import Base
import ./expiry-observed-driver.bend as Run
import ../ExpiryScenario.bend as Expiry

# Independently declared original controls reproduce the public scenarios.
def pending(+time: Nat) -> Run.Envelope:
  Run.run([Run.Original{0n,Run.Failure{1n,7n,101n,1n,"backend"}},
    Run.Original{0n,Run.Failure{2n,7n,202n,2n,"backend"}},
    Run.Original{time,Run.Tick{}},Run.Original{time,Run.Collect{1n,7n,False{},False{},[]}},
    Run.Original{20n,Run.Tick{}},Run.Original{20n,Run.Collect{1n,7n,False{},False{},[]}}],
    Expiry.Profile{10n,2n,20n})

def lease(+time: Nat) -> Run.Envelope:
  Run.run([Run.Original{0n,Run.Failure{1n,7n,101n,1n,"backend"}},
    Run.Original{0n,Run.Failure{2n,7n,202n,2n,"backend"}},
    Run.Original{2n,Run.Tick{}},Run.Original{2n,Run.Lease{1n,7n,101n}},
    Run.Original{2n,Run.Profile{Expiry.Profile{1000n,20n,1000n}}},
    Run.Original{time,Run.Tick{}},Run.Original{time,Run.Collect{1n,7n,False{},False{},[]}}],
    Expiry.Profile{100n,2n,20n})

def campaign(+seed: Nat, +deadline: Nat) -> Run.Envelope:
  Run.run([Run.Original{0n,Run.Failure{1n,7n,(100n + seed : Nat),1n,"backend"}},
    Run.Original{(deadline - 1n : Nat),Run.Tick{}},
    Run.Original{(deadline - 1n : Nat),Run.Failure{1n,7n,(100n + seed : Nat),2n,"backend"}},
    Run.Original{(deadline - 1n : Nat),Run.Collect{1n,7n,False{},False{},[]}},
    Run.Original{(deadline - 1n : Nat),Run.Profile{Expiry.Profile{1000n,20n,1000n}}},
    Run.Original{deadline,Run.Tick{}},Run.Original{deadline,Run.Collect{1n,7n,False{},False{},[]}},
    Run.Original{(deadline + 1n : Nat),Run.Tick{}},
    Run.Original{(deadline + 1n : Nat),Run.Collect{1n,7n,False{},False{},[]}}],
    Expiry.Profile{deadline,2n,2n})

def duplicate_lease() -> Run.Envelope:
  Run.run([Run.Original{0n,Run.Failure{1n,7n,101n,1n,"backend"}},
    Run.Original{2n,Run.Tick{}},Run.Original{2n,Run.Lease{1n,7n,101n}},
    Run.Original{2n,Run.Profile{Expiry.Profile{1000n,20n,1000n}}},
    Run.Original{3n,Run.Tick{}},Run.Original{3n,Run.Lease{1n,7n,101n}},
    Run.Original{3n,Run.Collect{1n,7n,False{},False{},[]}},
    Run.Original{4n,Run.Tick{}},Run.Original{4n,Run.Collect{1n,7n,False{},False{},[]}}],
    Expiry.Profile{100n,2n,20n})

def released_lease() -> Run.Envelope:
  Run.run([Run.Original{0n,Run.Failure{1n,7n,101n,1n,"backend"}},
    Run.Original{2n,Run.Tick{}},Run.Original{2n,Run.Lease{1n,7n,101n}},
    Run.Original{3n,Run.Release{101n}},
    Run.Original{3n,Run.Profile{Expiry.Profile{100n,20n,20n}}},
    Run.Original{3n,Run.Lease{1n,7n,101n}},
    Run.Original{4n,Run.Tick{}},Run.Original{4n,Run.Collect{1n,7n,False{},False{},[]}},
    Run.Original{23n,Run.Tick{}},Run.Original{23n,Run.Collect{1n,7n,False{},False{},[]}}],
    Expiry.Profile{100n,2n,20n})

def all() -> List<&2,Run.Envelope>:
  [pending(9n),pending(10n),pending(11n),lease(3n),lease(4n),lease(5n),
    campaign(3n,13n),campaign(17n,13n),campaign(41n,16n),campaign(97n,16n),
    duplicate_lease(),released_lease()]
