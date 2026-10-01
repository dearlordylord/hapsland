# Directed native campaign checks, not mathematical proofs.
import Base
import ./DefenseAuto.bend as A
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseProjection.bend as P
import ./DefenseOutput.bend as O
import ../../packages/session-bend/Session.bend as Session

def require(ok: Bool, message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def run(fuel: Nat, world: M.World) -> M.World:
  match fuel:
    case 0n: world
    case 1n+n: run(n,H.tick(world))
type Checked is Data:
  Checked{world: M.World, budget: Bool}
def terminal(+world: M.World) -> Bool:
  (H.wave_status(world) >= 2 : U32) && H.drained(world)
def run_checked_state(fuel: Nat, +world: M.World, +budget: Bool, ended: Bool) -> Checked:
  match fuel ended:
    case _ True{}: Checked{world,budget}
    case 0n _: Checked{world,budget}
    case 1n+n False{}:
      +next = H.tick(world)
      run_checked_state(n,next,budget && P.finish_within_budget(world),terminal(next))
def run_checked(fuel: Nat, +world: M.World, budget: Bool) -> Checked:
  run_checked_state(fuel,world,budget,terminal(world))
def checked_world(result: Checked) -> M.World:
  match result:
    case Checked{world,_}: world
def checked_budget(result: Checked) -> Bool:
  match result:
    case Checked{_,budget}: budget
def wave_done_active(fuel: Nat, +world: M.World, active: Bool) -> M.World:
  match fuel active:
    case _ False{}: world
    case 0n _: world
    case 1n+n True{}:
      +next = H.tick(world)
      wave_done_active(n,next,M.active(next))
def wave_done(fuel: Nat, +world: M.World) -> M.World:
  wave_done_active(fuel,world,M.active(world))
def towers(world: M.World) -> U32: M.number(List.length(&2,M.Tower,M.towers(world)))
def case_manual() -> IO(Unit):
  +first = wave_done(12000n,H.key(H.build(H.initial(),640,240,0),110))
  +second = H.key(first,13)
  +done = wave_done(12000n,second)
  verdict0 = U32.is_eq(M.wave(first),1) && H.drained(first) && Nat.is_eq(M.round(first),0n)
  verdict1 = U32.is_eq(M.wave(second),2) && Nat.is_eq(M.round(second),2n)
  verdict2 = U32.is_eq(towers(second),1) && U32.is_eq(M.gold(first),M.gold(second)) && U32.is_eq(M.hp(first),M.hp(second))
  verdict3 = H.drained(done) && U32.is_eq(M.delivered(done),32) && Nat.is_eq(O.attempt(M.output(done)),8n)
  verdict4 = U32.is_eq(M.gold(first),145) && U32.is_eq(M.gold(done),165)
  do IO<Unit>:
    require(verdict0, "first wave drains before retiring its canonical round")
    require(verdict1, "Enter starts a distinct actual second round")
    require(verdict2, "next wave retains towers gold and HP")
    require(verdict3, "two rounds drain thirty-two real findings using eight actual reservations")
    require(verdict4, "manual completion awards exactly twenty gold once per survived wave")

def pause_world() -> M.World:
  run(200n,H.key(run(50n,H.key(H.initial(),97)),32))
def pause_grace() -> IO(Unit):
  require(U32.is_eq(M.auto_left(H.key(H.initial(),97)),3000), "A grants three seconds prep")
def pause_elapsed() -> IO(Unit):
  require(U32.is_eq(M.auto_left(run(50n,H.key(H.initial(),97))),2000), "countdown advances by the fixed twenty millisecond tick")
def pause_frozen() -> IO(Unit):
  +world = pause_world()
  require(U32.is_eq(M.auto_left(world),2000) && U32.is_eq(M.wave(world),0), "pause freezes the shared Task countdown")
def pause_resumed() -> IO(Unit):
  +world = run(100n,H.key(pause_world(),32))
  require(U32.is_eq(M.wave(world),1) && M.active(world), "resumed countdown starts exactly one wave")
def case_pause() -> IO(Unit):
  do IO<Unit>:
    pause_grace()
    pause_elapsed()
    pause_frozen()
    pause_resumed()

def defended() -> M.World:
  +first = H.build(H.initial(),424,232,1)
  +upgraded = H.key(H.select(first,1),117)
  H.build(upgraded,328,232,1)
def level_sum(items: List<&2,M.Tower>) -> U32:
  match items:
    case Nil{}: 0
    case +tower <> rest: (M.level(tower) + level_sum(rest) : U32)
def case_campaign() -> IO(Unit):
  +result = run_checked(65000n,H.key(defended(),97),True{})
  budget = checked_budget(result)
  +done = checked_world(result)
  verdict0 = U32.is_eq(M.wave(done),6) && U32.is_eq(H.wave_status(done),2) && H.drained(done)
  verdict1 = U32.is_eq(towers(done),2) && U32.is_eq(level_sum(M.towers(done)),3) && U32.is_eq(M.gold(done),130)
  verdict2 = U32.is_eq((M.delivered(done) + M.clear(done) : U32),96) && Nat.is_le(O.attempt(M.output(done)),24n)
  verdict3 = Bool.not(M.auto(done)) && Nat.is_eq(M.auto_task(done),6n)
  do IO<Unit>:
    require(verdict0, "shared Session automatic defended campaign drains six actual rounds")
    require(verdict1, "automatic waves retain manual tower levels and award exactly twenty gold per completed survived wave")
    require(verdict2, "campaign settles ninety-six actual review outcomes with at most twenty-four real reservations")
    require(verdict3, "finite campaign ends recurring Tasks after six waves")
    require(budget, "every observed actual delivery counter remains within the real four-reservation budget")
def case_defeat() -> IO(Unit):
  +result = run_checked(65000n,H.key(H.initial(),97),True{})
  budget = checked_budget(result)
  +done = checked_world(result)
  verdict0 = U32.is_eq(H.wave_status(done),3) && H.drained(done) && Bool.not(M.auto(done))
  verdict1 = U32.is_eq(M.wave(done),M.wave(H.key(done,110))) && U32.is_eq(M.wave(done),M.wave(H.key(done,97)))
  verdict2 = U32.is_eq(M.gold(done),(160 + 20 * M.sub(M.wave(done),1) : U32))
  do IO<Unit>:
    require(verdict0, "undefended defeat settles all real ownership and disables automatic starts")
    require(verdict1, "defeat prevents further manual and automatic waves")
    require(verdict2, "defeat gives no completion reward for the lost wave")
    require(budget, "defeated campaign also obeys each actual round finish budget")

def case_restart() -> IO(Unit):
  +reset = H.key(run(200n,H.key(H.initial(),97)),114)
  verdict0 = U32.is_eq(M.wave(reset),0) && Nat.is_eq(M.round(reset),1n) && Bool.not(M.auto(reset))
  verdict1 = U32.is_eq(M.gold(reset),160) && U32.is_eq(M.hp(reset),100) && U32.is_eq(M.delivered(reset),0)
  do IO<Unit>:
    require(verdict0, "restart resets campaign and disables automatic waves")
    require(verdict1, "restart resets resources and delivered count")

def case_no_overlap() -> IO(Unit):
  +first = run(50n,H.key(H.initial(),110))
  +blocked = H.key(first,110)
  require(U32.is_eq(M.wave(blocked),1) && Nat.is_eq(M.round(blocked),1n) &&
    U32.is_eq(M.offered(first),M.offered(blocked)),"manual start cannot overlap real ownership")
def case_session() -> IO(Unit):
  +prepared = A.consume(A.initial())
  +next = A.finished(prepared,False{})
  require(Nat.is_eq(A.task(A.initial()),1n) && Nat.is_eq(A.task(next),2n) &&
    U32.is_eq(A.left(next),3000),"wave completion requests the next recurring Task from shared Session.on_finish")
def main() -> IO(Unit):
  do IO<Unit>:
    case_manual()
    case_pause()
    case_campaign()
    case_defeat()
    case_restart()
    case_no_overlap()
    case_session()
    IO.print("CANONICAL CAMPAIGN:7 directed checks complete")
