import Base
import ../OutputScenario.bend as Output
import ../Driver.bend as Driver
import ./advicee-lifecycle-driver.bend as Edge
import ../TreeFacts.bend as TreeFacts
import ../CollectorScenario.bend as Collector
import ../Workload.bend as Workload
import ../Session.bend as Session
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/ImportGraph.bend as Graph

# Original caller facts, before any Canonical allocation or physical issuance.
# Expected decisions live in independent public assertions, not in these inputs.
type Advicee is Data:
  Advicee{agent: String, identity: Nat, agent_seed: Nat, workload: Maybe<&2,Workload.Profile>}
type Configuration is Data:
  Configuration{seed: Nat, advicees: List<&2,Advicee>, retention: Nat,
    limits: Ledger.Limits, tree: TreeFacts.Profile, graph: Graph.Limits,
    preparation_delay: Nat, jev_delay: Nat, outcomes: Driver.OutcomeEnvironment,
    finish_wait: Nat, output: Output.Outcome, output_delay: Nat, output_lease: Nat,
    candidate_bytes: Maybe<&2,Nat>, collectors: Maybe<&2,Collector.Profile>}
type Input is Data:
  Edit{at: Nat, agent: Maybe<&2,String>, bytes: Nat, units: List<&2,Nat>, outcome: Maybe<&2,Canonical.RequestOutcome>}
  Finish{at: Nat, agent: Maybe<&2,String>, recurring: Bool}
  CanonicalInput{at: Nat, event: Canonical.CanonicalEvent}
type Boundary is Data:
  OutputProfile{outcome: Output.Outcome, delay: Nat, lease: Nat}
  MismatchedTerminal{at: Nat, agent: Maybe<&2,String>}
  Advance{endpoint: Nat, budget: Nat}
  Schedule{input: Input}
type Scenario is Data:
  Scenario{configuration: Configuration, inputs: List<&2,Input>, boundaries: List<&2,Boundary>}

# Same frozen original input as stop-waiting.test.ts config(8), including
# omitted-output defaults. No issued p/l/r/op/request/receipt is supplied.
def waiting_configuration(delay: Nat, preparation: Nat, wait: Nat) -> Configuration:
  Configuration{7n,[Advicee{"agent-1",1n,7n,None{}}],1000n,Ledger.Limits{32n,100000n,16n,50000n},TreeFacts.Profile{1n,1n,0n,3n,15n,0n,0n,0n,0n,0n,0n,0n,100n,100n,20n,20n},Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n},preparation,delay,Edge.outcome_environment(Some{Canonical.RequestClear{}}),wait,Output.Certain{},0n,30000n,None{},None{}}

# Original Jev boundaries: before, equal to, and after the captured cutoff11.
def waiting(delay: Nat, decision: Nat) -> Scenario:
  Scenario{waiting_configuration(delay,2n,8n),
    [Edit{0n,None{},10n,[5n],None{}},Finish{3n,None{},False{}}],
    [Advance{3n,100n},Advance{decision,100n},Advance{20n,100n}]}

def first_waiting() -> Scenario:
  waiting(8n,10n)

def equal_waiting() -> Scenario:
  waiting(9n,11n)

def late_waiting() -> Scenario:
  waiting(10n,11n)

def late_preparation() -> Scenario:
  Scenario{waiting_configuration(1n,12n,2n),
    [Edit{0n,None{},10n,[5n],None{}},Finish{1n,None{},False{}}],
    [Advance{1n,100n},Advance{3n,100n},Advance{20n,100n}]}

# Caller Finish without an Edit cannot allocate an artificial round. Both
# inputs are removed by actual transport with no public observation charge.
def no_round() -> Scenario:
  Scenario{waiting_configuration(8n,2n,8n),
    [Finish{0n,None{},False{}},Finish{1n,None{},False{}}],
    [Advance{0n,1n},Advance{1n,1n}]}

# The second same-time Finish encounters the original active capture. It must
# not create another attempt, poll, observation, or effective budget charge.
def repeated_finish() -> Scenario:
  Scenario{waiting_configuration(8n,2n,8n),
    [Edit{0n,None{},10n,[5n],None{}},Finish{3n,None{},False{}},Finish{3n,None{},False{}}],
    [Advance{3n,100n},Advance{10n,100n},Advance{20n,100n}]}

