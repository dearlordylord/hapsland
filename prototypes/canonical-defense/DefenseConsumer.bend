# Generic shared-engine configuration; no game policy enters the engine.
# Sole workload owner is Monkey Business Session; credentials use actual generation1.
import Base
import ../../packages/monkey-business-bend/OutputScenario.bend as Output
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/Workload.bend as Workload
import ../../packages/monkey-business-bend/Session.bend as Session
import ../../packages/monkey-business-bend/TreeFacts.bend as Tree
import ../../packages/monkey-business-bend/Numeric.bend as Numeric
import ../../packages/agent-flow-bend/ImportGraph.bend as Graph
import ../../packages/agent-flow-bend/Ledger.bend as Ledger

def weights() -> List<&2,Numeric.Words>:
  [Numeric.Words{0n,0n},Numeric.Words{1072693248n,0n},Numeric.Words{1072693248n,0n},Numeric.Words{0n,0n},Numeric.Words{0n,0n},Numeric.Words{0n,0n}]
def credential_generation() -> Nat: 1n
def config() -> T.Config:
  T.Config{Ledger.Limits{32n,480n,16n,480n},
    [T.Advicee{1n,152n,Some{Workload.Profile{Session.Settings{30000,200,4,3000,0,300},152,[97,103,101,110,116,45,49],100n,[10n,20n],None{}}}}],
    T.Environment{3200n,None{},weights(),800n,
      Tree.Profile{1n,3n,2n,2n,0n,0n,0n,10n,0n,0n,0n,0n,4n,8n,3n,6n},
      Graph.Limits{1n,262144n,20480n,8n,1572864n,16n,4n,128n},800n,5000n,True{},True{},credential_generation(),True{},20000n,T.OutputProfile{Output.Certain{},None{}}},None{}}
def seed() -> Nat: 152n
def initial() -> T.State: Run.create(config(),seed())
def boxed(items: List<&2,T.State>) -> T.State:
  match items:
    case value <> _: value
    case Nil{}: initial()
