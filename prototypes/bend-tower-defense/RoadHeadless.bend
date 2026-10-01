# Bounded native evidence for the recommended increment. No formal-proof or engagement claim.
import Base
import ./RoadModel.bend as M
import ./RoadGame.bend as G
import ./RoadScenario.bend as S

def require(ok: Bool, message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit, 1, "FAIL " ++ message)

def word(b: Bool) -> String:
  match b:
    case True{}: "1"
    case False{}: "0"

def ids(xs: List<&2,U32>) -> String:
  match xs:
    case Nil{}: ""
    case Con{x, tail}: U32.show(x) ++ ";" ++ ids(tail)

def writer_snapshot(w: M.Writer) -> String:
  match w:
    case M.Output{members, bytes, left, deadline}:
      ids(members) ++ "/" ++ U32.show(bytes) ++ "/" ++ U32.show(left) ++ "/" ++ U32.show(deadline)

def runtime_snapshot(r: M.Runtime) -> String:
  match r:
    case M.Run{stop, deadline, age, writer, cancelled, limited, batches, acked, clear, findings, attempts, cutoff}:
      U32.show(stop) ++ "/" ++ U32.show(deadline) ++ "/" ++ U32.show(age) ++ "/" ++ writer_snapshot(writer) ++ "/" ++ U32.show(cancelled) ++ "/" ++ U32.show(limited) ++ "/" ++ U32.show(batches) ++ "/" ++ U32.show(acked) ++ "/" ++ U32.show(clear) ++ "/" ++ U32.show(findings) ++ "/" ++ U32.show(attempts) ++ "/" ++ word(cutoff)

def enemy_snapshot(es: List<&2,M.Enemy>) -> String:
  match es:
    case Nil{}: ""
    case Con{M.Packet{id, stage, p, effort, inside, finding, edit, bytes}, tail}:
      U32.show(id) ++ "/" ++ U32.show(stage) ++ "/" ++ U32.show(p) ++ "/" ++ U32.show(effort) ++ "/" ++ word(inside) ++ "/" ++ word(finding) ++ "/" ++ U32.show(edit) ++ "/" ++ U32.show(bytes) ++ ";" ++ enemy_snapshot(tail)

def support_snapshot(s: M.Support) -> String:
  match s:
    case M.Pulse{charges,prevented}: U32.show(charges) ++ "/" ++ U32.show(prevented)

def tower_snapshot(ts: List<&2,M.Tower>) -> String:
  match ts:
    case Nil{}: ""
    case Con{M.Processor{x, y, kind, level, cd, flash, ax, ay, +support}, tail}:
      U32.show(x) ++ "/" ++ U32.show(y) ++ "/" ++ U32.show(kind) ++ "/" ++ U32.show(level) ++ "/" ++ U32.show(cd) ++ "/" ++ U32.show(flash) ++ "/" ++ U32.show(ax) ++ "/" ++ U32.show(ay) ++ "/" ++ support_snapshot(support) ++ ";" ++ tower_snapshot(tail)

def snapshot(state: M.State) -> String:
  match state:
    case M.World{clock, wc, wave, phase, life, gold, score, left, arrival, pace, paused, choice, selected, mx, my, offered, finished, dropped, pressure, ts, es, runtime}:
      U32.show(clock) ++ "/" ++ U32.show(wc) ++ "/" ++ U32.show(wave) ++ "/" ++ U32.show(phase) ++ "/" ++ U32.show(life) ++ "/" ++ U32.show(gold) ++ "/" ++ U32.show(score) ++ "/" ++ U32.show(left) ++ "/" ++ U32.show(arrival) ++ "/" ++ U32.show(pace) ++ "/" ++ word(paused) ++ "/" ++ U32.show(choice) ++ "/" ++ U32.show(selected) ++ "/" ++ U32.show(mx) ++ "/" ++ U32.show(my) ++ "/" ++ U32.show(offered) ++ "/" ++ U32.show(finished) ++ "/" ++ U32.show(dropped) ++ "/" ++ U32.show(pressure) ++ "|" ++ tower_snapshot(ts) ++ "|" ++ enemy_snapshot(es) ++ "|" ++ runtime_snapshot(runtime)

def runtime0() -> M.Runtime:
  M.Run{0, 0, 0, M.Output{Nil{}, 0, 0, 0}, 0, 0, 0, 0, 0, 0, 0, False{}}

def fixture(es: List<&2,M.Enemy>, offered: U32, left: U32, +runtime: M.Runtime) -> M.State:
  M.World{0, 0, 1, 1, 220, 120, 0, left, 1000, 18, False{}, 0, 0, 256, 224, offered, (G.runtime_clear(runtime) + G.runtime_acknowledged(runtime) : U32), (G.runtime_cancelled(runtime) + G.runtime_limited(runtime) : U32), 0, Nil{}, es, runtime}

def rules() -> M.Rules:
  M.Contract{3, 52, 12, 8, 2, 3, 2, 60, 60, 12, 28, 0}

def test_config(contract: M.Rules) -> M.Config:
  M.Board{"DIRECTED FIXTURE", [
    M.Site{0, "SOURCE", 32, 152, 144, 152, 112, 4, 6, 12, 4, 1, 1, False{}, 1, 0, 0, 0},
    M.Site{1, "REVIEW", 144, 152, 400, 152, 256, 4, 6, 12, 4, 255, 2, True{}, 1, 0, 0, 2},
    M.Site{2, "ADVICE", 400, 152, 400, 344, 192, 4, 6, 12, 3, 3, 3, False{}, 1, 0, 1, 1},
    M.Site{3, "OUTPUT", 400, 344, 144, 344, 256, 4, 8, 12, 2, 255, 255, False{}, 1, 1, 0, 1}],
    220, 120, 18, 6, 2000, 120, 24, 6, contract}

def contains(xs: List<&2,U32>, +id: U32) -> Bool:
  match xs:
    case Nil{}: False{}
    case Con{head, tail}: U32.is_eq(head, id) || contains(tail, id)

def unique(xs: List<&2,U32>) -> Bool:
  match xs:
    case Nil{}: True{}
    case Con{+head, +tail}: Bool.not(contains(tail, head)) && unique(tail)

def enemy_ids(es: List<&2,M.Enemy>) -> List<&2,U32>:
  match es:
    case Nil{}: Nil{}
    case Con{M.Packet{id, _, _, _, _, _, _, _}, tail}: Con{id, enemy_ids(tail)}

