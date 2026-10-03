import Base
import ../agent-flow-bend/Canonical.bend as Canonical
import ./Callbacks.bend as Callbacks
import ./NoticeScenario.bend as NoticeScenario

type State is Data:
  State{callbacks: Callbacks.State, notices: NoticeScenario.State, clocks: List<&2, NoticeScenario.Clock>}

def initial() -> State:
  State{Callbacks.initial(), NoticeScenario.initial(), Nil{}}

def callbacks(state: State) -> Callbacks.State:
  match state:
    case State{callbacks, _, _}: callbacks

def with_callbacks(state: State, callbacks: Callbacks.State) -> State:
  match state:
    case State{_, notices, clocks}: State{callbacks, notices, clocks}

def retain(state: State, canonical: Canonical.State) -> State:
  match state:
    case State{callbacks, notices, clocks}: State{Callbacks.retain(callbacks, canonical), notices, clocks}

def notice_requested(state: State, scope: NoticeScenario.Scope, key: Nat, sequence: Nat, commands: List<&2,Canonical.Command>, now: Nat) -> NoticeScenario.Followup:
  match state:
    case State{_, notices, _}: NoticeScenario.request(notices, scope, key, sequence, commands)

def notice_reserved(state: State, partition: Nat, commands: List<&2,Canonical.Command>) -> NoticeScenario.Followup:
  match state:
    case State{_, NoticeScenario.State{pending}, _}: NoticeScenario.reserved(pending,partition,commands)
