import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const temporary=mkdtempSync(join(tmpdir(),'hapsland-rank-'))
try {
 const emitted=join(temporary,'rank.mjs')
 execFileSync('bend',[resolve(import.meta.dirname,'../representations/list-state/RANK.bend'),'-o',emitted],{timeout:5000})
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
  const before=c.rank(machine),key=draw(78),local=c['Own.lookup'](none(),catalog,key)
  if(local.$==='Some'){
   assert.ok(c.rank(c['core.local_expand_if'](c['core.has_identity'](visited,local.value.identity),machine,local.value,draw(27),draw(27),label(draw(26)),draw(27)))<=before+1n);checks++
  }
  if(local.$==='Some'){
   assert.ok(c.rank(c['core.local_expand'](machine,local.value,draw(27),draw(27),label(draw(26)),draw(27)))<=before+1n);checks++
  }
   assert.ok(c.rank(c['core.materialize_allowed'](local,draw(2)?none():some(binding),machine,draw(27),draw(27),label(draw(26)),draw(27),expected()))<=before+1n);checks++
   assert.ok(c.rank(c['core.ordinary_budget'](!!draw(2),local,draw(2)?none():some(binding),machine,draw(27),draw(27),label(draw(26)),draw(27),expected()))<=before+1n);checks++
   assert.ok(c.rank(c['core.ordinary_charged'](machine,local,draw(2)?none():some(binding),draw(27),draw(27),label(draw(26)),draw(27),expected()))<=before+1n);checks++
   assert.ok(c.rank(c['core.ordinary_ambiguity'](!!draw(2),local,draw(2)?none():some(binding),machine,draw(27),draw(27),label(draw(26)),draw(27),expected()))<=before+1n);checks++
   assert.ok(c.rank(c['core.ordinary_targets'](machine,local,draw(2)?none():some(binding),draw(27),draw(27),label(draw(26)),draw(27),expected()))<=before+1n);checks++
   assert.ok(c.rank(c['core.ordinary_reference'](machine,draw(27),draw(27),label(draw(26)),draw(27),expected()))<=before+1n);checks++
   assert.ok(c.rank(c['core.named_reference'](draw(2)?none():some(draw(13)),machine,draw(27),draw(27),label(draw(26)),draw(27),expected()))<=before+1n);checks++
   assert.ok(c.rank(c['core.reference_kind'](tag(draw(2)?'Named':'Unsupported'),draw(2)?none():some(draw(13)),machine,draw(27),draw(27),label(draw(26)),draw(27),expected()))<=before+1n);checks++
 }
 const record={passed:true,machines:384,checks,operations:10,scope:'finite actual production local/ordinary/named/reference-kind growth checks with exact raw lookup and actual seen guard; no universal proof or full graph equivalence'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-growth-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
} finally {rmSync(temporary,{recursive:true,force:true})}
