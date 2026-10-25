import assert from "node:assert/strict";
import {replaceTokens} from "./motion-state-slice.mjs";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {after,test} from "node:test";

const directory=mkdtempSync(join(tmpdir(),"hapsland-preview-render-"));
after(()=>rmSync(directory,{recursive:true,force:true}));
const emitted=join(directory,"preview.mjs");
const build=spawnSync("bend",[new URL("DefensePreviewConformance.bend",import.meta.url).pathname,"-o",emitted],{encoding:"utf8",timeout:55000});
assert.ifError(build.error);assert.equal(build.status,0,build.stdout+build.stderr);
const {default:P}=await import(pathToFileURL(emitted).href);
const list=value=>{const result=[];while(value.$==="Con"){result.push(value.head);value=value.tail;assert.ok(result.length<100000)}assert.equal(value.$,"Nil");return result};
const snapshot=value=>JSON.stringify(value,(_,v)=>typeof v==="bigint"?String(v):v);
const crosses=(world,program=P)=>list(program.scene(world)).filter(r=>r.w===21&&r.h===3&&[6741384,16768133,9148069].includes(r.color));
const operation=target=>target.value.owner.operation;

const globalProgram=P;
const cover=(world,kind,P=globalProgram)=>{
 for(const target of list(P.live_targets(world))){
  if(kind===3&&!/PreparationCompleted|ReviewServiceRequestSettled/.test(target.effect.$))continue;
  if(kind===4&&!/OutputTerminal|FinishTerminal/.test(target.effect.$))continue;
  const point=P.physics_body(target,world);
  for(let dx=-72;dx<=72;dx+=16)for(let dy=-72;dy<=72;dy+=16){
   const x=point.x+dx,y=point.y+dy;if(x<24||y<120||x>776||y>640)continue;
   const hover=P.hover_at(world,x,y,kind);if(P.placement_legal(hover)&&P.placement_before(hover)>0)return {hover,x,y};
  }
 }
};
// Host worlds are persistent values. Cache only completed real-Host searches;
// selected and ghost states are still constructed through the public controls.
const reachable=new WeakMap();
const seek=(kind,selected=false,P=globalProgram)=>{
 let cache=reachable.get(P);if(!cache){cache=new Map();reachable.set(P,cache);}
 let witness=cache.get(kind);
 if(!witness){let world=P.ordinary_start();for(let i=0;i<1000;i++){world=P.ordinary_tick(world);const site=cover(world,kind,P);if(site){witness={world,...site};cache.set(kind,witness);break;}}}
 if(!witness)throw Error('No reachable legal target in 1000 actual Host ticks');
 return selected?P.ordinary_build(witness.world,witness.x,witness.y,kind):witness.hover;
};
const edge=(level)=>{
 const w=seek(3);
 for(const t of list(P.live_targets(w))){const p=P.physics_body(t,w);
  for(let dx=-104;dx<=104;dx+=16)for(let dy=-104;dy<=104;dy+=16){const x=p.x+dx,y=p.y+dy;if(x<24||y<120)continue;
   const hover=P.hover_at(w,x,y,3);if(!P.placement_legal(hover))continue;
   let built=P.ordinary_build(w,x,y,3);if(level===3)built=P.upgraded(built);
   if(P.selected_next(built).$==='None'&&P.selected_next(P.upgraded(built)).$==='Some')return built;
  }
 }throw Error('No upgrade range edge witness');
};
test("empty and unauthorized courier scenes fabricate no target crosses",()=>{
 assert.equal(crosses(P.world(0,3,true)).length,0);
 assert.equal(crosses(P.world(2,4,true)).length,0);
 assert.equal(P.next_target(P.world(2,4,true),4).$,"None");
});
test("removing preview from the actual scene fails the same visible-target witness",async()=>{
 const root=new URL("./",import.meta.url).pathname;
 const relocate=text=>text.replace(/import (\.[^\s]+)/g,(_,path)=>"import "+resolve(root,path));
 const original=readFileSync(new URL("DefenseRender.bend",import.meta.url),"utf8");
 const call="  preview_layer(world,Preview.calculate(world),base(world))";
 const mutantRender=join(directory,"MutantRender.bend");
 writeFileSync(mutantRender,relocate(replaceTokens(original,call,"base(world)")));
 const fixture=relocate(readFileSync(new URL("DefensePreviewConformance.bend",import.meta.url),"utf8"))
   .replace(resolve(root,"DefenseRender.bend"),mutantRender);
 const entry=join(directory,"MutantConsumer.bend"),module=join(directory,"mutant.mjs");writeFileSync(entry,fixture);
 const result=spawnSync("bend",[entry,"-o",module],{encoding:"utf8",timeout:55000});
 assert.ifError(result.error);assert.equal(result.status,0,result.stdout+result.stderr);
 const {default:mutant}=await import(pathToFileURL(module).href);
 const witness=seek(3,true);assert.ok(crosses(witness).length>0);
 assert.equal(crosses(seek(3,true,mutant),mutant).length,0,"old missing-preview behavior is rejected by the positive scene witness");
});