def conserved(state: M.State) -> Bool:
  match state:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, offered, +finished, +dropped, _, _, +es, M.Run{_, _, _, _, cancelled, limited, _, acknowledged, clear, _, _, _}}:
      U32.is_eq(offered, (G.enemy_count(es) + finished + dropped : U32)) && U32.is_eq(finished, (clear + acknowledged : U32)) && (dropped >= cancelled + limited : U32) && unique(enemy_ids(es))

def packet(id: U32, +stage: U32, effort: U32, edit: U32, bytes: U32) -> M.Enemy:
  M.Packet{id, stage, M.choose(112, M.choose(192, 256, U32.is_eq(stage, 2)), U32.is_eq(stage, 0)), effort, True{}, True{}, edit, bytes}

def enemy_pick(a: M.Enemy, b: M.Enemy, yes: Bool) -> M.Enemy:
  match yes:
    case True{}: a
    case False{}: b

def find_enemy(xs: List<&2,M.Enemy>, +id: U32) -> M.Enemy:
  match xs:
    case Nil{}: M.Packet{0, 255, 0, 0, False{}, False{}, 0, 0}
    case Con{+head, tail}: enemy_pick(head, find_enemy(tail, id), U32.is_eq(G.enemy_id(head), id))

def permit_tests() -> IO(Unit):
  do IO<Unit>:
    +config : M.Config = test_config(rules())
    +jobs : List<&2,M.Enemy> = [packet(1, 0, 1, 1, 12), packet(2, 0, 4, 1, 12)]
    +state : M.State = fixture(jobs, 2, 1, runtime0())
    require(U32.is_eq(G.inside_in(jobs, 0), 2) && G.active_enemy(config, state, find_enemy(jobs, 1)) && Bool.not(G.active_enemy(config, state, find_enemy(jobs, 2))), "two stored packets share one worker; only first has a service permit")
    +natural : G.RoadResult = G.motion(jobs, config, jobs, Nil{}, 0, runtime0(), 2)
    require(U32.is_eq(G.enemy_effort(find_enemy(G.moved_enemies(natural), 1)), 0) && U32.is_eq(G.enemy_effort(find_enemy(G.moved_enemies(natural), 2)), 4), "natural service never decrements queued work without a permit")
    +after : M.State = fixture(G.moved_enemies(natural), 2, 1, runtime0())
    require(G.active_enemy(config, after, find_enemy(G.state_enemies(after), 2)) && U32.is_eq(G.inside_in(G.state_enemies(after), 0), 2), "completed work releases permit immediately while both storage resources remain occupied")
    +batch : G.Combat = G.autotowers_step([M.Processor{112, 208, 1, 1, 0, 0, 112, 208, M.Pulse{0,0}}], config, jobs, runtime0(), 2)
    require(U32.is_eq(G.enemy_effort(find_enemy(G.processed_enemies(batch), 1)), 0) && U32.is_eq(G.enemy_effort(find_enemy(G.processed_enemies(batch), 2)), 4), "batch tower accelerates active permit only and cannot hit queued siblings")

def group_tests() -> IO(Unit):
  do IO<Unit>:
    +config : M.Config = test_config(rules())
    +notOffered : M.State = fixture([packet(1, 2, 3, 1, 12)], 1, 2, runtime0())
    require(Bool.not(G.edit_ready(config, notOffered, 1)) && Bool.not(G.active_enemy(config, notOffered, find_enemy(G.state_enemies(notOffered), 1))), "fixed three-member group waits for siblings not yet offered")
    +pending : M.State = fixture([packet(1, 2, 3, 1, 12), packet(2, 0, 100, 1, 12)], 3, 0, M.Run{0, 0, 0, M.Output{Nil{}, 0, 0, 0}, 0, 0, 0, 0, 1, 1, 0, False{}})
    require(Bool.not(G.edit_ready(config, pending, 1)), "offering all members does not bypass a live source/review sibling")
    +separate : M.State = fixture([packet(1, 2, 3, 1, 12), packet(2, 0, 100, 1, 12), packet(4, 2, 3, 2, 12)], 6, 0, M.Run{0, 0, 0, M.Output{Nil{}, 0, 0, 0}, 0, 0, 1, 1, 2, 3, 0, False{}})
    require(Bool.not(G.edit_ready(config, separate, 1)) && G.edit_ready(config, separate, 2) && G.active_enemy(config, separate, find_enemy(G.state_enemies(separate), 4)), "unrelated complete edit group obtains permit despite older blocked group")
    require(conserved(separate), "synthetic group fixture has truthful complete outcome accounting")

def byte_tests() -> IO(Unit):
  do IO<Unit>:
    +exact : G.Prefix = G.byte_prefix([packet(1, 3, 2, 1, 12), packet(2, 3, 2, 1, 12), packet(4, 3, 2, 2, 12)], rules(), Nil{}, Nil{}, 12, False{})
    require(String.eq(ids(G.prefix_members(exact)), "1;2;") && U32.is_eq(G.prefix_bytes(exact), 52) && G.prefix_halt(exact), "byte prefix fits exactly cap52 including12header and8per-item, retains third overflow")
    require(unique(G.prefix_members(exact)), "exclusive byte prefix contains no duplicate member IDs")
    +huge : G.Prefix = G.byte_prefix([packet(1, 3, 2, 1, 33), packet(2, 3, 2, 1, 12)], rules(), Nil{}, Nil{}, 12, False{})
    require(String.eq(ids(G.prefix_oversized(huge)), "1;") && String.eq(ids(G.prefix_members(huge)), "2;") && U32.is_eq(G.prefix_bytes(huge), 32), "single53byte record cannot fit52cap and is explicitly oversized, next record remains selectable")

def active_count(es: List<&2,M.Enemy>, +config: M.Config, +state: M.State, +id: U32) -> U32:
  match es:
    case Nil{}: 0
    case Con{+head, tail}: (M.choose(1, 0, U32.is_eq(G.enemy_stage(head), id) && G.active_enemy(config, state, head)) + active_count(tail, config, state, id) : U32)

def worker_bounds(nodes: List<&2,M.Node>, +config: M.Config, +state: M.State) -> Bool:
  match nodes:
    case Nil{}: True{}
    case Con{M.Site{+id, _, _, _, _, _, _, _, slots, roadLimit, _, _, _, _, workers, +mode, _, _}, tail}:
      (G.storage_in(config,state,id) <= slots : U32) && (G.road_pending(state,id) <= roadLimit : U32) && (U32.is_eq(mode, 1) || (active_count(G.state_enemies(state), config, state, id) <= G.effective_workers(config,state,id) : U32)) && worker_bounds(tail, config, state)

