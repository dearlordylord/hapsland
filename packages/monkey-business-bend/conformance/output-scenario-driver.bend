import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../OutputScenario.bend as Output
import ../OutputCompletion.bend as Completion
import ../Scheduler.bend as Scheduler
import ../../agent-flow-bend/Canonical.bend as Canonical
import ../../agent-flow-bend/Ledger.bend as Ledger
import ./advicee-lifecycle-driver.bend as Edge

# Uses the existing factual graph/job edge, not a second execution engine.
# Only output environmental completions replace the edge's default healthy write.
def generated(event: Canonical.CanonicalEvent, queue: Edge.Queue, +now: Nat,
    job: Edge.Job, outcome: Output.Outcome, delay: Nat, lease: Nat) -> Edge.Queue:
  match event:
    case Canonical.SubmissionBegin{advice,_,_,token,_,True{},_,_}:
      Edge.actions(Completion.rewrite_actions(Output.issued(Output.Capture{Output.Individual{advice,token},now,Output.Certain{},delay,lease}),
        Output.Capture{Output.Individual{advice,token},now,Output.Certain{},delay,lease},outcome,now),queue,now,job)
    case Canonical.SubmissionAuthorize{advice,token}:
      Edge.actions(Completion.rewrite_actions(Output.issued(Output.Capture{Output.Individual{advice,token},now,Output.Certain{},delay,lease}),
        Output.Capture{Output.Individual{advice,token},now,Output.Certain{},delay,lease},outcome,now),queue,now,job)
    case _: queue

def commands(list: List<&2,Canonical.Command>, runtime: Edge.Runtime, +event: Canonical.CanonicalEvent,
    +now: Nat, +job: Edge.Job, +candidate: Maybe<&2,Driver.Candidate>, +outcome: Output.Outcome, +delay: Nat, +lease: Nat) -> Edge.Runtime:
  match list runtime:
    case Nil{} runtime: runtime
    case Canonical.SubmissionBegun{} <> tail Edge.Runtime{state,queue,jobs,jev_delay}:
      commands(tail,Edge.Runtime{state,generated(event,queue,now,job,outcome,delay,lease),jobs,jev_delay},event,now,job,candidate,outcome,delay,lease)
    case Canonical.SubmissionAuthorized{} <> tail Edge.Runtime{state,queue,jobs,jev_delay}:
      commands(tail,Edge.Runtime{state,generated(event,queue,now,job,outcome,delay,lease),jobs,jev_delay},event,now,job,candidate,outcome,delay,lease)
    case head <> tail Edge.Runtime{state,queue,jobs,jev_delay}:
      Edge.command_step(head,state,event,queue,jobs,now,job,jev_delay,candidate,
        next => commands(tail,next,event,now,job,candidate,outcome,delay,lease))

def code(event: Canonical.CanonicalEvent) -> Nat:
  match event:
    case Canonical.SubmissionRelease{_,_}: 40n
    case Canonical.SubmissionExpiryCheck{_,_,_,_}: 41n
    case Canonical.DeliveryAcknowledgeCheck{_,_}: 42n
    case _: Edge.event_code(event)

def row(+before: Types.State, +state: Types.State, +event: Canonical.CanonicalEvent, now: Nat, rejected: Nat) -> List<&2,Nat>:
  code(event) <> now <> rejected <> Edge.state_counts(Engine.canonical(state))

def continued(runtime: Edge.Runtime, +before: Types.State, +event: Canonical.CanonicalEvent,
    +job: Edge.Job, +now: Nat, ih: Edge.Runtime -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match runtime:
    case Edge.Runtime{+state,queue,jobs,delay}: row(before,state,event,now,0n) <>
      ih(Edge.Runtime{state,Edge.actions(Engine.after(before,state,event),queue,now,job),jobs,delay})

def transitioned(transition: Engine.Transition, +before: Types.State, +event: Canonical.CanonicalEvent,
    queue: Edge.Queue, jobs: List<&2,Edge.Stored>, +job: Edge.Job, +now: Nat, jev_delay: Nat,
    candidate: Maybe<&2,Driver.Candidate>, outcome: Output.Outcome, delay: Nat, lease: Nat,
    ih: Edge.Runtime -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match transition:
    case Engine.Transition{state,Canonical.Advanced{_,list}}:
      continued(commands(list,Edge.Runtime{state,queue,jobs,jev_delay},event,now,job,candidate,outcome,delay,lease),before,event,job,now,ih)
    case Engine.Transition{+state,Canonical.Rejected{_,_}}:
      row(before,state,event,now,1n) <> ih(Edge.Runtime{state,queue,jobs,jev_delay})

def input(input: Edge.Input, +state: Types.State, queue: Edge.Queue, jobs: List<&2,Edge.Stored>,
    +now: Nat, jev_delay: Nat, outcome: Output.Outcome, delay: Nat, lease: Nat,
    ih: Edge.Runtime -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match input:
    case Edge.Event{Driver.Action{+event,_,+candidate,_,_},+job}:
      +event = Engine.fence(state,event,True{},Edge.context(state,job,jev_delay,candidate))
      transitioned(Engine.step(state,event),state,event,queue,jobs,job,now,jev_delay,candidate,outcome,delay,lease,ih)
    case input: Edge.input(input,state,queue,jobs,now,jev_delay,ih)

def taken(taken: Engine.Taken, +items: List<&2,Edge.Item>, +sequence: Nat, jobs: List<&2,Edge.Stored>,
    jev_delay: Nat, outcome: Output.Outcome, delay: Nat, lease: Nat,
    ih: Edge.Runtime -> List<&2,List<&2,Nat>>) -> List<&2,List<&2,Nat>>:
  match taken:
    case Engine.Taken{state,Some{Scheduler.Entry{+now,+order}}}:
      input(Edge.lookup(items,order),state,Edge.Queue{Edge.remove(items,order),sequence,sequence},jobs,now,jev_delay,outcome,delay,lease,ih)
    case Engine.Taken{_,None{}}: []

def loop(fuel: Nat, runtime: Edge.Runtime, +outcome: Output.Outcome, +delay: Nat, +lease: Nat) -> List<&2,List<&2,Nat>>:
  match fuel runtime:
    case 0n _: [[98n]]
    case 1n+rest Edge.Runtime{state,Edge.Queue{+items,+sequence,synced},jobs,jev_delay}:
      taken(Engine.take(Edge.sync(items,state,synced)),items,sequence,jobs,jev_delay,outcome,delay,lease,
        next => loop(rest,next,outcome,delay,lease))

def run(outcome: Output.Outcome, delay: Nat, lease: Nat) -> List<&2,List<&2,Nat>>:
  loop(150n,Edge.Runtime{Engine.initial(Ledger.Limits{32n,100000n,16n,50000n}),
    Edge.append(Edge.Queue{[],0n,0n},0n,Edge.Edit{Edge.Job{1n,1n,10n,[5n],Canonical.RequestFinding{}}}),[],5n},outcome,delay,lease)
