import Base
import ../OutputScenario.bend as Output
import ../TreeFacts.bend as TreeFacts
import ../CollectorScenario.bend as Collector
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/ImportGraph.bend as Graph

# Original caller facts, before any Canonical allocation or physical issuance.
# Expected decisions live in independent public assertions, not in these inputs.
type Configuration is Data:
  Configuration{seed: Nat, identity: Nat, agent_seed: U32, retention: Nat,
    limits: Ledger.Limits, tree: TreeFacts.Profile, graph: Graph.Limits,
    preparation_delay: Nat, jev_delay: Nat, outcome: Canonical.RequestOutcome,
    finish_wait: Nat, output: Output.Outcome, output_delay: Nat, output_lease: Nat,
    candidate_bytes: Maybe<&2,Nat>, collectors: Maybe<&2,Collector.Profile>}
type Input is Data:
  Edit{at: Nat, bytes: Nat, units: List<&2,Nat>}
  Finish{at: Nat, recurring: Bool}
type Boundary is Data:
  Advance{endpoint: Nat, budget: Nat}
type Scenario is Data:
  Scenario{configuration: Configuration, inputs: List<&2,Input>, boundaries: List<&2,Boundary>}

# Same frozen original input as stop-waiting.test.ts config(8), including
# omitted-output defaults. No issued p/l/r/op/request/receipt is supplied.
def first_waiting() -> Scenario:
  Scenario{Configuration{7n,1n,7,1000n,Ledger.Limits{32n,100000n,16n,50000n},
    TreeFacts.Profile{1n,1n,0n,3n,15n,0n,0n,0n,0n,0n,0n,0n,100n,100n,20n,20n},
    Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n},
    2n,8n,Canonical.RequestClear{},8n,Output.Certain{},0n,30000n,None{},None{}},
    [Edit{0n,10n,[5n]},Finish{3n,False{}}],
    [Advance{3n,100n},Advance{10n,100n},Advance{20n,100n}]}
