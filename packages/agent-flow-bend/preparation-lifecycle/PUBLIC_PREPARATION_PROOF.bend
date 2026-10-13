import Base
import ./CanonicalResolverOwner.bend as Owner
import ../Canonical.bend as C
import ./PUBLIC_PREPARATION_LAWS.bend as Laws

def started_exact(+result: Owner.Step, +partition: Nat, +lifetime: Nat, +round: Nat, +observation: Nat, +bytes: Nat) -> {Owner.public_preparation_begin_started(result, partition, lifetime, round, observation, bytes) == Laws.begin_after_start(result, partition, lifetime, round, observation, bytes) : List<&2, Owner.Step>}:
  match result:
    case Owner.Advanced{_, _, _}: {==}
    case Owner.Rejected{_, _}: {==}

def outputs_exact(+state: Owner.State, +partition: Nat, +lifetime: Nat, +round: Nat, +bytes: Nat, +outputs: List<&2, C.Output>) -> {Owner.public_preparation_begin_observed(state, partition, lifetime, round, bytes, outputs) == Laws.begin_from_outputs(state, partition, lifetime, round, bytes, outputs) : List<&2, Owner.Step>}:
  match outputs:
    case Nil{}: {==}
    case C.EventEstablished{C.ObservationAdmitted{+observation}} <> _:
      started_exact(Owner.canonical_event(state, C.StartObservation{partition, lifetime, round, observation}), partition, lifetime, round, observation, bytes)
    case _ <> rest: outputs_exact(state, partition, lifetime, round, bytes, rest)

def admitted_exact(+result: Owner.Step, +partition: Nat, +lifetime: Nat, +round: Nat, +bytes: Nat) -> {Owner.public_preparation_begin_admitted(result, partition, lifetime, round, bytes) == Laws.begin_after_admit(result, partition, lifetime, round, bytes) : List<&2, Owner.Step>}:
  match result:
    case Owner.Rejected{_, _}: {==}
    case Owner.Advanced{+state, +outputs, _}:
      Equal.cong(List<&2, Owner.Step>, List<&2, Owner.Step>, tail => result <> tail,
        Owner.public_preparation_begin_observed(state, partition, lifetime, round, bytes, outputs),
        Laws.begin_from_outputs(state, partition, lifetime, round, bytes, outputs),
        outputs_exact(state, partition, lifetime, round, bytes, outputs))

def Laws.begin_exact(state, partition, lifetime, round, bytes):
  admitted_exact(Owner.canonical_event(state, C.AdmitObservation{partition, lifetime, round}), partition, lifetime, round, bytes)

def completed_exact(+result: Owner.Step, +partition: Nat, +lifetime: Nat, +round: Nat, +observation: Nat) -> {Owner.public_preparation_complete_prepared(result, partition, lifetime, round, observation) == Laws.complete_after_prepared(result, partition, lifetime, round, observation) : List<&2, Owner.Step>}:
  match result:
    case Owner.Advanced{_, _, _}: {==}
    case Owner.Rejected{_, _}: {==}

def Laws.complete_exact(state, partition, lifetime, round, operation, observation):
  completed_exact(Owner.canonical_event(state, C.PreparationCompleted{partition, lifetime, round, operation, Nil{}}), partition, lifetime, round, observation)
