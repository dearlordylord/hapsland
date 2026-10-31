# Physical recording checks exercise the actual native host event/tick seam.
import Base
import ./DefenseMain.bend as Main
import ./DefenseRecording.bend as Recording
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseLabTraceCodec.bend as Codec

def require(ok: Bool, message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit, 1, "FAIL " ++ message)
def equal(a: List<&2, Nat>, b: List<&2, Nat>) -> Bool:
  match a b:
    case Nil{} Nil{}: True{}
    case x <> xs y <> ys: Nat.is_eq(x, y) && equal(xs, ys)
    case _ _: False{}
def world(frame: Main.FrameState) -> M.World:
  match frame:
    case Main.Frame{world, _, _, _, _, _}: Main.world_value(world)
def continued(
  pair: File & Main.FrameState,
  rest: File -> Main.FrameState -> IO(File & Main.FrameState)
) -> IO(File & Main.FrameState):
  (file, frame) = pair
  rest(file, frame)
def campaign(
  fuel: Nat,
  +now: Nat,
  file: File,
  frame: Main.FrameState
) -> IO(File & Main.FrameState):
  match fuel:
    case 0n: IO.pure(File & Main.FrameState, (file, frame))
    case 1n+n:
      next: File -> Main.FrameState -> IO(File & Main.FrameState) = f => s => campaign(
        n,
        (now + 320n : Nat),
        f,
        s
      )
      continue: (File & Main.FrameState) -> IO(File & Main.FrameState) = pair => continued(
        pair,
        next
      )
      IO.bind(
        File & Main.FrameState,
        File & Main.FrameState,
        Main.clock_record(True{}, now, file, frame),
        continue
      )
def compare_restored(pair: File & M.World, +expected: M.World) -> IO(Unit):
  (file, +actual) = pair
  do IO<Unit>:
    File.close(file)
    require(
      equal(Codec.defensemodel_world([expected], []), Codec.defensemodel_world([actual], [])),
      "restore matches the complete game and engine World, including presentation history"
    )
    require(
      (M.time(actual) >= 640 : U32) && (M.gold(actual) < 160 : U32),
      "fixture includes construction, upgrades and twelve seconds of actual business activity"
    )
def return_frame(file: File, frame: Main.FrameState) -> IO(Main.FrameState):
  do IO<Main.FrameState>:
    File.close(file)
    return frame
def playback_runs(fuel: Nat, file: File, frame: Main.FrameState) -> IO(File & Main.FrameState):
  match fuel:
    case 0n: IO.pure(File & Main.FrameState, (file, frame))
    case 1n+n:
      IO.bind(File & Main.FrameState, File & Main.FrameState, Main.playback(1024n, file, frame),
        pair => continued(pair, f => w => playback_runs(n, f, w)))
def playback_compared(pair: File & Main.FrameState, +expected: M.World) -> IO(Unit):
  (file, +frame) = pair
  do IO<Unit>:
    File.close(file)
    require(
      equal(Codec.defensemodel_world([expected], []), Codec.defensemodel_world([world(frame)], [])),
      "full playback reaches the exact recorded World"
    )
def pause_mode(frame: Main.FrameState) -> U32:
  match frame:
    case Main.Frame{_, _, _, _, mode, _}: mode
def pause_checked(pair: File & Main.FrameState, +origin: M.World) -> IO(File & Main.FrameState):
  (file, +frame) = pair
  do IO<File & Main.FrameState>:
    require(
      U32.is_eq(
        pause_mode(frame),
        2
      ) && equal(
        Codec.defensemodel_world([origin], []),
        Codec.defensemodel_world([world(frame)], [])
      ),
      "replay pause and gameplay clicks cannot change the recorded World"
    )
    return (file, frame)
def check_playback(+path: String, header: String, +expected: M.World) -> IO(Unit):
  finish: File -> Main.FrameState -> IO(File & Main.FrameState) = f => w => Main.finish_at(
    100n,
    f,
    w
  )
  resume: File -> Main.FrameState -> IO(File & Main.FrameState) = f => w => Main.events_fold(
    [Key{112, True{}}],
    f,
    w,
    path,
    ""
  )
  play: File -> Main.FrameState -> IO(File & Main.FrameState) = f => w => playback_runs(100n, f, w)
  do IO<Unit>:
    file : File <- Recording.open_read(path, header)
    paused : File & Main.FrameState <- Main.events_fold(
      [Key{32, True{}}, Mouse{424, 392, 0, True{}}, Key{114, True{}}],
      file,
      Main.Frame{[H.initial()], 0n, 0, False{}, 1, False{}},
      path,
      ""
    )
    held : File & Main.FrameState <- continued(paused, finish)
    checked : File & Main.FrameState <- pause_checked(held, H.initial())
    resumed : File & Main.FrameState <- continued(checked, resume)
    played : File & Main.FrameState <- continued(resumed, play)
    playback_compared(played, expected)

