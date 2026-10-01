# Directed read-only preview evidence; no universal-proof or engagement claim.
import Base
import ./RoadModel.bend as M
import ./RoadGame.bend as G
import ./RoadPreview.bend as P
import ./RoadScenario.bend as S
import ./RoadHeadless.bend as H

def wallet(state: M.State, gold: U32, phase: U32) -> M.State:
  match state:
    case M.World{clock,wc,wave,_,life,_,score,left,arrival,pace,paused,choice,selected,mx,my,offered,finished,dropped,pressure,ts,es,runtime}:
      M.World{clock,wc,wave,phase,life,gold,score,left,arrival,pace,paused,choice,selected,mx,my,offered,finished,dropped,pressure,ts,es,runtime}

def hover(+c: M.Config, kind: U32, x: U32, y: U32) -> M.State:
  G.move(G.choose(wallet(G.initial(c),999,0),kind),x,y)

def build(+c: M.Config, state: M.State, +x: U32, +y: U32) -> M.State:
  G.click(c,state,x,y,0)

def parallels(+c: M.Config) -> M.State:
  build(c,build(c,hover(c,3,144,240),144,240),80,240)

def packages(+c: M.Config) -> M.State:
  build(c,build(c,hover(c,5,80,432),80,432),144,432)

def floor_rules(r: M.Rules, item: U32) -> M.Rules:
  match r:
    case M.Contract{a,b,c,_,d,e,f,g,h,i,j,k}: M.Contract{a,b,c,item,d,e,f,g,h,i,j,k}

def floor_config(c: M.Config, item: U32) -> M.Config:
  match c:
    case M.Board{label,nodes,lives,gold,pace,waves,wt,pressure,demand,ramp,rules}:
      M.Board{label,nodes,lives,gold,pace,waves,wt,pressure,demand,ramp,floor_rules(rules,item)}

def positive_worker() -> IO(Unit):
  +c = S.select(0)
  +s = hover(c,3,144,240)
  +p = P.calculate(c,s)
  H.require(U32.is_eq(P.status(p),1) && U32.is_eq(P.target(p),0) && U32.is_eq(P.workers(p),3) && U32.is_eq(P.worker_delta(p),1) && U32.is_eq((P.workers(p) + P.worker_delta(p) : U32),G.effective_workers(c,build(c,s,144,240),0)),"Parallelizer net3+1 equals real legal click")

def partial_worker() -> IO(Unit):
  +c = S.select(0)
  +s = G.move(build(c,hover(c,3,144,240),144,240),80,240)
  +p = P.calculate(c,s)
  H.require(U32.is_eq(P.workers(p),4) && U32.is_eq(P.worker_delta(p),1) && U32.is_eq(G.effective_workers(c,build(c,s,80,240),0),5),"existing bonus included:4+1 reaches cap5")

def saturated_worker() -> IO(Unit):
  +c = S.select(0)
  +s = G.move(parallels(c),208,240)
  +p = P.calculate(c,s)
  H.require(U32.is_eq(P.status(p),5) && U32.is_eq(P.workers(p),5) && U32.is_eq(P.worker_delta(p),0) && U32.is_eq(P.cost(p),70) && U32.is_eq(G.effective_workers(c,build(c,s,208,240),0),5),"saturated5+0 still costs70; no fictitious extra permit")

def nearest_worker() -> IO(Unit):
  +c = S.select(0)
  +s = G.move(build(c,hover(c,3,144,240),144,240),368,240)
  +p = P.calculate(c,s)
  H.require(U32.is_eq(P.target(p),1) && U32.is_eq(P.workers(p),3) && U32.is_eq(P.worker_delta(p),1),"hover moves target to nearest eligible REVIEW without borrowing Capture bonus")

def package_effect() -> IO(Unit):
  +c = S.select(0)
  +s = hover(c,5,208,432)
  +p = P.calculate(c,s)
  +clicked = build(c,s,208,432)
  H.require(U32.is_eq(P.target(p),3) && U32.is_eq(P.overhead(p),32) && U32.is_eq(P.overhead_reduction(p),16) && U32.is_eq(P.batch_target(p),3) && U32.is_eq(P.batch_delta(p),1) && U32.is_eq(M.sub(P.overhead(p),P.overhead_reduction(p)),G.package_overhead(c,clicked)) && U32.is_eq((P.batch_target(p) + P.batch_delta(p) : U32),G.package_target(c,clicked)),"Packager32-16 and target3+1 exactly equal actual click policy")

def independent_floor() -> IO(Unit):
  +c = S.select(0)
  +s = G.move(packages(c),208,432)
  +p = P.calculate(c,s)
  H.require(U32.is_eq(P.status(p),1) && U32.is_eq(P.overhead(p),0) && U32.is_eq(P.overhead_reduction(p),0) && U32.is_eq(P.batch_target(p),5) && U32.is_eq(P.batch_delta(p),1),"encoding floor0-0 does not hide independent target5+1")

def saturated_package() -> IO(Unit):
  +c = S.select(0)
  +s = G.move(build(c,packages(c),208,432),208,400)
  +p = P.calculate(c,s)
  H.require(U32.is_eq(P.status(p),5) && U32.is_eq(P.overhead_reduction(p),0) && U32.is_eq(P.batch_delta(p),0) && U32.is_eq(P.batch_target(p),6) && U32.is_eq(P.cost(p),60),"three-level Packager cap shows zero deltas but full60gold price")

