import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
const temp=mkdtempSync(join(tmpdir(),'tower-playability-'));
after(()=>rmSync(temp,{recursive:true,force:true}));
const emitted=join(temp,'game.mjs');
const build=spawnSync('bend',[new URL('DefensePlayabilityTests.bend',import.meta.url).pathname,'-o',emitted],{encoding:'utf8',timeout:55000});
assert.ifError(build.error);assert.equal(build.status,0,build.stdout+build.stderr);
const {default:G}=await import(pathToFileURL(emitted));
const list=x=>{const a=[];while(x.$==='Con'){a.push(x.head);x=x.tail;}assert.equal(x.$,'Nil');return a;};
const key=t=>JSON.stringify(t,(_,v)=>typeof v==='bigint'?String(v):v);
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const wait=(predicate,layout=0)=>{let w=G.start(layout);for(let i=0;i<1600;i++){w=G.tick(w);if(predicate(w))return w;}throw Error('No ordinary reachable witness');};
const phase=(m,s)=>m.target.effect.$.endsWith(s);
const site=(w,m,kind)=>{for(let dx=-72;dx<=72;dx+=16)for(let dy=-72;dy<=72;dy+=16){const x=m.x+dx,y=m.y+dy;if(x<24||y<120)continue;const t=G.tower(x,y,kind);if(G.legal(w,x,y)&&list(G.targets(w,t)).some(a=>key(a)===key(m.target)))return {x,y,t};}throw Error('no legal covering site');};

test('ordinary moving monsters are the actual visible targets on every map',()=>{
 for(let layout=0;layout<3;layout++){
  let w=G.start(layout),moved=0,previous=new Map();
  for(let i=0;i<1000;i++){
   w=G.tick(w);const bodies=list(G.mobs(w));
   for(const mob of bodies){
    const p=G.body_point(mob.target,w);assert.equal(p.x,mob.x);assert.equal(p.y,mob.y);
    const old=previous.get(key(mob.target));if(old&&distance(old,mob)>0)moved++;
   }
   if(i%25===0){const pixels=list(G.scene(w));for(const m of bodies)assert.ok(pixels.some(p=>p.x===m.x-2&&p.y===m.y-1&&p.w===1&&p.h===1&&p.color===16777215),'actual scene contains the target monster');}
   previous=new Map(bodies.map(m=>[key(m.target),m]));
  }
  assert.ok(moved>50,'monsters visibly travel instead of remaining at building centers');
 }
});
test('a hit preserves position, changes only the exact recipient and speeds subsequent motion',()=>{
 const w=wait(w=>list(G.mobs(w)).filter(m=>phase(m,'ReviewServiceRequestSettled')).length===2);
 const mobs=list(G.mobs(w)),recipient=mobs[0],placement=site(w,recipient,3);
 const shot=G.shot(w,placement.t,recipient.target.owner.operation),after=list(G.mobs(shot));
 assert.deepEqual(after.map(m=>[m.x,m.y]),mobs.map(m=>[m.x,m.y]),'no teleport at hit');
 const hit=after.find(m=>key(m.target)===key(recipient.target));assert.ok(hit.due<recipient.due);assert.equal(hit.before-hit.after,recipient.due-hit.due);
 for(const other of mobs.filter(m=>key(m.target)!==key(recipient.target)))assert.deepEqual(after.find(m=>key(m.target)===key(other.target)),other);
 const normalNext=list(G.mobs(G.tick(w))).find(m=>key(m.target)===key(recipient.target));
 const shotNext=list(G.mobs(G.tick(shot))).find(m=>key(m.target)===key(recipient.target));
 assert.ok(distance(recipient,shotNext)>distance(recipient,normalNext),'recipient travels faster after the shot');
 assert.ok(list(G.scene(shot)).some(p=>p.color===16768133&&p.w===3&&p.h===3),'actual scene paints a shot beam');
});
test('shortening never delays a near-complete monster',()=>{
 for(let n=0;n<1000;n++){assert.ok(G.shortened(n)<=n);if(n<=100)assert.equal(G.shortened(n),n);else assert.ok(G.shortened(n)<n);}
});
test('pause retains exact moving-target preview before and after construction',()=>{
 for(const [effect,kind] of [['ReviewServiceRequestSettled',3],['OutputTerminal',4]]){
  const w=wait(w=>list(G.mobs(w)).some(m=>phase(m,effect))),m=list(G.mobs(w)).find(m=>phase(m,effect)),s=site(w,m,kind);
  const paused=G.pause(w),aimed=G.aim(paused,s.x,s.y,kind),p=G.preview(aimed);
  assert.ok(p.before>0);assert.ok(p.delta>0&&p.delta<p.before);
  assert.deepEqual(G.tick(paused),paused);
  const built=G.build(aimed,s.x,s.y,kind);assert.equal(G.remaining(built,s.t),p.before);
  assert.deepEqual(list(G.targets(built,s.t)),list(G.targets(aimed,s.t)));
 }
});

