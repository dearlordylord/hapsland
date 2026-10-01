# Native architectural tower-defense mechanics; deterministic pure20ms tick.
import Base
import ./RoadModel.bend as M

def config_label(+value: M.Config) -> String:
  match value:
    case M.Board{label, _, _, _, _, _, _, _, _, _, _}: label

def config_nodes(+value: M.Config) -> List<&2, M.Node>:
  match value:
    case M.Board{_, nodes, _, _, _, _, _, _, _, _, _}: nodes

def config_lives(+value: M.Config) -> U32:
  match value:
    case M.Board{_, _, lives, _, _, _, _, _, _, _, _}: lives

def config_gold(+value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, gold, _, _, _, _, _, _, _}: gold

def config_pace(+value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, _, pace, _, _, _, _, _, _}: pace

def config_waves(+value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, _, _, waves, _, _, _, _, _}: waves

def config_waveTicks(+value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, _, _, _, waveTicks, _, _, _, _}: waveTicks

def config_pressureEvery(+value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, _, _, _, _, pressureEvery, _, _, _}: pressureEvery

def config_baseDemand(+value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, _, _, _, _, _, baseDemand, _, _}: baseDemand

def config_demandRamp(+value: M.Config) -> U32:
  match value:
    case M.Board{_, _, _, _, _, _, _, _, _, demandRamp, _}: demandRamp

