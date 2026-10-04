import Base
import ./writer-original-inputs.bend as Inputs
import ./writer-original-cases.bend as Cases
import ./writer-observed-program.bend as Writer
import ./writer-observed-initial.bend as WriterInitial
import ./writer-observed-wire.bend as Wire
import ./sharing-observed-initial.bend as Initial
import ./sharing-original-inputs.bend as Shared
import ./writer-intersection-controls.bend as Controls
import ./advicee-lifecycle-driver.bend as Edge
import ./callback-native-codec.bend as Codec
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Advicees.bend as Advicees
import ../CollectionScenario.bend as Response
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/Ledger.bend as Ledger

# Exactly the five original response cases: no continuous workload is installed.
# Controls name the returned open identity by publication ordinal, not guessed ID.
def configuration() -> Shared.Configuration:
  Shared.Configuration{1n,Ledger.Limits{32n,100000n,16n,50000n},1000n,[],Cases.tree(False{}),Shared.graph_limits(),2n,0n,30000n,0n,0n,Edge.outcome_environment(None{})}

def deadline(mode: Nat) -> Nat:
  match mode:
    case 2n: 7n
    case _: 20n

def admitted(mode: Nat) -> Bool:
  Nat.is_eq(mode,4n)

def closed(mode: Nat) -> List<&2,Inputs.Boundary>:
  match mode:
    case 1n: [Inputs.IntersectionControl{Controls.CloseIssuedResponse{"agent-1",0n}}]
    case _: []

def attempted(mode: Nat) -> Controls.Control:
  match mode:
    case 3n: Controls.AttemptIssuedResponseScope{"agent-1",0n,2n,False{}}
    case _: Controls.AttemptIssuedResponse{"agent-1",0n,False{}}

def original(+mode: Nat) -> Inputs.Scenario:
  Inputs.Scenario{configuration(),[Inputs.Edit{"agent-1",0n,10n,[5n],Some{C.RequestFinding{}}}],5n,
    List.append(&2,Inputs.Boundary,[Inputs.Advance{0n,1000n},
      Inputs.IntersectionControl{Controls.OpenResponse{"agent-1",Response.Response{1n,1n,1n,0n,deadline(mode),admitted(mode)}}},
      Inputs.Advance{6n,1000n},Inputs.Advance{7n,1000n}],
      List.append(&2,Inputs.Boundary,closed(mode),[Inputs.IntersectionControl{attempted(mode)},Inputs.Advance{8n,1000n}]))}

def declared(result: Engine.AdviceeDeclared, edits: List<&2,Inputs.Edit>) -> Initial.Initialized:
  match result:
    case Engine.AdviceeDeclared{state,Some{Advicees.Scope{_,p,_}},True{}}:
      WriterInitial.edits(edits,Initial.Initialized{[Edge.Runtime{state,Edge.Queue{[],0n,0n},[],5n}],
        [Initial.Agent{"agent-1",p,1n}],[],True{}})
    case Engine.AdviceeDeclared{state,_,_}:
      Initial.Initialized{[Edge.Runtime{state,Edge.Queue{[],0n,0n},[],5n}],[],[],False{}}

def observed(+input: Inputs.Scenario) -> Wire.Envelope:
  match input:
    case Inputs.Scenario{+config,+edits,delay,bounds}:
      Wire.Envelope{input,Writer.boundaries(bounds,
        Writer.initialized(declared(Engine.declare_advicee(
          Engine.configure_seed(Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),1n),1n,1n),edits),edits),Initial.environment(config))}

def scenarios(modes: List<&2,Nat>, acc: List<&2,Wire.Envelope>) -> List<&2,Wire.Envelope>:
  match modes:
    case Nil{}: List.reverse(&2,Wire.Envelope,acc)
    case mode <> tail: scenarios(tail,observed(original(mode)) <> acc)

def json() -> String:
  Codec.render(Codec.writer_scenarios(scenarios([0n,1n,2n,3n,4n],[]),[]))

def main() -> IO(Unit):
  IO.print(json())
