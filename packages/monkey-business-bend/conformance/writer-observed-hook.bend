import Base
import ./writer-observed-context.bend as Context
import ./advicee-lifecycle-driver.bend as Edge
import ./sharing-observed-hook.bend as Sharing
import ./sharing-observed-capture.bend as Capture
import ./output-scenario-driver.bend as Output
import ./writer-observed-transport.bend as Originals
import ../Engine.bend as Engine
import ../Driver.bend as Driver
import ../Types.bend as Types
import ../OutputScenario.bend as OutputFacts
import ../../agent-flow-bend/Canonical.bend as C

# The hook is a finite continuation over the actual command tail. It carries
# original factual captures only. Engine handlers own eligibility/reservation.
type Facts is Data:
  Facts{sharing: Sharing.Facts, bindings: List<&2,Originals.Binding>,
    original: Maybe<&2,Originals.Capsule>, issued: Nat, environment: Edge.Environment, payload: Maybe<&2,Context.Payload>}
type Captured is Data:
  Captured{runtime: List<&2,Edge.Runtime>, bindings: List<&2,Originals.Binding>, valid: Bool}

# Original response custody passes only to newly queued non-physical actions.
# No target is derived from current participant state after its departure.
def bind(original: Maybe<&2,Originals.Capsule>, action: Driver.Action, order: Nat,
    bindings: List<&2,Originals.Binding>) -> List<&2,Originals.Binding>:
  match original:
    case Some{Originals.Response{identity}}: Originals.bind_response(action,order,identity,bindings)
    case _: bindings

def sharing_runtime(value: Capture.Captured) -> List<&2,Edge.Runtime>:
  match value:
    case Capture.Captured{runtime,_,_,_}: runtime

def physical_capture(allowed: Bool, event: C.CanonicalEvent, now: Nat, environment: Edge.Environment) -> Maybe<&2,OutputFacts.Capture>:
  match environment:
    case Edge.Environment{_,_,_,_,delay,lease}: Output.authorized_capture(allowed,event,now,delay,lease)

def issued(value: Output.Issued, runtime: List<&2,Edge.Runtime>, bindings: List<&2,Originals.Binding>) -> Captured:
  match value runtime:
    case Output.Issued{state,_} Edge.Runtime{_,queue,jobs,delay} <> Nil{}:
      Captured{[Edge.Runtime{state,queue,jobs,delay}],bindings,True{}}
    case _ runtime: Captured{runtime,bindings,False{}}

def job_partition(job: Edge.Job) -> Nat:
  match job:
    case Edge.Job{partition,_,_,_,_}: partition

def payload_of(+state: Types.State, +action: Driver.Action, available: Bool,
    job: Edge.Job) -> Context.Payload:
  match action:
    case Driver.Action{_,_,_,requested,_}:
      Context.captured(state,action,job_partition(job),Bool.and(available,requested),Context.configured_fallback())

def replaced(equal: Bool, item: Edge.Item, payload: Context.Payload) -> Edge.Item:
  match equal item:
    case True{} Edge.Item{at,order,Edge.Event{action,job}}:
      Edge.Item{at,order,Edge.Event{action,Context.queued(payload,job)}}
    case _ item: item

def queued_context(items: List<&2,Edge.Item>, +order: Nat, +payload: Context.Payload) -> List<&2,Edge.Item>:
  match items:
    case Nil{}: []
    case +item <> tail:
      match item:
        case Edge.Item{_,candidate,_}:
          replaced(Nat.is_eq(order,candidate),item,payload) <> queued_context(tail,order,payload)

def contextual_queue(queue: Edge.Queue, order: Nat, payload: Context.Payload) -> Edge.Queue:
  match queue:
    case Edge.Queue{items,sequence,synced}: Edge.Queue{queued_context(items,order,payload),sequence,synced}

# Reuse the existing exact physical issuer, without an intervention/control.
# The factual authorized-command marker is the same output hook's predicate;
# callbacks retain the original emitted action and scheduler sequence.
def fresh_action(fresh: Bool, +action: Driver.Action, +runtime: List<&2,Edge.Runtime>,
    at: Nat, +order: Nat, +job: Edge.Job, +bindings: List<&2,Originals.Binding>,
    original: Maybe<&2,Originals.Capsule>, allowed: Bool, available: Bool, environment: Edge.Environment) -> Captured:
  match fresh action runtime:
    case True{} Driver.Action{+event,+d,+c,+j,+e} Edge.Runtime{+state,queue,jobs,delay} <> Nil{}:
      +payload=payload_of(state,Driver.Action{event,d,c,j,e},available,job)
      issued(Output.issue_captured(physical_capture(allowed,event,Engine.clock(state),environment),state,order,at,
        Driver.Action{event,d,c,j,e}),[Edge.Runtime{state,contextual_queue(queue,order,payload),jobs,delay}],
        Originals.bind_context(bind(original,Driver.Action{event,d,c,j,e},order,bindings),order,payload))
    case _ _ runtime: Captured{runtime,bindings,True{}}

