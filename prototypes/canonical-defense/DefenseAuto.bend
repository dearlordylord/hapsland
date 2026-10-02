# Host campaign schedule. Recurring Tasks come from the same Session source as Monkey Business.
import Base
import ../../packages/monkey-business-bend/Session.bend as Session

type State is Data:
  Schedule{wave: U32, enabled: Bool, pending: Bool, left: U32, live: Bool, task: Nat, session: Session.State}

def settings() -> Session.Config:
  Session.Settings{20, 0, 1, 3000, 0, 300}
def task_delay(events: List<&2, Session.Input>) -> U32:
  match events:
    case Nil{}: 3000
    case +event <> rest:
      Bool.pick(U32, U32.is_eq(Session.event_kind(event), 0), Session.event_delay(event), task_delay(rest))
def prepared(wave: U32, +enabled: Bool, transition: Session.Transition, grace: Bool) -> State:
  match transition:
    case Session.Changed{+session, events}:
      Schedule{wave, enabled, enabled, Bool.pick(U32, grace, 3000, task_delay(events)), False{}, Session.state_task(session), session}
def initial() -> State:
  prepared(0, False{}, Session.next(settings(), Session.initial(settings(), 152, [97,103,101,110,116,45,49], 100n, [100n])), True{})
def wave(state: State) -> U32:
  match state:
    case Schedule{v, _, _, _, _, _, _}: v
def enabled(state: State) -> Bool:
  match state:
    case Schedule{_, v, _, _, _, _, _}: v
def pending(state: State) -> Bool:
  match state:
    case Schedule{_, _, v, _, _, _, _}: v
def left(state: State) -> U32:
  match state:
    case Schedule{_, _, _, v, _, _, _}: v
def task(state: State) -> Nat:
  match state:
    case Schedule{_, _, _, _, _, v, _}: v
def disarm(state: State) -> State:
  match state:
    case Schedule{wave, _, _, _, live, task, session}: Schedule{wave, False{}, False{}, 3000, live, task, session}
def toggle(+state: State, canArm: Bool, terminal: Bool) -> State:
  match state:
    case Schedule{wave, +on, _, _, live, task, session}:
      Bool.pick(State, terminal, disarm(state), Schedule{wave, Bool.not(on), Bool.not(on) && canArm, 3000, live, task, session})
# Manual and automatic starts consume the same shared Task, exactly once.
def consume(state: State) -> State:
  match state:
    case Schedule{wave, on, _, _, _, task, session}: Schedule{(wave + 1 : U32), on, False{}, 0, True{}, task, session}
def finished_live(state: State) -> State:
  match state:
    case Schedule{wave, on, _, _, True{}, _, session}:
      prepared(wave, on, Session.on_finish(settings(), session, False{}), False{})
    case _: state
def finished(+state: State, terminal: Bool) -> State:
  Bool.pick(State, terminal, disarm(state), finished_live(state))
def countdown(state: State) -> State:
  match state:
    case Schedule{wave, +on, +pending, +left, live, task, session}:
      Schedule{wave, on, pending, Bool.pick(U32, on && pending, Bool.pick(U32, (left >= 20 : U32), (left - 20 : U32), 0), left), live, task, session}
def due(+state: State) -> Bool:
  enabled(state) && pending(state) && U32.is_eq(left(state), 0)
