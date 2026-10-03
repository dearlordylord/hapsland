import Base
import ./stop-original-inputs.bend as Inputs
import ./advicee-lifecycle-driver.bend as Edge
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Advicees.bend as Advicees
import ../../agent-flow-bend/Canonical.bend as Canonical

# Actual advicee allocation precedes original inputs; no issued scope is
# included in the frozen fixture. There is no Background generator here.
type Initialized is Data:
  Initialized{runtime: List<&2,Edge.Runtime>, partition: Maybe<&2,Nat>, valid: Bool}

def original_inputs(list: List<&2,Inputs.Input>, queue: Edge.Queue, +partition: Nat,
    +lifetime: Nat, +wait: Nat, +outcome: Canonical.RequestOutcome) -> Edge.Queue:
  match list:
    case Nil{}: queue
    case Inputs.Edit{at,bytes,units} <> tail:
      original_inputs(tail,Edge.append(queue,at,Edge.Edit{Edge.Job{partition,lifetime,bytes,units,outcome}}),partition,lifetime,wait,outcome)
    case Inputs.Finish{+at,recurring} <> tail:
      original_inputs(tail,Edge.append(queue,at,Edge.FinishIntent{partition,at,Nat.add(at,wait),recurring}),partition,lifetime,wait,outcome)

# The input queue keeps the original order (Edit0 then Finish3) before any
# preparation or Jev callbacks are issued by the actual interpreter.
def initialized(result: Engine.AdviceeDeclared, inputs: List<&2,Inputs.Input>, delay: Nat,
    wait: Nat, outcome: Canonical.RequestOutcome) -> Initialized:
  match result:
    case Engine.AdviceeDeclared{+state,Some{Advicees.Scope{_,+partition,_}},True{}}:
      Initialized{[Edge.Runtime{state,original_inputs(inputs,Edge.Queue{[],0n,0n},partition,
        Edge.life_value(Engine.lifecycle_entry(state,partition)),wait,outcome),[],delay}],Some{partition},True{}}
    case Engine.AdviceeDeclared{state,_,_}:
      Initialized{[Edge.Runtime{state,Edge.Queue{[],0n,0n},[],delay}],None{},False{}}

def scenario(input: Inputs.Scenario) -> Initialized:
  match input:
    case Inputs.Scenario{Inputs.Configuration{seed,identity,agent_seed,_,limits,_,_,_,delay,outcome,wait,_,_,_,_,collectors},inputs,_}:
      initialized(Engine.declare_advicee(Engine.collector_configure(
        Engine.configure_seed(Engine.initial(limits),seed),collectors),identity,agent_seed),inputs,delay,wait,outcome)

def environment(configuration: Inputs.Configuration) -> Edge.Environment:
  match configuration:
    case Inputs.Configuration{seed,_,_,_,_,tree,graph,prep,_,_,_,outcome,delay,lease,bytes,_}:
      Edge.Environment{seed,tree,graph,prep,delay,lease,Some{Edge.StopProfile{outcome,bytes}}}