def writer_members_exist(members: List<&2,U32>, +es: List<&2,M.Enemy>) -> Bool:
  match members:
    case Nil{}: True{}
    case Con{+id, tail}: U32.is_eq(G.enemy_id(find_enemy(es, id)), id) && writer_members_exist(tail, es)

def support_bounds(xs: List<&2,M.Tower>, +wave: U32) -> Bool:
  match xs:
    case Nil{}: True{}
    case Con{+head,tail}:
      (G.tower_charges(head) <= 240 : U32) && (G.tower_prevented(head) <= wave * 240 : U32) && support_bounds(tail,wave)

def bounded(+config: M.Config, +state: M.State) -> Bool:
  +runtime = G.state_runtime(state)
  +writer = G.runtime_writer(runtime)
  (G.state_lives(state) <= G.config_lives(config) : U32) && (G.state_pressure(state) < U32.max(1, G.config_pressureEvery(config)) : U32) &&
    (G.writer_bytes(writer) <= G.rules_batchBytes(G.config_rules(config)) : U32) && unique(G.writer_members(writer)) && writer_members_exist(G.writer_members(writer), G.state_enemies(state)) &&
    worker_bounds(G.config_nodes(config), config, state) && support_bounds(G.state_towers(state),G.state_wave(state))

def ticks(n: Nat, +config: M.Config, state: M.State) -> M.State:
  match n:
    case 0n: state
    case 1n++n: ticks(n, config, G.advance(config, state))

def departure_test() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = test_config(rules())
    +s : M.State = fixture([packet(1,2,3,1,12),packet(2,0,100,1,12),packet(4,2,3,2,12)],6,1,M.Run{0,0,0,M.Output{Nil{},0,0,0},0,0,1,1,2,3,0,False{}})
    +end : M.State = ticks(3n,c,s)
    require(U32.is_eq(G.enemy_stage(find_enemy(G.state_enemies(end),4)),3) && U32.is_eq(G.enemy_stage(find_enemy(G.state_enemies(end),1)),2) && conserved(end), "unrelated complete group actually departs earlier while older group waits")

def output_tests() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = test_config(rules())
    +es : List<&2,M.Enemy> = [packet(1, 3, 0, 1, 12), packet(2, 3, 0, 1, 12), packet(4, 3, 0, 2, 12)]
    +r : M.Runtime = M.Run{0,0,0,M.Output{[1,2],52,1,60},0,0,1,0,3,3,0,False{}}
    +done : G.OutputStep = G.writer_step(c,es,r,1,True{})
    require(U32.is_eq(G.output_finished(done),2) && String.eq(ids(enemy_ids(G.output_enemies(done))),"4;") && U32.is_eq(G.runtime_acknowledged(G.output_runtime(done)),2), "writer acknowledges only its exclusive byte-selected members")
    +again : G.OutputStep = G.writer_step(c,G.output_enemies(done),G.output_runtime(done),2,False{})
    require(U32.is_eq(G.output_finished(again),0), "completed writer cannot acknowledge members twice")
    +partial : G.OutputStep = G.batch_dispatch(c,[packet(1,3,2,1,12)],M.Run{0,0,2,M.Output{Nil{},0,0,0},0,0,0,0,2,1,0,False{}},3,3)
    require(String.eq(ids(G.writer_members(G.runtime_writer(G.output_runtime(partial)))),"1;"), "partial batch flushes automatically at fixed age without manual activation")
    +blocked : G.OutputStep = G.writer_step(c,[packet(1,2,0,1,12),packet(2,3,0,1,12)],r,1,True{})
    require(U32.is_eq(G.output_finished(blocked),0), "selected member still outside writer prevents acknowledgement")
    +huge : G.OutputStep = G.batch_dispatch(c,[packet(1,3,0,1,33)],M.Run{2,60,0,M.Output{Nil{},0,0,0},0,0,0,0,2,1,0,True{}},3,1)
    require(U32.is_eq(G.output_dropped(huge),1) && U32.is_eq(G.runtime_limited(G.output_runtime(huge)),1) && U32.is_eq(G.runtime_clear(G.output_runtime(huge)),2), "oversized finding is limited and never reclassified clear")

def stop_tests() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = test_config(rules())
    +es : List<&2,M.Enemy> = [packet(1,2,3,1,12),packet(2,0,100,1,12)]
    +r : M.Runtime = M.Run{1,10,0,M.Output{Nil{},0,0,0},0,0,0,0,1,1,0,False{}}
    +wait : G.Boundary = G.boundary(c,es,r,9)
    require(U32.is_eq(G.cut_cancelled(wait),0) && U32.is_eq(G.runtime_stop(G.cut_runtime(wait)),1), "Stop waits for unfinished upstream before absolute deadline")
    +cut : G.Boundary = G.boundary(c,es,r,10)
    +s : M.State = fixture(G.cut_enemies(cut),3,0,G.cut_runtime(cut))
    require(U32.is_eq(G.cut_cancelled(cut),1) && U32.is_eq(G.runtime_cancelled(G.cut_runtime(cut)),1) && U32.is_eq(G.runtime_clear(G.cut_runtime(cut)),1) && G.edit_ready(c,s,1) && conserved(s), "cutoff cancels upstream truthfully and releases partial authored advice")
    require(U32.is_eq(G.runtime_deadline(G.cut_runtime(cut)),10), "cutoff retains original absolute deadline")
    +active : G.Boundary = G.boundary(c,[packet(1,3,2,1,12)],M.Run{1,10,0,M.Output{[1],32,2,20},0,0,1,0,2,1,0,False{}},9)
    require(U32.is_eq(G.runtime_stop(G.cut_runtime(active)),1), "Stop also waits for an active writer")
    +paused : M.State = G.key(c,s,32)
    require(String.eq(snapshot(paused),snapshot(ticks(10n,c,paused))), "pause freezes complete state including deadlines writer and outcomes")
    require(String.eq(snapshot(ticks(6n,c,s)),snapshot(ticks(4n,c,ticks(2n,c,s)))), "tick batching is deterministic")

def lane_test() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = test_config(rules())
    +es : List<&2,M.Enemy> = [M.Packet{1,3,252,2,False{},True{},1,12},packet(2,3,2,1,12),packet(4,3,2,2,12),packet(5,3,2,2,12),packet(7,3,2,3,12),packet(8,3,2,3,12),packet(10,3,2,4,12),packet(11,3,2,4,12),packet(13,3,2,5,12)]
    +r : M.Runtime = M.Run{3,60,0,M.Output{[1],32,2,60},0,0,1,0,4,9,1,True{}}
    +m : G.RoadResult = G.motion(es,c,es,Nil{},0,r,13)
    +s : M.State = fixture(G.moved_enemies(m),13,0,r)
    require(G.enemy_inside(find_enemy(G.state_enemies(s),1)) && U32.is_eq(G.storage_in(c,s,3),8) && bounded(c,s) && conserved(s), "REGRESSION byte-reserved writer lane admits selected member despite eight pending output slots")

