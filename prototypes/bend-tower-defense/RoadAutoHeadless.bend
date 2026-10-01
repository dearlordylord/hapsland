# Directed scheduler evidence. No autonomous build or upgrade is permitted.
import Base
import ./RoadModel.bend as M
import ./RoadGame.bend as G
import ./RoadAuto.bend as A
import ./RoadScenario.bend as S
import ./RoadHeadless.bend as H

def ticks(fuel: Nat, +config: M.Config, result: A.Outcome) -> A.Outcome:
  match fuel result:
    case 0n result: result
    case 1n+n A.Tick{game, auto}: ticks(n, config, A.step(config, game, auto))

def fixture(state: M.State, wave: U32, phase: U32) -> M.State:
  match state:
    case M.World{clock, wc, _, _, life, gold, score, left, arrival, pace, paused, choice, selected, mx, my, offered, finished, dropped, pressure, ts, es, runtime}:
      M.World{clock, wc, wave, phase, life, gold, score, left, arrival, pace, paused, choice, selected, mx, my, offered, finished, dropped, pressure, ts, es, runtime}

def same(a: M.State, b: M.State) -> Bool:
  String.eq(H.snapshot(a), H.snapshot(b))

def active_step(config: M.Config, +result: A.Outcome, active: Bool) -> A.Outcome:
  match active:
    case True{}: A.step(config,A.result_game(result),A.result_auto(result))
    case False{}: result

def finish(fuel: Nat, +config: M.Config, +result: A.Outcome) -> A.Outcome:
  match fuel:
    case 0n: result
    case 1n+n: finish(n,config,active_step(config,result,U32.is_eq(G.state_phase(A.result_game(result)),1)))

def case_0() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  H.require(Nat.is_eq(List.length(&2,M.Tower,G.state_towers(game)),2n) && U32.is_eq(G.state_gold(game),35),"manual fixture really constructs Rapid and Shield;85gold spent")

def case_1() -> IO(Unit):
  +off = A.initial()
  H.require(Bool.not(A.enabled(off)) && Bool.not(A.pending(off)),"auto default OFF with one prepared shared Task")

def case_2() -> IO(Unit):
  +off = A.initial()
  H.require(Nat.is_eq(A.task(off),1n),"shared Session.next produced Task1")

def case_3() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  H.require(same(game,A.result_game(ticks(400n,c,A.Tick{game,off}))),"OFF never starts or changes full game including towers/gold")

def case_4() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +near = ticks(149n,c,A.Tick{game,on})
  H.require(same(game,A.result_game(near)) && U32.is_eq(A.left(A.result_auto(near)),20),"149 ticks preserve every game field and20ms of grace")

def case_5() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +near = ticks(149n,c,A.Tick{game,on})
  +started = A.step(c,A.result_game(near),A.result_auto(near))
  H.require(same(G.start(c,game),A.result_game(started)),"exact boundary does ONLY ordinary G.start including legitimate wave recharge")

def case_6() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +near = ticks(149n,c,A.Tick{game,on})
  +started = A.step(c,A.result_game(near),A.result_auto(near))
  H.require(U32.is_eq(G.state_wave(A.result_game(started)),1) && Bool.not(A.pending(A.result_auto(started))),"one start consumes pending slot once")

def case_7() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +manual = G.start(c,game)
  +consumed = A.observed(game,manual,on)
  H.require(same(G.advance(c,manual),A.result_game(A.step(c,manual,consumed))),"manual N consumes slot without duplicate start or resource changes")

def case_8() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +pausedGame = G.key(c,game,32)
  +paused = ticks(500n,c,A.Tick{pausedGame,on})
  H.require(same(pausedGame,A.result_game(paused)) && U32.is_eq(A.left(A.result_auto(paused)),3000),"pause freezes entire game and countdown for500ticks")

def case_9() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  H.require(Bool.not(A.pending(A.toggle(c,game,on))) && same(game,A.result_game(ticks(200n,c,A.Tick{game,A.toggle(c,game,on)}))),"toggle OFF clears pending start")

def case_10() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  H.require(Nat.is_eq(A.task(A.toggle(c,game,A.toggle(c,game,on))),1n),"toggle rearm retains Task identity without ghost tasks")

def case_11() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +manual = G.start(c,game)
  +consumed = A.observed(game,manual,on)
  +complete = fixture(game,1,0)
  +next = A.step(c,complete,consumed)
  H.require(Nat.is_eq(A.task(A.result_auto(next)),2n) && U32.is_eq(A.left(A.result_auto(next)),3000),"synthetic completed-phase fixture uses shared on_finish false Task2 pause3000")

def case_12() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +manual = G.start(c,game)
  +consumed = A.observed(game,manual,on)
  +complete = fixture(game,1,0)
  +next = A.step(c,complete,consumed)
  +nextNear = ticks(149n,c,next)
  +nextStart = A.step(c,A.result_game(nextNear),A.result_auto(nextNear))
  H.require(U32.is_eq(G.state_wave(A.result_game(nextNear)),1) && U32.is_eq(G.state_wave(A.result_game(nextStart)),2),"next intermission starts exactly once after150ticks")

def case_13() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +terminal = fixture(game,6,2)
  H.require(same(terminal,A.result_game(ticks(500n,c,A.Tick{terminal,on}))) && Bool.not(A.enabled(A.toggle(c,terminal,on))),"won finite campaign never restarts even after toggle")

def case_14() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +dead = fixture(game,1,3)
  H.require(same(dead,A.result_game(ticks(500n,c,A.Tick{dead,on}))) && Bool.not(A.enabled(A.result_auto(A.step(c,dead,on)))),"lost or incomplete run disarms without restart")

def case_15() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +atCap = fixture(game,6,0)
  H.require(same(atCap,A.result_game(ticks(500n,c,A.Tick{atCap,on}))),"six-wave cap also guards preparation fixtures")

def case_16() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +pausedGame = G.key(c,game,32)
  H.require(Bool.not(A.clock_active(pausedGame,on)) && A.clock_active(game,on),"host ticks enabled preparation but freezes paused clocks")

def case_17() -> IO(Unit):

  H.require(Bool.not(A.enabled(A.initial())) && Nat.is_eq(A.task(A.initial()),1n),"R/Tab deterministic reset resets session and auto OFF")

def case_18() -> IO(Unit):
  +c = S.select(0)
  +game = G.click(c, G.choose(G.click(c, G.initial(c), 144,240,0), 6),368,240,0)
  +off = A.initial()
  +on = A.toggle(c,game,off)
  +manual = G.start(c,game)
  +consumed = A.observed(game,manual,on)
  +real = finish(3000n,c,A.Tick{manual,consumed})
  H.require(U32.is_eq(G.state_phase(A.result_game(real)),0) && U32.is_eq(G.runtime_stop(G.state_runtime(A.result_game(real))),4) && Nat.is_eq(A.task(A.result_auto(real)),2n) && U32.is_eq(A.left(A.result_auto(real)),3000),"real constructed wave completes Stop4 before one shared Task2 is scheduled")

def main() -> IO(Unit):
  do IO<Unit>:
    case_0()
    case_1()
    case_2()
    case_3()
    case_4()
    case_5()
    case_6()
    case_7()
    case_8()
    case_9()
    case_10()
    case_11()
    case_12()
    case_13()
    case_14()
    case_15()
    case_16()
    case_17()
    case_18()
    IO.print("AUTO WAVES:19 directed checks complete")
