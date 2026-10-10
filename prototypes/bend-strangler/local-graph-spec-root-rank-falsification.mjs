import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const owner=resolve(import.meta.dirname,'local-graph-representation-prototypes/list-state'),temporary=mkdtempSync(join(tmpdir(),'hapsland-spec-membership-'))
const list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const nil=()=>({$:'Own.DNil'}),none=()=>({$:'None'}),some=value=>({$:'Some',value}),tag=(name,fields={})=>({$:'core.'+name,...fields}),spec=(name,fields={})=>({$:'NUMERIC_SPEC.'+name,...fields})
const dict=xs=>xs.reduceRight((rest,[key,value],i)=>({$:'Own.DCon',key,value,rest,count:i%2?0:99}),nil())
const plain=x=>typeof x==='number'?BigInt(x):x===null||typeof x!=='object'?x:Array.isArray(x)?x.map(plain):Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='$'?v.slice(v.lastIndexOf('.')+1):plain(v)]))
try{
 const emitted=join(temporary,'model.mjs');execFileSync('bend',[join(owner,'NUMERIC_SPEC_ROOT_RANK_CANARY.bend'),'-o',emitted],{timeout:5000})
 const c=(await import(pathToFileURL(emitted))).default;let checks=0
 for(let trial=0;trial<128;trial++){
  const fuel=BigInt(trial%6),expected=tag(['AnyKind','TypeKind','FunctionKind'][trial%3]),symbol=tag('Label',{key:1,type_key:trial%4?2:1,function_key:trial%5?3:1})
  const refs=Array.from({length:trial%7},(_,i)=>tag('Reference',{kind:tag(i%4?'Named':'Unsupported'),name:tag('Label',{key:1+i%3,type_key:2,function_key:3}),expected:tag(['AnyKind','TypeKind','FunctionKind'][i%3]),target:i%3?none():some(1)}))
  const declaration=tag('Declaration',{handle:1,identity:1,function:!!(trial%2),bundled:!!(trial%3),references:list(refs)}),binding=tag('ImportBinding',{path:4,name:5,type_only:!!(trial%2),composite:6})
  const facts=tag('Facts',{kind_aware:!!(trial%2),declarations:dict([[1,some(declaration)],[1,none()],[2,some(declaration)],[3,none()]]),imports:dict([[1,some(binding)],[2,none()]]),supporting:dict([[1,some(declaration)],[1,none()]])})
  const visited=dict([[0,false],[1,true],[0,true]]),budget=tag('Budget',{limits:tag('LocalLimits',{work:trial%3?1000:0,depth:trial%3?1000:0,targets:trial%3?1000:0}),targets_by_path:dict([[7,dict([[1,true]])],[7,nil()],[9,nil()]]),max_targets:trial%8,work:trial%9,graph_work:trial%4,max_depth:trial%5})
  const state=spec('State',{visited,budget,next_address:3,pending_rev:list([])}),request=trial%2?spec('Request',{facts,path:7,name:symbol,expected,depth:trial%4,state}):spec('ReferencesRequest',{items:list(refs),facts,path:7,owner:0,index:2,depth:trial%4,state})
  const result=c['NUMERIC_SPEC.interpret'](fuel,request),treeReference=spec('TreeReference',{symbol:0,outcome:spec('Omitted',{reason:tag('Unresolved'),target:0})}),pending=tag('Pending',{owner:0,index:2,from:7,symbol:1,name:5,depth:1,expected,target:tag('Imported',{path:4,name:5})})
  const fields={fuel,query:0,state,budget,path:7,identity:trial%2?1:24,depth:trial%4,item:pending,already_seen:!!(trial%2),symbol,name:symbol,reason:tag('Unresolved'),owner:0,index:2,expected,type_only:!!(trial%2),permit:!!(trial%2),handle:1,valid:!!(trial%2),declaration,facts,tail:list(refs),items:list(refs),request,kind:tag(trial%2?'Named':'Unsupported'),target_id:trial%2?none():some(1),artifact:1}
  for(const seen of [false,true]){assert.equal(c.seen_weight_partition(seen,list(refs)),true);checks++}
  for(const currentVisited of [nil(),visited,dict([[1,false],[1,true]])]){
   for(const head of [none(),some(declaration)]){assert.equal(c.declaration_inventory_partition(currentVisited,head),true);checks++;assert.equal(c['TREE_MACHINE_RELATION.count_declaration'](head),c['core.declaration_reference_count'](head));checks++}
   for(const catalog of [nil(),facts.declarations,dict([[90,some(declaration)],[90,some(declaration)],[1,none()]])])for(const key of [1n,2n,90n,99n]){
    assert.equal(c.lookup_inventory_bound(catalog,currentVisited,key),true);checks++;assert.equal(c.tree_catalog_count(catalog),c.raw_catalog_count(catalog));checks++
    for(const head of [none(),some(declaration)])for(const found of [false,true]){assert.equal(c.lookup_inventory_step(currentVisited,head,catalog,key,found),true);checks++;const name=found?key:100n;assert.deepEqual(plain(c.cons_lookup_source(head,catalog,name,999n,key)),plain(c.cons_lookup_projected(found,head,catalog,key)));checks++}
   }
   assert.equal(c.initial_rank_within_original_bound(facts,symbol,expected,currentVisited),true);checks++
  }

 }
 assert.equal(checks,48256)
 const sha=name=>createHash('sha256').update(readFileSync(join(owner,name))).digest('hex')
 const record={passed:true,fixtures:128,supportLaws:8,mainLaws:1,checks,sourceHashes:Object.fromEntries(['NUMERIC_SPEC_ROOT_RANK_LAWS.bend','NUMERIC_SPEC_ROOT_PARTITION_LAWS.bend','NUMERIC_SPEC_ROOT_LOOKUP_LAWS.bend','NUMERIC_SPEC_COUNT_LAWS.bend','NUMERIC_SPEC_ROOT_RANK.bend','NUMERIC_SPEC_ROOT_RANK_CANARY.bend','NUMERIC_SPEC.bend'].map(name=>[name,sha(name)])),scope:'finite root reentry and original3R+3bound over raw duplicate catalogs/bad caches/priorvisitedroots/false visited values; lookup-step suffix premises checked by preceding bound; no full recursive completion or simulation claim'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-spec-root-rank-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
