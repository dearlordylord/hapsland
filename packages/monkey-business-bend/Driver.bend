import Base
import ./Numeric.bend as Numeric
import ./JevEffects.bend as JevEffects
import ./OutputScenario.bend as Output
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Handoff.bend as Handoff
import ../agent-flow-bend/Dispatch.bend as Dispatch

type Candidate is Data:
  Candidate{partition: Nat, advice: Nat, round: Nat, token: Nat, surface: Handoff.Surface, selection: Bool}

# Original source facts remain separate from the selected physical result.
type SourceJob is Data:
  SourceJob{partition: Nat, lifetime: Nat, bytes: Nat, units: List<&2,Nat>, outcome: Maybe<&2,Canonical.RequestOutcome>}
type OutcomeEnvironment is Data:
  OutcomeEnvironment{outcome: Maybe<&2,Canonical.RequestOutcome>, weights: List<&2,Numeric.Words>}
type OutcomeSource is Data:
  EditForced{}
  RunForced{}
  Sampled{}
type OutcomeReceipt is Data:
  OutcomeReceipt{partition: Nat, lifetime: Nat, round: Nat, operation: Nat, request: Nat,
    outcome: Canonical.RequestOutcome, source: OutcomeSource, job: Maybe<&2,SourceJob>,
    stream_before: Maybe<&2,U32>, stream_after: Maybe<&2,U32>}

type Context is Data:
  Context{partition: Nat, lifetime: Nat, round: Nat, bytes: Nat, job: Bool,
    jev_delay: Nat, outcome: Maybe<&2,Canonical.RequestOutcome>, current_work: Bool,
    credential_ready: Bool, credential_generation: Bool, source_readable: Bool,
    advice_lifetime: Nat, candidate: Maybe<&2, Candidate>, automatic_collection: Bool,
    automatic_review: Bool, automatic_output: Bool, output_certain: Bool,
    output_delay: Nat, output_lease: Nat, background: Bool, automatic_dispatch: Bool}

type Action is Data:
  Action{event: Canonical.CanonicalEvent, delay: Nat, candidate: Maybe<&2, Candidate>, job: Bool, expiry_advice: Maybe<&2, Nat>}

type Handled is Data:
  Handled{handled: Bool, actions: List<&2, Action>}

# Factual public event binding. A source job has a separate immutable scope;
# events lacking the complete tuple retain the supplied input owner, 1 / 0.
type ContextScope is Data:
  ContextScope{partition: Nat, lifetime: Nat, round: Nat}

