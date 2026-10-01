# Pure generic queue/resource teaching engine. Each call advances one20ms tick.
import Base
import ./FlowModel.bend as M

def config_label(value: M.Config) -> String:
  match value:
    case M.Board{label, _, _, _, _, _, _, _, _}: label

def config_stages(value: M.Config) -> List<&2, M.Stage>:
  match value:
    case M.Board{_, stages, _, _, _, _, _, _, _}: stages

def config_startLives(value: M.Config) -> U32:
  match value:
    case M.Board{_, _, startLives, _, _, _, _, _, _}: startLives

def config_startGold(value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, startGold, _, _, _, _, _}: startGold

def config_workerPool(value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, _, workerPool, _, _, _, _}: workerPool

def config_basePace(value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, _, _, basePace, _, _, _}: basePace

def config_jobDeadline(value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, _, _, _, jobDeadline, _, _}: jobDeadline

def config_waves(value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, _, _, _, _, waves, _}: waves

def config_waveTicks(value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, _, _, _, _, _, waveTicks}: waveTicks

def stage_id(value: M.Stage) -> U32:
  match value:
    case M.Node{id, _, _, _, _, _, _, _, _, _}: id

def stage_label(value: M.Stage) -> String:
  match value:
    case M.Node{_, label, _, _, _, _, _, _, _, _}: label

def stage_serviceTicks(value: M.Stage) -> U32:
  match value:
    case M.Node{_, _, serviceTicks, _, _, _, _, _, _, _}: serviceTicks

def stage_queueLimit(value: M.Stage) -> U32:
  match value:
    case M.Node{_, _, _, queueLimit, _, _, _, _, _, _}: queueLimit

def stage_immediate(value: M.Stage) -> Bool:
  match value:
    case M.Node{_, _, _, _, immediate, _, _, _, _, _}: immediate

def stage_resourceLimit(value: M.Stage) -> U32:
  match value:
    case M.Node{_, _, _, _, _, resourceLimit, _, _, _, _}: resourceLimit

def stage_holdTicks(value: M.Stage) -> U32:
  match value:
    case M.Node{_, _, _, _, _, _, holdTicks, _, _, _}: holdTicks

def stage_next(value: M.Stage) -> U32:
  match value:
    case M.Node{_, _, _, _, _, _, _, next, _, _}: next

def stage_nextFinding(value: M.Stage) -> U32:
  match value:
    case M.Node{_, _, _, _, _, _, _, _, nextFinding, _}: nextFinding

def stage_upgradeCost(value: M.Stage) -> U32:
  match value:
    case M.Node{_, _, _, _, _, _, _, _, _, upgradeCost}: upgradeCost

def station_id(value: M.StageState) -> U32:
  match value:
    case M.Station{id, _, _, _, _}: id

def station_workers(value: M.StageState) -> U32:
  match value:
    case M.Station{_, workers, _, _, _}: workers

def station_level(value: M.StageState) -> U32:
  match value:
    case M.Station{_, _, level, _, _}: level

def station_completed(value: M.StageState) -> U32:
  match value:
    case M.Station{_, _, _, completed, _}: completed

def station_refused(value: M.StageState) -> U32:
  match value:
    case M.Station{_, _, _, _, refused}: refused

def job_id(value: M.Job) -> U32:
  match value:
    case M.Packet{id, _, _, _, _, _}: id

def job_stage(value: M.Job) -> U32:
  match value:
    case M.Packet{_, stage, _, _, _, _}: stage

def job_elapsed(value: M.Job) -> U32:
  match value:
    case M.Packet{_, _, elapsed, _, _, _}: elapsed

def job_age(value: M.Job) -> U32:
  match value:
    case M.Packet{_, _, _, age, _, _}: age

def job_finding(value: M.Job) -> Bool:
  match value:
    case M.Packet{_, _, _, _, finding, _}: finding

def job_held(value: M.Job) -> Bool:
  match value:
    case M.Packet{_, _, _, _, _, held}: held


def stage_pick(a: M.Stage, b: M.Stage, yes: Bool) -> M.Stage:
  match yes:
    case True{}: a
    case False{}: b

def find_stage(xs: List<&2, M.Stage>, +id: U32) -> M.Stage:
  match xs:
    case Nil{}: M.Node{255, "INVALID", 1, 0, True{}, 0, 0, 255, 255, 9999}
    case Con{+head, tail}: stage_pick(head, find_stage(tail, id), U32.is_eq(stage_id(head), id))

