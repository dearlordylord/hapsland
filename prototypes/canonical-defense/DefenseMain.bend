# Native host clock/input and recording only. Actual Host remains state authority.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseRecording.bend as Recording
import ./DefenseRender.bend as R
import ./DefenseMap.bend as D

def world_value(items: List<&2,M.World>) -> M.World:
  match items:
    case world <> _: world
    case Nil{}: H.initial()

# playback: 0 live, 1 playing, 2 paused, 3 ended.
type FrameState is Data:
  Frame{world: List<&2,M.World>,last: Nat,carry: U32,quit: Bool,playback: U32}

def event_step(frame: FrameState,event: Event) -> FrameState:
  match frame event:
    case Frame{world,last,carry,_,mode} Close{}: Frame{world,last,carry,True{},mode}
    case Frame{world,last,carry,_,mode} Key{27,True{}}: Frame{world,last,carry,True{},mode}
    case Frame{world,last,carry,quit,0} Key{code,True{}}: Frame{[H.key(world_value(world),code)],last,carry,quit,0}
    case Frame{world,last,carry,quit,0} Mouse{x,y,0,True{}}: Frame{[H.click(world_value(world),x,y)],last,carry,quit,0}
    case Frame{world,last,carry,quit,0} Move{x,y}: Frame{[H.move(world_value(world),x,y)],last,carry,quit,0}
    case Frame{world,last,_,quit,1} Key{32,True{}}: Frame{world,last,0,quit,2}
    case Frame{world,last,_,quit,2} Key{32,True{}}: Frame{world,last,0,quit,1}
    case Frame{world,last,_,quit,1} Key{112,True{}}: Frame{world,last,0,quit,2}
    case Frame{world,last,_,quit,2} Key{112,True{}}: Frame{world,last,0,quit,1}
    case frame _: frame

def event_record(file: File,+frame: FrameState,event: Event,+path: String,+header: String) -> IO(File):
  match frame event:
    case Frame{world,_,_,_,0} Key{114,True{}}: Recording.reset(file,path,header,M.layout(world_value(world)))
    case Frame{_,_,_,_,0} Key{27,True{}}: IO.pure(File,file)
    case Frame{_,_,_,_,0} Key{code,True{}}: Recording.append(file,Recording.Entry{1,code,0})
    case Frame{_,_,_,_,0} Mouse{x,y,0,True{}}: Recording.append(file,Recording.Entry{2,x,y})
    case Frame{_,_,_,_,0} Move{x,y}: Recording.append(file,Recording.Entry{3,x,y})
    case _ _: IO.pure(File,file)

def events_fold(events: List<Event>,file: File,+frame: FrameState,+path: String,+header: String) -> IO(File & FrameState):
  match events:
    case Nil{}: IO.pure(File & FrameState,(file,frame))
    case +event <> tail:
      do IO<File & FrameState>:
        recorded : File <- event_record(file,frame,event,path,header)
        events_fold(tail,recorded,event_step(frame,event),path,header)

def physics(fuel: Nat,world: M.World) -> M.World: Recording.ticks(fuel,world)

def clock_enabled(+now: Nat,world: M.World,+carry: U32,elapsed: U32,active: Bool) -> FrameState:
  match active:
    case False{}: Frame{[world],now,0,False{},0}
    case True{}:
      +total = (carry + elapsed : U32)
      +steps = U32.min(8,(total / 20 : U32))
      Frame{[physics(U32.to_nat(steps),world)],now,M.sub(total,(steps * 20 : U32)),False{},0}

def clock_step(+now: Nat,frame: FrameState) -> FrameState:
  match frame:
    case Frame{+world,last,carry,_,_}:
      clock_enabled(now,world_value(world),carry,U32.from_nat(Nat.sub(now,last)),M.active(world_value(world)) && Bool.not(M.paused(world_value(world))))

def tick_record(steps: U32,file: File) -> IO(File):
  match steps:
    case 0: IO.pure(File,file)
    case _: Recording.append(file,Recording.Entry{4,steps,0})
