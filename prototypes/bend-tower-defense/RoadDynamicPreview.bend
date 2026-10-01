# Read-only current-state snapshots, not future trajectories or automatic builds.
import Base
import ./RoadModel.bend as M
import ./RoadGame.bend as G
import ./RoadPreview.bend as P

type Hit is Data:
  WorkHit{id: U32, before: U32, after: U32, edit: U32}

type ShieldSite is Data:
  SiteShield{site: U32, inside: U32, beforeAbsorb: U32, afterAbsorb: U32}

type Protection is Data:
  PressureSample{danger: U32, preventedBefore: U32, preventedAfter: U32, newChargeSpent: U32, chargeLeft: U32, site: U32, sites: List<&2, ShieldSite>}

type Packaging is Data:
  BatchSample{membersBefore: List<&2, U32>, membersAfter: List<&2, U32>, bytesBefore: U32, bytesAfter: U32, eligibleIds: List<&2, U32>, flushAge: U32, flushRemaining: U32, writerBusy: Bool, committedIds: List<&2, U32>, committedBytes: U32, dispatchBefore: Bool, dispatchAfter: Bool}

type Snapshot is Data:
  Dynamic{enabled: Bool, kind: U32, hits: List<&2, Hit>, dependents: List<&2, U32>, coordinatorId: U32, coordinatorBlockers: U32, releaseReady: Bool, shield: Protection, package: Packaging}

def hit_id(value: Hit) -> U32:
  match value:
    case WorkHit{x, _, _, _}: x

def hit_before(value: Hit) -> U32:
  match value:
    case WorkHit{_, x, _, _}: x

def hit_after(value: Hit) -> U32:
  match value:
    case WorkHit{_, _, x, _}: x

def hit_edit(value: Hit) -> U32:
  match value:
    case WorkHit{_, _, _, x}: x

def site_site(value: ShieldSite) -> U32:
  match value:
    case SiteShield{x, _, _, _}: x

def site_inside(value: ShieldSite) -> U32:
  match value:
    case SiteShield{_, x, _, _}: x

def site_before_absorb(value: ShieldSite) -> U32:
  match value:
    case SiteShield{_, _, x, _}: x

def site_after_absorb(value: ShieldSite) -> U32:
  match value:
    case SiteShield{_, _, _, x}: x

def shield_danger(value: Protection) -> U32:
  match value:
    case PressureSample{x, _, _, _, _, _, _}: x

def shield_prevented_before(value: Protection) -> U32:
  match value:
    case PressureSample{_, x, _, _, _, _, _}: x

def shield_prevented_after(value: Protection) -> U32:
  match value:
    case PressureSample{_, _, x, _, _, _, _}: x

def shield_new_charge_spent(value: Protection) -> U32:
  match value:
    case PressureSample{_, _, _, x, _, _, _}: x

def shield_charge_left(value: Protection) -> U32:
  match value:
    case PressureSample{_, _, _, _, x, _, _}: x

def shield_site(value: Protection) -> U32:
  match value:
    case PressureSample{_, _, _, _, _, x, _}: x

def shield_sites(value: Protection) -> List<&2, ShieldSite>:
  match value:
    case PressureSample{_, _, _, _, _, _, x}: x

def package_members_before(value: Packaging) -> List<&2, U32>:
  match value:
    case BatchSample{x, _, _, _, _, _, _, _, _, _, _, _}: x

def package_members_after(value: Packaging) -> List<&2, U32>:
  match value:
    case BatchSample{_, x, _, _, _, _, _, _, _, _, _, _}: x

def package_bytes_before(value: Packaging) -> U32:
  match value:
    case BatchSample{_, _, x, _, _, _, _, _, _, _, _, _}: x

def package_bytes_after(value: Packaging) -> U32:
  match value:
    case BatchSample{_, _, _, x, _, _, _, _, _, _, _, _}: x

def package_eligible_ids(value: Packaging) -> List<&2, U32>:
  match value:
    case BatchSample{_, _, _, _, x, _, _, _, _, _, _, _}: x

def package_flush_age(value: Packaging) -> U32:
  match value:
    case BatchSample{_, _, _, _, _, x, _, _, _, _, _, _}: x

def package_flush_remaining(value: Packaging) -> U32:
  match value:
    case BatchSample{_, _, _, _, _, _, x, _, _, _, _, _}: x

def package_writer_busy(value: Packaging) -> Bool:
  match value:
    case BatchSample{_, _, _, _, _, _, _, x, _, _, _, _}: x

def package_committed_ids(value: Packaging) -> List<&2, U32>:
  match value:
    case BatchSample{_, _, _, _, _, _, _, _, x, _, _, _}: x

def package_committed_bytes(value: Packaging) -> U32:
  match value:
    case BatchSample{_, _, _, _, _, _, _, _, _, x, _, _}: x

