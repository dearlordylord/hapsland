# Directed native evidence. Snapshots share exact engine helpers, not universal proofs.
import Base
import ./RoadModel.bend as M
import ./RoadGame.bend as G
import ./RoadScenario.bend as S
import ./RoadDynamicPreview.bend as D
import ./RoadHeadless.bend as H

def hover(state: M.State, kind: U32, x: U32, y: U32) -> M.State:
  G.move(G.choose(state,kind),x,y)

def fixture(jobs: List<&2,M.Enemy>, offered: U32, runtime: M.Runtime, kind: U32, x: U32, y: U32) -> M.State:
  hover(H.fixture(jobs,offered,1,runtime),kind,x,y)

def remaining(hits: List<&2,D.Hit>, +id: U32, +after: Bool) -> U32:
  match hits:
    case Nil{}: 99999
    case Con{+head,tail}:
      M.choose(Bool.pick(U32,after,D.hit_after(head),D.hit_before(head)),remaining(tail,id,after),U32.is_eq(D.hit_id(head),id))

def rapid() -> IO(Unit):
  +c = S.select(0)
  +jobs : List<&2,M.Enemy> = [H.packet(1,0,5,1,100),H.packet(2,0,24,1,100)]
  +state = fixture(jobs,3,H.runtime0(),0,144,240)
  +p = D.calculate(c,state)
  +shot = G.autotowers_step([D.new_tower(state)],G.supported_config(c,G.state_towers(state)),jobs,G.state_runtime(state),3)
  H.require(D.enabled(p) && U32.is_eq(D.hit_count(p),1) && U32.is_eq(remaining(D.hits(p),1,False{}),5) && U32.is_eq(remaining(D.hits(p),1,True{}),0) && U32.is_eq(remaining(D.hits(p),1,True{}),G.original_effort(G.processed_enemies(shot),1)) && Bool.not(D.hit_member(p,2)),"Rapid exact active shot clips5to0, preserves second unit")

def batch() -> IO(Unit):
  +c = S.select(0)
  +jobs : List<&2,M.Enemy> = [H.packet(1,0,24,1,100),H.packet(2,0,24,1,100),H.packet(3,0,24,1,100),H.packet(4,0,24,2,100)]
  +p = D.calculate(c,fixture(jobs,6,H.runtime0(),1,144,240))
  H.require(U32.is_eq(D.hit_count(p),3) && U32.is_eq(remaining(D.hits(p),1,True{}),6) && D.hit_member(p,3) && Bool.not(D.hit_member(p,4)),"Batch18work hits exactly three active jobs; fourth awaits worker permit")

def relay_range() -> IO(Unit):
  +c = S.select(0)
  +jobs : List<&2,M.Enemy> = [H.packet(1,0,24,1,100)]
  +relay = D.calculate(c,fixture(jobs,3,H.runtime0(),2,272,240))
  +rapid = D.calculate(c,fixture(jobs,3,H.runtime0(),0,272,240))
  H.require(U32.is_eq(D.hit_count(relay),1) && U32.is_eq(remaining(D.hits(relay),1,True{}),18) && U32.is_eq(D.hit_count(rapid),0),"Relay sixwork long range reaches live unit beyond Rapid range")

def gated_and_readonly() -> IO(Unit):
  +c = S.select(0)
  +state = fixture([H.packet(1,0,24,1,100)],3,H.runtime0(),0,144,152)
  +preview = D.calculate(c,state)
  +before = H.snapshot(state)
  +legal = hover(state,0,144,240)
  +ignored = D.calculate(c,legal)
  H.require(Bool.not(D.enabled(preview)) && U32.is_eq(D.hit_count(preview),0) && String.eq(before,H.snapshot(state)) && U32.is_eq(G.state_gold(legal),120) && U32.is_eq(G.enemy_count(G.state_enemies(legal)),1) && D.enabled(ignored),"illegal road gates snapshot; pure hover never buys/spends/mutates jobs")

def cooldown_and_reservation() -> IO(Unit):
  +c = S.select(0)
  +jobs : List<&2,M.Enemy> = [H.packet(1,3,20,1,100),H.packet(2,3,20,1,100)]
  +runtime : M.Runtime = M.Run{3,50,0,M.Output{[1],260,5,80},0,0,1,0,0,0,1,True{}}
  +state = fixture(jobs,3,runtime,0,144,432)
  +preview = D.calculate(c,state)
  +cooling : M.Tower = M.Processor{144,432,0,1,4,0,0,0,M.Pulse{240,0}}
  +shot = G.active_shoot(cooling,jobs,c,runtime,3,G.tower_aim(cooling,c,jobs,runtime,3))
  H.require(D.hit_member(preview,1) && Bool.not(D.hit_member(preview,2)) && U32.is_eq(remaining(D.hits(preview),1,True{}),8) && U32.is_eq(G.original_effort(G.fired_enemies(shot),1),20),"writer reservation restricts hit to member1; exact cooldown emits no work")

