import Base
import ../agent-flow-bend/Dispatch.bend as Dispatch
import ./Driver.bend as Driver
import ../agent-flow-bend/CollectionState.bend as Collection
import ../agent-flow-bend/DeliveryState.bend as Delivery
import ../agent-flow-bend/SubmissionState.bend as Submission
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Quiescence.bend as Quiescence

# Captured ownership plus measured facts only; Canonical decides eligibility.
# Quiet is not departure and never manufactures a physical completion.
type Scope is Data:
  Scope{partition: Nat, lifetime: Nat, round: Nat}

def tick(scope: Scope, now: Nat, window: Nat, facts: Quiescence.Facts) -> Canonical.CanonicalEvent:
  match scope:
    case Scope{p,l,r}: Canonical.QuietRoundTick{p,l,r,now,window,facts}

def reset(scope: Scope) -> Canonical.CanonicalEvent:
  match scope:
    case Scope{p,l,r}: Canonical.QuietRoundReset{p,l,r}

# The host supplies only physical activity/Stop observations. Recorded work,
# claims, leases and batches remain actual Canonical ownership facts.
def unfinished(work: List<&2,Canonical.Work>, +p: Nat) -> Bool:
  match work:
    case Nil{}: False{}
    case Canonical.Work{owner,_,_,_,_,Canonical.PendingFinding{_},_} <> tail: unfinished(tail,p)
    case Canonical.Work{owner,_,_,_,_,_,_} <> tail: Nat.is_eq(owner,p) || unfinished(tail,p)

def findings(work: List<&2,Canonical.Work>, +p: Nat) -> Bool:
  match work:
    case Nil{}: False{}
    case Canonical.Work{owner,_,_,_,_,Canonical.PendingFinding{_},_} <> tail: Nat.is_eq(owner,p) || findings(tail,p)
    case _ <> tail: findings(tail,p)

def advice_owned(work: List<&2,Canonical.Work>, +p: Nat, +advice: Nat) -> Bool:
  match work:
    case Nil{}: False{}
    case Canonical.Work{owner,_,_,id,_,_,_} <> tail:
      (Nat.is_eq(owner,p) && Nat.is_eq(id,advice)) || advice_owned(tail,p,advice)

def leases_busy(leases: List<&2,Collection.Lease>, +work: List<&2,Canonical.Work>, +p: Nat) -> Bool:
  match leases:
    case Nil{}: False{}
    case Collection.Lease{advice,_} <> tail: advice_owned(work,p,advice) || leases_busy(tail,work,p)

def batches_busy(batches: List<&2,Submission.Batch>, +p: Nat) -> Bool:
  match batches:
    case Nil{}: False{}
    case Submission.Batch{_,owner,_,_,_,_,_,_} <> tail: Nat.is_eq(owner,p) || batches_busy(tail,p)

def dispatch_entries_busy(entries: List<&2,Dispatch.Entry>, +p: Nat) -> Bool:
  match entries:
    case Nil{}: False{}
    case Dispatch.Entry{owner,_,_,_,_,_,_} <> tail: Nat.is_eq(owner,p) || dispatch_entries_busy(tail,p)

def requests_busy(requests: List<&2,Dispatch.Request>, +p: Nat) -> Bool:
  match requests:
    case Nil{}: False{}
    case Dispatch.Request{owner,_,_,_,_,_,_} <> tail: Nat.is_eq(owner,p) || requests_busy(tail,p)

def ownership_facts(canonical: Canonical.State, +p: Nat, native_idle: Bool, stop_absent: Bool) -> Quiescence.Facts:
  match canonical:
    case Canonical.State{_,_,+work,_,_,_,Dispatch.State{queued,running,_,_,requests},Collection.State{_,leases,claims,Delivery.State{_,_,Submission.State{_,batches}},_,_,_},_}:
      Quiescence.Facts{native_idle && Bool.not(unfinished(work,p) || dispatch_entries_busy(queued,p) || dispatch_entries_busy(running,p) || requests_busy(requests,p)),Bool.not(findings(work,p)),
        Bool.not(Collection.claim_exists(p,claims) || leases_busy(leases,work,p) || batches_busy(batches,p)),stop_absent}