def package_dispatch_before(value: Packaging) -> Bool:
  match value:
    case BatchSample{_, _, _, _, _, _, _, _, _, _, x, _}: x

def package_dispatch_after(value: Packaging) -> Bool:
  match value:
    case BatchSample{_, _, _, _, _, _, _, _, _, _, _, x}: x

def enabled(value: Snapshot) -> Bool:
  match value:
    case Dynamic{x, _, _, _, _, _, _, _, _}: x

def kind(value: Snapshot) -> U32:
  match value:
    case Dynamic{_, x, _, _, _, _, _, _, _}: x

def hits(value: Snapshot) -> List<&2, Hit>:
  match value:
    case Dynamic{_, _, x, _, _, _, _, _, _}: x

def dependents(value: Snapshot) -> List<&2, U32>:
  match value:
    case Dynamic{_, _, _, x, _, _, _, _, _}: x

def coordinator_id(value: Snapshot) -> U32:
  match value:
    case Dynamic{_, _, _, _, x, _, _, _, _}: x

def coordinator_blockers(value: Snapshot) -> U32:
  match value:
    case Dynamic{_, _, _, _, _, x, _, _, _}: x

def release_ready(value: Snapshot) -> Bool:
  match value:
    case Dynamic{_, _, _, _, _, _, x, _, _}: x

def shield(value: Snapshot) -> Protection:
  match value:
    case Dynamic{_, _, _, _, _, _, _, x, _}: x

def package(value: Snapshot) -> Packaging:
  match value:
    case Dynamic{_, _, _, _, _, _, _, _, x}: x

def new_tower(+state: M.State) -> M.Tower:
  M.Processor{G.snap(G.state_mouseX(state)), G.snap(G.state_mouseY(state)), G.state_choice(state), 1, 0, 0, 0, 0, M.Pulse{240,0}}

def hit_put(+enemy: M.Enemy, tail: List<&2, Hit>, after: U32, changed: Bool) -> List<&2, Hit>:
  match changed:
    case True{}: WorkHit{G.enemy_id(enemy),G.enemy_effort(enemy),after,G.enemy_edit(enemy)} <> tail
    case False{}: tail

def work_hits(xs: List<&2, M.Enemy>, +after: List<&2, M.Enemy>) -> List<&2, Hit>:
  match xs:
    case Nil{}: []
    case Con{+head,tail}:
      +remaining = G.original_effort(after,G.enemy_id(head))
      hit_put(head,work_hits(tail,after),remaining,(remaining < G.enemy_effort(head) : U32))

def hit_ids(xs: List<&2, Hit>) -> List<&2,U32>:
  match xs:
    case Nil{}: []
    case Con{head,tail}: hit_id(head) <> hit_ids(tail)

def ids(xs: List<&2,M.Enemy>) -> List<&2,U32>:
  match xs:
    case Nil{}: []
    case Con{head,tail}: G.enemy_id(head) <> ids(tail)

def aim_id(a: G.Aim) -> U32:
  match a:
    case G.Target{_,id,_,_,_}: id

def pick_enemy(a: M.Enemy, b: M.Enemy, yes: Bool) -> M.Enemy:
  match yes:
    case True{}: a
    case False{}: b

def find_enemy(xs: List<&2,M.Enemy>, +id: U32) -> M.Enemy:
  match xs:
    case Nil{}: M.Packet{0,255,0,0,False{},False{},0,0}
    case Con{+head,tail}:
      pick_enemy(head,find_enemy(tail,id),U32.is_eq(G.enemy_id(head),id))

def dependent_ids(xs: List<&2,M.Enemy>, +config: M.Config, +edit: U32) -> List<&2,U32>:
  match xs:
    case Nil{}: []
    case Con{+head,tail}:
      +node = G.get_node(config,G.enemy_stage(head))
      +held = U32.is_eq(G.enemy_edit(head),edit) && G.enemy_finding(head) &&
        (G.completed_finding(config,head) || (U32.is_eq(G.node_releaseMode(node),1) && U32.is_eq(G.node_stopClass(node),1)))
      List.append(&2,U32,Bool.pick(List<&2,U32>,held,[G.enemy_id(head)],[]),dependent_ids(tail,config,edit))

def other_blockers(xs: List<&2,M.Enemy>, +config: M.Config, +edit: U32, +id: U32) -> U32:
  match xs:
    case Nil{}: 0
    case Con{+head,tail}:
      (M.choose(1,0,U32.is_eq(G.enemy_edit(head),edit) && Bool.not(U32.is_eq(G.enemy_id(head),id)) && G.unfinished(config,head)) + other_blockers(tail,config,edit,id) : U32)