def get_stage(+config: M.Config, id: U32) -> M.Stage:
  find_stage(config_stages(config), id)

def station_pick(a: M.StageState, b: M.StageState, yes: Bool) -> M.StageState:
  match yes:
    case True{}: a
    case False{}: b

def get_station(xs: List<&2, M.StageState>, +id: U32) -> M.StageState:
  match xs:
    case Nil{}: M.Station{id, 0, 0, 0, 0}
    case Con{+head, tail}: station_pick(head, get_station(tail, id), U32.is_eq(station_id(head), id))

def jobs_in(xs: List<&2, M.Job>, +id: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{head, tail}: (M.choose(1, 0, U32.is_eq(job_stage(head), id)) + jobs_in(tail, id) : U32)

def active_in(xs: List<&2, M.Job>, +id: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(1, 0, U32.is_eq(job_stage(head), id) && Bool.not(job_held(head)) && (job_elapsed(head) > 0 : U32)) + active_in(tail, id) : U32)

def nonheld_in(xs: List<&2, M.Job>, +id: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(1, 0, U32.is_eq(job_stage(head), id) && Bool.not(job_held(head))) + nonheld_in(tail, id) : U32)

def job_count(xs: List<&2, M.Job>) -> U32:
  match xs:
    case Nil{}: 0
    case Con{_, tail}: (1 + job_count(tail) : U32)

def rank(xs: List<&2, M.Job>, +id: U32, +stage: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(1, 0, U32.is_eq(job_stage(head), stage) && (job_id(head) < id : U32) && Bool.not(job_held(head))) + rank(tail, id, stage) : U32)

def duration(+node: M.Stage, station: M.StageState) -> U32:
  U32.max(1, (stage_serviceTicks(node) / (station_level(station) + 1) : U32))

def can_accept(+config: M.Config, +stations: List<&2, M.StageState>, +jobs: List<&2, M.Job>, +target: U32) -> Bool:
  +node = get_stage(config, target)
  +workers = station_workers(get_station(stations, target))
  +waitingLimit = M.choose(workers, (workers + stage_queueLimit(node) : U32), stage_immediate(node))
  (jobs_in(jobs, target) < stage_resourceLimit(node) : U32) && (nonheld_in(jobs, target) < waitingLimit : U32)

def stations_init(xs: List<&2, M.Stage>, +pool: U32) -> List<&2, M.StageState>:
  match xs:
    case Nil{}: Nil{}
    case Con{head, tail}: Con{M.Station{stage_id(head), M.choose(1, 0, (pool > 0 : U32)), 0, 0, 0}, stations_init(tail, M.sub(pool, 1))}

def station_count(xs: List<&2, M.Stage>) -> U32:
  match xs:
    case Nil{}: 0
    case Con{_, tail}: (1 + station_count(tail) : U32)

def entry(xs: List<&2, M.Stage>) -> U32:
  match xs:
    case Nil{}: 255
    case Con{head, _}: stage_id(head)

def initial(+config: M.Config) -> M.State:
  M.World{0, 0, 0, 0, config_startLives(config), config_startGold(config), 0, 0, 0, config_basePace(config), False{}, entry(config_stages(config)), M.sub(config_workerPool(config), station_count(config_stages(config))), 0, 0, 0, stations_init(config_stages(config), config_workerPool(config)), Nil{}}

type One is Data:
  Step{job: M.Job, ready: Bool, expired: Bool}

type Batch is Data:
  Tick{kept: List<&2, M.Job>, moves: List<&2, M.Job>, expired: U32}

def batch_kept(value: Batch) -> List<&2, M.Job>:
  match value:
    case Tick{kept, _, _}: kept

def batch_moves(value: Batch) -> List<&2, M.Job>:
  match value:
    case Tick{_, moves, _}: moves

def batch_expired(value: Batch) -> U32:
  match value:
    case Tick{_, _, expired}: expired

def packet_service(+job: M.Job, +node: M.Stage, +elapsed: U32, +age: U32, done: Bool) -> One:
  match job done:
    case M.Packet{id, stage, _, _, finding, held} False{}:
      Step{M.Packet{id, stage, elapsed, age, finding, held}, False{}, False{}}
    case M.Packet{id, stage, _, _, finding, False{}} True{}:
      +holding = (stage_holdTicks(node) > 0 : U32)
      Step{M.Packet{id, stage, M.choose(0, elapsed, holding), age, finding, holding}, Bool.not(holding), False{}}
    case M.Packet{id, stage, _, _, finding, True{}} True{}:
      Step{M.Packet{id, stage, elapsed, age, finding, True{}}, True{}, False{}}

def packet_tick(+job: M.Job, +node: M.Stage, +workers: U32, +position: U32, +ticks: U32, deadline: U32, expire: Bool) -> One:
  match job expire:
    case M.Packet{id, stage, elapsed, age, finding, held} True{}:
      Step{M.Packet{id, stage, elapsed, (age + 1 : U32), finding, held}, False{}, True{}}
    case M.Packet{id, stage, +elapsed, +age, finding, True{}} False{}:
      packet_service(job, node, (elapsed + 1 : U32), (age + 1 : U32), (elapsed + 1 >= stage_holdTicks(node) : U32))
    case M.Packet{id, stage, +elapsed, +age, finding, False{}} False{}:
      +next = (elapsed + M.choose(1, 0, (position < workers : U32)) : U32)
      packet_service(job, node, next, (age + 1 : U32), (next >= ticks : U32))

def batch_put(one: One, tail: Batch) -> Batch:
  match one tail:
    case Step{_, _, True{}} Tick{kept, moves, expired}: Tick{kept, moves, (expired + 1 : U32)}
    case Step{job, True{}, False{}} Tick{kept, moves, expired}: Tick{kept, Con{job, moves}, expired}
    case Step{job, False{}, False{}} Tick{kept, moves, expired}: Tick{Con{job, kept}, moves, expired}

def tick_jobs(xs: List<&2, M.Job>, +snapshot: List<&2, M.Job>, +config: M.Config, +stations: List<&2, M.StageState>) -> Batch:
  match xs:
    case Nil{}: Tick{Nil{}, Nil{}, 0}
    case Con{+head, tail}:
      +node = get_stage(config, job_stage(head))
      +station = get_station(stations, job_stage(head))
      batch_put(packet_tick(head, node, station_workers(station), rank(snapshot, job_id(head), job_stage(head)), duration(node, station), config_jobDeadline(config), (job_age(head) + 1 >= config_jobDeadline(config) : U32)), tick_jobs(tail, snapshot, config, stations))

def station_bump(value: M.StageState, completed: U32, refused: U32, yes: Bool) -> M.StageState:
  match value yes:
    case M.Station{id, workers, level, oldComplete, oldRefused} True{}: M.Station{id, workers, level, (oldComplete + completed : U32), (oldRefused + refused : U32)}
    case other False{}: other

def bump(xs: List<&2, M.StageState>, +id: U32, +completed: U32, +refused: U32) -> List<&2, M.StageState>:
  match xs:
    case Nil{}: Nil{}
    case Con{+head, tail}: Con{station_bump(head, completed, refused, U32.is_eq(station_id(head), id)), bump(tail, id, completed, refused)}

type Changes is Data:
  Changed{jobs: List<&2, M.Job>, stations: List<&2, M.StageState>, finished: U32, dropped: U32, score: U32, gold: U32}

def change_jobs(c: Changes) -> List<&2, M.Job>:
  match c:
    case Changed{jobs, _, _, _, _, _}: jobs

def change_stations(c: Changes) -> List<&2, M.StageState>:
  match c:
    case Changed{_, stations, _, _, _, _}: stations

def change_finished(c: Changes) -> U32:
  match c:
    case Changed{_, _, finished, _, _, _}: finished

def change_dropped(c: Changes) -> U32:
  match c:
    case Changed{_, _, _, dropped, _, _}: dropped

def change_score(c: Changes) -> U32:
  match c:
    case Changed{_, _, _, _, score, _}: score

def change_gold(c: Changes) -> U32:
  match c:
    case Changed{_, _, _, _, _, gold}: gold

def transfer_commit(+job: M.Job, +target: U32, +jobs: List<&2, M.Job>, +stations: List<&2, M.StageState>, terminal: Bool, accept: Bool, immediate: Bool) -> Changes:
  match job terminal accept immediate:
    case M.Packet{_, +source, _, _, +finding, _} True{} _ _:
      Changed{jobs, bump(stations, source, 1, 0), 1, 0, M.choose(5, 1, finding), M.choose(4, 1, finding)}
    case M.Packet{id, +source, _, age, finding, _} False{} True{} _:
      Changed{List.append(&2, M.Job, jobs, [M.Packet{id, target, 0, age, finding, False{}}]), bump(stations, source, 1, 0), 0, 0, 0, 0}
    case M.Packet{_, +source, _, _, _, _} False{} False{} True{}:
      Changed{jobs, bump(bump(stations, source, 1, 0), target, 0, 1), 0, 1, 0, 0}
    case blocked False{} False{} False{}:
      Changed{List.append(&2, M.Job, jobs, [blocked]), stations, 0, 0, 0, 0}

def remove_put(job: M.Job, rest: List<&2, M.Job>, yes: Bool) -> List<&2, M.Job>:
  match yes:
    case True{}: rest
    case False{}: Con{job, rest}

def remove_job(xs: List<&2, M.Job>, +id: U32) -> List<&2, M.Job>:
  match xs:
    case Nil{}: Nil{}
    case Con{+head, tail}: remove_put(head, remove_job(tail, id), U32.is_eq(job_id(head), id))

def transfer(+job: M.Job, +config: M.Config, +jobs: List<&2, M.Job>, +stations: List<&2, M.StageState>) -> Changes:
  +source = get_stage(config, job_stage(job))
  +available = remove_job(jobs, job_id(job))
  +target = M.choose(stage_nextFinding(source), stage_next(source), job_finding(job))
  transfer_commit(job, target, available, stations, U32.is_eq(target, 255), can_accept(config, stations, available, target), stage_immediate(get_stage(config, target)))

def transfers(xs: List<&2, M.Job>, +config: M.Config, jobs: List<&2, M.Job>, stations: List<&2, M.StageState>, +finished: U32, +dropped: U32, +score: U32, +gold: U32) -> Changes:
  match xs:
    case Nil{}: Changed{jobs, stations, finished, dropped, score, gold}
    case Con{head, tail}:
      +step = transfer(head, config, jobs, stations)
      transfers(tail, config, change_jobs(step), change_stations(step), (finished + change_finished(step) : U32), (dropped + change_dropped(step) : U32), (score + change_score(step) : U32), (gold + change_gold(step) : U32))


def offer_commit(+job: M.Job, jobs: List<&2, M.Job>, +stations: List<&2, M.StageState>, accept: Bool) -> Changes:
  match accept:
    case True{}: Changed{List.append(&2, M.Job, jobs, [job]), stations, 0, 0, 0, 0}
    case False{}: Changed{jobs, bump(stations, job_stage(job), 0, 1), 0, 1, 0, 0}

def offer(+config: M.Config, +clock: U32, +ordinal: U32, +jobs: List<&2, M.Job>, +stations: List<&2, M.StageState>, ready: Bool) -> Changes:
  match ready:
    case False{}: Changed{jobs, stations, 0, 0, 0, 0}
    case True{}:
      +source = entry(config_stages(config))
      offer_commit(M.Packet{(ordinal + 1 : U32), source, 0, 0, Bool.not(U32.is_eq(((ordinal + 1) % 3 : U32), 0)), False{}}, jobs, stations, can_accept(config, stations, jobs, source))

def phase_after(+wave: U32, +waves: U32, lives: U32, left: U32, jobs: List<&2, M.Job>) -> U32:
  match lives left jobs:
    case 0 _ _: 3
    case _ 0 Nil{}: M.choose(2, 0, (wave >= waves : U32))
    case _ _ _: 1

def advance_live(+config: M.Config, state: M.State) -> M.State:
  match state:
    case M.World{+clock, +waveClock, +wave, _, +lives, +gold, +score, +left, +arrivalIn, +pace, +paused, +selected, +freeWorkers, +offered, +finished, +dropped, +stations, +jobs}:
      +batch = tick_jobs(jobs, jobs, config, stations)
      +moved = transfers(batch_moves(batch), config, List.append(&2, M.Job, batch_kept(batch), batch_moves(batch)), stations, 0, batch_expired(batch), 0, 0)
      +ready = (left > 0 : U32) && U32.is_eq(arrivalIn, 0)
      +added = offer(config, clock, offered, change_jobs(moved), change_stations(moved), ready)
      +attempted = M.choose(1, 0, ready)
      +remaining = M.sub(left, attempted)
      +missed = M.choose(remaining, 0, (waveClock + 1 >= config_waveTicks(config) : U32))
      +lost = (change_dropped(moved) + change_dropped(added) + missed : U32)
      +health = M.sub(lives, lost)
      +newLeft = M.sub(remaining, missed)
      +newJobs = change_jobs(added)
      +nextPhase = phase_after(wave, config_waves(config), health, newLeft, newJobs)
      +bonus = M.choose((15 + wave * 3 : U32), 0, U32.is_eq(nextPhase, 0) || U32.is_eq(nextPhase, 2))
      M.World{(clock + 1 : U32), (waveClock + 1 : U32), wave, nextPhase, health, (gold + change_gold(moved) + bonus : U32), (score + change_score(moved) : U32), newLeft, M.choose(M.sub(pace, 1), M.sub(arrivalIn, 1), ready), pace, paused, selected, freeWorkers, (offered + attempted + missed : U32), (finished + change_finished(moved) : U32), (dropped + lost : U32), change_stations(added), newJobs}

def advance(config: M.Config, state: M.State) -> M.State:
  match state:
    case M.World{clock, waveClock, wave, 1, lives, gold, score, left, arrivalIn, pace, False{}, selected, freeWorkers, offered, finished, dropped, stations, jobs}:
      advance_live(config, M.World{clock, waveClock, wave, 1, lives, gold, score, left, arrivalIn, pace, False{}, selected, freeWorkers, offered, finished, dropped, stations, jobs})
    case other: other

def decide(a: M.State, b: M.State, yes: Bool) -> M.State:
  match yes:
    case True{}: a
    case False{}: b

def at_index(xs: List<&2, M.Stage>, +index: U32) -> U32:
  match xs:
    case Nil{}: 255
    case Con{head, tail}: M.choose(stage_id(head), at_index(tail, M.sub(index, 1)), U32.is_eq(index, 0))

def select(state: M.State, id: U32) -> M.State:
  match state:
    case M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, _, freeWorkers, offered, finished, dropped, stations, jobs}:
      M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, id, freeWorkers, offered, finished, dropped, stations, jobs}