def coordinator_release() -> IO(Unit):
  +c = S.select(0)
  +jobs : List<&2,M.Enemy> = [H.packet(1,2,30,1,100),H.packet(2,2,30,1,100),H.packet(3,1,7,1,100)]
  +state = fixture(jobs,3,H.runtime0(),4,368,240)
  +p = D.calculate(c,state)
  H.require(U32.is_eq(D.coordinator_id(p),3) && U32.is_eq(D.waiting_count(p),2) && D.dependent_member(p,1) && D.dependent_member(p,2) && U32.is_eq(D.coordinator_blockers(p),0) && U32.is_eq(remaining(D.hits(p),3,True{}),0) && D.release_ready(p),"Coordinator finishes active lastreview7work: two same-edit findings gate becomesready")

def coordinator_conditional() -> IO(Unit):
  +c = S.select(0)
  +jobs : List<&2,M.Enemy> = [H.packet(1,2,30,1,100),H.packet(2,1,40,1,100),H.packet(3,1,7,1,100)]
  +p = D.calculate(c,fixture(jobs,3,H.runtime0(),4,368,240))
  +unoffered = D.calculate(c,fixture([H.packet(1,2,30,1,100),H.packet(2,1,7,1,100)],2,H.runtime0(),4,368,240))
  H.require(U32.is_eq(D.coordinator_id(p),3) && U32.is_eq(D.coordinator_blockers(p),1) && Bool.not(D.release_ready(p)) && Bool.not(D.release_ready(unoffered)),"Coordinator highlights dependents but otherreview/unoffered sibling prevents promised release")

def shield() -> IO(Unit):
  +c = S.select(0)
  +jobs : List<&2,M.Enemy> = [H.packet(1,0,24,1,100),H.packet(2,0,24,1,100),H.packet(3,0,24,1,100),H.packet(4,0,24,2,100)]
  +state = fixture(jobs,6,H.runtime0(),6,144,240)
  +p = D.shield(D.calculate(c,state))
  +clicked = G.click(c,state,144,240,0)
  +exact = G.shield_step(c,G.state_towers(clicked),jobs)
  H.require(U32.is_eq(D.shield_danger(p),4) && U32.is_eq(D.shield_prevented_before(p),0) && U32.is_eq(D.shield_prevented_after(p),2) && U32.is_eq(D.shield_new_charge_spent(p),2) && U32.is_eq(D.shield_charge_left(p),238) && U32.is_eq(D.shield_prevented_after(p),G.shield_prevented(exact)),"Shield snapshot absorbs two pressureunits not HP; exact halfpressure/charges")

def overlapping_shield() -> IO(Unit):
  +c = S.select(0)
  +jobs : List<&2,M.Enemy> = [H.packet(1,0,24,1,100),H.packet(2,0,24,1,100)]
  +state = fixture(jobs,3,H.runtime0(),6,144,240)
  +built = G.move(G.click(c,state,144,240,0),80,240)
  +p = D.shield(D.calculate(c,built))
  H.require(U32.is_eq(D.shield_prevented_before(p),1) && U32.is_eq(D.shield_prevented_after(p),1) && U32.is_eq(D.shield_new_charge_spent(p),1) && U32.is_eq(D.shield_charge_left(p),239),"newshield spends one while replacing oldspend: zero marginal prevention under global cap")

def package_members() -> IO(Unit):
  +c = S.select(0)
  +jobs : List<&2,M.Enemy> = [H.packet(1,3,0,1,2500),H.packet(2,3,0,1,2500),H.packet(3,3,0,1,2500),H.packet(4,3,0,2,2500)]
  +state = fixture(jobs,6,H.runtime0(),5,112,432)
  +p = D.package(D.calculate(c,state))
  H.require(U32.is_eq(G.id_count(D.package_members_before(p)),3) && U32.is_eq(G.id_count(D.package_members_after(p)),4) && U32.is_eq(D.package_bytes_before(p),7724) && U32.is_eq(D.package_bytes_after(p),10192) && D.package_dispatch_before(p) && D.package_dispatch_after(p),"Packager eligiblebyteprefix3to4; encodedbytes7724to10192 under10240 cap")

def package_delay() -> IO(Unit):
  +c = S.select(0)
  +jobs : List<&2,M.Enemy> = [H.packet(1,3,0,1,100),H.packet(2,3,0,1,100),H.packet(3,3,0,1,100)]
  +state = fixture(jobs,3,H.runtime0(),5,112,432)
  +p = D.package(D.calculate(c,state))
  H.require(D.package_dispatch_before(p) && Bool.not(D.package_dispatch_after(p)) && U32.is_eq(D.package_flush_remaining(p),40),"Packager raises target3to4; same three eligibleunits now waitforflush instead of promise fasterdispatch")