test("cancelled work is not previewed even while its physical callback remains queued",()=>{
 const world=P.cancelled_world();
 const stale=list(P.original_callbacks(world)).filter(item=>/Queued$/.test(item.status.$)&&/ReviewServiceRequestSettled$/.test(item.fact.target.effect.$));
 assert.equal(stale.length,2,"Stop cancels ownership, not the already scheduled physical deliveries");
 assert.equal(P.targets(world,3),0);assert.equal(crosses(world).length,0);
});


test("actual Host keeps construction budget and separates ordinary delivery from Finish packets",()=>{
 const ordinary=P.ticks(1200,P.initial());
 assert.equal(P.individual_count(ordinary),2);
 assert.equal(P.finish_count(ordinary),0);
 assert.equal(P.budget(ordinary),160);
 const finish=P.ticks(650,P.finish_world());
 assert.ok(P.finish_count(finish)>0);
 assert.equal(P.budget(finish),120,"Finish delivery cannot mint construction budget");
 assert.equal(P.control_counters_preserved(ordinary),true);
});

test("manual S and scheduled caller Stop have identical business states and delivery counts",()=>{
 for(const kind of [0,1,2]) {
  const actual=P.stop_run(kind,false), scheduled=P.stop_scheduled(kind);
  assert.deepEqual(P.business_core(actual),P.business_core(scheduled),`case ${kind}`);
  assert.equal(P.finish_count(actual),P.finish_count(scheduled));
  assert.equal(P.individual_count(actual),P.individual_count(scheduled));
  const repeated=P.stop_run(kind,true);
  if(kind!==2)assert.deepEqual(actual,repeated,"repeat while waiting leaves the whole World unchanged");
  assert.deepEqual(P.business_core(actual),P.business_core(repeated));
  assert.equal(P.finish_count(actual),P.finish_count(repeated));
  const closed=P.stop_closed(actual);
  assert.ok(list(P.business_core(closed).rounds).length<=list(P.business_core(P.ticks(5,actual)).rounds).length,"Stop cannot open an extra round");
  assert.equal(P.finish_count(closed),P.finish_count(actual));
  assert.equal(P.individual_count(closed),P.individual_count(actual));
 }
});

test("manual Stop is inert before start and while paused, and exposes waiting cutoff",()=>{
 const before=P.before_start();
 assert.deepEqual(P.stop_key(before),before);
 const initial=P.stop_at_input(1),paused=P.pause(initial);
 assert.deepEqual(P.stop_key(paused),paused);
 assert.equal(P.stop_text(paused),"S STOP UNAVAILABLE WHILE PAUSED");
 const waiting=P.ticks(1,P.stop_key(initial));
 assert.match(P.stop_text(waiting),/^STOP WAIT 180 MS$/);
});

