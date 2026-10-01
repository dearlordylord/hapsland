# Bounded executable evidence only. No mathematical theorem or engagement claim.
import Base
import ./FlowModel.bend as M
import ./FlowGame.bend as G
import ./FlowScenario.bend as S

def require(ok: Bool, message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit, 1, "FAIL " ++ message)

def bool_word(b: Bool) -> String:
  match b:
    case True{}: "1"
    case False{}: "0"

def job_snapshot(jobs: List<&2, M.Job>) -> String:
  match jobs:
    case Nil{}: ""
    case Con{M.Packet{id, stage, elapsed, age, finding, held}, tail}:
      U32.show(id) ++ "/" ++ U32.show(stage) ++ "/" ++ U32.show(elapsed) ++ "/" ++ U32.show(age) ++ "/" ++ bool_word(finding) ++ "/" ++ bool_word(held) ++ ";" ++ job_snapshot(tail)

def stage_snapshot(stages: List<&2, M.StageState>) -> String:
  match stages:
    case Nil{}: ""
    case Con{M.Station{id, workers, level, completed, refused}, tail}:
      U32.show(id) ++ "/" ++ U32.show(workers) ++ "/" ++ U32.show(level) ++ "/" ++ U32.show(completed) ++ "/" ++ U32.show(refused) ++ ";" ++ stage_snapshot(tail)

def snapshot(state: M.State) -> String:
  match state:
    case M.World{clock, wc, wave, phase, lives, gold, score, left, arrival, pace, paused, selected, free, offered, finished, dropped, stages, jobs}:
      U32.show(clock) ++ "/" ++ U32.show(wc) ++ "/" ++ U32.show(wave) ++ "/" ++ U32.show(phase) ++ "/" ++ U32.show(lives) ++ "/" ++ U32.show(gold) ++ "/" ++ U32.show(score) ++ "/" ++ U32.show(left) ++ "/" ++ U32.show(arrival) ++ "/" ++ U32.show(pace) ++ "/" ++ bool_word(paused) ++ "/" ++ U32.show(selected) ++ "/" ++ U32.show(free) ++ "/" ++ U32.show(offered) ++ "/" ++ U32.show(finished) ++ "/" ++ U32.show(dropped) ++ "/" ++ stage_snapshot(stages) ++ "|" ++ job_snapshot(jobs)

def job_count(jobs: List<&2, M.Job>) -> U32:
  match jobs:
    case Nil{}: 0
    case Con{_, tail}: (1 + job_count(tail) : U32)

def worker_count(stages: List<&2, M.StageState>) -> U32:
  match stages:
    case Nil{}: 0
    case Con{M.Station{_, workers, _, _, _}, tail}: (workers + worker_count(tail) : U32)

def conserved(state: M.State) -> Bool:
  match state:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, offered, finished, dropped, _, jobs}:
      U32.is_eq(offered, (finished + dropped + job_count(jobs) : U32))

def workers_bounded(config: M.Config, state: M.State) -> Bool:
  match config state:
    case M.Board{_, _, _, _, pool, _, _, _, _} M.World{_, _, _, _, _, _, _, _, _, _, _, _, free, _, _, _, stations, _}:
      U32.is_eq(pool, (free + worker_count(stations) : U32))

def resources(nodes: List<&2, M.Stage>, +jobs: List<&2, M.Job>) -> Bool:
  match nodes:
    case Nil{}: True{}
    case Con{M.Node{+id, _, _, _, _, limit, _, _, _, _}, tail}:
      (G.jobs_in(jobs, id) <= limit : U32) && resources(tail, jobs)

def resource_bounded(config: M.Config, state: M.State) -> Bool:
  match config state:
    case M.Board{_, nodes, _, _, _, _, _, _, _} M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, jobs}:
      resources(nodes, jobs)

def frames(fuel: Nat, +config: M.Config, state: M.State) -> M.State:
  match fuel:
    case 0n: state
    case 1n+n: frames(n, config, G.advance(config, state))

