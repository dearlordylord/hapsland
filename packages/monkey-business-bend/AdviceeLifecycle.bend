import Base
import ./Advicees.bend as Advicees
import ./Driver.bend as Driver
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Dispatch.bend as Dispatch
import ../agent-flow-bend/Admission.bend as Admission

# Declared advicee lifetime facts, not transport/socket connectivity. A departure
# fences new activity; production Canonical transitions own the actual cleanup.
type Status is Data:
  Active{}
  Disconnected{}
  Removed{}
type Entry is Data:
  Entry{partition: Nat, lifetime: Nat, status: Status}
type Action is Data:
  Disconnect{}
  Remove{}
  Resume{}
type Changed is Data:
  Changed{entries: List<&2, Entry>, previous: Maybe<&2, Entry>, current: Maybe<&2, Entry>, valid: Bool}

def partition(entry: Entry) -> Nat:
  match entry:
    case Entry{partition, _, _}: partition

def lifetime(entry: Entry) -> Nat:
  match entry:
    case Entry{_, lifetime, _}: lifetime

def active(status: Status) -> Bool:
  match status:
    case Active{}: True{}
    case _: False{}

def entry_active(entry: Entry) -> Bool:
  match entry:
    case Entry{_, _, status}: active(status)

def found(hit: Bool, entry: Entry, other: Maybe<&2, Entry>) -> Maybe<&2, Entry>:
  match hit:
    case True{}: Some{entry}
    case False{}: other

def lookup(entries: List<&2, Entry>, +owner: Nat) -> Maybe<&2, Entry>:
  match entries:
    case Nil{}: None{}
    case +head <> tail: found(Nat.is_eq(partition(head), owner), head, lookup(tail, owner))

def absent(entry: Maybe<&2, Entry>) -> Bool:
  match entry:
    case None{}: True{}
    case Some{_}: False{}

def register_valid(valid: Bool, entries: List<&2, Entry>, owner: Nat) -> List<&2, Entry>:
  match valid:
    case True{}: List.append(&2, Entry, entries, [Entry{owner, 1n, Active{}}])
    case False{}: entries

def register(+entries: List<&2, Entry>, +owner: Nat) -> List<&2, Entry>:
  register_valid(Advicees.bounded(owner) && absent(lookup(entries, owner)), entries, owner)

def replacement(hit: Bool, head: Entry, updated: Entry) -> Entry:
  match hit:
    case True{}: updated
    case False{}: head

def replace(entries: List<&2, Entry>, +updated: Entry) -> List<&2, Entry>:
  match entries:
    case Nil{}: []
    case +head <> tail: replacement(Nat.is_eq(partition(head), partition(updated)), head, updated) <> replace(tail, updated)

def accepted(+entries: List<&2, Entry>, +previous: Entry, +current: Entry) -> Changed:
  Changed{replace(entries, current), Some{previous}, Some{current}, True{}}

def refused(entries: List<&2, Entry>, +entry: Entry) -> Changed:
  Changed{entries, Some{entry}, Some{entry}, False{}}

def resumed(valid: Bool, entries: List<&2, Entry>, +entry: Entry) -> Changed:
  match valid:
    case True{}: accepted(entries, entry, Entry{partition(entry), Nat.add(lifetime(entry), 1n), Active{}})
    case False{}: refused(entries, entry)

def disconnected_status(status: Status) -> Status:
  match status:
    case Removed{}: Removed{}
    case _: Disconnected{}

def disconnected_entry_status(entry: Entry) -> Status:
  match entry:
    case Entry{_, _, status}: disconnected_status(status)

def known(entries: List<&2, Entry>, found: Maybe<&2, Entry>, action: Action) -> Changed:
  match found action:
    case None{} _: Changed{entries, None{}, None{}, False{}}
    case Some{+entry} Resume{}:
      resumed(Bool.not(entry_active(entry)) && Advicees.bounded(lifetime(entry)) && Nat.is_lt(lifetime(entry), Advicees.maximum()), entries, entry)
    case Some{+entry} Remove{}: accepted(entries, entry, Entry{partition(entry), lifetime(entry), Removed{}})
    case Some{+entry} Disconnect{}:
      accepted(entries, entry, Entry{partition(entry), lifetime(entry), disconnected_entry_status(entry)})

def change(+entries: List<&2, Entry>, owner: Nat, action: Action) -> Changed:
  known(entries, lookup(entries, owner), action)

def valid_entry(found: Maybe<&2, Entry>, +generation: Nat) -> Bool:
  match found:
    case Some{+entry}: entry_active(entry) && Nat.is_eq(lifetime(entry), generation)
    case None{}: False{}

def permits_activity(entries: List<&2, Entry>, owner: Nat, generation: Nat) -> Bool:
  valid_entry(lookup(entries, owner), generation)


# Captured cleanup intentions only. Running effects and original callbacks stay
# live until their factual completion; no terminal result is invented here.
type CleanupPlan is Data:
  CleanupPlan{actions: List<&2, Driver.Action>, operations: List<&2, Nat>}

