# Bounded offline timing fixture; uses real Canonical admission/review from OutputTests.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseRender.bend as R
import ./DefenseProjection.bend as P
import ./DefenseOutputTests.bend as Fixture
import ./Font.bend as F

def waiting_timers(tokens: List<&2,P.Token>) -> List<&2,M.Timer>:
  match tokens:
    case Nil{}: Nil{}
    case +token <> rest:
      M.Timer{U32.to_nat(P.id(token)),5,10000,U32.to_nat(P.family(token)),100,1,0} <> waiting_timers(rest)
def waiting(count: U32) -> M.World:
  +world = Fixture.fixture(8n,count)
  M.with_effects(world,[],waiting_timers(P.tokens(world)))
def scenes(fuel: Nat, +world: M.World) -> IO(Nat):
  match fuel:
    case 0n: IO.pure(Nat,0n)
    case 1n+n:
      do IO<Nat>:
        start : Nat <- IO.now()
        count : Nat <- IO.pure(Nat,List.length(&2,F.Rect,R.scene(world)))
        end : Nat <- IO.now()
        more : Nat <- scenes(n,world)
        return Nat.add(Nat.sub(end,start),more)
def images(fuel: Nat, +world: M.World) -> IO(Nat):
  match fuel:
    case 0n: IO.pure(Nat,0n)
    case 1n+n:
      do IO<Nat>:
        start : Nat <- IO.now()
        image : Image <- IO.pure(Image,R.view(world))
        Unit <- IO.pure(Unit,Image.free(4n,image))
        end : Nat <- IO.now()
        more : Nat <- images(n,world)
        return Nat.add(Nat.sub(end,start),more)
def ticks(fuel: Nat, +world: M.World) -> IO(Nat):
  match fuel:
    case 0n: IO.pure(Nat,0n)
    case 1n+n:
      do IO<Nat>:
        start : Nat <- IO.now()
        next : M.World <- IO.pure(M.World,H.tick(world))
        end : Nat <- IO.now()
        more : Nat <- ticks(n,world)
        return Nat.add(Nat.sub(end,start),more)
def titles(fuel: Nat,+world: M.World) -> IO(Nat):
  match fuel:
    case 0n: IO.pure(Nat,0n)
    case 1n+n:
      do IO<Nat>:
        start : Nat <- IO.now()
        count : Nat <- IO.pure(Nat,String.length(R.diagnostics(world)))
        end : Nat <- IO.now()
        more : Nat <- titles(n,world)
        return Nat.add(Nat.sub(end,start),more)
def sample(+count: U32) -> IO(Unit):
  +world = waiting(count)
  do IO<Unit>:
    scene : Nat <- scenes(10n,world)
    image : Nat <- images(10n,world)
    tick : Nat <- ticks(100n,world)
    title : Nat <- titles(100n,world)
    IO.print("PENDING=" ++ U32.show(count) ++ " WAIT=" ++ U32.show(R.wait_count(P.tokens(world),world)) ++ " SCENE10_MS=" ++ Nat.show(scene) ++ " IMAGE10_MS=" ++ Nat.show(image) ++ " TICK100_MS=" ++ Nat.show(tick) ++ " TITLE100_MS=" ++ Nat.show(title) ++ " RECTS=" ++ Nat.show(List.length(&2,F.Rect,R.scene(world))))
def main() -> IO(Unit):
  do IO<Unit>:
    sample(0)
    sample(8)
    sample(16)