def inspect_recording(
  pair: File & Main.FrameState,
  +path: String,
  +header: String
) -> IO(Main.FrameState):
  (file, +frame) = pair
  do IO<Main.FrameState>:
    restored : File & M.World <- Recording.resume(path, header)
    compare_restored(restored, world(frame))
    check_playback(path, header, world(frame))
    # Restore opens a second handle and sees writes while the original stays open.
    IO.print("PASS realtime writes are readable before the original handle closes")
    return_frame(file, frame)
def compare_new(pair: File & M.World, +expected: M.World) -> IO(Unit):
  (file, +actual) = pair
  do IO<Unit>:
    File.close(file)
    require(
      equal(Codec.defensemodel_world([expected], []), Codec.defensemodel_world([actual], [])),
      "R replaces old history and restores the exact new game"
    )
    require(
      U32.is_eq(
        M.time(actual),
        0
      ) && U32.is_eq(M.gold(actual), 160) && U32.is_eq(M.layout(actual), 1),
      "new game keeps the selected map and resets time and investment"
    )
def new_game(pair: File & Main.FrameState, +path: String, +header: String) -> IO(Unit):
  (file, +frame) = pair
  do IO<Unit>:
    File.close(file)
    restored : File & M.World <- Recording.resume(path, header)
    compare_new(restored, world(frame))
def stop_edges(
  pair: File & Main.FrameState,
  +path: String,
  +header: String
) -> IO(File & Main.FrameState):
  (file, +frame) = pair
  Main.events_fold(
    [Key{115, True{}}, Key{115, True{}}, Key{115, False{}}, Key{115, True{}}, Key{115, False{}}],
    file,
    frame,
    path,
    header
  )
def stop_edge_checked(
  pair: File & Main.FrameState,
  +before: Main.FrameState
) -> IO(File & Main.FrameState):
  (file, +frame) = pair
  do IO<File & Main.FrameState>:
    require(
      equal(
        Codec.defensemodel_world([H.key(world(before), 115)], []),
        Codec.defensemodel_world([world(frame)], [])
      ),
      "held Stop and X11 repeat pair produce one caller input"
    )
    return (file, frame)
def stop_campaign(
  file: File,
  +before: Main.FrameState,
  path: String,
  header: String
) -> IO(File & Main.FrameState):
  continue: (File & Main.FrameState) -> IO(File & Main.FrameState) = pair => stop_edge_checked(
    pair,
    before
  )
  IO.bind(
    File & Main.FrameState,
    File & Main.FrameState,
    stop_edges((file, before), path, header),
    continue
  )

def stop_continuation(
  path: String,
  header: String
) -> File -> Main.FrameState -> IO(File & Main.FrameState):
  f => before => stop_campaign(f, before, path, header)

def main() -> IO(Unit):
  continue: File -> Main.FrameState -> IO(File & Main.FrameState) = f => s => campaign(
    80n,
    320n,
    f,
    s
  )
  do IO<Unit>:
    +path : String <- IO.try(String, IO.get_env("HAPSLAND_GAME_RECORDING"))
    +header : String <- IO.try(String, IO.get_env("HAPSLAND_GAME_RECORDING_HEADER"))
    file : File <- Recording.create(path, header, 0)
    started : File & Main.FrameState <- Main.events_fold(
      [
        Key{102, True{}},
        Key{51, True{}},
        Mouse{424, 232, 0, True{}},
        Key{49, True{}},
        Mouse{424, 392, 0, True{}},
        Key{117, True{}},
        Key{106, True{}},
        Key{44, True{}},
        Key{98, True{}},
        Key{110, True{}},
        Key{32, True{}},
        Move{450, 300},
        Key{32, True{}}
      ],
      file,
      Main.Frame{[H.initial()], 0n, 0, False{}, 0, False{}},
      path,
      header
    )
    end : File & Main.FrameState <- continued(started, continue)
    edged : File & Main.FrameState <- continued(end, stop_continuation(path, header))
    +frame : Main.FrameState <- inspect_recording(edged, path, header)
    append : File <- IO.try(File, File.open(path, "a"))
    reset : File & Main.FrameState <- Main.events_fold(
      [Key{114, True{}}, Key{9, True{}}, Key{114, True{}}],
      append,
      frame,
      path,
      header
    )
    new_game(reset, path, header)
