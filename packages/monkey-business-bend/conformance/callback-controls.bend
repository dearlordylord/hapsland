import Base
import ../Callbacks.bend as Callbacks
import ../Driver.bend as Driver
import ../../agent-flow-bend/Canonical.bend as Canonical

# Original controls and original captured action, not events copied from JS.
# The exact public/native consumer fixture will also exercise Canonical fences.
def owner() -> Callbacks.Owner:
  Callbacks.Owner{1n, 2n, 3n, 4n}

def target() -> Callbacks.Target:
  Callbacks.Target{owner(), Callbacks.JevSettled{5n}, 6n}

def action() -> Driver.Action:
  Driver.Action{Canonical.JevRequestSettled{1n, 2n, 3n, 4n, 5n, Canonical.RequestClear{}, True{}}, 7n, None{}, False{}, None{}}

def state() -> Callbacks.State:
  Callbacks.issue(Callbacks.initial(), owner(), 6n, 7n, action())

def state_of(changed: Callbacks.Changed) -> Callbacks.State:
  match changed:
    case Callbacks.Changed{state, _, _, _}: state

def status_code(status: Callbacks.Status) -> Nat:
  match status:
    case Callbacks.Queued{}: 1n
    case Callbacks.Held{}: 2n
    case Callbacks.Dropped{}: 3n

def originals(items: List<&2, Callbacks.Original>) -> List<&2, Nat>:
  match items:
    case Nil{}: Nil{}
    case Callbacks.Original{Callbacks.Fact{Callbacks.Target{_, _, issued}, at, _}, status, order} <> tail:
      issued <> at <> status_code(status) <> order <> originals(tail)

def retained(state: Callbacks.State) -> List<&2, Nat>:
  match state:
    case Callbacks.State{items}: originals(items)

def applicability(result: Callbacks.Applicability) -> Nat:
  match result:
    case Callbacks.Applied{}: 1n
    case Callbacks.Missing{}: 2n
    case Callbacks.NotQueued{}: 3n
    case Callbacks.NotHeld{}: 4n

def scheduled(items: List<&2, Callbacks.Scheduled>) -> List<&2, Nat>:
  match items:
    case Nil{}: Nil{}
    case Callbacks.Scheduled{at, order, Driver.Action{Canonical.JevRequestSettled{p, l, r, o, id, _, _}, _, _, _, _}} <> tail:
      at <> order <> p <> l <> r <> o <> id <> scheduled(tail)
    case _ <> tail: 99n <> scheduled(tail)

def row(changed: Callbacks.Changed) -> List<&2, Nat>:
  match changed:
    case Callbacks.Changed{state, result, cancel, schedule}:
      applicability(result) <> List.append(&2, Nat, retained(state), List.append(&2, Nat, cancel, scheduled(schedule)))

def scenarios() -> List<&2, List<&2, Nat>>:
  +held = Callbacks.apply(state(), target(), Callbacks.Hold{}, 8n, 9n)
  +released = Callbacks.apply(state_of(held), target(), Callbacks.Release{}, 10n, 11n)
  [row(held), row(released),
    row(Callbacks.apply(state_of(released), target(), Callbacks.Hold{}, 12n, 13n)),
    row(Callbacks.apply(state(), target(), Callbacks.Drop{}, 8n, 9n)),
    row(Callbacks.apply(state(), target(), Callbacks.Reorder{}, 8n, 9n)),
    row(Callbacks.apply_receipt(Callbacks.delivered(state(), 6n), target(), Callbacks.Duplicate{},
      Some{Callbacks.Fact{target(), 7n, action()}}, 10n, 11n)),
    row(Callbacks.apply_receipt(Callbacks.delivered(state(), 6n), target(), Callbacks.Duplicate{}, None{}, 10n, 11n)),
    row(Callbacks.apply(state(), Callbacks.Target{Callbacks.Owner{1n, 9n, 3n, 4n}, Callbacks.JevSettled{5n}, 6n}, Callbacks.Hold{}, 8n, 9n)),
    row(Callbacks.apply(state(), target(), Callbacks.Release{}, 8n, 9n))]


def comma(rest: String) -> String:
  match rest:
    case SNil{}: SNil{}
    case SCon{head, tail}: String.append(",", SCon{head, tail})

def numbers(items: List<&2, Nat>) -> String:
  match items:
    case Nil{}: ""
    case head <> tail: String.append(Nat.show(head), comma(numbers(tail)))

def bracket(text: String) -> String:
  String.append("[", String.append(text, "]"))

def rows(items: List<&2, List<&2, Nat>>) -> String:
  match items:
    case Nil{}: ""
    case head <> tail: String.append(bracket(numbers(head)), comma(rows(tail)))

def main() -> IO(Unit):
  IO.print(bracket(rows(scenarios())))
