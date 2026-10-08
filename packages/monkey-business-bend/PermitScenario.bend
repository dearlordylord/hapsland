import Base
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Admission.bend as Admission

# Environment facts only; Admission and Canonical decide permission and release.
type PostOutcome is Data:
  Successful{}
  Failed{}
  Duplicate{}
  Absent{}

type Capture is Data:
  Capture{partition: Nat, lifetime: Nat, tool: Nat, started: Nat, deadline: Nat,
    post_delay: Nat, outcome: PostOutcome, advicee_limit: Nat, resident_limit: Nat}

type Fact is Data:
  Fact{event: Canonical.CanonicalEvent, delay: Nat, job: Bool}

def issue(capture: Capture, +now: Nat) -> Canonical.CanonicalEvent:
  match capture:
    case Capture{p, l, tool, +started, +deadline, _, _, local, resident}:
      Canonical.IssuePermit{
        p,
        l,
        tool,
        started,
        deadline,
        now,
        0n,
        Admission.ProspectiveFacts{
          True{},
          (deadline - started : Nat),
          started,
          now,
          local,
          resident
        }
      }

def expire(p: Nat, l: Nat, token: Nat, delay: Nat) -> Fact:
  Fact{Canonical.ExpirePermit{p, l, token, True{}}, delay, False{}}

def consume(p: Nat, l: Nat, token: Nat, tool: Nat, now: Nat, delay: Nat) -> Fact:
  Fact{Canonical.ConsumePermit{p, l, token, tool, now}, delay, True{}}

def post(outcome: PostOutcome, +p: Nat, +l: Nat, +token: Nat, +tool: Nat,
    +now: Nat, +delay: Nat, expiry: Nat) -> List<&2, Fact>:
  match outcome:
    case Absent{}: [expire(p, l, token, expiry)]
    case Failed{}: [Fact{Canonical.ReleasePermit{p, l, token}, delay, False{}}]
    case Successful{}: [consume(p, l, token, tool, now, delay)]
    case Duplicate{}: [
      consume(p, l, token, tool, now, delay),
      consume(p, l, token, tool, now, delay)
    ]

def earlier_expiry(late: Bool, p: Nat, l: Nat, token: Nat, expiry: Nat,
    facts: List<&2, Fact>) -> List<&2, Fact>:
  match late:
    case True{}: expire(p, l, token, expiry) <> facts
    case False{}: facts

def schedule_outcome(outcome: PostOutcome, +p: Nat, +l: Nat, +token: Nat,
    tool: Nat, +started: Nat, +deadline: Nat, +delay: Nat) -> List<&2, Fact>:
  match outcome:
    case Absent{}: [expire(p, l, token, (deadline - started : Nat))]
    case +other:
      earlier_expiry(
        Nat.is_gt((started + delay : Nat), deadline),
        p,
        l,
        token,
        (deadline - started : Nat),
        post(other, p, l, token, tool, (started + delay : Nat), delay, (deadline - started : Nat))
      )

def issued(capture: Capture, token: Nat) -> List<&2, Fact>:
  match capture:
    case Capture{p, l, tool, started, deadline, delay, outcome, _, _}:
      schedule_outcome(outcome, p, l, token, tool, started, deadline, delay)

# Admission's permit round differs from Canonical's resident-wide round identity.
def owned_round(rounds: List<&2, Canonical.Round>, +p: Nat, +l: Nat) -> Maybe<&2, Nat>:
  match rounds:
    case Nil{}: None{}
    case Canonical.Round{owner, generation, +id, _, _, _, _, _} <> tail:
      Bool.pick(
        Maybe<&2, Nat>,
        Nat.is_eq(owner, p) && Nat.is_eq(generation, l),
        Some{id},
        owned_round(tail, p, l)
      )

def admit(round: Maybe<&2, Nat>, p: Nat, l: Nat) -> List<&2, Fact>:
  match round:
    case None{}: []
    case Some{id}: [Fact{Canonical.AdmitObservation{p, l, id}, 0n, True{}}]

def actual_round(state: Canonical.State, p: Nat, l: Nat) -> Maybe<&2, Nat>:
  match state:
    case Canonical.State{_, rounds, _, _, _, _, _, _, _}: owned_round(rounds, p, l)

def consumed(state: Canonical.State, command: Canonical.Output, +p: Nat, +l: Nat) -> List<&2, Fact>:
  match command:
    case Canonical.EventEstablished{Canonical.PermitConsumed{_}}: admit(
      actual_round(state, p, l),
      p,
      l
    )
    case _: []

# Candidate law: every attribution/time/limit input; absent POST only expires authority.
law absent_post_expires:
  for +p: Nat
  for +l: Nat
  for tool: Nat
  for +started: Nat
  for +deadline: Nat
  for delay: Nat
  for local: Nat
  for resident: Nat
  for +token: Nat
  {
    issued(Capture{p, l, tool, started, deadline, delay, Absent{}, local, resident}, token)
    == [expire(p, l, token, (deadline - started : Nat))]
    : List<&2, Fact>
  }

def absent_post_expires(p, l, tool, started, deadline, delay, local, resident, token):
  {==}
