import Base
import ../Engine.bend as Engine
import ../Types.bend as Types
import ../Driver.bend as Driver
import ../../agent-flow-bend/Canonical.bend as C
import ./advicee-lifecycle-driver.bend as Edge

# Factual queue payload context, independent from response/release capabilities.
# Absence of a job is explicit; matching an owner never supplies edit bytes.
type Scope is Data:
  Scope{partition: Nat, lifetime: Nat, round: Nat}
type Payload is Data:
  Payload{scope: Scope, has_job: Bool, fallback: C.RequestOutcome}

# The original writer public runner explicitly supplies RunConfig.outcome
# finding for every directed/seeded/intersection input (writer-native.test).
# This is that configuration fact, never an inference from Edit.outcome.
def configured_fallback() -> C.RequestOutcome:
  C.RequestFinding{}

# Public driverContext uses the original event tuple only when all three fields
# exist. Its no-tuple fallback is lifetime 1 / round 0, not the latest round.
def scope(event: C.CanonicalEvent, provided: Nat) -> Scope:
  match event:
    case C.QuietRoundTick{partition,lifetime,round,_,_,_}: Scope{partition,lifetime,round}
    case C.QuietRoundReset{partition,lifetime,round}: Scope{partition,lifetime,round}
    case C.ClosePermitRound{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.AdmitObservation{partition,lifetime,round}: Scope{partition,lifetime,round}
    case C.StartObservation{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.CompleteObservation{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.InterruptObservation{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.BeginPreparation{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.BeginObservedPreparation{partition,lifetime,round,_,_}: Scope{partition,lifetime,round}
    case C.InterruptPreparation{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.PreparationCompleted{partition,lifetime,round,_,_}: Scope{partition,lifetime,round}
    case C.StartReview{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.JevRequestReady{partition,lifetime,round,_,_,_,_,_,_,_}: Scope{partition,lifetime,round}
    case C.JevRequestStarted{partition,lifetime,round,_,_}: Scope{partition,lifetime,round}
    case C.JevRequestInterrupted{partition,lifetime,round,_,_}: Scope{partition,lifetime,round}
    case C.JevRequestSettled{partition,lifetime,round,_,_,_,_}: Scope{partition,lifetime,round}
    case C.ReviewCompleted{partition,lifetime,round,_,_}: Scope{partition,lifetime,round}
    case C.RetireReview{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.CancelReview{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.ReviewObserved{partition,lifetime,round,_,_,_}: Scope{partition,lifetime,round}
    case C.FindingCountUpdated{partition,lifetime,round,_,_}: Scope{partition,lifetime,round}
    case C.QueueDispatch{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.DispatchSettled{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.StopPolled{partition,lifetime,round,_}: Scope{partition,lifetime,round}
    case C.CollectionReady{_,partition,lifetime,round,_,_}: Scope{partition,lifetime,round}
    case C.OutputStarted{partition,lifetime,round}: Scope{partition,lifetime,round}
    case C.OutputTerminal{partition,lifetime,round,_,_}: Scope{partition,lifetime,round}
    case C.RetirePartition{partition,lifetime,round}: Scope{partition,lifetime,round}
    case _: Scope{provided,1n,0n}

def owner(found: Maybe<&2,Nat>, fallback: Nat) -> Nat:
  match found:
    case Some{partition}: partition
    case None{}: fallback

def candidate_owner(candidate: Maybe<&2,Driver.Candidate>, fallback: Nat) -> Nat:
  match candidate:
    case Some{Driver.Candidate{partition,_,_,_,_,_}}: partition
    case None{}: fallback

# Called at the actual action append boundary with the issuance state. No later
# state reconstructs the original event lifetime or a response capability.
def captured(+state: Types.State, action: Driver.Action, +provided: Nat,
    has_job: Bool, fallback: C.RequestOutcome) -> Payload:
  match action:
    case Driver.Action{+event,_,candidate,_,_}:
      Payload{scope(event,candidate_owner(candidate,
        owner(Engine.scope_event(state,state,event,Some{provided}),provided))),has_job,fallback}

def input_action(+action: Driver.Action, state: Types.State, partition: Nat) -> Maybe<&2,Payload>:
  match action:
    case Driver.Action{_,_,_,has_job,_}:
      Some{captured(state,action,partition,has_job,configured_fallback())}

# A missing append binding is captured only from the selected physical payload
# before its actual step. Existing immutable order bindings always win.
def input_states(action: Driver.Action, partition: Nat, states: List<&2,Types.State>) -> Maybe<&2,Payload>:
  match states:
    case state <> Nil{}: input_action(action,state,partition)
    case _: None{}

def original_input(input: Edge.Input, states: List<&2,Types.State>) -> Maybe<&2,Payload>:
  match input:
    case Edge.Event{action,Edge.Job{partition,_,_,_,_}}: input_states(action,partition,states)
    case _: None{}

def preparation(found: Maybe<&2,Payload>, input: Edge.Input, states: List<&2,Types.State>) -> Maybe<&2,Payload>:
  match found:
    case Some{payload}: Some{payload}
    case None{}: original_input(input,states)

def provided(found: Maybe<&2,Payload>, fallback: Maybe<&2,Nat>) -> Maybe<&2,Nat>:
  match found:
    case Some{Payload{Scope{partition,_,_},_,_}}: Some{partition}
    case None{}: fallback

# The same factual owner query supplies the handler context and frame scopes.
# It is Engine's existing scope interpretation, never a second routing policy.
def event_owner(found: Maybe<&2,Payload>, before: Types.State, after: Types.State,
    event: C.CanonicalEvent, fallback: Maybe<&2,Nat>) -> Maybe<&2,Nat>:
  Engine.scope_event(before,after,event,provided(found,fallback))

def observed_states(before: List<&2,Types.State>, after: List<&2,Types.State>,
    event: C.CanonicalEvent, found: Maybe<&2,Payload>, fallback: Maybe<&2,Nat>) -> Maybe<&2,Nat>:
  match before after:
    case before <> Nil{} after <> Nil{}: event_owner(found,before,after,event,fallback)
    case _ _: provided(found,fallback)

def observed_owner(frame: Edge.ObservedFrame, found: Maybe<&2,Payload>,
    fallback: Maybe<&2,Nat>) -> Maybe<&2,Nat>:
  match frame:
    case Edge.CanonicalFrame{before,after,_,_,event,_,_,_,_,_,_}:
      observed_states(before,after,event,found,fallback)
    case Edge.CacheFrame{before,after,_,_,_,event,_,_,_,_,_,_}:
      observed_states(before,after,event,found,fallback)
    case _: provided(found,fallback)

def queued(payload: Payload, job: Edge.Job) -> Edge.Job:
  match payload job:
    case Payload{Scope{partition,lifetime,_},False{},fallback} _:
      Edge.Job{partition,lifetime,0n,[],fallback}
    case Payload{Scope{partition,lifetime,_},True{},_} Edge.Job{_,_,bytes,units,outcome}:
      Edge.Job{partition,lifetime,bytes,units,outcome}

# These commands obtain their actual operation job through common Edge's
# command_job before this hook. A response capsule does not create such a job.
def operation_job(command: C.Command) -> Bool:
  match command:
    case C.DispatchStarted{_,_}: True{}
    case C.JevRequestIssued{_,_,_,_,_}: True{}
    case _: False{}

def applied(+payload: Payload, +state: Types.State, event: C.CanonicalEvent, command: C.Command,
    context: Driver.Context) -> Driver.Context:
  match payload context:
    case Payload{Scope{+partition,lifetime,round},_,_}
        Driver.Context{_,_,_,bytes,job,delay,outcome,work,credential,generation,readable,
          advice_lifetime,candidate,collection,review,output,certain,output_delay,
          output_lease,background,dispatch}:
      Driver.Context{owner(Engine.scope_command(state,state,command,event_owner(Some{payload},state,state,event,Some{partition})),partition),
        lifetime,round,bytes,job,delay,outcome,work,credential,generation,readable,
        advice_lifetime,candidate,collection,review,output,certain,output_delay,
        output_lease,background,dispatch}

def absent_context(payload: Payload, fallback: C.RequestOutcome, state: Types.State,
    event: C.CanonicalEvent, command: C.Command, context: Driver.Context) -> Driver.Context:
  match context:
    case Driver.Context{p,l,r,_,_,delay,_,work,credential,generation,readable,
        advice_lifetime,candidate,collection,review,output,certain,output_delay,
        output_lease,background,dispatch}:
      applied(payload,state,event,command,Driver.Context{p,l,r,0n,False{},delay,fallback,
        work,credential,generation,readable,advice_lifetime,candidate,collection,
        review,output,certain,output_delay,output_lease,background,dispatch})

def absent(+payload: Payload, state: Types.State, event: C.CanonicalEvent, command: C.Command,
    context: Driver.Context) -> Driver.Context:
  match payload:
    case Payload{_,_,fallback}: absent_context(payload,fallback,state,event,command,context)

def selected(has_job: Bool, payload: Payload, state: Types.State, event: C.CanonicalEvent, command: C.Command,
    context: Driver.Context) -> Driver.Context:
  match has_job:
    case True{}: applied(payload,state,event,command,context)
    case False{}: absent(payload,state,event,command,context)

def adjusted(+payload: Payload, state: Types.State, event: C.CanonicalEvent, +command: C.Command,
    context: Driver.Context) -> Driver.Context:
  match payload:
    case Payload{_,has_job,_}:
      selected(Bool.or(has_job,operation_job(command)),payload,state,event,command,context)

def adjust(found: Maybe<&2,Payload>, state: Types.State, event: C.CanonicalEvent, command: C.Command,
    context: Driver.Context) -> Driver.Context:
  match found:
    case Some{payload}: adjusted(payload,state,event,command,context)
    case None{}: context
