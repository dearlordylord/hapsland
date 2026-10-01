# Native real-time driver; all input, clocks, mechanics and images are Bend.
import Base
import ./RoadModel.bend as M
import ./RoadGame.bend as G
import ./RoadRender.bend as R
import ./RoadScenario.bend as S
import ./RoadAuto.bend as A
import ./RoadPreview.bend as P

type FrameState is Data:
  Frame{scenario: U32, game: M.State, auto: A.State, last: Nat, carry: U32, quit: Bool}

def event_step(state: FrameState, event: Event) -> FrameState:
  match state event:
    case Frame{scenario, game, auto, last, carry, _} Close{}:
      Frame{scenario, game, auto, last, carry, True{}}
    case Frame{scenario, game, auto, last, carry, quit} Key{27, True{}}:
      Frame{scenario, game, auto, last, carry, True{}}
    case Frame{+scenario, _, _, last, _, quit} Key{9, True{}}:
      +next = ((scenario + 1) % 4 : U32)
      Frame{next, G.initial(S.select(next)), A.initial(), last, 0, quit}
    case Frame{+scenario, _, _, last, _, quit} Key{82, True{}}:
      Frame{scenario, G.initial(S.select(scenario)), A.initial(), last, 0, quit}
    case Frame{+scenario, _, _, last, _, quit} Key{114, True{}}:
      Frame{scenario, G.initial(S.select(scenario)), A.initial(), last, 0, quit}
    case Frame{+scenario, +game, auto, last, _, quit} Key{65, True{}}:
      Frame{scenario, game, A.toggle(S.select(scenario), game, auto), last, 0, quit}
    case Frame{+scenario, +game, auto, last, _, quit} Key{97, True{}}:
      Frame{scenario, game, A.toggle(S.select(scenario), game, auto), last, 0, quit}
    case Frame{+scenario, +game, auto, last, carry, quit} Key{code, True{}}:
      +next = P.key(S.select(scenario), game, code)
      Frame{scenario, next, A.observed(game, next, auto), last, carry, quit}
    case Frame{+scenario, game, auto, last, carry, quit} Mouse{x, y, button, True{}}:
      Frame{scenario, G.click(S.select(scenario), game, x, y, button), auto, last, carry, quit}
    case Frame{scenario, game, auto, last, carry, quit} Move{x, y}:
      Frame{scenario, G.move(game, x, y), auto, last, carry, quit}
    case state _: state

def events_fold(events: List<Event>, state: FrameState) -> FrameState:
  match events:
    case Nil{}: state
    case event <> rest: events_fold(rest, event_step(state, event))

def physics(fuel: Nat, +config: M.Config, result: A.Outcome) -> A.Outcome:
  match fuel result:
    case 0n result: result
    case 1n+n A.Tick{game, auto}:
      physics(n, config, A.step(config, game, auto))

def clock_result(now: Nat, scenario: U32, carry: U32, result: A.Outcome) -> FrameState:
  match result:
    case A.Tick{game, auto}: Frame{scenario, game, auto, now, carry, False{}}

def clock_enabled(+now: Nat, +scenario: U32, game: M.State, auto: A.State, +carry: U32, +elapsed: U32, active: Bool) -> FrameState:
  match active:
    case False{}: Frame{scenario, game, auto, now, 0, False{}}
    case True{}:
      +total = (carry + elapsed : U32)
      clock_result(now, scenario, (total % 20 : U32), physics(U32.to_nat((total / 20 : U32)), S.select(scenario), A.Tick{game, auto}))

def clock_step(+now: Nat, state: FrameState) -> FrameState:
  match state:
    case Frame{scenario, +game, +auto, last, carry, quit}:
      clock_enabled(now, scenario, game, auto, carry, U32.from_nat(Nat.min(Nat.sub(now, last), 160n)), A.clock_active(game, auto))

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
    case Frame{scenario, game, auto, last, carry, quit}:
      finish_tick(state, quit)

def tick(events: List<Event>, state: FrameState) -> IO(Maybe<FrameState>):
  tick_finish(events_fold(events, state))

def view_result(scenario: U32, auto: A.State, last: Nat, carry: U32, quit: Bool, rendered: M.State & Image) -> FrameState & Image:
  (next, image) = rendered
  (Frame{scenario, next, auto, last, carry, quit}, image)

def view(state: FrameState) -> FrameState & Image:
  match state:
    case Frame{+scenario, +game, +auto, last, carry, quit}:
      view_result(scenario, auto, last, carry, quit, R.view_auto(S.select(scenario), game, A.status(game, auto)))

def title(state: FrameState) -> String:
  match state:
    case Frame{scenario, +game, auto, _, _, _}:
      "Bend road defense | " ++ G.status(game) ++ R.diagnostics(S.select(scenario), game) ++ A.diagnostics(auto)

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
    IO.print("Hapsland / Bend road defense (standalone prototype)")
    IO.print("1 Rapid, 2 Batch, 3 Relay, 4 Parallelizer, 5 Coordinator, 6 Packager, 7 Shield.")
    IO.print("Click to build/select; U upgrades. Supports act automatically; no activation keys.")
    IO.print("A toggles automatic WAVES ONLY, initially OFF; 3sec grace/intermission. R/Tab reset auto OFF. Pause freezes countdown.")
    IO.print("Road enemies are safe; enemies at buildings cause damage. N/Enter start. Space pause. R reset. Tab next scenario/reset. Escape quit.")
    now : Nat <- IO.now()
    window : Window <- IO.try(Window, Window.open("Hapsland — Bend road defense", 1024, 768))
    loop(4294967295n, window, Frame{0, G.initial(S.select(0)), A.initial(), now, 0, False{}})
