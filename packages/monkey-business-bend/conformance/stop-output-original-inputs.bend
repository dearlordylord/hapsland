import Base
import ./stop-original-inputs.bend as Inputs
import ../OutputScenario.bend as Output
import ../Driver.bend as Driver
import ../Numeric.bend as Numeric
import ../TreeFacts.bend as Tree
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/ImportGraph.bend as Graph

# Twelve original #195 cases, before any allocation or physical issuance.
# Exact UTF-8 bytes are supplied scenario facts, not native serialization size.
# Omitted per-edit outcomes and sessions retain their actual public semantics.
def weights() -> List<&2,Numeric.Words>:
  [Numeric.Words{0n,0n},Numeric.Words{1078525952n,0n},Numeric.Words{1078525952n,0n},
   Numeric.Words{0n,0n},Numeric.Words{0n,0n},Numeric.Words{0n,0n}]

def configuration(+seed: Nat, retention: Nat, preparation: Nat, backend: Nat,
    outcome: Output.Outcome, delay: Nat, lease: Nat, bytes: Nat) -> Inputs.Configuration:
  Inputs.Configuration{seed,[Inputs.Advicee{"agent-1",1n,seed,None{}}],retention,
    Ledger.Limits{32n,100000n,16n,50000n},
    Tree.Profile{3n,8n,3n,3n,15n,0n,0n,0n,0n,0n,0n,0n,512n,4096n,256n,2048n},
    Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n},
    preparation,backend,Driver.OutcomeEnvironment{Some{C.RequestFinding{}},weights()},
    50n,outcome,delay,lease,Some{bytes},None{}}

def initial_inputs() -> List<&2,Inputs.Input>:
  [Inputs.Edit{0n,None{},10n,[5n],None{}},Inputs.Finish{1n,None{},False{}}]

def byte_boundary(bytes: Nat) -> Inputs.Scenario:
  Inputs.Scenario{configuration(7n,1000n,2n,5n,Output.Uncertain{},5n,20n,bytes),initial_inputs(),
    [Inputs.Advance{7n,300n},Inputs.Advance{20n,300n}]}

def provisional_release() -> Inputs.Scenario:
  Inputs.Scenario{configuration(7n,1000n,2n,5n,Output.Failed{},5n,20n,10240n),initial_inputs(),
    [Inputs.Advance{7n,300n},Inputs.Advance{12n,300n}]}

def mismatched_members() -> Inputs.Scenario:
  Inputs.Scenario{configuration(7n,1000n,2n,5n,Output.Uncertain{},5n,20n,10240n),initial_inputs(),
    [Inputs.Advance{7n,300n},Inputs.MismatchedTerminal{8n,None{}},Inputs.Advance{8n,300n},Inputs.Advance{12n,300n}]}

def endpoint(outcome: Output.Outcome, delay: Nat, lease: Nat, ready: Nat) -> Nat:
  match outcome:
    case Output.Failed{}: Nat.add(ready,delay)
    case _: Nat.add(ready,Nat.min(delay,lease))

def campaign_boundaries(ready: Nat, +terminal: Nat) -> List<&2,Inputs.Boundary>:
  [Inputs.Advance{ready,500n},Inputs.OutputProfile{Output.Certain{},1n,1n},
   Inputs.Advance{Nat.sub(terminal,1n),500n},Inputs.Advance{terminal,500n}]

def campaign(seed: Nat, +preparation: Nat, +backend: Nat, +outcome: Output.Outcome, +delay: Nat, +lease: Nat) -> Inputs.Scenario:
  Inputs.Scenario{configuration(seed,10000n,preparation,backend,outcome,delay,lease,10240n),initial_inputs(),
    campaign_boundaries(Nat.add(preparation,backend),endpoint(outcome,delay,lease,Nat.add(preparation,backend)))}

def continuation_budget() -> Inputs.Scenario:
  Inputs.Scenario{configuration(91001n,10000n,2n,5n,Output.Uncertain{},5n,30n,10240n),
    [Inputs.Edit{0n,None{},10n,[5n],None{}},Inputs.Finish{1n,None{},False{}},
     Inputs.Edit{40n,None{},10n,[5n],None{}},Inputs.Finish{41n,None{},False{}},
     Inputs.Edit{80n,None{},10n,[5n],None{}},Inputs.Finish{81n,None{},False{}},
     Inputs.Edit{120n,None{},10n,[5n],None{}},Inputs.Finish{121n,None{},False{}},
     Inputs.Edit{160n,None{},10n,[5n],None{}},Inputs.Finish{161n,None{},False{}}],
    [Inputs.Advance{7n,500n},Inputs.Advance{12n,500n},Inputs.Advance{47n,500n},Inputs.Advance{52n,500n},
     Inputs.Advance{87n,500n},Inputs.Advance{92n,500n},Inputs.Advance{127n,500n},Inputs.Advance{132n,500n},
     Inputs.Advance{161n,500n},Inputs.Advance{167n,500n},Inputs.Advance{172n,500n}]}

def cases() -> List<&2,Inputs.Scenario>:
  [byte_boundary(10239n),byte_boundary(10240n),byte_boundary(10241n),provisional_release(),mismatched_members(),
   campaign(7n,2n,5n,Output.Uncertain{},5n,30n),campaign(91001n,3n,7n,Output.Failed{},6n,30n),
   campaign(Nat.add(4294967295n,18n),1n,9n,Output.Uncertain{},4n,30n),campaign(11n,2n,5n,Output.Certain{},4n,5n),
   campaign(12n,2n,5n,Output.Certain{},5n,5n),campaign(13n,2n,5n,Output.Certain{},6n,5n),continuation_budget()]