def batches(fuel: Nat, +config: M.Config, state: M.State) -> M.State:
  match fuel:
    case 0n: state
    case 1n+n: batches(n, config, frames(50n, config, state))

def select_key(id: U32) -> U32:
  (49 + id : U32)

def repeat_key(fuel: Nat, +config: M.Config, state: M.State, +code: U32) -> M.State:
  match fuel:
    case 0n: state
    case 1n+n: repeat_key(n, config, G.key(config, state, code), code)

def assign(fuel: Nat, +config: M.Config, state: M.State, id: U32) -> M.State:
  repeat_key(fuel, config, G.key(config, state, select_key(id)), 43)

def reclaim(+config: M.Config, state: M.State) -> M.State:
  a = repeat_key(8n, config, G.key(config, state, 49), 45)
  b = repeat_key(8n, config, G.key(config, a, 50), 45)
  c = repeat_key(8n, config, G.key(config, b, 51), 45)
  repeat_key(8n, config, G.key(config, c, 52), 45)

def vector(+config: M.Config, state: M.State, a: Nat, b: Nat, c: Nat, d: Nat) -> M.State:
  assign(d, config, assign(c, config, assign(b, config, assign(a, config, reclaim(config, state), 0), 1), 2), 3)

def static_plan(+config: M.Config, state: M.State, plan: U32) -> M.State:
  match plan:
    case 0: vector(config, state, 3n, 1n, 1n, 1n)
    case 1: vector(config, state, 1n, 3n, 1n, 1n)
    case 2: vector(config, state, 1n, 1n, 3n, 1n)
    case 3: vector(config, state, 1n, 1n, 1n, 3n)
    case 7: vector(config, state, 1n, 3n, 1n, 1n)
    case _: vector(config, state, 1n, 2n, 2n, 1n)

def phase(state: M.State) -> U32:
  match state:
    case M.World{_, _, _, phase, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: phase

def live_jobs(state: M.State) -> List<&2, M.Job>:
  match state:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, jobs}: jobs

def stage_jobs(jobs: List<&2, M.Job>, +stage: U32) -> U32:
  match jobs:
    case Nil{}: 0
    case Con{M.Packet{_, id, _, _, _, _}, tail}:
      (M.choose(1, 0, U32.is_eq(id, stage)) + stage_jobs(tail, stage) : U32)

def heaviest(+jobs: List<&2, M.Job>) -> U32:
  +a = stage_jobs(jobs, 0)
  +b = stage_jobs(jobs, 1)
  +c = stage_jobs(jobs, 2)
  +d = stage_jobs(jobs, 3)
  M.choose(0, M.choose(1, M.choose(2, 3, (c >= d : U32)), (b >= c : U32) && (b >= d : U32)), (a >= b : U32) && (a >= c : U32) && (a >= d : U32))

def periodic(state: M.State) -> Bool:
  match state:
    case M.World{clock, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}:
      U32.is_eq((clock % 30 : U32), 0)

def invest(+config: M.Config, state: M.State) -> M.State:
  a = G.key(config, G.key(config, state, 50), 117)
  b = G.key(config, G.key(config, a, 51), 117)
  c = G.key(config, G.key(config, b, 49), 117)
  G.key(config, G.key(config, c, 52), 117)

def adjust(+config: M.Config, +state: M.State, plan: U32, change: Bool) -> M.State:
  match plan change:
    case 6 True{}: invest(config, state)
    case 7 True{}: invest(config, state)
    case 5 True{}: static_plan(config, state, heaviest(live_jobs(state)))
    case _ _: state

def begin(+config: M.Config, +state: M.State, p: U32) -> M.State:
  match p:
    case 0: G.key(config, state, 110)
    case _: state

def campaign(fuel: Nat, +config: M.Config, +state: M.State, +plan: U32) -> M.State:
  match fuel:
    case 0n: state
    case 1n+n:
      +running = begin(config, state, phase(state))
      campaign(n, config, G.advance(config, adjust(config, running, plan, periodic(running))), plan)