def context_scope(event: Canonical.CanonicalEvent, provided: Nat) -> ContextScope:
  match event:
    case Canonical.QuietRoundTick{partition,lifetime,round,_,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.QuietRoundReset{partition,lifetime,round}: ContextScope{partition,lifetime,round}
    case Canonical.ClosePermitRound{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.AdmitObservation{partition,lifetime,round}: ContextScope{partition,lifetime,round}
    case Canonical.StartObservation{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.CompleteObservation{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.InterruptObservation{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.BeginPreparation{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.BeginObservedPreparation{partition,lifetime,round,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.InterruptPreparation{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.PreparationCompleted{partition,lifetime,round,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.StartReview{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.JevRequestReady{partition,lifetime,round,_,_,_,_,_,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.JevRequestStarted{partition,lifetime,round,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.JevRequestInterrupted{partition,lifetime,round,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.JevRequestSettled{partition,lifetime,round,_,_,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.ReviewCompleted{partition,lifetime,round,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.RetireReview{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.CancelReview{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.ReviewObserved{partition,lifetime,round,_,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.FindingCountUpdated{partition,lifetime,round,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.QueueDispatch{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.DispatchSettled{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.StopPolled{partition,lifetime,round,_}: ContextScope{partition,lifetime,round}
    case Canonical.CollectionReady{_,partition,lifetime,round,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.OutputStarted{partition,lifetime,round}: ContextScope{partition,lifetime,round}
    case Canonical.OutputTerminal{partition,lifetime,round,_,_}: ContextScope{partition,lifetime,round}
    case Canonical.RetirePartition{partition,lifetime,round}: ContextScope{partition,lifetime,round}
    case _: ContextScope{provided,1n,0n}

def with_scope(context: Context, scope: ContextScope) -> Context:
  match context scope:
    case Context{_,_,_,bytes,job,delay,outcome,current,credential,generation,readable,lifetime,candidate,collection,review,output,certain,output_delay,lease,background,dispatch}
        ContextScope{p,l,r}:
      Context{p,l,r,bytes,job,delay,outcome,current,credential,generation,readable,lifetime,candidate,collection,review,output,certain,output_delay,lease,background,dispatch}

def with_outcome(context: Context, selected: Maybe<&2,Canonical.RequestOutcome>) -> Context:
  match context:
    case Context{p,l,r,bytes,job,delay,_,current,credential,generation,readable,lifetime,candidate,collection,review,output,certain,output_delay,output_lease,background,dispatch}:
      Context{p,l,r,bytes,job,delay,selected,current,credential,generation,readable,lifetime,candidate,collection,review,output,certain,output_delay,output_lease,background,dispatch}

def immediate(event: Canonical.CanonicalEvent, job: Bool) -> Action:
  Action{event, 0n, None{}, job, None{}}

def candidate_action(event: Canonical.CanonicalEvent, candidate: Candidate) -> Action:
  Action{event, 0n, Some{candidate}, False{}, None{}}

def work_id(work: Canonical.Work) -> Nat:
  match work:
    case Canonical.Work{_, _, _, operation, _, _, _}: operation

def operation_hit(found: Bool, head: Canonical.Work, rest: Maybe<&2, Canonical.Work>) -> Maybe<&2, Canonical.Work>:
  match found:
    case True{}: Some{head}
    case False{}: rest

def find_operation(work: List<&2, Canonical.Work>, +operation: Nat) -> Maybe<&2, Canonical.Work>:
  match work:
    case Nil{}: None{}
    case +head <> tail: operation_hit(Nat.is_eq(work_id(head), operation), head, find_operation(tail, operation))

def dispatch_work(found: Maybe<&2, Canonical.Work>, +context: Context) -> Handled:
  match found context:
    case Some{Canonical.Work{+p, +l, +r, +o, _, Canonical.AwaitingSourceRead{}, _}} Context{_, _, _, bytes, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}:
      Handled{True{}, [immediate(Canonical.StartObservation{p, l, r, o}, False{}), immediate(Canonical.BeginObservedPreparation{p, l, r, o, bytes}, True{})]}
    case Some{Canonical.Work{+p, +l, +r, +o, _, Canonical.Reviewing{}, _}} Context{_, _, _, _, _, _, _, current, credential, _, _, _, _, _, _, _, _, _, _, _, _}:
      Handled{True{}, [immediate(Canonical.StartReview{p, l, r, o}, False{}), immediate(Canonical.JevRequestReady{p, l, r, o, True{}, True{}, credential, True{}, current, True{}}, False{})]}
    case _ _: Handled{False{}, Nil{}}

def issued_actions(facts: List<&2, JevEffects.ScheduledFact>) -> List<&2, Action>:
  match facts:
    case Nil{}: Nil{}
    case JevEffects.ScheduledFact{event, delay} <> tail:
      Action{event, delay, None{}, False{}, None{}} <> issued_actions(tail)

def issued_outcome(outcome: Canonical.RequestOutcome, p: Nat, l: Nat, r: Nat, o: Nat, request: Nat, delay: Nat) -> Handled:
  Handled{True{}, issued_actions(JevEffects.issued(outcome, p, l, r, o, request, delay))}

def candidate_check(+advice: Nat, +partition: Nat, +round: Nat, credential: Bool, generation: Bool, current: Bool, readable: Bool, surface: Handoff.Surface) -> Handled:
  +candidate = {Candidate{partition, advice, round, advice, surface, False{}} : Candidate}
  Handled{True{}, [candidate_action(Canonical.FinalCandidateCheck{True{}, generation, credential, False{}, current && readable, True{}}, candidate)]}

def suppress_value(+candidate: Candidate) -> Handled:
  match candidate:
    case Candidate{_, +advice, round, _, surface, _}:
      Handled{True{}, [candidate_action(Canonical.SubmissionSuppressCheck{advice, advice, round, surface}, candidate)]}


def suppress(candidate: Maybe<&2, Candidate>) -> Handled:
  match candidate:
    case Some{+c}:
      suppress_value(c)
    case None{}: Handled{False{}, Nil{}}

def reserve(candidate: Maybe<&2, Candidate>) -> Handled:
  match candidate:
    case Some{Candidate{p, +advice, round, +token, surface, False{}}}:
      Handled{True{}, [immediate(Canonical.CollectionReserveLease{advice, token}, False{}), immediate(Canonical.SubmissionBegin{advice, p, round, token, surface, True{}, [advice], [advice]}, False{})]}
    case _: Handled{False{}, Nil{}}

# Scheduled is an ephemeral owner result. The public Action fields and tags
# remain unchanged; this is their single conversion boundary.
def output_action(scheduled: Output.Scheduled) -> Action:
  match scheduled:
    case Output.Scheduled{event,delay}: Action{event,delay,None{},False{},None{}}

def output_actions(scheduled: List<&2,Output.Scheduled>) -> List<&2,Action>:
  match scheduled:
    case Nil{}: []
    case head <> tail: output_action(head) <> output_actions(tail)

def output_outcome(certain: Bool) -> Output.Outcome:
  match certain:
    case True{}: Output.Certain{}
    case False{}: Output.Uncertain{}

# This relative command profile has no issuance timestamp; issued ignores
# started. Actual environmental receipts capture the current clock separately.
def output(p: Nat, advice: Nat, token: Nat, certain: Bool, delay: Nat, lease: Nat) -> Handled:
  Handled{True{},output_actions(Output.issued(Output.Capture{Output.Individual{advice,token},0n,output_outcome(certain),delay,lease}))}

def work_list(state: Canonical.State) -> List<&2, Canonical.Work>:
  match state:
    case Canonical.State{_, _, work, _, _, _, _, _, _}: work

def retained(event: Canonical.CanonicalEvent, +lifetime: Nat) -> Handled:
  match event:
    case Canonical.JevRequestSettled{_, _, _, operation, _, _, _}:
      Handled{True{}, [Action{Canonical.CollectionExpiryCheck{lifetime, lifetime}, lifetime, None{}, False{}, Some{operation}}]}
    case Canonical.ReviewCompleted{_, _, _, operation, _}:
      Handled{True{}, [Action{Canonical.CollectionExpiryCheck{lifetime, lifetime}, lifetime, None{}, False{}, Some{operation}}]}
    case Canonical.ReviewObserved{_, _, _, operation, _, _}:
      Handled{True{}, [Action{Canonical.CollectionExpiryCheck{lifetime, lifetime}, lifetime, None{}, False{}, Some{operation}}]}
    case _: Handled{False{}, Nil{}}

def eligible(event: Canonical.CanonicalEvent, credential: Bool, generation: Bool, current: Bool, readable: Bool, surface: Handoff.Surface) -> Handled:
  match event:
    case Canonical.CollectionReady{advice, p, _, r, _, _}: candidate_check(advice, p, r, credential, generation, current, readable, surface)
    case _: Handled{False{}, Nil{}}

def submitted(event: Canonical.CanonicalEvent, p: Nat, certain: Bool, +delay: Nat, lease: Nat) -> Handled:
  match event:
    case Canonical.SubmissionBegin{advice, _, _, token, _, True{}, _, _}: output(p, advice, token, certain, delay, lease)
    case Canonical.SubmissionAuthorize{advice, token}: output(p, advice, token, certain, delay, lease)
    case _: Handled{False{}, Nil{}}

def retired_work(found: Maybe<&2, Canonical.Work>, +advice: Nat) -> Handled:
  match found:
    case Some{Canonical.Work{p, l, r, _, _, Canonical.PendingFinding{_}, _}}:
      Handled{True{}, [immediate(Canonical.CollectionRetireAdvice{advice}, False{}), immediate(Canonical.SubmissionForget{advice}, False{}), immediate(Canonical.RetireReview{p, l, r, advice}, False{})]}
    case _: Handled{True{}, [immediate(Canonical.CollectionRetireAdvice{advice}, False{}), immediate(Canonical.SubmissionForget{advice}, False{})]}

def retirement(state: Canonical.State, candidate: Maybe<&2, Candidate>) -> Handled:
  match candidate:
    case Some{Candidate{_, +advice, _, _, _, _}}:
      # Advice is the globally unique operation identity; retain the work's real
      # attribution rather than assuming an initial advicee lifetime.
      retired_work(find_operation(work_list(state), advice), advice)
    case None{}: Handled{False{}, Nil{}}

def collection_surface(background: Bool) -> Handoff.Surface:
  match background:
    case True{}: Handoff.Background{}
    case False{}: Handoff.Edit{}

def running(state: Canonical.State) -> List<&2, Dispatch.Entry>:
  match state:
    case Canonical.State{_, _, _, _, _, _, Dispatch.State{_, running, _, _, _}, _, _}: running

def release_if(available: Bool, p: Nat, l: Nat, r: Nat, o: Nat) -> Handled:
  match available:
    case True{}: Handled{True{}, [immediate(Canonical.DispatchSettled{p, l, r, o}, False{})]}
    case False{}: Handled{True{}, Nil{}}

def unavailable(state: Canonical.State, event: Canonical.CanonicalEvent) -> Handled:
  match event:
    case Canonical.JevRequestReady{+p, +l, +r, +o, _, _, _, _, _, _}:
      release_if(Dispatch.contains(running(state), p, l, r, o), p, l, r, o)
    case _: Handled{False{}, Nil{}}

def refused_preparation(event: Canonical.CanonicalEvent) -> Handled:
  match event:
    case Canonical.BeginObservedPreparation{+p, +l, +r, +observation, _}:
      Handled{True{}, [immediate(Canonical.CompleteObservation{p, l, r, observation}, False{}), immediate(Canonical.DispatchSettled{p, l, r, observation}, False{})]}
    case _: Handled{False{}, Nil{}}

def handle(+state: Canonical.State, +event: Canonical.CanonicalEvent, command: Canonical.Command, +context: Context) -> Handled:
  match command context:
    case Canonical.PreparationRefused{} _: refused_preparation(event)
    case Canonical.JevRequestUnavailable{} _: unavailable(state, event)
    case Canonical.ObservationAdmitted{id} Context{p, l, r, _, True{}, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}:
      Handled{True{}, [immediate(Canonical.QueueDispatch{p, l, r, id}, False{})]}
    case Canonical.DispatchStarted{operation, _} Context{+p, +l, +r, _, True{}, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}:
      dispatch_work(find_operation(work_list(state), operation), context)
    case Canonical.UnitAdmitted{operation, _, _, _, _} Context{p, l, r, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, True{}}:
      Handled{True{}, [immediate(Canonical.QueueDispatch{p, l, r, operation}, False{})]}
    case Canonical.JevRequestIssued{p, l, r, o, request} Context{_, _, _, _, _, delay, Some{outcome}, _, _, _, _, _, _, _, True{}, _, _, _, _, _, _}:
      issued_outcome(outcome, p, l, r, o, request, delay)
    case Canonical.RetainFinding{} Context{_, _, _, _, _, _, _, _, _, _, _, +lifetime, _, _, _, _, _, _, _, _, _}:
      retained(event, lifetime)
    case Canonical.CollectionEligible{} Context{_, _, _, _, _, _, _, current, credential, generation, readable, _, _, True{}, _, _, _, _, _, background, _}:
      eligible(event, credential, generation, current, readable, collection_surface(background))
    case Canonical.RetireCandidate{} Context{_, _, _, _, _, _, _, _, _, _, _, _, candidate, _, _, _, _, _, _, _, _}: retirement(state, candidate)
    case Canonical.RetainCandidate{} Context{_, _, _, _, _, _, _, _, _, _, _, _, candidate, _, _, _, _, _, _, _, _}: suppress(candidate)
    case Canonical.ContinueCandidate{} Context{_, _, _, _, _, _, _, _, _, _, _, _, candidate, _, _, _, _, _, _, _, _}: suppress(candidate)
    case Canonical.SubmissionUnsuppressed{} Context{_, _, _, _, _, _, _, _, _, _, _, _, candidate, _, _, True{}, _, _, _, _, _}: reserve(candidate)
    case Canonical.SubmissionAuthorized{} Context{p, _, _, _, _, _, _, _, _, _, _, _, _, _, _, True{}, certain, delay, lease, _, _}: submitted(event, p, certain, delay, lease)
    case Canonical.SubmissionBegun{} Context{p, _, _, _, _, _, _, _, _, _, _, _, _, _, _, True{}, certain, delay, lease, _, _}: submitted(event, p, certain, delay, lease)
    case _ _: Handled{False{}, Nil{}}

type EditPlan is Data:
  EditPlan{retry: Bool, actions: List<&2, Action>}

def edit_round(found: Maybe<&2, Canonical.Round>, +partition: Nat, +lifetime: Nat) -> EditPlan:
  match found:
    case None{}: EditPlan{True{}, [immediate(Canonical.OpenRound{partition, lifetime}, False{})]}
    case Some{Canonical.Round{p, l, r, _, _, _, _, _}}:
      EditPlan{False{}, [immediate(Canonical.AdmitObservation{p, l, r}, True{})]}

def rounds(state: Canonical.State) -> List<&2, Canonical.Round>:
  match state:
    case Canonical.State{_, rounds, _, _, _, _, _, _, _}: rounds

def edit(+state: Canonical.State, +partition: Nat, lifetime: Nat) -> EditPlan:
  edit_round(Canonical.find_round(partition, rounds(state)), partition, lifetime)

def preparation_completed(+partition: Nat, +lifetime: Nat, +round: Nat, operation: Nat, unit_bytes: List<&2, Nat>, delay: Nat) -> Action:
  Action{Canonical.PreparationCompleted{partition, lifetime, round, operation, unit_bytes}, delay, None{}, True{}, None{}}

def owns(work: List<&2, Canonical.Work>, +advice: Nat) -> Bool:
  match work:
    case Nil{}: False{}
    case Canonical.Work{_, _, _, operation, _, Canonical.PendingFinding{_}, _} <> tail:
      Nat.is_eq(operation, advice) || owns(tail, advice)
    case _ <> tail: owns(tail, advice)

def candidate_owner(state: Canonical.State, candidate: Maybe<&2, Candidate>) -> Bool:
  match candidate:
    case Some{Candidate{_, advice, _, _, _, _}}: owns(work_list(state), advice)
    case None{}: False{}

def fence(+state: Canonical.State, event: Canonical.CanonicalEvent, generated: Bool, +context: Context) -> Canonical.CanonicalEvent:
  match event generated context:
    case Canonical.JevRequestSettled{p, l, r, o, request, outcome, _} True{} Context{_, _, _, _, _, _, _, current, _, _, _, _, _, _, _, _, _, _, _, _, _}:
      Canonical.JevRequestSettled{p, l, r, o, request, outcome, current}
    case Canonical.JevRequestReady{p, l, r, o, root, configuration, _, selected, _, physical} True{} Context{_, _, _, _, _, _, _, current, credential, _, _, _, _, _, _, _, _, _, _, _, _}:
      Canonical.JevRequestReady{p, l, r, o, root, configuration, credential, selected, current, physical}
    case Canonical.FinalCandidateCheck{_, _, _, expired, _, findings} True{} Context{_, _, _, _, _, _, _, current, credential, generation, readable, _, candidate, _, _, _, _, _, _, _, _}:
      Canonical.FinalCandidateCheck{candidate_owner(state, candidate), generation, credential, expired, current && readable, findings}
    case event _ _: event

# Quotient splitting keeps all intermediates in the immediate Nat domain even
# when a valid delay is near u48 and the finite fact count is larger than one.
def fact_time_nonzero(+delay: Nat, +index: Nat, +count: Nat) -> Nat:
  Nat.add(Nat.mul(Nat.div(delay, count), index), Nat.div(Nat.mul(Nat.mod(delay, count), index), count))

def fact_time(delay: Nat, index: Nat, count: Nat) -> Nat:
  match count:
    case 0n: 0n
    case 1n+p: fact_time_nonzero(delay, index, 1n+p)

def handled_actions(handled: Handled) -> List<&2, Action>:
  match handled:
    case Handled{_, actions}: actions

def revalidate_work(work: List<&2, Canonical.Work>, +credential: Bool, +generation: Bool, +current: Bool, +readable: Bool, +background: Bool) -> List<&2, Action>:
  match work:
    case Nil{}: Nil{}
    case Canonical.Work{p, _, r, o, _, Canonical.PendingFinding{_}, _} <> tail:
      List.append(&2, Action, handled_actions(candidate_check(o, p, r, credential, generation, current, readable, collection_surface(background))), revalidate_work(tail, credential, generation, current, readable, background))
    case _ <> tail: revalidate_work(tail, credential, generation, current, readable, background)

def revalidate(state: Canonical.State, context: Context) -> List<&2, Action>:
  match context:
    case Context{_, _, _, _, _, _, _, current, credential, generation, readable, _, _, _, _, _, _, _, _, background, _}:
      revalidate_work(work_list(state), credential, generation, current, readable, background)
