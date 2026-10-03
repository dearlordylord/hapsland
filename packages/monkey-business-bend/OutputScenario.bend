import Base
import ../agent-flow-bend/Canonical.bend as Canonical

# Environmental output facts. Canonical owns token authority, atomic committed
# membership, transient resources and permitted reoffer; this module grants none.
type Outcome is Data:
  Certain{}
  Uncertain{}
  Failed{}
type Attempt is Data:
  Individual{advice: Nat, token: Nat}
  Finish{group: Nat, round: Nat, attempt: Nat, token: Nat, selected: List<&2,Nat>}
type Capture is Data:
  Capture{attempt: Attempt, started: Nat, outcome: Outcome, delay: Nat, lease: Nat}

type Scheduled is Data:
  Scheduled{event: Canonical.CanonicalEvent, delay: Nat}

def action(event: Canonical.CanonicalEvent, delay: Nat) -> Scheduled:
  Scheduled{event,delay}

def write(outcome: Outcome, expired: Bool) -> Canonical.WriteOutcome:
  match outcome expired:
    case Failed{} _: Canonical.Failed{}
    case Certain{} False{}: Canonical.Acknowledged{}
    case _ _: Canonical.Unknown{}

def individual_terminal(outcome: Outcome, expired: Bool, advice: Nat, token: Nat, due: Nat, +lease: Nat) -> Scheduled:
  match outcome expired:
    case Failed{} _: action(Canonical.SubmissionRelease{advice,token},due)
    case +other True{}: action(Canonical.SubmissionExpiryCheck{advice,token,lease,lease},due)
    case Certain{} False{}: action(Canonical.SubmissionTerminal{advice,token,True{}},due)
    case Uncertain{} False{}: action(Canonical.SubmissionTerminal{advice,token,False{}},due)

def release(+advice: Nat, +token: Nat, +due: Nat, expired: Bool) -> List<&2,Scheduled>:
  [action(Canonical.CollectionLeaseCheck{advice,token,expired,False{},True{},False{}},due),
   action(Canonical.CollectionReleaseLease{advice,token},due)]

def member_release(outcome: Outcome, +expired: Bool, +advice: Nat, +token: Nat, +due: Nat) -> List<&2,Scheduled>:
  match outcome:
    case Failed{}: [action(Canonical.SubmissionRelease{advice,token},due),action(Canonical.CollectionReleaseLease{advice,token},due)]
    case _: release(advice,token,due,expired)

def individual(+outcome: Outcome, +expired: Bool, +advice: Nat, +token: Nat, +due: Nat, lease: Nat) -> List<&2,Scheduled>:
  match outcome:
    case Failed{}: member_release(Failed{},False{},advice,token,due)
    case +other: individual_terminal(other,expired,advice,token,due,lease) <> release(advice,token,due,expired)

def members(selected: List<&2,Nat>, +outcome: Outcome, +expired: Bool, +token: Nat, +due: Nat, +lease: Nat) -> List<&2,Scheduled>:
  match selected:
    case Nil{}: []
    case advice <> tail:
      List.append(&2,Scheduled,member_release(outcome,expired,advice,token,due),members(tail,outcome,expired,token,due,lease))

def terminal(attempt: Attempt, +outcome: Outcome, +expired: Bool, +due: Nat, +lease: Nat) -> List<&2,Scheduled>:
  match attempt:
    case Individual{advice,token}: individual(outcome,expired,advice,token,due,lease)
    case Finish{group,round,id,+token,+selected}:
      action(Canonical.FinishTerminal{group,round,id,token,selected,write(outcome,expired)},due) <>
        members(selected,outcome,expired,token,due,lease)

def selected_count(attempt: Attempt) -> Nat:
  match attempt:
    case Individual{_,_}: 1n
    case Finish{_,_,_,_,selected}: List.length(&2,Nat,selected)

def late_ack(late: Bool, count: Nat, delay: Nat, actions: List<&2,Scheduled>) -> List<&2,Scheduled>:
  match late:
    case False{}: actions
    case True{}: action(Canonical.DeliveryAcknowledgeCheck{count,True{}},delay) <> actions

def due(outcome: Outcome, delay: Nat, lease: Nat) -> Nat:
  match outcome:
    case Failed{}: delay
    case _: Nat.min(delay,lease)

def expired(outcome: Outcome, delay: Nat, lease: Nat) -> Bool:
  match outcome:
    case Failed{}: False{}
    case _: Nat.is_le(lease,delay)

# Returned action delays remain relative to captured started, including late ACK.
def late(outcome: Outcome, delay: Nat, lease: Nat) -> Bool:
  match outcome:
    case Failed{}: False{}
    case _: Nat.is_gt(delay,lease)

# Initial full issuance profile generator, including the distinct known
# pre-output preparation failure path. NEVER regenerate this list when an
# outputAttempt control changes an existing authorized completion: use
# OutputCompletion.replace and preserve captured original scheduling instead.
def issued(capture: Capture) -> List<&2,Scheduled>:
  match capture:
    case Capture{+attempt,_,+outcome,+delay,+lease}:
      late_ack(late(outcome,delay,lease),selected_count(attempt),delay,
        terminal(attempt,outcome,expired(outcome,delay,lease),due(outcome,delay,lease),lease))

# A failed individual already released its own resources. Its enclosing Finish
# receives only the actual owner-generated terminal, never member releases twice.
def finish_terminal_tail(+action: Scheduled, tail: List<&2,Scheduled>) -> List<&2,Scheduled>:
  match action:
    case Scheduled{Canonical.FinishTerminal{_,_,_,_,_,_},_}: action <> tail
    case _: tail

def finish_terminals(actions: List<&2,Scheduled>) -> List<&2,Scheduled>:
  match actions:
    case Nil{}: []
    case action <> tail: finish_terminal_tail(action,finish_terminals(tail))

def initial_actions(capture: Capture, terminal_only: Bool) -> List<&2,Scheduled>:
  match terminal_only:
    case False{}: issued(capture)
    case True{}: finish_terminals(issued(capture))

# Candidate initial-path law, conditional on known pre-output failure provenance.
# It does NOT describe an observed failed postauthorization completion control.
# An ordinary future profile cannot be an input to issued facts.
# Exact committed membership is copied from Capture, never selected again.
law captured_failure_is_release:
  for +advice: Nat
  for +token: Nat
  for started: Nat
  for +delay: Nat
  for lease: Nat
  {terminal(Individual{advice,token},Failed{},False{},delay,lease) ==
    [action(Canonical.SubmissionRelease{advice,token},delay), action(Canonical.CollectionReleaseLease{advice,token},delay)] : List<&2,Scheduled>}
def captured_failure_is_release(advice,token,started,delay,lease):
  {==}