def clock_record(active: Bool,+now: Nat,file: File,+frame: FrameState) -> IO(File & FrameState):
  match active frame:
    case False{} _: IO.pure(File & FrameState,(file,clock_step(now,frame)))
    case True{} Frame{_,last,carry,_,_}:
      do IO<File & FrameState>:
        recorded : File <- tick_record(U32.min(8,((carry + U32.from_nat(Nat.sub(now,last))) / 20 : U32)),file)
        return (recorded,clock_step(now,frame))

# Read inputs in order until a recorded physics batch. No new engine is substituted.
def playback_entry(next: File & Maybe<&2,Recording.Entry>,frame: FrameState,
    rest: File -> FrameState -> IO(File & FrameState)) -> IO(File & FrameState):
  match next frame:
    case (file,None{}) Frame{world,last,carry,quit,_}:
      IO.pure(File & FrameState,(file,Frame{world,last,carry,quit,3}))
    case (file,Some{+entry}) Frame{world,last,carry,quit,mode}:
      rest(file,Frame{[Recording.apply(world_value(world),entry)],last,carry,quit,mode})
def playback_batch(entry: Maybe<&2,Recording.Entry>,file: File,frame: FrameState,
    rest: File -> FrameState -> IO(File & FrameState)) -> IO(File & FrameState):
  match entry:
    case Some{Recording.Entry{4,+a,+b}}:
      playback_entry((file,Some{Recording.Entry{4,a,b}}),frame,f => s => IO.pure(File & FrameState,(f,s)))
    case _: playback_entry((file,entry),frame,rest)
def playback_read(pair: File & Maybe<&2,Recording.Entry>,frame: FrameState,
    rest: File -> FrameState -> IO(File & FrameState)) -> IO(File & FrameState):
  (file,entry) = pair
  playback_batch(entry,file,frame,rest)
def playback(fuel: Nat,file: File,frame: FrameState) -> IO(File & FrameState):
  match fuel:
    case 0n: IO.pure(File & FrameState,(file,frame))
    case 1n+n:
      IO.bind(File & Maybe<&2,Recording.Entry>,File & FrameState,Recording.read(file),
        pair => playback_read(pair,frame,f => s => playback(n,f,s)))
def playback_clock(ready: Bool,+now: Nat,file: File,frame: FrameState) -> IO(File & FrameState):
  match ready frame:
    case True{} Frame{world,_,_,quit,mode}: playback(1024n,file,Frame{world,now,0,quit,mode})
    case False{} _: IO.pure(File & FrameState,(file,frame))
def finish_at(+now: Nat,file: File,+frame: FrameState) -> IO(File & FrameState):
  match frame:
    case Frame{world,_,_,False{},0}:
      clock_record(M.active(world_value(world)) && Bool.not(M.paused(world_value(world))),now,file,frame)
    case Frame{_,last,_,False{},1}: playback_clock((Nat.sub(now,last) >= 20n : Nat),now,file,frame)
    case _: IO.pure(File & FrameState,(file,frame))
def finish(pair: File & FrameState) -> IO(File & FrameState):
  (file,frame) = pair
  do IO<File & FrameState>:
    now : Nat <- IO.now()
    finish_at(now,file,frame)
def tick(events: List<Event>,file: File,frame: FrameState,path: String,header: String) -> IO(File & FrameState):
  IO.bind(File & FrameState,File & FrameState,events_fold(events,file,frame,path,header),finish)

def view(frame: FrameState) -> FrameState & Image:
  match frame:
    case Frame{+world,last,carry,quit,mode}: (Frame{world,last,carry,quit,mode},R.view(world_value(world)))
def mode_title(mode: U32) -> String:
  match mode:
    case 1: "REPLAY (Space/P pauses) | "
    case 2: "REPLAY PAUSED (Space/P resumes) | "
    case 3: "REPLAY ENDED | "
    case _: "RECORDING | "
def title(frame: FrameState) -> String:
  match frame:
    case Frame{world,_,_,_,mode}: "Hapsland canonical defense | " ++ mode_title(mode) ++ R.diagnostics(world_value(world))