def select_operation(owned: Bool, id: Nat, tail: List<&2, Nat>) -> List<&2, Nat>:
  match owned:
    case True{}: id <> tail
    case False{}: tail

def work_operations(work: List<&2, Canonical.Work>, +owner: Nat, +generation: Nat) -> List<&2, Nat>:
  match work:
    case Nil{}: []
    case Canonical.Work{p, l, _, id, _, _, _} <> tail:
      select_operation(Nat.is_eq(p, owner) && Nat.is_eq(l, generation), id, work_operations(tail, owner, generation))

def dispatch_operations(entries: List<&2, Dispatch.Entry>, +owner: Nat, +generation: Nat) -> List<&2, Nat>:
  match entries:
    case Nil{}: []
    case Dispatch.Entry{p, l, _, id, _, _, _} <> tail:
      select_operation(Nat.is_eq(p, owner) && Nat.is_eq(l, generation), id, dispatch_operations(tail, owner, generation))

def release_permits(permits: List<&2, Admission.Permit>, +owner: Nat, +generation: Nat) -> List<&2, Driver.Action>:
  match permits:
    case Nil{}: []
    case Admission.Permit{token, _, _, _, _} <> tail:
      Driver.immediate(Canonical.ReleasePermit{owner, generation, token}, False{}) <> release_permits(tail, owner, generation)

def admission_actions(active: Bool, owner: Nat, generation: Nat, round: Nat, now: Nat,
    permits: List<&2, Admission.Permit>) -> List<&2, Driver.Action>:
  match active:
    case True{}: [Driver.immediate(Canonical.ClosePermitRound{owner, generation, round, now}, False{})]
    case False{}: release_permits(permits, owner, generation)

def admission_found(found: Maybe<&2, Admission.AdmissionState>, +generation: Nat, now: Nat) -> List<&2, Driver.Action>:
  match found:
    case None{}: []
    case Some{Admission.AdmissionState{owner, +lifetime, round, active, _, _, permits}}:
      Bool.pick(List<&2, Driver.Action>, Nat.is_eq(lifetime, generation),
        admission_actions(active, owner, lifetime, round, now, permits), [])

def retire_found(found: Maybe<&2, Canonical.Round>, +generation: Nat) -> List<&2, Driver.Action>:
  match found:
    case None{}: []
    case Some{Canonical.Round{owner, +lifetime, round, _, _, _, _, _}}:
      Bool.pick(List<&2, Driver.Action>, Nat.is_eq(lifetime, generation),
        [Driver.immediate(Canonical.RetirePartition{owner, lifetime, round}, False{})], [])

def discard_named(operations: List<&2, Nat>) -> List<&2, Driver.Action>:
  match operations:
    case Nil{}: []
    case head <> tail: [Driver.immediate(Canonical.DiscardDispatch{head <> tail}, False{})]

def forget_found(found: Maybe<&2, Admission.AdmissionState>, +generation: Nat) -> List<&2, Driver.Action>:
  match found:
    case None{}: []
    case Some{Admission.AdmissionState{owner, +lifetime, _, _, _, _, _}}:
      Bool.pick(List<&2, Driver.Action>, Nat.is_eq(lifetime, generation),
        [Driver.immediate(Canonical.ForgetAdmission{owner, lifetime}, False{})], [])

def captured_cleanup(state: Canonical.State, +owner: Nat, +generation: Nat, now: Nat) -> CleanupPlan:
  match state:
    case Canonical.State{_, +rounds, work, _, _, +admissions, Dispatch.State{queued, running, _, _, _}, _, _}:
      +operations = List.append(&2, Nat, dispatch_operations(queued, owner, generation), dispatch_operations(running, owner, generation))
      CleanupPlan{List.append(&2, Driver.Action,
        admission_found(Canonical.find_admission(owner, admissions), generation, now),
        List.append(&2, Driver.Action, retire_found(Canonical.find_round(owner, rounds), generation),
        List.append(&2, Driver.Action, discard_named(operations),
          forget_found(Canonical.find_admission(owner, admissions), generation)))),
        List.append(&2, Nat, work_operations(work, owner, generation), operations)}

def cleanup(state: Canonical.State, entry: Entry, now: Nat) -> CleanupPlan:
  match entry:
    case Entry{owner, generation, _}: captured_cleanup(state, owner, generation, now)

def cleanup_if(departed: Bool, state: Canonical.State, entry: Entry, now: Nat) -> CleanupPlan:
  match departed:
    case True{}: cleanup(state, entry, now)
    case False{}: CleanupPlan{[], []}

def plan(state: Canonical.State, changed: Changed, now: Nat) -> CleanupPlan:
  match changed:
    case Changed{_, Some{+before}, Some{after}, True{}}:
      cleanup_if(entry_active(before) && Bool.not(entry_active(after)), state, before, now)
    case _: CleanupPlan{[], []}
