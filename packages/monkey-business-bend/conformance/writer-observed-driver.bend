import Base
import ./writer-observed-context.bend as Context
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../WriterScenario.bend as Writer
import ../CollectionScenario.bend as Response
import ../../agent-flow-bend/Canonical.bend as C
import ./advicee-lifecycle-driver.bend as Edge
import ./writer-observed-transport.bend as Originals
import ../Callbacks.bend as Callbacks
import ../AdviceeLifecycle.bend as Lifecycle
import ../AdviceeLifecycleCleanup.bend as Cleanup
import ../Workload.bend as Workload
import ./writer-intersection-controls.bend as Intersection
import ../FreshnessScenario.bend as Freshness

# Writer controls retain actual full states/reports and immutable original
# queue capsules. Events/commands/rejections/graph observations are Edge frames;
# no event-kind selection or milestone coding is part of this transport.
type Control is Data:
  Claim{agent: String, facts: Writer.ClaimFacts}
  Attempt{agent: String, target: Writer.Target, blocked: Bool}
  Release{agent: String, target: Writer.Target}
  Expire{agent: String, target: Writer.Target}
type Report is Data:
  Queued{}
  RefusedScope{}
  OwnerResult{value: Engine.ResponseResult, target: Maybe<&2,Response.Identity>}
type Frame is Data:
  ControlFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    input: Control, pending: Maybe<&2,Writer.Pending>, report: Report, order: Maybe<&2,Nat>}
  GrantFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    original: Writer.Pending, event: C.CanonicalEvent, result: C.Step, report: Engine.ResponseResult, order: Nat}
  Observed{frame: Edge.ObservedFrame, receipt: Maybe<&2,Callbacks.Target>,
    scopes: Maybe<&2,List<&2,Maybe<&2,Nat>>>}
  Boundary{endpoint: Nat, budget: Nat, consumed: Nat, state: List<&2,Types.State>}
  LifecycleFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    agent: String, partition: Nat, action: Lifecycle.Action, changed: Lifecycle.Changed,
    cleanup: Cleanup.CleanupPlan, emissions: List<&2,Workload.Emission>}
  IntersectionFrame{before: List<&2,Types.State>, after: List<&2,Types.State>, time: Nat,
    input: Intersection.Control, response: Maybe<&2,Response.Identity>, member: Maybe<&2,Freshness.Scope>,
    result: Maybe<&2,Engine.ResponseResult>, events: List<&2,C.CanonicalEvent>, applied: Bool}
  InvalidTransport{}
type Runtime is Data:
  Runtime{runtime: List<&2,Edge.Runtime>, bindings: List<&2,Originals.Binding>,
    frames: List<&2,Frame>, consumed: Nat, valid: Bool}

# One action/order association, at the actual append boundary. This is payload
# custody only; Engine already supplied the complete validated action list.
def action_binding(capsule: Maybe<&2,Originals.Capsule>, action: Driver.Action,
    order: Nat, rest: List<&2,Originals.Binding>) -> List<&2,Originals.Binding>:
  match capsule:
    case Some{Originals.Response{identity}}: Originals.bind_response(action,order,identity,rest)
    case Some{capsule}: List.append(&2,Originals.Binding,rest,[Originals.Binding{order,capsule}])
    case None{}: rest

def job_partition(job: Edge.Job) -> Nat:
  match job:
    case Edge.Job{partition,_,_,_,_}: partition
    case Edge.NoJob{partition,_}: partition

def enqueued(list: List<&2,Driver.Action>, queue: Edge.Queue,
    bindings: List<&2,Originals.Binding>, +capsule: Maybe<&2,Originals.Capsule>,
    +now: Nat, +job: Edge.Job, +state: Types.State) -> Edge.Queue & List<&2,Originals.Binding>:
  match list queue:
    case Nil{} queue: (queue,bindings)
    case +action <> tail Edge.Queue{items,+sequence,synced}:
      +payload=Context.captured(state,action,job_partition(job),False{})
      enqueued(tail,Edge.actions([action],Edge.Queue{items,sequence,synced},now,Context.queued(payload,job)),
        Originals.bind_context(action_binding(capsule,action,sequence,bindings),sequence,payload),capsule,now,job,state)

def queue_order(queue: Edge.Queue) -> Maybe<&2,Nat>:
  match queue:
    case Edge.Queue{_,sequence,_}: Some{sequence}

def report(input: Control, pending: Maybe<&2,Writer.Pending>, value: Report,
    +before: Types.State, +after: Types.State, frames: List<&2,Frame>, order: Maybe<&2,Nat>) -> List<&2,Frame>:
  List.append(&2,Frame,frames,[ControlFrame{[before],[after],Engine.clock(before),input,pending,value,order}])