def stage_variant(node: M.Stage, +variant: U32) -> M.Stage:
  match node:
    case M.Node{+id, label, +service, limit, immediate, resource, +hold, next, finding, cost}:
      +slow = U32.is_eq(id, variant)
      M.Node{id, label, M.choose((service * 4 : U32), service, slow), limit, immediate, resource, M.choose((hold * 2 : U32), hold, slow), next, finding, cost}

def stages_variant(stages: List<&2, M.Stage>, +variant: U32) -> List<&2, M.Stage>:
  match stages:
    case Nil{}: Nil{}
    case Con{node, tail}: Con{stage_variant(node, variant), stages_variant(tail, variant)}

def context(config: M.Config, variant: U32) -> M.Config:
  match config:
    case M.Board{label, stages, lives, gold, _, pace, deadline, waves, ticks}:
      M.Board{label, stages_variant(stages, variant), lives, gold, 6, pace, deadline, waves, ticks}

def paced(state: M.State, pace: U32) -> M.State:
  match state:
    case M.World{clock, wc, wave, phase, lives, gold, score, left, arrival, _, paused, selected, free, offered, finished, dropped, stations, jobs}:
      M.World{clock, wc, wave, phase, lives, gold, score, left, arrival, pace, paused, selected, free, offered, finished, dropped, stations, jobs}

def audit(fuel: Nat, +config: M.Config, +state: M.State, +ok: Bool) -> Bool:
  match fuel:
    case 0n: ok && conserved(state) && workers_bounded(config, state) && resource_bounded(config, state)
    case 1n+n:
      audit(n, config, G.advance(config, state), ok && conserved(state) && workers_bounded(config, state) && resource_bounded(config, state))

def report(name: String, state: M.State) -> IO(Unit):
  match state:
    case M.World{clock, wc, wave, phase, lives, gold, score, left, _, pace, _, _, _, offered, finished, dropped, stations, jobs}:
      IO.print(name ++ " | ticks=" ++ U32.show(clock) ++ " wave=" ++ U32.show(wave) ++ " phase=" ++ U32.show(phase) ++ " lives=" ++ U32.show(lives) ++ " gold=" ++ U32.show(gold) ++ " score=" ++ U32.show(score) ++ " offered=" ++ U32.show(offered) ++ " finished=" ++ U32.show(finished) ++ " dropped=" ++ U32.show(dropped) ++ " live=" ++ U32.show(job_count(jobs)) ++ " demandleft=" ++ U32.show(left) ++ " pace=" ++ U32.show(pace) ++ " workers=" ++ stage_snapshot(stations))

def policy_run(+config: M.Config, +variant: U32, +plan: U32, +pace: U32) -> IO(Unit):
  do IO<Unit>:
    +prepared : M.State = paced(static_plan(config, G.initial(config), plan), pace)
    +started : M.State = G.key(config, prepared, 110)
    require(audit(3000n, config, started, True{}), "per-tick first-wave conservation and resource/worker accounting context=" ++ U32.show(variant) ++ " plan=" ++ U32.show(plan) ++ " pace=" ++ U32.show(pace))
    +result : M.State = campaign(12000n, config, prepared, plan)
    require(conserved(result) && workers_bounded(config, result) && resource_bounded(config, result), "campaign conservation")
    report("CONTEXT " ++ U32.show(variant) ++ " POLICY " ++ U32.show(plan), result)

def plan_runs(fuel: Nat, +config: M.Config, +variant: U32, +pace: U32) -> IO(Unit):
  match fuel:
    case 0n: IO.pure(Unit, Unit{})
    case 1n++n:
      do IO<Unit>:
        policy_run(config, variant, U32.from_nat(n), pace)
        plan_runs(n, config, variant, pace)

def context_runs(fuel: Nat) -> IO(Unit):
  match fuel:
    case 0n: IO.pure(Unit, Unit{})
    case 1n++n:
      do IO<Unit>:
        +variant : U32 = U32.from_nat(n)
        +config : M.Config = context(S.hapsland(), variant)
        plan_runs(6n, config, variant, 8)
        plan_runs(6n, config, variant, 28)
        policy_run(config, variant, 6, 16)
        policy_run(config, variant, 7, 16)
        context_runs(n)