test("defeat refuses placement and upgrades without changing any World field; living pause permits planning",()=>{
 const selected=P.defeated(P.world(2,3,true));
 assert.deepEqual(P.upgraded(selected),selected);
 const receipt=P.lab_upgrade(selected);
 assert.deepEqual(receipt.world,selected);
 assert.equal(receipt.result.$,'Dead');assert.equal(receipt.charged,0);
 assert.equal(P.upgrade_note(selected),'DEFEATED / NO UPGRADE');
 const hover=P.defeated(P.world(2,3,false));
 assert.equal(P.activity_note(hover),'DEFEATED / WORLD FROZEN / R RESET');
 assert.equal(P.placement_legal(hover),false);
 assert.equal(P.placement_reason(hover),'DEFEATED / R STARTS A NEW GAME');
 assert.deepEqual(P.click_here(hover),hover);
 const paused=P.pause(P.world(2,3,false));
 assert.equal(P.placement_legal(paused),true);
 assert.equal(P.budget(P.click_here(paused)),110);
 assert.equal(P.budget(P.upgraded(P.pause(P.world(2,3,true)))),70);
});

test("every selectable tower has a visible reachable effect on every ordinary map, with prebuild/built and pause parity",()=>{
 const kinds=[...new Set(Array.from({length:9},(_,i)=>P.menu_kind(i+1)))].sort();
 assert.ok(kinds.length>0);
 for(const layout of [0,1,2]){
  const seen=new Map();let world=P.ordinary_layout(layout);
  for(let tick=0;tick<1000&&seen.size<kinds.length;tick++,world=P.ordinary_tick(world)){
   for(const kind of kinds){
    if(seen.has(kind))continue;
    let witness;
    for(const target of list(P.live_targets(world))){
     const point=P.physics_body(target,world);
     for(const dx of [-56,0,56])for(const dy of [-56,0,56]){
      const x=Math.max(24,point.x+dx),y=Math.max(120,point.y+dy);
      const hover=P.hover_at(world,x,y,kind);
      if(P.placement_legal(hover)&&P.placement_before(hover)>0)witness={hover,x,y};
     }
    }
    if(!witness)continue;
    const {hover,x,y}=witness,before=P.placement_before(hover),built=P.ordinary_build(world,x,y,kind);
    assert.equal(P.selected_remaining(built),before);
    for(const [name,w] of [["prebuild",hover],["built",built],["paused prebuild",P.pause(hover)],["paused built",P.pause(built)]]){
     assert.ok(crosses(w).length>0,`${name} type ${kind} must mark its entity`);
     assert.ok(list(P.scene(w)).some(r=>r.w===2&&r.h===2&&r.color===6741384),`${name} type ${kind} must have green range on map ${layout} tick ${tick}`);
    }
    assert.deepEqual(crosses(hover),crosses(built));
    assert.deepEqual(crosses(P.pause(hover)),crosses(P.pause(built)));
    seen.set(kind,{tick,before,target:String(P.placement_target(hover))});
   }
  }
  assert.deepEqual([...seen.keys()].sort(),kinds,`each offered tower needs reachable useful work on map ${layout}: ${JSON.stringify([...seen])}`);
 }
});

test("physics coverage is independent of pause for arbitrary tower parameters; pause cannot advance the world",()=>{
 const states=[P.ordinary_start(),P.world(2,3,false),P.world(540,4,false),P.finish_world(),P.cancelled_world()];
 for(const world of states){
  const paused=P.pause(world),before=snapshot(paused);
  assert.equal(snapshot(P.ordinary_tick(paused)),before,"pause freezes the complete game, not only its picture");
  for(let i=0;i<48;i++){
   const tower={...P.tower(3),kind:i%8,level:1+i%3,x:40+(i%12)*64,y:136+(i%8)*64};
   const targets=P.physics_targets(world,tower);
   assert.deepEqual(P.physics_targets(paused,tower),targets,`pause must preserve coverage for ${snapshot(tower)}`);
   assert.equal(P.physics_color(paused,tower),P.physics_color(world,tower));
   assert.equal(P.physics_color(world,tower),list(targets).length?6741384:9148069);
  }
 }
});


