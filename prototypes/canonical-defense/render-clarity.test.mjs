import {replaceTokens} from "./motion-state-slice.mjs";
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {test,after} from 'node:test';
const dir=mkdtempSync(join(tmpdir(),'defense-render-clarity-'));after(()=>rmSync(dir,{recursive:true,force:true}));
const output=join(dir,'game.mjs');
const built=spawnSync('bend',[new URL('DefenseRenderClarityTests.bend',import.meta.url).pathname,'-o',output],{encoding:'utf8',timeout:55000});
assert.ifError(built.error);assert.equal(built.status,0,built.stdout+built.stderr);
const {default:G}=await import(pathToFileURL(output));
const list=x=>{const a=[];while(x.$==='Con'){a.push(x.head);x=x.tail;}assert.equal(x.$,'Nil');return a;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
test('outcome cues retain their exact text without decorative partial circles',()=>assert.deepEqual(G.cue(),G.cue_text()));
test('damage changes shared ledger pixels, never room pixels',()=>{
 let w=G.start();for(let t=0;t<300;t++)w=G.tick(w);w=G.quiet(w);const flashed=G.flashed(w);
 for(const p of [1,2,4,5])assert.deepEqual(G.room(flashed,p),G.room(w,p));
 assert.notDeepEqual(G.ledger(flashed),G.ledger(w));
 assert.ok(list(G.ledger(flashed)).some(r=>r.color===15758447&&r.y>=706));
});
test('each visible result fragment retains its original check number',()=>{
 let w=G.start(),found=false;
 for(let t=0;t<1000&&!found;t++){w=G.tick(w);for(const g of list(G.groups(w))){const fs=list(g.fragments);if(fs.length!==4)continue;found=true;const pixels=list(G.fragments(g,w));for(const f of fs){const glyph=list(G.text(String(f.rule+1),f.x-2,f.y-12,15124059));assert.ok(glyph.every(r=>pixels.some(p=>same(p,r))),'actual fragment paints its own indexed check glyph');}}}
 assert.ok(found,'actual Host produces four visible outcomes');
});

for(const [name,start,count] of [['individual',()=>G.start(),4],['Finish',()=>G.finish_start(),8]])test(`${name} packet shows exact finding count and one stacked carrier`,()=>{
 let w=start(),found=false;for(let t=0;t<1200&&!found;t++){w=G.tick(w);const carriers=list(G.groups(w)).filter(g=>g.carrier&&G.packet_count(g,w)>0);if(!carriers.length)continue;found=true;const g=carriers[0];assert.equal(G.packet_count(g,w),count);const pixels=list(G.packet_scene(g,w));const a=list(G.actors(w)).find(a=>a.key.operation===g.owner.operation);const label=list(G.text(`PACKET X${count}`,a.x-12,a.y-30,65483));assert.ok(label.every(r=>pixels.some(p=>same(p,r))),'exact count is visibly drawn');const scene=list(G.scene(w));assert.ok(label.every(r=>scene.some(p=>same(p,r))),'actual composed scene includes packet count');assert.equal(pixels.filter(r=>r.w===14&&r.h===2&&r.color===65483).length,2,'stack outlines decorate the one carrier');if(name==='Finish')assert.equal(carriers.length,1);}
 assert.ok(found,'actual Host produces an authorized assembled packet');
});

test('global health changes the HUD but not any room or its resource counters',()=>{
 const w=G.start(),hurt=G.health(w,30);
 for(const p of [1,2,4,5])assert.deepEqual(G.room(w,p),G.room(hurt,p));
 assert.notDeepEqual(G.scene(w),G.scene(hurt));
});
const repository=resolve(new URL('../../',import.meta.url).pathname);
async function mutated(name,change){
 const target=join(dir,name),seen=new Set();
 function copy(file){if(seen.has(file))return;seen.add(file);let source=readFileSync(join(repository,file),'utf8');
  for(const m of source.matchAll(/^import (\.[^\s]+\.bend)(?: as \w+)?$/gm))copy(relative(repository,resolve(repository,dirname(file),m[1])));
  if(file==='prototypes/canonical-defense/DefenseRender.bend')source=change(source);
  const out=join(target,file);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,source);
 }
 const entry='prototypes/canonical-defense/DefenseRenderClarityTests.bend';copy(entry);
 const result=spawnSync('bend',[join(target,entry),'-o',join(target,'mutant.mjs')],{encoding:'utf8',timeout:55000});
 assert.ifError(result.error);assert.equal(result.status,0,result.stdout+result.stderr);
 return (await import(pathToFileURL(join(target,'mutant.mjs')))).default;
}
test('compiled actual-render mutants restore the old flash and event-arc defects',async()=>{
 const mutant=await mutated('old-display',(source)=>{
  const flash='point, x, y, History.phase_color(phase), rest';
  source=replaceTokens(source,flash,'point, x, y, Bool.pick(U32,(M.damage_flash(world) > 0 : U32),15758447,History.phase_color(phase)), rest');
  const start=source.indexOf('def cue_draw('),end=source.indexOf('def cue_visible(',start);const body=source.slice(start,end);
  return source.slice(0,start)+replaceTokens(body,'color, rest','color, ring(24n,M.cue_x(cue),M.cue_y(cue),12,color,rest)')+source.slice(end);
 });
 const w=mutant.start();assert.throws(()=>assert.deepEqual(mutant.room(w,1),mutant.room(mutant.flashed(w),1)),{name:'AssertionError'});
 assert.throws(()=>assert.deepEqual(mutant.cue(),mutant.cue_text()),{name:'AssertionError'});
});

test('historical preparation refusal is labelled PREP FULL on the real gray actor',()=>{
 const pixels=list(G.earlier_refusal());
 const glyphs=list(G.text('PREP FULL',209,200,10066329));
 assert.ok(glyphs.length>0);
 assert.ok(glyphs.every(r=>pixels.some(p=>same(p,r))),'actual history_actor paints the full historical label in gray');
 assert.ok(pixels.some(r=>r.color===10066329&&r.y<200),'historical identity/body also uses gray');
});