def select_index(+config: M.Config, +state: M.State, index: U32) -> M.State:
  +id = at_index(config_stages(config), index)
  decide(select(state, id), state, Bool.not(U32.is_eq(id, 255)))

def allocation_one(station: M.StageState, yes: Bool, add: Bool) -> M.StageState:
  match station yes:
    case M.Station{id, +workers, level, completed, refused} True{}:
      M.Station{id, M.choose((workers + 1 : U32), M.sub(workers, 1), add), level, completed, refused}
    case other False{}: other

def allocation(xs: List<&2, M.StageState>, +id: U32, +add: Bool) -> List<&2, M.StageState>:
  match xs:
    case Nil{}: Nil{}
    case Con{+head, tail}: Con{allocation_one(head, U32.is_eq(station_id(head), id), add), allocation(tail, id, add)}

def reallocate(+config: M.Config, +state: M.State, +add: Bool) -> M.State:
  match state:
    case M.World{+clock, +waveClock, +wave, +phase, +lives, +gold, +score, +left, +arrivalIn, +pace, +paused, +selected, +freeWorkers, +offered, +finished, +dropped, +stations, +jobs}:
      +workers = station_workers(get_station(stations, selected))
      +node = get_stage(config, selected)
      +newCapacity = M.choose(M.sub(workers, 1), (M.sub(workers, 1) + stage_queueLimit(node) : U32), stage_immediate(node))
      +canRemove = (workers > 0 : U32) && (active_in(jobs, selected) < workers : U32) && (nonheld_in(jobs, selected) <= newCapacity : U32)
      +free = M.choose(M.sub(freeWorkers, 1), (freeWorkers + 1 : U32), add)
      decide(M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, selected, free, offered, finished, dropped, allocation(stations, selected, add), jobs}, state, (phase < 2 : U32) && ((add && (freeWorkers > 0 : U32)) || (Bool.not(add) && canRemove)))