# Explicit fixture ticks keep their supplied facts. Generated ticks observe
# current ownership without changing their original identity/time/window.
def generated_tick(canonical: Canonical.State, event: Canonical.CanonicalEvent, native_idle: Bool, stop_absent: Bool) -> Canonical.CanonicalEvent:
  match event:
    case Canonical.QuietRoundTick{+p,l,r,now,window,_}:
      Canonical.QuietRoundTick{p,l,r,now,window,ownership_facts(canonical,p,native_idle,stop_absent)}
    case _: event

def command_actions(command: Canonical.Command, event: Canonical.CanonicalEvent, now: Nat) -> List<&2,Driver.Action>:
  match command event:
    case Canonical.QuietRoundExpired{_} Canonical.QuietRoundTick{+p,+l,+r,_,_,_}:
      [Driver.immediate(Canonical.ClosePermitRound{p,l,r,now},False{}),Driver.immediate(Canonical.RetirePartition{p,l,r},False{})]
    case Canonical.QuietRoundWaiting{+since} Canonical.QuietRoundTick{p,l,r,_,+window,facts}:
      [Driver.Action{Canonical.QuietRoundTick{p,l,r,Nat.add(since,window),window,facts},(Nat.add(since,window) - now : Nat),None{},False{},None{}}]
    case _ _: []

def refresh(event: Canonical.CanonicalEvent) -> Bool:
  match event:
    case Canonical.CompleteObservation{_,_,_,_}: True{}
    case Canonical.JevRequestSettled{_,_,_,_,_,_,_}: True{}
    case Canonical.SubmissionTerminal{_,_,_}: True{}
    case Canonical.CollectionReleaseLease{_,_}: True{}
    case Canonical.ReleasePermit{_,_,_}: True{}
    case Canonical.ExpirePermit{_,_,_,_}: True{}
    case Canonical.CollectionRetireAdvice{_}: True{}
    case Canonical.SubmissionForget{_}: True{}
    case Canonical.RetireReview{_,_,_,_}: True{}
    case Canonical.CollectionReleaseBackground{_,_}: True{}
    case Canonical.CollectionExpireBackground{_,_,_,_}: True{}
    case _: False{}

def round_actions(found: Maybe<&2,Canonical.Round>, +canonical: Canonical.State, event: Canonical.CanonicalEvent,
    +now: Nat, window: Nat, native_idle: Bool, stop_absent: Bool) -> List<&2,Driver.Action>:
  match found:
    case None{}: []
    case Some{Canonical.Round{+p,+l,+r,_,_,_,_,_}}:
      Bool.pick(List<&2,Driver.Action>,refresh(event),[Driver.immediate(tick(Scope{p,l,r},now,window,ownership_facts(canonical,p,native_idle,stop_absent)),False{})],[])

def after(+canonical: Canonical.State, event: Canonical.CanonicalEvent, partition: Nat,
    +now: Nat, window: Nat, native_idle: Bool, stop_absent: Bool) -> List<&2,Driver.Action>:
  match canonical:
    case Canonical.State{_,rounds,_,_,_,_,_,_,_}:
      round_actions(Canonical.find_round(partition,rounds),canonical,event,now,window,native_idle,stop_absent)

def reset_found(found: Maybe<&2,Canonical.Round>) -> List<&2,Driver.Action>:
  match found:
    case None{}: []
    case Some{Canonical.Round{p,l,r,_,_,_,_,_}}: [Driver.immediate(reset(Scope{p,l,r}),False{})]

def command(canonical: Canonical.State, command: Canonical.Command, event: Canonical.CanonicalEvent, partition: Nat, now: Nat) -> List<&2,Driver.Action>:
  match canonical command:
    case Canonical.State{_,rounds,_,_,_,_,_,_,_} Canonical.ObservationAdmitted{_}: reset_found(Canonical.find_round(partition,rounds))
    case _ _: command_actions(command,event,now)