def small_floor() -> IO(Unit):
  +c = floor_config(S.select(0),8)
  +p = P.calculate(c,hover(c,5,208,432))
  H.require(U32.is_eq(P.overhead(p),8) && U32.is_eq(P.overhead_reduction(p),8) && U32.is_eq(P.batch_delta(p),1),"per-item reduction clips8 to0 rather than displaying negative encoding")

def no_target() -> IO(Unit):
  +c = S.select(0)
  +p = P.calculate(c,hover(c,5,80,112))
  H.require(U32.is_eq(P.status(p),4) && U32.is_eq(P.target(p),255) && U32.is_eq(P.cost(p),60) && U32.is_eq(P.batch_delta(p),0),"legal out-of-range build shows no eligible writer but retains cost")

def invalid_ground() -> IO(Unit):
  +c = S.select(0)
  +p = P.calculate(c,hover(c,3,144,152))
  H.require(U32.is_eq(P.status(p),2) && Bool.not(P.legal(p)) && U32.is_eq(P.worker_delta(p),0),"road or fixed site prevents optimistic preview")

def poor() -> IO(Unit):
  +c = S.select(0)
  +p = P.calculate(c,wallet(hover(c,3,144,240),69,0))
  H.require(U32.is_eq(P.status(p),3) && U32.is_eq(P.cost(p),0) && U32.is_eq(P.worker_delta(p),0),"unaffordable hover has explicit reason and no actionable buff/cost delta")

def occupied_after_build() -> IO(Unit):
  +c = S.select(0)
  +s = build(c,hover(c,3,144,240),144,240)
  +p = P.calculate(c,s)
  H.require(U32.is_eq(P.status(p),2) && U32.is_eq(P.worker_delta(p),0) && U32.is_eq(G.effective_workers(c,s,0),4),"after build normal4workers replace ghost delta; occupied hover no longer previews")

def inspect_and_build() -> IO(Unit):
  +c = S.select(0)
  +inspect = G.select(build(c,hover(c,3,144,240),144,240),1)
  +ready = G.move(P.key(c,inspect,52),80,240)
  H.require(U32.is_eq(P.status(P.calculate(c,inspect)),0) && U32.is_eq(G.state_selected(ready),0) && U32.is_eq(P.worker_delta(P.calculate(c,ready)),1),"inspection suppresses preview; number4 explicitly reenters build mode")

def inspect_move() -> IO(Unit):
  +c = S.select(0)
  +inspect = G.select(build(c,hover(c,3,144,240),144,240),1)
  H.require(U32.is_eq(P.status(P.calculate(c,G.move(inspect,80,240))),0) && U32.is_eq(G.state_selected(P.key(c,inspect,117)),1),"mouse motion preserves inspection and U keeps selected tower for real upgrade")

def paused_hover() -> IO(Unit):
  +c = S.select(0)
  +s = G.pause(hover(c,3,144,240))
  +p = P.calculate(c,s)
  H.require(U32.is_eq(P.worker_delta(p),1) && G.state_paused(s) && U32.is_eq(G.state_gold(s),999) && U32.is_eq(G.state_clock(s),0),"paused legal hover computes same delta without spending gold or ticking")

def terminal() -> IO(Unit):
  +c = S.select(0)
  H.require(U32.is_eq(P.status(P.calculate(c,wallet(hover(c,3,144,240),999,2))),6),"terminal phase denies build preview")

def dynamic_only() -> IO(Unit):
  +c = S.select(0)
  +p = P.calculate(c,hover(c,6,368,400))
  H.require(U32.is_eq(P.status(p),7) && U32.is_eq(P.worker_delta(p),0) && U32.is_eq(P.batch_delta(p),0) && U32.is_eq(P.cost(p),50),"Shield shows conditional protection/cost without invented worker or throughput delta")

def committed_writer() -> IO(Unit):
  +c = S.select(0)
  +s = G.move(G.choose(H.fixture([M.Packet{1,3,256,4,True{},True{},1,2300}],1,0,M.Run{3,100,0,M.Output{[1],2460,8,100},0,0,0,0,0,1,1,False{}}),5),208,432)
  +p = P.calculate(c,s)
  +after = build(c,s,208,432)
  H.require(U32.is_eq(P.overhead_reduction(p),16) && String.eq(H.writer_snapshot(G.runtime_writer(G.state_runtime(s))),H.writer_snapshot(G.runtime_writer(G.state_runtime(after)))) && String.eq(H.enemy_snapshot(G.state_enemies(s)),H.enemy_snapshot(G.state_enemies(after))),"hover/build changes future policy but preserves committed writer bytes/membership and work contents")

def main() -> IO(Unit):
  do IO<Unit>:
    positive_worker()
    partial_worker()
    saturated_worker()
    nearest_worker()
    package_effect()
    independent_floor()
    saturated_package()
    small_floor()
    no_target()
    invalid_ground()
    poor()
    occupied_after_build()
    inspect_and_build()
    inspect_move()
    paused_hover()
    terminal()
    dynamic_only()
    committed_writer()
    IO.print("PREVIEW:18 directed checks complete")
