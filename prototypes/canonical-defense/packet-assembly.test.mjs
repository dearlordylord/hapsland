import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
const temp=mkdtempSync(join(tmpdir(),'defense-packet-assembly-'));
after(()=>rmSync(temp,{recursive:true,force:true}));
const emitted=join(temp,'game.mjs');
const build=spawnSync('bend',[new URL('DefensePacketAssemblyTests.bend',import.meta.url).pathname,'-o',emitted],{encoding:'utf8',timeout:55000});
assert.ifError(build.error);assert.equal(build.status,0,build.stdout+build.stderr);
const {default:G}=await import(pathToFileURL(emitted));
const list=x=>{const out=[];while(x.$==='Con'){out.push(x.head);x=x.tail;}assert.equal(x.$,'Nil');return out;};
const fragments=(w,operation)=>list(G.groups(w)).find(g=>g.owner.operation===operation)?.fragments;
test('courier cannot target an unassembled spatially separated finding cluster',()=>{
 let w=G.start(0);for(let tick=0;tick<590;tick++)w=G.tick(w);
 const fs=list(fragments(w,3n));assert.equal(fs.length,4,'four actual finding monsters before assembly');
 const tower=G.tower(152,456,4);
 assert.ok(fs.some(f=>(f.x-152)**2+(f.y-456)**2>72**2),'countercase includes a real out-of-range fragment');
 assert.equal(G.available(w,tower),0,'no single visible delivery packet exists yet');
});
const operation=a=>a.key.operation;
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const active=w=>list(G.mobs(w)).filter(m=>m.at!==4294967295n);
const finish=w=>list(G.mobs(w)).filter(m=>m.target.effect.$.endsWith('.FinishTerminal'));
const entry=[{x:148,y:444},{x:152,y:596},{x:164,y:356}];
for(const layout of [0,1,2])test(`ordinary assembly preserves roads and releases one packet per output: layout ${layout}`,()=>{
 let w=G.start(layout),previous=new Map(),merged=new Set(),sawWaiting=false,sawCarrier=false;
 for(let tick=0;tick<1250;tick++){
  w=G.tick(w);const actors=list(G.actors(w)),groups=list(G.groups(w));
  for(const a of actors){const old=previous.get(operation(a));if(old)assert.ok(distance(a,old)<=4,'assembly cannot teleport an actor');}
  for(const g of groups){
   const a=actors.find(a=>operation(a)===g.owner.operation);if(!a)continue;
   if(g.split&&!g.merged&&list(g.fragments).length){sawWaiting=true;assert.equal(g.carrier,false);assert.ok(!active(w).some(m=>m.target.owner.operation===g.owner.operation),'unassembled output is not a visible target');}
   if(g.carrier&&a.outcome===0){sawCarrier=true;assert.equal(g.merged,true);assert.equal(list(g.fragments).filter(f=>f.finding).length,0);}
   if(g.merged&&!merged.has(g.owner.operation)){assert.equal(distance(a,entry[layout]),0,'first assembly occurs exactly at the common physical entry');assert.equal(list(g.fragments).length,0,'all-finding fixture merges only after all fragments arrive');merged.add(g.owner.operation);}
  }
  previous=new Map(actors.map(a=>[operation(a),a]));
 }
 assert.ok(sawWaiting&&sawCarrier);assert.equal(G.individual(w),2,'both actual individual terminals accepted');
});
test('two-member Finish waits for unequal physical arrivals and exposes only one carrier',()=>{
 let w=G.schedule_finish(G.start(0),10060n),sawUnequal=false,sawCarrier=false;
 for(let tick=0;tick<1000;tick++){
  w=G.tick(w);const groups=list(G.groups(w)),fs=finish(w);
  if(!fs.length)continue;
  const selected=list(fs[0].target.effect.selected);assert.deepEqual(selected,[4n,3n]);
  const gs=selected.map(id=>groups.find(g=>g.owner.operation===id));
  if(gs.some(g=>g.merged)&&gs.some(g=>!g.merged)){sawUnequal=true;assert.equal(active(w).length,0);assert.equal(gs.filter(g=>g.carrier).length,0);}
  if(active(w).length){sawCarrier=true;assert.ok(gs.every(g=>g.merged));assert.equal(gs.filter(g=>g.carrier).length,1);assert.equal(active(w).length,1);}
 }
 assert.ok(sawUnequal&&sawCarrier);assert.equal(G.delivered(w),1);assert.equal(G.individual(w),0);
});
test('partial Finish never absorbs the cancelled sibling',()=>{
 let w=G.schedule_finish(G.start(0),9900n),seen=false;
 for(let tick=0;tick<1000;tick++){w=G.tick(w);for(const m of finish(w)){seen=true;assert.deepEqual(list(m.target.effect.selected),[3n]);assert.ok(!list(G.groups(w)).some(g=>g.owner.operation===4n&&g.carrier));}}
 assert.ok(seen);assert.equal(G.delivered(w),1);
});
for(const stopAt of [640,1100])test(`late actual Stop does not reassemble departed individual packets: tick ${stopAt}`,()=>{
 let w=G.start(0);for(let t=0;t<stopAt;t++)w=G.tick(w);
 if(stopAt===640){const a=list(G.actors(w)).find(a=>operation(a)===3n);assert.ok(distance(a,entry[0])>0);assert.ok(list(G.groups(w)).find(g=>g.owner.operation===3n).carrier);}
 else assert.equal(G.individual(w),2);
 w=G.stop(w);for(let t=stopAt;t<1450;t++){w=G.tick(w);assert.equal(finish(w).length,0,'this actual Stop scope produces no new Finish packet');}
});
test('Courier hit boosts only its assembled visible packet, leaving other fragments at base speed',()=>{
 let w=G.start(0);for(let t=0;t<640;t++)w=G.tick(w);
 w=G.build(w,152,456,4);const before=list(G.actors(w)),fs=list(fragments(w,4n));assert.equal(fs.length,4);
 const hit=G.fire(w,3n);assert.deepEqual(list(G.actors(hit)),before,'hit preserves every pose');
 const normal=G.tick(w),boosted=G.tick(hit);const normalActors=list(G.actors(normal)),boostedActors=list(G.actors(boosted));
 assert.deepEqual(list(fragments(boosted,4n)),list(fragments(normal,4n)),'unmarked sibling fragments do not accelerate');
 const old=before.find(a=>operation(a)===3n),n=normalActors.find(a=>operation(a)===3n),b=boostedActors.find(a=>operation(a)===3n);
 assert.ok(distance(old,b)>distance(old,n),'the one hit carrier advances faster');
});