def upgrade_one(station: M.StageState, yes: Bool) -> M.StageState:
  match station yes:
    case M.Station{id, workers, level, completed, refused} True{}: M.Station{id, workers, (level + 1 : U32), completed, refused}
    case other False{}: other

def upgrades(xs: List<&2, M.StageState>, +id: U32) -> List<&2, M.StageState>:
  match xs:
    case Nil{}: Nil{}
    case Con{+head, tail}: Con{upgrade_one(head, U32.is_eq(station_id(head), id)), upgrades(tail, id)}

def upgrade(+config: M.Config, +state: M.State) -> M.State:
  match state:
    case M.World{+clock, +waveClock, +wave, +phase, +lives, +gold, +score, +left, +arrivalIn, +pace, +paused, +selected, +freeWorkers, +offered, +finished, +dropped, +stations, +jobs}:
      +level = station_level(get_station(stations, selected))
      +price = (stage_upgradeCost(get_stage(config, selected)) * (level + 1) : U32)
      decide(M.World{clock, waveClock, wave, phase, lives, M.sub(gold, price), score, left, arrivalIn, pace, paused, selected, freeWorkers, offered, finished, dropped, upgrades(stations, selected), jobs}, state, (phase < 2 : U32) && (level < 3 : U32) && (gold >= price : U32))