def tiny(immediate: Bool, hold: U32) -> M.Config:
  M.Board{"SORT PACK", [M.Node{0, "SORT", 2, 1, False{}, 1, 0, 1, 1, 10}, M.Node{1, "PACK", 2, 1, immediate, 1, hold, 255, 255, 10}], 24, 20, 2, 10, 100, 1, 100}

def tiny_stations() -> List<&2, M.StageState>:
  [M.Station{0, 1, 0, 0, 0}, M.Station{1, 1, 0, 0, 0}]

def tiny_state(jobs: List<&2, M.Job>, offered: U32) -> M.State:
  M.World{0, 0, 1, 1, 24, 20, 0, 0, 0, 10, False{}, 0, 0, offered, 0, 0, tiny_stations(), jobs}

def refusal_tests() -> IO(Unit):
  do IO<Unit>:
    +source : M.Job = M.Packet{1, 0, 2, 0, True{}, False{}}
    +occupied : List<&2, M.Job> = [M.Packet{2, 1, 0, 0, True{}, False{}}]
    +blocked : G.Changes = G.transfer(source, tiny(False{}, 0), occupied, tiny_stations())
    require(U32.is_eq(G.change_dropped(blocked), 0) && U32.is_eq(G.jobs_in(G.change_jobs(blocked), 0), 1), "queued full target retains upstream packet and its resource")
    +refused : G.Changes = G.transfer(source, tiny(True{}, 0), occupied, tiny_stations())
    require(U32.is_eq(G.change_dropped(refused), 1) && U32.is_eq(G.jobs_in(G.change_jobs(refused), 0), 0) && U32.is_eq(G.station_refused(G.get_station(G.change_stations(refused), 1)), 1), "immediate refusal drops once, counts target refusal and releases upstream resource")
    +moved : G.Changes = G.transfer(source, tiny(False{}, 0), Nil{}, tiny_stations())
    require(U32.is_eq(G.jobs_in(G.change_jobs(moved), 0), 0) && U32.is_eq(G.jobs_in(G.change_jobs(moved), 1), 1), "successful transfer releases source and acquires target")
    +holding : M.State = tiny_state([M.Packet{1, 1, 0, 0, True{}, True{}}], 1)
    +first : M.State = G.advance(tiny(False{}, 2), holding)
    +second : M.State = G.advance(tiny(False{}, 2), first)
    require(U32.is_eq(job_count(live_jobs(first)), 1) && U32.is_eq(job_count(live_jobs(second)), 0) && conserved(first) && conserved(second), "hold retains resource for two ticks then terminal completion releases it")
    +generic : M.State = frames(8n, tiny(False{}, 0), tiny_state([M.Packet{1, 0, 0, 0, False{}, False{}}], 1))
    require(U32.is_eq(phase(generic), 2) && conserved(generic), "two-stage SORT PACK config runs unchanged generic engine")
    report("GENERIC TWO-STAGE", generic)

def first_finding(jobs: List<&2, M.Job>) -> Bool:
  match jobs:
    case Nil{}: False{}
    case Con{M.Packet{_, _, _, _, finding, _}, _}: finding

def demand_identity(jobs: List<&2, M.Job>) -> String:
  match jobs:
    case Nil{}: "MISSING"
    case Con{M.Packet{id, _, _, _, finding, _}, _}: U32.show(id) ++ ":" ++ bool_word(finding) ++ ";"

def finding_pattern(fuel: Nat, +config: M.Config, +interval: U32) -> String:
  match fuel:
    case 0n: ""
    case 1n++n:
      +ordinal = U32.from_nat(n)
      result = G.offer(config, (interval * ordinal : U32), ordinal, Nil{}, tiny_stations(), True{})
      demand_identity(G.change_jobs(result)) ++ finding_pattern(n, config, interval)