def spent_at(before: List<&2,M.Tower>, +config: M.Config, +after: List<&2,M.Tower>, +site: U32) -> U32:
  match before after:
    case Nil{} _: 0
    case _ Nil{}: 0
    case Con{+head,tail} Con{+updated,rest}:
      (M.choose(M.sub(G.tower_charges(head),G.tower_charges(updated)),0,U32.is_eq(G.support_target(config,head),site)) + spent_at(tail,config,rest,site) : U32)

def collect_shield_sites(nodes: List<&2,M.Node>, +config: M.Config, +jobs: List<&2,M.Enemy>, +before: List<&2,M.Tower>, +afterTowers: List<&2,M.Tower>, +beforeResult: List<&2,M.Tower>, +afterResult: List<&2,M.Tower>) -> List<&2,ShieldSite>:
  match nodes:
    case Nil{}: []
    case Con{head,tail}:
      +site = G.node_id(head)
      SiteShield{site,G.inside_in(jobs,site),spent_at(before,config,beforeResult,site),spent_at(afterTowers,config,afterResult,site)} <>
        collect_shield_sites(tail,config,jobs,before,afterTowers,beforeResult,afterResult)

def first_charges(towers: List<&2,M.Tower>) -> U32:
  match towers:
    case Nil{}: 0
    case Con{head,_}: G.tower_charges(head)

def protection(+config: M.Config, +state: M.State, +afterState: M.State) -> Protection:
  +jobs = G.state_enemies(state)
  +beforeTowers = G.state_towers(state)
  +afterTowers = G.state_towers(afterState)
  +before = G.shield_step(config,beforeTowers,jobs)
  +after = G.shield_step(config,afterTowers,jobs)
  +left = first_charges(G.shield_towers(after))
  PressureSample{G.danger_count(jobs),G.shield_prevented(before),G.shield_prevented(after),M.sub(240,left),left,G.support_target(config,new_tower(state)),
    collect_shield_sites(G.config_nodes(config),config,jobs,beforeTowers,afterTowers,G.shield_towers(before),G.shield_towers(after))}

def pending_now(+config: M.Config, +state: M.State) -> List<&2,M.Enemy>:
  +runtime = G.state_runtime(state)
  +jobs = G.state_enemies(state)
  +allStop = G.candidates(jobs,config,jobs,runtime,G.state_offered(state),True{})
  +cycled = G.after_response(runtime,G.enemy_count(allStop),U32.is_eq(G.runtime_stop(runtime),3) && Bool.not(G.writer_active(G.runtime_writer(runtime))))
  G.candidates(G.remove_members(jobs,G.writer_members(G.runtime_writer(runtime))),config,jobs,cycled,G.state_offered(state),U32.is_eq(G.runtime_stop(cycled),2))

def prefix_now(+config: M.Config, +state: M.State) -> G.Prefix:
  +rules = G.config_rules(config)
  G.byte_prefix(G.sort_enemies(pending_now(config,state)),rules,[],[],G.rules_batchOverhead(rules),False{})

def dispatch_now(+config: M.Config, +state: M.State) -> Bool:
  +runtime = G.state_runtime(state)
  +output = G.batch_dispatch(config,G.state_enemies(state),runtime,G.state_offered(state),G.state_clock(state))
  Bool.not(G.writer_active(G.runtime_writer(runtime))) && G.writer_active(G.runtime_writer(G.output_runtime(output)))

def selected_bytes(+prefix: G.Prefix) -> U32:
  M.choose(G.prefix_bytes(prefix),0,(G.id_count(G.prefix_members(prefix)) > 0 : U32))

def packaging(+config: M.Config, +state: M.State, +afterState: M.State) -> Packaging:
  +beforeConfig = G.supported_config(config,G.state_towers(state))
  +afterConfig = G.supported_config(config,G.state_towers(afterState))
  +before = prefix_now(beforeConfig,state)
  +after = prefix_now(afterConfig,state)
  +runtime = G.state_runtime(state)
  +writer = G.runtime_writer(runtime)
  +age = G.runtime_flushAge(runtime)
  BatchSample{G.prefix_members(before),G.prefix_members(after),selected_bytes(before),selected_bytes(after),ids(pending_now(beforeConfig,state)),age,M.sub(G.rules_flushTicks(G.config_rules(beforeConfig)),age),G.writer_active(writer),G.writer_members(writer),G.writer_bytes(writer),dispatch_now(beforeConfig,state),dispatch_now(afterConfig,state)}

def blank(kind: U32) -> Snapshot:
  Dynamic{False{},kind,[],[],0,0,False{},PressureSample{0,0,0,0,0,255,[]},BatchSample{[],[],0,0,[],0,0,False{},[],0,False{},False{}}}

