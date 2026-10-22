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
 for(let n=0n;n<1000n;n++){assert.ok(G.shortened(n)<=n);if(n<=100n)assert.equal(G.shortened(n),n);else assert.ok(G.shortened(n)<n);}
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
 const far=G.tower(24,640,3);assert.equal(list(G.targets(w,far)).length,0);assert.deepEqual(G.shot(w,far,0n),w);
});
test('uncertain acknowledgement cannot be shown as delivered',()=>{
 assert.equal(G.certain_marker(),12);assert.equal(G.uncertain_marker(),15);
});

test('zero-duration callbacks preserve physical ingress and pause preserves the whole world',()=>{
 const w=G.tick(G.short_world(0n));assert.equal(G.time(w),1);
 assert.ok(list(G.cues(w)).every(c=>c.kind!==10),'no review outcome before entrance travel');
 const paused=G.pause(w);assert.deepEqual(G.tick(paused),paused);
});
test('partial event budgets cannot advance game motion before completing the horizon',()=>{
 let w=G.short_world(25n),found=false;
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
