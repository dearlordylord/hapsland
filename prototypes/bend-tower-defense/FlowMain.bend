# Native real-time driver; all input, clocks, mechanics and images are Bend.
import Base
import ./FlowModel.bend as M
import ./FlowGame.bend as G
import ./FlowRender.bend as R
import ./FlowScenario.bend as S

type FrameState is Data:
  Frame{scenario: U32, game: M.State, last: Nat, carry: U32, quit: Bool}

def event_step(state: FrameState, event: Event) -> FrameState:
  match state event:
    case Frame{scenario, game, last, carry, _} Close{}:
      Frame{scenario, game, last, carry, True{}}
    case Frame{scenario, game, last, carry, quit} Key{27, True{}}:
      Frame{scenario, game, last, carry, True{}}
    case Frame{+scenario, _, last, _, quit} Key{9, True{}}:
      +next = ((scenario + 1) % 4 : U32)
      Frame{next, G.initial(S.select(next)), last, 0, quit}
    case Frame{+scenario, game, last, carry, quit} Key{code, True{}}:
      Frame{scenario, G.key(S.select(scenario), game, code), last, carry, quit}
    case Frame{+scenario, game, last, carry, quit} Mouse{x, y, button, True{}}:
      Frame{scenario, G.click(S.select(scenario), game, x, y, button), last, carry, quit}
    case Frame{scenario, game, last, carry, quit} Move{x, y}:
      Frame{scenario, game, last, carry, quit}
    case state _:
      state

def events_fold(events: List<Event>, state: FrameState) -> FrameState:
  match events:
    case Nil{}:
      state
    case event <> rest:
      events_fold(rest, event_step(state, event))

def physics(fuel: Nat, +config: M.Config, game: M.State) -> M.State:
  match fuel:
    case 0n:
      game
    case 1n+n:
      physics(n, config, G.advance(config, game))

def enabled(state: M.State) -> Bool:
  match state:
    case M.World{_, _, _, +phase, _, _, _, _, _, _, paused, _, _, _, _, _, _, _}:
      Bool.not(paused) && U32.is_eq(phase, 1)

def clock_enabled(+now: Nat, +scenario: U32, game: M.State, +carry: U32, +elapsed: U32, active: Bool) -> FrameState:
  match active:
    case False{}:
      Frame{scenario, game, now, 0, False{}}
    case True{}:
      +total = (carry + elapsed : U32)
      Frame{scenario, physics(U32.to_nat((total / 20 : U32)), S.select(scenario), game), now, (total % 20 : U32), False{}}

def clock_step(+now: Nat, state: FrameState) -> FrameState:
  match state:
    case Frame{scenario, +game, last, carry, quit}:
      clock_enabled(now, scenario, game, carry, U32.from_nat(Nat.min(Nat.sub(now, last), 160n)), enabled(game))

def finish_tick(state: FrameState, quitting: Bool) -> IO(Maybe<FrameState>):
  match quitting:
    case True{}:
      IO.pure(Maybe<FrameState>, None{})
    case False{}:
      do IO<Maybe<FrameState>>:
        now : Nat <- IO.now()
        return Some{clock_step(now, state)}

def tick_finish(+state: FrameState) -> IO(Maybe<FrameState>):
  match state:
    case Frame{scenario, game, last, carry, quit}:
      finish_tick(state, quit)

def tick(events: List<Event>, state: FrameState) -> IO(Maybe<FrameState>):
  tick_finish(events_fold(events, state))

def view_result(scenario: U32, last: Nat, carry: U32, quit: Bool, rendered: M.State & Image) -> FrameState & Image:
  (next, image) = rendered
  (Frame{scenario, next, last, carry, quit}, image)

def view(state: FrameState) -> FrameState & Image:
  match state:
    case Frame{+scenario, game, last, carry, quit}:
      view_result(scenario, last, carry, quit, R.view(S.select(scenario), game))

def title(state: FrameState) -> String:
  match state:
    case Frame{scenario, game, _, _, _}:
      "Bend flow watch | " ++ G.status(game)

def next_window(next: Maybe<FrameState>, window: Window, rest: Window -> FrameState -> IO(Unit)) -> IO(Unit):
  match next:
    case None{}:
      Window.close(window)
    case Some{state}:
      rest(window, state)

def after_frame(shown: Window & Image & List<Event>, state: FrameState,
  rest: Window -> FrameState -> IO(Unit)) -> IO(Unit):
  (window, image, events) = shown
  do IO<Unit>:
    Unit <- IO.pure(Unit, Image.free(4n, image))
    IO.bind(Maybe<FrameState>, Unit, tick(events, state), next => next_window(next, window, rest))

def draw(drawn: FrameState & Image, window: Window,
  rest: Window -> FrameState -> IO(Unit)) -> IO(Unit):
  (state, image) = drawn
  do IO<Unit>:
    shown : Window & Image & List<Event> <- Window.frame(window, image)
    after_frame(shown, state, rest)

# Native-only loop, with no implicit GPU dispatch or authored host code.
def loop(fuel: Nat, window: Window, +state: FrameState) -> IO(Unit):
  match fuel:
    case 0n:
      Window.close(window)
    case 1n+n:
      do IO<Unit>:
        named : Window <- Window.set_title(window, title(state))
        draw(view(state), named, w => s => loop(n, w, s))

def main() -> IO(Unit):
  do IO<Unit>:
    IO.print("Hapsland / Bend flow watch (standalone prototype)")
    IO.print("1/2/3/4 select stage. +/- move one worker from/to the reserve.")
    IO.print("[ / ] admission pace. N/Enter start. Space pause. R reset. Tab next scenario/reset. Escape quit.")
    now : Nat <- IO.now()
    window : Window <- IO.try(Window, Window.open("Hapsland — Bend flow watch", 512, 512))
    loop(4294967295n, window, Frame{0, G.initial(S.select(0)), now, 0, False{}})