test('ordinary accepted completions produce visible result markers, not silent disappearance',()=>{
 let w=G.start(0);const kinds=new Set();
 for(let i=0;i<1000;i++){w=G.tick(w);for(const c of list(G.cues(w)))kinds.add(c.kind);}
 assert.ok(kinds.has(14),'preparation visibly splits');assert.ok(kinds.has(11),'review visibly yields a finding');assert.ok(kinds.has(12),'delivery is explicitly acknowledged');
});

test('stacked shots retain every frozen hit beam and the updated numeric quote',()=>{
 const w=wait(w=>list(G.mobs(w)).filter(m=>phase(m,'ReviewServiceRequestSettled')).length===2);
 const m=list(G.mobs(w))[0],s=site(w,m,3);
 const first=G.shot(w,s.t,m.target.owner.operation),second=G.shot(first,{...s.t,x:s.t.x+8},m.target.owner.operation);
 const hit=list(G.mobs(second)).find(v=>key(v.target)===key(m.target)),beams=list(hit.beams);
 assert.equal(beams.length,2);assert.equal(beams[0].before,beams[1].after);
 assert.deepEqual(beams.map(b=>[b.toX,b.toY]),[[m.x,m.y],[m.x,m.y]]);
 const next=list(G.mobs(G.tick(second))).find(v=>key(v.target)===key(m.target));
 assert.notDeepEqual([next.x,next.y],[m.x,m.y]);assert.deepEqual(list(next.beams).map(b=>[b.toX,b.toY]),[[m.x,m.y],[m.x,m.y]]);
 const pixels=list(G.scene(second));for(const b of beams)assert.ok(pixels.some(p=>p.x===b.fromX&&p.y===b.fromY&&p.color===16768133));
});
test('ordinary automatic tower fires without a manual command and cannot shoot outside range',()=>{
 const w=wait(w=>list(G.mobs(w)).some(m=>phase(m,'ReviewServiceRequestSettled'))),m=list(G.mobs(w)).find(m=>phase(m,'ReviewServiceRequestSettled')),s=site(w,m,3);
 const built=G.build(w,s.x,s.y,3),next=G.tick(built);assert.ok(list(G.mobs(next)).some(v=>list(v.beams).length>0));
 const far=G.tower(24,640,3);assert.equal(list(G.targets(w,far)).length,0);assert.deepEqual(G.shot(w,far,0),w);
});
test('uncertain acknowledgement cannot be shown as delivered',()=>{
 assert.equal(G.certain_marker(),12);assert.equal(G.uncertain_marker(),15);
});

test('zero-duration callbacks preserve physical ingress and pause preserves the whole world',()=>{
 const w=G.tick(G.short_world(0));assert.equal(G.time(w),1);
 assert.ok(list(G.cues(w)).every(c=>c.kind!==10),'no review outcome before entrance travel');
 const paused=G.pause(w);assert.deepEqual(G.tick(paused),paused);
});
test('partial event budgets cannot advance game motion before completing the horizon',()=>{
 let w=G.short_world(25),found=false;
 for(let i=0;i<1800;i++){
  const before=G.time(w),next=G.bounded(w);
  if(G.time(next)===before){
   const a=list(G.mobs(w)),b=list(G.mobs(next));
   for(const m of a){const same=b.find(n=>key(n.target)===key(m.target));if(same)assert.deepEqual([same.x,same.y],[m.x,m.y]);}
   found=true;
  }
  w=next;
 }
 assert.ok(found,'the fixture actually stops within an unfinished horizon');
});

