import Base
import ./writer-intersection-controls.bend as Inputs
import ./writer-observed-driver.bend as Writer
import ./writer-observed-transport.bend as Originals
import ./sharing-original-captures.bend as Captures
import ./sharing-original-inputs.bend as Sharing
import ./advicee-lifecycle-driver.bend as Edge
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../CollectionScenario.bend as Response
import ../FreshnessScenario.bend as Freshness
import ../../agent-flow-bend/Canonical.bend as C

# The ordinal names an earlier original open publication. It never guesses
# the current response by participant/scope, and supplies no allocated ID.
def opened(frames: List<&2,Writer.Frame>, index: Nat) -> Maybe<&2,Response.Identity>:
  match frames index:
    case Nil{} _: None{}
    case Writer.IntersectionFrame{_,_,_,Inputs.OpenResponse{_,_},_,_,Some{Engine.ResponseResult{_,Some{identity}}},_,_} <> _ 0n: Some{identity}
    case Writer.IntersectionFrame{_,_,_,Inputs.OpenResponse{_,_},_,_,Some{Engine.ResponseResult{_,Some{_}}},_,_} <> tail 1n+rest: opened(tail,rest)
    case _ <> tail index: opened(tail,index)

def frame(+before: Types.State, after: Types.State, input: Inputs.Control,
    response: Maybe<&2,Response.Identity>, member: Maybe<&2,Freshness.Scope>, result: Maybe<&2,Engine.ResponseResult>,
    events: List<&2,C.CanonicalEvent>, applied: Bool, frames: List<&2,Writer.Frame>) -> List<&2,Writer.Frame>:
  List.append(&2,Writer.Frame,frames,[Writer.IntersectionFrame{[before],[after],Engine.clock(before),input,response,member,result,events,applied}])

def response_capsule(target: Maybe<&2,Response.Identity>) -> Maybe<&2,Originals.Capsule>:
  match target:
    case Some{target}: Some{Originals.Response{target}}
    case None{}: None{}


def published(value: Engine.ResponseTransition, +before: Types.State, queue: Edge.Queue,
    jobs: List<&2,Edge.Stored>, delay: Nat, bindings: List<&2,Originals.Binding>, frames: List<&2,Writer.Frame>,
    consumed: Nat, valid: Bool, input: Inputs.Control, +target: Maybe<&2,Response.Identity>, job: Edge.Job) -> Writer.Runtime:
  match value:
    case Engine.ResponseTransition{+state,result,actions}:
      Writer.published(Writer.enqueued(actions,queue,bindings,response_capsule(target),Engine.clock(before),job,state),state,jobs,delay,
        frame(before,state,input,target,None{},Some{result},[],True{},frames),consumed,valid)

def invalid(runtime: Writer.Runtime) -> Writer.Runtime:
  match runtime:
    case Writer.Runtime{runtime,bindings,frames,consumed,_}:
      Writer.Runtime{runtime,bindings,List.append(&2,Writer.Frame,frames,[Writer.InvalidTransport{}]),consumed,False{}}


def attempt(target: Maybe<&2,Response.Identity>, runtime: Writer.Runtime, +input: Inputs.Control, blocked: Bool, job: Edge.Job) -> Writer.Runtime:
  match target runtime:
    case Some{Response.Identity{+id,+p,+l,+r}} Writer.Runtime{Edge.Runtime{+state,queue,jobs,delay} <> Nil{},bindings,frames,consumed,valid}:
      published(Engine.collection_response_attempt(state,id,p,l,r,Engine.clock(state),blocked),state,queue,jobs,delay,bindings,frames,consumed,valid,
        input,Some{Response.Identity{id,p,l,r}},job)
    case _ runtime: invalid(runtime)

def member_selected(equal: Bool, scope: Freshness.Scope, index: Nat,
    ih: Nat -> Maybe<&2,Freshness.Scope>) -> Maybe<&2,Freshness.Scope>:
  match equal index:
    case True{} 0n: Some{scope}
    case True{} 1n+rest: ih(rest)
    case False{} index: ih(index)