def package_busy() -> IO(Unit):
  +c = S.select(0)
  +jobs : List<&2,M.Enemy> = [H.packet(1,3,20,1,100),H.packet(2,3,0,1,100),H.packet(3,3,0,1,100)]
  +runtime : M.Runtime = M.Run{0,0,39,M.Output{[1],260,5,80},0,0,1,0,0,0,0,False{}}
  +state = fixture(jobs,3,runtime,5,112,432)
  +p = D.package(D.calculate(c,state))
  H.require(D.package_writer_busy(p) && G.member(D.package_committed_ids(p),1) && U32.is_eq(D.package_committed_bytes(p),260) && Bool.not(G.member(D.package_eligible_ids(p),1)) && Bool.not(D.package_dispatch_before(p)) && Bool.not(D.package_dispatch_after(p)) && U32.is_eq(D.package_flush_remaining(p),1) && String.eq(H.runtime_snapshot(runtime),H.runtime_snapshot(G.state_runtime(state))),"busywriter commitment260bytes/member1 staysfixed; uncommittedeligible excludes1; no concurrentdispatch")

def held_jobs() -> IO(Unit):
  +c = S.select(0)
  +state = fixture([H.packet(1,2,30,1,100),H.packet(2,1,60,1,100)],3,H.runtime0(),0,432,400)
  +p = D.calculate(c,state)
  H.require(D.enabled(p) && U32.is_eq(D.hit_count(p),0),"held sameedit Advice work is not active and cannot be shot")

def empty_and_road() -> IO(Unit):
  +c = S.select(0)
  +state = fixture([],0,H.runtime0(),5,112,432)
  +p = D.package(D.calculate(c,state))
  +roads : List<&2,M.Enemy> = [M.Packet{1,0,20,24,False{},True{},1,100},M.Packet{2,0,20,24,False{},True{},1,100}]
  +shield = D.shield(D.calculate(c,fixture(roads,3,H.runtime0(),6,144,240)))
  H.require(U32.is_eq(D.package_bytes_before(p),0) && U32.is_eq(D.package_bytes_after(p),0) && U32.is_eq(G.id_count(D.package_eligible_ids(p)),0) && U32.is_eq(D.shield_danger(shield),0) && U32.is_eq(D.shield_new_charge_spent(shield),0),"empty prefix reports0not phantomheaderbytes; roads never contribute pressure/charge spend")

def flush_and_oversize() -> IO(Unit):
  +c = S.select(0)
  +runtime : M.Runtime = M.Run{0,0,39,M.Output{[],0,0,0},0,0,0,0,0,0,0,False{}}
  +state = fixture([H.packet(1,3,0,1,100),H.packet(2,3,0,1,20000)],3,runtime,5,112,432)
  +p = D.package(D.calculate(c,state))
  H.require(D.package_dispatch_before(p) && D.package_dispatch_after(p) && U32.is_eq(D.package_flush_remaining(p),1) && G.member(D.package_eligible_ids(p),2) && Bool.not(G.member(D.package_members_after(p),2)) && U32.is_eq(D.package_bytes_after(p),244),"flush age39 dispatches short batch; eligible oversize unit remains excluded by exactbyteprefix")

def capture_future_review() -> IO(Unit):
  +c = S.select(0)
  +state = fixture([H.packet(1,2,30,1,100),H.packet(2,0,4,1,100)],3,H.runtime0(),4,144,240)
  +p = D.calculate(c,state)
  H.require(U32.is_eq(D.coordinator_id(p),2) && U32.is_eq(remaining(D.hits(p),2,True{}),0) && U32.is_eq(D.coordinator_blockers(p),0) && Bool.not(D.release_ready(p)),"finishingCapture still requires downstreamReview: zero OTHER LIVE BLOCKERS is not release readiness")

def shots_suite() -> IO(Unit):
  do IO<Unit>:
    rapid()
    batch()
    relay_range()
    gated_and_readonly()
    cooldown_and_reservation()
    held_jobs()

def support_suite() -> IO(Unit):
  do IO<Unit>:
    coordinator_release()
    coordinator_conditional()
    shield()
    overlapping_shield()
    capture_future_review()

def batches_suite() -> IO(Unit):
  do IO<Unit>:
    package_members()
    package_delay()
    package_busy()
    empty_and_road()
    flush_and_oversize()

def main() -> IO(Unit):
  do IO<Unit>:
    shots_suite()
    support_suite()
    batches_suite()
    IO.print("DYNAMIC PREVIEW:16 directed checks complete")
