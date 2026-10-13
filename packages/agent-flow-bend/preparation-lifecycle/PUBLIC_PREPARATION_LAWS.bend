import Base
import ./CanonicalResolverOwner.bend as Owner
import ../Canonical.bend as C

# Approved by delegated Astra review on 2026-10-13: exact former public event
# sequence over arbitrary inputs, including every refused prefix. This pure
# specification does not assert atomicity, reentrant hooks or decode success.
def begin_after_start(+started: Owner.Step, partition: Nat, lifetime: Nat, round: Nat, observation: Nat, bytes: Nat) -> List<&2, Owner.Step>:
  match started:
    case Owner.Rejected{_, _}: started <> Nil{}
    case Owner.Advanced{state, _, _}:
      started <> Owner.canonical_event(state, C.BeginObservedPreparation{partition, lifetime, round, observation, bytes}) <> Nil{}

def begin_from_outputs(state: Owner.State, +partition: Nat, +lifetime: Nat, +round: Nat, bytes: Nat, outputs: List<&2, C.Output>) -> List<&2, Owner.Step>:
  match outputs:
    case Nil{}: Owner.Rejected{state, Owner.WrongPhase{}} <> Nil{}
    case C.EventEstablished{C.ObservationAdmitted{+observation}} <> _:
      begin_after_start(Owner.canonical_event(state, C.StartObservation{partition, lifetime, round, observation}), partition, lifetime, round, observation, bytes)
    case _ <> rest: begin_from_outputs(state, partition, lifetime, round, bytes, rest)

def begin_after_admit(+admitted: Owner.Step, partition: Nat, lifetime: Nat, round: Nat, bytes: Nat) -> List<&2, Owner.Step>:
  match admitted:
    case Owner.Rejected{_, _}: admitted <> Nil{}
    case Owner.Advanced{state, outputs, _}:
      admitted <> begin_from_outputs(state, partition, lifetime, round, bytes, outputs)

def begin_spec(+state: Owner.State, +partition: Nat, +lifetime: Nat, +round: Nat, bytes: Nat) -> List<&2, Owner.Step>:
  begin_after_admit(Owner.canonical_event(state, C.AdmitObservation{partition, lifetime, round}), partition, lifetime, round, bytes)

# Every intermediate publication and issued ID matches; rejection ends the list.
law begin_exact:
  for +state: Owner.State
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +bytes: Nat
  {Owner.begin_public_preparation(state, partition, lifetime, round, bytes) == begin_spec(state, partition, lifetime, round, bytes) : List<&2, Owner.Step>}

def complete_after_prepared(+prepared: Owner.Step, partition: Nat, lifetime: Nat, round: Nat, observation: Nat) -> List<&2, Owner.Step>:
  match prepared:
    case Owner.Rejected{_, _}: prepared <> Nil{}
    case Owner.Advanced{state, _, _}:
      prepared <> Owner.canonical_event(state, C.CompleteObservation{partition, lifetime, round, observation}) <> Nil{}

def complete_spec(+state: Owner.State, +partition: Nat, +lifetime: Nat, +round: Nat, operation: Nat, observation: Nat) -> List<&2, Owner.Step>:
  complete_after_prepared(Owner.canonical_event(state, C.PreparationCompleted{partition, lifetime, round, operation, Nil{}}), partition, lifetime, round, observation)

# Completion retains its first publication even when the observation is refused.
law complete_exact:
  for +state: Owner.State
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +operation: Nat
  for +observation: Nat
  {Owner.complete_public_preparation(state, partition, lifetime, round, operation, observation) == complete_spec(state, partition, lifetime, round, operation, observation) : List<&2, Owner.Step>}