test('new roster time effects and short/long priority agree with independent arithmetic',()=>{
 for(let n=0;n<=5000;n++) {
  assert.equal(G.after_time(6,n),Math.min(n,Math.max(100,Math.floor(n/2))));
  for(const kind of [3,4,5])assert.equal(G.after_time(kind,n),Math.min(n,Math.max(100,Math.floor(n/2))));
 }
 for(let a=100;a<600;a+=17)for(let b=100;b<600;b+=23){assert.equal(G.prefer(5,a,b),a<b);assert.equal(G.prefer(3,a,b),a>b);}
});
const cohortSite=(kind,layout=0,min=1,reviewOnly=false)=>{
 let w=G.cohort(layout,7);
 for(let tick=0;tick<1400;tick++){
  w=G.tick(w);
  if(tick%4)continue;
  for(const m of list(G.mobs(w))){
   if(!phase(m,'ReviewServiceRequestSettled'))continue;
   let placement;try{placement=site(w,m,kind)}catch{continue}
   const eligible=list(G.targets(w,placement.t));
   if(eligible.length>=min&&(!reviewOnly||[5,3].every(k=>G.select_target(w,G.tower(placement.x,placement.y,k)).value?.effect.$.endsWith('ReviewServiceRequestSettled'))))return {w,...placement,eligible};
  }
 }
 throw Error(`No reachable cohort witness: kind ${kind}, map ${layout}, count ${min}`);
};
test('finisher and accelerator choose different actual monsters when durations differ',()=>{
 const {w,t,eligible}=cohortSite(5,0,2);
 const times=eligible.map(target=>G.due(w,target));assert.ok(new Set(times).size>1);
 const short=G.select_target(w,t).value,long=G.select_target(w,G.tower(t.x,t.y,3)).value;
 assert.equal(G.due(w,short),Math.min(...times));assert.equal(G.due(w,long),Math.max(...times));assert.notEqual(key(short),key(long));
});
for(const kind of [5,6])for(const layout of [0,1,2])test(`new tower ${kind} real preview, pause and exact volley on map ${layout}`,()=>{
 const {w,t,x,y,eligible}=cohortSite(kind,layout,kind===6?3:1);
 const plan=list(G.plan(w,t));assert.equal(plan.length,kind===6?3:1);
 assert.equal(new Set(plan.map(key)).size,plan.length);
 assert.equal(G.caption(w,t),`TARGETS ${plan.length}`);assert.doesNotMatch(G.scope(kind),/UNKNOWN/);
 const paused=G.pause(w),hover=G.aim(paused,x,y,kind);assert.equal(G.preview(hover).status,1);
 const built=G.build(paused,x,y,kind);assert.deepEqual(G.plan(built,t),G.plan(paused,t));assert.deepEqual(G.tick(built),built);
 const active=G.pause(built),shot=G.shot(active,t,0);
 const chosen=new Set(plan.map(key));
 for(const m of list(G.mobs(active))){
  const old=G.due(active,m.target),fresh=G.due(shot,m.target);
  const after=list(G.mobs(shot)).find(a=>key(a.target)===key(m.target));assert.deepEqual([after.x,after.y],[m.x,m.y]);
  if(chosen.has(key(m.target))){
   const left=old-G.time(active)*20;
   assert.equal(fresh,G.time(active)*20+Math.max(100,Math.floor(left/2)));
   assert.ok(list(after.beams).length>list(m.beams).length,'each exact recipient retains its own beam');
  }else assert.equal(fresh,old,'unselected and out-of-range monsters unchanged');
 }
 assert.equal(list(G.marks(active,t)).filter(mark=>mark.chosen).length,plan.length);
 const pass=G.automatic(active);assert.deepEqual(list(pass.shots).map(s=>key(s.target)),plan.map(key),"recorded volley order equals execution plan for replay");
 const automatic=G.tick(active);assert.ok(plan.every(target=>G.due(automatic,target)<G.due(active,target)),'normal tick fires automatically');
 const first=plan[0],left=G.due(active,first)-G.time(active)*20;
 assert.equal(G.quote(active,t),`${left} TO ${Math.max(100,Math.floor(left/2))} MS`);
 assert.equal(G.preview(hover).delta,left-Math.max(100,Math.floor(left/2)));
 assert.equal(G.stats(t),kind===6?'40 TO 20':'20 TO 10');
 assert.ok(eligible.length>=plan.length);
});

test('every new tower can reach its advertised final level within the ordinary budget',()=>{
 for(const [kind,left] of [[5,25],[6,10]]){
  const built=G.selected(G.build(G.pause(G.start(0)),424,392,kind));
  const upgraded=G.upgrade(G.upgrade(built));
  assert.equal(list(upgraded.towers)[0].level,3);
  assert.equal(upgraded.gold,left);
  assert.deepEqual(G.upgrade(upgraded),upgraded,'maximum level is an inert refusal');
 }
});

test('finishing a short job beats a long-first shot for that job, without promising the whole cohort',()=>{
 const {w,t}=cohortSite(5,0,2,true),short=G.select_target(w,t).value;
 const completion=(kind)=>{
  let current=G.shot(w,G.tower(t.x,t.y,kind),0);
  for(let i=0;i<1100;i++){
   current=G.tick(current);
   const work=list(G.observation(current).canonical.work).find(item=>item.operation===short.owner.operation);
   if(work?.kind?.$==='PendingFinding')return G.time(current);
  }
  throw Error('selected job never produced its retained result: '+JSON.stringify({hp:current.hp,short,work:list(G.observation(current).canonical.work)}));
 };
 assert.ok(completion(5)<completion(3),'one short-first shot produces the short result earlier than one long-first shot');
});