def member(frames: List<&2,Writer.Frame>, +partition: Nat, index: Nat) -> Maybe<&2,Freshness.Scope>:
  match frames:
    case Nil{}: None{}
    case Writer.Observed{Edge.CanonicalFrame{_,_,_,_,C.BeginObservedPreparation{+p,l,r,o,_},_,_,_,_,_,_,_},_,_} <> tail:
      member_selected(Nat.is_eq(p,partition),Freshness.Scope{p,l,r,o},index,i => member(tail,partition,i))
    case _ <> tail: member(tail,partition,index)

def departed(value: Engine.SharingDeparture, +before: Types.State, queue: Edge.Queue,
    jobs: List<&2,Edge.Stored>, delay: Nat, bindings: List<&2,Originals.Binding>, frames: List<&2,Writer.Frame>, consumed: Nat, valid: Bool,
    +input: Inputs.Control, +target: Freshness.Scope, job: Edge.Job) -> Writer.Runtime:
  match value:
    case Engine.SharingDeparture{+state,+events,applied}:
      Writer.Runtime{[Edge.Runtime{state,Edge.actions(Engine.sharing_actions(events),queue,Engine.clock(before),job),jobs,delay}],bindings,
        frame(before,state,input,None{},Some{target},None{},events,applied,frames),consumed,valid}

def leave_original(found: Maybe<&2,Captures.Original>, +scope: Freshness.Scope, runtime: Writer.Runtime, input: Inputs.Control) -> Writer.Runtime:
  match found scope runtime:
    case Some{Captures.Original{_,Sharing.Edit{_,_,bytes,units,_,_,_}}} Freshness.Scope{+p,+l,+r,+o}
        Writer.Runtime{Edge.Runtime{+state,queue,jobs,delay} <> Nil{},bindings,frames,consumed,valid}:
      departed(Engine.sharing_leave(state,Freshness.Scope{p,l,r,o}),state,queue,jobs,delay,bindings,frames,consumed,valid,input,
        Freshness.Scope{p,l,r,o},Edge.Job{p,l,bytes,units,Some{C.RequestFinding{}}})
    case _ _ runtime: invalid(runtime)

def leave(scope: Maybe<&2,Freshness.Scope>, originals: List<&2,Captures.Original>, runtime: Writer.Runtime, input: Inputs.Control) -> Writer.Runtime:
  match scope:
    case Some{+scope}: leave_original(Captures.original(originals,scope),scope,runtime,input)
    case None{}: invalid(runtime)

def apply(+input: Inputs.Control, +runtime: Writer.Runtime, +job: Edge.Job, originals: List<&2,Captures.Original>) -> Writer.Runtime:
  match input runtime:
    case Inputs.OpenResponse{_,response} Writer.Runtime{Edge.Runtime{+state,queue,jobs,delay} <> Nil{},bindings,frames,consumed,valid}:
      published(Engine.collection_response_open(state,response),state,queue,jobs,delay,bindings,frames,consumed,valid,input,None{},job)
    case Inputs.AttemptIssuedResponse{_,index,blocked} Writer.Runtime{_,_,+frames,_,_}:
      attempt(opened(frames,index),runtime,input,blocked,job)
    case Inputs.LeaveMember{_,index} Writer.Runtime{_,_,+frames,_,_}:
      leave(member(frames,Edge.job_partition(job),index),originals,runtime,input)
    case Inputs.OutputProfile{_,_} Writer.Runtime{Edge.Runtime{+state,queue,jobs,delay} <> Nil{},bindings,frames,consumed,valid}:
      Writer.Runtime{[Edge.Runtime{state,queue,jobs,delay}],bindings,frame(state,state,input,None{},None{},None{},[],True{},frames),consumed,valid}
    case _ runtime: invalid(runtime)