test("moving targets have identical prebuild and built annotations",()=>{
 for(const kind of [3,4,5,6])for(const selected of [false,true]){
  const w=seek(kind,selected),marks=list(P.annotate(w,kind)),rects=crosses(w);assert.ok(marks.length>0);assert.equal(rects.length,marks.length);
  for(const mark of marks)assert.ok(rects.some(r=>r.x===mark.body.x-10&&r.y===mark.body.y+2));
 }
});
test("preview is read-only and cooldown preserves green eligible monsters",()=>{
 const w=seek(3,true),before=snapshot(w),observation=snapshot(P.observe(w));P.scene(w);P.scene(w);
 assert.equal(snapshot(w),before);assert.equal(snapshot(P.observe(w)),observation);
 const paused=P.pause(w);assert.deepEqual(P.selected_next(paused),P.selected_next(w));assert.ok(crosses(paused).length>0);assert.ok(crosses(paused).every(r=>r.color===6741384));
 const cooling=P.cool(w);assert.equal(P.selected_effect(cooling),"NO SHOT NOW");assert.ok(crosses(cooling).length>0);assert.ok(crosses(cooling).every(r=>r.color===6741384));
});
test("numeric preview paints the real shortened deadline and upgrade quotes",()=>{
 const w=seek(3,true),before=P.selected_remaining(w),after=Math.max(100,Math.floor(before/2)),text=`${before} TO ${after} MS`;
 assert.equal(P.selected_effect(w),text);assert.equal(P.range_quote(w),"72 TO 84");assert.equal(P.cadence_quote(w),"20 TO 10");
 const card=list(P.selected_card(w));for(const pixel of list(P.text_pixels(text,812,600,2,16768133)))assert.ok(card.some(p=>snapshot(p)===snapshot(pixel)));
 const paused=P.pause(w);assert.equal(P.selected_effect(paused),"NO SHOT NOW");assert.equal(P.conditional_effect(paused),`IF READY NOW: ${text}`);
 const cooling=P.cool(w),up=P.upgraded(cooling);assert.equal(P.ready_at(up),P.ready_at(cooling));assert.equal(P.cadence_quote(up),"10 TO 6");
});
test("L2 and L3 extend actual moving-target coverage without resetting cooldown",()=>{
 for(const level of [2,3]){const w=edge(level);assert.equal(P.selected_next(w).$,"None");assert.equal(P.selected_next(P.upgraded(w)).$,"Some");}
 const w=seek(3,true),shot=P.cool(w);assert.equal(P.ready_at(shot),P.ordinary_time(w)+20);assert.equal(P.ready_at(P.upgraded(P.upgraded(shot))),P.ready_at(shot));
 const courier=seek(4,true);assert.equal(P.upgrade_note(courier),"U COST 32");const two=P.upgraded(courier);assert.equal(P.budget(two),88);assert.equal(P.upgrade_note(two),"U COST 48");const three=P.upgraded(two);assert.equal(P.budget(three),40);assert.equal(P.upgrade_note(three),"MAX LEVEL / NO UPGRADE");
});
test("selected focus identifies the exact moving recipient",()=>{
 const w=seek(3,true);assert.equal(P.focused(w),operation(P.selected_next(w)));assert.ok(P.focused(w)>0);
});
test("coverage over forbidden ground remains visible while construction is refused",()=>{
 const w=seek(3),target=list(P.live_targets(w))[0],p=P.physics_body(target,w),hover=P.hover_at(w,p.x,p.y,3);
 assert.ok(P.placement_before(hover)>0);assert.equal(P.range_color(hover),6741384);assert.ok(crosses(hover).length>0);
 assert.equal(P.placement_legal(hover),false);assert.equal(snapshot(P.click_here(hover)),snapshot(hover));
});
test("a committed Finish is one moving packet with its captured membership",()=>{
 const base=P.finish_world(),target=list(P.live_targets(base)).find(t=>/FinishTerminal$/.test(t.effect.$));assert.ok(target);assert.ok(list(target.effect.selected).length>0);
 const point=P.physics_body(target,base),hover=P.hover_at(base,point.x,point.y,4),marks=list(P.annotate(hover,4)).filter(m=>m.target.order===target.original_order);
 assert.equal(marks.length,1);assert.deepEqual(marks[0].target.members.value,target.effect.selected);assert.match(P.live_caption(target,base),/PACKET/);
});
test("always-visible monsters replace historical duplicates and completed targets",()=>{
 for(const w of [seek(3),P.pause(seek(3)),seek(4)]){
  const scene=list(P.scene(P.hover_at(w,776,632,4)));
  for(const target of list(P.live_targets(w))){const p=P.physics_body(target,w);assert.ok(scene.some(r=>r.x===p.x-2&&r.y===p.y-1&&r.w===1&&r.h===1&&r.color===16777215),"actual small monster eye at the callback owner position");}
  assert.ok(!scene.some(r=>r.color===6909552),"old history bodies are not another set of monsters");
 }
 const done=P.pause(P.ticks(1200,P.ordinary_start()));assert.equal(list(P.live_targets(done)).length,0);assert.equal(crosses(done).length,0);
});
test("coincident monsters show their count without different labels overpainting each other",()=>{
 const w=P.crowded(),targets=list(P.live_targets(w));assert.equal(targets.length,8);
 for(const t of targets){const p=P.physics_body(t,w),same=targets.filter(a=>{const q=P.physics_body(a,w);return p.x===q.x&&p.y===q.y;});
  if(same.length>1){const text=P.live_caption(t,w);assert.match(text,new RegExp(`X${same.length}`));for(const other of same)assert.equal(P.live_caption(other,w),text);}
 }
});

