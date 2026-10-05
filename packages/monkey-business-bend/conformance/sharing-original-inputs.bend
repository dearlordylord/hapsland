import Base
import ../Workload.bend as Workload
import ../Driver.bend as Driver
import ../../agent-flow-bend/Canonical.bend as C
import ./advicee-lifecycle-driver.bend as Edge
import ../Session.bend as Session
import ../TreeFacts.bend as TreeFacts
import ../../agent-flow-bend/ImportGraph.bend as Graph
import ../../agent-flow-bend/Ledger.bend as Ledger

# Original public input facts only. These labels supply no routing, freshness,
# membership or request policy; the actual shared Engine owns those decisions.
type Namespace is Data:
  Namespace{partition: String, work: Maybe<&2,String>, credential: Maybe<&2,Nat>, prepared: String}
type Edit is Data:
  Edit{agent: String, at: Nat, bytes: Nat, units: List<&2,Nat>, subject: String, input: String, namespace: Namespace, outcome: Maybe<&2,C.RequestOutcome>}
type Case is Data:
  Baseline{}
  JoinedLeaves{}
  OwnerLeaves{}
  OtherPartition{}
  AllLeave{}
  JoinAdvice{}
  SupersededMember{}
type Boundary is Data:
  Advance{endpoint: Nat, budget: Nat}
  Leave{agent: String, admission_index: Nat}
  LeaveAll{agent: String}
type SessionInput is Data:
  SessionInput{agent: String, identity: Nat, profile: Workload.Profile}
type Configuration is Data:
  Configuration{seed: Nat, limits: Ledger.Limits, retention: Nat,
    sessions: List<&2,SessionInput>, tree: TreeFacts.Profile, graph: Graph.Limits,
    preparation_delay: Nat, output_delay: Nat, output_lease: Nat,
    reuse_entries: Nat, reuse_bytes: Nat, outcomes: Driver.OutcomeEnvironment}
type Scenario is Data:
  Scenario{configuration: Configuration, edits: List<&2,Edit>, jev_delay: Nat, boundaries: List<&2,Boundary>}

# Exact original configs: the first six native cases always declare both a/b;
# the superseded-member public case declares only a and uses public defaults.
def graph_limits() -> Graph.Limits:
  Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n}
def native_configuration() -> Configuration:
  Configuration{7n,Ledger.Limits{32n,100000n,16n,50000n},3000n,[SessionInput{"a",1n,Workload.Profile{Session.Settings{1000,0,100,1000,0,300},11,[97],100n,[100n],None{}}},
     SessionInput{"b",2n,Workload.Profile{Session.Settings{1000,0,100,1000,0,300},12,[98],100n,[100n],None{}}}],TreeFacts.Profile{1n,1n,0n,3n,15n,0n,0n,0n,0n,0n,0n,0n,100n,100n,20n,20n},graph_limits(),2n,0n,30000n,8n,1n,Edge.outcome_environment(Some{C.RequestFinding{}})}
def superseded_configuration() -> Configuration:
  Configuration{1n,Ledger.Limits{32n,100000n,16n,50000n},3000n,[SessionInput{"a",1n,Workload.Profile{Session.Settings{1000000,0,1000,500,0,300},11,[97],10n,[5n],None{}}}],TreeFacts.Profile{3n,8n,3n,3n,15n,0n,0n,0n,0n,0n,0n,0n,512n,4096n,256n,2048n},graph_limits(),2n,0n,30000n,8n,1n,Edge.outcome_environment(Some{C.RequestFinding{}})}

def edit(+agent: String, at: Nat, prepared: String, subject: String, input: String) -> Edit:
  Edit{agent,at,10n,[5n],subject,input,Namespace{agent,None{},None{},prepared},None{}}
def original(agent: String, at: Nat) -> Edit:
  edit(agent,at,"same-prepared-identity","same-subject","same-input")
def through(control: Boundary) -> List<&2,Boundary>:
  [Advance{2n,600n},control,Advance{3n,200n},Advance{33n,1000n}]
def original_case(value: Case) -> Scenario:
  match value:
    case Baseline{}: Scenario{native_configuration(),[original("a",0n),original("a",0n)],30n,[Advance{2n,600n},Advance{3n,200n},Advance{33n,1000n}]}
    case JoinedLeaves{}: Scenario{native_configuration(),[original("a",0n),original("a",0n)],30n,through(Leave{"a",1n})}
    case OwnerLeaves{}: Scenario{native_configuration(),[original("a",0n),original("a",0n)],30n,through(Leave{"a",0n})}
    case OtherPartition{}: Scenario{native_configuration(),[original("a",0n),original("a",0n),original("b",0n)],30n,through(LeaveAll{"a"})}
    case AllLeave{}: Scenario{native_configuration(),[original("a",0n),original("a",0n)],30n,through(LeaveAll{"a"})}
    case JoinAdvice{}: Scenario{native_configuration(),[original("a",0n),original("a",10n)],5n,[Advance{2n,600n},Advance{3n,200n},Advance{33n,1000n}]}
    case SupersededMember{}:
      Scenario{superseded_configuration(),[edit("a",0n,"shared","owner-subject","owner-input"),edit("a",0n,"shared","member-subject","old"),edit("a",3n,"changed","member-subject","new")],30n,[Advance{2n,500n},Advance{33n,800n}]}
