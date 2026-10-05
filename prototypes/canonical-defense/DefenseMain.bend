# Native host clock/input only. The canonical reducer remains state authority.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseProjection.bend as P
import ./DefenseRender.bend as R
import ./DefenseMap.bend as D

def world_value(items: List<&2,M.World>) -> M.World:
  match items:
    case world <> _: world
    case Nil{}: H.initial()

type FrameState is Data:
  Frame{world: List<&2,M.World>,last: Nat,carry: U32,quit: Bool}

def event_step(frame: FrameState, event: Event) -> FrameState:
  match frame event:
    case Frame{world,last,carry,_} Close{}: Frame{world,last,carry,True{}}
    case Frame{world,last,carry,_} Key{27,True{}}: Frame{world,last,carry,True{}}
    case Frame{world,last,carry,quit} Key{code,True{}}: Frame{[H.key(world_value(world),code)],last,carry,quit}
    case Frame{world,last,carry,quit} Mouse{x,y,0,True{}}: Frame{[H.click(world_value(world),x,y)],last,carry,quit}
    case Frame{world,last,carry,quit} Move{x,y}: Frame{[H.move(world_value(world),x,y)],last,carry,quit}
    case frame _: frame

def events_fold(events: List<Event>, frame: FrameState) -> FrameState:
  match events:
    case Nil{}: frame
    case event <> tail: events_fold(tail,event_step(frame,event))

def physics(fuel: Nat, world: M.World) -> M.World:
  match fuel:
    case 0n: world
    case 1n+n: physics(n,H.tick(world))

def clock_enabled(+now: Nat, world: M.World, +carry: U32, elapsed: U32, active: Bool) -> FrameState:
  match active:
    case False{}: Frame{[world],now,0,False{}}
    case True{}:
      +total = (carry + elapsed : U32)
      +steps = U32.min(8,(total / 20 : U32))
      Frame{[physics(U32.to_nat(steps),world)],now,M.sub(total,(steps * 20 : U32)),False{}}

def clock_step(+now: Nat, frame: FrameState) -> FrameState:
  match frame:
    case Frame{+world,last,carry,_}:
      clock_enabled(now,world_value(world),carry,U32.from_nat(Nat.sub(now,last)),H.clock_active(world_value(world)))

def finish(+frame: FrameState) -> IO(Maybe<FrameState>):
  match frame:
    case Frame{_,_,_,True{}}: IO.pure(Maybe<FrameState>,None{})
    case _:
      do IO<Maybe<FrameState>>:
        now : Nat <- IO.now()
        return Some{clock_step(now,frame)}

def tick(events: List<Event>, frame: FrameState) -> IO(Maybe<FrameState>):
  finish(events_fold(events,frame))

def view(frame: FrameState) -> FrameState & Image:
  match frame:
    case Frame{+world,last,carry,quit}: (Frame{world,last,carry,quit},R.view(world_value(world)))

def title(frame: FrameState) -> String:
  match frame:
    case Frame{world,_,_,_}: "Hapsland canonical defense | " ++ R.diagnostics(world_value(world))

def next_window(next: Maybe<FrameState>, window: Window, rest: Window -> FrameState -> IO(Unit)) -> IO(Unit):
  match next:
    case None{}: Window.close(window)
    case Some{state}: rest(window,state)

def after_frame(shown: Window & Image & List<Event>, state: FrameState, rest: Window -> FrameState -> IO(Unit)) -> IO(Unit):
  (window,image,events) = shown
  do IO<Unit>:
    Unit <- IO.pure(Unit,Image.free(4n,image))
    IO.bind(Maybe<FrameState>,Unit,tick(events,state),next => next_window(next,window,rest))

def draw(drawn: FrameState & Image, window: Window, rest: Window -> FrameState -> IO(Unit)) -> IO(Unit):
  (state,image) = drawn
  do IO<Unit>:
    shown : Window & Image & List<Event> <- Window.frame(window,image)
    after_frame(shown,state,rest)

# The on-screen HUD remains per-frame; native debug-title polling need not be.
def named_window(refresh: Bool,window: Window,frame: FrameState) -> IO(Window):
  match refresh:
    case False{}: IO.pure(Window,window)
    case True{}: Window.set_title(window,title(frame))

def loop(fuel: Nat, window: Window, +frame: FrameState) -> IO(Unit):
  match fuel:
    case 0n: Window.close(window)
    case 1n++n:
      do IO<Unit>:
        named : Window <- named_window(Nat.is_eq(fuel,4294967295n) || Nat.is_eq(Nat.mod(fuel,3n),0n),window,frame)
        draw(view(frame),named,w => f => loop(n,w,f))

def launch() -> IO(Unit):
  do IO<Unit>:
    IO.print("Hapsland canonical defense: native layouts over the actual canonical reducer.")
    IO.print("Build first: 1-3 choose tower; click map ground to build. N/Enter starts work from the entrance, then injects more workload; U upgrades; B cycles burst size 1/5/10/20. A suspends/resumes future arrivals; Space/P pauses; [ slows arrivals / ] speeds arrivals; R resets to building first; Tab changes the unused map; Esc exits.")
    now : Nat <- IO.now()
    window : Window <- IO.try(Window,Window.open("Hapsland canonical defense",1024,768))
    loop(4294967295n,window,Frame{[H.initial()],now,0,False{}})

# Authored maps cannot launch with tangent/corner entrances or looping interiors.
def checked_launch(valid: Bool) -> IO(Unit):
  match valid:
    case True{}: launch()
    case False{}: IO.die(Unit,1,"Invalid map: roads must cross midpoint wall ports normally; room paths must be finite and simple.")

def main() -> IO(Unit):
  checked_launch(D.layout_valid(0) && D.layout_valid(1) && D.layout_valid(2))