def chain_test() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = test_config(M.Contract{3,52,12,8,2,3,2,60,240,12,28,0})
    +others : List<&2,M.Enemy> = [M.Packet{4,2,0,3,False{},True{},1,12},M.Packet{5,2,0,3,False{},True{},1,12},M.Packet{6,2,0,3,False{},True{},1,12},M.Packet{7,2,0,3,False{},True{},1,12},M.Packet{8,2,0,3,False{},True{},1,12},M.Packet{9,2,0,3,False{},True{},1,12},M.Packet{10,2,0,3,False{},True{},1,12},M.Packet{11,2,0,3,False{},True{},1,12},M.Packet{12,2,0,3,False{},True{},1,12},M.Packet{13,2,0,3,False{},True{},1,12},M.Packet{14,2,0,3,False{},True{},1,12},M.Packet{15,2,0,3,False{},True{},1,12},packet(16,2,3,1,12),packet(17,2,3,1,12),packet(18,2,3,1,12),packet(19,2,3,1,12),packet(20,2,3,1,12),packet(21,2,3,1,12),M.Packet{22,3,0,2,False{},True{},1,12},M.Packet{23,3,0,2,False{},True{},1,12},M.Packet{24,3,0,2,False{},True{},1,12},M.Packet{25,3,0,2,False{},True{},1,12},M.Packet{26,3,0,2,False{},True{},1,12},M.Packet{27,3,0,2,False{},True{},1,12},M.Packet{28,3,0,2,False{},True{},1,12},M.Packet{29,3,0,2,False{},True{},1,12},M.Packet{30,3,0,2,False{},True{},1,12},M.Packet{31,3,0,2,False{},True{},1,12},M.Packet{32,3,0,2,False{},True{},1,12},M.Packet{33,3,0,2,False{},True{},1,12},packet(34,3,2,1,12),packet(35,3,2,1,12),packet(36,3,2,1,12),packet(37,3,2,1,12),packet(38,3,2,1,12),packet(39,3,2,1,12),packet(40,3,2,1,12),packet(41,3,2,1,12)]
    +r : M.Runtime = M.Run{3,60,0,M.Output{[1],32,2,240},0,0,1,0,2,39,1,True{}}
    +es : List<&2,M.Enemy> = Con{packet(1,1,0,1,12),others}
    +handoff : G.Changes = G.transfer_reserved(c,find_enemy(es,1),es,r)
    require(U32.is_eq(G.enemy_stage(find_enemy(G.changed_enemies(handoff),1)),2), "REGRESSION selected completed review traverses full pending advice road")
    +approach : List<&2,M.Enemy> = Con{M.Packet{1,2,188,3,False{},True{},1,12},others}
    +m : G.RoadResult = G.motion(approach,c,approach,Nil{},0,r,41)
    +s : M.State = fixture(G.moved_enemies(m),41,0,r)
    require(G.enemy_inside(find_enemy(G.state_enemies(s),1)) && U32.is_eq(G.storage_in(c,s,2),6) && U32.is_eq(G.road_pending(s,2),12) && bounded(c,s) && conserved(s), "REGRESSION writer reservation spans full intermediate advice storage and roads without ghost ownership")

    +route : M.State = ticks(150n,c,fixture(es,41,0,r))
    require(U32.is_eq(G.enemy_id(find_enemy(G.state_enemies(route),1)),0) && (G.runtime_acknowledged(G.state_runtime(route)) >= 1 : U32) && U32.is_eq(G.runtime_limited(G.state_runtime(route)),0) && conserved(route) && bounded(c,route), "REGRESSION full reserved review-advice-output route acknowledges selected finding before240tick expiry")

def frontier_regressions() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = test_config(rules())
    +es : List<&2,M.Enemy> = [packet(1,1,0,1,12),packet(2,0,100,1,12)]
    +r : M.Runtime = M.Run{1,10,0,M.Output{Nil{},0,0,0},0,0,0,0,1,1,0,False{}}
    +cut : G.Boundary = G.boundary(c,es,r,10)
    require(U32.is_eq(G.cut_cancelled(cut),1) && U32.is_eq(G.enemy_id(find_enemy(G.cut_enemies(cut),1)),1), "REGRESSION completed review finding survives cutoff despite blocked physical handoff")
    +terminal : M.State = fixture([packet(1,2,3,1,12)],3,0,M.Run{4,10,0,M.Output{Nil{},0,0,0},0,0,4,0,2,1,4,True{}})
    +ended : M.State = G.advance(c,terminal)
    require(U32.is_eq(G.state_phase(ended),3) && String.eq(snapshot(ended),snapshot(G.key(c,ended,110))), "REGRESSION exhausted response budget becomes frozen incomplete and N cannot replenish")

def pace_config(config: M.Config, pace: U32) -> M.Config:
  match config:
    case M.Board{label,nodes,lives,gold,_,waves,waveTicks,pressureEvery,baseDemand,demandRamp,rules}:
      M.Board{label,nodes,lives,gold,pace,waves,waveTicks,pressureEvery,baseDemand,demandRamp,rules}

def build(+c: M.Config, state: M.State, kind: U32, x: U32, y: U32) -> M.State:
  G.click(c,G.key(c,state,(49 + kind : U32)),x,y,0)

def upgrade_at(+c: M.Config, state: M.State, x: U32, y: U32) -> M.State:
  G.key(c,G.click(c,state,x,y,0),117)

def investment(+c: M.Config, +s: M.State, policy: U32) -> M.State:
  match policy:
    case 5:
      +a = upgrade_at(c,s,368,240)
      +b = upgrade_at(c,a,144,240)
      +d = build(c,b,3,144,208)
      +e = build(c,d,4,432,208)
      +f = build(c,e,5,112,400)
      build(c,f,6,432,400)
    case _: s

def prepare(+c: M.Config, +s: M.State, policy: U32) -> M.State:
  match policy:
    case 1: build(c,build(c,s,3,144,208),6,432,400)
    case 2: build(c,build(c,build(c,s,0,144,240),4,368,240),6,432,400)
    case 3: build(c,build(c,s,5,112,400),5,176,400)
    case 4: build(c,build(c,build(c,s,0,144,240),0,368,240),6,432,400)
    case 5: build(c,build(c,s,0,144,240),1,368,240)
    case _: s

