import Base
import ./Advicees.bend as Advicees

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
