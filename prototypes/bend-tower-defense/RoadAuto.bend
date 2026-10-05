# Automatic WAVES ONLY. Shared session Tasks control starts, never construction.
import Base
import ./RoadModel.bend as M
import ./RoadGame.bend as G
import ../../packages/monkey-business-bend/Session.bend as Session

type State is Data:
  Schedule{enabled: Bool, pending: Bool, left: U32, live: Bool, task: Nat, session: Session.State}

type Outcome is Data:
  Tick{game: M.State, auto: State}

def settings() -> Session.Config:
  Session.Settings{20, 0, 1, 3000, 0, 300}

def task_delay(events: List<&2, Session.Input>) -> U32:
  match events:
    case Nil{}: 3000
    case Con{+event, tail}: M.choose(Session.event_delay(event), task_delay(tail), U32.is_eq(Session.event_kind(event), 0))

def prepared(+enabled: Bool, transition: Session.Transition, grace: Bool) -> State:
  match transition:
    case Session.Changed{+session, events}:
      Schedule{enabled, enabled, M.choose(3000, task_delay(events), grace), False{}, Session.state_task(session), session}

def initial() -> State:
  prepared(False{}, Session.next(settings(), Session.initial(settings(), 152, [97,103,101,110,116,45,49], 100n, [100n])), True{})

def enabled(state: State) -> Bool:
  match state:
    case Schedule{on, _, _, _, _, _}: on

def pending(state: State) -> Bool:
  match state:
    case Schedule{_, value, _, _, _, _}: value

def left(state: State) -> U32:
  match state:
    case Schedule{_, _, value, _, _, _}: value

def task(state: State) -> Nat:
  match state:
    case Schedule{_, _, _, _, value, _}: value

def disarm(state: State) -> State:
  match state:
    case Schedule{_, _, _, live, task, session}: Schedule{False{}, False{}, 3000, live, task, session}

def toggle_live(state: State, canArm: Bool) -> State:
  match state:
    case Schedule{on, _, _, live, task, session}:
      +next = Bool.not(on)
      Schedule{next, next && canArm, 3000, live, task, session}

def toggle_allowed(+config: M.Config, +game: M.State, state: State) -> State:
  toggle_live(state, U32.is_eq(G.state_phase(game), 0) && (G.state_wave(game) < G.config_waves(config) : U32))

def toggle_terminal(config: M.Config, +game: M.State, +state: State, terminal: Bool) -> State:
  match terminal:
    case True{}: disarm(state)
    case False{}: toggle_allowed(config, game, state)

def toggle(config: M.Config, +game: M.State, state: State) -> State:
  toggle_terminal(config, game, state, (G.state_phase(game) >= 2 : U32))

def consume(state: State) -> State:
  match state:
    case Schedule{on, _, _, _, task, session}: Schedule{on, False{}, 0, True{}, task, session}

# Manual N/Enter consumes exactly the same already-prepared Task slot.
def observed_start(+state: State, started: Bool) -> State:
  match started:
    case True{}: consume(state)
    case False{}: state

def observed(before: M.State, +after: M.State, +state: State) -> State:
  observed_start(state, (G.state_wave(after) > G.state_wave(before) : U32))

def expire(+config: M.Config, +game: M.State, +state: State, due: Bool) -> Outcome:
  match due:
    case True{}: Tick{G.start(config, game), consume(state)}
    case False{}: Tick{game, state}

def countdown_due(+config: M.Config, +game: M.State, state: State) -> Outcome:
  match state:
    case Schedule{+on, +pending, left, live, task, session}:
      +remaining = M.sub(left, 20)
      expire(config, game, Schedule{on, pending, remaining, live, task, session}, on && pending && U32.is_eq(remaining, 0))

def countdown_enabled(config: M.Config, +game: M.State, +state: State, on: Bool) -> Outcome:
  match on:
    case True{}: countdown_due(config, game, state)
    case False{}: Tick{game, state}

def countdown(config: M.Config, game: M.State, +state: State) -> Outcome:
  countdown_enabled(config, game, state, enabled(state) && pending(state))

def prep(+config: M.Config, +game: M.State, state: State) -> Outcome:
  match state:
    case Schedule{+on, _, _, True{}, _, session}:
      # Only actual completion asks shared Session for the next Task/pause.
      Tick{game, prepared(on, Session.on_finish(settings(), session, False{}), False{})}
    case state:
      countdown(config, game, state)

def bounded_prep(config: M.Config, +game: M.State, +state: State, room: Bool) -> Outcome:
  match room:
    case True{}: prep(config, game, state)
    case False{}: Tick{game, disarm(state)}

def phase_step(+config: M.Config, +game: M.State, +state: State, phase: U32) -> Outcome:
  match phase:
    case 0:
      bounded_prep(config, game, state, (G.state_wave(game) < G.config_waves(config) : U32))
    case 1: Tick{game, state}
    case _: Tick{game, disarm(state)}

def unpaused(+config: M.Config, +game: M.State, +state: State, paused: Bool) -> Outcome:
  match paused:
    case True{}: Tick{game, state}
    case False{}: phase_step(config, game, state, G.state_phase(game))

# RoadGame owns every within-wave tick and all demand/Stop/outcome mechanics.
def step(+config: M.Config, +game: M.State, state: State) -> Outcome:
  +advanced = G.advance(config, game)
  unpaused(config, advanced, state, G.state_paused(game))

def result_game(result: Outcome) -> M.State:
  match result:
    case Tick{game, _}: game

def result_auto(result: Outcome) -> State:
  match result:
    case Tick{_, auto}: auto

def clock_active(+game: M.State, +state: State) -> Bool:
  Bool.not(G.state_paused(game)) && (G.running(game) || (enabled(state) && U32.is_eq(G.state_phase(game), 0)))

def word(on: Bool) -> String:
  match on:
    case True{}: "ON"
    case False{}: "OFF"

def status_mode(on: Bool, pending: Bool, left: U32, task: Nat) -> String:
  match on pending:
    case False{} _: "AUTO WAVES OFF / A TOGGLE / R TAB RESET OFF"
    case True{} True{}: "AUTO WAVES ON / NEXT " ++ U32.show(left) ++ " MS / TASK " ++ Nat.show(task)
    case True{} False{}: "AUTO WAVES ON / WAIT FOR STOP / TASK " ++ Nat.show(task)

def paused_word(paused: Bool) -> String:
  match paused:
    case True{}: " / PAUSED"
    case False{}: ""

def status(game: M.State, state: State) -> String:
  match state:
    case Schedule{on, pending, left, _, task, _}:
      status_mode(on, pending, left, task) ++ paused_word(G.state_paused(game))

def diagnostics(state: State) -> String:
  match state:
    case Schedule{on, pending, left, _, task, _}:
      " AUTO=" ++ word(on) ++ " AUTO_PENDING=" ++ word(pending) ++ " AUTO_LEFT=" ++ U32.show(left) ++ " AUTO_TASK=" ++ Nat.show(task)