def published(pair: Edge.Queue & List<&2,Originals.Binding>, state: Types.State,
    jobs: List<&2,Edge.Stored>, delay: Nat, frames: List<&2,Frame>, consumed: Nat,
    valid: Bool) -> Runtime:
  match pair:
    case (queue,bindings): Runtime{[Edge.Runtime{state,queue,jobs,delay}],bindings,frames,consumed,valid}

def prepared(value: Engine.WriterPrepared, +before: Types.State, +queue: Edge.Queue,
    jobs: List<&2,Edge.Stored>, delay: Nat, bindings: List<&2,Originals.Binding>,
    frames: List<&2,Frame>, consumed: Nat, valid: Bool, +input: Control, job: Edge.Job) -> Runtime:
  match value:
    case Engine.WriterPrepared{+state,Some{+pending},actions}:
      published(enqueued(actions,queue,bindings,Some{Originals.Pending{pending}},Engine.clock(before),job,state),state,jobs,delay,
        report(input,Some{pending},Queued{},before,state,frames,queue_order(queue)),consumed,valid)
    case Engine.WriterPrepared{+state,None{},actions}:
      published(enqueued(actions,queue,bindings,None{},Engine.clock(before),job,state),state,jobs,delay,
        report(input,None{},RefusedScope{},before,state,frames,queue_order(queue)),consumed,valid)

def attempted(value: Engine.WriterAttempt, +before: Types.State, +queue: Edge.Queue,
    jobs: List<&2,Edge.Stored>, delay: Nat, bindings: List<&2,Originals.Binding>,
    frames: List<&2,Frame>, consumed: Nat, valid: Bool, input: Control, job: Edge.Job) -> Runtime:
  match value:
    case Engine.WriterAttempt{Engine.ResponseTransition{+state,+result,actions},Some{+identity}}:
      published(enqueued(actions,queue,bindings,Some{Originals.Response{identity}},Engine.clock(before),job,state),state,jobs,delay,
        report(input,None{},OwnerResult{result,Some{identity}},before,state,frames,queue_order(queue)),consumed,valid)
    case Engine.WriterAttempt{Engine.ResponseTransition{+state,+result,actions},None{}}:
      published(enqueued(actions,queue,bindings,None{},Engine.clock(before),job,state),state,jobs,delay,
        report(input,None{},OwnerResult{result,None{}},before,state,frames,queue_order(queue)),consumed,valid)

def release_capsule(value: Maybe<&2,Writer.Capture>) -> Maybe<&2,Originals.Capsule>:
  match value:
    case Some{capture}: Some{Originals.Release{capture}}
    case None{}: None{}

def release_report(events: List<&2,C.CanonicalEvent>) -> Report:
  match events:
    case Nil{}: OwnerResult{Engine.ResponseResult{Response.Missing{},None{}},None{}}
    case _ <> _: Queued{}

def released(+state: Types.State, +queue: Edge.Queue, jobs: List<&2,Edge.Stored>, delay: Nat,
    bindings: List<&2,Originals.Binding>, frames: List<&2,Frame>, consumed: Nat, valid: Bool,
    input: Control, target: Writer.Target, +events: List<&2,C.CanonicalEvent>, job: Edge.Job) -> Runtime:
  published(enqueued(Engine.sharing_actions(events),queue,bindings,release_capsule(Engine.writer_capture(state,target)),Engine.clock(state),job,state),
    state,jobs,delay,report(input,None{},release_report(events),state,state,frames,queue_order(queue)),consumed,valid)

def apply(+input: Control, runtime: Runtime, job: Edge.Job) -> Runtime:
  match input runtime:
    case Claim{_,facts} Runtime{Edge.Runtime{+state,queue,jobs,delay} <> Nil{},bindings,frames,consumed,valid}:
      prepared(Engine.writer_prepare(state,facts),state,queue,jobs,delay,bindings,frames,consumed,valid,input,job)
    case Attempt{_,target,blocked} Runtime{Edge.Runtime{+state,queue,jobs,delay} <> Nil{},bindings,frames,consumed,valid}:
      attempted(Engine.writer_attempt(state,target,Engine.clock(state),blocked),state,queue,jobs,delay,bindings,frames,consumed,valid,input,job)
    case Release{_,+target} Runtime{Edge.Runtime{+state,queue,jobs,delay} <> Nil{},bindings,frames,consumed,valid}:
      released(state,queue,jobs,delay,bindings,frames,consumed,valid,input,target,Engine.writer_release(state,target),job)
    case Expire{_,+target} Runtime{Edge.Runtime{+state,queue,jobs,delay} <> Nil{},bindings,frames,consumed,valid}:
      released(state,queue,jobs,delay,bindings,frames,consumed,valid,input,target,Engine.writer_expire(state,target,Engine.clock(state)),job)
    case _ Runtime{runtime,bindings,frames,consumed,_}:
      Runtime{runtime,bindings,List.append(&2,Frame,frames,[InvalidTransport{}]),consumed,False{}}
