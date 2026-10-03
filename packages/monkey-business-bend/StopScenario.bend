import Base
import ../agent-flow-bend/Canonical.bend as Canonical

# Source-free facts for an already issued Stop. The caller captures its existing
# safe hook cutoff; Canonical owns waiting, selection, cancellation and output.
type Capture is Data:
  Capture{partition: Nat, lifetime: Nat, round: Nat, attempt: Nat, token: Nat,
    started: Nat, cutoff: Nat}
type Fact is Data:
  Fact{at: Nat, event: Canonical.CanonicalEvent}

def cutoff_poll(p: Nat, l: Nat, r: Nat, cutoff: Nat, now: Nat) -> Canonical.CanonicalEvent:
  Canonical.StopPolled{p,l,r,Nat.is_le(cutoff,now)}

def poll(capture: Capture, now: Nat) -> Canonical.CanonicalEvent:
  match capture:
    case Capture{p, l, r, _, _, _, cutoff}:
      cutoff_poll(p,l,r,cutoff,now)

def initial_distinct(distinct: Bool, +capture: Capture, +started: Nat, +cutoff: Nat) -> List<&2, Fact>:
  match distinct:
    case True{}: [Fact{started, poll(capture, started)}, Fact{cutoff, poll(capture, cutoff)}]
    case False{}: [Fact{started, poll(capture, started)}]

def initial(capture: Capture) -> List<&2, Fact>:
  match capture:
    case Capture{+p, +l, +r, +attempt, +token, +started, +cutoff}:
      initial_distinct(Bool.not(Nat.is_eq(started, cutoff)),
        Capture{p, l, r, attempt, token, started, cutoff}, started, cutoff)

# Equality means the cutoff has been reached. Same-time callback/poll order is
# determined by the existing scheduler's insertion order, never by this helper.
def wake(capture: Capture, +now: Nat) -> Fact:
  Fact{now, poll(capture, now)}