def fresh(item: Edge.Item, runtime: List<&2,Edge.Runtime>, +cutoff: Nat,
    bindings: List<&2,Originals.Binding>, original: Maybe<&2,Originals.Capsule>, allowed: Bool, available: Bool, environment: Edge.Environment) -> Captured:
  match item:
    case Edge.Item{at,+order,Edge.Event{action,job}}:
      fresh_action(Nat.is_le(cutoff,order),action,runtime,at,order,job,bindings,original,allowed,available,environment)
    case _: Captured{runtime,bindings,True{}}

def continue_capture(value: Captured,
    ih: List<&2,Edge.Runtime> -> List<&2,Originals.Binding> -> Captured) -> Captured:
  match value:
    case Captured{runtime,bindings,True{}}: ih(runtime,bindings)
    case value: value

def capture(items: List<&2,Edge.Item>, runtime: List<&2,Edge.Runtime>, +cutoff: Nat,
    bindings: List<&2,Originals.Binding>, +original: Maybe<&2,Originals.Capsule>, +allowed: Bool, +available: Bool, +environment: Edge.Environment) -> Captured:
  match items:
    case Nil{}: Captured{runtime,bindings,True{}}
    case item <> tail:
      continue_capture(fresh(item,runtime,cutoff,bindings,original,allowed,available,environment),
        next => retained => capture(tail,next,cutoff,retained,original,allowed,available,environment))

def finished(value: Captured, sharing: Sharing.Facts, original: Maybe<&2,Originals.Capsule>,
    previous: Facts, +environment: Edge.Environment, +payload: Maybe<&2,Context.Payload>, ih: Facts -> Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match value:
    case Captured{+runtime,bindings,True{}}:
      (runtime,ih(Facts{sharing,bindings,original,Edge.runtime_sequence(runtime),environment,payload}))
    case Captured{runtime,_,False{}}: (runtime,Edge.HookFault{previous})

def shared_updated(updated: Maybe<&2,Sharing.Facts>, +runtime: List<&2,Edge.Runtime>,
    bindings: List<&2,Originals.Binding>, +original: Maybe<&2,Originals.Capsule>, cutoff: Nat,
    allowed: Bool, available: Bool, previous: Facts, +environment: Edge.Environment, +payload: Maybe<&2,Context.Payload>, ih: Facts -> Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match updated:
    case Some{sharing}:
      finished(capture(Edge.runtime_items(runtime),runtime,cutoff,bindings,original,allowed,available,environment),sharing,original,previous,environment,payload,ih)
    case None{}: (runtime,Edge.HookFault{previous})

def shared(value: Capture.Captured, +facts: Facts, allowed: Bool, available: Bool,
    ih: Facts -> Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match value facts:
    case +value Facts{+sharing,bindings,original,cutoff,environment,payload}:
      shared_updated(Sharing.updated(value,sharing),sharing_runtime(value),bindings,original,cutoff,allowed,available,facts,environment,payload,ih)

def sharing_command(+facts: Sharing.Facts, actual: C.Command, runtime: List<&2,Edge.Runtime>) -> Capture.Captured:
  match facts:
    case Sharing.Facts{_,Nil{},None{},_,_,_}: Sharing.unchanged(runtime,facts)
    case facts: Sharing.command(facts,actual,runtime)

def job_available(found: Maybe<&2,Context.Payload>, command: C.Command) -> Bool:
  match found:
    case Some{Context.Payload{_,has_job,_}}: Bool.or(has_job,Context.operation_job(command))
    case None{}: True{}

def command(+facts: Facts, +actual: C.Command, runtime: List<&2,Edge.Runtime>,
    ih: Facts -> Edge.CommandHook<Facts>) -> List<&2,Edge.Runtime> & Edge.CommandHook<Facts>:
  match facts:
    case Facts{sharing,_,_,_,_,payload}:
      shared(sharing_command(sharing,actual,runtime),facts,Output.authorized(actual),job_available(payload,actual),ih)

def original_handle(original: Maybe<&2,Originals.Capsule>, payload: Maybe<&2,Context.Payload>,
    +state: Types.State, +event: C.CanonicalEvent, +command: C.Command,
    context: Driver.Context) -> Driver.Handled:
  Originals.handle(original,state,event,command,Context.adjust(payload,state,event,command,context))

def factory(list: List<&2,C.Command>, +facts: Facts) -> Edge.CommandHook<Facts>:
  match list facts:
    case Nil{} facts: Edge.HookEnd{facts}
    case _ <> tail Facts{sharing,bindings,+original,issued,environment,+payload}:
      Edge.HookNext{Facts{sharing,bindings,original,issued,environment,payload},
        state => event => command => context => original_handle(original,payload,state,event,command,context),
        current => actual => runtime => command(current,actual,runtime,next => factory(tail,next))}

# Plain original edits retain their existing path. Only original source
# capture data enables the shared capture hook; no prepared key is fabricated.