def audit(ok: Bool) -> IO(Unit):
  match ok:
    case True{}: IO.pure(Unit,Unit{})
    case False{}: IO.die(Unit,1,"FAIL tick conservation resources bytes")

def identity_stop_tests() -> IO(Unit):
  do IO<Unit>:
    +fast : M.Config = pace_config(test_config(rules()),12)
    +slow : M.Config = pace_config(test_config(rules()),28)
    +a : M.State = ticks(57n,fast,G.key(fast,G.initial(fast),110))
    +b : M.State = ticks(57n,slow,G.key(slow,G.initial(slow),110))
    require(U32.is_eq(G.enemy_id(find_enemy(G.state_enemies(a),1)),1) && U32.is_eq(G.enemy_id(find_enemy(G.state_enemies(b),1)),1) && G.enemy_finding(find_enemy(G.state_enemies(a),1)) && G.enemy_finding(find_enemy(G.state_enemies(b),1)) && U32.is_eq(G.enemy_id(find_enemy(G.state_enemies(a),2)),2) && U32.is_eq(G.enemy_id(find_enemy(G.state_enemies(b),2)),2) && Bool.not(G.enemy_finding(find_enemy(G.state_enemies(a),3))) && Bool.not(G.enemy_finding(find_enemy(G.state_enemies(b),3))) && U32.is_eq(G.enemy_id(find_enemy(G.state_enemies(a),3)),3) && U32.is_eq(G.enemy_id(find_enemy(G.state_enemies(b),3)),3), "same demand identities and findings across12/28 pacing with different offer counts")
    +one : M.State = M.World{0,0,1,1,220,120,0,1,0,18,False{},0,0,256,224,0,0,0,0,Nil{},Nil{},runtime0()}
    +last : M.State = G.advance(fast,one)
    require(U32.is_eq(G.state_left(last),0) && U32.is_eq(G.runtime_stop(G.state_runtime(last)),1), "final authored arrival automatically starts Stop without manual activation")
    +ended : M.State = ticks(150n,fast,last)
    require(U32.is_eq(G.state_offered(ended),1) && conserved(ended) && String.eq(snapshot(ended),snapshot(ticks(10n,fast,ended))), "cutoff and terminal freeze admit no late work or late acknowledgement")

def construction_test() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = S.select(0)
    require(U32.is_eq(G.state_gold(prepare(c,G.initial(c),1)),0) && U32.is_eq(G.state_gold(prepare(c,G.initial(c),2)),0) && U32.is_eq(G.state_gold(prepare(c,G.initial(c),3)),0) && U32.is_eq(G.state_gold(prepare(c,G.initial(c),4)),0), "all four declared packages spend exactly120 through real construction clicks")

def with_towers(state: M.State, towers: List<&2,M.Tower>) -> M.State:
  match state:
    case M.World{clock,wc,wave,phase,life,gold,score,left,arrival,pace,paused,choice,selected,mx,my,offered,finished,dropped,pressure,_,es,runtime}:
      M.World{clock,wc,wave,phase,life,gold,score,left,arrival,pace,paused,choice,selected,mx,my,offered,finished,dropped,pressure,towers,es,runtime}

def support_tower(kind: U32, +x: U32, +y: U32, level: U32, charge: U32) -> M.Tower:
  M.Processor{x,y,kind,level,0,0,x,y,M.Pulse{charge,0}}

def first_tower(ts: List<&2,M.Tower>) -> M.Tower:
  match ts:
    case Nil{}: support_tower(0,0,0,0,0)
    case Con{head,_}: head

def parallel_tests() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = test_config(rules())
    +base : M.State = fixture([packet(1,0,10,1,12),packet(2,0,10,1,12),packet(3,0,10,1,12),packet(4,0,10,2,12)],4,1,runtime0())
    +boost : M.State = with_towers(base,[support_tower(3,144,208,1,0)])
    require(U32.is_eq(active_count(G.state_enemies(base),c,base,0),1) && U32.is_eq(active_count(G.state_enemies(boost),c,boost,0),2) && U32.is_eq(G.storage_in(c,base,0),G.storage_in(c,boost,0)), "Parallelizer raises one ordinary permit to two while four storage reservations stay fixed")
    +half : M.State = ticks(20n,c,boost)
    +plainHalf : M.State = ticks(20n,c,base)
    +plain : M.State = ticks(40n,c,base)
    require(U32.is_eq(G.inside_in(G.state_enemies(half),0),0) && U32.is_eq(G.inside_in(G.state_enemies(plainHalf),0),2) && U32.is_eq(G.inside_in(G.state_enemies(plain),0),0), "four10work packets leave source at20ticks with two workers versus40ticks with one")
    +stack : M.State = with_towers(base,[support_tower(3,144,208,3,0),support_tower(3,112,208,3,0)])
    require(U32.is_eq(G.effective_workers(c,stack,0),3) && U32.is_eq(G.effective_workers(c,stack,3),1), "Parallelizer aggregate grant caps at two and never expands exclusive writer permits")
    +far : M.State = with_towers(base,[support_tower(3,464,432,1,0)])
    require(U32.is_eq(G.effective_workers(c,far,0),1), "out-of-range Parallelizer has no effect on source")

def set_workers(xs: List<&2,M.Node>, +id: U32, +workers: U32) -> List<&2,M.Node>:
  match xs:
    case Nil{}: Nil{}
    case Con{M.Site{+i,label,sx,sy,x,y,len,speed,slots,roads,work,next,nf,immediate,+old,mode,release,stop},tail}:
      Con{M.Site{i,label,sx,sy,x,y,len,speed,slots,roads,work,next,nf,immediate,M.choose(workers,old,U32.is_eq(i,id)),mode,release,stop},set_workers(tail,id,workers)}

def review_workers(config: M.Config, workers: U32) -> M.Config:
  match config:
    case M.Board{label,nodes,life,gold,pace,waves,waveTicks,pressureEvery,demand,ramp,rules}:
      M.Board{label,set_workers(nodes,1,workers),life,gold,pace,waves,waveTicks,pressureEvery,demand,ramp,rules}

def effort_sum(xs: List<&2,M.Enemy>) -> U32:
  match xs:
    case Nil{}: 0
    case Con{M.Packet{_,_,_,effort,_,_,_,_},tail}: (effort + effort_sum(tail) : U32)