test("all retained beams follow the same moving monster instead of the old impact positions",()=>{
 for(const [x,y]of [[320,180],[336,188],[352,196]]){
  const pixels=list(P.hit_animation(x,y,true));
  const beam=pixels.filter(r=>r.w===3&&r.h===3&&r.color===16768133);
  assert.equal(beam.filter(r=>r.x===x&&r.y===y).length,2,"both stacked hits end at the current body");
  assert.ok(!beam.some(r=>(r.x===280&&r.y===120)||(r.x===280&&r.y===220)),"historical impact positions are not beam endpoints");
  assert.ok(beam.some(r=>r.x===160&&r.y===120)&&beam.some(r=>r.x===160&&r.y===220),"each beam keeps its own firing tower");
 }
 assert.deepEqual(list(P.hit_animation(352,196,false)),[],"expired effects leave no detached beam");
});
test("actual accelerator and courier beams stay attached to their moving recipient",()=>{
 for(const kind of [3,4,5,6]){
  let world=P.cool(seek(kind,true));
  const hit=list(P.mobs(world)).find(m=>list(m.beams).length);
  assert.ok(hit,"actual selected tower must fire");
  const identity=snapshot(hit.target);let moved=false;
  for(let tick=0;tick<6;tick++){
   world=P.ordinary_tick(world);
   const mob=list(P.mobs(world)).find(m=>snapshot(m.target)===identity);
   if(!mob)break;
   const beams=list(mob.beams);if(!beams.length)break;
   moved ||= mob.x!==hit.x||mob.y!==hit.y;
   assert.ok(list(P.scene(world)).filter(r=>r.x===mob.x&&r.y===mob.y&&r.w===3&&r.h===3&&r.color===16768133).length>=beams.length,"each live beam ends at its own current recipient in the real scene");
  }
  assert.ok(moved,"the witness must move after the shot");
 }
});
