import Base
import ./stop-original-inputs.bend as Inputs
import ./stop-observed-wire.bend as Wire
import ./stop-observed-initial.bend as Initial
import ./advicee-lifecycle-driver.bend as Edge
import ./sharing-observed-transport.bend as Transport
import ../Engine.bend as Engine
import ../Scheduler.bend as Scheduler
import ../StopScenario.bend as Stop
import ../../agent-flow-bend/Canonical.bend as C

# Original boundaries call the same factual scheduler/interpreter. The counter
# measures returned public observations, separately from finite transport fuel:
# Finish registration and silent original inputs consume no public event budget.
type Running is Data:
  Running{input: Inputs.Scenario, runtime: List<&2,Edge.Runtime>, issued: Nat,
    frames: List<&2,Wire.Frame>, valid: Bool, observations: Nat}
type Facts is Data:
  Facts{issued: Nat}

def captured_hook(captured: Transport.Captured, ih: Facts -> Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match captured:
    case Transport.Captured{runtime,issued}: (runtime,ih(Facts{issued}))

def capture_command(runtime: List<&2,Edge.Runtime>, facts: Facts,
    ih: Facts -> Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match facts:
    case Facts{issued}: captured_hook(Transport.capture(runtime,issued),ih)

def hook(commands: List<&2,C.Command>, facts: Facts) -> Edge.CommandHook<Facts>:
  match commands:
    case Nil{}: Edge.HookEnd{facts}
    case _ <> rest:
      Edge.HookNext{facts,state => event => command => context => Edge.default_handler(state,event,command,context),
        current => actual => runtime => capture_command(runtime,current,next => hook(rest,next))}

def finish_before(before: List<&2,Edge.Runtime>, provided: Maybe<&2,Nat>) -> Maybe<&2,Stop.Finish>:
  match before provided:
    case Edge.Runtime{state,_,_,_} <> Nil{} Some{p}: Engine.stop_find(state,p)
    case _ _: None{}

def frame_finish(frame: Edge.ObservedFrame) -> Maybe<&2,Stop.Finish>:
  match frame:
    case Edge.FinishFrame{_,_,_,_,_,finish,_,_,_,_,_,_}: finish
    case Edge.CanonicalFrame{_,_,_,_,_,_,before,_,provided,_,_}: finish_before(before,provided)
    case Edge.CacheFrame{_,_,_,_,_,_,_,before,_,provided,_,_}: finish_before(before,provided)
    case Edge.GraphFrame{_,_,_,_,_,_,_,_,before,_,provided,_,_}: finish_before(before,provided)
    case Edge.UnexpectedInput{}: None{}

def consumed(frame: Edge.ObservedFrame) -> Nat:
  match frame:
    case Edge.FinishFrame{_,_,_,_,_,_,_,_,_,_,_,_}: 0n
    case Edge.UnexpectedInput{}: 0n
    case _: 1n

def recorded(+frame: Edge.ObservedFrame, runtime: List<&2,Edge.Runtime>, issued: Nat,
    input: Inputs.Scenario, frames: List<&2,Wire.Frame>, observations: Nat,
    ih: Nat -> Running -> Running) -> Running:
  +used=consumed(frame)
  ih(used,Running{input,runtime,issued,List.append(&2,Wire.Frame,frames,
    [Wire.Observed{frame,frame_finish(frame)}]),True{},Nat.add(observations,used)})

def observed(value: Transport.Stepped<Facts>, input: Inputs.Scenario, frames: List<&2,Wire.Frame>,
    observations: Nat, ih: Nat -> Running -> Running) -> Running:
  match value:
    case Transport.Stepped{Edge.Observed{+runtime,Some{Edge.UnexpectedInput{}},_},_}:
      Running{input,runtime,0n,List.append(&2,Wire.Frame,frames,[Wire.InvalidTransport{runtime}]),False{},observations}
    case Transport.Stepped{Edge.Observed{runtime,Some{frame},Edge.HookEnd{Facts{issued}}},_}:
      recorded(frame,runtime,issued,input,frames,observations,ih)
    case Transport.Stepped{Edge.Observed{runtime,None{},Edge.HookEnd{Facts{issued}}},_}:
      ih(0n,Running{input,runtime,issued,frames,True{},observations})
    case Transport.Stepped{Edge.Observed{+runtime,_,_},_}:
      Running{input,runtime,0n,List.append(&2,Wire.Frame,frames,[Wire.InvalidTransport{runtime}]),False{},observations}

def selected(runtime: List<&2,Edge.Runtime>, issued: Nat, input: Inputs.Scenario,
    frames: List<&2,Wire.Frame>, observations: Nat, environment: Edge.Environment, endpoint: Nat,
    ih: Nat -> Running -> Running) -> Running:
  observed(Transport.step(Facts,runtime,endpoint,environment,commands => hook(commands,Facts{issued})),
    input,frames,observations,ih)

def in_horizon(entries: List<&2,Scheduler.Entry>, endpoint: Nat) -> Bool:
  match entries:
    case Scheduler.Entry{at,_} <> _: Nat.is_le(at,endpoint)
    case Nil{}: False{}

def bounded(within: Bool, fuel: Nat, budget: Nat, running: Running,
    environment: Edge.Environment, endpoint: Nat, ih: Nat -> Running -> Running) -> Running:
  match within fuel budget running:
    case False{} _ _ running: running
    case True{} _ 0n running: running
    case True{} 0n _ Running{input,+runtime,issued,frames,_,observations}:
      Running{input,runtime,issued,List.append(&2,Wire.Frame,frames,[Wire.InvalidTransport{runtime}]),False{},observations}
    case True{} 1n+rest _ Running{input,runtime,issued,frames,True{},observations}:
      selected(runtime,issued,input,frames,observations,environment,endpoint,ih)
    case _ _ _ running: running

def synced(+runtime: List<&2,Edge.Runtime>, issued: Nat, input: Inputs.Scenario,
    frames: List<&2,Wire.Frame>, observations: Nat, fuel: Nat, budget: Nat,
    +environment: Edge.Environment, +endpoint: Nat, ih: Nat -> Running -> Running) -> Running:
  bounded(in_horizon(Edge.runtime_entries(runtime),endpoint),fuel,budget,
    Running{input,runtime,issued,frames,True{},observations},environment,endpoint,ih)

def captured(captured: Transport.Captured, input: Inputs.Scenario, frames: List<&2,Wire.Frame>,
    observations: Nat, fuel: Nat, budget: Nat, environment: Edge.Environment, endpoint: Nat,
    ih: Nat -> Running -> Running) -> Running:
  match captured:
    case Transport.Captured{runtime,issued}:
      synced(Edge.runtime_sync(runtime),issued,input,frames,observations,fuel,budget,environment,endpoint,ih)

def advance(fuel: Nat, +budget: Nat, running: Running, +environment: Edge.Environment, +endpoint: Nat) -> Running:
  match fuel running:
    case 0n Running{input,+runtime,issued,frames,valid,observations}:
      bounded(in_horizon(Edge.runtime_entries(runtime),endpoint),0n,budget,
        Running{input,runtime,issued,frames,valid,observations},environment,endpoint,used => next => next)
    case 1n++rest Running{input,runtime,issued,frames,True{},observations}:
      captured(Transport.capture(runtime,issued),input,frames,observations,1n+rest,budget,environment,endpoint,
        used => next => advance(rest,Nat.sub(budget,used),next,environment,endpoint))
    case _ running: running

def boundary_record(value: Inputs.Boundary, initial: Nat, running: Running) -> Running:
  match running:
    case Running{input,+runtime,issued,frames,valid,+observations}:
      Running{input,runtime,issued,List.append(&2,Wire.Frame,frames,
        [Wire.Boundary{value,Nat.sub(observations,initial),runtime}]),valid,observations}

def boundary(value: Inputs.Boundary, running: Running, environment: Edge.Environment) -> Running:
  match value running:
    case Inputs.Advance{+endpoint,+budget} Running{input,runtime,issued,frames,valid,+observations}:
      boundary_record(Inputs.Advance{endpoint,budget},observations,
        advance(1000n,budget,Running{input,runtime,issued,frames,valid,observations},environment,endpoint))

def boundaries(list: List<&2,Inputs.Boundary>, running: Running, +environment: Edge.Environment) -> Running:
  match list running:
    case Nil{} running: running
    case _ Running{input,runtime,issued,frames,False{},observations}:
      Running{input,runtime,issued,frames,False{},observations}
    case value <> rest running: boundaries(rest,boundary(value,running,environment),environment)

def trace(running: Running) -> Wire.Trace:
  match running:
    case Running{input,runtime,_,frames,valid,_}: Wire.Trace{input,frames,runtime,valid}

def initialized(result: Initial.Initialized, +input: Inputs.Scenario) -> Wire.Trace:
  match result input:
    case Initial.Initialized{runtime,_,valid} Inputs.Scenario{configuration,_,original_boundaries}:
      trace(boundaries(original_boundaries,Running{input,runtime,0n,[],valid,0n},Initial.environment(configuration)))

def scenario(+input: Inputs.Scenario) -> Wire.Trace:
  initialized(Initial.scenario(input),input)

def first() -> Wire.Trace:
  scenario(Inputs.first_waiting())
