import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
const temp=mkdtempSync(join(tmpdir(),'defense-physical-movement-'));
after(()=>rmSync(temp,{recursive:true,force:true}));
const emitted=join(temp,'game.mjs');
const build=spawnSync('bend',[new URL('DefensePhysicalMovementTests.bend',import.meta.url).pathname,'-o',emitted],{encoding:'utf8',timeout:55000});
assert.ifError(build.error);assert.equal(build.status,0,build.stdout+build.stderr);
const {default:G}=await import(pathToFileURL(emitted));
const list=x=>{const out=[];while(x.$==='Con'){out.push(x.head);x=x.tail;}assert.equal(x.$,'Nil');return out;};
const id=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v);
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const entrances=[{x:36,y:174},{x:24,y:166},{x:24,y:172}];
// Independent silhouette witness: the small monster has two white eye pixels.
const painted=(pixels,p)=>pixels.some(r=>r.x===p.x-2&&r.y===p.y-1&&r.w===1&&r.h===1&&r.color===16777215)&&pixels.some(r=>r.x===p.x+2&&r.y===p.y-1&&r.w===1&&r.h===1&&r.color===16777215);
for(const layout of [0,1,2])for(const delay of [0n,25n])test(`no-tower physical journey: layout ${layout}, callback delay ${delay}`,()=>{
 let w=G.start(layout,delay),previous=new Map(),rootSeen=false,checksSeen=false,fragmentsSeen=false,movingSteps=0;
 const previousFragments=new Map();
 for(let tick=0;tick<900;tick++){
  const oldTime=G.time(w);w=G.tick(w);assert.equal(G.time(w),oldTime+1,'ordinary finite workload completes one horizon');
  const actors=list(G.actors(w)),groups=list(G.groups(w));
  for(const actor of actors){
   const key=id(actor.key),old=previous.get(key);
   if(old){const step=distance(old,actor);assert.ok(step<=4,`tick ${tick}, ${key}: displacement ${step}, phase ${old.phase}->${actor.phase}`);if(step>0)movingSteps++;}
   if(!rootSeen&&actor.key.operation===actor.family&&G.visible(actor,w)){
    assert.ok(distance(actor,entrances[layout])<=4,`first visible root skipped entrance: ${actor.x},${actor.y}`);const entrancePixels=list(G.scene(w));
    assert.ok(actor.phase>0?painted(entrancePixels,actor):entrancePixels.some(r=>r.x===actor.x-5&&r.y===actor.y-4&&r.w===4&&r.h===4&&r.color===16777215),'entrance witness must be drawn in actual scene');rootSeen=true;
   }
  }
  let pixels;
  const scene=()=>pixels??=list(G.scene(w));
  for(const group of groups){
   const actor=actors.find(a=>id(a.key)===id(group.owner));
   if(!checksSeen&&!group.split&&actor?.phase===4&&list(group.results).length>=2){
    const points=list(group.results).map((_,index)=>G.check_point(actor,group,layout,index));
    assert.ok(painted(scene(),actor),'one actual Jev review monster is visible');
    assert.ok(points.every(p=>scene().some(r=>r.color===15124059&&r.x>=p.x&&r.x<p.x+5&&r.y>=p.y&&r.y<p.y+7)),'each configured check retains its distinct indexed status glyph');checksSeen=true;
   }
   const fragments=list(group.fragments);
   if(!fragmentsSeen&&fragments.length>=2){assert.ok(fragments.every(p=>painted(scene(),p)),'split fragments must be visible in actual scene');fragmentsSeen=true;}
   for(const f of fragments){const key=id(group.owner)+':'+f.rule,old=previousFragments.get(key);if(old)assert.ok(distance(old,f)<=2+f.rule%4,`fragment ${key} exceeds its base speed`);previousFragments.set(key,f);}
  }
  previous=new Map(actors.map(a=>[id(a.key),a]));
 }
 assert.ok(rootSeen,'visible root entrance witness');assert.ok(checksSeen,'visible multiple checks inside Jev');assert.ok(fragmentsSeen,'visible split into multiple outcome fragments');assert.ok(movingSteps>100,'complete path has substantial continuous movement');
});
