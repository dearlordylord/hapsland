import Base
import ../agent-flow-bend/Canonical.bend as Canonical
import ./Driver.bend as Driver
import ./AdmissionAttempts.bend as AdmissionAttempts

# Coalesce internally issued retirement effects until their original fact runs.
# This never filters externally supplied callbacks or Canonical refusals.
def retiring(actions: List<&2, Driver.Action>) -> Maybe<&2, Nat>:
  match actions:
    case Nil{}: None{}
    case Driver.Action{Canonical.RetireReview{_, _, _, operation}, _, _, _, _} <> _: Some{operation}
    case _ <> tail: retiring(tail)

type Issued is Data:
  Issued{pending: List<&2, Nat>, actions: List<&2, Driver.Action>}

def known(already_pending: Bool, pending: List<&2, Nat>, operation: Nat, actions: List<&2, Driver.Action>) -> Issued:
  match already_pending:
    case True{}: Issued{pending, Nil{}}
    case False{}: Issued{operation <> pending, actions}

def found(operation: Maybe<&2, Nat>, +pending: List<&2, Nat>, actions: List<&2, Driver.Action>) -> Issued:
  match operation:
    case None{}: Issued{pending, actions}
    case Some{+operation}: known(AdmissionAttempts.contains(pending, operation), pending, operation, actions)

def issue(pending: List<&2, Nat>, +actions: List<&2, Driver.Action>) -> Issued:
  found(retiring(actions), pending, actions)

def consumed(pending: List<&2, Nat>, event: Canonical.CanonicalEvent) -> List<&2, Nat>:
  match event:
    case Canonical.RetireReview{_, _, _, operation}: AdmissionAttempts.remove(pending, operation)
    case _: pending

# Candidate proposal for owner review: for every pending list, operation identity
# and internal action batch, an already-issued retirement publishes no second
# batch. It leaves the existing pending provenance intact. This says nothing
# about external duplicate callback acceptance, which remains Canonical-owned.
law already_issued_batch_coalesces:
  for +pending: List<&2, Nat>
  for operation: Nat
  for actions: List<&2, Driver.Action>
  {known(True{}, pending, operation, actions) == Issued{pending, Nil{}} : Issued}

def already_issued_batch_coalesces(pending, operation, actions):
  {==}
