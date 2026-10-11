import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const temporary=mkdtempSync(join(tmpdir(),'hapsland-rank-'))
try {
 const emitted=join(temporary,'rank.mjs')
 execFileSync('bend',[resolve(import.meta.dirname,'../representations/list-state/RANK_MACHINE.bend'),'-o',emitted],{timeout:5000})
 const c=(await import(pathToFileURL(emitted))).default
 const tag=(name,fields={})=>({$:'core.'+name,...fields}),nil=()=>({$:'Own.DNil'}),none=()=>({$:'None'}),some=value=>({$:'Some',value})
 const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
 const dict=xs=>xs.reduceRight((rest,[key,value])=>({$:'Own.DCon',key,value,rest,count:99}),nil())
 let seed=7129103;const draw=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n}
 const label=key=>tag('Label',{key,type_key:key+26,function_key:key+52})
 const expected=()=>tag(['AnyKind','TypeKind','FunctionKind'][draw(3)])
 const reference=()=>tag('Reference',{kind:tag(draw(5)?'Named':'Unsupported'),name:label(draw(26)),expected:expected(),target:draw(5)?none():some(draw(13))})
 let checks=0
 for(let trial=0;trial<384;trial++) {
  const catalog=dict(Array.from({length:draw(18)},(_,i)=>[draw(78),draw(7)?some(tag('Declaration',{handle:i,identity:draw(13),function:!!draw(2),bundled:!!draw(2),references:list(Array.from({length:draw(7)},reference))})):none()]))
  const visited=dict(Array.from({length:draw(9)},()=>[draw(13),!!draw(2)]))
  const facts=tag('Facts',{kind_aware:!!draw(2),declarations:catalog,imports:nil(),supporting:catalog})
  const budget=tag('Budget',{limits:tag('LocalLimits',{work:10000,depth:10000,targets:10000}),targets_by_path:nil(),max_targets:0,work:draw(4),graph_work:draw(4),max_depth:draw(4)})
  let machine=tag('Machine',{facts,path:7,frames:list(Array.from({length:draw(5)},(_,i)=>tag('Frame',{owner:i,depth:draw(6),index:draw(9),remaining:list(Array.from({length:draw(7)},reference))}))),visited,budget,next_node:draw(8),nodes_rev:list([]),references_rev:list([]),pending_rev:list([])})
  const declaration=tag('Declaration',{handle:draw(19),identity:draw(13),function:!!draw(2),bundled:!!draw(2),references:list(Array.from({length:draw(7)},reference))})
  const binding=tag('ImportBinding',{path:draw(9),name:draw(26),type_only:!!draw(2),composite:draw(27)})
  const before=c.projection(machine)
   assert.deepEqual(c.projection(c['core.observe_machine_depth'](machine,draw(27))),before);checks++
   assert.deepEqual(c.projection(c['core.charge_machine_work'](machine)),before);checks++
   assert.deepEqual(c.projection(c['core.charge_machine_target'](machine,draw(27))),before);checks++
   assert.deepEqual(c.projection(c['core.omit'](machine,draw(27),draw(27),label(draw(26)),tag(['Unresolved','UnsupportedTarget','ReferenceLimit','Unavailable'][draw(4)]))),before);checks++
   assert.deepEqual(c.projection(c['core.include'](machine,draw(27),draw(27),label(draw(26)),draw(27))),before);checks++
   assert.deepEqual(c.projection(c['core.queue_import'](machine,draw(27),draw(27),label(draw(26)),draw(27),expected(),binding)),before);checks++
   assert.deepEqual(c.projection(c['core.import_by_kind'](expected(),!!draw(2),machine,draw(27),draw(27),label(draw(26)),draw(27),binding)),before);checks++
   assert.deepEqual(c.projection(c['core.import_present'](machine,draw(27),draw(27),label(draw(26)),draw(27),expected(),draw(2)?none():some(binding))),before);checks++
   assert.deepEqual(c.projection(c['core.charge_if_local'](draw(2)?none():some(declaration),machine)),before);checks++
   assert.deepEqual(c.projection(c['core.bundled_queue'](machine,draw(27),draw(27),label(draw(26)),draw(27),expected(),declaration)),before);checks++
   assert.deepEqual(c.projection(c['core.bundled_materialize'](!!draw(2),machine,declaration,draw(27),draw(27),label(draw(26)),draw(27),expected())),before);checks++
   assert.deepEqual(c.projection(c['core.bundled_budget'](!!draw(2),!!draw(2),machine,declaration,draw(27),draw(27),label(draw(26)),draw(27),expected())),before);checks++
   assert.deepEqual(c.projection(c['core.charge_if_visited'](!!draw(2),machine)),before);checks++
   assert.deepEqual(c.projection(c['core.bundled_charged'](machine,!!draw(2),declaration,draw(27),draw(27),label(draw(26)),draw(27),expected())),before);checks++
   assert.deepEqual(c.projection(c['core.bundled_seen'](!!draw(2),machine,declaration,draw(27),draw(27),label(draw(26)),draw(27),expected())),before);checks++
   assert.deepEqual(c.projection(c['core.bundled_target'](machine,declaration,draw(27),draw(27),label(draw(26)),draw(27),expected())),before);checks++
   assert.deepEqual(c.projection(c['core.bundled_admit'](!!draw(2),machine,declaration,draw(27),draw(27),label(draw(26)),draw(27),expected())),before);checks++
   assert.deepEqual(c.projection(c['core.bundled_lookup'](draw(2)?none():some(declaration),machine,draw(27),draw(27),label(draw(26)),draw(27),expected(),draw(27))),before);checks++
 }
 const record={passed:true,machines:384,checks,operations:18,scope:'finite actual-core projection preservation checks on raw duplicate catalogs, malformed cache counts and arbitrary frames; no universal or whole-graph equivalence claim'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-dispatch-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
} finally {rmSync(temporary,{recursive:true,force:true})}