def next_window(pair: File & FrameState,window: Window,rest: Window -> File -> FrameState -> IO(Unit)) -> IO(Unit):
  match pair:
    case (file,Frame{_,_,_,True{},_}):
      do IO<Unit>:
        File.close(file)
        Window.close(window)
    case (file,frame): rest(window,file,frame)
def after_frame(shown: Window & Image & List<Event>,file: File,state: FrameState,path: String,header: String,
    rest: Window -> File -> FrameState -> IO(Unit)) -> IO(Unit):
  (window,image,events) = shown
  do IO<Unit>:
    Unit <- IO.pure(Unit,Image.free(4n,image))
    IO.bind(File & FrameState,Unit,tick(events,file,state,path,header),pair => next_window(pair,window,rest))
def draw(drawn: FrameState & Image,window: Window,file: File,path: String,header: String,
    rest: Window -> File -> FrameState -> IO(Unit)) -> IO(Unit):
  (state,image) = drawn
  do IO<Unit>:
    shown : Window & Image & List<Event> <- Window.frame(window,image)
    after_frame(shown,file,state,path,header,rest)
def named_window(refresh: Bool,window: Window,frame: FrameState) -> IO(Window):
  match refresh:
    case False{}: IO.pure(Window,window)
    case True{}: Window.set_title(window,title(frame))
def loop(fuel: Nat,window: Window,file: File,+frame: FrameState,+path: String,+header: String) -> IO(Unit):
  match fuel:
    case 0n:
      do IO<Unit>:
        File.close(file)
        Window.close(window)
    case 1n++n:
      do IO<Unit>:
        named : Window <- named_window(Nat.is_eq(fuel,4294967295n) || Nat.is_eq(Nat.mod(fuel,3n),0n),window,frame)
        draw(view(frame),named,file,path,header,w => f => s => loop(n,w,f,s,path,header))

def start_loop(pair: File & M.World,window: Window,now: Nat,mode: U32,path: String,header: String) -> IO(Unit):
  (file,world) = pair
  loop(4294967295n,window,file,Frame{[world],now,0,False{},mode},path,header)
def launch_mode(mode: String,+path: String,+header: String,window: Window,now: Nat) -> IO(Unit):
  match mode:
    case "new":
      do IO<Unit>:
        file : File <- Recording.create(path,header,0)
        start_loop((file,H.initial()),window,now,0,path,header)
    case "resume":
      do IO<Unit>:
        restored : File & M.World <- Recording.resume(path,header)
        fresh : Nat <- IO.now()
        start_loop(restored,window,fresh,0,path,header)
    case "replay":
      do IO<Unit>:
        file : File <- Recording.open_read(path,header)
        start_loop((file,H.initial()),window,now,1,path,header)
    case _: IO.die(Unit,1,"Launch through run.sh to select recording mode")
def launch() -> IO(Unit):
  do IO<Unit>:
    IO.print("Hapsland canonical defense: realtime recording; R starts a new game and replaces the recording.")
    IO.print("Build: 1-3 choose tower, click ground; N/Enter releases work; U upgrades; Space/P pauses. Replay: Space/P pauses playback, Esc exits.")
    path : String <- IO.try(String,IO.get_env("HAPSLAND_GAME_RECORDING"))
    header : String <- IO.try(String,IO.get_env("HAPSLAND_GAME_RECORDING_HEADER"))
    mode : String <- IO.try(String,IO.get_env("HAPSLAND_GAME_RECORDING_MODE"))
    now : Nat <- IO.now()
    window : Window <- IO.try(Window,Window.open("Hapsland canonical defense",1024,768))
    launch_mode(mode,path,header,window,now)
def checked_launch(valid: Bool) -> IO(Unit):
  match valid:
    case True{}: launch()
    case False{}: IO.die(Unit,1,"Invalid map: roads must cross midpoint wall ports normally; room paths must be finite and simple.")
def main() -> IO(Unit):
  checked_launch(D.layout_valid(0) && D.layout_valid(1) && D.layout_valid(2))
