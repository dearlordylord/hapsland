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
 const emitted=join(temporary,'model.mjs');execFileSync('bend',[join(owner,'NUMERIC_SPEC_MEMBERSHIP_CANARY.bend'),'-o',emitted],{timeout:5000})
 const c=(await import(pathToFileURL(emitted))).default,rows=JSON.parse(readFileSync(join(owner,'membership-canary-schema.json'),'utf8')),counts=Object.fromEntries(rows.map(row=>[row.name,0]));let checks=0
 for(let trial=0;trial<128;trial++){
  const fuel=BigInt(trial%6),expected=tag(['AnyKind','TypeKind','FunctionKind'][trial%3]),symbol=tag('Label',{key:1,type_key:trial%4?2:1,function_key:trial%5?3:1})
  const refs=Array.from({length:trial%7},(_,i)=>tag('Reference',{kind:tag(i%4?'Named':'Unsupported'),name:tag('Label',{key:1+i%3,type_key:2,function_key:3}),expected:tag(['AnyKind','TypeKind','FunctionKind'][i%3]),target:i%3?none():some(1)}))
  const declaration=tag('Declaration',{handle:1,identity:1,function:!!(trial%2),bundled:!!(trial%3),references:list(refs)}),binding=tag('ImportBinding',{path:4,name:5,type_only:!!(trial%2),composite:6})
  const facts=tag('Facts',{kind_aware:!!(trial%2),declarations:dict([[1,some(declaration)],[1,none()],[2,some(declaration)],[3,none()]]),imports:dict([[1,some(binding)],[2,none()]]),supporting:dict([[1,some(declaration)],[1,none()]])})
  const visited=dict([[0,false],[1,true],[0,true]]),budget=tag('Budget',{limits:tag('LocalLimits',{work:trial%3?1000:0,depth:trial%3?1000:0,targets:trial%3?1000:0}),targets_by_path:dict([[7,dict([[1,true]])],[7,nil()],[9,nil()]]),max_targets:trial%8,work:trial%9,graph_work:trial%4,max_depth:trial%5})
  const state=spec('State',{visited,budget,next_address:3,pending_rev:list([])}),request=trial%2?spec('Request',{facts,path:7,name:symbol,expected,depth:trial%4,state}):spec('ReferencesRequest',{items:list(refs),facts,path:7,owner:0,index:2,depth:trial%4,state})
  const result=c['NUMERIC_SPEC.interpret'](fuel,request),treeReference=spec('TreeReference',{symbol:0,outcome:spec('Omitted',{reason:tag('Unresolved'),target:0})}),pending=tag('Pending',{owner:0,index:2,from:7,symbol:1,name:5,depth:1,expected,target:tag('Imported',{path:4,name:5})})
  const fields={fuel,query:0,state,budget,path:7,identity:trial%2?1:24,depth:trial%4,item:pending,already_seen:!!(trial%2),symbol,name:symbol,reason:tag('Unresolved'),owner:0,index:2,expected,type_only:!!(trial%2),permit:!!(trial%2),handle:1,valid:!!(trial%2),declaration,facts,tail:list(refs),items:list(refs),request,kind:tag(trial%2?'Named':'Unsupported'),target_id:trial%2?none():some(1),artifact:1}
  for(const row of rows){
   const current={...fields}
   for(const [name,type] of row.params){
    if(name==='found'||name==='imported'||name==='local')current[name]=type.includes('Maybe')?(trial%2?none():some(type.includes('ImportBinding')?binding:declaration)):binding
    if(name==='result')current[name]=type==='Spec.Build'?c['NUMERIC_SPEC.as_build'](result):type==='Spec.ReferencesResult'?c['NUMERIC_SPEC.as_references'](result):type==='Spec.ReferenceResult'?(trial%2?spec('ReferenceFailure',{state}):spec('ReferenceResult',{state,reference:treeReference})):result
    if(name==='reference')current[name]=type==='Spec.TreeReference'?treeReference:refs[0]??tag('Reference',{kind:tag('Named'),name:symbol,expected,target:none()})
    assert.ok(Object.hasOwn(current,name),'missing transport input '+row.name+'.'+name)
   }
   const actual=c[row.name](...row.params.map(([name])=>current[name]));let expectedValue
   if(row.type==='Bool')expectedValue=true
   else if(row.type==='Own.Dictionary<Bool>')expectedValue=c['NUMERIC_SPEC_RANK.visited'](state)
   else {
    const input=row.name==='insufficient_state_exact'?current.request:current.result
    expectedValue=c['NUMERIC_SPEC_RANK.'+({expanded_result_state_exact:'build_state',prepend_state_exact:'references_state',tree_result_state_exact:'references_state',insufficient_state_exact:'request_state'}[row.name]??'result_state')](input)
   }
   assert.deepEqual(plain(actual),plain(expectedValue),row.name+' trial '+trial);counts[row.name]++;checks++
  }
 }
 assert.equal(Object.keys(counts).length,39);assert.ok(Object.values(counts).every(n=>n===128))
 const sha=name=>createHash('sha256').update(readFileSync(join(owner,name))).digest('hex')
 const record={passed:true,fixtures:128,transportLaws:39,checks,counts,sourceHashes:Object.fromEntries(['NUMERIC_SPEC_MEMBERSHIP.bend','NUMERIC_SPEC_MEMBERSHIP_LAWS.bend','NUMERIC_SPEC_MEMBERSHIP_CANARY.bend','NUMERIC_SPEC.bend'].map(name=>[name,sha(name)])),scope:'finite emitted actual state, result and complete reference dispatch transports underlying whole interpreter membership induction; raw duplicate dictionaries/bad caches/false Bool values/aliased labels, partial child/sibling interpreter failures; actual smaller-fuel callbacks, no universal discharge of higher-order contracts, completion, flatten, full simulation or adoption'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-spec-membership-falsification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
