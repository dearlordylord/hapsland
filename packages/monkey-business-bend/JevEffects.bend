import Base
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Dispatch.bend as Dispatch

# Simulated facts only. Canonical remains the lifecycle acceptance authority.
type ScheduledFact is Data:
  ScheduledFact{event: Canonical.CanonicalEvent, delay: Nat}

def issued(
  +outcome: Canonical.ReviewServiceRequestOutcome,
  +p: Nat,
  +l: Nat,
  +r: Nat,
  +o: Nat,
  +request: Nat,
  +delay: Nat
) -> List<&2, ScheduledFact>:
  match outcome:
    case Canonical.NeverSent{}:
      [
        ScheduledFact{
          Canonical.ReviewServiceRequestSettled{p, l, r, o, request, Canonical.NeverSent{}, True{}},
          delay
        }
      ]
    case Canonical.RequestInterrupted{}:
      [
        ScheduledFact{Canonical.ReviewServiceRequestStarted{p, l, r, o, request}, 0n},
        ScheduledFact{Canonical.ReviewServiceRequestInterrupted{p, l, r, o, request}, delay},
        ScheduledFact{
          Canonical.ReviewServiceRequestSettled{
            p,
            l,
            r,
            o,
            request,
            Canonical.RequestInterrupted{},
            True{}
          },
          delay
        }
      ]
    case _:
      [
        ScheduledFact{Canonical.ReviewServiceRequestStarted{p, l, r, o, request}, 0n},
        ScheduledFact{
          Canonical.ReviewServiceRequestSettled{p, l, r, o, request, outcome, True{}},
          delay
        }
      ]

type Intervention is Data:
  Applied{facts: List<&2, ScheduledFact>}
  RefusedMissing{}
  RefusedStarted{}
  RefusedInterrupted{}

# Changing a future profile never calls this function. These facts replace only
# the explicitly selected live request's pending simulated callbacks.
def started(
  +outcome: Canonical.ReviewServiceRequestOutcome,
  +p: Nat,
  +l: Nat,
  +r: Nat,
  +o: Nat,
  +id: Nat,
  +delay: Nat,
  interrupted: Bool
) -> Intervention:
  match outcome interrupted:
    case Canonical.NeverSent{} _: RefusedStarted{}
    case Canonical.RequestInterrupted{} False{}:
      Applied{
        [
          ScheduledFact{Canonical.ReviewServiceRequestInterrupted{p, l, r, o, id}, delay},
          ScheduledFact{
            Canonical.ReviewServiceRequestSettled{p, l, r, o, id, outcome, True{}},
            delay
          }
        ]
      }
    case Canonical.RequestInterrupted{} True{}:
      Applied{
        [
          ScheduledFact{
            Canonical.ReviewServiceRequestSettled{p, l, r, o, id, outcome, True{}},
            delay
          }
        ]
      }
    case _ True{}: RefusedInterrupted{}
    case _ False{}:
      Applied{
        [
          ScheduledFact{
            Canonical.ReviewServiceRequestSettled{p, l, r, o, id, outcome, True{}},
            delay
          }
        ]
      }

def intervene(
  found: Maybe<&2, Dispatch.ReviewServiceRequestRecord>,
  +outcome: Canonical.ReviewServiceRequestOutcome,
  +delay: Nat
) -> Intervention:
  match found:
    case None{}: RefusedMissing{}
    case Some{Dispatch.ReviewServiceRequestRecord{p, l, r, o, id, False{}, _}}:
      Applied{issued(outcome, p, l, r, o, id, delay)}
    case Some{Dispatch.ReviewServiceRequestRecord{p, l, r, o, id, True{}, interrupted}}:
      started(outcome, p, l, r, o, id, delay, interrupted)

# Candidate proposal under #176, not an accepted product law. For every Nat
# attribution/delay and either interruption fact, a started request cannot be
# rewritten to NeverSent. Excludes the historical Started/NeverSent defect.
law started_never_sent_refused:
  for +p: Nat
  for +l: Nat
  for +r: Nat
  for +o: Nat
  for +id: Nat
  for +delay: Nat
  for interrupted: Bool
  {
    intervene(
      Some{Dispatch.ReviewServiceRequestRecord{p, l, r, o, id, True{}, interrupted}},
      Canonical.NeverSent{},
      delay
    )
    == RefusedStarted{}
    : Intervention
  }

def started_never_sent_refused(p, l, r, o, id, delay, interrupted):
  match interrupted:
    case False{}: {==}
    case True{}: {==}