def coordinator_tests() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = review_workers(test_config(rules()),2)
    +es : List<&2,M.Enemy> = [packet(1,2,3,1,12),packet(2,2,3,1,12),M.Packet{3,1,256,10,True{},False{},1,12},packet(4,2,3,2,12),packet(5,1,20,2,12)]
    +r : M.Runtime = M.Run{0,0,0,M.Output{Nil{},0,0,0},0,0,0,0,1,3,0,False{}}
    +base : M.State = fixture(es,6,1,r)
    +tower : M.Tower = support_tower(4,432,208,1,0)
    +boost : M.State = with_towers(base,[tower])
    require(U32.is_eq(G.coordinator_target(c,boost,tower),3), "Coordinator selects unfinished active sibling blocking two authored findings ahead of one")
    +m : G.RoadResult = G.motion(es,c,es,Nil{},0,r,6)
    +targeted : G.Combat = G.autotowers_step([tower],c,G.moved_enemies(m),r,6)
    +control : List<&2,M.Enemy> = G.active_work(G.moved_enemies(m),c,G.moved_enemies(m),r,6,5,1,False{},9,1)
    +released : M.State = fixture(G.processed_enemies(targeted),6,1,r)
    +other : M.State = fixture(control,6,1,r)
    require(U32.is_eq(effort_sum(G.processed_enemies(targeted)),effort_sum(control)) && G.edit_ready(c,released,1) && Bool.not(G.edit_ready(c,other,1)), "same nine extra work units release edit1 frontier only when assigned to its actual unfinished sibling")
    require(G.edit_ready(c,ticks(1n,c,boost),1) && Bool.not(G.edit_ready(c,ticks(1n,c,base),1)) && G.edit_ready(c,ticks(10n,c,base),1), "native Coordinator reduces first-group readiness from ten ticks to one without inventing completion")
    +queued : M.State = fixture([packet(1,1,10,1,12),packet(4,1,10,2,12),packet(5,2,3,2,12)],6,1,M.Run{0,0,0,M.Output{Nil{},0,0,0},0,0,0,1,2,2,0,False{}})
    require(U32.is_eq(G.coordinator_target(test_config(rules()),queued,tower),0), "Coordinator cannot serve queued sibling outside worker permits or unrelated active work")
    +tie : M.State = fixture([packet(1,2,3,1,12),packet(3,1,20,1,12),packet(4,2,3,2,12),packet(5,1,4,2,12)],6,1,r)
    require(U32.is_eq(G.coordinator_target(c,tie,tower),5), "equal waiting counts break ties by remaining effort before packet ID")

def package_tests() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = test_config(M.Contract{3,10240,128,32,4,40,12,480,240,2500,2500,0})
    +es : List<&2,M.Enemy> = [packet(1,3,20,1,2500),packet(2,3,20,1,2500),packet(4,3,20,2,2500),packet(5,3,20,2,2500)]
    +r : M.Runtime = M.Run{0,0,39,M.Output{Nil{},0,0,0},0,0,0,0,2,4,0,False{}}
    +base : M.State = fixture(es,6,1,r)
    +pack : M.State = with_towers(base,[support_tower(5,112,400,1,0)])
    +normal : M.State = G.advance(c,base)
    +encoded : M.State = G.advance(c,pack)
    +bw : M.Writer = G.runtime_writer(G.state_runtime(normal))
    +pw : M.Writer = G.runtime_writer(G.state_runtime(encoded))
    require(U32.is_eq(G.id_count(G.writer_members(bw)),3) && U32.is_eq(G.writer_bytes(bw),7724) && U32.is_eq(G.id_count(G.writer_members(pw)),4) && U32.is_eq(G.writer_bytes(pw),10192), "native automatic flush commits three2500byte payloads normally versus four with16byte encoding overhead at same10240cap")
    require(U32.is_eq(G.enemy_bytes(find_enemy(G.state_enemies(encoded),1)),2500) && U32.is_eq(G.rules_batchBytes(G.config_rules(c)),10240) && U32.is_eq(G.package_target(c,pack),5), "Packager changes encoding overhead and target only; payload and byte cap stay fixed")
    +upgraded : M.State = with_towers(normal,[support_tower(5,112,400,3,0)])
    +committed : M.State = G.advance(c,upgraded)
    require(U32.is_eq(G.writer_bytes(G.runtime_writer(G.state_runtime(committed))),7724) && String.eq(ids(G.writer_members(G.runtime_writer(G.state_runtime(committed)))),"1;2;4;"), "Packager built/upgraded during active writer leaves committed bytes and exclusive membership unchanged")
    +done : M.State = ticks(21n,c,encoded)
    require(U32.is_eq(G.runtime_acknowledged(G.state_runtime(done)),4) && U32.is_eq(G.enemy_count(G.state_enemies(done)),0) && conserved(done), "four near-cap members really finish work and acknowledge exactly once in native writer")
    +fresh : M.State = fixture(es,6,1,M.Run{0,0,0,M.Output{Nil{},0,0,0},0,0,0,0,2,4,0,False{}})
    require(G.writer_active(G.runtime_writer(G.state_runtime(G.advance(c,fresh)))) && Bool.not(G.writer_active(G.runtime_writer(G.state_runtime(G.advance(c,with_towers(fresh,[support_tower(5,112,400,1,0)])))))), "higher Packager target can defer a four-item batch until unchanged timed flush, a real latency cost")

