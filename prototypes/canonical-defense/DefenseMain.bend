# Native host clock/input only. The canonical reducer remains state authority.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseProjection.bend as P
import ./DefenseRender.bend as R

type FrameState is Data:
  Frame{world: M.World,last: Nat,carry: U32,quit: Bool}

def event_step(frame: FrameState, event: Event) -> FrameState:
  match frame event:
    case Frame{world,last,carry,_} Close{}: Frame{world,last,carry,True{}}
    case Frame{world,last,carry,_} Key{27,True{}}: Frame{world,last,carry,True{}}
    case Frame{world,last,carry,quit} Key{code,True{}}: Frame{H.key(world,code),last,carry,quit}
    case Frame{world,last,carry,quit} Mouse{x,y,0,True{}}: Frame{H.click(world,x,y),last,carry,quit}
    case Frame{world,last,carry,quit} Move{x,y}: Frame{H.move(world,x,y),last,carry,quit}
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
    case False{}: Frame{world,now,0,False{}}
    case True{}:
      +total = (carry + elapsed : U32)
      Frame{physics(U32.to_nat((total / 20 : U32)),world),now,(total % 20 : U32),False{}}

def clock_step(+now: Nat, frame: FrameState) -> FrameState:
  match frame:
    case Frame{+world,last,carry,_}:
      clock_enabled(now,world,carry,U32.from_nat(Nat.min(Nat.sub(now,last),160n)),Bool.not(M.paused(world)))

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
    case Frame{+world,last,carry,quit}: (Frame{world,last,carry,quit},R.view(world))

def title(frame: FrameState) -> String:
  match frame:
    case Frame{world,_,_,_}: "Hapsland canonical defense | " ++ R.diagnostics(world)

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

def loop(fuel: Nat, window: Window, +frame: FrameState) -> IO(Unit):
  match fuel:
    case 0n: Window.close(window)
    case 1n+n:
      do IO<Unit>:
        named : Window <- Window.set_title(window,title(frame))
        draw(view(frame),named,w => f => loop(n,w,f))

def main() -> IO(Unit):
  do IO<Unit>:
    IO.print("Hapsland canonical defense: native layouts over the actual canonical reducer.")
    IO.print("Tab cycles switchback district/forked campus/resource junction. 1-7 choose tower; click map ground to build. U upgrades selected tower. N starts; Space pauses; R resets; Tab changes map only before construction or work; Esc exits.")
    now : Nat <- IO.now()
    window : Window <- IO.try(Window,Window.open("Hapsland canonical defense",1024,768))
    loop(4294967295n,window,Frame{H.initial(),now,0,False{}})
