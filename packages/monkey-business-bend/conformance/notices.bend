import Base
import ../NoticeScenario.bend as Scenario
import ../../agent-flow-bend/Canonical.bend as C
import ../../agent-flow-bend/Ledger.bend as Ledger
import ../../agent-flow-bend/CollectionState.bend as Collection
import ../../agent-flow-bend/NoticeState.bend as Notices

# Independent directed inputs shared with the public concurrent-notice test.
# Reservation identities are the independently expected first two real grants.
def scope(partition: Nat, key: Nat) -> Scenario.Scope:
  Scenario.Scope{partition, 7n, key, 2n, 128n, 10n, 281474976710655n}

def accepted(result: C.Step) -> C.State:
  match result:
    case C.Advanced{state, _}: state
    case C.Rejected{state, _}: state

def send(state: C.State, event: C.CanonicalEvent) -> C.State:
  accepted(C.step(state, event))

def create(+state: C.State, +partition: Nat, +key: Nat, reservation: Nat) -> C.State:
  send(send(send(state, Scenario.failure(scope(partition, key), None{}, key, key)),
    C.ReserveCapacity{partition, 128n, Ledger.OperationalNotice{}}),
    C.NoticeCommit{key, partition, 7n, reservation, key, key, 2n})

def initial() -> C.State:
  create(create(C.initial(Ledger.Limits{512n, 1048576n, 16n, 65536n}), 1n, 101n, 1n), 2n, 202n, 2n)

def failures() -> C.State:
  send(send(send(initial(), Scenario.failure(scope(1n, 101n), Some{9n}, 101n, 101n)),
    Scenario.failure(scope(2n, 202n), Some{8n}, 202n, 202n)),
    Scenario.failure(scope(1n, 101n), Some{7n}, 101n, 101n))

def refreshed() -> C.State:
  send(failures(), Scenario.failure(scope(1n, 101n), Some{0n}, 101n, 101n))

def leased() -> C.State:
  send(send(refreshed(), Scenario.lease(101n)),
    Scenario.failure(scope(1n, 101n), Some{0n}, 101n, 101n))

def records(state: C.State) -> Notices.State:
  Collection.notice_state(C.collection_of(state))

def pending(value: Maybe<&2, Notices.Pending>) -> List<&2, Nat>:
  match value:
    case None{}: [0n, 0n, 0n]
    case Some{Notices.Pending{id, count, _, leased}}:
      [id, count, Bool.pick(Nat, leased, 1n, 0n)]

def record(value: Maybe<&2, Notices.Record>) -> List<&2, Nat>:
  match value:
    case None{}: [0n, 0n, 0n, 0n, 0n]
    case Some{Notices.Record{_, partition, _, _, suppressed, value}}:
      partition <> suppressed <> pending(value)

def row(state: C.State, key: Nat) -> List<&2, Nat>:
  record(Notices.find_record(key, Notices.records_of(records(state))))

def selected(result: C.Step) -> List<&2, Nat>:
  match result:
    case C.Advanced{_, C.NoticeSelected{ids} <> _}: ids
    case _: [999n]

def select(state: C.State, partition: Nat, composed: Bool, authority: Bool, allowed: List<&2, Nat>) -> List<&2, Nat>:
  selected(C.step(state, Scenario.collect(partition, 7n, composed, authority, allowed)))

def rows() -> List<&2, List<&2, Nat>>:
  [row(failures(), 101n), row(failures(), 202n), row(refreshed(), 101n),
   select(refreshed(), 1n, False{}, False{}, []), row(leased(), 101n),
   select(leased(), 2n, False{}, False{}, []), select(leased(), 1n, True{}, False{}, []),
   row(send(leased(), Scenario.acknowledge(101n)), 101n),
   row(send(leased(), Scenario.acknowledge(101n)), 202n),
   select(leased(), 2n, False{}, True{}, [101n]), select(leased(), 2n, False{}, True{}, [202n])]

def comma(text: String) -> String:
  match text:
    case SNil{}: SNil{}
    case SCon{head, tail}: String.append(",", SCon{head, tail})

def show_numbers(items: List<&2, Nat>) -> String:
  match items:
    case []: ""
    case head <> tail: String.append(Nat.show(head), comma(show_numbers(tail)))

def bracket(text: String) -> String:
  String.append("[", String.append(text, "]"))

def show_rows(items: List<&2, List<&2, Nat>>) -> String:
  match items:
    case []: ""
    case head <> tail: String.append(bracket(show_numbers(head)), comma(show_rows(tail)))

def main() -> IO(Unit):
  do IO<Unit>:
    IO.print(bracket(show_rows(rows())))