# Frozen profile from the original Background directed fixture. Defaults for
# pause/response/repair/bytes are explicit here; generation remains the owner.
def background_profile() -> Workload.Profile:
  Workload.Profile{Session.Settings{1000000,0,1000,500,0,300},7,
    [97,103,101,110,116,45,49],100n,[100n],None{}}

def background(outcome: Output.Outcome) -> Scenario:
  Scenario{Configuration{7n,[Advicee{"agent-1",1n,7n,Some{background_profile()}}],1000n,Ledger.Limits{32n,100000n,16n,50000n},TreeFacts.Profile{1n,1n,0n,3n,15n,0n,0n,0n,0n,0n,0n,0n,100n,100n,20n,20n},Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n},2n,5n,Edge.outcome_environment(Some{Canonical.RequestFinding{}}),10n,outcome,9n,20n,None{},None{}},
    [Edit{0n,None{},10n,[5n],None{}},Finish{8n,None{},False{}}],
    [Advance{7n,100n},Advance{8n,100n},Advance{16n,100n},Advance{40n,100n}]}

# Same genuine configured stream as Background, but no Edit has opened a round.
# Its original recurring Finish delegates actual Workload.Next, not Finished.
def configured_no_round() -> Scenario:
  Scenario{Configuration{7n,[Advicee{"agent-1",1n,7n,Some{background_profile()}}],1000n,Ledger.Limits{32n,100000n,16n,50000n},TreeFacts.Profile{1n,1n,0n,3n,15n,0n,0n,0n,0n,0n,0n,0n,100n,100n,20n,20n},Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n},2n,8n,Edge.outcome_environment(Some{Canonical.RequestClear{}}),8n,Output.Certain{},0n,30000n,None{},None{}},
    [Finish{0n,None{},True{}}],[Advance{0n,1n},Advance{1n,1n}]}

# Original group polls are enqueued by the caller only after observing the
# genuine authorized Background submission at7. Their scopes are caller facts.
def group_output() -> Scenario:
  Scenario{Configuration{7n,[Advicee{"agent-1",1n,7n,Some{background_profile()}}],1000n,Ledger.Limits{32n,100000n,16n,50000n},TreeFacts.Profile{1n,1n,0n,3n,15n,0n,0n,0n,0n,0n,0n,0n,100n,100n,20n,20n},Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n},2n,5n,Edge.outcome_environment(None{}),200n,Output.Certain{},9n,20n,None{},None{}},
    [Edit{0n,None{},10n,[5n],Some{Canonical.RequestFinding{}}}],
    [Advance{7n,100n},
      Schedule{CanonicalInput{8n,Canonical.StopGroupPolled{1n,1n,1n,[Canonical.StopScope{1n,1n}],False{},False{},0n}}},
      Advance{8n,100n},
      Schedule{CanonicalInput{9n,Canonical.StopGroupPolled{1n,1n,1n,[Canonical.StopScope{1n,1n}],True{},False{},0n}}},
      Advance{9n,100n},Advance{20n,100n}]}

# Original independent advicees and seeds; the omitted global outcome remains
# the genuine default sampler, while the two explicit edit outcomes draw none.
def two_profile(seed: U32, codes: List<&2,U32>) -> Workload.Profile:
  Workload.Profile{Session.Settings{1000000,0,1000,500,0,300},seed,codes,100n,[100n],None{}}

def other_advicee_output() -> Scenario:
  Scenario{Configuration{7n,
    [Advicee{"a",1n,7n,Some{two_profile(7,[97])}},
     Advicee{"b",2n,2654435768n,Some{two_profile(2654435768,[98])}}],1000n,
    Ledger.Limits{32n,100000n,16n,50000n},
    TreeFacts.Profile{1n,1n,0n,3n,15n,0n,0n,0n,0n,0n,0n,0n,100n,100n,20n,20n},
    Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n},2n,5n,
    Edge.outcome_environment(None{}),10n,Output.Certain{},9n,20n,None{},None{}},
    [Edit{0n,Some{"a"},10n,[5n],Some{Canonical.RequestClear{}}},
     Edit{0n,Some{"b"},10n,[5n],Some{Canonical.RequestFinding{}}},Finish{8n,Some{"a"},False{}}],
    [Advance{7n,200n},Advance{8n,200n},Advance{20n,200n}]}