def live_snapshot(+config: M.Config, +state: M.State, +kind: U32) -> Snapshot:
  +tower = new_tower(state)
  +active = G.supported_config(config,G.state_towers(state))
  +jobs = G.state_enemies(state)
  +runtime = G.state_runtime(state)
  +aim = G.tower_aim(tower,active,jobs,runtime,G.state_offered(state))
  +shots = G.autotowers_step([tower],active,jobs,runtime,G.state_offered(state))
  +target = M.choose(aim_id(aim),0,U32.is_eq(kind,4))
  +edit = G.enemy_edit(find_enemy(jobs,target))
  +afterJobs = G.processed_enemies(shots)
  +afterState = G.click(config,state,G.state_mouseX(state),G.state_mouseY(state),0)
  Dynamic{True{},kind,work_hits(jobs,afterJobs),Bool.pick(List<&2,U32>,(target > 0 : U32),dependent_ids(jobs,active,edit),[]),target,
    M.choose(other_blockers(jobs,active,edit,target),0,(target > 0 : U32)),
    (target > 0 : U32) && G.edit_ready_at(active,afterJobs,runtime,G.state_offered(state),edit),
    protection(config,state,afterState),packaging(config,state,afterState)}

def gated(config: M.Config, +state: M.State, allowed: Bool) -> Snapshot:
  match allowed:
    case True{}: live_snapshot(config,state,G.state_choice(state))
    case False{}: blank(G.state_choice(state))

def calculate(+config: M.Config, +state: M.State) -> Snapshot:
  gated(config,state,P.legal(P.calculate(config,state)))

def hit_member(snapshot: Snapshot, id: U32) -> Bool:
  G.member(hit_ids(hits(snapshot)),id)

def dependent_member(snapshot: Snapshot, id: U32) -> Bool:
  G.member(dependents(snapshot),id)

def count_hits(xs: List<&2, Hit>) -> U32:
  match xs:
    case Nil{}: 0
    case Con{_,tail}: (1 + count_hits(tail) : U32)

def hit_count(snapshot: Snapshot) -> U32:
  count_hits(hits(snapshot))

def waiting_count(snapshot: Snapshot) -> U32:
  G.id_count(dependents(snapshot))

# Placement cue: 0inspection,1benefit,2persistentzero,3snapshotzero,4blocked.
# Structural eligibility is not a throughput prediction.
def potential_sites(xs: List<&2,M.Node>, +p: P.Preview) -> Bool:
  match xs:
    case Nil{}: False{}
    case Con{+head,tail}:
      ((M.distance(P.x(p),P.y(p),G.node_x(head),G.node_y(head)) <= M.square(G.range(P.kind(p),1)) : U32) &&
        (Bool.not(U32.is_eq(P.kind(p),4)) || U32.is_eq(G.node_stopClass(head),2) || U32.is_eq(G.node_stopClass(head),0))) || potential_sites(tail,p)

def cue_dynamic_kind(+config: M.Config, +p: P.Preview, +d: Snapshot, kind: U32) -> U32:
  match kind:
    case 6:
      M.choose(M.choose(1,3,(shield_prevented_after(shield(d)) > shield_prevented_before(shield(d)) : U32)),2,Bool.not(U32.is_eq(shield_site(shield(d)),255)))
    case _:
      M.choose(M.choose(1,3,(hit_count(d) > 0 : U32)),2,potential_sites(G.config_nodes(config),p))

def cue_status(+config: M.Config, +p: P.Preview, +d: Snapshot, status: U32) -> U32:
  match status:
    case 0: 0
    case 1: 1
    case 4: 2
    case 5: 2
    case 7: cue_dynamic_kind(config,p,d,P.kind(p))
    case _: 4

def cue_text_kind(+code: U32, +d: Snapshot, kind: U32) -> String:
  match code kind:
    case 0 _: "INSPECTING TOWER"
    case 4 _: "CANNOT BUILD"
    case 2 _: "NO EFFECT HERE"
    case 3 6: Bool.pick(String,(shield_new_charge_spent(shield(d)) > 0 : U32),"NO EXTRA PROTECTION NOW / USES CHARGE","NO EXTRA PROTECTION NOW")
    case 3 4: "NO EFFECT NOW / NO ACTIVE BLOCKING SIBLING"
    case 3 _: "NO EFFECT NOW / NO ACTIVE WORK IN RANGE"
    case 1 5: "NEXT BATCH POLICY CHANGES"
    case 1 3: "EXTRA WORKER PERMIT"
    case 1 6: "EXTRA PROTECTION THIS PRESSURE TICK"
    case _ _: "NEXT SHOT WORK REDUCTION"

def cue(config: M.Config, +p: P.Preview, d: Snapshot) -> U32:
  cue_status(config,p,d,P.status(p))

def cue_text(code: U32, +p: P.Preview, d: Snapshot) -> String:
  cue_text_kind(code,d,P.kind(p))
