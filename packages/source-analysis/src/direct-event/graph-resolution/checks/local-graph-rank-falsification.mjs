import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const temporary=mkdtempSync(join(tmpdir(),'hapsland-rank-'))
try {
 const emitted=join(temporary,'rank.mjs')
 execFileSync('bend',[resolve(import.meta.dirname,'local-graph-representation-prototypes/list-state/RANK.bend'),'-o',emitted],{timeout:5000})
 const c=(await import(pathToFileURL(emitted))).default
 const tag=(name,fields={})=>({$:'core.'+name,...fields}),nil=()=>({$:'Own.DNil'}),none=()=>({$:'None'}),some=value=>({$:'Some',value})
 const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
 const dict=xs=>xs.reduceRight((rest,[key,value])=>({$:'Own.DCon',key,value,rest,count:99}),nil())
 let seed=7129103;const draw=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n}
 const label=key=>tag('Label',{key,type_key:key+26,function_key:key+52})
 const expected=()=>tag(['AnyKind','TypeKind','FunctionKind'][draw(3)])
 const reference=()=>tag('Reference',{kind:tag(draw(5)?'Named':'Unsupported'),name:label(draw(26)),expected:expected(),target:draw(5)?none():some(draw(13))})
 let steps=0,selectedRoots=0,selectedChildren=0,plans=0,monotonic=0,maxRank=0,visitBounds=0,expansionBounds=0
 for(let trial=0;trial<384;trial++) {
  const catalog=dict(Array.from({length:draw(18)},(_,i)=>[draw(78),draw(7)?some(tag('Declaration',{handle:i,identity:draw(13),function:!!draw(2),bundled:!!draw(2),references:list(Array.from({length:draw(7)},reference))})):none()]))
  const visited=dict(Array.from({length:draw(9)},()=>[draw(13),!!draw(2)]))
  const facts=tag('Facts',{kind_aware:!!draw(2),declarations:catalog,imports:nil(),supporting:catalog})
  const budget=tag('Budget',{limits:tag('LocalLimits',{work:10000,depth:10000,targets:10000}),targets_by_path:nil(),max_targets:0,work:draw(4),graph_work:draw(4),max_depth:draw(4)})
  for(let identity=0;identity<13;identity++) {
   const added=c['Own.set'](visited,identity,true)
   assert.ok(c.unseen_catalog(added,catalog)<=c.unseen_catalog(visited,catalog));monotonic++
  }
  for(let key=0;key<78;key++) {
   const selected=c['Own.lookup'](none(),catalog,key)
   if(selected.$!=='Some')continue
   const declaration=selected.value,identity=declaration.identity,weight=c['core.declaration_reference_count'](selected)
   const added=c['Own.set'](visited,identity,true)
   assert.equal(c.unseen_declaration(added,selected),0n)
   assert.ok(c.unseen_catalog(added,catalog)+weight<=c['core.trie_reference_count'](catalog));selectedRoots++
   if(!c['core.has_identity'](visited,identity)){assert.equal(c.unseen_declaration(visited,selected),weight);assert.ok(c.unseen_catalog(added,catalog)+weight<=c.unseen_catalog(visited,catalog));selectedChildren++}
   const entered=c['core.enter_node'](c.initial(facts,7,visited,budget),declaration,draw(6))
   assert.ok(c.rank(entered)+1n<=c['core.traversal_bound'](facts))
  }
  let machine=tag('Machine',{facts,path:7,frames:list(Array.from({length:draw(5)},(_,i)=>tag('Frame',{owner:i,depth:draw(6),index:draw(9),remaining:list(Array.from({length:draw(7)},reference))}))),visited,budget,next_node:draw(8),nodes_rev:list([]),references_rev:list([]),pending_rev:list([])})
  const initialRank=c.rank(machine);maxRank=Math.max(maxRank,Number(initialRank))
  for(let probe=0;probe<16;probe++){const visitedReference=c['core.visit_reference'](machine,draw(9),draw(9),draw(6),reference());assert.ok(c.rank(visitedReference)<=initialRank+1n);visitBounds++}
  for(let key=0;key<78;key++){const selected=c['Own.lookup'](none(),catalog,key);if(selected.$!=='Some'||c['core.has_identity'](visited,selected.value.identity))continue;const expanded=c['core.expand_node'](machine,selected.value,draw(9),draw(9),label(draw(26)),draw(6));assert.ok(c.rank(expanded)<=initialRank+1n);expansionBounds++}
  assert.equal(c.successful(c['core.run'](initialRank,machine)),true)
  while(!c['core.done'](machine)) {
   const before=c.rank(machine),after=c['core.step'](machine)
   assert.ok(c.rank(after)+1n<=before,`rank failed trial ${trial}`)
   machine=after;steps++;assert.ok(steps<100000)
  }
  assert.equal(c.successful(c['core.plan'](facts,7,label(draw(26)),expected(),visited,budget,draw(6))),true);plans++
 }
 assert.ok(steps>1000&&selectedChildren>1000&&selectedRoots>1000)
 const record={passed:true,machines:384,steps,selectedRoots,selectedChildren,monotonic,plans,maxRank,visitBounds,expansionBounds,scope:'finite falsification of approved whole-machine termination and visit/expansion bounds for cached-list representation: structural raw duplicate catalog/visited keys, bad counts, None entries, arbitrary frames, selected/prior visited roots; emitted actual core.step/run/plan; no universal proof, String bridge, output simulation or production qualification'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-rank-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
} finally {rmSync(temporary,{recursive:true,force:true})}