def shield_tests() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = test_config(rules())
    +es : List<&2,M.Enemy> = [packet(1,1,10000,1,12),packet(2,1,10000,1,12),packet(3,1,10000,1,12),packet(4,1,10000,2,12),packet(5,1,10000,2,12),packet(6,1,10000,2,12)]
    +base : M.State = fixture(es,6,1,runtime0())
    +protected : M.State = with_towers(base,[support_tower(6,432,208,2,240)])
    +plain : M.State = ticks(100n,c,base)
    +safe : M.State = ticks(100n,c,protected)
    +spent : M.Tower = first_tower(G.state_towers(safe))
    require(U32.is_eq(G.tower_prevented(spent),240) && U32.is_eq(G.tower_charges(spent),0) && U32.is_eq(G.state_lives(plain),215) && U32.is_eq(G.state_lives(safe),217), "six inside packets generate600 raw jobticks; finite Shield absorbs240 leaving360 net")
    require(String.eq(enemy_snapshot(G.state_enemies(plain)),enemy_snapshot(G.state_enemies(safe))) && String.eq(runtime_snapshot(G.state_runtime(plain)),runtime_snapshot(G.state_runtime(safe))), "Shield mitigation never changes backlog work outcomes or deadlines")
    +longer : M.State = ticks(10n,c,safe)
    require(U32.is_eq(G.tower_prevented(first_tower(G.state_towers(longer))),240), "exhausted Shield cannot absorb later pressure")
    +upgraded : M.State = upgrade_at(c,safe,432,208)
    require(U32.is_eq(G.tower_charges(first_tower(G.state_towers(upgraded))),0) && U32.is_eq(G.tower_charges(first_tower(G.state_towers(G.key(c,upgraded,110)))),0), "upgrade and N during active wave cannot refill exhausted charge")
    +paused : M.State = G.key(c,safe,32)
    require(String.eq(snapshot(paused),snapshot(ticks(10n,c,paused))), "pause freezes Shield charge and cumulative mitigation")
    +settled : M.State = ticks(70n,c,with_towers(fixture(es,6,0,runtime0()),[support_tower(6,432,208,2,240)]))
    +newWave : M.State = G.key(c,settled,110)
    require(U32.is_eq(G.state_phase(settled),0) && U32.is_eq(G.state_wave(newWave),2) && U32.is_eq(G.tower_charges(first_tower(G.state_towers(newWave))),240) && U32.is_eq(G.tower_prevented(first_tower(G.state_towers(newWave))),G.tower_prevented(first_tower(G.state_towers(settled)))) && conserved(settled), "only legitimate settled-wave start restores240 charge while preserving past mitigation")
    +roads : List<&2,M.Enemy> = [M.Packet{1,1,100,10000,False{},True{},1,12},M.Packet{2,1,100,10000,False{},True{},1,12}]
    require(U32.is_eq(G.shield_prevented(G.shield_step(c,[support_tower(6,432,208,1,240)],roads)),0), "safe road traffic consumes no Shield charge and receives no pressure mitigation")
    +mixed : List<&2,M.Enemy> = [packet(1,1,10000,1,12),packet(2,1,10000,1,12),packet(3,0,10000,1,12),packet(4,0,10000,2,12),packet(5,0,10000,2,12),packet(6,0,10000,2,12),packet(7,0,10000,3,12),packet(8,0,10000,3,12)]
    +overlap : G.ShieldResult = G.shield_step(c,[support_tower(6,432,208,1,240),support_tower(6,464,240,1,240),support_tower(6,464,176,1,240)],mixed)
    require(U32.is_eq(G.shield_prevented(overlap),1), "overlapping Shields share local half of two HOT packets and cannot spend uncovered six-packet pressure")

def frontier_time(n: Nat, +c: M.Config, +state: M.State, +edit: U32, ready: Bool) -> U32:
  match n ready:
    case _ True{}: G.state_clock(state)
    case 0n False{}: 9999
    case 1n++n False{}:
      +next = G.advance(c,state)
      frontier_time(n,c,next,edit,G.edit_ready(c,next,edit))

def coordinator_balance() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = review_workers(test_config(rules()),2)
    +r : M.Runtime = M.Run{0,0,0,M.Output{Nil{},0,0,0},0,0,1,1,1,3,0,False{}}
    +base : M.State = fixture([packet(1,1,60,1,12),packet(4,2,3,2,12),packet(5,2,3,2,12),M.Packet{6,1,256,24,True{},False{},2,12}],6,1,r)
    +rapid : M.State = with_towers(base,[support_tower(0,432,208,1,0)])
    +coord : M.State = with_towers(base,[support_tower(4,432,208,1,0)])
    +rt : U32 = frontier_time(120n,c,rapid,2,False{})
    +ct : U32 = frontier_time(120n,c,coord,2,False{})
    +single : M.State = fixture([packet(1,1,24,1,12)],3,1,M.Run{0,0,0,M.Output{Nil{},0,0,0},0,0,1,1,1,1,0,False{}})
    +negativeRapid : U32 = frontier_time(120n,c,with_towers(single,[support_tower(0,432,208,1,0)]),1,False{})
    +negativeCoord : U32 = frontier_time(120n,c,with_towers(single,[support_tower(4,432,208,1,0)]),1,False{})
    require(U32.is_eq(rt,24) && U32.is_eq(ct,9) && U32.is_eq(negativeRapid,9) && U32.is_eq(negativeCoord,24), "equal-price Coordinator reverses frontier latency9vs24 while ordinary work remains24vs9")
    IO.print("COORDINATOR_BALANCE cost=" ++ U32.show(G.cost(4)) ++ " power=" ++ U32.show(G.power(4,1)) ++ " cooldown=" ++ U32.show(G.cooldown(4)) ++ " positive_rapid=" ++ U32.show(rt) ++ " positive_coord=" ++ U32.show(ct) ++ " held_area_rapid=" ++ U32.show((rt * 2 : U32)) ++ " held_area_coord=" ++ U32.show((ct * 2 : U32)) ++ " negative_rapid=" ++ U32.show(negativeRapid) ++ " negative_coord=" ++ U32.show(negativeCoord))

def parallel_balance() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = test_config(rules())
    +base : M.State = fixture([packet(1,1,60,1,12),packet(4,2,3,2,12),packet(5,2,3,2,12),M.Packet{6,1,256,1,True{},False{},2,12}],6,1,M.Run{0,0,0,M.Output{Nil{},0,0,0},0,0,1,1,1,3,0,False{}})
    +parallel : M.State = build(c,base,3,432,208)
    +rapids : M.State = build(c,build(c,base,0,432,208),0,464,176)
    require(U32.is_eq(G.state_gold(parallel),50) && U32.is_eq(G.state_gold(rapids),50), "Parallelizer and two Rapids each charge exactly70 through native clicks")
    +pt : U32 = frontier_time(120n,c,parallel,2,False{})
    +rt : U32 = frontier_time(120n,c,rapids,2,False{})
    require(U32.is_eq(pt,1) && (rt > pt : U32), "equal70 Parallelizer releases genuinely queued short sibling before two Rapids can obtain its permit")
    +single : M.State = fixture([packet(1,1,24,1,12)],3,1,M.Run{0,0,0,M.Output{Nil{},0,0,0},0,0,1,1,1,1,0,False{}})
    +np : U32 = frontier_time(120n,c,build(c,single,3,432,208),1,False{})
    +nr : U32 = frontier_time(120n,c,build(c,build(c,single,0,432,208),0,464,176),1,False{})
    require(U32.is_eq(np,24) && U32.is_eq(nr,1), "equal70 two Rapids finish lone24work in one tick while extra concurrency cannot shorten it")
    IO.print("PARALLELIZER_BALANCE spend=70 positive_parallel=" ++ U32.show(pt) ++ " positive_rapids=" ++ U32.show(rt) ++ " held_area_parallel=" ++ U32.show((pt * 2 : U32)) ++ " held_area_rapids=" ++ U32.show((rt * 2 : U32)) ++ " negative_parallel=" ++ U32.show(np) ++ " negative_rapids=" ++ U32.show(nr))