def pacing(state: M.State, slower: Bool) -> M.State:
  match state:
    case M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, +pace, paused, selected, freeWorkers, offered, finished, dropped, stations, jobs}:
      M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, M.choose(U32.min(36, (pace + 2 : U32)), U32.max(6, M.sub(pace, 2)), slower), paused, selected, freeWorkers, offered, finished, dropped, stations, jobs}

def pause(state: M.State) -> M.State:
  match state:
    case M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, selected, freeWorkers, offered, finished, dropped, stations, jobs}:
      M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, Bool.not(paused), selected, freeWorkers, offered, finished, dropped, stations, jobs}

def start(config: M.Config, state: M.State) -> M.State:
  match state:
    case M.World{clock, _, +wave, 0, lives, gold, score, _, _, pace, False{}, selected, freeWorkers, offered, finished, dropped, stations, jobs}:
      M.World{clock, 0, (wave + 1 : U32), 1, lives, gold, score, (18 + wave * 6 : U32), 0, pace, False{}, selected, freeWorkers, offered, finished, dropped, stations, jobs}
    case other: other

def click(+config: M.Config, +state: M.State, +x: U32, +y: U32, button: U32) -> M.State:
  +dx = M.sub(x, 16)
  +dy = M.sub(y, 142)
  +index = ((dy / 140) * 2 + (dx / 248) : U32)
  decide(select_index(config, state, index), state, U32.is_eq(button, 0) && (x >= 16 : U32) && (x < 496 : U32) && (y >= 142 : U32) && (y < 422 : U32) && (dx % 248 < 232 : U32) && (dy % 140 < 128 : U32))