def reservation_config() -> M.Config:
  M.Board{"RESERVATION WITNESS", [M.Node{0, "SOURCE", 2, 1, False{}, 1, 0, 1, 1, 10}, M.Node{1, "MIDDLE", 2, 1, False{}, 1, 0, 2, 2, 10}, M.Node{2, "FULL TARGET", 5, 1, False{}, 1, 0, 255, 255, 10}], 24, 20, 3, 10, 100, 1, 100}

def reservation_state() -> M.State:
  M.World{0, 0, 1, 1, 24, 20, 0, 0, 0, 10, False{}, 0, 1, 3, 0, 0, [M.Station{0, 1, 0, 0, 0}, M.Station{1, 1, 0, 0, 0}, M.Station{2, 0, 0, 0, 0}], [M.Packet{1, 0, 1, 0, False{}, False{}}, M.Packet{2, 1, 1, 0, False{}, False{}}, M.Packet{3, 2, 0, 0, False{}, False{}}]}

def removal_config() -> M.Config:
  M.Board{"ELAPSED ZERO RESERVATION", [M.Node{0, "SOURCE", 2, 0, False{}, 1, 0, 1, 1, 10}, M.Node{1, "PACK", 2, 1, False{}, 1, 0, 255, 255, 10}], 24, 20, 2, 10, 100, 1, 100}

def regressions() -> IO(Unit):
  do IO<Unit>:
    require(String.eq(finding_pattern(6n, tiny(False{}, 0), 8), finding_pattern(6n, tiny(False{}, 0), 28)) && String.eq(finding_pattern(6n, tiny(False{}, 0), 8), finding_pattern(6n, tiny(False{}, 0), 12)) && String.eq(finding_pattern(6n, tiny(False{}, 0), 8), "6:0;5:1;4:1;3:0;2:1;1:1;"), "REGRESSION immutable ticket IDs and finding sequence at pacing8/12/28 use demand ordinal")
    +reserved : M.State = tiny_state([M.Packet{1, 0, 0, 0, False{}, False{}}], 1)
    require(String.eq(snapshot(reserved), snapshot(G.key(removal_config(), reserved, 45))), "REGRESSION elapsed-zero reservation prevents removing its last worker when queue capacity is zero")
    +next : M.State = G.advance(reservation_config(), reservation_state())
    require(U32.is_eq(stage_jobs(live_jobs(next), 0), 1) && U32.is_eq(stage_jobs(live_jobs(next), 1), 1) && U32.is_eq(stage_jobs(live_jobs(next), 2), 1) && resource_bounded(reservation_config(), next) && conserved(next), "REGRESSION blocked ready packet reserves middle capacity before upstream transfer")

def main() -> IO(Unit):
  do IO<Unit>:
    regressions()
    +config : M.Config = S.hapsland()
    +ready : M.State = G.initial(config)
    +active : M.State = G.key(config, ready, 110)
    +paused : M.State = G.key(config, active, 32)
    require(String.eq(snapshot(paused), snapshot(frames(300n, config, paused))), "pause freezes complete state")
    require(String.eq(snapshot(frames(1000n, config, active)), snapshot(batches(20n, config, active))), "batching same number of ticks preserves complete state")
    require(conserved(ready) && workers_bounded(config, ready), "initial accounting")
    IO.print("DECLARATION policies0..3 static stage-heavy 3/1/1/1;4 balanced1/2/2/1;5 greedy-largest-queue every30ticks. Three service/hold contexts, two pacing choices, same demand graph. All six workers conserved. No engagement or proof claim.")
    IO.print("AMENDMENT after initial native smoke: owner fixed outcome assignment to immutable demand ordinal and transfer resource reservations; prior core binary is not final evidence. Added balanced investment policy6 at pace16 after original extreme-context policies all lost. Default budgets and service/hold costs unchanged.")
    IO.print("AMENDMENT policy7 added after balanced-investment smoke could win contexts0/2 but lost slow-review context1: review-heavy allocation with same investment rule, pace16 and six workers. This is an explicit exploration addition, not an optimality claim. Final timer correction uses exact pace, not pace+1.")
    refusal_tests()
    policy_run(config, 4, 4, 16)
    policy_run(config, 4, 6, 16)
    context_runs(3n)