def node_id(+value: M.Node) -> U32:
  match value:
    case M.Site{id, _, _, _, _, _, _, _, _, _, _, _, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: id

def node_label(+value: M.Node) -> String:
  match value:
    case M.Site{_, label, _, _, _, _, _, _, _, _, _, _, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: label

def node_startX(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, startX, _, _, _, _, _, _, _, _, _, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: startX

def node_startY(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, startY, _, _, _, _, _, _, _, _, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: startY

def node_x(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, x, _, _, _, _, _, _, _, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: x

def node_y(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, y, _, _, _, _, _, _, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: y

def node_length(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, _, length, _, _, _, _, _, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: length

def node_speed(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, _, _, speed, _, _, _, _, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: speed

def node_slots(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, _, _, _, slots, _, _, _, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: slots

def node_roadLimit(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, _, _, _, _, roadLimit, _, _, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: roadLimit

def node_work(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, _, _, _, _, _, work, _, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: work


def node_next(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, _, _, _, _, _, _, next, _, _, +workers, +serviceMode, +releaseMode, +stopClass}: next

def node_nextFinding(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, _, _, _, _, _, _, _, nextFinding, _, +workers, +serviceMode, +releaseMode, +stopClass}: nextFinding

def node_immediate(+value: M.Node) -> Bool:
  match value:
    case M.Site{_, _, _, _, _, _, _, _, _, _, _, _, _, immediate, +workers, +serviceMode, +releaseMode, +stopClass}: immediate

def enemy_id(+value: M.Enemy) -> U32:
  match value:
    case M.Packet{id, _, _, _, _, _, +edit, +bytes}: id

def enemy_stage(+value: M.Enemy) -> U32:
  match value:
    case M.Packet{_, stage, _, _, _, _, +edit, +bytes}: stage

def enemy_progress(+value: M.Enemy) -> U32:
  match value:
    case M.Packet{_, _, progress, _, _, _, +edit, +bytes}: progress

def enemy_effort(+value: M.Enemy) -> U32:
  match value:
    case M.Packet{_, _, _, effort, _, _, +edit, +bytes}: effort

def enemy_inside(+value: M.Enemy) -> Bool:
  match value:
    case M.Packet{_, _, _, _, inside, _, +edit, +bytes}: inside



def enemy_finding(+value: M.Enemy) -> Bool:
  match value:
    case M.Packet{_, _, _, _, _, finding, +edit, +bytes}: finding

def tower_x(+value: M.Tower) -> U32:
  match value:
    case M.Processor{x, _, _, _, _, _, _, _, _}: x

def tower_y(+value: M.Tower) -> U32:
  match value:
    case M.Processor{_, y, _, _, _, _, _, _, _}: y

def tower_kind(+value: M.Tower) -> U32:
  match value:
    case M.Processor{_, _, kind, _, _, _, _, _, _}: kind

def tower_level(+value: M.Tower) -> U32:
  match value:
    case M.Processor{_, _, _, level, _, _, _, _, _}: level

def tower_cooldown(+value: M.Tower) -> U32:
  match value:
    case M.Processor{_, _, _, _, cooldown, _, _, _, _}: cooldown

def tower_flash(+value: M.Tower) -> U32:
  match value:
    case M.Processor{_, _, _, _, _, flash, _, _, _}: flash

def tower_aimX(+value: M.Tower) -> U32:
  match value:
    case M.Processor{_, _, _, _, _, _, aimX, _, _}: aimX

def tower_aimY(+value: M.Tower) -> U32:
  match value:
    case M.Processor{_, _, _, _, _, _, _, aimY, _}: aimY


def node_workers(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, _, _, _, _, _, _, _, _, _, workers, _, _, _}: workers

def node_serviceMode(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, serviceMode, _, _}: serviceMode

def node_releaseMode(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, releaseMode, _}: releaseMode

def node_stopClass(+value: M.Node) -> U32:
  match value:
    case M.Site{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, stopClass}: stopClass

def config_rules(+value: M.Config) -> M.Rules:
  match value:
    case M.Board{_, _, _, _, _, _, _, _, _, _, rules}: rules

def enemy_edit(+value: M.Enemy) -> U32:
  match value:
    case M.Packet{_, _, _, _, _, _, edit, _}: edit

def enemy_bytes(+value: M.Enemy) -> U32:
  match value:
    case M.Packet{_, _, _, _, _, _, _, bytes}: bytes

def runtime_stop(+value: M.Runtime) -> U32:
  match value:
    case M.Run{stop, _, _, _, _, _, _, _, _, _, _, _}: stop

def runtime_deadline(+value: M.Runtime) -> U32:
  match value:
    case M.Run{_, deadline, _, _, _, _, _, _, _, _, _, _}: deadline

def runtime_flushAge(+value: M.Runtime) -> U32:
  match value:
    case M.Run{_, _, flushAge, _, _, _, _, _, _, _, _, _}: flushAge

def runtime_writer(+value: M.Runtime) -> M.Writer:
  match value:
    case M.Run{_, _, _, writer, _, _, _, _, _, _, _, _}: writer

def runtime_cancelled(+value: M.Runtime) -> U32:
  match value:
    case M.Run{_, _, _, _, cancelled, _, _, _, _, _, _, _}: cancelled

def runtime_limited(+value: M.Runtime) -> U32:
  match value:
    case M.Run{_, _, _, _, _, limited, _, _, _, _, _, _}: limited

def runtime_batches(+value: M.Runtime) -> U32:
  match value:
    case M.Run{_, _, _, _, _, _, batches, _, _, _, _, _}: batches

def runtime_acknowledged(+value: M.Runtime) -> U32:
  match value:
    case M.Run{_, _, _, _, _, _, _, acknowledged, _, _, _, _}: acknowledged

def runtime_clear(+value: M.Runtime) -> U32:
  match value:
    case M.Run{_, _, _, _, _, _, _, _, clear, _, _, _}: clear

def runtime_findings(+value: M.Runtime) -> U32:
  match value:
    case M.Run{_, _, _, _, _, _, _, _, _, findings, _, _}: findings

def runtime_attempts(+value: M.Runtime) -> U32:
  match value:
    case M.Run{_, _, _, _, _, _, _, _, _, _, attempts, _}: attempts

def runtime_cutoff(+value: M.Runtime) -> Bool:
  match value:
    case M.Run{_, _, _, _, _, _, _, _, _, _, _, cutoff}: cutoff

def tower_support(t: M.Tower) -> M.Support:
  match t:
    case M.Processor{_, _, _, _, _, _, _, _, support}: support

def support_charges(s: M.Support) -> U32:
  match s:
    case M.Pulse{charges, _}: charges

def support_prevented(s: M.Support) -> U32:
  match s:
    case M.Pulse{_, prevented}: prevented

def tower_charges(t: M.Tower) -> U32:
  support_charges(tower_support(t))

def tower_prevented(t: M.Tower) -> U32:
  support_prevented(tower_support(t))

def writer_members(+value: M.Writer) -> List<&2,U32>:
  match value:
    case M.Output{members, _, _, _}: members

def writer_bytes(+value: M.Writer) -> U32:
  match value:
    case M.Output{_, bytes, _, _}: bytes

def writer_left(+value: M.Writer) -> U32:
  match value:
    case M.Output{_, _, left, _}: left

def writer_deadline(+value: M.Writer) -> U32:
  match value:
    case M.Output{_, _, _, deadline}: deadline

def rules_groupSize(+value: M.Rules) -> U32:
  match value:
    case M.Contract{groupSize, _, _, _, _, _, _, _, _, _, _, _}: groupSize

def rules_batchBytes(+value: M.Rules) -> U32:
  match value:
    case M.Contract{_, batchBytes, _, _, _, _, _, _, _, _, _, _}: batchBytes

def rules_batchOverhead(+value: M.Rules) -> U32:
  match value:
    case M.Contract{_, _, batchOverhead, _, _, _, _, _, _, _, _, _}: batchOverhead

def rules_itemOverhead(+value: M.Rules) -> U32:
  match value:
    case M.Contract{_, _, _, itemOverhead, _, _, _, _, _, _, _, _}: itemOverhead

def rules_batchTarget(+value: M.Rules) -> U32:
  match value:
    case M.Contract{_, _, _, _, batchTarget, _, _, _, _, _, _, _}: batchTarget

def rules_flushTicks(+value: M.Rules) -> U32:
  match value:
    case M.Contract{_, _, _, _, _, flushTicks, _, _, _, _, _, _}: flushTicks

def rules_writerTicks(+value: M.Rules) -> U32:
  match value:
    case M.Contract{_, _, _, _, _, _, writerTicks, _, _, _, _, _}: writerTicks

def rules_stopTicks(+value: M.Rules) -> U32:
  match value:
    case M.Contract{_, _, _, _, _, _, _, stopTicks, _, _, _, _}: stopTicks

def rules_drainTicks(+value: M.Rules) -> U32:
  match value:
    case M.Contract{_, _, _, _, _, _, _, _, drainTicks, _, _, _}: drainTicks

def rules_smallBytes(+value: M.Rules) -> U32:
  match value:
    case M.Contract{_, _, _, _, _, _, _, _, _, smallBytes, _, _}: smallBytes

def rules_largeBytes(+value: M.Rules) -> U32:
  match value:
    case M.Contract{_, _, _, _, _, _, _, _, _, _, largeBytes, _}: largeBytes

def rules_oversizeEvery(+value: M.Rules) -> U32:
  match value:
    case M.Contract{_, _, _, _, _, _, _, _, _, _, _, oversizeEvery}: oversizeEvery

def state_clock(+value: M.State) -> U32:
  match value:
    case M.World{clock, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: clock

def state_waveClock(+value: M.State) -> U32:
  match value:
    case M.World{_, waveClock, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: waveClock

def state_wave(+value: M.State) -> U32:
  match value:
    case M.World{_, _, wave, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: wave

def state_phase(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, phase, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: phase

def state_lives(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, lives, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: lives

def state_gold(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, gold, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: gold

def state_score(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, score, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: score

def state_left(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, _, left, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: left

def state_arrivalIn(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, _, _, arrivalIn, _, _, _, _, _, _, _, _, _, _, _, _, _}: arrivalIn

def state_pace(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, pace, _, _, _, _, _, _, _, _, _, _, _, _}: pace

def state_paused(+value: M.State) -> Bool:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, paused, _, _, _, _, _, _, _, _, _, _, _}: paused

def state_choice(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, choice, _, _, _, _, _, _, _, _, _, _}: choice

def state_selected(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, selected, _, _, _, _, _, _, _, _, _}: selected

def state_mouseX(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, mouseX, _, _, _, _, _, _, _, _}: mouseX

def state_mouseY(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, mouseY, _, _, _, _, _, _, _}: mouseY

def state_offered(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, offered, _, _, _, _, _, _}: offered

def state_finished(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, finished, _, _, _, _, _}: finished

def state_dropped(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, dropped, _, _, _, _}: dropped

def state_pressure(+value: M.State) -> U32:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, pressure, _, _, _}: pressure

def state_towers(+value: M.State) -> List<&2,M.Tower>:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, towers, _, _}: towers

def state_enemies(+value: M.State) -> List<&2,M.Enemy>:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, enemies, _}: enemies

def state_runtime(+value: M.State) -> M.Runtime:
  match value:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, runtime}: runtime

def pick_node(+a: M.Node, +b: M.Node, +yes: Bool) -> M.Node:
  match yes:
    case True{}: a
    case False{}: b

def find_node(+xs: List<&2, M.Node>, +id: U32) -> M.Node:
  match xs:
    case Nil{}: M.Site{255, "INVALID", 0, 0, 0, 0, 1, 1, 0, 0, 1, 255, 255, True{}, 0, 0, 0, 0}
    case Con{+head, tail}: pick_node(head, find_node(tail, id), U32.is_eq(node_id(head), id))

def get_node(+config: M.Config, +id: U32) -> M.Node:
  find_node(config_nodes(config), id)

def entry(+xs: List<&2, M.Node>) -> U32:
  match xs:
    case Nil{}: 255
    case Con{head, _}: node_id(head)

def enemy_count(+xs: List<&2, M.Enemy>) -> U32:
  match xs:
    case Nil{}: 0
    case Con{_, tail}: (1 + enemy_count(tail) : U32)

def inside_in(+xs: List<&2, M.Enemy>, +id: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(1, 0, U32.is_eq(enemy_stage(head), id) && enemy_inside(head)) + inside_in(tail, id) : U32)

def road_in(+xs: List<&2, M.Enemy>, +id: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(1, 0, U32.is_eq(enemy_stage(head), id) && Bool.not(enemy_inside(head))) + road_in(tail, id) : U32)

def danger_count(+xs: List<&2, M.Enemy>) -> U32:
  match xs:
    case Nil{}: 0
    case Con{head, tail}: (M.choose(1, 0, enemy_inside(head)) + danger_count(tail) : U32)

def interpolate(+a: U32, +b: U32, +p: U32, +length: U32) -> U32:
  M.choose((a + M.sub(b, a) * p / U32.max(1, length) : U32), M.sub(a, (M.sub(a, b) * p / U32.max(1, length) : U32)), (b >= a : U32))

def enemy_position(+config: M.Config, +enemy: M.Enemy) -> U32 & U32:
  +node = get_node(config, enemy_stage(enemy))
  +progress = U32.min(enemy_progress(enemy), node_length(node))
  (interpolate(node_startX(node), node_x(node), progress, node_length(node)), interpolate(node_startY(node), node_y(node), progress, node_length(node)))

def cost(+kind: U32) -> U32:
  M.choose(35, M.choose(55, M.choose(45, M.choose(70, M.choose(35, M.choose(60, 50, U32.is_eq(kind, 5)), U32.is_eq(kind, 4)), U32.is_eq(kind, 3)), U32.is_eq(kind, 2)), U32.is_eq(kind, 1)), U32.is_eq(kind, 0))

def range(+kind: U32, +level: U32) -> U32:
  (M.choose(96, M.choose(110, M.choose(150, 112, U32.is_eq(kind, 2)), U32.is_eq(kind, 1)), U32.is_eq(kind, 0)) + level * 10 : U32)

def power(+kind: U32, +level: U32) -> U32:
  M.choose((8 + level * 4 : U32), M.choose((14 + level * 4 : U32), M.choose((4 + level * 2 : U32), M.choose((6 + level * 3 : U32), 0, U32.is_eq(kind, 4)), U32.is_eq(kind, 2)), U32.is_eq(kind, 1)), U32.is_eq(kind, 0))

def cooldown(+kind: U32) -> U32:
  M.choose(8, M.choose(18, M.choose(8, 12, U32.is_eq(kind, 4)), U32.is_eq(kind, 1)), U32.is_eq(kind, 0))

type RoadResult is Data:
  Moved{enemies: List<&2, M.Enemy>, +dropped: U32}

def moved_enemies(+r: RoadResult) -> List<&2, M.Enemy>:
  match r:
    case Moved{enemies, _}: enemies

def moved_dropped(+r: RoadResult) -> U32:
  match r:
    case Moved{_, dropped}: dropped

def enter_full(+enemy: M.Enemy, +jobs: List<&2, M.Enemy>, +dropped: U32, +immediate: Bool) -> RoadResult:
  match immediate:
    case True{}: Moved{jobs, (dropped + 1 : U32)}
    case False{}: Moved{List.append(&2, M.Enemy, jobs, [enemy]), dropped}

def enter(+enemy: M.Enemy, +node: M.Node, +progress: U32, +jobs: List<&2, M.Enemy>, +dropped: U32, +endpoint: Bool, +capacity: Bool) -> RoadResult:
  match enemy endpoint capacity:
    case M.Packet{id, stage, _, effort, _, finding, +edit, +bytes} True{} True{}:
      Moved{List.append(&2, M.Enemy, jobs, [M.Packet{id, stage, node_length(node), effort, True{}, finding, edit, bytes}]), dropped}
    case M.Packet{id, stage, _, effort, _, finding, +edit, +bytes} True{} False{}:
      enter_full(M.Packet{id, stage, M.sub(node_length(node), 1), effort, False{}, finding, edit, bytes}, jobs, dropped, node_immediate(node))
    case M.Packet{id, stage, _, effort, _, finding, +edit, +bytes} False{} _:
      Moved{List.append(&2, M.Enemy, jobs, [M.Packet{id, stage, progress, effort, False{}, finding, edit, bytes}]), dropped}

def was_inside(+xs: List<&2, M.Enemy>, +id: U32) -> Bool:
  match xs:
    case Nil{}: False{}
    case Con{+head, tail}: (U32.is_eq(enemy_id(head), id) && enemy_inside(head)) || was_inside(tail, id)

def newly_inside(+xs: List<&2, M.Enemy>, +snapshot: List<&2, M.Enemy>, +stage: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(1, 0, U32.is_eq(enemy_stage(head), stage) && enemy_inside(head) && Bool.not(was_inside(snapshot, enemy_id(head)))) + newly_inside(tail, snapshot, stage) : U32)

type Aim is Data:
  Target{found: Bool, +id: U32, +stage: U32, +x: U32, +y: U32}

def aim_pick(+a: Aim, +b: Aim, +yes: Bool) -> Aim:
  match yes:
    case True{}: a
    case False{}: b

def work_one(+enemy: M.Enemy, +amount: U32, +yes: Bool) -> M.Enemy:
  match enemy:
    case M.Packet{id, stage, progress, +effort, inside, finding, +edit, +bytes}:
      M.Packet{id, stage, progress, M.sub(effort, M.choose(amount, 0, yes)), inside, finding, edit, bytes}

type Shot is Data:
  Fired{tower: M.Tower, +enemies: List<&2, M.Enemy>}

def fired_tower(+r: Shot) -> M.Tower:
  match r:
    case Fired{tower, _}: tower

def fired_enemies(+r: Shot) -> List<&2, M.Enemy>:
  match r:
    case Fired{_, enemies}: enemies

type Combat is Data:
  Processed{towers: List<&2, M.Tower>, +enemies: List<&2, M.Enemy>}

def processed_towers(+r: Combat) -> List<&2, M.Tower>:
  match r:
    case Processed{towers, _}: towers

def processed_enemies(+r: Combat) -> List<&2, M.Enemy>:
  match r:
    case Processed{_, enemies}: enemies

def snap(+value: U32) -> U32:
  ((value / 32) * 32 + 16 : U32)

def near_road(+node: M.Node, +x: U32, +y: U32) -> Bool:
  +ax = U32.to_f32(node_startX(node))
  +ay = U32.to_f32(node_startY(node))
  +dx = (U32.to_f32(node_x(node)) - ax : F32)
  +dy = (U32.to_f32(node_y(node)) - ay : F32)
  +px = (U32.to_f32(x) - ax : F32)
  +py = (U32.to_f32(y) - ay : F32)
  +length2 = (dx * dx + dy * dy : F32)
  +t = F32.clamp(((px * dx + py * dy) / F32.max(1.0, length2) : F32), 0.0, 1.0)
  +ex = (px - t * dx : F32)
  +ey = (py - t * dy : F32)
  (ex * ex + ey * ey < 144.0 : F32)

def ground_clear(+xs: List<&2, M.Node>, +x: U32, +y: U32) -> Bool:
  match xs:
    case Nil{}: True{}
    case Con{+head, tail}: Bool.not(near_road(head, x, y)) && (M.distance(x, y, node_x(head), node_y(head)) >= 1024 : U32) && ground_clear(tail, x, y)

def tower_index(+xs: List<&2, M.Tower>, +x: U32, +y: U32, +index: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: M.choose(index, tower_index(tail, x, y, (index + 1 : U32)), (M.distance(x, y, tower_x(head), tower_y(head)) < 784 : U32))

def placement_valid(+config: M.Config, +towers: List<&2, M.Tower>, +x: U32, +y: U32) -> Bool:
  (x >= 32 : U32) && (x <= 480 : U32) && (y >= 104 : U32) && (y <= 464 : U32) && ground_clear(config_nodes(config), x, y) && U32.is_eq(tower_index(towers, x, y, 1), 0)

def decide(+a: M.State, +b: M.State, +yes: Bool) -> M.State:
  match yes:
    case True{}: a
    case False{}: b

def select(+state: M.State, +index: U32) -> M.State:
  match state:
    case M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, choice, _, mx, my, offered, finished, dropped, pressure, towers, enemies, +runtime}:
      M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, choice, index, mx, my, offered, finished, dropped, pressure, towers, enemies, runtime}

def move(+state: M.State, +x: U32, +y: U32) -> M.State:
  match state:
    case M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, choice, selected, _, _, offered, finished, dropped, pressure, towers, enemies, +runtime}:
      M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, choice, selected, x, y, offered, finished, dropped, pressure, towers, enemies, runtime}

def build(+config: M.Config, +state: M.State, +x: U32, +y: U32) -> M.State:
  match state:
    case M.World{+clock, +waveClock, +wave, +phase, +lives, +gold, +score, +left, +arrivalIn, +pace, +paused, +choice, +selected, +mx, +my, +offered, +finished, +dropped, +pressure, +towers, +enemies, +runtime}:
      decide(M.World{clock, waveClock, wave, phase, lives, M.sub(gold, cost(choice)), score, left, arrivalIn, pace, paused, choice, 0, mx, my, offered, finished, dropped, pressure, Con{M.Processor{x, y, choice, 1, 0, 0, x, y, M.Pulse{240, 0}}, towers}, enemies, runtime}, state, placement_valid(config, towers, x, y) && (gold >= cost(choice) : U32) && (phase < 2 : U32))

def click_pick(+config: M.Config, +state: M.State, +x: U32, +y: U32, +index: U32) -> M.State:
  decide(select(state, index), build(config, state, x, y), (index > 0 : U32))

def click(+config: M.Config, +state: M.State, +x: U32, +y: U32, +button: U32) -> M.State:
  match state:
    case M.World{_, _, _, +phase, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, +towers, _, +runtime}:
      decide(click_pick(config, move(state, x, y), snap(x), snap(y), tower_index(towers, x, y, 1)), state, U32.is_eq(button, 0) && (phase < 2 : U32))

def upgrade_price(+xs: List<&2, M.Tower>, +index: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: M.choose(M.choose((20 + tower_level(head) * 20 : U32), 0, (tower_level(head) < 3 : U32)), upgrade_price(tail, M.sub(index, 1)), U32.is_eq(index, 1))

def upgrade_one(+tower: M.Tower, +yes: Bool) -> M.Tower:
  match tower yes:
    case M.Processor{x, y, kind, level, cd, flash, ax, ay, +support} True{}: M.Processor{x, y, kind, (level + 1 : U32), cd, flash, ax, ay, support}
    case other False{}: other

def upgraded(+xs: List<&2, M.Tower>, +index: U32) -> List<&2, M.Tower>:
  match xs:
    case Nil{}: Nil{}
    case Con{head, tail}: Con{upgrade_one(head, U32.is_eq(index, 1)), upgraded(tail, M.sub(index, 1))}

def upgrade(+state: M.State) -> M.State:
  match state:
    case M.World{+clock, +waveClock, +wave, +phase, +lives, +gold, +score, +left, +arrivalIn, +pace, +paused, +choice, +selected, +mx, +my, +offered, +finished, +dropped, +pressure, +towers, +enemies, +runtime}:
      +price = upgrade_price(towers, selected)
      decide(M.World{clock, waveClock, wave, phase, lives, M.sub(gold, price), score, left, arrivalIn, pace, paused, choice, selected, mx, my, offered, finished, dropped, pressure, upgraded(towers, selected), enemies, runtime}, state, (price > 0 : U32) && (gold >= price : U32) && (phase < 2 : U32))

def choose(+state: M.State, +kind: U32) -> M.State:
  match state:
    case M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, _, selected, mx, my, offered, finished, dropped, pressure, towers, enemies, +runtime}:
      M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, kind, selected, mx, my, offered, finished, dropped, pressure, towers, enemies, runtime}

def pause(+state: M.State) -> M.State:
  match state:
    case M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, choice, selected, mx, my, offered, finished, dropped, pressure, towers, enemies, +runtime}:
      M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, Bool.not(paused), choice, selected, mx, my, offered, finished, dropped, pressure, towers, enemies, runtime}

def pacing(+state: M.State, +slower: Bool) -> M.State:
  match state:
    case M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, +pace, paused, choice, selected, mx, my, offered, finished, dropped, pressure, towers, enemies, +runtime}:
      M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, M.choose(U32.min(36, (pace + 2 : U32)), U32.max(6, M.sub(pace, 2)), slower), paused, choice, selected, mx, my, offered, finished, dropped, pressure, towers, enemies, runtime}


# Worker eligibility is independent of storage occupancy.
def member(+xs: List<&2, U32>, +id: U32) -> Bool:
  match xs:
    case Nil{}: False{}
    case Con{head, tail}: U32.is_eq(head, id) || member(tail, id)

def writer_active(+writer: M.Writer) -> Bool:
  Bool.not(List.is_empty(&2, U32, writer_members(writer)))

def empty_runtime() -> M.Runtime:
  M.Run{0, 0, 0, M.Output{Nil{}, 0, 0, 0}, 0, 0, 0, 0, 0, 0, 0, False{}}

def unfinished(+config: M.Config, +enemy: M.Enemy) -> Bool:
  +kind = node_stopClass(get_node(config, enemy_stage(enemy)))
  U32.is_eq(kind, 0) || (U32.is_eq(kind, 2) && Bool.not(enemy_inside(enemy) && U32.is_eq(enemy_effort(enemy), 0)))

def completed_finding(+config: M.Config, +enemy: M.Enemy) -> Bool:
  enemy_finding(enemy) && enemy_inside(enemy) && U32.is_eq(enemy_effort(enemy), 0) && U32.is_eq(node_stopClass(get_node(config, enemy_stage(enemy))), 2)

def upstream_count(+xs: List<&2, M.Enemy>, +config: M.Config) -> U32:
  match xs:
    case Nil{}: 0
    case Con{head, tail}: (M.choose(1, 0, unfinished(config, head)) + upstream_count(tail, config) : U32)

def sibling_pending(+xs: List<&2, M.Enemy>, +config: M.Config, +edit: U32) -> Bool:
  match xs:
    case Nil{}: False{}
    case Con{+head, tail}: (U32.is_eq(enemy_edit(head), edit) && unfinished(config, head)) || sibling_pending(tail, config, edit)

def edit_ready_at(+config: M.Config, +jobs: List<&2, M.Enemy>, +runtime: M.Runtime, +offered: U32, +edit: U32) -> Bool:
  runtime_cutoff(runtime) || ((offered >= edit * U32.max(1, rules_groupSize(config_rules(config))) : U32) && Bool.not(sibling_pending(jobs, config, edit)))

def edit_ready(+config: M.Config, +state: M.State, +edit: U32) -> Bool:
  edit_ready_at(config, state_enemies(state), state_runtime(state), state_offered(state), edit)

# Support placement selects one nearest eligible site, with stable configuration-order ties.
def nearest_site(xs: List<&2, M.Node>, +tower: M.Tower, +best: U32, +distance: U32) -> U32:
  match xs:
    case Nil{}: best
    case Con{+head, tail}:
      +d = M.distance(tower_x(tower), tower_y(tower), node_x(head), node_y(head))
      +kind = tower_kind(tower)
      +eligible = (d <= M.square(range(kind, tower_level(tower))) : U32) &&
        (Bool.not(U32.is_eq(kind, 3)) || U32.is_eq(node_serviceMode(head), 0)) &&
        (Bool.not(U32.is_eq(kind, 5)) || U32.is_eq(node_serviceMode(head), 1))
      +take = eligible && (d < distance : U32)
      nearest_site(tail, tower, M.choose(node_id(head), best, take), M.choose(d, distance, take))

def support_target(+config: M.Config, tower: M.Tower) -> U32:
  nearest_site(config_nodes(config), tower, 255, 4294967295)

def support_levels(xs: List<&2, M.Tower>, +config: M.Config, +kind: U32, +stage: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(tower_level(head), 0, U32.is_eq(tower_kind(head), kind) && U32.is_eq(support_target(config, head), stage)) + support_levels(tail, config, kind, stage) : U32)

def worker_grant(+config: M.Config, +towers: List<&2, M.Tower>, +stage: U32) -> U32:
  M.choose(U32.min(2, support_levels(towers, config, 3, stage)), 0, U32.is_eq(node_serviceMode(get_node(config, stage)), 0))

def effective_workers(+config: M.Config, +state: M.State, +stage: U32) -> U32:
  (node_workers(get_node(config, stage)) + worker_grant(config, state_towers(state), stage) : U32)

def writer_site(xs: List<&2, M.Node>) -> U32:
  match xs:
    case Nil{}: 255
    case Con{+head, tail}: M.choose(node_id(head), writer_site(tail), U32.is_eq(node_serviceMode(head), 1))

def package_level(+config: M.Config, towers: List<&2, M.Tower>) -> U32:
  U32.min(3, support_levels(towers, config, 5, writer_site(config_nodes(config))))

def package_overhead(+config: M.Config, +state: M.State) -> U32:
  M.sub(rules_itemOverhead(config_rules(config)), (package_level(config, state_towers(state)) * 16 : U32))

def package_target(+config: M.Config, +state: M.State) -> U32:
  (rules_batchTarget(config_rules(config)) + package_level(config, state_towers(state)) : U32)

def granted_node(node: M.Node, bonus: U32) -> M.Node:
  match node:
    case M.Site{id,label,sx,sy,x,y,length,speed,slots,roadLimit,work,next,nextFinding,immediate,workers,serviceMode,releaseMode,stopClass}:
      M.Site{id,label,sx,sy,x,y,length,speed,slots,roadLimit,work,next,nextFinding,immediate,(workers + bonus : U32),serviceMode,releaseMode,stopClass}

def granted_nodes(xs: List<&2, M.Node>, +config: M.Config, +towers: List<&2, M.Tower>) -> List<&2, M.Node>:
  match xs:
    case Nil{}: Nil{}
    case Con{+head,tail}: Con{granted_node(head, worker_grant(config,towers,node_id(head))), granted_nodes(tail,config,towers)}

def packaged_rules(rules: M.Rules, +level: U32) -> M.Rules:
  match rules:
    case M.Contract{groupSize,batchBytes,batchOverhead,itemOverhead,batchTarget,flushTicks,writerTicks,stopTicks,drainTicks,smallBytes,largeBytes,oversizeEvery}:
      M.Contract{groupSize,batchBytes,batchOverhead,M.sub(itemOverhead,(level * 16 : U32)),(batchTarget + level : U32),flushTicks,writerTicks,stopTicks,drainTicks,smallBytes,largeBytes,oversizeEvery}

# Derived per-tick service/encoding configuration is not persisted product capacity.
def supported_config(+config: M.Config, +towers: List<&2, M.Tower>) -> M.Config:
  match config:
    case M.Board{label,+nodes,lives,gold,pace,waves,waveTicks,pressureEvery,baseDemand,demandRamp,rules}:
      M.Board{label,granted_nodes(nodes,config,towers),lives,gold,pace,waves,waveTicks,pressureEvery,baseDemand,demandRamp,packaged_rules(rules,package_level(config,towers))}

def qualified(+config: M.Config, +enemy: M.Enemy, +jobs: List<&2, M.Enemy>, +runtime: M.Runtime, +offered: U32) -> Bool:
  +node = get_node(config, enemy_stage(enemy))
  enemy_inside(enemy) && (enemy_effort(enemy) > 0 : U32) &&
    (U32.is_eq(node_releaseMode(node), 0) || edit_ready_at(config, jobs, runtime, offered, enemy_edit(enemy))) &&
    (U32.is_eq(node_serviceMode(node), 0) || member(writer_members(runtime_writer(runtime)), enemy_id(enemy)))

def worker_rank(+xs: List<&2, M.Enemy>, +config: M.Config, +jobs: List<&2, M.Enemy>, +runtime: M.Runtime, +offered: U32, +id: U32, +stage: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(1, 0, U32.is_eq(enemy_stage(head), stage) && (enemy_id(head) < id : U32) && qualified(config, head, jobs, runtime, offered)) + worker_rank(tail, config, jobs, runtime, offered, id, stage) : U32)

def active_at(+config: M.Config, +jobs: List<&2, M.Enemy>, +runtime: M.Runtime, +offered: U32, +enemy: M.Enemy) -> Bool:
  +node = get_node(config, enemy_stage(enemy))
  qualified(config, enemy, jobs, runtime, offered) && (U32.is_eq(node_serviceMode(node), 1) || (worker_rank(jobs, config, jobs, runtime, offered, enemy_id(enemy), enemy_stage(enemy)) < node_workers(node) : U32))

def active_enemy(+config: M.Config, +state: M.State, +enemy: M.Enemy) -> Bool:
  active_at(supported_config(config, state_towers(state)), state_enemies(state), state_runtime(state), state_offered(state), enemy)

def held_findings(xs: List<&2, M.Enemy>, +config: M.Config, +edit: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}:
      +node = get_node(config, enemy_stage(head))
      (M.choose(1, 0, U32.is_eq(enemy_edit(head), edit) && enemy_finding(head) &&
        (completed_finding(config, head) || (U32.is_eq(node_releaseMode(node), 1) && U32.is_eq(node_stopClass(node), 1)))) + held_findings(tail, config, edit) : U32)

def coordinator_blockers(+config: M.Config, +state: M.State, +enemy: M.Enemy) -> U32:
  M.choose(held_findings(state_enemies(state), config, enemy_edit(enemy)), 0, unfinished(config, enemy))

def coordinator_scan(xs: List<&2, M.Enemy>, +config: M.Config, +jobs: List<&2, M.Enemy>, +runtime: M.Runtime, +offered: U32, +tower: M.Tower, +best: U32, +score: U32, +effort: U32) -> U32:
  match xs:
    case Nil{}: best
    case Con{+head, tail}:
      +node = get_node(config, enemy_stage(head))
      +waiting = held_findings(jobs, config, enemy_edit(head))
      +remaining = enemy_effort(head)
      +id = enemy_id(head)
      +better = (waiting > score : U32) || (U32.is_eq(waiting, score) && ((remaining < effort : U32) || (U32.is_eq(remaining, effort) && (id < best : U32))))
      +take = unfinished(config, head) && active_at(config, jobs, runtime, offered, head) &&
        (waiting > 0 : U32) && (M.distance(tower_x(tower), tower_y(tower), node_x(node), node_y(node)) <= M.square(range(4, tower_level(tower))) : U32) && better
      coordinator_scan(tail, config, jobs, runtime, offered, tower, M.choose(id,best,take), M.choose(waiting,score,take), M.choose(remaining,effort,take))

def coordinator_target(+config: M.Config, +state: M.State, tower: M.Tower) -> U32:
  coordinator_scan(state_enemies(state), supported_config(config,state_towers(state)),state_enemies(state),state_runtime(state),state_offered(state),tower,0,0,4294967295)

def id_aim(xs: List<&2, M.Enemy>, +config: M.Config, +id: U32) -> Aim:
  match xs:
    case Nil{}: Target{False{},0,0,0,0}
    case Con{+head,tail}:
      +node = get_node(config,enemy_stage(head))
      aim_pick(Target{True{},id,enemy_stage(head),node_x(node),node_y(node)}, id_aim(tail,config,id), U32.is_eq(enemy_id(head),id) && (id > 0 : U32))

def pending_inside(xs: List<&2, M.Enemy>, +id: U32, +reserved: List<&2, U32>, +writerNode: Bool) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(1, 0, U32.is_eq(enemy_stage(head), id) && enemy_inside(head) && Bool.not(writerNode && member(reserved, enemy_id(head)))) + pending_inside(tail, id, reserved, writerNode) : U32)

def storage_at(+config: M.Config, jobs: List<&2, M.Enemy>, +runtime: M.Runtime, +stage: U32) -> U32:
  pending_inside(jobs, stage, writer_members(runtime_writer(runtime)), True{})

def storage_in(+config: M.Config, +state: M.State, stage: U32) -> U32:
  storage_at(config, state_enemies(state), state_runtime(state), stage)

def new_pending_inside(xs: List<&2, M.Enemy>, +snapshot: List<&2, M.Enemy>, +stage: U32, +reserved: List<&2, U32>, +writerNode: Bool) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(1, 0, U32.is_eq(enemy_stage(head), stage) && enemy_inside(head) && Bool.not(was_inside(snapshot, enemy_id(head))) && Bool.not(writerNode && member(reserved, enemy_id(head)))) + new_pending_inside(tail, snapshot, stage, reserved, writerNode) : U32)

def motion_one(+enemy: M.Enemy, +config: M.Config, +snapshot: List<&2, M.Enemy>, +jobs: List<&2, M.Enemy>, +dropped: U32, +runtime: M.Runtime, +offered: U32) -> RoadResult:
  match enemy:
    case M.Packet{id, stage, progress, effort, True{}, finding, edit, bytes}:
      Moved{List.append(&2, M.Enemy, jobs, [M.Packet{id, stage, progress, M.sub(effort, M.choose(1, 0, active_at(config, snapshot, runtime, offered, enemy))), True{}, finding, edit, bytes}]), dropped}
    case M.Packet{id, +stage, +progress, effort, False{}, finding, edit, bytes}:
      +node = get_node(config, stage)
      +next = U32.min(node_length(node), (progress + node_speed(node) : U32))
      +reserved = (storage_at(config, snapshot, runtime, stage) + new_pending_inside(jobs, snapshot, stage, writer_members(runtime_writer(runtime)), True{}) : U32)
      enter(enemy, node, next, jobs, dropped, (next >= node_length(node) : U32), ((reserved < node_slots(node) : U32) || member(writer_members(runtime_writer(runtime)), id)))

def motion(+xs: List<&2, M.Enemy>, +config: M.Config, +snapshot: List<&2, M.Enemy>, +jobs: List<&2, M.Enemy>, +dropped: U32, +runtime: M.Runtime, +offered: U32) -> RoadResult:
  match xs:
    case Nil{}: Moved{jobs, dropped}
    case Con{head, tail}:
      +step = motion_one(head, config, snapshot, jobs, dropped, runtime, offered)
      motion(tail, config, snapshot, moved_enemies(step), moved_dropped(step), runtime, offered)

def max_id(+xs: List<&2, M.Enemy>) -> U32:
  match xs:
    case Nil{}: 0
    case Con{head, tail}: U32.max(enemy_id(head), max_id(tail))

# Isolated fixture wrapper: no writer reservation or Stop state; runtime advance uses motion directly.
def road_step(+xs: List<&2, M.Enemy>, +config: M.Config, +snapshot: List<&2, M.Enemy>, +jobs: List<&2, M.Enemy>, +dropped: U32) -> RoadResult:
  motion(xs, config, snapshot, jobs, dropped, empty_runtime(), max_id(xs))

def target(+xs: List<&2, M.Enemy>, +config: M.Config, +jobs: List<&2, M.Enemy>, +runtime: M.Runtime, +offered: U32, +x: U32, +y: U32, +radius: U32, +best: Aim) -> Aim:
  match xs best:
    case Nil{} _: best
    case Con{+head, tail} Target{+found, +bestId, _, _, _}:
      +node = get_node(config, enemy_stage(head))
      valid = active_at(config, jobs, runtime, offered, head) && (M.distance(x, y, node_x(node), node_y(node)) <= M.square(radius) : U32) && (Bool.not(found) || (enemy_id(head) < bestId : U32))
      target(tail, config, jobs, runtime, offered, x, y, radius, aim_pick(Target{True{}, enemy_id(head), enemy_stage(head), node_x(node), node_y(node)}, best, valid))

# Restrict every hit, including batch secondary targets, to worker-active jobs.
def active_work(+xs: List<&2, M.Enemy>, +config: M.Config, +jobs: List<&2, M.Enemy>, +runtime: M.Runtime, +offered: U32, +id: U32, +stage: U32, +batch: Bool, +amount: U32, +left: U32) -> List<&2, M.Enemy>:
  match xs:
    case Nil{}: Nil{}
    case Con{+head, tail}:
      +hit = active_at(config, jobs, runtime, offered, head) && (left > 0 : U32) && (U32.is_eq(enemy_id(head), id) || (batch && U32.is_eq(enemy_stage(head), stage)))
      Con{work_one(head, amount, hit), active_work(tail, config, jobs, runtime, offered, id, stage, batch, amount, M.sub(left, M.choose(1, 0, hit)))}

def active_shoot(+tower: M.Tower, +enemies: List<&2, M.Enemy>, +config: M.Config, +runtime: M.Runtime, +offered: U32, +aim: Aim) -> Shot:
  match tower aim:
    case M.Processor{x, y, +kind, +level, 0, _, _, _, support} Target{True{}, id, stage, +tx, +ty}:
      Fired{M.Processor{x, y, kind, level, M.sub(cooldown(kind), 1), 5, tx, ty, support}, active_work(enemies, config, enemies, runtime, offered, id, stage, U32.is_eq(kind, 1), power(kind, level), M.choose(3, 1, U32.is_eq(kind, 1)))}
    case M.Processor{x, y, kind, level, cd, flash, ax, ay, +support} _:
      Fired{M.Processor{x, y, kind, level, M.sub(cd, 1), M.sub(flash, 1), ax, ay, support}, enemies}

def tower_aim(+tower: M.Tower, +config: M.Config, +enemies: List<&2, M.Enemy>, +runtime: M.Runtime, +offered: U32) -> Aim:
  aim_pick(id_aim(enemies,config,coordinator_scan(enemies,config,enemies,runtime,offered,tower,0,0,4294967295)), target(enemies,config,enemies,runtime,offered,tower_x(tower),tower_y(tower),range(tower_kind(tower),tower_level(tower)),Target{False{},0,0,0,0}), U32.is_eq(tower_kind(tower),4))

def autotowers_step(+xs: List<&2, M.Tower>, +config: M.Config, +enemies: List<&2, M.Enemy>, +runtime: M.Runtime, +offered: U32) -> Combat:
  match xs:
    case Nil{}: Processed{Nil{}, enemies}
    case Con{+head, tail}:
      +shot = active_shoot(head, enemies, config, runtime, offered, aim_pick(tower_aim(head,config,enemies,runtime,offered), Target{False{},0,0,0,0}, (tower_kind(head) < 3 : U32) || U32.is_eq(tower_kind(head),4)))
      +rest = autotowers_step(tail, config, fired_enemies(shot), runtime, offered)
      Processed{Con{fired_tower(shot), processed_towers(rest)}, processed_enemies(rest)}

# Isolated fixture wrapper: empty runtime; live advance uses autotowers_step with actual reservations.
def towers_step(+xs: List<&2, M.Tower>, +config: M.Config, +enemies: List<&2, M.Enemy>) -> Combat:
  autotowers_step(xs, config, enemies, empty_runtime(), max_id(enemies))

# Immutable authored review-unit identity and edit grouping.
def authored_bytes(+config: M.Config, +id: U32) -> U32:
  +rules = config_rules(config)
  +oversize = (rules_oversizeEvery(rules) > 0 : U32) && U32.is_eq((id % U32.max(1, rules_oversizeEvery(rules)) : U32), 0)
  M.choose((rules_batchBytes(rules) + 1000 : U32), M.choose(rules_largeBytes(rules), rules_smallBytes(rules), U32.is_eq((id % 5 : U32), 0)), oversize)

def remove_put(+enemy: M.Enemy, +tail: List<&2, M.Enemy>, +yes: Bool) -> List<&2, M.Enemy>:
  match yes:
    case True{}: tail
    case False{}: Con{enemy, tail}

def remove_enemy(+xs: List<&2, M.Enemy>, +id: U32) -> List<&2, M.Enemy>:
  match xs:
    case Nil{}: Nil{}
    case Con{+head, tail}: remove_put(head, remove_enemy(tail, id), U32.is_eq(enemy_id(head), id))

def remove_members(+xs: List<&2, M.Enemy>, +ids: List<&2, U32>) -> List<&2, M.Enemy>:
  match xs:
    case Nil{}: Nil{}
    case Con{+head, tail}: remove_put(head, remove_members(tail, ids), member(ids, enemy_id(head)))

def count_members(+xs: List<&2, M.Enemy>, +ids: List<&2, U32>) -> U32:
  match xs:
    case Nil{}: 0
    case Con{head, tail}: (M.choose(1, 0, member(ids, enemy_id(head))) + count_members(tail, ids) : U32)

type Changes is Data:
  Changed{enemies: List<&2, M.Enemy>, +finished: U32, +dropped: U32, +gold: U32,
    score: U32, +limited: U32, +cancelled: U32, +clear: U32, +findings: U32}

def changed_enemies(+c: Changes) -> List<&2,M.Enemy>:
  match c:
    case Changed{enemies, _, _, _, _, _, _, _, _}: enemies

def changed_finished(+c: Changes) -> U32:
  match c:
    case Changed{_, finished, _, _, _, _, _, _, _}: finished

def changed_dropped(+c: Changes) -> U32:
  match c:
    case Changed{_, _, dropped, _, _, _, _, _, _}: dropped

def changed_gold(+c: Changes) -> U32:
  match c:
    case Changed{_, _, _, gold, _, _, _, _, _}: gold

def changed_score(+c: Changes) -> U32:
  match c:
    case Changed{_, _, _, _, score, _, _, _, _}: score

def changed_limited(+c: Changes) -> U32:
  match c:
    case Changed{_, _, _, _, _, limited, _, _, _}: limited

def changed_cancelled(+c: Changes) -> U32:
  match c:
    case Changed{_, _, _, _, _, _, cancelled, _, _}: cancelled

def changed_clear(+c: Changes) -> U32:
  match c:
    case Changed{_, _, _, _, _, _, _, clear, _}: clear

def changed_findings(+c: Changes) -> U32:
  match c:
    case Changed{_, _, _, _, _, _, _, _, findings}: findings

def upstream_keep(+enemy: M.Enemy, +tail: List<&2, M.Enemy>, +cancel: Bool) -> List<&2, M.Enemy>:
  match cancel:
    case True{}: tail
    case False{}: Con{enemy, tail}

def cancel_upstream(+xs: List<&2, M.Enemy>, +config: M.Config) -> List<&2, M.Enemy>:
  match xs:
    case Nil{}: Nil{}
    case Con{+head, tail}: upstream_keep(head, cancel_upstream(tail, config), unfinished(config, head))

def runtime_update(+r: M.Runtime, +stop: U32, +deadline: U32, +flushAge: U32,
    writer: M.Writer, +cancelDelta: U32, +limitDelta: U32, +batchDelta: U32,
    ackDelta: U32, +clearDelta: U32, +findDelta: U32, +attemptDelta: U32, +cutoff: Bool) -> M.Runtime:
  match r:
    case M.Run{_, _, _, _, cancelled, limited, batches, acknowledged, clear, findings, attempts, _}:
      M.Run{stop, deadline, flushAge, writer, (cancelled + cancelDelta : U32),
        (limited + limitDelta : U32), (batches + batchDelta : U32),
        (acknowledged + ackDelta : U32), (clear + clearDelta : U32),
        (findings + findDelta : U32), (attempts + attemptDelta : U32), cutoff}

def transfer_commit(+enemy: M.Enemy, +target: U32, +config: M.Config,
    +others: List<&2, M.Enemy>, +terminal: Bool, +capacity: Bool) -> Changes:
  match enemy terminal capacity:
    case M.Packet{_, _, _, _, _, False{}, _, _} True{} _:
      Changed{others, 1, 0, 3, 1, 0, 0, 1, 0}
    case M.Packet{_, _, _, _, _, True{}, _, _} True{} _:
      Changed{others, 0, 1, 0, 0, 1, 0, 0, 0}
    case M.Packet{id, _, _, _, _, finding, edit, bytes} False{} True{}:
      Changed{List.append(&2, M.Enemy, others, [M.Packet{id, target, 0, node_work(get_node(config, target)), False{}, finding, edit, bytes}]), 0, 0, 0, 0, 0, 0, 0, 0}
    case blocked False{} False{}:
      Changed{List.append(&2, M.Enemy, others, [blocked]), 0, 0, 0, 0, 0, 0, 0, 0}

# Reserved byte-bounded writer members own an end-to-end transport lane.
# They remain live, travel normally and consume service/pressure, but not pending storage.
def pending_road(xs: List<&2, M.Enemy>, +stage: U32, +members: List<&2, U32>) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(1, 0, U32.is_eq(enemy_stage(head), stage) && Bool.not(enemy_inside(head)) && Bool.not(member(members, enemy_id(head)))) + pending_road(tail, stage, members) : U32)

def road_pending(+state: M.State, stage: U32) -> U32:
  pending_road(state_enemies(state), stage, writer_members(runtime_writer(state_runtime(state))))

def transfer_reserved(+config: M.Config, +enemy: M.Enemy, +enemies: List<&2, M.Enemy>, +runtime: M.Runtime) -> Changes:
  +node = get_node(config, enemy_stage(enemy))
  +target = M.choose(node_nextFinding(node), node_next(node), enemy_finding(enemy))
  +others = remove_enemy(enemies, enemy_id(enemy))
  +members = writer_members(runtime_writer(runtime))
  transfer_commit(enemy, target, config, others, U32.is_eq(target, 255), member(members, enemy_id(enemy)) || (pending_road(others, target, members) < node_roadLimit(get_node(config, target)) : U32))

# Isolated fixture wrapper without output reservations.
def transfer(+config: M.Config, +enemy: M.Enemy, +enemies: List<&2, M.Enemy>) -> Changes:
  transfer_reserved(config, enemy, enemies, empty_runtime())

def resolve_one(+config: M.Config, +enemy: M.Enemy, +enemies: List<&2, M.Enemy>, +complete: Bool, +runtime: M.Runtime) -> Changes:
  match complete:
    case True{}: transfer_reserved(config, enemy, enemies, runtime)
    case False{}: Changed{enemies, 0, 0, 0, 0, 0, 0, 0, 0}

def resolve(+xs: List<&2, M.Enemy>, +config: M.Config, +enemies: List<&2, M.Enemy>, +runtime: M.Runtime, +offered: U32, +finished: U32, +dropped: U32, +gold: U32, +score: U32, +limited: U32, +clear: U32) -> Changes:
  match xs:
    case Nil{}: Changed{enemies, finished, dropped, gold, score, limited, 0, clear, 0}
    case Con{+head, tail}:
      +node = get_node(config, enemy_stage(head))
      +ready = enemy_inside(head) && U32.is_eq(enemy_effort(head), 0) && U32.is_eq(node_serviceMode(node), 0) && (U32.is_eq(node_releaseMode(node), 0) || edit_ready_at(config, enemies, runtime, offered, enemy_edit(head)))
      +step = resolve_one(config, head, enemies, ready, runtime)
      resolve(tail, config, changed_enemies(step), runtime, offered,
        (finished + changed_finished(step) : U32), (dropped + changed_dropped(step) : U32),
        (gold + changed_gold(step) : U32), (score + changed_score(step) : U32),
        (limited + changed_limited(step) : U32), (clear + changed_clear(step) : U32))

def offer_commit(+enemy: M.Enemy, +enemies: List<&2, M.Enemy>, +capacity: Bool) -> Changes:
  match capacity:
    case True{}: Changed{List.append(&2, M.Enemy, enemies, [enemy]), 0, 0, 0, 0, 0, 0, 0, 0}
    case False{}: Changed{enemies, 0, 1, 0, 0, 0, 0, 0, 0}

def offer(+config: M.Config, +ordinal: U32, +enemies: List<&2, M.Enemy>, +ready: Bool) -> Changes:
  match ready:
    case False{}: Changed{enemies, 0, 0, 0, 0, 0, 0, 0, 0}
    case True{}:
      +first = entry(config_nodes(config))
      +node = get_node(config, first)
      +id = (ordinal + 1 : U32)
      +group = U32.max(1, rules_groupSize(config_rules(config)))
      offer_commit(M.Packet{id, first, 0, node_work(node), False{}, Bool.not(U32.is_eq((id % 3 : U32), 0)), ((ordinal / group) + 1 : U32), authored_bytes(config, id)}, enemies, (road_in(enemies, first) < node_roadLimit(node) : U32))

# FIFO prefix; a too-large item becomes a truthful limited outcome, not clear.
def choose_jobs(+a: List<&2, M.Enemy>, +b: List<&2, M.Enemy>, +yes: Bool) -> List<&2, M.Enemy>:
  match yes:
    case True{}: a
    case False{}: b

def insert_enemy(+xs: List<&2, M.Enemy>, +enemy: M.Enemy) -> List<&2, M.Enemy>:
  match xs:
    case Nil{}: [enemy]
    case Con{+head, tail}: choose_jobs(Con{enemy, xs}, Con{head, insert_enemy(tail, enemy)}, (enemy_id(enemy) < enemy_id(head) : U32))

def sort_enemies(+xs: List<&2, M.Enemy>) -> List<&2, M.Enemy>:
  match xs:
    case Nil{}: Nil{}
    case Con{head, tail}: insert_enemy(sort_enemies(tail), head)

def candidate_put(+enemy: M.Enemy, +tail: List<&2, M.Enemy>, +yes: Bool) -> List<&2, M.Enemy>:
  match yes:
    case True{}: Con{enemy, tail}
    case False{}: tail

def candidates(+xs: List<&2, M.Enemy>, +config: M.Config, +jobs: List<&2, M.Enemy>, +runtime: M.Runtime, +offered: U32, +stop: Bool) -> List<&2, M.Enemy>:
  match xs:
    case Nil{}: Nil{}
    case Con{+head, tail}:
      +node = get_node(config, enemy_stage(head))
      valid = enemy_finding(head) && (U32.is_eq(node_stopClass(node), 1) || completed_finding(config, head)) &&
        edit_ready_at(config, jobs, runtime, offered, enemy_edit(head)) &&
        (stop || (U32.is_eq(node_serviceMode(node), 1) && enemy_inside(head)))
      candidate_put(head, candidates(tail, config, jobs, runtime, offered, stop), valid)

type Prefix is Data:
  Selected{members: List<&2, U32>, +oversized: List<&2, U32>, +bytes: U32, +halt: Bool}

def prefix_members(+p: Prefix) -> List<&2, U32>:
  match p:
    case Selected{members, _, _, _}: members

def prefix_oversized(+p: Prefix) -> List<&2, U32>:
  match p:
    case Selected{_, oversized, _, _}: oversized

def prefix_bytes(+p: Prefix) -> U32:
  match p:
    case Selected{_, _, bytes, _}: bytes

def prefix_halt(+p: Prefix) -> Bool:
  match p:
    case Selected{_, _, _, halt}: halt

def prefix_choice(+id: U32, +members: List<&2, U32>, +oversized: List<&2, U32>, +total: U32, +item: U32, +huge: Bool, +fits: Bool) -> Prefix:
  match huge fits:
    case True{} _: Selected{members, List.append(&2, U32, oversized, [id]), total, False{}}
    case False{} True{}: Selected{List.append(&2, U32, members, [id]), oversized, (total + item : U32), False{}}
    case False{} False{}: Selected{members, oversized, total, True{}}

def byte_prefix(+xs: List<&2, M.Enemy>, +rules: M.Rules, +members: List<&2, U32>, +oversized: List<&2, U32>, +total: U32, +halt: Bool) -> Prefix:
  match xs halt:
    case _ True{}: Selected{members, oversized, total, True{}}
    case Nil{} False{}: Selected{members, oversized, total, False{}}
    case Con{+head, tail} False{}:
      +item = (enemy_bytes(head) + rules_itemOverhead(rules) : U32)
      +step = prefix_choice(enemy_id(head), members, oversized, total, item,
        (rules_batchOverhead(rules) + item > rules_batchBytes(rules) : U32),
        (total + item <= rules_batchBytes(rules) : U32))
      byte_prefix(tail, rules, prefix_members(step), prefix_oversized(step), prefix_bytes(step), prefix_halt(step))

def writer_ready(+xs: List<&2, M.Enemy>, +config: M.Config, +members: List<&2, U32>) -> Bool:
  match xs:
    case Nil{}: True{}
    case Con{+head, tail}: (Bool.not(member(members, enemy_id(head))) || (enemy_inside(head) && U32.is_eq(node_serviceMode(get_node(config, enemy_stage(head))), 1) && U32.is_eq(enemy_effort(head), 0))) && writer_ready(tail, config, members)

# Stop samples its fixed cutoff before this tick's service.
type Boundary is Data:
  Cut{enemies: List<&2, M.Enemy>, runtime: M.Runtime, cancelled: U32}

def cut_enemies(c: Boundary) -> List<&2, M.Enemy>:
  match c:
    case Cut{enemies, _, _}: enemies

def cut_runtime(c: Boundary) -> M.Runtime:
  match c:
    case Cut{_, runtime, _}: runtime

def cut_cancelled(c: Boundary) -> U32:
  match c:
    case Cut{_, _, cancelled}: cancelled

def boundary_decide(+config: M.Config, +enemies: List<&2, M.Enemy>, +runtime: M.Runtime, decideNow: Bool) -> Boundary:
  match decideNow:
    case False{}: Cut{enemies, runtime, 0}
    case True{}:
      +count = upstream_count(enemies, config)
      Cut{cancel_upstream(enemies, config), runtime_update(runtime, 2, runtime_deadline(runtime), runtime_flushAge(runtime), runtime_writer(runtime), count, 0, 0, 0, 0, 0, 0, True{}), count}

def boundary(+config: M.Config, +enemies: List<&2, M.Enemy>, +runtime: M.Runtime, +clock: U32) -> Boundary:
  boundary_decide(config, enemies, runtime,
    U32.is_eq(runtime_stop(runtime), 1) &&
    ((clock >= runtime_deadline(runtime) : U32) ||
      (U32.is_eq(upstream_count(enemies, config), 0) && Bool.not(writer_active(runtime_writer(runtime))))))

def begin_stop(+runtime: M.Runtime, +clock: U32, +waveClock: U32, +config: M.Config, begin: Bool) -> M.Runtime:
  match begin:
    case False{}: runtime
    case True{}:
      runtime_update(runtime, 1,
        U32.min((clock + rules_stopTicks(config_rules(config)) : U32), (clock + M.sub(config_waveTicks(config), waveClock) : U32)),
        runtime_flushAge(runtime), runtime_writer(runtime), 0, 0, 0, 0, 0, 0, 0, False{})

def original_effort(xs: List<&2, M.Enemy>, +id: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}: M.choose(enemy_effort(head), original_effort(tail, id), U32.is_eq(enemy_id(head), id))

def observed_findings(xs: List<&2, M.Enemy>, +snapshot: List<&2, M.Enemy>, +config: M.Config) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head, tail}:
      +node = get_node(config, enemy_stage(head))
      found = enemy_finding(head) && enemy_inside(head) && U32.is_eq(enemy_effort(head), 0) &&
        (original_effort(snapshot, enemy_id(head)) > 0 : U32) && U32.is_eq(node_stopClass(node), 2) &&
        U32.is_eq(node_stopClass(get_node(config, node_nextFinding(node))), 1)
      (M.choose(1, 0, found) + observed_findings(tail, snapshot, config) : U32)

type OutputStep is Data:
  OutputChanged{enemies: List<&2, M.Enemy>, runtime: M.Runtime,
    finished: U32, dropped: U32, gold: U32, score: U32}

def output_enemies(o: OutputStep) -> List<&2, M.Enemy>:
  match o:
    case OutputChanged{enemies, _, _, _, _, _}: enemies

def output_runtime(o: OutputStep) -> M.Runtime:
  match o:
    case OutputChanged{_, runtime, _, _, _, _}: runtime

def output_finished(o: OutputStep) -> U32:
  match o:
    case OutputChanged{_, _, finished, _, _, _}: finished

def output_dropped(o: OutputStep) -> U32:
  match o:
    case OutputChanged{_, _, _, dropped, _, _}: dropped

def output_gold(o: OutputStep) -> U32:
  match o:
    case OutputChanged{_, _, _, _, gold, _}: gold

def output_score(o: OutputStep) -> U32:
  match o:
    case OutputChanged{_, _, _, _, _, score}: score

def id_count(xs: List<&2, U32>) -> U32:
  match xs:
    case Nil{}: 0
    case Con{_, tail}: (1 + id_count(tail) : U32)

def writer_finish(+enemies: List<&2, M.Enemy>, +runtime: M.Runtime, +clock: U32, ready: Bool, expired: Bool) -> OutputStep:
  match ready expired:
    case True{} _:
      +ids = writer_members(runtime_writer(runtime))
      +count = count_members(enemies, ids)
      OutputChanged{remove_members(enemies, ids), runtime_update(runtime, runtime_stop(runtime), runtime_deadline(runtime), 0, M.Output{Nil{}, 0, 0, 0}, 0, 0, 0, count, 0, 0, 0, runtime_cutoff(runtime)), count, 0, (count * 8 : U32), (count * 5 : U32)}
    case False{} True{}:
      +ids = writer_members(runtime_writer(runtime))
      +count = count_members(enemies, ids)
      OutputChanged{remove_members(enemies, ids), runtime_update(runtime, runtime_stop(runtime), runtime_deadline(runtime), 0, M.Output{Nil{}, 0, 0, 0}, 0, count, 0, 0, 0, 0, 0, runtime_cutoff(runtime)), 0, count, 0, 0}
    case False{} False{}:
      +writer = runtime_writer(runtime)
      OutputChanged{enemies, runtime_update(runtime, runtime_stop(runtime), runtime_deadline(runtime), runtime_flushAge(runtime), M.Output{writer_members(writer), writer_bytes(writer), M.sub(writer_left(writer), 1), writer_deadline(writer)}, 0, 0, 0, 0, 0, 0, 0, runtime_cutoff(runtime)), 0, 0, 0, 0}

def writer_step(+config: M.Config, +enemies: List<&2, M.Enemy>, +runtime: M.Runtime, +clock: U32, active: Bool) -> OutputStep:
  match active:
    case False{}: OutputChanged{enemies, runtime, 0, 0, 0, 0}
    case True{}:
      +writer = runtime_writer(runtime)
      writer_finish(enemies, runtime, clock,
        U32.is_eq(M.sub(writer_left(writer), 1), 0) && writer_ready(enemies, config, writer_members(writer)) &&
          U32.is_eq(count_members(enemies, writer_members(writer)), id_count(writer_members(writer))),
        (clock >= writer_deadline(writer) : U32))

def count_candidates(xs: List<&2, M.Enemy>) -> U32:
  enemy_count(xs)

def cycle_runtime(+runtime: M.Runtime, +pending: U32) -> M.Runtime:
  +again = (pending > 0 : U32) && (runtime_attempts(runtime) < 4 : U32)
  runtime_update(runtime, M.choose(2, 4, again), runtime_deadline(runtime), runtime_flushAge(runtime), runtime_writer(runtime), 0, 0, 0, 0, 0, 0, 0, runtime_cutoff(runtime))

def after_response(+runtime: M.Runtime, pending: U32, ended: Bool) -> M.Runtime:
  match ended:
    case True{}: cycle_runtime(runtime, pending)
    case False{}: runtime

def dispatch_commit(+config: M.Config, +enemies: List<&2, M.Enemy>, +runtime: M.Runtime,
    +clock: U32, +prefix: Prefix, +stop: Bool) -> OutputStep:
  +ids = prefix_members(prefix)
  +huge = prefix_oversized(prefix)
  +limited = count_members(enemies, huge)
  +selected = (id_count(ids) > 0 : U32)
  +nextStop = M.choose(M.choose(3, 4, selected), runtime_stop(runtime), stop)
  +writer : M.Writer = M.Output{ids, M.choose(prefix_bytes(prefix), 0, selected), M.choose(rules_writerTicks(config_rules(config)), 0, selected), M.choose((clock + rules_drainTicks(config_rules(config)) : U32), 0, selected)}
  OutputChanged{remove_members(enemies, huge), runtime_update(runtime, nextStop, runtime_deadline(runtime), 0, writer, 0, limited, M.choose(1, 0, selected), 0, 0, 0, M.choose(1, 0, stop && selected), runtime_cutoff(runtime)), 0, limited, 0, 0}

def maybe_dispatch(+config: M.Config, +enemies: List<&2, M.Enemy>, +runtime: M.Runtime,
    +clock: U32, +pending: List<&2, M.Enemy>, +stop: Bool, dispatch: Bool) -> OutputStep:
  match dispatch:
    case True{}:
      +rules = config_rules(config)
      dispatch_commit(config, enemies, runtime, clock, byte_prefix(sort_enemies(pending), rules, Nil{}, Nil{}, rules_batchOverhead(rules), False{}), stop)
    case False{}:
      +age = M.choose((runtime_flushAge(runtime) + 1 : U32), 0, (enemy_count(pending) > 0 : U32))
      OutputChanged{enemies, runtime_update(runtime, runtime_stop(runtime), runtime_deadline(runtime), age, runtime_writer(runtime), 0, 0, 0, 0, 0, 0, 0, runtime_cutoff(runtime)), 0, 0, 0, 0}

def batch_dispatch(+config: M.Config, +enemies: List<&2, M.Enemy>, +runtime: M.Runtime,
    +offered: U32, +clock: U32) -> OutputStep:
  +allStop = candidates(enemies, config, enemies, runtime, offered, True{})
  +cycled = after_response(runtime, enemy_count(allStop), U32.is_eq(runtime_stop(runtime), 3) && Bool.not(writer_active(runtime_writer(runtime))))
  +stop = U32.is_eq(runtime_stop(cycled), 2)
  +pending = candidates(enemies, config, enemies, cycled, offered, stop)
  +ordinary = (runtime_stop(cycled) < 2 : U32)
  +dispatch = Bool.not(writer_active(runtime_writer(cycled))) &&
    ((stop && (runtime_attempts(cycled) < 4 : U32)) ||
      (ordinary && (enemy_count(pending) > 0 : U32) &&
        ((enemy_count(pending) >= rules_batchTarget(config_rules(config)) : U32) ||
          (runtime_flushAge(cycled) + 1 >= rules_flushTicks(config_rules(config)) : U32) || U32.is_eq(runtime_stop(cycled), 1))))
  maybe_dispatch(config, enemies, cycled, clock, pending, stop, dispatch)

type ShieldResult is Data:
  Shielded{towers: List<&2, M.Tower>, prevented: U32}

def shield_towers(s: ShieldResult) -> List<&2, M.Tower>:
  match s:
    case Shielded{towers,_}: towers

def shield_prevented(s: ShieldResult) -> U32:
  match s:
    case Shielded{_,prevented}: prevented

type Absorption is Data:
  Absorbed{stage: U32, amount: U32}

def site_absorbed(xs: List<&2, Absorption>, +stage: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{Absorbed{+id,amount},tail}: (M.choose(amount,0,U32.is_eq(id,stage)) + site_absorbed(tail,stage) : U32)

def shield_one(+tower: M.Tower, +config: M.Config, +jobs: List<&2, M.Enemy>, +budget: U32, +localBudget: U32) -> M.Tower:
  match tower:
    case M.Processor{x,y,+kind,+level,cd,+flash,ax,ay,+support}:
      +site = support_target(config,tower)
      +node = get_node(config,site)
      +amount = M.choose(U32.min(budget,U32.min(support_charges(support),U32.min(localBudget,(2 * level : U32)))),0,U32.is_eq(kind,6) && Bool.not(U32.is_eq(site,255)))
      M.Processor{x,y,kind,level,cd,M.choose(5,flash,(amount > 0 : U32)),M.choose(node_x(node),ax,(amount > 0 : U32)),M.choose(node_y(node),ay,(amount > 0 : U32)),M.Pulse{M.sub(support_charges(support),amount),(support_prevented(support) + amount : U32)}}

def shield_walk(xs: List<&2, M.Tower>, +config: M.Config, +jobs: List<&2, M.Enemy>, +budget: U32, +absorbed: List<&2, Absorption>) -> ShieldResult:
  match xs:
    case Nil{}: Shielded{Nil{},0}
    case Con{+head,tail}:
      +site = support_target(config,head)
      +localBudget = M.sub((inside_in(jobs,site) / 2 : U32),site_absorbed(absorbed,site))
      +next = shield_one(head,config,jobs,budget,localBudget)
      +spent = M.sub(tower_charges(head),tower_charges(next))
      +rest = shield_walk(tail,config,jobs,M.sub(budget,spent),Con{Absorbed{site,spent},absorbed})
      Shielded{Con{next,shield_towers(rest)},(spent + shield_prevented(rest) : U32)}

# Global half-pressure ceiling prevents overlapping shields from deleting danger.
def shield_step(+config: M.Config, +towers: List<&2, M.Tower>, +jobs: List<&2, M.Enemy>) -> ShieldResult:
  shield_walk(towers,config,jobs,(danger_count(jobs) / 2 : U32),Nil{})

def recharge_one(tower: M.Tower) -> M.Tower:
  match tower:
    case M.Processor{x,y,+kind,level,cd,flash,ax,ay,+support}:
      M.Processor{x,y,kind,level,cd,flash,ax,ay,M.Pulse{M.choose(240,support_charges(support),U32.is_eq(kind,6)),support_prevented(support)}}

def recharge_towers(xs: List<&2, M.Tower>) -> List<&2, M.Tower>:
  match xs:
    case Nil{}: Nil{}
    case Con{head,tail}: Con{recharge_one(head),recharge_towers(tail)}

def initial(+config: M.Config) -> M.State:
  M.World{0, 0, 0, 0, config_lives(config), config_gold(config), 0, 0, 0, config_pace(config), False{}, 0, 0, 256, 224, 0, 0, 0, 0, Nil{}, Nil{}, empty_runtime()}

def running(+state: M.State) -> Bool:
  U32.is_eq(state_phase(state), 1) && Bool.not(state_paused(state))

def phase_after(+wave: U32, +waves: U32, lives: U32, +runtime: M.Runtime, +enemies: List<&2, M.Enemy>) -> U32:
  match lives:
    case 0: 3
    case _: M.choose(M.choose(M.choose(2, 0, (wave >= waves : U32)), 3, U32.is_eq(enemy_count(enemies), 0)), 1, U32.is_eq(runtime_stop(runtime), 4))

def advance_live(+config: M.Config, state: M.State) -> M.State:
  match state:
    case M.World{+clock, +waveClock, +wave, _, +lives, +gold, +score, +left, +arrivalIn, +pace, +paused, +choice, +selected, +mx, +my, +offered, +finished, +dropped, +pressure, towers, +enemies, +runtime}:
      # Fixed wave bound can initiate a cutoff even when authored offers remain.
      +forced = (waveClock >= config_waveTicks(config) : U32) && U32.is_eq(runtime_stop(runtime), 0)
      +opened = begin_stop(runtime, clock, waveClock, config, forced)
      +cut = boundary(config, enemies, opened, clock)
      +rt = cut_runtime(cut)
      +missed = M.choose(left, 0, runtime_cutoff(rt) && (left > 0 : U32))
      +frontier = (offered + missed : U32)
      +moved = motion(cut_enemies(cut), config, cut_enemies(cut), Nil{}, 0, rt, frontier)
      +danger = danger_count(moved_enemies(moved))
      +shots = autotowers_step(towers, config, moved_enemies(moved), rt, frontier)
      +found = observed_findings(processed_enemies(shots), cut_enemies(cut), config)
      +done = resolve(processed_enemies(shots), config, processed_enemies(shots), rt, frontier, 0, moved_dropped(moved), 0, 0, 0, 0)
      +recorded = runtime_update(rt, runtime_stop(rt), runtime_deadline(rt), runtime_flushAge(rt), runtime_writer(rt), 0, changed_limited(done), 0, 0, changed_clear(done), found, 0, runtime_cutoff(rt))
      +written = writer_step(config, changed_enemies(done), recorded, (clock + 1 : U32), writer_active(runtime_writer(recorded)))
      +ready = (left > 0 : U32) && U32.is_eq(arrivalIn, 0) && Bool.not(runtime_cutoff(output_runtime(written)))
      +added = offer(config, frontier, output_enemies(written), ready)
      +attempted = M.choose(1, 0, ready)
      +remaining = M.sub(M.sub(left, missed), attempted)
      +nowOffered = (frontier + attempted : U32)
      +rt2 = output_runtime(written)
      +stopped = begin_stop(rt2, (clock + 1 : U32), (waveClock + 1 : U32), config, U32.is_eq(remaining, 0) && U32.is_eq(runtime_stop(rt2), 0))
      +batch = batch_dispatch(config, changed_enemies(added), stopped, nowOffered, (clock + 1 : U32))
      +lost = (cut_cancelled(cut) + changed_dropped(done) + output_dropped(written) + changed_dropped(added) + output_dropped(batch) : U32)
      +period = U32.max(1, config_pressureEvery(config))
      +shielded = shield_step(config,processed_towers(shots),moved_enemies(moved))
      +totalPressure = (pressure + M.sub(danger,shield_prevented(shielded)) : U32)
      +health = M.sub(lives, (lost + totalPressure / period : U32))
      +newRuntime = output_runtime(batch)
      +newEnemies = output_enemies(batch)
      +nextPhase = phase_after(wave, config_waves(config), health, newRuntime, newEnemies)
      +bonus = M.choose(20, 0, (U32.is_eq(nextPhase, 0) || U32.is_eq(nextPhase, 2)) && U32.is_eq(enemy_count(newEnemies), 0))
      M.World{(clock + 1 : U32), (waveClock + 1 : U32), wave, nextPhase, health,
        (gold + changed_gold(done) + output_gold(written) + bonus : U32),
        (score + changed_score(done) + output_score(written) : U32), remaining,
        M.choose(M.sub(pace, 1), M.sub(arrivalIn, 1), ready), pace, paused, choice, selected, mx, my,
        nowOffered, (finished + changed_finished(done) + output_finished(written) : U32),
        (dropped + lost + missed : U32), (totalPressure % period : U32), shield_towers(shielded), newEnemies, newRuntime}

def advance(config: M.Config, +state: M.State) -> M.State:
  decide(advance_live(supported_config(config, state_towers(state)), state), state, running(state))

def reset_runtime(runtime: M.Runtime) -> M.Runtime:
  match runtime:
    case M.Run{_, _, _, _, cancelled, limited, batches, acknowledged, clear, findings, _, _}:
      M.Run{0, 0, 0, M.Output{Nil{}, 0, 0, 0}, cancelled, limited, batches, acknowledged, clear, findings, 0, False{}}

def start(+config: M.Config, state: M.State) -> M.State:
  match state:
    case M.World{clock, _, +wave, 0, lives, gold, score, _, _, pace, False{}, choice, selected, mx, my, offered, finished, dropped, pressure, towers, enemies, runtime}:
      M.World{clock, 0, (wave + 1 : U32), 1, lives, gold, score, (config_baseDemand(config) + wave * config_demandRamp(config) : U32), 0, pace, False{}, choice, selected, mx, my, offered, finished, dropped, pressure, recharge_towers(towers), enemies, reset_runtime(runtime)}
    case other: other
def key(+config: M.Config, +state: M.State, code: U32) -> M.State:
  match code:
    case 49: choose(state, 0)
    case 50: choose(state, 1)
    case 51: choose(state, 2)
    case 52: choose(state, 3)
    case 53: choose(state, 4)
    case 54: choose(state, 5)
    case 55: choose(state, 6)
    case 85: upgrade(state)
    case 117: upgrade(state)
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
    case M.World{clock, waveClock, wave, phase, lives, gold, score, left, arrivalIn, pace, paused, choice, selected, mx, my, offered, finished, dropped, pressure, towers, enemies, +runtime}:
      "WAVE=" ++ U32.show(wave) ++ " PHASE=" ++ U32.show(phase) ++ " LIFE=" ++ U32.show(lives) ++ " GOLD=" ++ U32.show(gold) ++ " SCORE=" ++ U32.show(score) ++ " DONE=" ++ U32.show(finished) ++ " LOST=" ++ U32.show(dropped) ++ " ENEMIES=" ++ U32.show(enemy_count(enemies)) ++ " TICK=" ++ U32.show(clock) ++ " STOP=" ++ U32.show(runtime_stop(runtime)) ++ " ACK=" ++ U32.show(runtime_acknowledged(runtime)) ++ " FINDINGS=" ++ U32.show(runtime_findings(runtime)) ++ " CANCELLED=" ++ U32.show(runtime_cancelled(runtime)) ++ " LIMITED=" ++ U32.show(runtime_limited(runtime)) ++ " ATTEMPTS=" ++ U32.show(runtime_attempts(runtime)) ++ " BYTES=" ++ U32.show(writer_bytes(runtime_writer(runtime)))