def key(+config: M.Config, +state: M.State, code: U32) -> M.State:
  match code:
    case 49: select_index(config, state, 0)
    case 50: select_index(config, state, 1)
    case 51: select_index(config, state, 2)
    case 52: select_index(config, state, 3)
    case 43: reallocate(config, state, True{})
    case 61: reallocate(config, state, True{})
    case 45: reallocate(config, state, False{})
    case 85: upgrade(config, state)
    case 117: upgrade(config, state)
    case 91: pacing(state, True{})
    case 93: pacing(state, False{})
    case 78: start(config, state)
    case 110: start(config, state)
    case 13: start(config, state)
    case 32: pause(state)
    case 80: pause(state)
    case 112: pause(state)
    case 82: initial(config)
    case 114: initial(config)
    case _: state

def status(state: M.State) -> String:
  match state:
    case M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, selected, freeWorkers, offered, finished, dropped, stations, jobs}:
      "WAVE=" ++ U32.show(wave) ++ " PHASE=" ++ U32.show(phase) ++ " LIFE=" ++ U32.show(lives) ++ " GOLD=" ++ U32.show(gold) ++ " SCORE=" ++ U32.show(score) ++ " DONE=" ++ U32.show(finished) ++ " LOST=" ++ U32.show(dropped) ++ " JOBS=" ++ U32.show(job_count(jobs)) ++ " TICK=" ++ U32.show(clock)