def next_campaign(+c: M.Config, +s: M.State, policy: U32, phase: U32) -> M.State:
  match phase:
    case 0: G.key(c,investment(c,s,policy),110)
    case _: G.advance(c,s)

def periodic_bounds(+c: M.Config, +s: M.State, due: Bool) -> Bool:
  match due:
    case True{}: bounded(c,s)
    case False{}: True{}

def blocked_wait(xs: List<&2,M.Enemy>, +c: M.Config, +state: M.State) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head,tail}:
      +node = G.get_node(c,G.enemy_stage(head))
      +authored = G.completed_finding(c,head) || (U32.is_eq(G.node_stopClass(node),1) && U32.is_eq(G.node_releaseMode(node),1) && G.enemy_finding(head))
      (M.choose(1,0,authored && Bool.not(G.edit_ready(c,state,G.enemy_edit(head)))) + blocked_wait(tail,c,state) : U32)

def member_content(ids: List<&2,U32>, +es: List<&2,M.Enemy>, +overhead: U32) -> U32:
  match ids:
    case Nil{}: 0
    case Con{id,tail}: (G.enemy_bytes(find_enemy(es,id)) + overhead + member_content(tail,es,overhead) : U32)

def encoding_saved(+c: M.Config, +state: M.State) -> U32:
  +w = G.runtime_writer(G.state_runtime(state))
  M.sub((G.rules_batchOverhead(G.config_rules(c)) + member_content(G.writer_members(w),G.state_enemies(state),G.rules_itemOverhead(G.config_rules(c))) : U32),G.writer_bytes(w))

def mitigation(ts: List<&2,M.Tower>) -> U32:
  match ts:
    case Nil{}: 0
    case Con{head,tail}: (G.tower_prevented(head) + mitigation(tail) : U32)

def has_kind(ts: List<&2,M.Tower>, +kind: U32) -> Bool:
  match ts:
    case Nil{}: False{}
    case Con{head,tail}: U32.is_eq(G.tower_kind(head),kind) || has_kind(tail,kind)

type Measurement is Data:
  Measured{state:M.State,hot:U32,wait:U32,members:U32,saved:U32}

def measurement_state(m: Measurement) -> M.State:
  match m:
    case Measured{state,_,_,_,_}: state

def measurement_show(m: Measurement) -> String:
  match m:
    case Measured{_,hot,wait,members,saved}: " HOT_AREA=" ++ U32.show(hot) ++ " EDIT_WAIT_AREA=" ++ U32.show(wait) ++ " PEAK_MEMBERS=" ++ U32.show(members) ++ " MAX_ENCODING_SAVED=" ++ U32.show(saved)

def campaign(n: Nat, +c: M.Config, +s: M.State, +policy: U32, phase: U32, +hot: U32, +wait: U32, +members: U32, +saved: U32) -> IO(Measurement):
  match n phase:
    case _ 2: IO.pure(Measurement,Measured{s,hot,wait,members,saved})
    case _ 3: IO.pure(Measurement,Measured{s,hot,wait,members,saved})
    case 0n _: IO.pure(Measurement,Measured{s,hot,wait,members,saved})
    case 1n++n _:
      do IO<Measurement>:
        audit(conserved(s) && periodic_bounds(c,s,U32.is_eq((G.state_clock(s) % 20 : U32),0) || U32.is_eq(G.state_phase(s),0)))
        +next : M.State = next_campaign(c,s,policy,G.state_phase(s))
        +count : U32 = G.id_count(G.writer_members(G.runtime_writer(G.state_runtime(s))))
        campaign(n,c,next,policy,G.state_phase(next),(hot + G.danger_count(G.state_enemies(s)) : U32),(wait + blocked_wait(G.state_enemies(s),c,s) : U32),U32.max(members,count),U32.max(saved,M.choose(encoding_saved(c,s),0,(count > 0 : U32))))

def run_case(+profile: U32, +pace: U32, +policy: U32) -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = pace_config(S.select(profile),pace)
    +result : Measurement <- campaign(14000n,c,prepare(c,G.initial(c),policy),policy,0,0,0,0,0)
    +end : M.State = measurement_state(result)
    require(conserved(end) && bounded(c,end) && (G.state_phase(end) >= 2 : U32), "campaign terminates within fuel and final state satisfies audits")
    IO.print("CASE profile=" ++ U32.show(profile) ++ " pace=" ++ U32.show(pace) ++ " policy=" ++ U32.show(policy) ++ " " ++ G.status(end) ++ " OFFERED=" ++ U32.show(G.state_offered(end)) ++ " MITIGATED=" ++ U32.show(mitigation(G.state_towers(end))) ++ measurement_show(result))

def mixed_witness() -> IO(Unit):
  do IO<Unit>:
    +c : M.Config = S.select(0)
    +result : Measurement <- campaign(14000n,c,prepare(c,G.initial(c),5),5,0,0,0,0,0)
    +end : M.State = measurement_state(result)
    require(U32.is_eq(G.state_phase(end),2) && has_kind(G.state_towers(end),3) && has_kind(G.state_towers(end),4) && has_kind(G.state_towers(end),5) && has_kind(G.state_towers(end),6) && conserved(end) && bounded(c,end), "six-wave dynamic witness wins with all four autonomous architecture families legitimately constructed")
    IO.print("DYNAMIC " ++ G.status(end) ++ " MITIGATED=" ++ U32.show(mitigation(G.state_towers(end))) ++ measurement_show(result))

def context_cases(+profile: U32) -> IO(Unit):
  do IO<Unit>:
    run_case(profile,18,1)
    run_case(profile,18,2)
    run_case(profile,18,3)
    run_case(profile,18,4)

def main() -> IO(Unit):
  do IO<Unit>:
    permit_tests()
    group_tests()
    byte_tests()
    departure_test()
    output_tests()
    stop_tests()
    lane_test()
    chain_test()
    frontier_regressions()
    identity_stop_tests()
    construction_test()
    parallel_tests()
    coordinator_tests()
    package_tests()
    shield_tests()
    coordinator_balance()
    parallel_balance()
    run_case(0,18,0)
    context_cases(0)
    context_cases(1)
    context_cases(2)
    context_cases(3)
    mixed_witness()
